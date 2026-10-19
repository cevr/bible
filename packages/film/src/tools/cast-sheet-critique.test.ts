// A cast sheet try's critique: each view a kept concept faces is cut from
// the try and shown beside the concept's crop with the measure's flags on
// it, in one counsel run; a view no concept faces is said, never critiqued.

import { BunServices } from '@effect/platform-bun';
import { describe, expect, it } from 'effect-bun-test';
import { Effect, FileSystem, Layer, Path, Schema } from 'effect';
import { CastSheetJson, type CastSheetRecord } from '../core/cast-record.ts';
import { drawFigure, drawSheet, type FigureSpec, PLAIN } from '../core/fixtures/figure.ts';
import { Segment } from '../core/segment.ts';
import { critiqueCastTry } from './cast-sheet-critique.ts';
import { Counsel } from './counsel.ts';
import { Critic } from './critique.ts';
import type { Raster } from '../core/raster.ts';
import { decodePng, encodePng } from './png.ts';

const base: FigureSpec = { ...PLAIN, robeShade: [60, 78, 150], arm: 'sleeve' };
const front = drawFigure({ ...base, eyeShift: 0 });
const ANSWER = [
  '```json',
  '{"findings": [{"figure": "view-1", "aspect": "face", "what": "the beard runs into the hair"}]}',
  '```',
].join('\n');

/** `sheet` as the route can answer it with its paper left out: every paper pixel transparent, its colour a dark grey no eye sees. */
const bare = (sheet: Raster): Raster => {
  const rgba = Uint8Array.from(sheet.rgba);
  for (let i = 0; i < rgba.length; i += 4)
    if (rgba[i] === 238 && rgba[i + 1] === 230 && rgba[i + 2] === 214) rgba.set([70, 70, 70, 0], i);
  return { ...sheet, rgba };
};

/** Every packet the counsel was asked. */
const asked: Array<string> = [];

/** The critic over a rule file of its own, its counsel a stub answering `ANSWER`. */
const critic = Layer.unwrap(
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const rules = yield* fs.makeTempFileScoped({ suffix: '.md' });
    yield* fs.writeFileString(rules, '# Rules\n\n## The look\n\nOne silhouette outline.\n');
    return Critic.layer([{ file: rules, heading: '## The look' }]).pipe(
      Layer.provide(Counsel.layerTest(() => ANSWER, asked)),
    );
  }),
);

/** The try `poses-1.png` (a front view and one more, painted with no paper), critiqued with `layout`: the critique, the packets asked and the first view's crop. */
const critiqued = (layout: string) =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const root = yield* fs.makeTempDirectoryScoped();
    const folder = path.join(root, 'cast-sheet');
    const out = path.join(root, 'out');
    yield* fs.makeDirectory(folder, { recursive: true });
    yield* fs.makeDirectory(out, { recursive: true });
    yield* fs.writeFile(path.join(folder, 'concept.png'), encodePng(front));
    yield* fs.writeFile(
      path.join(out, 'poses-1.png'),
      // Painted with no paper: the critic is still shown each view on white.
      encodePng(bare(drawSheet([front, drawFigure({ ...base, eyeShift: 0, cy: 120 })]))),
    );
    const record: CastSheetRecord = {
      member: Segment.make('christ'),
      scope: 'library',
      who: 'Him',
      refs: [{ file: 'concept.png', why: 'His kept concept' }],
      sheets: {
        poses: {
          anchor: 1,
          layout,
          slots: ['front', 'front'],
          standing: [1, 2],
          concepts: [{ file: 'concept.png', box: [0, 0, front.width, front.height], views: [1] }],
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
    yield* fs.writeFileString(
      path.join(folder, 'cast-sheet.json'),
      yield* Schema.encodeEffect(CastSheetJson)(record),
    );
    const before = asked.length;
    const result = yield* critiqueCastTry({ folder, out }, 'poses', 1);
    const crop = yield* Effect.fromResult(
      decodePng(yield* fs.readFile(path.join(out, 'critique', 'poses-1', 'view-1.sheet.png'))),
    );
    return { ...result, packets: asked.slice(before), crop };
  });

describe("a cast sheet try's critique", () => {
  it.effect('asks of each view a concept faces, with its flags, and says the rest', () =>
    Effect.gen(function* () {
      const { taken, unpaired, packets, crop } = yield* critiqued(
        'Draw Him twice, left to right: one, standing at rest, facing the viewer; two, standing, facing the viewer.',
      );
      expect(packets).toHaveLength(1);
      expect(packets[0]).toContain('`view-1-concept.png`');
      expect(packets[0]).not.toContain('view-2');
      expect(packets[0]).toContain(
        '- What the layout asks of it: standing at rest, facing the viewer\n',
      );
      expect(taken.figures.map((f) => [f.figure, f.findings.length])).toEqual([['view-1', 1]]);
      expect(unpaired).toEqual([2]);
      expect(crop.rgba.filter((_, i) => i % 4 === 3 && crop.rgba[i] !== 255).length).toBe(0);
    }).pipe(Effect.provide(critic.pipe(Layer.provideMerge(BunServices.layer))), Effect.scoped),
  );

  it.effect('asks of a view in a group the words its group shares, then its own clause', () =>
    Effect.gen(function* () {
      const { packets } = yield* critiqued(
        "Draw Him twice, all the same size. One and two are turned three-quarters toward the viewer's left: one, level, at rest; two, bowed.",
      );
      expect(packets[0]).toContain(
        "- What the layout asks of it: One and two are turned three-quarters toward the viewer's left: level, at rest\n",
      );
    }).pipe(Effect.provide(critic.pipe(Layer.provideMerge(BunServices.layer))), Effect.scoped),
  );
});
