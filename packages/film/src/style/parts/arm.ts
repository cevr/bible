// A figure's arm in its sleeve to the wrist, traced from its concept in the
// figure's frame: the sleeve's outline in the pose it is traced in, its paper
// and the colour laid on it. The host swings it by the figure's number for
// its side (`nearArm` or `farArm`, radians, 0 the pose it is traced in) about
// a point inside the garment nearer the sleeve than the garment's edge
// (`pivot`), so the sleeve's root stays under the garment's paper however it
// swings. It lies behind the garment's paper, cut in one outline with it, so
// the sleeve grows out of the garment with no line where it leaves it; an arm
// that lies on the garment is a tone of it. The host draws the figure's circle
// hand at its cuff (`armHand`), where the arm says its hand is: past its
// sleeve's end, the hand's circle touching the sleeve, so a hand ends its
// sleeve (the owner's sleeves, look ledger, 2026-10-18; a figure refuses a
// hand anywhere else). How it is cut and drawn is the house's
// (`rig/draw.ts`). Pure.

import { Schema } from 'effect';
import { decoder } from '../decode.ts';
import { GarmentTones, Paper } from '../paper.ts';
import type { Pt } from '../rig/parts.ts';
import { Outline, Point } from './measure.ts';

/** An arm: where it turns, its turn at rest, its sleeve's outline, its paper and the colour on it. */
const ArmPart = Schema.TaggedStruct('Arm', {
  /**
   * Where it turns, units from the figure's origin: a point inside its
   * garment nearer its sleeve than the garment's edge (a figure refuses any
   * other).
   */
  pivot: Point,
  /** Its turn at rest, radians from the pose it is traced in: its number's value at rest. */
  rest: Schema.Finite,
  /** Its sleeve to the wrist in the pose it is traced in, units from the figure's origin. */
  outline: Outline,
  /**
   * Its hand's centre in the pose it is traced in, units from the figure's
   * origin: past its sleeve's end, as far from the pivot as any point of the
   * sleeve or farther, and its circle touching the sleeve (a figure refuses
   * any other).
   */
  hand: Point,
  paper: Paper,
  /** Colour laid on it with no line of its own, clipped to it, in order: the light on it, its cuff's shade, the skin past its cuff (marked `skin`). */
  tones: Schema.optionalKey(GarmentTones),
});
export type Arm = typeof ArmPart.Type;

/**
 * An arm bent at its elbow: its upper sleeve turns about its shoulder
 * (`pivot`) by its side's number (`nearArm`, `farArm`), and its forearm's
 * sleeve turns about its elbow by `nearElbow` or `farElbow`, each radians
 * from the pose it is traced in. It lies on its garment's paper, cut in one
 * outline with it, so no line runs where the arm crosses the garment; a
 * shade laid on the sleeve shows its edge there. Its hand lies past its
 * forearm's end.
 */
const JointedArmPart = Schema.TaggedStruct('JointedArm', {
  /** Where the upper sleeve turns, units from the figure's origin: a point inside the garment nearer the sleeve than the garment's edge. */
  pivot: Point,
  /** The upper sleeve's turn at rest, radians from the pose it is traced in. */
  rest: Schema.Finite,
  /** The upper sleeve from the shoulder past the elbow, in the pose it is traced in, units from the figure's origin. */
  outline: Outline,
  /** Where the forearm turns: a point inside both sleeves, so the joint stays covered however it bends. */
  elbow: Point,
  /** The forearm's turn at rest about the elbow, radians from the pose it is traced in. */
  bend: Schema.Finite,
  /** The forearm's sleeve from the elbow to the wrist, in the pose it is traced in. */
  forearm: Outline,
  /** Its hand's centre in the pose it is traced in: past the forearm's end, as far from the elbow as any point of it or farther, its circle touching it. */
  hand: Point,
  paper: Paper,
  /** Colour laid on the upper sleeve, clipped to it: the shade along its edge on the garment, the light on it. */
  tones: Schema.optionalKey(GarmentTones),
  /** Colour laid on the forearm's sleeve, clipped to it: its shade, its cuff, the skin past the cuff (marked `skin`). */
  forearmTones: Schema.optionalKey(GarmentTones),
});
export type JointedArm = typeof JointedArmPart.Type;

/** An arm of either kind: a sleeve that swings whole, behind its garment, or one bent at its elbow on it. */
export type AnyArm = Arm | JointedArm;

/** An arm's side: the near one (screen left) or the far one, in the order the house makes them. */
export const ARM_SIDES = ['near', 'far'] as const;
export type ArmSide = (typeof ARM_SIDES)[number];

/** An arm, checked: an ink on it is refused by InteriorInk. */
const decodeWholeArm = decoder(ArmPart, { fields: { ink: 'InteriorInk' } });

