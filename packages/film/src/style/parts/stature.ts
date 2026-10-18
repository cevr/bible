// A figure's height, by the rule it follows (character-design 3). The plain
// lead keeps his own proportions: about 2.6 heads tall, about 0.88 of
// Christ's height (2.3). A member of the cast stands in the cast's one
// height band, the court's canon: the host sets each one's height in it
// (`court-cast.ts`), so the figure names the rule and no number of its own.
// Pure.

import { Schema } from 'effect';
import { decoder } from '../decode.ts';

const PlainLeadPart = Schema.TaggedStruct('PlainLead', {});
type PlainLead = typeof PlainLeadPart.Type;

const CanonPart = Schema.TaggedStruct('Canon', {});
type Canon = typeof CanonPart.Type;

/** A stature, of any kind. */
export type Stature = PlainLead | Canon;

/** The plain lead's stature, checked. */
const decodePlainLead = decoder(PlainLeadPart);

/** The canon's stature, checked. */
const decodeCanon = decoder(CanonPart);

/** A stature's fields as a figure is given them: each kind's own, still to check. */
type StatureFields = typeof PlainLeadPart.Encoded | typeof CanonPart.Encoded;

/** A stature, checked as its kind. */
export const decodeStature = (input: StatureFields, part: string): Stature =>
  input._tag === 'Canon' ? decodeCanon(input, part) : decodePlainLead(input, part);

/** The statures. */
export const Stature = {
  /** The plain lead's own (character-design 2.3), in every film he leads. */
  PlainLead: (): PlainLead => decodePlainLead({ _tag: 'PlainLead' }, 'Stature.PlainLead'),
  /** In the cast's height band (the court's canon), where the host stands him. */
  Canon: (): Canon => decodeCanon({ _tag: 'Canon' }, 'Stature.Canon'),
};
