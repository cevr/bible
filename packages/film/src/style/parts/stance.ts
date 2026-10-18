// How a figure holds itself, and the numbers that move it: every stance
// leans (`lean`, radians), tilts its head about its neck (`tilt`, radians)
// and nods (`nod`, units). Standing, the lean turns about the feet and the
// breath lifts the trunk from its hem and the neck with it. Pure.

import { Schema } from 'effect';
import { decoder } from '../decode.ts';
import { Length, Units } from './measure.ts';

/** A breath: how long it takes, in and out, and how it lifts the figure at its top. */
const Breath = Schema.Struct({
  /** Seconds a breath takes, in and out. */
  period: Length,
  /** The trunk's height at the top of the breath, against its own. */
  trunk: Length,
  /** How far the neck moves with it, units (negative up). */
  neck: Units,
});

const StandingPart = Schema.TaggedStruct('Standing', { breath: Breath });
export type Standing = typeof StandingPart.Type;

/** A stance, of any kind. */
export type Stance = Standing;

/** A stance, checked. */
export const decodeStance = decoder(StandingPart);

/** The stances. */
export const Stance = {
  /** Standing on his feet, the figure's origin. */
  Standing: (o: Omit<Standing, '_tag'>): Standing =>
    decodeStance({ _tag: 'Standing', ...o }, 'Stance.Standing'),
};
