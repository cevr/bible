// A cast sheet kept on the owner's answer: the try copied into the member's
// folder, each view cut from it and filed by its name (a turnaround's by the
// house's names), the keep recorded
// with his why; a kind kept already, or a try the record does not hold, is
// refused and writes nothing.

import { test } from 'bun:test';
import { describe, expect, it } from 'effect-bun-test';
import { ConfigProvider, Effect, Exit, Layer, Option, Path, Schema } from 'effect';
import { CastSheetJson, type CastSheetRecord, viewName } from '../core/cast-record.ts';
import { drawFigure, drawSheet, type FigureSpec, PLAIN } from '../core/fixtures/figure.ts';
import { Segment } from '../core/segment.ts';
import { keepCastSheet } from './cast-sheet-keep.ts';
import { ContentStore } from './content-store.ts';
import type { Raster } from '../core/raster.ts';
import { decodePng, encodePng } from './png.ts';
import { memoryFileSystem, memoryLocks, text } from './testing.ts';

const base: FigureSpec = { ...PLAIN, robeShade: [60, 78, 150], arm: 'sleeve' };
const at = (eyeShift: number, extra: Partial<FigureSpec> = {}) =>
  drawFigure({ ...base, eyeShift, ...extra });
const poses = encodePng(drawSheet([at(0), at(-14)]));

/** `sheet` as the route can answer it with its paper left out: every paper pixel transparent, its colour a dark grey no eye sees. */
const bare = (sheet: Raster): Raster => {
  const rgba = Uint8Array.from(sheet.rgba);
  for (let i = 0; i < rgba.length; i += 4)
    if (rgba[i] === 238 && rgba[i + 1] === 230 && rgba[i + 2] === 214) rgba.set([70, 70, 70, 0], i);
  return { ...sheet, rgba };
};

const FOLDER = '/library/cast/christ/cast-sheet';
const OUT = '/out/f/cast/christ';
const record: CastSheetRecord = {
  member: Segment.make('christ'),
  scope: 'library',
  who: 'Him',
  refs: [],
  sheets: {
    poses: {
      anchor: 1,
      layout: 'Standing, facing the viewer; turned to the left.',
      slots: ['front', 'left'],
      tries: [
        {
          n: 1,
          file: 'poses-1.png',
          prompt: 'p',
          refs: [],
          underlay: false,
          flags: [],
          at: '2026-10-18T00:00:00.000Z',
        },
      ],
    },
  },
};

const over = (files: Map<string, Uint8Array>) => {
  files.set(`${FOLDER}/cast-sheet.json`, text(Schema.encodeSync(CastSheetJson)(record)));
  files.set(`${OUT}/poses-1.png`, poses);
  return ContentStore.layer.pipe(
    Layer.provideMerge([
      memoryFileSystem(files),
      memoryLocks,
      Path.layer,
      ConfigProvider.layer(ConfigProvider.fromUnknown({})),
    ]),
  );
};

const keep = (n: number) =>
  keepCastSheet(
    { folder: FOLDER, out: OUT },
    { kind: 'poses', n, why: 'He faces each way as asked', ask: Option.some('a1') },
  );

describe('a sheet kept', () => {
  test("names a turnaround's views by the house's names, and a poses or heads sheet's by kind and number", () => {
    expect([1, 2, 3, 4, 5, 6].map((v) => viewName('turnaround', v))).toEqual([
      'front',
      'threeQuarterLeft',
      'profileLeft',
      'back',
      'profileRight',
      'threeQuarterRight',
    ]);
    expect(viewName('heads', 2)).toBe('heads-2');
  });

  it.effect('files the try and each view by its name, and records the keep with its why', () => {
    const files = new Map<string, Uint8Array>();
    return Effect.gen(function* () {
      const kept = yield* keep(1);
      expect(kept.views.map((v) => v.name)).toEqual(['poses-1', 'poses-2']);
      expect(files.get(`${FOLDER}/kept/poses.png`)).toEqual(poses);
      expect(files.has(`${FOLDER}/views/poses-2.png`)).toBe(true);
      const after = yield* Schema.decodeEffect(CastSheetJson)(
        new TextDecoder().decode(files.get(`${FOLDER}/cast-sheet.json`)),
      );
      expect(after.kept?.poses).toMatchObject({
        try: 1,
        why: 'He faces each way as asked',
        ask: 'a1',
      });
    }).pipe(Effect.provide(over(files)));
  });

  it.effect(
    'cuts each view on white from a sheet painted with no paper, and keeps the try as drawn',
    () => {
      const files = new Map<string, Uint8Array>();
      const drawn = encodePng(bare(drawSheet([at(0), at(-14)])));
      return Effect.gen(function* () {
        files.set(`${OUT}/poses-1.png`, drawn);
        yield* keep(1);
        expect(files.get(`${FOLDER}/kept/poses.png`)).toEqual(drawn);
        const view = yield* Effect.fromResult(
          decodePng(files.get(`${FOLDER}/views/poses-1.png`) ?? new Uint8Array()),
        );
        expect(view.rgba.filter((_, i) => i % 4 === 3 && view.rgba[i] !== 255).length).toBe(0);
      }).pipe(Effect.provide(over(files)));
    },
  );

  it.effect('refuses a kind kept already, and a try the record does not hold', () => {
    const files = new Map<string, Uint8Array>();
    return Effect.gen(function* () {
      const missing = yield* Effect.exit(keep(2));
      expect(Exit.isFailure(missing) && String(missing.cause)).toContain(
        'the record holds no try 2',
      );
      yield* keep(1);
      const again = yield* Effect.exit(keep(1));
      expect(Exit.isFailure(again) && String(again.cause)).toContain('it is kept already');
    }).pipe(Effect.provide(over(files)));
  });
});
