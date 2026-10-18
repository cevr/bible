// What a figure wears: the garment its body is cut as, one piece in its
// paper, the papers of its states laid inside it (`states.ts`). A tunic is
// cut from its neck and hem: narrow at one, wide at the other, its sides
// bowed out, its corners rounded. How it is cut and inked is the house's
// (`rig/draw.ts`). Pure.

import { Schema } from 'effect';
import { decoder } from '../decode.ts';
import { Paper } from '../paper.ts';
import { Length, Units } from './measure.ts';

/** A tunic: its neck's and hem's heights, its half-width at each, its corners' radius, its sides' bow, its paper. */
const TunicPart = Schema.TaggedStruct('Tunic', {
  /** The neck's height, units from the feet: the tunic's top, under the head. */
  neck: Units,
  /** The hem's height, units from the feet: where the trunk breathes from. */
  hem: Units,
  half: Schema.Struct({ neck: Length, hem: Length }),
  radius: Length,
  /** How far its sides bow out at their middle, units. */
  bow: Units,
  paper: Paper,
});
export type Tunic = typeof TunicPart.Type;

/** A garment, of any kind. */
export type Garment = Tunic;

/** A garment, checked; an ink on it is refused by InteriorInk. */
export const decodeGarment = decoder(TunicPart, { fields: { ink: 'InteriorInk' } });

/** A tunic (the plain lead's). */
export const Tunic = (o: Omit<Tunic, '_tag'>): Tunic =>
  decodeGarment({ _tag: 'Tunic', ...o }, 'Tunic');