/** A jointed arm, checked: an ink on it is refused by InteriorInk. */
const decodeJointedArm = decoder(JointedArmPart, { fields: { ink: 'InteriorInk' } });

/** An arm's fields as a figure is given them: each kind's own, still to check. */
type ArmFields = typeof ArmPart.Encoded | typeof JointedArmPart.Encoded;

/** An arm, checked as its kind. */
export const decodeArm = (input: ArmFields, part: string): AnyArm =>
  input._tag === 'JointedArm' ? decodeJointedArm(input, part) : decodeWholeArm(input, part);

/** An arm in its sleeve (the farmer's far arm, which the host swings up to the rain). */
export const Arm = (o: Omit<Arm, '_tag'>): Arm => decodeWholeArm({ _tag: 'Arm', ...o }, 'Arm');

/** An arm bent at its elbow, on its garment (RBF's lead's arms, which reach where the host asks). */
export const JointedArm = (o: Omit<JointedArm, '_tag'>): JointedArm =>
  decodeJointedArm({ _tag: 'JointedArm', ...o }, 'JointedArm');

/** `p` turned `by` radians about `about`. */
const turned = (p: Pt, about: Pt, by: number): Pt => {
  const [dx, dy] = [p[0] - about[0], p[1] - about[1]];
  const [cos, sin] = [Math.cos(by), Math.sin(by)];
  return [about[0] + dx * cos - dy * sin, about[1] + dx * sin + dy * cos];
};

/**
 * Where `arm`'s hand's centre lies with its numbers at `turn` and, on a
 * jointed arm, `bend` (radians; 0 the pose it is traced in): its traced
 * hand turned about the elbow by `bend`, then about the pivot by `turn`.
 */
export const armHand = (arm: AnyArm, turn: number, bend = 0): Pt =>
  arm._tag === 'Arm'
    ? turned(arm.hand, arm.pivot, turn)
    : turned(turned(arm.hand, arm.elbow, bend), arm.pivot, turn);

/** An angle brought within half a turn either way of 0. */
const within = (a: number) => Math.atan2(Math.sin(a), Math.cos(a));

/** A reach's numbers: the arm's turn and bend, and where its hand then lies. */
type Reach = { readonly turn: number; readonly bend: number; readonly hand: Pt };

/**
 * The numbers that take a jointed arm's hand to `target`, units from the
 * figure's origin, and where its hand then lies: at `target` when the arm
 * reaches it, else as near as it reaches along the line to it. Of the two
 * elbows that reach it, the arm bends with the one on the side of that line
 * its hand hangs on at rest, so a reach out from rest keeps one elbow all
 * the way; when the line runs through its hand at rest, the one out from
 * the figure's middle (the side its shoulder lies on). Pure.
 */
export const armReach = (arm: JointedArm, target: Pt): Reach => {
  const [s, e, h] = [arm.pivot, arm.elbow, arm.hand];
  const upper = Math.hypot(e[0] - s[0], e[1] - s[1]);
  const fore = Math.hypot(h[0] - e[0], h[1] - e[1]);
  const [dx, dy] = [target[0] - s[0], target[1] - s[1]];
  const span = Math.hypot(dx, dy);
  // Held inside what the arm spans, from folded shut to straight.
  const d = Math.min(upper + fore, Math.max(Math.abs(upper - fore), span));
  const toward = Math.atan2(dy, dx);
  // The elbow's angle off the line to the target, its cosine held within one
  // so a straight or a shut arm, which rounding can carry past, opens by none.
  const cosine = d === 0 ? 0 : (upper * upper + d * d - fore * fore) / (2 * upper * d);
  const open = Math.acos(Math.min(1, Math.max(-1, cosine)));
  const out = Math.sign(s[0]) || 1;
  const elbowAt = (a: number): Pt => [s[0] + upper * Math.cos(a), s[1] + upper * Math.sin(a)];
  const [a1, a2] = [toward + open, toward - open];
  // Which side of the line to the target a point lies on.
  const side = (p: Pt) => dx * (p[1] - s[1]) - dy * (p[0] - s[0]);
  const rest = Math.sign(side(h));
  const [e1, e2] = [elbowAt(a1), elbowAt(a2)];
  const a =
    rest === 0 ? ((e1[0] - e2[0]) * out >= 0 ? a1 : a2) : Math.sign(side(e1)) === rest ? a1 : a2;
  const turn = within(a - Math.atan2(e[1] - s[1], e[0] - s[0]));
  const elbow = elbowAt(a);
  const reach: Pt = [s[0] + (dx / (span || 1)) * d, s[1] + (dy / (span || 1)) * d];
  const forearm = Math.atan2(reach[1] - elbow[1], reach[0] - elbow[0]);
  const bend = within(forearm - Math.atan2(h[1] - e[1], h[0] - e[0]) - turn);
  return { turn, bend, hand: armHand(arm, turn, bend) };
};
