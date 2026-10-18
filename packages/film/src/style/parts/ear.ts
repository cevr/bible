// The ear (character-design, K1): flat skin inside a traced head's outline,
// behind the features where the concept cuts it, with no ink and no rim of
// its own. A round ear is an ellipse; a traced ear is its concept's outline;
// a head turned to us shows both, each traced, the near one on screen left.
// Pure.

import { Match, Schema } from 'effect';
import { decoder } from '../decode.ts';
import { Paper, unrimmed } from '../paper.ts';
import { Length, Outline, Point } from './measure.ts';

/** A round ear: its centre in the head's frame, its half-width and half-height, its paper. */
const RoundEarPart = Schema.TaggedStruct('RoundEar', {
  at: Point,
  r: Schema.Tuple([Length, Length]),
  paper: Paper,
}).check(unrimmed);
type RoundEar = typeof RoundEarPart.Type;

/** A traced ear: its outline in the head's frame, as the concept cuts it, and its paper. */
const TracedEarPart = Schema.TaggedStruct('TracedEar', {
  outline: Outline,
  paper: Paper,
}).check(unrimmed);
type TracedEar = typeof TracedEarPart.Type;

/** Both ears of a head turned to us: each one's outline in the head's frame, the near one on screen left, and their paper. */
const BothEarsPart = Schema.TaggedStruct('BothEars', {
  near: Outline,
  far: Outline,
  paper: Paper,
}).check(unrimmed);
type BothEars = typeof BothEarsPart.Type;

/** An ear, or the ears, of any kind. */
export type Ear = RoundEar | TracedEar | BothEars;

/** Each kind, checked: an ink on it is refused by InteriorInk, a rim on its paper by InnerRim. */
const decodeRoundEar = decoder(RoundEarPart, { fields: { ink: 'InteriorInk' } });
const decodeTracedEar = decoder(TracedEarPart, { fields: { ink: 'InteriorInk' } });
const decodeBothEars = decoder(BothEarsPart, { fields: { ink: 'InteriorInk' } });

/** An ear's fields as a figure is given them: each kind's own, still to check. */
type EarFields =
  | typeof RoundEarPart.Encoded
  | typeof TracedEarPart.Encoded
  | typeof BothEarsPart.Encoded;

/** An ear, checked as its kind. */
export const decodeEar = (input: EarFields, part: string): Ear =>
  Match.value(input).pipe(
    Match.withReturnType<Ear>(),
    Match.tagsExhaustive({
      RoundEar: (ear) => decodeRoundEar(ear, part),
      TracedEar: (ear) => decodeTracedEar(ear, part),
      BothEars: (ears) => decodeBothEars(ears, part),
    }),
  );

/** The ears, where the concept cuts them. */
export const Ear = {
  /** A round ear (the prosecutor's, the judge's). */
  Round: (o: Omit<RoundEar, '_tag'>): RoundEar =>
    decodeRoundEar({ _tag: 'RoundEar', ...o }, 'Ear.Round'),
  /** An ear traced from its concept (Christ's, in His hair). */
  Traced: (o: Omit<TracedEar, '_tag'>): TracedEar =>
    decodeTracedEar({ _tag: 'TracedEar', ...o }, 'Ear.Traced'),
  /** Both ears of a head turned to us, each traced (Christ's, turned to us). */
  Both: (o: Omit<BothEars, '_tag'>): BothEars =>
    decodeBothEars({ _tag: 'BothEars', ...o }, 'Ear.Both'),
};
