// Footage, as the page and the tools both name it. The footage library is
// an app's `footage/` folder, shared by its talks, as `sounds/` is by its
// films: each original (a take recorded on the owner's phone, or a licensed
// clip) is kept whole by the hash of its bytes, and named. `library.lock.json`
// (committed) records each name's original, what it was probed as and its
// current transcript; `files/<name>/<sha12>.<ext>` holds the originals
// (git-ignored, kept in the private store by `push` and brought back by
// `pull`); `transcripts/<name>.<sha12>.json` holds each take's words and
// loudness (committed: text and numbers, no media).
//
// A source is a name and the head of its original's hash (`<name>/<sha12>`):
// what a talk reads (`FootageRead.source`), the same in every copy. Each
// source has two copies the pages read, made from the original and rebuilt
// only when their recipe changes (`FOOTAGE_RECIPES`): the mezzanine the
// render conforms from (full size, a key frame a second) and the proxy the
// lab and the phone play (1280 px on its long side, a key frame every half
// second). One URL per copy, `/footage/<name>/<sha12>/<copy>.mp4`, answered by
// range. A take's voice is a third: its sound, one channel of lossless FLAC
// at the mix's rate, on the picture's clock.

import { Option, Schema } from 'effect';
import { type Pcm, toMono } from './audio.ts';
import { Seconds, TakeWord, repoJson } from './schema.ts';

/** Every copy a source has. */
export const FOOTAGE_COPIES = ['mezzanine', 'proxy'] as const;

/** The copy of a source a page reads: the render the mezzanine, the lab the proxy. */
export type FootageCopy = (typeof FOOTAGE_COPIES)[number];

/** The URL of `source`'s `copy`. */
export const footageHref = (source: string, copy: FootageCopy): string =>
  `/footage/${source}/${copy}.mp4`;

/** A footage name: lower case, digits, dots and dashes, as a take or clip is called. */
const FootageName = Schema.String.check(
  Schema.isPattern(/^[a-z0-9][a-z0-9.-]*$/, {
    message: 'a footage name is lower case letters, digits, dots and dashes',
  }),
);

/** How many hex digits of an original's hash name its source. */
const SHA12 = 12;

/** The source `name`'s original of hash `sha256` is: `<name>/<sha12>`. */
export const sourceOf = (name: string, sha256: string): string =>
  `${name}/${sha256.slice(0, SHA12)}`;

/** The files `film footage make` derives from an original. */
type DerivedFile = 'mezzanine.mp4' | 'proxy.mp4' | 'voice.flac' | 'stamp.json';

/** Where `make` keeps `file` of `name`'s original of hash `sha256`, under the outputs folder: `<out>/footage/<name>/<sha12>/<file>`. */
export const derivedFile = (
  outputs: string,
  name: string,
  sha256: string,
  file: DerivedFile,
): string => `${outputs}/footage/${sourceOf(name, sha256)}/${file}`;

/** A take (the owner's own recording, which a talk is cut on) or a clip (B-roll). */
export const FootageKind = Schema.Literals(['take', 'clip']);
export type FootageKind = typeof FootageKind.Type;

/** An original's picture, as the probe read it. */
export const FootagePicture = Schema.Struct({
  codec: Schema.String,
  /** As displayed, its rotation applied. */
  width: Schema.Int,
  height: Schema.Int,
  /** The clockwise rotation its container asks for, applied in every copy. */
  rotation: Schema.Literals([0, 90, 180, 270]),
  /** Its rate: the true one when its frames lie on one lattice, else mediabunny's best guess. */
  fps: Schema.Finite,
  /** Whether its frames lie on no one lattice (a variable rate): every copy is made at a constant one. */
  variable: Schema.Boolean,
  /** When its first frame shows, in the original's own time: every copy and the voice start there. */
  start: Schema.Finite,
});
export type FootagePicture = typeof FootagePicture.Type;

/** An original's sound, as the probe read it. */
const FootageSound = Schema.Struct({
  codec: Schema.String,
  rate: Schema.Int,
  channels: Schema.Int,
});

/** What the probe read of an original. */
export const FootageProbe = Schema.Struct({
  container: Schema.String,
  duration: Seconds,
  picture: FootagePicture,
  sound: Schema.optionalKey(FootageSound),
});
export type FootageProbe = typeof FootageProbe.Type;

/** One name's original, as the lock records it. */
export const FootageEntry = Schema.Struct({
  kind: FootageKind,
  /** The original's bytes: their sha256, their size and the extension they were imported with. */
  sha256: Schema.String,
  bytes: Schema.Int,
  ext: Schema.String,
  probe: FootageProbe,
  /** The take's current transcript, under `transcripts/` (a take only, once made). */
  transcript: Schema.optionalKey(Schema.String),
  /** A clip's terms: its licence, whom to credit, where it came from, and tags to find it by. */
  licence: Schema.optionalKey(Schema.String),
  credit: Schema.optionalKey(Schema.String),
  source: Schema.optionalKey(Schema.String),
  tags: Schema.optionalKey(Schema.Array(Schema.String)),
});
export type FootageEntry = typeof FootageEntry.Type;

/** `library.lock.json`: every name's original. */
export const FootageLock = Schema.Struct({
  version: Schema.Literal(1),
  footage: Schema.Record(FootageName, FootageEntry),
});
export type FootageLock = typeof FootageLock.Type;

