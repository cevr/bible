// How a figure holds itself, and the numbers that move it: every stance
// leans (`lean`, radians), tilts its head about its neck (`tilt`, radians)
// and nods (`nod`, units). Standing, his feet are the figure's origin: the
// lean turns about them, and the breath lifts the trunk from its hem and the
// neck with it. Seated, the part of him above the bench is drawn and his
// body's middle at his head's height is the origin: the lean turns about his
// garment's hem (its foot, behind the bench), and the breath swells the
// garment across and lifts the neck. Pure.

import { Schema } from 'effect';
import { decoder } from '../decode.ts';
import { Length, Units } from './measure.ts';

/** A standing breath: how long it takes, in and out, and how it lifts the figure at its top. */
const StandingBreath = Schema.Struct({
  /** Seconds a breath takes, in and out. */
  period: Length,
  /** The trunk's height at the top of the breath, against its own. */
  trunk: Length,
  /** How far the neck moves with it, units (negative up). */
  neck: Units,
});

const StandingPart = Schema.TaggedStruct('Standing', { breath: StandingBreath });
export type Standing = typeof StandingPart.Type;

/** A seated breath: how long it takes, in and out, how it swells the garment and how it moves the neck. */
const SeatedBreath = Schema.Struct({
  /** Seconds a breath takes, in and out. */
  period: Length,
  /** The garment's width at the top of the breath, against its own. */
  width: Length,
  /** How far the neck moves with it, units (negative up). */
  neck: Units,
});

const SeatedPart = Schema.TaggedStruct('Seated', { breath: SeatedBreath });
export type Seated = typeof SeatedPart.Type;

/** A stance, of any kind. */
export type Stance = Standing | Seated;

/** A standing stance, checked. */
export const decodeStanding = decoder(StandingPart);

/** A seated stance, checked. */
export const decodeSeated = decoder(SeatedPart);

/** The stances. */
export const Stance = {
  /** Standing on his feet, the figure's origin. */
  Standing: (o: Omit<Standing, '_tag'>): Standing =>
    decodeStanding({ _tag: 'Standing', ...o }, 'Stance.Standing'),
  /** Seated behind what hides his feet (the judge at his bench): his body's middle at his head's height is the origin. */
  Seated: (o: Omit<Seated, '_tag'>): Seated =>
    decodeSeated({ _tag: 'Seated', ...o }, 'Stance.Seated'),
};
