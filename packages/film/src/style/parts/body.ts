// What a figure wears: the garment its body is cut as, one piece in its
// paper, the papers of its states laid inside it (`states.ts`) and what lies
// on it with no line of its own (`over.ts`). A tunic is cut from its neck
// and hem: narrow at one, wide at the other, its sides bowed out, its corners
// rounded. A cut robe is its corners, each rounded by its own radius, down to
// its hem. How each is cut and inked is the house's (`rig/draw.ts`). Pure.

import { Schema } from 'effect';
import { decoder } from '../decode.ts';
import { Paper } from '../paper.ts';
import { Length, Outline, Units } from './measure.ts';

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

/** A robe cut from its corners: one radius rounds them all, or each corner takes its own, in turn. */
const oneRadiusOrEach = Schema.makeFilter(
  (robe: { readonly corners: ReadonlyArray<unknown>; readonly radii: ReadonlyArray<unknown> }) =>
    robe.radii.length === 1 || robe.radii.length === robe.corners.length
      ? true
      : `${robe.radii.length} radii for ${robe.corners.length} corners: give one, or one for each`,
);

/** A cut robe: its corners, their radii, its hem's height, its paper. */
const CutRobePart = Schema.TaggedStruct('CutRobe', {
  /** Its corners, clockwise from the left of its neck, units from the figure's origin. */
  corners: Outline,
  radii: Schema.Array(Length).check(Schema.isMinLength(1)),
  /**
   * Its hem's height, units from the origin: where a standing figure's
   * trunk breathes from, and where a seated figure's lean turns (the robe's
   * foot, behind his bench).
   */
  hem: Units,
  paper: Paper,
}).check(oneRadiusOrEach);
type CutRobe = typeof CutRobePart.Type;

/** A garment, of any kind. */
export type Garment = Tunic | CutRobe;

/** A tunic, checked; an ink on it is refused by InteriorInk. */
const decodeTunic = decoder(TunicPart, { fields: { ink: 'InteriorInk' } });

/** A cut robe, checked; an ink on it is refused by InteriorInk. */
const decodeCutRobe = decoder(CutRobePart, { fields: { ink: 'InteriorInk' } });

/** A garment's fields as a figure is given them: each kind's own, still to check. */
type GarmentFields = typeof TunicPart.Encoded | typeof CutRobePart.Encoded;

/** A garment, checked as its kind. */
export const decodeGarment = (input: GarmentFields, part: string): Garment =>
  input._tag === 'CutRobe' ? decodeCutRobe(input, part) : decodeTunic(input, part);

/** A tunic (the plain lead's). */
export const Tunic = (o: Omit<Tunic, '_tag'>): Tunic =>
  decodeTunic({ _tag: 'Tunic', ...o }, 'Tunic');

/** The robes. */
export const Robe = {
  /** A robe cut from its corners (the prosecutor's, the judge's). */
  Cut: (o: Omit<CutRobe, '_tag'>): CutRobe => decodeCutRobe({ _tag: 'CutRobe', ...o }, 'Robe.Cut'),
};
