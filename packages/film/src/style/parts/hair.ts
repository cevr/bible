// A figure's hair, cut inside its traced head's outline: one paper and the
// light on it, with no ink and no rim of its own, so the head's one line goes
// round both (`silhouette`, `rig/parts.ts`). Traced from the concept, its
// outline in the head's frame. Pure.

import { Schema } from 'effect';
import { decoder } from '../decode.ts';
import { Paper, Tones, unrimmed } from '../paper.ts';
import { Outline } from './measure.ts';

/** Traced hair: its outline as the concept cuts it, its paper, and the light on it as tones. */
const TracedHairPart = Schema.TaggedStruct('TracedHair', {
  outline: Outline,
  paper: Paper,
  /** Where the light catches it, laid as tones: a lit tuft, lighter lumps of curls. */
  tones: Schema.optionalKey(Tones),
}).check(unrimmed);
export type Hair = typeof TracedHairPart.Type;

/** Hair, checked: an ink on it is refused by InteriorInk, a rim on its paper by InnerRim. */
export const decodeHair = decoder(TracedHairPart, { fields: { ink: 'InteriorInk' } });

/** The hair. */
export const Hair = {
  /** Hair traced from the concept (the prosecutor's tuft, the judge's curls). */
  Traced: (o: Omit<Hair, '_tag'>): Hair => decodeHair({ _tag: 'TracedHair', ...o }, 'Hair.Traced'),
};
