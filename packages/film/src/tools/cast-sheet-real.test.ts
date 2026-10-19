// The cast sheet's measure on a real try: a Christ turnaround the image
// route painted from the cast sheet brief (scaled to 0.75), and the same
// sheet rebuilt with its two profiles swapped, so each faces away from the
// three-quarter on its side. A painted profile and three-quarter differ in
// the body far more than a drawn fixture's do, so the profile is held to the
// three-quarter on their heads. The sheet is a PNG, so it is decoded here,
// past core.

import { BunServices } from '@effect/platform-bun';
import { describe, expect, it } from 'effect-bun-test';
import { Effect, FileSystem, Result } from 'effect';
import { measureSheet } from '../core/cast-sheet.ts';
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
