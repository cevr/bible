// A figure's beard, cut inside its traced head's outline, and the lower lip
// cut in it under the mouth line: each one flat paper, or one paper and the
// light on it as tones, with no ink and no rim of its own, so the head's one
// line goes round them all (`silhouette`, `rig/parts.ts`). The mouth is drawn
// in the beard, so on a bearded head the face kit lies over every part cut
// from it (`rig/draw.ts`). Traced from the concept, in the head's frame.
// Pure.

import { Schema } from 'effect';
import { decoder } from '../decode.ts';
import { Paper, Tones, unrimmed } from '../paper.ts';
import { Outline } from './measure.ts';

/** The lower lip in a beard, under the mouth line: its outline and its paper. */
const Lip = Schema.Struct({ outline: Outline, paper: Paper }).check(unrimmed);

/** A beard: its outline as the concept cuts it, its paper, the light on it as tones, and the lip cut in it. */
const BeardPart = Schema.TaggedStruct('Beard', {
  outline: Outline,
  paper: Paper,
  /** Where the light catches it, laid as tones. */
  tones: Schema.optionalKey(Tones),
  lip: Schema.optionalKey(Lip),
}).check(unrimmed);
export type Beard = typeof BeardPart.Type;

/** A beard, checked: an ink on it or its lip is refused by InteriorInk, a rim on either's paper by InnerRim. */
export const decodeBeard = decoder(BeardPart, { fields: { ink: 'InteriorInk' } });

/** A beard traced from the concept (Christ's, the farmer's), and the lip in it. */
export const Beard = (o: Omit<Beard, '_tag'>): Beard =>
  decodeBeard({ _tag: 'Beard', ...o }, 'Beard');
