// Frames: a loop steps once a frame until its step says stop, and asks for no
// frame once interrupted, even from inside its own step; a coalesced paint
// runs once a frame however often it is asked for, and not after its scope
// closes; on a test's clock, a frame comes every 16 ms.

import { describe, expect, it } from 'effect-bun-test';
import { Effect, Exit, Fiber, Scope } from 'effect';
import { TestClock } from 'effect/testing';
import { manualFrames } from './fixtures/frames.ts';
import { Frames } from './frames.ts';
import { hostOf } from './host.ts';

/** Frames run by hand, on a host of their own. */
const manual = () => {
  const frames = manualFrames();
  return { ...frames, host: hostOf(frames.layer) };
};

describe('Frames', () => {
  it.effect('a loop steps once a frame, with its time, until its step says stop', () =>
    Effect.sync(() => {
      const frames = manual();
      const seen: Array<number> = [];
      const fiber = Effect.runForkWith(frames.host)(
        Frames.use((f) => f.loop((at) => seen.push(at) < 3)),
      );
      for (const at of [16, 32, 48, 64]) frames.frame(at);
      expect(seen).toEqual([16, 32, 48]);
      expect(frames.pending()).toBe(0);
      expect(fiber.pollUnsafe()).toEqual(Exit.void);
    }),
  );

  it.effect('interrupted, even from inside its own step, a loop asks for no frame', () =>
    Effect.sync(() => {
      const frames = manual();
      let steps = 0;
      const fiber = Effect.runForkWith(frames.host)(
        Frames.use((f) =>
          f.loop(() => {
            steps += 1;
            fiber.interruptUnsafe();
            return true;
          }),
        ),
      );
      frames.frame(16);
      frames.frame(32);
      expect(steps).toBe(1);
      expect(frames.pending()).toBe(0);
    }),
  );

  it.effect('a coalesced paint runs once a frame, and not once its scope has closed', () =>
    Effect.gen(function* () {
      const frames = manual();
      let paints = 0;
      const scope = yield* Scope.make();
      const ask = Effect.runSyncWith(frames.host)(
        Scope.provide(scope)(Frames.use((f) => f.coalesce(() => (paints += 1)))),
      );
      ask();
      ask();
      frames.frame(16);
      expect(paints).toBe(1);
      ask();
      yield* Scope.close(scope, Exit.void);
      frames.frame(32);
      expect(paints).toBe(1);
      expect(frames.pending()).toBe(0);
    }),
  );

  it.effect('on a test clock, a frame comes every 16 ms', () =>
    Effect.gen(function* () {
      const seen: Array<number> = [];
      const fiber = yield* Effect.forkChild(Frames.use((f) => f.loop((at) => seen.push(at) < 2)));
      yield* TestClock.adjust(15);
      expect(seen).toEqual([]);
      yield* TestClock.adjust(1);
      yield* TestClock.adjust(16);
      yield* Fiber.join(fiber);
      expect(seen).toEqual([16, 32]);
    }).pipe(Effect.provide(Frames.layerClock)),
  );
});
