import { describe, expect, test } from 'bun:test';
import type { Pt } from './ink.ts';
import { reach } from './ik.ts';

const ARM = [120, 110];
const SHOULDER: Pt = [74, -274];

/** Which side of the line from `a` to `b` the point `p` lies on, as the frame shows it. */
const side = (a: Pt, b: Pt, p: Pt) =>
  Math.sign((b[0] - a[0]) * (p[1] - a[1]) - (b[1] - a[1]) * (p[0] - a[0]));

const lengthsOf = (joints: ReadonlyArray<Pt>) =>
  joints.slice(1).map((p, i) => {
    const q = joints[i] ?? p;
    return Math.hypot(p[0] - q[0], p[1] - q[1]);
  });

describe('reach', () => {
  test('lands the hand on a target in reach and keeps every bone its length', () => {
    const joints = reach(SHOULDER, [200, -400], ARM, 1);
    const hand = joints.at(-1) ?? SHOULDER;
    expect(hand[0]).toBeCloseTo(200, 1);
    expect(hand[1]).toBeCloseTo(-400, 1);
    lengthsOf(joints).forEach((l, i) => expect(l).toBeCloseTo(ARM[i] ?? 0, 1));
  });

  test('bends to the side it is asked to, wherever the target sits', () => {
    const targets: Pt[] = [
      [200, -400],
      [250, -200],
      [80, -120],
      [-40, -300],
      [120, -250],
    ];
    for (const target of targets)
      for (const bend of [1, -1] as const) {
        const [base, elbow] = reach(SHOULDER, target, ARM, bend);
        expect(side(base ?? SHOULDER, target, elbow ?? SHOULDER)).toBe(bend);
      }
  });

  test('points straight at a target out of reach', () => {
    const joints = reach(SHOULDER, [74 + 600, -274], ARM, 1);
    const hand = joints.at(-1) ?? SHOULDER;
    expect(hand[0]).toBeCloseTo(74 + 230, 0);
    expect(hand[1]).toBeCloseTo(-274, 0);
  });

  test('draws the same arm for the same target, whatever came before', () => {
    const before = reach(SHOULDER, [200, -400], ARM, 1);
    reach(SHOULDER, [-100, 0], ARM, -1);
    expect(reach(SHOULDER, [200, -400], ARM, 1)).toEqual(before);
  });
});