/** The lock as it is written: two-space JSON, ending in a newline. */
export const FootageLockJson = repoJson(FootageLock);

/** The lock of a library with nothing imported. */
export const EMPTY_FOOTAGE_LOCK: FootageLock = { version: 1, footage: {} };

/** An original's path under `files/`: `<name>/<sha12><ext>`. */
export const originalPath = (name: string, entry: Pick<FootageEntry, 'sha256' | 'ext'>): string =>
  `${sourceOf(name, entry.sha256)}${entry.ext}`;

/** Where the store keeps an original: `footage/<name>/<sha12><ext>`. */
export const originalKey = (name: string, entry: Pick<FootageEntry, 'sha256' | 'ext'>): string =>
  `footage/${originalPath(name, entry)}`;

/** A copy's recipe: what it is made as, so a change remakes it and nothing else does. */
export interface FootageRecipe {
  /** Its long side in pixels: none keeps the original's size. */
  readonly longSide: Option.Option<number>;
  /** x264's CRF. */
  readonly crf: number;
  /** Seconds between key frames, at most. */
  readonly keyEvery: number;
  /** Its constant rate, frames a second. */
  readonly fps: number;
}

/**
 * Each copy's recipe. The mezzanine keeps the original's size (headroom to
 * punch in) at a high quality, a key frame a second; the proxy is the
 * phone's: 1280 on its long side, smaller, a key frame every half second so
 * a seek decodes little. Both at the talks' rate, 30.
 */
export const FOOTAGE_RECIPES = {
  mezzanine: { longSide: Option.none(), crf: 16, keyEvery: 1, fps: 30 },
  proxy: { longSide: Option.some(1280), crf: 26, keyEvery: 0.5, fps: 30 },
} satisfies { readonly [K in FootageCopy]: FootageRecipe };

/**
 * The WebCodecs content hint each copy is encoded with, which is how x264
 * (`tools/x264.ts`) tells a footage copy from a film's share and phone
 * copies, and which copy it is: the mezzanine keeps detail, the proxy plays
 * smoothly. A film's copies carry none.
 */
export const FOOTAGE_HINTS = {
  mezzanine: 'detail',
  proxy: 'motion',
} satisfies { readonly [K in FootageCopy]: string };

/** A recipe's key: a copy made under another is stale. */
export const recipeKey = (recipe: FootageRecipe): string =>
  [
    `long=${Option.match(recipe.longSide, { onNone: () => 'source', onSome: String })}`,
    `crf=${recipe.crf}`,
    `key=${recipe.keyEvery}`,
    `fps=${recipe.fps}`,
  ].join(' ');

/** The voice's recipe: one channel at the mix's rate, levelled by one gain, on the picture's clock. */
export const VOICE_RECIPE = 'mono 44100 level-once picture-clock';

/** What `out/footage/<name>/<sha12>/stamp.json` records: the recipe each copy was made by. */
export const FootageStamp = Schema.Struct({
  mezzanine: Schema.optionalKey(Schema.String),
  proxy: Schema.optionalKey(Schema.String),
  voice: Schema.optionalKey(Schema.String),
});
export type FootageStamp = typeof FootageStamp.Type;
export const FootageStampJson = repoJson(FootageStamp);

/** A take's loudness every `ENVELOPE_STEP` seconds, in whole dB, never under `ENVELOPE_FLOOR`. */
const ENVELOPE_STEP = 0.01;
const ENVELOPE_FLOOR = -90;

/** `pcm`'s loudness every 10 ms: the RMS of each step, in whole dB, floored. */
export const envelopeOf = (pcm: Pcm): ReadonlyArray<number> => {
  const mono = toMono(pcm);
  const samples = mono.channels[0] ?? new Float32Array(0);
  const step = Math.round(ENVELOPE_STEP * mono.rate);
  return Array.from({ length: Math.ceil(mono.frames / step) }, (_, k) => {
    const from = k * step;
    const to = Math.min(mono.frames, from + step);
    let power = 0;
    for (let i = from; i < to; i += 1) power += (samples[i] ?? 0) ** 2;
    // A silent step's log is -Infinity: the floor stands for it.
    return Math.round(Math.max(ENVELOPE_FLOOR, 10 * Math.log10(power / Math.max(1, to - from))));
  });
};

/** A take's transcript: its words as heard and voiced, and its loudness, pinned to its original. */
const FootageTranscript = Schema.Struct({
  /** The source it was heard from (`<name>/<sha12>`). */
  source: Schema.String,
  /** The text as the speech-to-text heard it, whole. */
  text: Schema.String,
  words: Schema.Array(TakeWord),
  /** The voice's loudness every `ENVELOPE_STEP` seconds, in whole dB (`envelopeOf`). */
  envelope: Schema.Array(Schema.Int),
});
export const FootageTranscriptJson = repoJson(FootageTranscript);

/** A take's `hearing`th transcript's file under `transcripts/`: `<name>.<sha12>.json`, then `<name>.<sha12>.2.json`. */
export const transcriptFile = (name: string, sha256: string, hearing: number): string =>
  [
    name,
    sha256.slice(0, SHA12),
    ...Option.toArray(Option.liftPredicate(String(hearing), () => hearing > 1)),
    'json',
  ].join('.');
