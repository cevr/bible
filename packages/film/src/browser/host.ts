// The page's host: the browser APIs a page reaches (animation frames, the
// pointer, the keyboard, media elements, the address bar and a page load)
// as Effect services, built once at
// each page's root (`mountPlayer`, `mountLab`, `mountReview`) from
// `BrowserHost.layer` (`host-browser.ts`) and handed to everything on the
// page: the player's own code runs its effects with it, and the lab's and
// review's runtimes are given it as a layer, so a test builds the same pages
// over test layers instead of stubbing a global. Framework-free: the player,
// which the render page loads, imports it.

import { Location, UrlState } from '@bible/url-state';
import { Clock, Duration, Effect, Exit, Layer, Option, Schedule, Scope, Stream } from 'effect';
import type { Context } from 'effect';
import type { Frames } from './frames.ts';
import type { Keys } from './keys.ts';
import type { Media } from './media.ts';
import { PageLoad } from './page-load.ts';
import type { Pointer } from './pointer.ts';

/**
 * Every service the host gives a page: the address bar among them
 * (`Location`, written through `UrlState` so writes in one tick make one
 * history entry, `@bible/url-state`).
 */
export type BrowserServices =
  | Frames
  | Keys
  | Location
  | Media
  | PageLoad
  | Pointer
  | UrlState.UrlState;

/** The host's services, built: what a page's code runs its effects with. */
export type Host = Context.Context<BrowserServices>;

/**
 * The host `layer` builds (the page's, or a test's over its own layers), for
 * the life of the page: its scope is never closed, as the page is the host's
 * lifetime.
 */
export const hostOf = <S>(layer: Layer.Layer<S>): Context.Context<S> =>
  Effect.runSync(Effect.flatMap(Scope.make(), (scope) => Layer.buildWithScope(layer, scope)));

/** The host as a layer, for a runtime the page builds (the lab's, the studio's, the review's). */
export const hostLayer = (host: Host): Layer.Layer<BrowserServices> => Layer.succeedContext(host);

/** The address bar of a host, for a page's own code: what it reads, and its moves. */
interface AddressBar {
  /** The URL as the page's writes leave it (written or still to flush). */
  readonly href: () => string;
  /** Move to `href` as a new history entry (Back returns). */
  readonly push: (href: string) => void;
  /** Move this history entry to `href`. */
  readonly replace: (href: string) => void;
}

/** The address bar of `host`, through its `UrlState`: writes in one tick make one move. */
export const addressOn = (host: Context.Context<UrlState.UrlState>): AddressBar => {
  const move = (history: 'push' | 'replace') => (href: string) =>
    Effect.runSyncWith(host)(
      UrlState.UrlState.use((url) => url.navigate(href, { history, throttle: Option.none() })),
    );
  return {
    href: () => Effect.runSyncWith(host)(UrlState.UrlState.use((url) => url.href)),
    push: move('push'),
    replace: move('replace'),
  };
};

/**
 * Call `landed` with each entry Back or Forward lands on (a `traverse` from
 * `Location`), until the returned stop: what a page reads its time from
 * again, as it reads its pick from the URL. `UrlState` has already dropped
 * the writes the page had not flushed for the entry it left.
 */
export const onTraverse = (
  host: Context.Context<Location>,
  landed: (href: string) => void,
): (() => void) => {
  const fiber = Effect.runForkWith(host)(
    Location.use((bar) =>
      bar.changes.pipe(
        Stream.filter((entry) => entry.navigation === 'traverse'),
        Stream.runForEach((entry) => Effect.sync(() => landed(entry.href))),
      ),
    ),
  );
  return () => {
    fiber.interruptUnsafe();
  };
};

/** The longest a page waits for its writes to reach the address bar: 200 looks, 5 ms apart. */
const WRITTEN_LOOKS = 200;

/**
 * Done when every write the page has made is on the address bar (`UrlState`
 * flushes a tick's writes after the tick), or after a second: what a load of
 * the page anew waits for, as it loads whatever the bar holds.
 */
const addressWritten: Effect.Effect<void, never, UrlState.UrlState | Location> = Effect.gen(
  function* () {
    const url = yield* UrlState.UrlState;
    const bar = yield* Location;
    const written = Effect.zipWith(url.href, bar.current, (want, entry) => want === entry.href);
    yield* Effect.repeat(written, {
      until: (done) => done,
      schedule: Schedule.spaced(Duration.millis(5)),
      times: WRITTEN_LOOKS,
    });
  },
);

/**
 * Load the page again at the place its URL keeps: once the page's writes
 * are on the address bar (`addressWritten`), so a time held the moment
 * before (`holdT`) is the one the page opens on.
 */
export const reloadAtAddress: Effect.Effect<void, never, UrlState.UrlState | Location | PageLoad> =
  Effect.andThen(
    addressWritten,
    PageLoad.use((load) => load.reload),
  );

/** A scoped effect run: its value, and the close of its scope. */
interface Scoped<A> {
  readonly value: A;
  readonly close: () => void;
}

/**
 * Run a scoped `effect` on `host` now, in a scope of its own: its value, and
 * the scope's close (a component's cleanup) to release what it holds.
 */
export const runScoped =
  <S>(host: Context.Context<S>) =>
  <A>(effect: Effect.Effect<A, never, S | Scope.Scope>): Scoped<A> => {
    const scope = Scope.makeUnsafe();
    const value = Effect.runSyncWith(host)(Scope.provide(scope)(effect));
    return { value, close: () => Effect.runFork(Scope.close(scope, Exit.void)) };
  };

/**
 * A reader of the monotonic time of `host`'s `Clock`, in ms (the page's
 * `performance.now` live, a test's clock in a test): for a hot path, such as
 * the play loop, that reads it every frame.
 */
export const monotonicMs = <S>(host: Context.Context<S>): (() => number) => {
  const clock = Effect.runSyncWith(host)(Clock.clockWith(Effect.succeed));
  return () => Number(clock.monotonicTimeNanosUnsafe()) / 1e6;
};
