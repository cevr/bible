// The match's table and pictures on drawn figures (`fixtures/figure.ts`): a
// figure against itself flags nothing, and each owner rule (no ink of the
// hair's own, no light rim inside an inner part, the concept's head and
// feet) is flagged where the scene breaks it. The crop round a figure joins
// its own hands; the side-by-side sets the concept's outline over the scene.

import { describe, expect, test } from 'bun:test';
import { Array as Arr, Option, Result } from 'effect';
import { type FigureMeasure, measureFigure } from './figure.ts';
import { drawFigure, type FigureSpec, PLAIN } from './fixtures/figure.ts';
import {
  compareFigures,
  type FigureMark,
  matchLines,
  matchTable,
  onFrame,
  sceneBoxOf,
  sideBySide,
} from './match.ts';

/** The side-by-side's head height, and the magenta its concept's outline is stroked in. */
const SIDE_HEAD = 200;
const OUTLINE_COLOUR = [232, 0, 140] as const;

const figure = (spec: FigureSpec) => {
  const crop = drawFigure(spec);
  return { crop, measure: Result.getOrThrow(measureFigure(crop)) as FigureMeasure };
};

const row = (rows: ReturnType<typeof compareFigures>, name: string) =>
  Option.getOrThrow(Arr.findFirst(rows, (r) => r.name.startsWith(name)));

// Each figure the tests hold, drawn and measured once.
const plain = figure(PLAIN);
const inked = figure({ ...PLAIN, hairInk: true });
const wide = figure({ ...PLAIN, rx: 70 });
const EAR = { ...PLAIN, eyeGap: 30 };
const [bare, rimmed] = [
  figure({ ...EAR, ear: { rim: false } }),
  figure({ ...EAR, ear: { rim: true } }),
];

