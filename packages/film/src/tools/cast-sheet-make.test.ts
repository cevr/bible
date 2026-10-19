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

/** One try of a sheet (the poses sheet when unnamed), in one lane. */
const runOf = (kind: 'poses' | 'heads') =>
  Effect.map(house, (block) => ({
    kind,
    tries: 1,
    lanes: 1,
    dryRun: false,
    house: block,
    houseImage: '/ref/house.png',
  }));

/** A run's record as it stands after, and its lines. */
const ran = (
  files: Map<string, Uint8Array>,
  lines: Array<CastLine>,
  kind: 'poses' | 'heads' = 'poses',
) =>
  Effect.gen(function* () {
    const run = yield* runOf(kind);
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

describe('a try whose head and papers drift from the anchor', () => {
  it.effect(
    "is drawn again held to the anchor's own numbers and colours, in words beside them",
    () => {
      const files = new Map<string, Uint8Array>();
      const calls: Array<ImageRequest> = [];
      const drifted = encodePng(
        drawSheet([at(0), at(-14, { rx: 70, ry: 77, robeShade: [150, 60, 60] })]),
      );
      return Effect.gen(function* () {
        yield* ran(files, []);
        const retry = calls[1]?.prompt ?? '';
        expect(retry).toMatch(
          /Figure 2's head is as big as figure 1's: \d+ pixels tall on this sheet, [a-z ]+ the figure's whole height \(\d+ %\)\./,
        );
        expect(retry).toMatch(/Figure 2 wears the same papers as figure 1: [^;]*blue \(#3c4e96\)/);
      }).pipe(Effect.provide(castOver(files, calls, () => drifted)));
    },
  );
});

describe('a heads sheet whose head drifts within its turn', () => {
  it.effect(
    "is drawn again held to its turn's first head by its eyes, and its nodding head is not held for its height",
    () => {
      const files = new Map<string, Uint8Array>();
      const calls: Array<ImageRequest> = [];
      const bust = (extra: Partial<FigureSpec>) =>
        at(0, { handless: true, feet: false, robeDepth: 120, longHair: true, ...extra });
      const heads: CastSheetRecord = {
        ...record,
        sheets: {
          heads: {
            anchor: 1,
            layout: 'His head three times, facing the viewer: level, bowed, level.',
            slots: ['front', 'front', 'front'],
            level: [1, 3],
            tries: [],
          },
        },
      };
      // The bowed head is shorter on the page; the third, level, is drawn bigger than the first, its eyes farther apart.
      const drifted = encodePng(
        drawSheet([bust({}), bust({ ry: 56, eyeBelow: 22 }), bust({ rx: 70, eyeGap: 56 })]),
      );
      return Effect.gen(function* () {
        const kept = yield* ran(files, [], 'heads');
        const first = kept.sheets.heads?.tries[0];
        expect(first?.flags.map((f) => `${f.check}:${f.views.join(',')}`)).toEqual(['head:3,1']);
        expect(calls[1]?.prompt ?? '').toMatch(
          /Figure 3's head is the size of figure 1's, which turns the same way: its eyes about \d+ pixels apart\./,
        );
      }).pipe(Effect.provide(castOver(files, calls, () => drifted, heads)));
    },
  );
});

describe('a try the measure cannot read', () => {
  it.effect('is recorded unread, said on its line, and drawn once more', () => {
    const files = new Map<string, Uint8Array>();
    const calls: Array<ImageRequest> = [];
    const lines: Array<CastLine> = [];
    // One figure where the sheet names two.
    const lone = encodePng(drawSheet([at(0)]));
    return Effect.gen(function* () {
      const kept = yield* ran(files, lines);
      const tries = kept.sheets.poses?.tries ?? [];
      expect(tries.map((t) => [t.n, t.unread ?? 'read', t.flags.length])).toEqual([
        [1, '1 figures found, the sheet names 2', 0],
        [2, 'read', 0],
      ]);
      expect(castLine(lines[0]!)).toContain('unread="1 figures found, the sheet names 2"');
    }).pipe(Effect.provide(castOver(files, calls, () => (calls.length > 1 && clean) || lone)));
  });
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
      const run = yield* runOf('poses');
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
