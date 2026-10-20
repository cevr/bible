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
import { Segment } from './segment.ts';

/** Every copy a source has. */
export const FOOTAGE_COPIES = ['mezzanine', 'proxy'] as const;

/** The copy of a source a page reads: the render the mezzanine, the lab the proxy. */
export type FootageCopy = (typeof FOOTAGE_COPIES)[number];

/** The URL of `source`'s `copy`. */
export const footageHref = (source: string, copy: FootageCopy): string =>
  `/footage/${source}/${copy}.mp4`;

/** What a footage name is: a lower-case letter or digit, then lower-case letters, digits, dots and dashes. */
const FOOTAGE_NAME = /^[a-z0-9][a-z0-9.-]*$/;

/** Why a name is no footage name, as a refusal says it. */
const FOOTAGE_NAME_RULE =
  'a footage name is lower case letters, digits, dots and dashes, starting with a letter or digit';

/**
 * A footage name, as a take or clip is called: one path segment, so its
 * original stays under `files/<name>/`, its copies under
 * `<out>/footage/<name>/`, and the footage route (`/footage/<name>/…`)
 * serves them. No separator, no capital, nothing starting with a dot.
 */
export const FootageName = Segment.check(
  Schema.isPattern(FOOTAGE_NAME, { message: FOOTAGE_NAME_RULE }),
);

/** Whether `name` is a footage name (`FootageName`). */
const isFootageName = (name: string): boolean => FOOTAGE_NAME.test(name);

/** What a transcript's file is called: a footage name's characters, ending `.json` (`transcriptFile`). */
const TRANSCRIPT_FILE = /^[a-z0-9][a-z0-9.-]*\.json$/;

/**
 * A transcript's file under `transcripts/`, as the lock names it: one path
 * segment, so a lock can never name a file outside the folder for the tools
 * to read or the footage route to serve.
 */
const TranscriptFile = Schema.String.check(
  Schema.isPattern(TRANSCRIPT_FILE, {
    message: 'a transcript is a file under transcripts/: <name>.<sha12>.json',
  }),
);

/** Whether `file` is a transcript's file name (`TranscriptFile`). */
export const isTranscriptFile = (file: string): boolean => TRANSCRIPT_FILE.test(file);

/**
 * An original's sha256, as the lock records it: 64 lower-case hex digits.
 * Its head names the copies' folder and the original's file, so nothing
 * else may stand there.
 */
const FootageHash = Schema.String.check(
  Schema.isPattern(/^[0-9a-f]{64}$/, {
    message: "an original's sha256 is 64 lower-case hex digits",
  }),
);

/** Why an extension is none the library keeps, as a refusal says it. */
export const FOOTAGE_EXT_RULE = 'a dot, then lower-case letters and digits';

/**
 * An original's extension, as the lock records it: none, or a dot, then
 * lower-case letters and digits. Its file under `files/<name>/` and its key
 * in the private store end in it, so it holds no separator: the original
 * stays where its name and hash put it.
 */
export const FootageExt = Schema.String.check(
  Schema.isPattern(/^(\.[a-z0-9]+)?$/, {
    message: `an original's extension is none, or ${FOOTAGE_EXT_RULE}`,
  }),
);

/** How many hex digits of an original's hash name its source. */
const SHA12 = 12;

/** The source `name`'s original of hash `sha256` is: `<name>/<sha12>`. */
export const sourceOf = (name: string, sha256: string): string =>
  `${name}/${sha256.slice(0, SHA12)}`;

/** The files `film footage make` derives from an original. */
type DerivedFile = 'mezzanine.mp4' | 'proxy.mp4' | 'voice.flac' | 'stamp.json';

/** `source`'s derived `file`, as a path under the folder of copies (`copiesIn`): `<name>/<sha12>/<file>`. */
export const sourceFile = (source: string, file: DerivedFile): string => `${source}/${file}`;

/** The folder `make` keeps every source's derived files in, under the outputs folder: `<out>/footage`. */
export const copiesIn = (outputs: string): string => `${outputs}/footage`;

/** Where `make` keeps `file` of `name`'s original of hash `sha256`, under the outputs folder: `<out>/footage/<name>/<sha12>/<file>`. */
export const derivedFile = (
  outputs: string,
  name: string,
  sha256: string,
  file: DerivedFile,
): string => `${copiesIn(outputs)}/${sourceFile(sourceOf(name, sha256), file)}`;

/** Where a page reads the footage library's lock: the footage route answers it. */
export const FOOTAGE_LOCK_HREF = '/footage/library.lock.json';

/** Where a page reads a take's transcript, `transcripts/<file>`: the footage route answers it. */
export const transcriptHref = (file: string): string => `/footage/transcripts/${file}`;

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
  /**
   * The original's bytes: their sha256, their size and the extension they
   * were imported with. The hash and the extension are checked, read and
   * written, as the name is: every path to the original and its copies is
   * made of them.
   */
  sha256: FootageHash,
  bytes: Schema.Int,
  ext: FootageExt,
  probe: FootageProbe,
  /** The take's current transcript, under `transcripts/` (a take only, once made). */
  transcript: Schema.optionalKey(TranscriptFile),
  /** A clip's terms: its licence, whom to credit, where it came from, and tags to find it by. */
  licence: Schema.optionalKey(Schema.String),
  credit: Schema.optionalKey(Schema.String),
  source: Schema.optionalKey(Schema.String),
  tags: Schema.optionalKey(Schema.Array(Schema.String)),
});
export type FootageEntry = typeof FootageEntry.Type;

/**
 * `library.lock.json`: every name's original. Each key is a footage name
 * (`FootageName`), read and written. The lock checks its keys itself: a
 * record keyed by a checked string drops a key that fails the check when it
 * reads, so a bad name would vanish from the lock rather than refuse it.
 */
export const FootageLock = Schema.Struct({
  version: Schema.Literal(1),
  footage: Schema.Record(Schema.String, FootageEntry),
}).check(
  Schema.makeFilter((lock) =>
    Object.keys(lock.footage)
      .filter((name) => !isFootageName(name))
      .map((name) => ({ path: ['footage', name], issue: `"${name}": ${FOOTAGE_NAME_RULE}` })),
  ),
);
export type FootageLock = typeof FootageLock.Type;

/** The lock as it is written, as the repo's formatter prints it (`repoJson`). */
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
export type FootageTranscript = typeof FootageTranscript.Type;
export const FootageTranscriptJson = repoJson(FootageTranscript);

/** A take's `hearing`th transcript's file under `transcripts/`: `<name>.<sha12>.json`, then `<name>.<sha12>.2.json`. */
export const transcriptFile = (name: string, sha256: string, hearing: number): string =>
  [
    name,
    sha256.slice(0, SHA12),
    ...Option.toArray(Option.liftPredicate(String(hearing), () => hearing > 1)),
    'json',
  ].join('.');
