// Footage is frame-exact (`Film.footageAt`, `browser/footage.ts`): a film
// that reads a camera clip draws exactly the source frame its edit names,
// whichever way the frame is reached. The clip is synthetic, made here by
// mediabunny and x264, each frame carrying its own number as bars
// (`numbered-clip.ts`); the film plays it with one seam, a jump on in the
// clip (`footage-film.ts`). Read through the render page's export handle, as
// `film render` reads it: a still or a seek (one frame decoded alone, in any
// order, back and forth) and an export chunk (a run decoded in order),
// starting mid-way between key frames and running over the seam.

import { Effect, Schema } from 'effect';
import { describe, expect, it } from 'effect-bun-test';
import { ExportAnswers } from '../../src/core/export-handle.ts';
import { footageHref } from '../../src/core/footage.ts';
import {
  FOOTAGE,
  FOOTAGE_CLIP_FRAMES,
  FOOTAGE_FPS,
  FOOTAGE_SOURCE,
  sourceFrameOf,
} from '../../src/lab/fixtures/footage-film.ts';
import { numberedClip, numbersIn } from '../../src/lab/fixtures/numbered-clip.ts';
import { BITS, CLIP_H, CLIP_W, numberOf } from '../../src/lab/fixtures/numbered-frames.ts';
import { openRender } from '../../src/lab/fixtures/render-harness.ts';

/** The render page on the footage film, its clip served as the mezzanine the render reads. */
const opened = Effect.gen(function* () {
  const clip = yield* numberedClip({ frames: FOOTAGE_CLIP_FRAMES, fps: FOOTAGE_FPS, keyEvery: 1 });
  return yield* openRender(FOOTAGE, { [footageHref(FOOTAGE_SOURCE, 'mezzanine')]: clip });
});

/** One sample per bar across the middle row of the frame. */
const BARS = { x: 0, y: CLIP_H / 2 - 4, w: CLIP_W, h: 8, cols: BITS, rows: 1 };

describe('footage is frame-exact', () => {
  it.live(
    'a frame drawn alone shows the source frame its edit names, reached in any order: either side of the seam, back and forth',
    () =>
      Effect.scoped(
        Effect.gen(function* () {
          const page = yield* opened;
          // Forward over the seam, then back across it, then far back to the start, as a seek and a still reach them.
          const frames = [0, 1, 59, 60, 61, 119, 45, 30, 75, 0, 100];
          const shown = yield* Effect.forEach(frames, (i) =>
            Effect.map(page.call('luma', i, BARS), numberOf),
          );
          expect(shown).toEqual(frames.map(sourceFrameOf));
          expect(page.errors).toEqual([]);
        }),
      ),
    60_000,
  );

  it.live(
    'an export chunk shows each source frame its edit names, from a start between key frames on over the seam',
    () =>
      Effect.scoped(
        Effect.gen(function* () {
          const page = yield* opened;
          const choice = yield* page.call('encoder', 1, false, [
            { _tag: 'Hardware' },
            { _tag: 'Software' },
          ]);
          if (choice._tag === 'Missing') return yield* Effect.die(choice.reason);
          const [from, to] = [45, 75];
          const chunk = yield* Schema.decodeEffect(ExportAnswers.encode)(
            yield* page.call('encode', from, to, 1, false, choice),
          ).pipe(Effect.orDie);
          const shown = yield* numbersIn(chunk.master);
          expect(shown).toEqual(
            Array.from({ length: to - from }, (_, k) => sourceFrameOf(from + k)),
          );
          expect(page.errors).toEqual([]);
        }),
      ),
    60_000,
  );
});
