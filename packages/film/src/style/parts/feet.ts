// What a figure stands on. Stub legs are the plain lead's: each straight down
// from under the hem, its foot a half circle. Shoes are the prosecutor's:
// each a dome on a flat sole, set under the hem's corners with the toes out,
// the near one on screen left, each lit down one edge so its sole stays dark.
// How they are cut is the house's (`rig/draw.ts`, `rig/shapes.ts`). Pure.

import { Schema } from 'effect';
import { decoder } from '../decode.ts';
import { HexColour, Paper } from '../paper.ts';
import { SHOE_POINTS } from '../rig/shapes.ts';
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

/** A point of the shoe's outline, by its place in it. */
const ShoePoint = Schema.Int.check(Schema.isBetween({ minimum: 0, maximum: SHOE_POINTS - 1 }));

/** The light down a shoe's lit edge: its colour, laid along the outline's points `from` to `to`, `depth` units in at its deepest (`shoeLight`). */
const ShoeLight = Schema.Struct({
  color: HexColour,
  from: ShoePoint,
  to: ShoePoint,
  depth: Length,
});

/** A light that runs from a point to another. */
const runs = Schema.makeFilter((light: { readonly from: number; readonly to: number }) =>
  light.from === light.to ? `its light runs from point ${light.from} to itself` : true,
);

/** One shoe: its paper, and the light down its lit edge. */
const Shoe = Schema.Struct({ paper: Paper, light: ShoeLight.check(runs) });

/** Shoes: each one's middle either side of the figure's, their size, and each one's paper and light. */
const ShoesPart = Schema.TaggedStruct('Shoes', {
  /** Each shoe's middle, units either side of the figure's. */
  x: Length,
  /** Each shoe's width and height under its ink. */
  w: Length,
  h: Length,
  /** The near shoe, on screen left, its toe out to the left; the far shoe, on screen right. */
  near: Shoe,
  far: Shoe,
});
export type Shoes = typeof ShoesPart.Type;

/** Feet, of any kind. */
export type Feet = StubLegs | Shoes;

/** Stub legs, checked; an ink on them is refused by InteriorInk. */
const decodeStubLegs = decoder(StubLegsPart, { fields: { ink: 'InteriorInk' } });

/** Shoes, checked; an ink on them is refused by InteriorInk. */
const decodeShoes = decoder(ShoesPart, { fields: { ink: 'InteriorInk' } });

/** Feet's fields as a figure is given them: each kind's own, still to check. */
type FeetFields = typeof StubLegsPart.Encoded | typeof ShoesPart.Encoded;

/** Feet, checked as their kind. */
export const decodeFeet = (input: FeetFields, part: string): Feet =>
  input._tag === 'Shoes' ? decodeShoes(input, part) : decodeStubLegs(input, part);

/** Stub legs (the plain lead's). */
export const StubLegs = (o: Omit<StubLegs, '_tag'>): StubLegs =>
  decodeStubLegs({ _tag: 'StubLegs', ...o }, 'StubLegs');

/** Shoes (the prosecutor's). */
export const Shoes = (o: Omit<Shoes, '_tag'>): Shoes =>
  decodeShoes({ _tag: 'Shoes', ...o }, 'Shoes');
