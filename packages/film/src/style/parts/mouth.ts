// A mouth thrown open where the face kit's mouth sits, wider than the kit's
// own "oh" (a gasp): the prosecutor's shout. It adds `shout`, 0..1, the open
// mouth's opacity and its height. One flat colour inside the head's outline,
// no ink and no rim. Pure.

import { Schema } from 'effect';
import { decoder } from '../decode.ts';
import { HexColour } from '../paper.ts';
import { Length } from './measure.ts';

/** An open mouth: its width and height at its widest, units, and its one colour. */
const OpenMouthPart = Schema.TaggedStruct('OpenMouth', {
  w: Length,
  h: Length,
  paper: HexColour,
});
export type OpenMouth = typeof OpenMouthPart.Type;

/** An open mouth, checked: it lies inside the head, so an ink is refused by InteriorInk and a rim by InnerRim. */
export const decodeMouth = decoder(OpenMouthPart, {
  fields: { ink: 'InteriorInk', rim: 'InnerRim' },
});

/** A mouth thrown open where the kit's mouth sits: it adds `shout`, 0 at rest. */
export const OpenMouth = (o: Omit<OpenMouth, '_tag'>): OpenMouth =>
  decodeMouth({ _tag: 'OpenMouth', ...o }, 'OpenMouth');
