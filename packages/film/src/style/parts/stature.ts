// A figure's height, by the rule it follows (character-design 3). The plain
// lead keeps his own proportions: about 2.6 heads tall, about 0.88 of
// Christ's height (2.3). Pure.

import { Schema } from 'effect';
import { decoder } from '../decode.ts';

const PlainLeadPart = Schema.TaggedStruct('PlainLead', {});
type PlainLead = typeof PlainLeadPart.Type;

/** A stature, of any kind. */
export type Stature = PlainLead;

/** A stature, checked. */
export const decodeStature = decoder(PlainLeadPart);

/** The statures. */
export const Stature = {
  /** The plain lead's own (character-design 2.3), in every film he leads. */
  PlainLead: (): PlainLead => decodeStature({ _tag: 'PlainLead' }, 'Stature.PlainLead'),
};
