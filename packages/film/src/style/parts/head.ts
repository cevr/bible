// A figure's head: the skin's piece the face is laid on. A round head is an
// ellipse a hair off a circle, its face drawn on the flat paper, so the face
// turns by its marks alone and slides down the round as he bows (`faceY`). A
// traced head is its concept's outline in one view of it (a three-quarter
// head is its own trace, never a front head turned), set on the body as the
// concept sets it (carried off the body's middle, and canted where the
// concept cants it), with what is cut inside its outline (`beard.ts`,
// `hair.ts`, `ear.ts`, `mouth.ts`) and one ink line round them all. How each
// is cut, lit and rimmed is the house's (`rig/draw.ts`). Pure.

import { Schema } from 'effect';
import { decoder } from '../decode.ts';
import { Paper, Tones } from '../paper.ts';
import { Length, Outline, Units } from './measure.ts';

/** A round head: its centre's height above the feet, its half-width and half-height, the neck it turns about, its paper. */
const RoundHeadPart = Schema.TaggedStruct('RoundHead', {
  /** Its centre's height, units from the feet (negative up). */
  y: Units,
  /** Its half-width and half-height. */
  r: Schema.Tuple([Length, Length]),
  /** The neck's height, units from the feet: where the head turns (`tilt`) and sinks (`nod`) from. */
  neck: Units,
  paper: Paper,
});
export type RoundHead = typeof RoundHeadPart.Type;

/**
 * The side of a head its trace shows, each its own drawing from its own
 * concept: turned to us, three-quarters, in profile, from behind.
 */
const View = Schema.Literals(['front', 'threeQuarter', 'side', 'back']);

/** A traced head: its outline in its view, where it sits, the neck it turns about, how the concept sets it, its paper and the tones on its skin. */
const TracedHeadPart = Schema.TaggedStruct('TracedHead', {
  /** Its outline as the concept cuts it (the head's paper, under its hair), in its skull's frame: about its centre, before its cant. */
  outline: Outline,
  /** The side of the head the outline shows. */
  view: View,
  /** Its centre's height, units from the figure's origin (negative up). */
  y: Units,
  /** The neck's height, units from the origin: where the head turns (`tilt`) and sinks (`nod`) from. */
  neck: Units,
  /** How the concept sets it on the body: carried `x` units right of the body's middle, and canted `cant` radians, its crown toward screen right, where the concept cants it. */
  set: Schema.Struct({ x: Units, cant: Schema.optionalKey(Units) }),
  paper: Paper,
  /** Colour on its skin, clipped to it: the shade its hair lays on the brow, a blush. */
  tones: Schema.optionalKey(Tones),
  /**
   * Its chin, where the concept draws no line under it: `open`, the head's
   * ink runs behind its garment, so the garment's neck meets the chin by the
   * shade laid on it and no line (the RBF lead's).
   */
  chin: Schema.optionalKey(Schema.Literal('open')),
});
export type TracedHead = typeof TracedHeadPart.Type;

/** A head, of any kind. */
export type Head = RoundHead | TracedHead;

/** A round head, checked; an ink on it is refused by InteriorInk (the ink is the film's). */
const decodeRoundHead = decoder(RoundHeadPart, { fields: { ink: 'InteriorInk' } });

/** A traced head, checked; an ink on it is refused by InteriorInk. */
const decodeTracedHead = decoder(TracedHeadPart, { fields: { ink: 'InteriorInk' } });

/** A head's fields as a figure is given them: each kind's own, still to check. */
type HeadFields = typeof RoundHeadPart.Encoded | typeof TracedHeadPart.Encoded;

/** A head, checked as its kind. */
export const decodeHead = (input: HeadFields, part: string): Head =>
  input._tag === 'TracedHead' ? decodeTracedHead(input, part) : decodeRoundHead(input, part);

/** The heads. */
export const Head = {
  /** A round head (the plain lead's): his face slides down it as he bows, so he takes `faceY`. */
  Round: (o: Omit<RoundHead, '_tag'>): RoundHead =>
    decodeRoundHead({ _tag: 'RoundHead', ...o }, 'Head.Round'),
  /** A head traced from its concept in one view (the prosecutor's, the judge's, Christ's): a beard, hair, an ear and an open mouth are cut inside its outline. */
  Traced: (o: Omit<TracedHead, '_tag'>): TracedHead =>
    decodeTracedHead({ _tag: 'TracedHead', ...o }, 'Head.Traced'),
};
