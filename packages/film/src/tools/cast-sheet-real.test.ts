// The cast sheet's measure on real tries the image route painted from the
// cast sheet brief, each scaled to 0.75: a Christ turnaround, and the same
// sheet rebuilt with its two profiles swapped, so each faces away from the
// three-quarter on its side (a painted profile and three-quarter differ in
// the body far more than a drawn fixture's do, so the profile is held to the
// three-quarter on their heads); a turnaround painted close together, whose
// body band crosses into its neighbours' crops; a heads sheet whose locks of
// hair widen some heads' boxes; a pose sheet with a bare forearm painted on
// to a hand under the chin; a farmer under a headcloth whose ends fall past
// his hands; and a farmer whose headcloth falls to his hem. The sheets are
// PNGs, so they are decoded here, past core.

import { BunServices } from '@effect/platform-bun';
import { describe, expect, it } from 'effect-bun-test';
import { Effect, FileSystem, Result } from 'effect';
import { measureSheet, type SheetOptions } from '../core/cast-sheet.ts';
import { figuresOf } from '../core/cast-sheet-pixels.ts';
import { drawSheet } from '../core/fixtures/figure.ts';
import { cropRaster, type Raster } from '../core/raster.ts';
import { decodePng } from './png.ts';

const sheetAt = (name: string) =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const bytes = yield* fs.readFile(
      new URL(`../core/fixtures/sheet/${name}`, import.meta.url).pathname,
    );
    return Result.getOrThrow(decodePng(bytes));
  }).pipe(Effect.provide(BunServices.layer));

/** The sheet's six figures, each cropped on the sheet's full height, laid out again in `order` (1-based). */
const reordered = (sheet: Raster, order: ReadonlyArray<number>) => {
  const figures = figuresOf(sheet, 6).figures;
  const crops = figures.map((f) =>
    cropRaster(sheet, [f.box[0] - 10, 0, f.box[2] + 10, sheet.height]),
  );
  return drawSheet(order.flatMap((k) => crops.slice(k - 1, k)));
};

const profileWays = (sheet: Raster) =>
  Result.getOrThrow(measureSheet(sheet, { kind: 'turnaround', count: 6, anchor: 2 }))
    .flags.filter((f) => f.check === 'profileWay')
    .map((f) => f.views.join(','));

describe("a painted turnaround's profiles", () => {
  it.effect('pass on the sheet as painted, and both flag when they are swapped', () =>
    Effect.gen(function* () {
      const sheet = yield* sheetAt('christ-turnaround-w1.png');
      expect(profileWays(reordered(sheet, [1, 2, 3, 4, 5, 6]))).toEqual([]);
      expect(profileWays(reordered(sheet, [1, 2, 5, 4, 3, 6]))).toEqual(['2,3', '6,5']);
    }),
  );
});

const measured = (sheet: Raster, options: SheetOptions) =>
  Result.getOrThrow(measureSheet(sheet, options));
const flagsOf = (sheet: Raster, options: SheetOptions) =>
  measured(sheet, options).flags.map((f) => `${f.check}:${f.views.join(',')}`);

describe('a turnaround painted close together', () => {
  it.effect("reads each view's width on its own body, never a neighbour's robe in its crop", () =>
    Effect.gen(function* () {
      const sheet = yield* sheetAt('christ-turnaround-2.png');
      // Seen: its front and back are as wide; the back's crop took the next view's sleeve, and read 31 % narrower.
      expect(flagsOf(sheet, { kind: 'turnaround', count: 6, anchor: 2 })).not.toContain(
        'width:1,4',
      );
    }),
  );
});

describe("a heads sheet whose locks widen some heads' boxes", () => {
  it.effect('holds the heads of one turn by their eyes, never by the box the hair widens', () =>
    Effect.gen(function* () {
      const sheet = yield* sheetAt('christ-heads-l1.png');
      const options: SheetOptions = {
        kind: 'heads',
        count: 6,
        anchor: 1,
        slots: ['left', 'left', 'left', 'front', 'front', 'front'],
        level: [1, 4],
      };
      // Seen: one head drawn six times, the lock beside the cheek falling wider on some; the heads' height on the level heads is a check of its own, held to the anchor.
      expect(
        measured(sheet, options)
          .flags.filter((f) => f.check === 'head' && f.note.includes("the eyes' spacing"))
          .map((f) => f.views.join(',')),
      ).toEqual([]);
    }),
  );
});