describe('compareFigures', () => {
  test('a figure against itself flags nothing', () => {
    const rows = compareFigures(plain.measure, plain.measure);
    expect(rows.filter((r) => r.flagged).map((r) => r.name)).toEqual([]);
    expect(row(rows, 'head outline').scene).toBe(0);
  });

  test("hair with its own line is flagged, the owner's rule named", () => {
    const ink = row(compareFigures(plain.measure, inked.measure), 'ink on the hair');
    expect(ink.flagged).toBe(true);
    expect(ink.note).toContain('owner rule is none');
  });

  test('a light rim inside the ear, where the concept paints none, is flagged', () => {
    const rim = row(compareFigures(bare.measure, rimmed.measure), 'light rim');
    expect(rim.flagged).toBe(true);
    expect(rim.note).toContain('the concept does not paint');
    // The concept's rim is the scene's to keep: the same rim on both sides is no difference.
    expect(row(compareFigures(rimmed.measure, rimmed.measure), 'light rim').flagged).toBe(false);
  });

  test("a head wider than the concept's is flagged on its outline: at one width, its top falls inside", () => {
    const outline = row(compareFigures(plain.measure, wide.measure), 'head outline');
    expect(outline.flagged).toBe(true);
    expect(outline.note).toMatch(/\((top|bottom)\): the scene's inside/);
  });

  test('feet the concept shows and the scene does not are flagged; feet the ratios count compare as ratios', () => {
    const rows = compareFigures(plain.measure, figure({ ...PLAIN, feet: false }).measure);
    expect(row(rows, 'feet: shown')).toMatchObject({
      flagged: true,
      note: 'concept shown, scene none',
    });
    expect(row(rows, 'feet, their whole width')).toMatchObject({ flagged: false });
    expect(row(rows, 'feet, their whole width').note).toContain('scene: no feet under the hem');
  });

  test("its height in heads is information, never flagged: the cast's band sets it", () => {
    const tall = figure({ ...PLAIN, robeDepth: 380 });
    const height = row(compareFigures(plain.measure, tall.measure), 'height in head heights');
    expect(height.diff).toBeGreaterThan(5);
    expect(height.flagged).toBe(false);
    expect(height.note).toContain("the cast's height band");
  });

  test("a shout against a closed mouth: the face's marks are information, the pose named; one pose against itself compares them", () => {
    const [shout, line, wideLine] = [
      figure({ ...PLAIN, mouth: { open: true, width: 30 } }),
      figure({ ...PLAIN, mouth: { open: false, width: 30 } }),
      figure({ ...PLAIN, mouth: { open: false, width: 44 } }),
    ];
    const posed = compareFigures(shout.measure, wideLine.measure);
    expect(row(posed, 'mouth width')).toMatchObject({ flagged: false });
    expect(row(posed, 'mouth width').note).toContain('the expression differs');
    expect(row(posed, 'face: its mouth').note).toBe('concept open, scene closed');
    expect(row(compareFigures(line.measure, wideLine.measure), 'mouth width').flagged).toBe(true);
  });

  test('the table and the CLI lines carry each flagged row', () => {
    const rows = compareFigures(plain.measure, inked.measure);
    const concept = {
      image: { set: 'concepts', file: 'images/a.png' },
      box: [0, 0, 400, 640] as const,
    };
    const table = matchTable('lead', concept, rows, 'cold mark:evidence');
    expect(table).toContain('### lead (cold mark:evidence)');
    expect(table).toContain('Concept: concepts/images/a.png, box 0,0,400,640.');
    expect(table).toMatch(
      /\| ink on the hair\/skin edge, its length \| 0\.000 \| [\d.]+ \| [+\d.]+ \| FLAG \|/,
    );
    const lines = matchLines({
      figure: 'lead',
      key: 'film/lead',
      concept,
      rows,
      side: '/s.png',
      table: '/t.md',
      crops: { concept: '/s.concept.png', scene: '/s.scene.png' },
    });
    expect(lines[0]).toBe('lead: /s.png /t.md flagged=1');
    expect(lines[1]).toStartWith('  ink on the hair/skin edge, its length: concept 0.000');
  });
});

describe('sceneBoxOf', () => {
  const mark = (
    key: string,
    box: readonly [number, number, number, number],
    face: boolean,
  ): FigureMark => ({
    scene: 'cold',
    key,
    box,
    face,
  });
  const lead = mark('f/lead', [100, 100, 200, 400], true);
  const judge = mark('f/judge', [600, 100, 700, 400], true);

  test("joins the figure's own hands, not another's, with a twentieth of room", () => {
    const own = mark('f/hand', [210, 250, 240, 280], false);
    const theirs = mark('f/hand', [560, 250, 590, 280], false);
    // The box 100..240 × 100..400 is 300 tall: 15 of room.
    expect(sceneBoxOf(lead, [lead, judge, own, theirs], 1920, 1080)).toEqual([85, 85, 255, 415]);
  });

  test('a figure whose box lies past the frame is not on it; one that crosses its edge is', () => {
    expect(onFrame(mark('f/judge', [1930, 100, 2200, 400], true), 1920, 1080)).toBe(false);
    expect(onFrame(mark('f/judge', [1800, 100, 2200, 400], true), 1920, 1080)).toBe(true);
  });

  test('is held to the frame', () => {
    expect(sceneBoxOf(mark('f/lead', [0, 900, 100, 1080], true), [], 1920, 1080)).toEqual([
      0, 891, 109, 1080,
    ]);
  });
});

describe('the side-by-side', () => {
  const side = sideBySide(plain, wide);
  const magenta = (x0: number, x1: number) => {
    let count = 0;
    for (let y = 0; y < side.height; y++)
      for (let x = x0; x < x1; x++) {
        const i = (y * side.width + x) * 4;
        if (
          side.rgba[i] === OUTLINE_COLOUR[0] &&
          side.rgba[i + 1] === OUTLINE_COLOUR[1] &&
          side.rgba[i + 2] === OUTLINE_COLOUR[2]
        )
          count++;
      }
    return count;
  };

  test("sets the concept, the scene and the scene under the concept's outline side by side, the heads at one height", () => {
    const factor = (m: FigureMeasure) => SIDE_HEAD / (m.head[3] - m.head[1]);
    const [a, b] = [
      Math.round(400 * factor(plain.measure)),
      Math.round(400 * factor(wide.measure)),
    ];
    const gap = Math.round(SIDE_HEAD / 8);
    expect(side.width).toBe(gap * 4 + a + 2 * b);
    // The outline is stroked over the third picture alone.
    expect(magenta(0, gap * 3 + a + b)).toBe(0);
    expect(magenta(gap * 3 + a + b, side.width)).toBeGreaterThan(SIDE_HEAD * 4);
  });

  test("lays the outline's head on the scene's head by its centre and width: a figure against itself is outlined along its own line", () => {
    const same = sideBySide(plain, plain);
    const [hx0, hy0, hx1, hy1] = plain.measure.head;
    const factor = SIDE_HEAD / (hy1 - hy0);
    const [width, gap] = [Math.round(400 * factor), Math.round(SIDE_HEAD / 8)];
    const column = Math.round(((hx0 + hx1) / 2) * factor);
    const topOf = (x: number, hit: (i: number) => boolean) =>
      Arr.findFirstIndex(
        Arr.makeBy(same.height, (y) => (y * same.width + x) * 4),
        hit,
      );
    const dark = (i: number) => same.rgba[i]! + same.rgba[i + 1]! + same.rgba[i + 2]! < 300;
    const magenta = (i: number) =>
      same.rgba[i] === OUTLINE_COLOUR[0] && same.rgba[i + 2] === OUTLINE_COLOUR[2];
    const [scene, outlined] = [
      Option.getOrThrow(topOf(2 * gap + width + column, dark)),
      Option.getOrThrow(topOf(3 * gap + 2 * width + column, magenta)),
    ];
    expect(Math.abs(outlined - scene)).toBeLessThanOrEqual(3);
  });
});
