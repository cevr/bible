// Kit A, the house's one face (K1, owner 2026-10-13): two eyes, two brows and
// a mouth line, placed on the head and sized, each moved by the figure's view
// model (`FACE`). A figure gives where its kit sits and how big, the marks its
// sheet draws otherwise than the kit, the face it wears at rest and where its
// eyes look; a face of any other marks is refused (KitA). Pure.

import { Schema } from 'effect';
import { decoder } from '../decode.ts';
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
  shape: Schema.optionalKey(Shape),
  rest: Schema.optionalKey(Rest),
  /** Where the eyes look at rest, units from the head's centre. */
  gaze: Point,
});
export type KitA = typeof KitAPart.Type;

/** A face, checked: a field the kit lacks is refused by KitA. */
export const decodeKit = decoder(KitAPart, { any: 'KitA' });

/** Kit A on a figure's head: where it sits, how big, its marks, its rest and its gaze. */
export const KitA = (o: Omit<KitA, '_tag'>): KitA => decodeKit({ _tag: 'KitA', ...o }, 'KitA');
