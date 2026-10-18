// A cast member's sheet drawn on the image route: each try is measured as it
// lands and recorded with its flags; a try drawn facing the wrong way is
// drawn once more with its drift named and the underlay as its last
// reference, and a retry that still drifts is kept, flagged, never dropped.
// A kind the record does not set up stops the run before any draw.

import { BunServices } from '@effect/platform-bun';
import { describe, expect, it } from 'effect-bun-test';
import { ConfigProvider, Effect, Exit, FileSystem, Layer, Path, Schema } from 'effect';
import { CastSheetJson, type CastSheetRecord } from '../core/cast-record.ts';
import { Segment } from '../core/segment.ts';
import {
  drawFigure,
  drawSheet,
  type FigureSpec,
  flipRaster,
  PLAIN,
} from '../core/fixtures/figure.ts';
import { castLine, makeCastSheet } from './cast-sheet-make.ts';
import { ContentStore } from './content-store.ts';
import { ImageRoute } from './image-route.ts';
import { encodePng } from './png.ts';
import { memoryFileSystem, memoryLocks, text } from './testing.ts';

/** One image asked of the route. */
type ImageRequest = Parameters<(typeof ImageRoute)['Service']['draw']>[0];
/** A line a run prints. */
type CastLine = Parameters<typeof castLine>[0];

const base: FigureSpec = { ...PLAIN, robeShade: [60, 78, 150], arm: 'sleeve' };
const at = (eyeShift: number, extra: Partial<FigureSpec> = {}) =>
  drawFigure({ ...base, eyeShift, ...extra });
/** The front and a view facing the viewer's left: the sheet as asked. */
const clean = encodePng(drawSheet([at(0), at(-14)]));
/** The second view facing the viewer's right: drawn the wrong way. */
const wrong = encodePng(drawSheet([at(0), flipRaster(at(-14, { lit: 'right' }))]));

const FOLDER = '/library/cast/christ/cast-sheet';
const OUT = '/out/f/cast/christ';

const record: CastSheetRecord = {
  member: Segment.make('christ'),
  scope: 'library',
  who: 'Him',
  refs: [{ file: 'court-12.png', why: 'His kept concept' }],
  sheets: {
    poses: {
      anchor: 1,
      layout: 'Standing, facing the viewer; walking to the left.',
      slots: ['front', 'left'],
      standing: [1, 2],
      tries: [],
    },
  },
};

/** The member's folder in memory, a route answering `draw`, and every call it took. */
const castOver = (
  files: Map<string, Uint8Array>,
  calls: Array<ImageRequest>,
  draw: (r: ImageRequest) => Uint8Array,
  held: CastSheetRecord = record,
) => {
  files.set(`${FOLDER}/cast-sheet.json`, text(Schema.encodeSync(CastSheetJson)(held)));
  files.set(`${FOLDER}/look.md`, text('He wears a cream robe and a blue sash.'));
  const route = ImageRoute.fake((request) => {
    calls.push(request);
    return draw(request);
  });
  return Layer.mergeAll(ContentStore.layer, route).pipe(
    Layer.provideMerge([
      memoryFileSystem(files),
      memoryLocks,
      Path.layer,
      ConfigProvider.layer(ConfigProvider.fromUnknown({})),
    ]),
  );
};

/** The house block as the app keeps it. */
const house = Effect.gen(function* () {
  const fs = yield* FileSystem.FileSystem;
  return yield* fs.readFileString(
    new URL('../../../../apps/animations/docs/ref/house-look.txt', import.meta.url).pathname,
  );
}).pipe(Effect.provide(BunServices.layer));

/** One try of the poses sheet, in one lane. */
const runOf = Effect.map(house, (block) => ({
  kind: 'poses' as const,
  tries: 1,
  lanes: 1,
  dryRun: false,
  house: block,
  houseImage: '/ref/house.png',
}));

/** A run's record as it stands after, and its lines. */
const ran = (files: Map<string, Uint8Array>, lines: Array<CastLine>) =>
  Effect.gen(function* () {
    const run = yield* runOf;
    yield* makeCastSheet({ folder: FOLDER, out: OUT }, run, (line) =>
      Effect.sync(() => lines.push(line)),
    );
    const kept = new TextDecoder().decode(files.get(`${FOLDER}/cast-sheet.json`));
    return yield* Schema.decodeEffect(CastSheetJson)(kept);
  });

