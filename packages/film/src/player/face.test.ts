// What waits for a film's picture faces (`pictureFacesWait`): nothing once
// every one asked for has loaded, or none was asked for, so a page whose
// faces are in draws at once; else each one still loading, failing when one
// will not load. The UI face (`swap`) is the chrome's, and nothing waits for it.

import { describe, expect, it } from 'effect-bun-test';
import { Deferred, Effect, Exit, Fiber, Option } from 'effect';
import { pictureFacesWait } from './face.ts';

/** A face in a page's fonts: how it is shown, and its load, which the test settles. */
const face = (display: FontDisplay, status: FontFaceLoadStatus, loaded = Promise.resolve()) => ({
  display,
  status,
  loaded,
});

/** A page's fonts holding `faces`. */
const fontsOf = (faces: ReadonlyArray<ReturnType<typeof face>>) => faces as unknown as FontFaceSet;

/** A load the test settles. */
const pending = () => {
  let settle = (_: boolean) => {};
  const loaded = new Promise<void>((resolve, reject) => {
    settle = (ok) => (ok ? resolve() : reject(new Error('the face will not load')));
  });
  return { loaded, settle };
};

describe('pictureFacesWait', () => {
  it.effect('waits for nothing when no picture face was asked for, or every one has loaded', () =>
    Effect.sync(() => {
      expect(Option.isNone(pictureFacesWait(fontsOf([])))).toBe(true);
      expect(
        Option.isNone(
          pictureFacesWait(fontsOf([face('block', 'loaded'), face('block', 'loaded')])),
        ),
      ).toBe(true);
    }),
  );

  it.effect("never waits for the UI face (the chrome's, swapped in)", () =>
    Effect.sync(() => {
      expect(Option.isNone(pictureFacesWait(fontsOf([face('swap', 'loading')])))).toBe(true);
    }),
  );

  it.live('waits for each picture face still loading, and is done once they have', () =>
    Effect.gen(function* () {
      const first = pending();
      const second = pending();
      const wait = pictureFacesWait(
        fontsOf([
          face('block', 'loaded'),
          face('block', 'loading', first.loaded),
          face('block', 'unloaded', second.loaded),
        ]),
      );
      const waiting = yield* Effect.forkChild(Option.getOrThrow(wait));
      const done = yield* Deferred.make<boolean>();
      yield* Effect.forkChild(Effect.andThen(Fiber.join(waiting), Deferred.succeed(done, true)));
      first.settle(true);
      yield* Effect.yieldNow;
      expect(yield* Deferred.isDone(done)).toBe(false);
      second.settle(true);
      expect(yield* Deferred.await(done)).toBe(true);
    }),
  );

  it.live('fails when a picture face will not load', () =>
    Effect.gen(function* () {
      const broken = pending();
      const wait = Option.getOrThrow(
        pictureFacesWait(fontsOf([face('block', 'loading', broken.loaded)])),
      );
      broken.settle(false);
      expect(Exit.isFailure(yield* Effect.exit(wait))).toBe(true);
    }),
  );
});
