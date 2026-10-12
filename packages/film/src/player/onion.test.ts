// The onion's painter over a player whose frames the test decodes or not: a
// ghost whose footage will not decode takes the onion it painted before off
// its layer, and the paint fails with why, for the Motion panel to say.

import { describe, expect, it } from 'effect-bun-test';
import { Effect, Exit, Option } from 'effect';
import { standInDom } from '../canvas/fixtures/stand-in.ts';
import { FootageFrameMissing } from '../browser/footage.ts';
import { makeOnion } from './onion.ts';

/** A ten-second film at 30 fps, on stand-in canvases. */
const film = { width: 64, height: 36, fps: 30, duration: 10 };

/** The onion's layer: what is put on it and when it is cleared, in order. */
const layerOf = (calls: Array<string>) => ({
  createImageData: (w: number, h: number) => ({
    data: new Uint8ClampedArray(Math.max(1, w * h) * 4),
  }),
  putImageData: () => {
    calls.push('put');
  },
  clearRect: () => {
    calls.push('clear');
  },
});

describe('the onion', () => {
  it.effect('takes its old ghosts off when a ghost will not decode, and fails with why', () =>
    Effect.scoped(
      Effect.gen(function* () {
        yield* standInDom();
        const calls: Array<string> = [];
        let decodes = true;
        const onion = makeOnion({
          film,
          canvas: document.createElement('canvas'),
          now: () => 5,
          renderShown: (_into, T) =>
            Effect.suspend(() => {
              if (decodes) return Effect.void;
              return Effect.fail(new FootageFrameMissing({ source: 'take', at: T, why: 'gone' }));
            }),
        });
        const layer = layerOf(calls);
        yield* onion.paint(layer, { count: 1, spacing: 2 });
        expect(calls).toEqual(['put']);
        decodes = false;
        const failed = yield* Effect.exit(onion.paint(layer, { count: 1, spacing: 2 }));
        expect(calls).toEqual(['put', 'clear']);
        const why = Exit.findErrorOption(failed).pipe(Option.map((e) => e.message));
        expect(why).toEqual(Option.some('footage take has no frame at 4.933 s: gone'));
      }),
    ),
  );
});
