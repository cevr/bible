/**
 * Writes to the URL, batched into history entries.
 *
 * `UrlState` holds the URL as the program's writes leave it: the committed
 * entry, or the href a write made in this tick and has not flushed yet. Every
 * write reads that href, so two writes in one tick compose instead of the
 * second overwriting the first, and they flush together as one history entry:
 * a push if either asked for one, else a replace.
 *
 * "One tick" is one microtask turn. The flush runs on its own microtask
 * scheduler, because Effect's default scheduler waits for a timer in a
 * browser, and the write then lands after a test or a reader has looked.
 *
 * A batch whose every key is throttled (`Field.key(…, { throttle })`) waits
 * until its window since the last flush has passed, on `Clock`; a write of an
 * unthrottled key flushes the batch at the next tick; a window that grows
 * while the flush waits is waited out. An entry that lands from anywhere else
 * (Back, Forward, a push the program made around `UrlState`) drops writes that
 * have not flushed: the reader has moved, and the entry they land on is the
 * URL. A batch whose writes end where the entry already is writes nothing.
 *
 * The module functions read and write one place:
 *
 * - `get(place)`: the place's value, `None` off the place;
 * - `set(place, value)`: navigate to the value's href, with the move
 *   `Place.history` gives; no write when the href is the one already there;
 * - `update(place, f)`: `set` with `f` of the value as the URL holds it now;
 *   nothing off the place.
 */

import {
  Clock,
  Context,
  Duration,
  Effect,
  FiberHandle,
  Layer,
  Option,
  Order,
  Ref,
  Scheduler,
  Stream,
  SubscriptionRef,
} from 'effect';

import { Location, type Entry } from './location.js';
import * as Place from './place.js';

export interface UrlStateService {
  /** The href as the program's writes leave it, flushed or not. */
  readonly href: Effect.Effect<string>;
  /** `href`, then each change to it: a write as it is made, a traversal as
   *  it lands. */
  readonly changes: Stream.Stream<string>;
  /** Move to `href` as `move` says, in this tick's batch. */
  readonly navigate: (href: string, move: Place.Move) => Effect.Effect<void>;
}

export class UrlState extends Context.Service<UrlState, UrlStateService>()(
  '@bible/url-state/UrlState',
) {}

/** Writes waiting for the flush, folded into one move. */
interface Batch {
  readonly href: string;
  readonly move: Place.Move;
  /** The key of the entry the batch was written on: it flushes onto that
   *  entry or not at all. */
  readonly entry: string;
}

/** Two moves as one: push wins; throttled only when both are, by the longer. */
const fold = (earlier: Place.Move, later: Place.Move): Place.Move => ({
  history: Option.match(
    Option.liftPredicate(later.history, (history) => history === 'push'),
    { onSome: () => 'push', onNone: () => earlier.history },
  ),
  throttle: Option.zipWith(earlier.throttle, later.throttle, Order.max(Duration.Order)),
});