/** A bare forearm painted on christ-poses-l2's view 2, joined as flat skin to the hand it holds under the chin, run down toward the waist's middle: its ink, then its skin. */
const withForearm = (sheet: Raster) => {
  const r = { ...sheet, rgba: Uint8Array.from(sheet.rgba) };
  const at = (x: number, y: number) => {
    const i = (y * r.width + x) * 4;
    return [r.rgba[i] ?? 0, r.rgba[i + 1] ?? 0, r.rgba[i + 2] ?? 0] as const;
  };
  const skin = at(216, 373);
  const ink = Array.from({ length: 38 }, (_, k) => at(202 + k, 368)).reduce(
    (a, c) => (c[0] + c[1] + c[2] < a[0] + a[1] + a[2] && c) || a,
  );
  const [from, to] = [
    [228, 379.5],
    [250.5, 425.25],
  ] as const;
  const near = (w: number) => (x: number, y: number) => {
    const [dx, dy] = [to[0] - from[0], to[1] - from[1]];
    const t = Math.max(
      0,
      Math.min(1, ((x - from[0]) * dx + (y - from[1]) * dy) / (dx * dx + dy * dy)),
    );
    return Math.hypot(x - (from[0] + t * dx), y - (from[1] + t * dy)) <= w;
  };
  const paint = (inside: (x: number, y: number) => boolean, c: ReadonlyArray<number>) => {
    for (let y = 330; y < 465; y++)
      for (let x = 180; x < 285; x++)
        if (inside(x + 0.5, y + 0.5))
          r.rgba.set([c[0] ?? 0, c[1] ?? 0, c[2] ?? 0, 255], (y * r.width + x) * 4);
  };
  paint((x, y) => near(13.5)(x, y) && Math.hypot(x - 222, y - 368.25) > 20.25, ink);
  paint(near(9.75), skin);
  return r;
};

describe('a pose sheet with a bare forearm painted to a hand under the chin', () => {
  it.effect('flags the bare arm, never reads it as the neck', () =>
    Effect.gen(function* () {
      const sheet = yield* sheetAt('christ-poses-l2.png');
      const options: SheetOptions = {
        kind: 'poses',
        count: 6,
        anchor: 1,
        slots: ['left', 'front', 'left', 'left', 'left', 'left'],
      };
      expect(flagsOf(sheet, options)).not.toContain('bareArm:2');
      expect(flagsOf(withForearm(sheet), options)).toContain('bareArm:2');
    }),
  );
});

describe('a farmer under a headcloth whose ends fall past his hands', () => {
  it.effect('reads his hands at rest against the body, never the side under them unread', () =>
    Effect.gen(function* () {
      const sheet = yield* sheetAt('farmer-turnaround-u2.png');
      const m = measured(sheet, { kind: 'turnaround', count: 6, anchor: 6, headgear: true });
      // Seen: the hands touch the robe, with no sleeve; the cloth is not hair, so the side's rows start under the chin.
      expect(
        m.unmeasured
          .filter((u) => u.check === 'sleeveReach' && [1, 2, 6].includes(u.view))
          .map((u) => u.why),
      ).toEqual(
        Array.from(
          { length: 3 },
          () => 'a hand at rest against the body: a sleeve to it is not told from a touch',
        ),
      );
    }),
  );
});

describe('a farmer under a headcloth that falls to his hem', () => {
  it.effect(
    'reads his face, neck and shoulders on the face opening, so his hands hang at rest, never in front of the head',
    () =>
      Effect.gen(function* () {
        const sheet = yield* sheetAt('farmer-turnaround-2.png');
        const m = measured(sheet, { kind: 'turnaround', count: 6, anchor: 6, headgear: true });
        // Seen: his hands hang at his sides on views 1, 2 and 6; the cloth's box runs down to the hem on view 6.
        expect(
          m.unmeasured
            .filter((u) => u.check === 'sleeveReach' && [1, 2, 6].includes(u.view))
            .map((u) => `${u.view} ${u.why}`),
        ).toEqual(
          [1, 2, 6].map(
            (v) => `${v} a hand at rest against the body: a sleeve to it is not told from a touch`,
          ),
        );
      }),
  );
});
