// The cast sheet's measure on pose, heads and headgear sheets drawn with known
// faults (`fixtures/figure.ts`): each sleeve, arm, beard, size and paper
// drawn wrong is the flag it was drawn for, and what a sheet cannot show is
// said, never flagged. The turnarounds are read in `cast-sheet.test.ts`.

import { describe, expect, test } from 'bun:test';
import { Result } from 'effect';
import { measureSheet, type SheetMeasure, type SheetOptions } from './cast-sheet.ts';
import { drawFigure, drawSheet, type FigureSpec, PLAIN } from './fixtures/figure.ts';

const base: FigureSpec = { ...PLAIN, robeShade: [60, 78, 150] };
const at = (extra: Partial<FigureSpec> = {}) => drawFigure({ ...base, eyeShift: 0, ...extra });
const read = (
  views: ReadonlyArray<ReturnType<typeof drawFigure>>,
  options: SheetOptions,
): SheetMeasure => Result.getOrThrow(measureSheet(drawSheet(views), options));
const flagsOf = (m: SheetMeasure) => m.flags.map((f) => `${f.check}:${f.views.join(',')}`);

describe("a pose sheet's sleeves and arms", () => {
  const m = read([at({ arm: 'sleeveAtRest' }), at({ arm: 'sleeveReach' }), at({ arm: 'bare' })], {
    kind: 'poses',
    count: 3,
    anchor: 1,
  });

  test('passes a sleeve at rest, and flags a sleeve that reaches to the hand and a bare arm', () => {
    expect(flagsOf(m)).toEqual(['sleeveReach:2', 'bareArm:3']);
    expect(m.views[0]?.reach).toBe(0);
    expect(m.views[1]?.reach).toBeGreaterThan(0.5);
    expect(m.views.map((v) => v.bare)).toEqual([0, 0, 1]);
  });
});

describe("a heads sheet's hair and beard", () => {
  const m = read(
    [
      at({ longHair: true, beard: { parted: true } }),
      at({ longHair: true, beard: { parted: false } }),
    ],
    { kind: 'heads', count: 2, anchor: 1 },
  );

  test('reads a beard parted from the hair, and flags one that runs into it', () => {
    expect(m.views.map((v) => v.hairBeard)).toEqual(['parted', 'merged']);
    expect(flagsOf(m)).toEqual(['hairBeard:2']);
  });

  test('holds no body to the canon, and says so', () => {
    expect(m.canon).toEqual({});
    expect(m.unmeasured).toContainEqual({
      check: 'squash',
      view: 0,
      why: 'a heads sheet draws no body to hold to the canon',
    });
  });
});

describe('a pose sheet drifting from its anchor', () => {
  const m = read(
    [
      at(),
      at({ cy: 120 }),
      at({ robeShade: [104, 104, 104] }),
      at({ robe: [170, 84, 64], robeShade: [150, 60, 80] }),
      at({ robeDepth: 380 }),
    ],
    { kind: 'poses', count: 5, anchor: 1, standing: [1, 2, 3, 4, 5] },
  );

  test('flags a standing view taller, soles off the ground line, a grey shade and another cloth', () => {
    expect(flagsOf(m)).toEqual([
      'height:5,1',
      'ground:2',
      'ground:5',
      'grey:3',
      'papers:3,1',
      'papers:4,1',
    ]);
  });
});

describe('a pose sheet whose anchor is squashed', () => {
  const m = read([at({ rx: 40, ry: 44 }), at()], { kind: 'poses', count: 2, anchor: 1 });

  test("flags the squash to the canon, and the head and hand off the anchor's", () => {
    expect(m.canon.squash).toBeGreaterThan(30);
    expect(flagsOf(m).filter((f) => !f.startsWith('ground'))).toEqual([
      'squash:1',
      'head:2,1',
      'hand:2,1',
    ]);
  });
});

describe('a figure under headgear', () => {
  const m = read([at()], { kind: 'poses', count: 1, anchor: 1, headgear: true });

  test('holds the views to the face opening, and leaves the canon to the lock', () => {
    expect(flagsOf(m)).toEqual([]);
    expect(m.canon).toEqual({});
    expect(m.unmeasured.map((u) => u.check)).toContain('squash');
  });
});
