// The cast sheet's read of the skin below the neck and of what joins a hand
// to the body, on pose sheets drawn with known faults (`fixtures/figure.ts`):
// a raised hand is read at any height, a sleeve is followed into a hand
// from any angle, bare skin on the robe never passes as a neck or a hand,
// and what the read cannot tell is said as not measured.

import { describe, expect, test } from 'bun:test';
import { Result } from 'effect';
import { measureSheet, type SheetMeasure } from './cast-sheet.ts';
import { drawFigure, drawSheet, type FigureSpec, PLAIN } from './fixtures/figure.ts';

const base: FigureSpec = { ...PLAIN, robeShade: [60, 78, 150] };
const at = (extra: Partial<FigureSpec> = {}) => drawFigure({ ...base, eyeShift: 0, ...extra });
const poses = (views: ReadonlyArray<ReturnType<typeof drawFigure>>): SheetMeasure =>
  Result.getOrThrow(
    measureSheet(drawSheet(views), { kind: 'poses', count: views.length, anchor: 1 }),
  );
const flagsOf = (m: SheetMeasure) => m.flags.map((f) => `${f.check}:${f.views.join(',')}`);
const unmeasuredOf = (m: SheetMeasure, view: number) =>
  m.unmeasured.filter((u) => u.view === view && u.check !== 'hairBeard').map((u) => u.check);

/** A hand raised beside the head (its middle 56 px above the chin), on nothing, a sleeve or a bare forearm from the shoulder. */
const raised = (kind: 'free' | 'sleeve' | 'bare') =>
  at({ limb: { hand: [318, 160], from: [[250, 262]], kind } });

describe('a raised hand', () => {
  const m = poses([at(), raised('free'), raised('sleeve'), raised('bare')]);

  test('passes one floating free, and flags one on a sleeve and one on a bare forearm', () => {
    expect(flagsOf(m)).toEqual(['sleeveReach:3', 'bareArm:4']);
    expect(m.views[1]?.reach).toBe(0);
  });
});

describe('a sleeve into a hand held out, from flat to straight down', () => {
  // The hand floats out from the robe's side; the sleeve leaves the shoulder, bends at an elbow and comes into the hand at `deg` below the horizontal.
  const hand = [366, 420] as const;
  const sleeve = (deg: number, cuff: boolean) => {
    const rad = (deg * Math.PI) / 180;
    const elbow = [hand[0] - 70 * Math.cos(rad), hand[1] - 70 * Math.sin(rad)] as const;
    return at({ limb: { hand, from: [[250, 300], elbow], kind: 'sleeve', cuff } });
  };
  const angles = [0, 15, 30, 45, 60, 75, 90];
  const flat = poses([
    at({ limb: { hand, kind: 'free' } }),
    ...angles.map((d) => sleeve(d, false)),
  ]);
  const cuffed = poses([
    at({ limb: { hand, kind: 'free' } }),
    ...angles.map((d) => sleeve(d, true)),
  ]);
  const reached = (m: SheetMeasure) =>
    m.flags.filter((f) => f.check === 'sleeveReach').map((f) => f.views[0]);

  test("flags the sleeve at every angle, met as flat colour or across the hand's ring", () => {
    expect(reached(flat)).toEqual([2, 3, 4, 5, 6, 7, 8]);
    expect(reached(cuffed)).toEqual([2, 3, 4, 5, 6, 7, 8]);
  });

  test('passes the hand floating free at the same place', () => {
    expect(flat.views[0]?.reach).toBe(0);
    expect(flagsOf(flat)).not.toContain('sleeveReach:1');
  });
});

describe('bare skin on the robe', () => {
  const m = poses([
    at(),
    at({ bareSkin: { kind: 'yoke', depth: 50 } }),
    at({ bareSkin: { kind: 'shoulders', depth: 50 } }),
    at({ bareSkin: { kind: 'chest', depth: 40 } }),
  ]);

  test('flags a yoke joined to the neck, two compact bare shoulders and a square patch, never a neck or a hand', () => {
    expect(flagsOf(m)).toEqual(['bareArm:2', 'bareArm:3', 'bareArm:4']);
    expect(m.views.map((v) => v.bare)).toEqual([0, 1, 2, 1]);
  });
});

describe('a hand the read cannot follow', () => {
  // A hand at rest against the robe, its ring on the robe's ink: a sleeve with its own ink would meet it the same way.
  const m = poses([at(), at({ limb: { hand: [326, 414], kind: 'free' } }), at({ handless: true })]);

  test('says a hand at rest against the body and a view with no hand are not measured for a sleeve', () => {
    expect(flagsOf(m)).toEqual([]);
    expect(unmeasuredOf(m, 2)).toEqual(['sleeveReach']);
    expect(unmeasuredOf(m, 3)).toEqual(['sleeveReach']);
    expect(unmeasuredOf(m, 1)).toEqual([]);
  });
});

describe('a hand held low beside the hem', () => {
  // Its middle under the robe's widest rows: too few of the body's side lie under it to follow a sleeve, and it is not raised.
  const m = poses([at(), at({ limb: { hand: [370, 510], kind: 'free' } })]);

  test('is said as not measured for a sleeve, never read as a hand raised', () => {
    expect(flagsOf(m)).toEqual([]);
    expect(m.unmeasured.filter((u) => u.view === 2 && u.check === 'sleeveReach')).toEqual([
      { check: 'sleeveReach', view: 2, why: "the body's side under a hand does not read" },
    ]);
  });
});
