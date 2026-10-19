// What a figure wears: the garment its body is cut as, one piece in its
// paper, the papers of its states laid inside it (`states.ts`) and what lies
// on it with no line of its own (`over.ts`). A tunic is cut from its neck
// down to its hem: narrow at one, wide at the other, its sides bowed out, its
// corners rounded. A cut robe is its corners, each rounded by its own radius,
// down to its hem; a traced robe is its concept's outline, as the concept
// cuts it. On a robe lies the colour laid on it, clipped to it (a sash, a
// sleeve, a vest, the shade past them, the skin in its neckline). How each is
// cut and inked is the house's (`rig/draw.ts`). Pure.

import { Match, Schema } from 'effect';
import { decoder } from '../decode.ts';
import { Paper, Tones } from '../paper.ts';
import { Corners, Length, Outline, Units, oneRadiusOrEach } from './measure.ts';

/** A tunic is cut from its neck down to its hem, so its neck lies above its hem. */
const neckAboveHem = Schema.makeFilter((t: { readonly neck: number; readonly hem: number }) =>
  t.neck < t.hem
    ? true
    : `its neck (${t.neck}) lies at or below its hem (${t.hem}): a tunic is cut from its neck down to its hem`,
);

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
}).check(neckAboveHem);
export type Tunic = typeof TunicPart.Type;

/** A cut robe: its corners, their radii, its hem's height, its paper and the colour on it. */
const CutRobePart = Schema.TaggedStruct('CutRobe', {
  /** Its corners, clockwise from the left of its neck, units from the figure's origin. */
  corners: Corners,
  radii: Schema.Array(Length).check(Schema.isMinLength(1)),
  /**
   * Its hem's height, units from the origin: where a standing figure's
   * trunk breathes from, and where a seated figure's lean turns (the robe's
   * foot, behind his bench).
   */
  hem: Units,
  paper: Paper,
  /** Colour laid on it with no line of its own, clipped to it, in order: a sash, the shade past it, the skin in its neckline. */
  tones: Schema.optionalKey(Tones),
}).check(oneRadiusOrEach);
type CutRobe = typeof CutRobePart.Type;

/** A traced robe: its outline as the concept cuts it, its hem's height, its paper and the colour on it. */
const TracedRobePart = Schema.TaggedStruct('TracedRobe', {
  /** Its outline, units from the figure's origin, as the concept cuts it. */
  outline: Outline,
  /** Its hem's height, units from the origin: where a standing figure's trunk breathes from, and where a seated figure's lean turns. */
  hem: Units,
  paper: Paper,
  /** Colour laid on it with no line of its own, clipped to it, in order: a sleeve that lies on it, a fold's shade, a vest, the skin in its neckline. */
  tones: Schema.optionalKey(Tones),
});
type TracedRobe = typeof TracedRobePart.Type;

/** A garment, of any kind. */
export type Garment = Tunic | CutRobe | TracedRobe;

/** Each kind, checked: an ink on it is refused by InteriorInk. */
const decodeTunic = decoder(TunicPart, { fields: { ink: 'InteriorInk' } });
const decodeCutRobe = decoder(CutRobePart, { fields: { ink: 'InteriorInk' } });
const decodeTracedRobe = decoder(TracedRobePart, { fields: { ink: 'InteriorInk' } });

/** A garment's fields as a figure is given them: each kind's own, still to check. */
type GarmentFields =
  | typeof TunicPart.Encoded
  | typeof CutRobePart.Encoded
  | typeof TracedRobePart.Encoded;

/** A garment, checked as its kind. */
export const decodeGarment = (input: GarmentFields, part: string): Garment =>
  Match.value(input).pipe(
    Match.withReturnType<Garment>(),
    Match.tagsExhaustive({
      Tunic: (tunic) => decodeTunic(tunic, part),
      CutRobe: (robe) => decodeCutRobe(robe, part),
      TracedRobe: (robe) => decodeTracedRobe(robe, part),
    }),
  );

/** A tunic (the plain lead's). */
export const Tunic = (o: Omit<Tunic, '_tag'>): Tunic =>
  decodeTunic({ _tag: 'Tunic', ...o }, 'Tunic');

/** The robes. */
export const Robe = {
  /** A robe cut from its corners (the prosecutor's, the judge's, Christ's). */
  Cut: (o: Omit<CutRobe, '_tag'>): CutRobe => decodeCutRobe({ _tag: 'CutRobe', ...o }, 'Robe.Cut'),
  /** A robe traced from its concept (the farmer's tunic, his near sleeve and his vest laid on it). */
  Traced: (o: Omit<TracedRobe, '_tag'>): TracedRobe =>
    decodeTracedRobe({ _tag: 'TracedRobe', ...o }, 'Robe.Traced'),
};
