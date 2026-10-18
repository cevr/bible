// A figure's arm in its sleeve to the wrist, traced from its concept in the
// figure's frame: the sleeve's outline in the pose it is traced in, its paper
// and the colour laid on it. The host swings it by the figure's number for
// its side (`nearArm` or `farArm`, radians, 0 the pose it is traced in) about
// a point inside the garment (`pivot`), so the sleeve's root stays under the
// garment's paper however it swings. It lies behind the garment's paper, cut
// in one outline with it, so the sleeve grows out of the garment with no line
// where it leaves it; an arm that lies on the garment is a tone of it. The
// host draws the figure's circle hand at its cuff: a hand ends its sleeve
// (the owner's sleeves, look ledger, 2026-10-18). How it is cut and drawn is
// the house's (`rig/draw.ts`). Pure.

import { Schema } from 'effect';
import { decoder } from '../decode.ts';
import { Paper, Tones } from '../paper.ts';
import { Outline, Point } from './measure.ts';

/** An arm: where it turns, its turn at rest, its sleeve's outline, its paper and the colour on it. */
const ArmPart = Schema.TaggedStruct('Arm', {
  /** Where it turns, units from the figure's origin: a point inside its garment. */
  pivot: Point,
  /** Its turn at rest, radians from the pose it is traced in: its number's value at rest. */
  rest: Schema.Finite,
  /** Its sleeve to the wrist in the pose it is traced in, units from the figure's origin. */
  outline: Outline,
  paper: Paper,
  /** Colour laid on it with no line of its own, clipped to it, in order: the light on it, its cuff's shade. */
  tones: Schema.optionalKey(Tones),
});
export type Arm = typeof ArmPart.Type;

/** An arm's side: the near one (screen left) or the far one, in the order the house makes them. */
export const ARM_SIDES = ['near', 'far'] as const;
export type ArmSide = (typeof ARM_SIDES)[number];

/** An arm, checked: an ink on it is refused by InteriorInk. */
export const decodeArm = decoder(ArmPart, { fields: { ink: 'InteriorInk' } });

/** An arm in its sleeve (the farmer's far arm, which the host swings up to the rain). */
export const Arm = (o: Omit<Arm, '_tag'>): Arm => decodeArm({ _tag: 'Arm', ...o }, 'Arm');
