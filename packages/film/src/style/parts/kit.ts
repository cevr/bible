// Kit A, the house's one face (K1, owner 2026-10-13): two eyes, two brows and
// a mouth line, placed on the head and sized, each moved by the figure's view
// model (`FACE`). A figure gives where its kit sits and how big, how far it
// turns on the head where its concept draws the face tipped, the marks its
// sheet draws otherwise than the kit, how far its eyes lean where the concept
// leans them, the face it wears at rest and where its eyes look; a face of
// any other marks is refused (KitA). Marks traced in a concept's pixels give
// the kit its place, turn and marks (`tracedKit`). Pure.

import { Schema } from 'effect';
import { decoder } from '../decode.ts';
import type { Pt } from '../rig/parts.ts';
import { Length, Point, Units } from './measure.ts';

/** The marks a figure's sheet draws otherwise than the kit (`FaceShape`, `rig/parts.ts`), in the kit's units about the face's centre. */
const Shape = Schema.Struct({
  eyes: Schema.optionalKey(Point),
  eyeY: Schema.optionalKey(Units),
  eye: Schema.optionalKey(Schema.Tuple([Length, Length])),
  roam: Schema.optionalKey(Units),
  turn: Schema.optionalKey(Units),
  turnPull: Schema.optionalKey(Units),
  brows: Schema.optionalKey(Point),
  browY: Schema.optionalKey(Units),
  browHalf: Schema.optionalKey(Length),
  brow: Schema.optionalKey(Length),
  mouth: Schema.optionalKey(Point),
  mouthHalf: Schema.optionalKey(Length),
  mouthLine: Schema.optionalKey(Length),
});

/** The face it wears at rest where it differs from the kit's own (`Expression`, `face.ts`). */
const Rest = Schema.Struct({
  browY: Schema.optionalKey(Units),
  browTilt: Schema.optionalKey(Units),
  eyes: Schema.optionalKey(Units),
  eyeW: Schema.optionalKey(Units),
  mouth: Schema.optionalKey(Units),
  mouthLine: Schema.optionalKey(Units),
  mouthOpen: Schema.optionalKey(Units),
});

const KitAPart = Schema.TaggedStruct('KitA', {
  /** The face's centre on the head, units from the head's own origin. */
  x: Units,
  y: Units,
  /** The kit's size against its own (the accused's). */
  scale: Length,
  /** Its turn on the head about its centre, radians, where the concept draws the face tipped (a head turned to us and tipped). */
  rotation: Schema.optionalKey(Units),
  /** Each eye's lean past that turn, radians (negative: its top toward screen left), where the concept leans the eyes of a turned head. */
  eyeLean: Schema.optionalKey(Units),
  shape: Schema.optionalKey(Shape),
  rest: Schema.optionalKey(Rest),
  /** Where the eyes look at rest, units from the figure's body's middle at its head's height: a round head's centre (a traced head is carried off it, by its `set`). */
  gaze: Point,
});
export type KitA = typeof KitAPart.Type;

/** A face, checked: a field the kit lacks is refused by KitA. */
export const decodeKit = decoder(KitAPart, { any: 'KitA' });

/** Kit A on a figure's head: where it sits, how big, its turn, its marks, its rest and its gaze. */
export const KitA = (o: Omit<KitA, '_tag'>): KitA => decodeKit({ _tag: 'KitA', ...o }, 'KitA');

/** A face's marks as its concept draws them, in the concept's pixels: each eye's centre and its size, each brow's ends and its stroke, the mouth's ends and its stroke. */
interface TracedMarks {
  readonly eyes: readonly [Pt, Pt];
  readonly eye: readonly [number, number];
  readonly brows: readonly [readonly [Pt, Pt], readonly [Pt, Pt]];
  readonly brow: number;
  readonly mouth: readonly [Pt, Pt];
  readonly mouthLine: number;
}

/** A concept's pixels as a figure's units: `scale` units a pixel, about the head's centre (`head`, a pixel). */
interface Panel {
  readonly scale: number;
  readonly head: Pt;
}

/** `v` to a hundredth, as the kit's numbers are written. */
const hundredth = (v: number) => +v.toFixed(2);

/**
 * Kit A's place, turn and marks for marks traced in a concept's pixels
 * (`panel` takes them to the head's units): the kit sits at the eyes'
 * middle, turned as the line through the eyes tips, each mark in that
 * turned frame, each number to a hundredth; `turn` is how far the features
 * slide after the gaze. A face's rest and gaze are its own (`KitA`).
 */
export const tracedKit = (m: TracedMarks, panel: Panel, turn: number) => {
  const [l, r] = m.eyes;
  const c: Pt = [(l[0] + r[0]) / 2, (l[1] + r[1]) / 2];
  const rotation = Math.atan2(r[1] - l[1], r[0] - l[0]);
  const [cos, sin] = [Math.cos(-rotation), Math.sin(-rotation)];
  const local = ([x, y]: Pt): Pt => {
    const [dx, dy] = [x - c[0], y - c[1]];
    return [(dx * cos - dy * sin) * panel.scale, (dx * sin + dy * cos) * panel.scale];
  };
  const mid = (a: Pt, b: Pt): Pt => [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
  const half = (a: Pt, b: Pt) => (Math.hypot(b[0] - a[0], b[1] - a[1]) / 2) * panel.scale;
  const [eyeL, eyeR] = [local(l), local(r)];
  const [browL, browR] = [local(mid(...m.brows[0])), local(mid(...m.brows[1]))];
  const mouth = local(mid(...m.mouth));
  return {
    x: hundredth((c[0] - panel.head[0]) * panel.scale),
    y: hundredth((c[1] - panel.head[1]) * panel.scale),
    scale: 1,
    rotation: hundredth(rotation),
    shape: {
      eyes: [hundredth(eyeL[0]), hundredth(eyeR[0])],
      eyeY: hundredth((eyeL[1] + eyeR[1]) / 2),
      eye: [hundredth(m.eye[0] * panel.scale), hundredth(m.eye[1] * panel.scale)],
      turn,
      brows: [hundredth(browL[0]), hundredth(browR[0])],
      browY: hundredth((browL[1] + browR[1]) / 2),
      browHalf: hundredth((half(...m.brows[0]) + half(...m.brows[1])) / 2),
      brow: hundredth(m.brow * panel.scale),
      mouth: [hundredth(mouth[0]), hundredth(mouth[1])],
      mouthHalf: hundredth(half(...m.mouth)),
      mouthLine: hundredth(m.mouthLine * panel.scale),
    },
  } as const;
};
