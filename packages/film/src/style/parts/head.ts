// A figure's head: the skin's piece the face is laid on. A round head is an
// ellipse a hair off a circle, its face drawn on the flat paper, so the face
// turns by its marks alone and slides down the round as he bows (`faceY`).
// How each is cut, lit and rimmed is the house's (`rig/draw.ts`). Pure.

import { Schema } from 'effect';
import { decoder } from '../decode.ts';
import { Paper } from '../paper.ts';
import { Length, Units } from './measure.ts';

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

/** A head, of any kind. */
export type Head = RoundHead;

/** A head, checked; an ink on it is refused by InteriorInk (the ink is the film's). */
export const decodeHead = decoder(RoundHeadPart, { fields: { ink: 'InteriorInk' } });

/** The heads. */
export const Head = {
  /** A round head (the plain lead's): his face slides down it as he bows, so he takes `faceY`. */
  Round: (o: Omit<RoundHead, '_tag'>): RoundHead =>
    decodeHead({ _tag: 'RoundHead', ...o }, 'Head.Round'),
};