const underlaid = (r: ImageRequest) => r.refs.includes(`${OUT}/underlay-poses.png`);

describe('a try drawn the wrong way', () => {
  it.effect(
    'is drawn once more with its drift named and the underlay, and the retry lands clean',
    () => {
      const files = new Map<string, Uint8Array>();
      const calls: Array<ImageRequest> = [];
      const lines: Array<CastLine> = [];
      return Effect.gen(function* () {
        const kept = yield* ran(files, lines);
        const tries = kept.sheets.poses?.tries ?? [];
        expect(
          tries.map((t) => [
            t.n,
            t.underlay,
            t.flags.map((f) => `${f.check}:${f.views.join(',')}`),
          ]),
        ).toEqual([
          [1, false, ['facing:2']],
          [2, true, []],
        ]);
        expect(tries[1]?.retryOf).toBe(1);
        expect(calls[0]?.refs).toEqual(['/ref/house.png', `${FOLDER}/court-12.png`]);
        expect(tries[1]?.refs).toEqual([
          '../../../../ref/house.png',
          'court-12.png',
          '../../../../out/f/cast/christ/underlay-poses.png',
        ]);
        expect(calls[1]?.prompt).toContain("Figure 2 faces the viewer's left");
        expect(calls[1]?.prompt).toContain('Image 3 is a layout, never a look');
        // The house image's hands float (the look from before 2026-10-18): the try takes its paper, line and light only.
        expect(calls[0]?.prompt).toContain(
          'Image 1 is the house look: take its paper, its line and its light from it; its hands float free beside the body, which no figure on this sheet does.',
        );
        expect(files.has(`${OUT}/poses-1.png`) && files.has(`${OUT}/poses-1.measure.md`)).toBe(
          true,
        );
        expect(
          files.has(`${OUT}/poses-2.overlay.png`) && files.has(`${OUT}/poses-2.preview.png`),
        ).toBe(true);
        expect(castLine(lines[0]!)).toStartWith('made christ.poses try=1 flags=1 underlay=false');
      }).pipe(Effect.provide(castOver(files, calls, (r) => (underlaid(r) && clean) || wrong)));
    },
  );

  it.effect(
    'is kept with its flags when the retry still drifts, and never drawn a third time',
    () => {
      const files = new Map<string, Uint8Array>();
      const calls: Array<ImageRequest> = [];
      return Effect.gen(function* () {
        const kept = yield* ran(files, []);
        const tries = kept.sheets.poses?.tries ?? [];
        expect(tries.map((t) => [t.n, t.underlay, t.flags.length])).toEqual([
          [1, false, 1],
          [2, true, 1],
        ]);
        expect(calls).toHaveLength(2);
      }).pipe(Effect.provide(castOver(files, calls, () => wrong)));
    },
  );
});

describe('a sheet with no standing view', () => {
  it.effect(
    'is redrawn with its drift named but no underlay: a mannequin would stand a pose that lies',
    () => {
      const files = new Map<string, Uint8Array>();
      const calls: Array<ImageRequest> = [];
      const lying: CastSheetRecord = {
        ...record,
        sheets: { poses: { ...record.sheets.poses!, standing: [] } },
      };
      return Effect.gen(function* () {
        const kept = yield* ran(files, []);
        const tries = kept.sheets.poses?.tries ?? [];
        expect(tries.map((t) => [t.n, t.underlay])).toEqual([
          [1, false],
          [2, false],
        ]);
        expect(calls[1]?.prompt).toContain("Figure 2 faces the viewer's left");
        expect(calls.some(underlaid) || files.has(`${OUT}/underlay-poses.png`)).toBe(false);
      }).pipe(Effect.provide(castOver(files, calls, () => wrong, lying)));
    },
  );
});

describe('a kind the record does not set up', () => {
  it.effect('stops the run before any draw, naming the kind', () => {
    const files = new Map<string, Uint8Array>();
    const calls: Array<ImageRequest> = [];
    return Effect.gen(function* () {
      const run = yield* runOf;
      const exit = yield* Effect.exit(
        makeCastSheet({ folder: FOLDER, out: OUT }, { ...run, kind: 'heads' }, () => Effect.void),
      );
      expect(Exit.isFailure(exit) && String(exit.cause)).toContain(
        "christ's heads sheet is not set up",
      );
      expect(calls).toHaveLength(0);
    }).pipe(Effect.provide(castOver(files, calls, () => clean)));
  });
});
