// The window's media queries, followed live: a page that reads the answer now and subscribes
// later (a Solid owner reads it as it is made and follows it once settled) must not miss a change
// that came in between. The stream starts with the answer it subscribed to, then each change.

import { expect, it } from 'effect-bun-test';
import { Duration, Effect, Option, Stream } from 'effect';
import { Viewport } from './viewport.ts';
import { viewportLayer } from './viewport-browser.ts';

/** A window whose answer to every query is `matches`, changed (and told) by `set`. */
const fakeWindow = (matches: boolean) => {
  const list = Object.assign(new EventTarget(), { matches, media: '' });
  const set = (to: boolean) => {
    list.matches = to;
    list.dispatchEvent(new Event('change'));
  };
  return { list, set };
};

/** Runs `effect` with `matchMedia` answered by `list`, the window's own put back after. */
const withWindow = <A, E, R>(list: EventTarget, effect: Effect.Effect<A, E, R>) =>
  Effect.acquireUseRelease(
    Effect.sync(() => {
      const had = Reflect.get(globalThis, 'matchMedia');
      Reflect.set(globalThis, 'matchMedia', () => list);
      return had;
    }),
    () => effect,
    (had) =>
      Effect.sync(() =>
        Option.match(Option.fromNullishOr(had), {
          onNone: () => Reflect.deleteProperty(globalThis, 'matchMedia'),
          onSome: (own) => Reflect.set(globalThis, 'matchMedia', own),
        }),
      ),
  );

it.live(
  'a window that crossed the breakpoint before the page followed it: the follow starts at the crossing',
  () =>
    Effect.gen(function* () {
      const { list, set } = fakeWindow(false);
      const answers = yield* withWindow(
        list,
        Effect.gen(function* () {
          const viewport = yield* Viewport;
          const read = yield* viewport.matches('(max-width: 899px)');
          // The window turns before the page subscribes, with no change to come after.
          set(true);
          const first = yield* viewport
            .changes('(max-width: 899px)')
            .pipe(Stream.take(1), Stream.runCollect, Effect.timeoutOption(Duration.millis(200)));
          return { read, first: Option.getOrNull(first) };
        }),
      );
      // Null: the stream said nothing, waiting on a change that will not come.
      expect(answers).toEqual({ read: false, first: [true] });
    }).pipe(Effect.provide(viewportLayer)),
);

it.live('follows each change after the answer it started with', () =>
  Effect.gen(function* () {
    const { list, set } = fakeWindow(true);
    const seen = yield* withWindow(
      list,
      Effect.gen(function* () {
        const viewport = yield* Viewport;
        // The window turns twice once the follow has said its first answer (it listens by then).
        let said = 0;
        const turnsOnce = Effect.sync(() => {
          said += 1;
          if (said === 1) {
            set(false);
            set(true);
          }
        });
        const seen = yield* viewport.changes('(max-width: 899px)').pipe(
          Stream.tap(() => turnsOnce),
          Stream.take(3),
          Stream.runCollect,
          Effect.timeoutOption(Duration.millis(200)),
        );
        return Option.getOrNull(seen);
      }),
    );
    expect(seen).toEqual([true, false, true]);
  }).pipe(Effect.provide(viewportLayer)),
);
