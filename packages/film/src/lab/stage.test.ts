// The stage's still waits for the film's faces: a frame is never taken in a
// fallback face, and the tools that ask for one stand before the faces load.
// It is the frame asked for: the canvas is read once the player has painted
// it, however long its footage takes to decode.

import { describe, expect, it } from 'effect-bun-test';
import { Effect, Fiber } from 'effect';
import type { Player } from '../player/main.ts';
import { makeStage } from './stage.ts';

/**
 * A player whose faces are in or not, painting a frame only after its
 * footage decodes (a turn later), into a canvas whose image is the last
 * frame painted.
 */
const fakePlayer = (faces: { drawable: boolean }) => {
  const listeners = new Set<(T: number) => void>();
  const drawn: number[] = [];
  let painted = 0;
  const player = {
    film: { placed: [] },
    ctx: {},
    canvas: {
      toBlob: (done: Parameters<HTMLCanvasElement['toBlob']>[0]) =>
        done(new Blob([new Uint8Array([painted])])),
    },
    drawable: () => faces.drawable,
    onDraw: (listener: (T: number) => void) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    renderShown: (_into: CanvasRenderingContext2D, T: number) =>
      Effect.andThen(
        Effect.yieldNow,
        Effect.sync(() => {
          if (!faces.drawable) return;
          drawn.push(T);
          painted = T;
        }),
      ),
  } as unknown as Player;
  const land = () => {
    faces.drawable = true;
    for (const listener of [...listeners]) listener(0);
  };
  return { player, drawn, land, listening: () => listeners.size };
};

describe('the stage still', () => {
  it.effect('is the frame asked for, taken once it is painted, when the faces are in', () =>
    Effect.gen(function* () {
      const { player, drawn } = fakePlayer({ drawable: true });
      const stage = makeStage(player, () => {}, Effect.void);
      const bytes = yield* stage.still(2);
      expect([...bytes]).toEqual([2]);
      expect(drawn).toEqual([2]);
    }),
  );

  it.effect('waits for the first frame while the faces load, then draws the frame asked for', () =>
    Effect.gen(function* () {
      const faces = fakePlayer({ drawable: false });
      const stage = makeStage(faces.player, () => {}, Effect.void);
      const taken = yield* Effect.forkChild(stage.still(3));
      yield* Effect.yieldNow;
      expect(faces.drawn).toEqual([]);
      faces.land();
      const bytes = yield* Fiber.join(taken);
      expect([...bytes]).toEqual([3]);
      expect(faces.drawn).toEqual([3]);
      expect(faces.listening()).toBe(0);
    }),
  );
});
