// Which H.264 encoder a render uses, as data. The page decides once, before
// it draws a frame (`chooseEncoder`, player/encode.ts), among the encoders
// this platform allows (`encoderCandidates`): the Mac renders on its GPU's
// encoder and nothing else, so a Mac that loses it stops loudly rather than
// changing the film's look; a platform with no hardware path (Chromium gets
// the GPU on macOS only, tools/browser.ts `launchArgs`) encodes in software.
// The renderer hands the one choice to every page, so every chunk of a
// render is encoded alike: the chunks are joined without re-encoding.

import { Match, Option, Schema } from 'effect';

/** The GPU's encoder: quantizer rate control, at most 14 at once (tools/render-plan.ts). */
export const Hardware = Schema.TaggedStruct('Hardware', {});
/** The browser's software encoder (OpenH264 in Chromium): bitrate control, one a core. */
export const Software = Schema.TaggedStruct('Software', {});
/** None of the allowed encoders encodes the film here, and why. */
export const NoEncoder = Schema.TaggedStruct('Missing', { reason: Schema.String });

/** An encoder a render can use. */
export const Encoder = Schema.Union([Hardware, Software]).pipe(Schema.toTaggedUnion('_tag'));
export type Encoder = typeof Encoder.Type;

/** What the page found: the encoder it will use, or none. */
export const EncoderChoice = Schema.Union([Hardware, Software, NoEncoder]).pipe(
  Schema.toTaggedUnion('_tag'),
);
export type EncoderChoice = typeof EncoderChoice.Type;

/** An encoder's name in a log line, an error or the doctor, and on `--encoder`. */
export const EncoderName = Schema.Literals(['hardware', 'software']);
export type EncoderName = typeof EncoderName.Type;

const BY_NAME = {
  hardware: { _tag: 'Hardware' },
  software: { _tag: 'Software' },
} as const satisfies Readonly<Record<EncoderName, Encoder>>;

/** An encoder's name: `hardware`, `software`. */
export const encoderName = (encoder: Encoder): EncoderName =>
  Encoder.match(encoder, {
    Hardware: (): EncoderName => 'hardware',
    Software: (): EncoderName => 'software',
  });

/**
 * Whether `encoder` makes the share copy in the page, beside the master: the
 * hardware encoder does (quantizer 26). The software one keeps the grain in
 * the page only at 24 Mbps, so its share is x264's, from the joined master
 * (tools/media.ts, `shareCopy`).
 */
export const sharesInPage = (encoder: Encoder): boolean =>
  Encoder.match(encoder, { Hardware: () => true, Software: () => false });

/** The encoder `--encoder <name>` asks for. */
export const encoderNamed = (name: EncoderName): Encoder => BY_NAME[name];

/**
 * The encoders a render on `platform` may choose from, in order: the one
 * `asked` for (`--encoder`), else on macOS the hardware encoder only (a Mac
 * whose GPU encoder fails is `EncoderMissing`, never a silent software
 * master), else the software encoder (no other platform launches Chromium
 * with the GPU).
 */
export const encoderCandidates = (
  platform: string,
  asked: Option.Option<Encoder>,
): ReadonlyArray<Encoder> =>
  Option.match(asked, {
    onSome: (encoder) => [encoder],
    onNone: () => [
      Match.value(platform).pipe(
        Match.when('darwin', () => BY_NAME.hardware),
        Match.orElse(() => BY_NAME.software),
      ),
    ],
  });
