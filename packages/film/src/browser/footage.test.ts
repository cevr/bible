// A surface's frames asked one after another (an `Ask` each of one `newestAsked`), each painted
// once its footage decodes (`paintedIfNewest`): decodes that land out of
// order paint only the newest frame, and only the newest frame's failure is
// said. The preview, the HEAD layer and the onion ask so.

import { describe, expect, it } from 'effect-bun-test';
import { Deferred, Effect, Exit, Fiber, Layer, Option } from 'effect';
import type { FootageRead } from '../canvas/film.ts';
import { newestAsked } from '../core/asked.ts';
import { Footage, FootageFrameMissing, paintedIfNewest } from './footage.ts';

/** A talk's frame `T` reads its take at `T`. */
const film = { footageAt: (T: number): ReadonlyArray<FootageRead> => [{ source: 'take', at: T }] };

/** A gate per second: done with whether that second's frame decodes. */
const gates = (seconds: ReadonlyArray<number>) =>
  new Map(seconds.map((t) => [t, Deferred.makeUnsafe<boolean>()] as const));

/** Footage whose frame at each second lands when its gate is done: decoded, or missing. */
const gatedFootage = (gated: ReadonlyMap<number, Deferred.Deferred<boolean>>) =>
  Layer.succeed(
    Footage,
    Footage.of({
      ready: (reads) =>
        Effect.gen(function* () {
          for (const read of reads) {
            const gate = Option.getOrThrow(Option.fromUndefinedOr(gated.get(read.at)));
            if (!(yield* Deferred.await(gate)))
              return yield* new FootageFrameMissing({
                source: read.source,
                at: read.at,
                why: 'gated',
              });
          }
          // The paint here draws nothing, so it is given no picture.
          return { frame: () => Option.getOrUndefined(Option.none<CanvasImageSource>()) };
        }),
      run: () => Effect.die('no runs here'),
    }),
  );

describe("a surface's newest frame", () => {
  it.effect(
    'paints only the newest ask when an older decode lands after it, and says only the newest failure',
    () => {
      const gated = gates([1, 2, 3, 4, 5]);
      const painted: Array<number> = [];
      const asks = newestAsked();
      const ask = (T: number) =>
        Effect.forkDetach(paintedIfNewest(film, T, () => painted.push(T), asks.ask()));
      const land = (T: number, decoded: boolean) =>
        Deferred.done(
          Option.getOrThrow(Option.fromUndefinedOr(gated.get(T))),
          Exit.succeed(decoded),
        );
      return Effect.gen(function* () {
        // Seek to 1, then to 2: 2 decodes first, 1 after; 1 paints nothing.
        const one = yield* ask(1);
        const two = yield* ask(2);
        yield* land(2, true);
        yield* Fiber.join(two);
        yield* land(1, true);
        yield* Fiber.join(one);
        expect(painted).toEqual([2]);
        // Seek to 3, then to 4: 4 paints, then 3 will not decode; nothing is said of 3.
        const three = yield* ask(3);
        const four = yield* ask(4);
        yield* land(4, true);
        yield* Fiber.join(four);
        yield* land(3, false);
        expect(Exit.isSuccess(yield* Fiber.await(three))).toBe(true);
        // The newest frame's own failure is said.
        const five = yield* ask(5);
        yield* land(5, false);
        expect(Exit.isFailure(yield* Fiber.await(five))).toBe(true);
        expect(painted).toEqual([2, 4]);
      }).pipe(Effect.provide(gatedFootage(gated)));
    },
  );

  it.effect(
    'drops an older frame that lands before the newer one, as `<video>` does, and says nothing of its failure',
    () => {
      const gated = gates([1, 2, 3, 4]);
      const painted: Array<number> = [];
      const asks = newestAsked();
      const ask = (T: number) =>
        Effect.forkDetach(paintedIfNewest(film, T, () => painted.push(T), asks.ask()));
      const land = (T: number, decoded: boolean) =>
        Deferred.done(
          Option.getOrThrow(Option.fromUndefinedOr(gated.get(T))),
          Exit.succeed(decoded),
        );
      return Effect.gen(function* () {
        // Seek to 1, then to 2: 1 decodes first, while 2 is still on its way; 1 paints nothing.
        const one = yield* ask(1);
        const two = yield* ask(2);
        yield* land(1, true);
        yield* Fiber.join(one);
        expect(painted).toEqual([]);
        yield* land(2, true);
        yield* Fiber.join(two);
        // Seek to 3, then to 4: 3 will not decode, landing first; nothing is said of it.
        const three = yield* ask(3);
        const four = yield* ask(4);
        yield* land(3, false);
        expect(Exit.isSuccess(yield* Fiber.await(three))).toBe(true);
        yield* land(4, true);
        yield* Fiber.join(four);
        expect(painted).toEqual([2, 4]);
      }).pipe(Effect.provide(gatedFootage(gated)));
    },
  );
});