/** `UrlState` over the `Location` in context. */
export const layer: Layer.Layer<UrlState, never, Location> = Layer.effect(
  UrlState,
  Effect.gen(function* () {
    const location = yield* Location;
    const microtasks = new Scheduler.MixedScheduler('sync');
    const pending = yield* Ref.make(Option.none<Batch>());
    const view = yield* SubscriptionRef.make((yield* location.current).href);
    const flushing = yield* FiberHandle.make<void, never>();
    const lastFlush = yield* Ref.make(Option.none<number>());

    /** How long a batch still waits for its throttle window. */
    const waitFor = (batch: Batch) =>
      Effect.gen(function* () {
        const now = yield* Clock.currentTimeMillis;
        const last = yield* Ref.get(lastFlush);
        return Option.match(
          Option.zipWith(batch.move.throttle, last, (window, at) => ({ window, at })),
          {
            onNone: () => 0,
            onSome: ({ window, at }) => Math.max(0, at + Duration.toMillis(window) - now),
          },
        );
      });

    /** Sleep until the waiting batch's window has passed. The window is read
     *  again on waking: a write made during the sleep can lengthen it. */
    const due: Effect.Effect<void> = Effect.suspend(() =>
      Effect.gen(function* () {
        const waiting = yield* Ref.get(pending);
        if (Option.isNone(waiting)) return;
        const wait = yield* waitFor(waiting.value);
        if (wait <= 0) return;
        yield* Effect.sleep(Duration.millis(wait));
        yield* due;
      }),
    );

    /** Take the waiting batch and write it, once its window has passed. */
    const commit = Effect.gen(function* () {
      yield* due;
      const batch = yield* Ref.getAndSet(pending, Option.none());
      if (Option.isNone(batch)) return;
      const { href, move, entry } = batch.value;
      const current = yield* location.current;
      // Another entry landed after the batch was written (Back, Forward, a
      // push from outside): the batch belongs to an entry no longer on
      // screen, and the entry that is shows.
      if (current.key !== entry) {
        yield* Effect.logDebug(`url-state.flush.dropped href=${href}`);
        yield* SubscriptionRef.set(view, current.href);
        return;
      }
      // The batch's writes came back to where the entry is.
      if (href === current.href) return;
      yield* Effect.logDebug(`url-state.flush history=${move.history} href=${href}`);
      if (move.history === 'push') yield* location.push(href);
      else yield* location.replace(href);
      yield* Ref.set(lastFlush, Option.some(yield* Clock.currentTimeMillis));
    });

    /** Commit until nothing waits. A write made while a batch commits (an
     *  entry subscriber answering this flush's own push) finds this flush
     *  still running, so `navigate` schedules none for it: it is this
     *  flush's to commit, after its own window. */
    const drain: Effect.Effect<void> = Effect.suspend(() =>
      Effect.gen(function* () {
        yield* commit;
        if (Option.isSome(yield* Ref.get(pending))) yield* drain;
      }),
    );

    const flush = Effect.gen(function* () {
      // The tick: every write made in this turn joins the batch first.
      yield* Effect.yieldNow;
      yield* drain;
    }).pipe(Effect.provideService(Scheduler.Scheduler, microtasks));

    const navigate = Effect.fn('UrlState.navigate')(function* (href: string, move: Place.Move) {
      const { key } = yield* location.current;
      const batch = yield* Ref.updateAndGet(pending, (waiting) =>
        Option.some(
          Option.match(waiting, {
            onNone: (): Batch => ({ href, move, entry: key }),
            onSome: (earlier): Batch => ({ ...earlier, href, move: fold(earlier.move, move) }),
          }),
        ),
      );
      yield* SubscriptionRef.set(view, href);
      // A batch that need not wait replaces a flush that is waiting out a
      // throttle window; otherwise the flush already scheduled takes it.
      const throttled = Option.isSome(Option.flatMap(batch, (folded) => folded.move.throttle));
      yield* FiberHandle.run(flushing, flush, { onlyIfMissing: throttled });
    });

    /** Entries landing from `Location`. One that is not the entry a waiting
     *  batch was written on (Back, Forward, a push from outside) drops the
     *  batch; any entry shows when nothing is waiting. A flush's own write
     *  lands after it took the batch, so it never drops one. */
    const land = (entry: Entry) =>
      Effect.gen(function* () {
        const elsewhere = Option.exists(
          yield* Ref.get(pending),
          (batch) => batch.entry !== entry.key,
        );
        if (elsewhere) {
          yield* Effect.logDebug(`url-state.landed.dropped key=${entry.key}`);
          yield* FiberHandle.clear(flushing);
          yield* Ref.set(pending, Option.none());
        }
        if (Option.isNone(yield* Ref.get(pending))) yield* SubscriptionRef.set(view, entry.href);
      });
    yield* location.changes.pipe(
      Stream.runForEach(land),
      Effect.provideService(Scheduler.Scheduler, microtasks),
      Effect.forkScoped,
    );

    return UrlState.of({
      // Derived, not mirrored: the waiting batch, else the entry on screen,
      // so a read never lags an entry `Location` committed this instant.
      href: Effect.flatMap(Ref.get(pending), (waiting) =>
        Option.match(waiting, {
          onSome: (batch) => Effect.succeed(batch.href),
          onNone: () => Effect.map(location.current, (entry) => entry.href),
        }),
      ),
      changes: SubscriptionRef.changes(view),
      navigate,
    });
  }),
);

/** The place's value at the URL as it is now, `None` off the place. */
export const get = <A>(place: Place.Place<A>): Effect.Effect<Option.Option<A>, never, UrlState> =>
  UrlState.use((state) => Effect.flatMap(state.href, (href) => Place.decodeEffect(place, href)));

/** Navigate to the place's `value`, entering history as the move says. */
export const set = <A>(place: Place.Place<A>, value: A): Effect.Effect<void, never, UrlState> =>
  UrlState.use((state) =>
    Effect.gen(function* () {
      const from = yield* state.href;
      const to = Place.href(place, value);
      if (to === from) return;
      yield* state.navigate(to, Place.history(place, from, to));
    }),
  );

/** `set` the place to `f` of its value as the URL holds it now; nothing off the place. */
export const update = <A>(
  place: Place.Place<A>,
  f: (value: A) => A,
): Effect.Effect<void, never, UrlState> =>
  Effect.flatMap(get(place), (value) =>
    Option.match(value, { onNone: () => Effect.void, onSome: (current) => set(place, f(current)) }),
  );
