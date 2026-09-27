// Limbs that reach: a chain of bones from a pinned base toward a target,
// solved by FABRIK (`math/ik`). Every call builds and solves a fresh chain
// from the same bent start, so a limb is a pure function of its base and
// target, and a frame draws the same arm however it was reached.

import { fabrik2 } from 'math/ik';
import type { Pt } from './ink.ts';

/**
 * Which side of the base-to-target line the joints bend to, as the frame
 * shows it (y down): `1` clockwise, `-1` anticlockwise. A joint never folds
 * through the line to the other side.
 */
export type Bend = 1 | -1;

/** How far the start pose leans each bone off the line, so the solve keeps its side. */
const START_BEND = 0.6;

/**
 * The joints of a limb, base first and hand last, whose bones keep
 * `lengths` and whose last joint lands on `target`, or points straight at it
 * when it is out of reach.
 */
export const reach = (base: Pt, target: Pt, lengths: ReadonlyArray<number>, bend: Bend): Pt[] => {
  const chain = fabrik2.createChain2();
  const heading = Math.atan2(target[1] - base[1], target[0] - base[0]);
  const first = heading + bend * START_BEND;
  lengths.forEach((length, i) => {
    // Each later bone turns back across the line, the way a bent limb does.
    const angle = i === 0 ? first : first - bend * 2 * START_BEND;
    const direction: [number, number] = [Math.cos(angle), Math.sin(angle)];
    if (i === 0) {
      const end: [number, number] = [
        base[0] + direction[0] * length,
        base[1] + direction[1] * length,
      ];
      fabrik2.addBone(chain, [base[0], base[1]], end);
      return;
    }
    // Local limits, measured from the bone before: the joint turns back
    // toward the line and never past straight.
    const joint =
      bend === 1
        ? fabrik2.setLocalJoint(fabrik2.createJoint2(), Math.PI, 0)
        : fabrik2.setLocalJoint(fabrik2.createJoint2(), 0, Math.PI);
    fabrik2.addConsecutiveBone(chain, direction, length, joint);
  });
  fabrik2.solve(chain, [target[0], target[1]]);
  return [base, ...chain.bones.map((bone): Pt => [bone.end[0], bone.end[1]])];
};
