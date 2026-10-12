// A talk renders frame-exact (`canvas/talk.ts`): each frame of its page shows
// the frame of the take its cut names, through every seam, however the
// frame is reached, with its captions as the probe reads them. The take is a
// numbered clip (`numbered-clip.ts`, made here by mediabunny and x264), 9:16
// so the page's crop is all of it and its bars run across the page; the talk
// (`talk-film.ts`) is cut with a seam inside each of its two sections. Read
// through the render page's export handle, as `film render` reads it: an
// export chunk (a run decoded in order) over every seam, a frame drawn alone
// (a still or a seek, back and forth), and the probe.

import { Effect, Exit, Result, Schema } from 'effect';
import { describe, expect, it } from 'effect-bun-test';
import { ExportAnswers } from '../../src/core/export-handle.ts';
import { footageHref } from '../../src/core/footage.ts';
import { layout } from '../../src/core/layout.ts';
import { TALK_FPS, talkCut, talkPhrases } from '../../src/core/talk.ts';
import { numberedClip, numbersIn } from '../../src/lab/fixtures/numbered-clip.ts';
import { BITS, numberOf } from '../../src/lab/fixtures/numbered-frames.ts';
import { openRender } from '../../src/lab/fixtures/render-harness.ts';
import {
  TALK,
  TALK_CLIP,
  TALK_EDIT,
  TALK_LIBRARY,
  TALK_TAKE,
} from '../../src/lab/fixtures/talk-film.ts';

const cut = Result.getOrThrow(talkCut(TALK_EDIT, { a: TALK_TAKE }));
const placed = Result.getOrThrow(layout(cut.scenes, cut.timings));

/** Seconds as the talk's frames. */
const frameOf = (s: number) => Math.round(s * TALK_FPS);

/**
 * The take's frame each of the talk's frames shows, by the cut alone: each
 * section's pieces back to back, each piece the take's frames from its
 * in-point to its out-point.
 */
const SHOWN = cut.sections.flatMap((section) =>
  section.pieces.flatMap((piece) =>
    Array.from(
      { length: frameOf(piece.to) - frameOf(piece.from) },
      (_, k) => frameOf(piece.from) + k,
    ),
  ),
);

/** Where the talk jumps in the take: the frame each piece after the first starts on. */
const SEAMS = cut.sections.flatMap((section, k) =>
  section.pieces.slice(1).map((piece) => frameOf((placed[k]?.start ?? 0) + piece.at)),
);

/** The take's clip: every frame the cut reads, and a second past them. */
const CLIP_FRAMES = Math.max(...SHOWN) + TALK_FPS;

/**
 * The render page on the talk, its clip served as the mezzanine the render
 * reads, and the footage library's lock and transcript the page cuts on.
 */
const opened = Effect.gen(function* () {
  const clip = yield* numberedClip({
    frames: CLIP_FRAMES,
    fps: TALK_FPS,
    keyEvery: 1,
    size: TALK_CLIP,
  });
  return yield* openRender(TALK, {
    ...(yield* TALK_LIBRARY),
    [footageHref(TALK_TAKE.source, 'mezzanine')]: clip,
  });
});

/** One sample per bar across the page's middle row, where the take's bars run and no word is set. */
const BARS = { x: 0, y: 1920 / 2 - 4, w: 1080, h: 8, cols: BITS, rows: 1 };

describe('a talk renders frame-exact', () => {
  it.effect('is cut with a seam inside each section, and its pieces add up to the talk', () =>
    Effect.sync(() => {
      expect(SEAMS).toHaveLength(2);
      expect(SHOWN).toHaveLength(frameOf(placed.reduce((n, p) => n + p.dur, 0)));
    }),
  );

  it.live(
    'an export chunk shows each frame of the take its cut names, over every seam',
    () =>
      Effect.scoped(
        Effect.gen(function* () {
          const page = yield* opened;
          const choice = yield* page.call('encoder', 1, false, [
            { _tag: 'Hardware' },
            { _tag: 'Software' },
          ]);
          if (choice._tag === 'Missing') return yield* Effect.die(choice.reason);
          const chunk = yield* Schema.decodeEffect(ExportAnswers.encode)(
            yield* page.call('encode', 0, SHOWN.length, 1, false, choice),
          ).pipe(Effect.orDie);
          expect(yield* numbersIn(chunk.master)).toEqual(SHOWN);
          expect(page.errors).toEqual([]);
        }),
      ),
    120_000,
  );

  it.live(
    'a frame drawn alone shows the frame its cut names, reached in any order: either side of each seam, back and forth',
    () =>
      Effect.scoped(
        Effect.gen(function* () {
          const page = yield* opened;
          const [first = 0, second = 0] = SEAMS;
          const frames = [
            0,
            first - 1,
            first,
            second - 1,
            second,
            first,
            first - 1,
            0,
            SHOWN.length - 1,
            1,
          ];
          const shown = yield* Effect.forEach(frames, (i) =>
            Effect.map(page.call('luma', i, BARS), numberOf),
          );
          expect(shown).toEqual(frames.map((i) => SHOWN[i] ?? -1));
          expect(page.errors).toEqual([]);
        }),
      ),
    60_000,
  );

  it.live(
    'the probe reads, at a word, the phrase heard there and the frame of the take drawn',
    () =>
      Effect.scoped(
        Effect.gen(function* () {
          const page = yield* opened;
          const answer = placed[1];
          const word = answer?.voice.words[4];
          const T =
            (answer?.start ?? 0) + (answer?.speechStart ?? 0) + (word?.voiced.start ?? 0) + 0.05;
          const i = Math.floor(T * TALK_FPS);
          const phrase = talkPhrases(TALK_EDIT, cut, placed).find(
            (p) => p.start <= i / TALK_FPS && i / TALK_FPS < p.end,
          );
          const probed = yield* page.call('probe', i);
          const captions = probed.texts.filter((t) => t.caption === true).map((t) => t.text);
          expect(captions.join(' ')).toBe((phrase?.words ?? []).map((w) => w.text).join(' '));
          expect(captions.join(' ')).toContain('our');
          expect(probed.footage).toEqual([
            { source: TALK_TAKE.source, at: ((SHOWN[i] ?? -1) + 0.5) / TALK_FPS },
          ]);
          expect(page.errors).toEqual([]);
        }),
      ),
    60_000,
  );

  it.live(
    'an export chunk whose mezzanine cannot be fetched fails, naming the frame it lacks',
    () =>
      Effect.scoped(
        Effect.gen(function* () {
          // The page with its library and no mezzanine served: every read of the take is a 404.
          const page = yield* openRender(TALK, yield* TALK_LIBRARY);
          const choice = yield* page.call('encoder', 1, false, [
            { _tag: 'Hardware' },
            { _tag: 'Software' },
          ]);
          if (choice._tag === 'Missing') return yield* Effect.die(choice.reason);
          const exit = yield* Effect.exit(page.call('encode', 0, 10, 1, false, choice));
          expect(Exit.isFailure(exit)).toBe(true);
          // FootageFrameMissing, as the page throws it: the source and the time it has no frame at.
          expect(String(Exit.isFailure(exit) && exit.cause)).toContain(
            `footage ${TALK_TAKE.source} has no frame at`,
          );
        }),
      ),
    60_000,
  );
});
