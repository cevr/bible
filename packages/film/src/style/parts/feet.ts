// What a figure stands on, under its garment's hem. Stub legs are the plain
// lead's: each straight down from under the hem, its foot a half circle. How
// they are cut is the house's (`rig/draw.ts`). Pure.

import { Schema } from 'effect';
import { decoder } from '../decode.ts';
import { Paper } from '../paper.ts';
import { Length } from './measure.ts';

/** Stub legs: each one's middle either side of the figure's, its half-width (its foot's radius), their paper. */
const StubLegsPart = Schema.TaggedStruct('StubLegs', {
  /** Each leg's middle, units either side of the figure's. */
  x: Length,
  /** Each leg's half-width, and its round foot's radius. */
  r: Length,
  paper: Paper,
});
export type StubLegs = typeof StubLegsPart.Type;

/** Feet, of any kind. */
export type Feet = StubLegs;

/** Feet, checked; an ink on them is refused by InteriorInk. */
export const decodeFeet = decoder(StubLegsPart, { fields: { ink: 'InteriorInk' } });

/** Stub legs (the plain lead's). */
export const StubLegs = (o: Omit<StubLegs, '_tag'>): StubLegs =>
  decodeFeet({ _tag: 'StubLegs', ...o }, 'StubLegs');
