// The one ear (character-design, K1): an ellipse of flat skin inside a
// traced head's outline, behind the features on the far side where the
// concept cuts it, with no ink and no rim of its own. Pure.

import { Schema } from 'effect';
import { decoder } from '../decode.ts';
import { Paper, unrimmed } from '../paper.ts';
import { Length, Point } from './measure.ts';

/** The ear: its centre in the head's frame, its half-width and half-height, its paper. */
const EarPart = Schema.TaggedStruct('Ear', {
  at: Point,
  r: Schema.Tuple([Length, Length]),
  paper: Paper,
}).check(unrimmed);
export type Ear = typeof EarPart.Type;

/** An ear, checked: an ink on it is refused by InteriorInk, a rim on its paper by InnerRim. */
export const decodeEar = decoder(EarPart, { fields: { ink: 'InteriorInk' } });

/** The ear, where the concept cuts it. */
export const Ear = (o: Omit<Ear, '_tag'>): Ear => decodeEar({ _tag: 'Ear', ...o }, 'Ear');
