// A figure's headcloth, cut inside its traced head's outline: the cloth, the
// band bound round it and the cloth's dark edge where it turns down the
// cheek, each one paper (the band and the edge with the colour on them as
// tones), with no ink and no rim of its own, so the head's one line goes
// round them all (`silhouette`, `rig/parts.ts`). The band lies over the edge,
// the edge over the cloth. Traced from the concept, in the head's frame.
// Pure.

import { Schema } from 'effect';
import { decoder } from '../decode.ts';
import { Paper, Tones, unrimmed } from '../paper.ts';
import { Outline } from './measure.ts';

/** The band bound round the cloth: its outline, its paper, and the light on it as tones. */
const Band = Schema.Struct({
  outline: Outline,
  paper: Paper,
  tones: Schema.optionalKey(Tones),
}).check(unrimmed);

/** The cloth's edge where it turns down the cheek: its outline, its paper, and the colour on it as tones (the farmer's browner above his cheek). */
const Edge = Schema.Struct({
  outline: Outline,
  paper: Paper,
  tones: Schema.optionalKey(Tones),
}).check(unrimmed);

/** A headcloth: the cloth's outline as the concept cuts it, its paper, the band bound round it and its edge. */
const HeadclothPart = Schema.TaggedStruct('Headcloth', {
  outline: Outline,
  paper: Paper,
  band: Schema.optionalKey(Band),
  edge: Schema.optionalKey(Edge),
}).check(unrimmed);
export type Headcloth = typeof HeadclothPart.Type;

/** A headcloth, checked: an ink on it, its band or its edge is refused by InteriorInk, a rim on any one's paper by InnerRim. */
export const decodeHeadcloth = decoder(HeadclothPart, { fields: { ink: 'InteriorInk' } });

/** A headcloth traced from the concept (the farmer's), with its band and its edge. */
export const Headcloth = (o: Omit<Headcloth, '_tag'>): Headcloth =>
  decodeHeadcloth({ _tag: 'Headcloth', ...o }, 'Headcloth');
