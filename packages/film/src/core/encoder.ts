// Which H.264 encoder a render uses, as data. The page decides once, before
// it draws a frame (`chooseEncoder`, player/encode.ts): the hardware encoder
// where the browser has one (the Mac's GPU), else the browser's software
// encoder (a Linux box with no GPU encoder). The renderer hands that one
// choice to every page, so every chunk of a render is encoded alike: the
// chunks are joined without re-encoding.

import { Schema } from 'effect';

/** The GPU's encoder: quantizer rate control, at most 14 at once (tools/render-plan.ts). */
export const Hardware = Schema.TaggedStruct('Hardware', {});
/** The browser's software encoder (OpenH264 in Chromium): bitrate control, one a core. */
export const Software = Schema.TaggedStruct('Software', {});
/** Neither encodes the film here, and why. */
export const NoEncoder = Schema.TaggedStruct('Missing', { reason: Schema.String });

/** An encoder a render can use. */
export const Encoder = Schema.Union([Hardware, Software]).pipe(Schema.toTaggedUnion('_tag'));
export type Encoder = typeof Encoder.Type;

/** What the page found: the encoder it will use, or none. */
export const EncoderChoice = Schema.Union([Hardware, Software, NoEncoder]).pipe(
  Schema.toTaggedUnion('_tag'),
);
export type EncoderChoice = typeof EncoderChoice.Type;

/** An encoder's name in a log line or the doctor: `hardware`, `software`. */
export const encoderName = (encoder: Encoder): string => encoder._tag.toLowerCase();
