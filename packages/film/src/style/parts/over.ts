// What lies on a garment with no line of its own: the judge's bands, two
// tabs hanging under his chin a narrow gap apart, from their top down to
// their ends, each wider at its end and splaying a little outward. They lie
// under the head and over the garment, in a paper that takes no rim. How
// they are cut is the house's (`rig/draw.ts`). Pure.

import { Schema } from 'effect';
import { decoder } from '../decode.ts';
import { Paper, Tones, unrimmed } from '../paper.ts';
import { Length, Units } from './measure.ts';

/** Bands hang from their top down to their ends, so their top lies above their ends. */
const topAboveEnds = Schema.makeFilter((b: { readonly from: number; readonly to: number }) =>
  b.from < b.to
    ? true
    : `their top (${b.from}) lies at or below their ends (${b.to}): bands hang from their top down to their ends`,
);

/** The bands: where they hang, how they are cut, their paper and the tones on it. */
const BandsPart = Schema.TaggedStruct('Bands', {
  /** Their middle, units right of the figure's: under the chin. */
  x: Units,
  /** How far each tab's inner edge lies from their middle at its top, units. */
  gap: Length,
  /** Each tab's width at its top and at its end. */
  top: Length,
  bottom: Length,
  /** How far each tab's end lies further out than its top, units. */
  splay: Units,
  /** Their top's and their ends' heights, units from the figure's origin, their top above their ends. */
  from: Units,
  to: Units,
  paper: Paper,
  /** Colour laid on them, clipped to each tab: the chin's shade across their tops. */
  tones: Schema.optionalKey(Tones),
}).check(unrimmed, topAboveEnds);
export type Bands = typeof BandsPart.Type;

/** What lies on a garment, of any kind. */
export type Over = Bands;

/** Bands, checked: their top above their ends; an ink on them is refused by InteriorInk, a rim on their paper by InnerRim. */
export const decodeOver = decoder(BandsPart, { fields: { ink: 'InteriorInk' } });

/** Two bands under the chin (the judge's). */
export const Bands = (o: Omit<Bands, '_tag'>): Bands =>
  decodeOver({ _tag: 'Bands', ...o }, 'Bands');
