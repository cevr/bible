// The story's states a garment takes, each a view-model number the host
// moves: a stain soaked into it (`stain`, 1 at rest: he comes in stained), and
// the white robe he is given over it (`robe`, 0 at rest). They lie over the
// garment in one order by kind, the given robe over the stain over his own
// garment, whatever order they are written in. A given robe takes a paper and
// nothing else (character-design 2.3: "his tunic turns white and nothing else
// changes"). Pure.

import { Schema } from 'effect';
import { decoder } from '../decode.ts';
import { HexColour, Paper } from '../paper.ts';
import { Length, Point, Share } from './measure.ts';

/** A stain: where its middle sits, its size, its soaked edge, its seed and its one colour. */
const StainPart = Schema.TaggedStruct('Stain', {
  /** Its middle on the garment, units from the feet. */
  at: Point,
  /** Its half-width and half-height. */
  r: Schema.Tuple([Length, Length]),
  /** Its soaked edge: rings round the blot, inner first, each its size against the blot and its opacity. */
  soak: Schema.Array(Schema.Tuple([Length, Share])),
  /** The seed every outline of it wanders by, so its rings nest into one edge. */
  seed: Schema.Int,
  /** Its one flat colour: no crease, no ink, no rim. */
  paper: HexColour,
});
export type Stain = typeof StainPart.Type;

/** The robe he is given: his garment's outline again, in its paper. */
const GivenRobePart = Schema.TaggedStruct('GivenRobe', { paper: Paper });
export type GivenRobe = typeof GivenRobePart.Type;

/** A state, of any kind. */
export type State = Stain | GivenRobe;

/** A stain, checked: it lies inside the garment, so an ink is refused by InteriorInk and a rim by InnerRim. */
const decodeStain = decoder(StainPart, { fields: { ink: 'InteriorInk', rim: 'InnerRim' } });

/** A given robe, checked; an ink on it is refused by InteriorInk. */
const decodeGivenRobe = decoder(GivenRobePart, { fields: { ink: 'InteriorInk' } });

/** A state's fields as a figure is given them: each kind's own, still to check. */
type StateFields = typeof StainPart.Encoded | typeof GivenRobePart.Encoded;

/** A state, checked as its kind. */
export const decodeState = (input: StateFields, part: string): State =>
  input._tag === 'GivenRobe' ? decodeGivenRobe(input, part) : decodeStain(input, part);

/** A stain soaked into the garment (Isa 1:18): it adds `stain`, 1 at rest. */
export const Stain = (o: Omit<Stain, '_tag'>): Stain =>
  decodeStain({ _tag: 'Stain', ...o }, 'Stain');

/** The white robe he is given over his own garment, in `paper`: it adds `robe`, 0 at rest. */
export const GivenRobe = (paper: Paper): GivenRobe =>
  decodeGivenRobe({ _tag: 'GivenRobe', paper }, 'GivenRobe');
