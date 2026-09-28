// The tools' typed failures. The core's authoring errors (unknown scene, cue,
// mark or voice, a short act, a misaligned take) are re-exported so one import
// names every way a run can fail.

import { Schema } from 'effect';

export {
  ActTooShort,
  AlignmentMismatch,
  CueInvalid,
  UnknownCue,
  UnknownMark,
  UnknownScene,
  UnknownVoice,
} from '../core/errors.ts';

export class FilmNotFound extends Schema.TaggedError<FilmNotFound>()('FilmNotFound', {
  film: Schema.String,
  dir: Schema.String,
}) {
  override get message() {
    return `no film "${this.film}" at ${this.dir}`;
  }
}

/** A film module (scenes, voice, sound) that fails to import or has the wrong shape. */
export class FilmModuleInvalid extends Schema.TaggedError<FilmModuleInvalid>()(
  'FilmModuleInvalid',
  { film: Schema.String, module: Schema.String, reason: Schema.String },
) {
  override get message() {
    return `film "${this.film}": ${this.module} is invalid: ${this.reason}`;
  }
}

/** A data file (timings.json, manifest.json) that does not decode. */
export class FileInvalid extends Schema.TaggedError<FileInvalid>()('FileInvalid', {
  file: Schema.String,
  reason: Schema.String,
}) {
  override get message() {
    return `${this.file} is invalid: ${this.reason}`;
  }
}

/** `layout()` refused the film: a duplicate scene, an unknown mark or cue in a timeline, a cycle. */
export class LayoutInvalid extends Schema.TaggedError<LayoutInvalid>()('LayoutInvalid', {
  film: Schema.String,
  reason: Schema.String,
}) {
  override get message() {
    return `film "${this.film}" does not lay out: ${this.reason}`;
  }
}

export class SoundMissing extends Schema.TaggedError<SoundMissing>()('SoundMissing', {
  film: Schema.String,
}) {
  override get message() {
    return `film "${this.film}" has no sound.ts`;
  }
}

/** A take that does not say its script: the transcript is too far from the text. */
export class TakeMismatch extends Schema.TaggedError<TakeMismatch>()('TakeMismatch', {
  id: Schema.String,
  script: Schema.String,
  heard: Schema.String,
  wer: Schema.Finite,
}) {
  override get message() {
    return `take ${this.id} says something else (wer ${(this.wer * 100).toFixed(1)}%)\n  script: ${this.script}\n  heard:  ${this.heard}\nre-record it with --only ${this.id}, or keep it with --accept-mismatch`;
  }
}

export class ElevenLabsFailed extends Schema.TaggedError<ElevenLabsFailed>()('ElevenLabsFailed', {
  op: Schema.String,
  exitCode: Schema.Int,
  reason: Schema.String,
}) {
  override get message() {
    return `elevenlabs ${this.op} failed (${this.exitCode}): ${this.reason}`;
  }
}

/** Sound effects need an API key; the CLI's OAuth login covers speech and music only. */
export class ApiKeyMissing extends Schema.TaggedError<ApiKeyMissing>()('ApiKeyMissing', {}) {
  override get message() {
    return 'no ELEVENLABS_API_KEY in env or Keychain';
  }
}

/** A media file that could not be read, decoded, written or joined into a film. */
export class MediaFailed extends Schema.TaggedError<MediaFailed>()('MediaFailed', {
  op: Schema.Literals(['read', 'decode', 'encode', 'write', 'join']),
  file: Schema.String,
  reason: Schema.String,
}) {
  override get message() {
    return `could not ${this.op} ${this.file}: ${this.reason}`;
  }
}

/** A sound the mix plays that is not at the mix's rate: the mix never resamples. */
export class SampleRateMismatch extends Schema.TaggedError<SampleRateMismatch>()(
  'SampleRateMismatch',
  { file: Schema.String, rate: Schema.Finite, expected: Schema.Finite },
) {
  override get message() {
    return `${this.file} is at ${this.rate} Hz; the mix runs at ${this.expected} Hz`;
  }
}

/** Some named cue ends after its scene does. */
export class CuesLate extends Schema.TaggedError<CuesLate>()('CuesLate', {
  count: Schema.Int,
}) {
  override get message() {
    return `${this.count} cue(s) end after their scene`;
  }
}

/** No headless Chromium to render with: Playwright ships without one. */
export class BrowserMissing extends Schema.TaggedError<BrowserMissing>()('BrowserMissing', {
  executable: Schema.String,
  install: Schema.String,
}) {
  override get message() {
    return `no headless Chromium at ${this.executable}; install it with:\n  ${this.install}`;
  }
}

export class BrowserFailed extends Schema.TaggedError<BrowserFailed>()('BrowserFailed', {
  reason: Schema.String,
}) {
  override get message() {
    return `the browser failed: ${this.reason}`;
  }
}

/** The player page did not load, or loaded without an export handle. */
export class PageLoadFailed extends Schema.TaggedError<PageLoadFailed>()('PageLoadFailed', {
  url: Schema.String,
  reason: Schema.String,
}) {
  override get message() {
    return `the player did not load at ${this.url}: ${this.reason}`;
  }
}

/** The film threw in the page: a render must not keep going on a broken frame. */
export class PageError extends Schema.TaggedError<PageError>()('PageError', {
  reason: Schema.String,
}) {
  override get message() {
    return `the film threw in the page: ${this.reason}`;
  }
}

/** The page's renderer process died. A chunk is retried once on a fresh page. */
export class PageCrashed extends Schema.TaggedError<PageCrashed>()('PageCrashed', {
  reason: Schema.String,
}) {
  override get message() {
    return `a render page crashed: ${this.reason}`;
  }
}

/** Frame `frame` did not come back from the page. */
export class FrameFailed extends Schema.TaggedError<FrameFailed>()('FrameFailed', {
  frame: Schema.Int,
  reason: Schema.String,
}) {
  override get message() {
    return `frame ${this.frame} failed: ${this.reason}`;
  }
}

/** The page could not compose the film's look-book. */
export class LookbookFailed extends Schema.TaggedError<LookbookFailed>()('LookbookFailed', {
  reason: Schema.String,
}) {
  override get message() {
    return `the look-book failed: ${this.reason}`;
  }
}

/** The page could not compose the contact sheet. */
export class ContactFailed extends Schema.TaggedError<ContactFailed>()('ContactFailed', {
  reason: Schema.String,
}) {
  override get message() {
    return `the contact sheet failed: ${this.reason}`;
  }
}

/** The browser has no H.264 encoder for the film: checked before a frame is drawn. */
export class EncoderMissing extends Schema.TaggedError<EncoderMissing>()('EncoderMissing', {
  reason: Schema.String,
}) {
  override get message() {
    return `the browser cannot encode the film: ${this.reason}`;
  }
}

/** The page could not encode frames `[from, to)`. */
export class EncodeFailed extends Schema.TaggedError<EncodeFailed>()('EncodeFailed', {
  from: Schema.Int,
  to: Schema.Int,
  reason: Schema.String,
}) {
  override get message() {
    return `frames ${this.from}–${this.to} failed to encode: ${this.reason}`;
  }
}

/** The film declares its mixed track but the lossless master is not there. */
export class AudioMissing extends Schema.TaggedError<AudioMissing>()('AudioMissing', {
  file: Schema.String,
}) {
  override get message() {
    return `no audio master at ${this.file}; run mix to build it (no API calls)`;
  }
}

/** The audio master is not as long as the film: a mix was cut short, or made for another cut. */
export class AudioStale extends Schema.TaggedError<AudioStale>()('AudioStale', {
  file: Schema.String,
  /** The master's measured length, in seconds. */
  length: Schema.Finite,
  /** The film's length, in seconds. */
  film: Schema.Finite,
}) {
  override get message() {
    return `the audio master ${this.file} runs ${this.length.toFixed(3)}s, the film ${this.film.toFixed(3)}s; run mix to rebuild it (no API calls)`;
  }
}

const FLAG_RULE = { excludes: 'does not go with', needs: 'needs' } as const;

/**
 * A flag that would be ignored: given with one it `excludes`, or without the
 * one it `needs`.
 */
export class FlagsConflict extends Schema.TaggedError<FlagsConflict>()('FlagsConflict', {
  flag: Schema.String,
  rule: Schema.Literals(['excludes', 'needs']),
  other: Schema.String,
  reason: Schema.String,
}) {
  override get message() {
    return `--${this.flag} ${FLAG_RULE[this.rule]} --${this.other}: ${this.reason}`;
  }
}

/** `score --only` names a sound the film does not have. */
export class UnknownEffect extends Schema.TaggedError<UnknownEffect>()('UnknownEffect', {
  id: Schema.String,
  /** The sounds the film has: `music`, if it has a score, and its effect ids. */
  known: Schema.Array(Schema.String),
}) {
  override get message() {
    return `the film has no sound "${this.id}"; its sounds are ${this.known.join(', ')}`;
  }
}

/** `film bench --budget` with no baseline to hold the run against. */
export class BaselineMissing extends Schema.TaggedError<BaselineMissing>()('BaselineMissing', {
  file: Schema.String,
}) {
  override get message() {
    return `no bench baseline at ${this.file}; run bench --baseline first`;
  }
}

/** A bench run that cannot be held against its baseline: another machine, or the other captions setting. */
export class BaselineIncomparable extends Schema.TaggedError<BaselineIncomparable>()(
  'BaselineIncomparable',
  { file: Schema.String, reason: Schema.String },
) {
  override get message() {
    return `the bench baseline at ${this.file} does not compare with this run: ${this.reason}; run bench --baseline on this setup first`;
  }
}

/** A `--hash` bench run against a baseline that kept no hashes: its pixels would pass unchecked. */
export class BaselineUnhashed extends Schema.TaggedError<BaselineUnhashed>()('BaselineUnhashed', {
  file: Schema.String,
}) {
  override get message() {
    return `the bench baseline at ${this.file} has no pixel hashes to compare; run bench --hash --baseline first`;
  }
}

/** A bench run more than the budget slower than its baseline, on the same machine. */
export class BenchOverBudget extends Schema.TaggedError<BenchOverBudget>()('BenchOverBudget', {
  /** Each measure over: a scene's median ms, or the film's summed draw seconds. */
  slower: Schema.Array(
    Schema.Struct({ what: Schema.String, now: Schema.Finite, before: Schema.Finite }),
  ),
}) {
  override get message() {
    const lines = this.slower.map(
      (s) =>
        `${s.what} ${s.now.toFixed(1)} against ${s.before.toFixed(1)} (+${((s.now / s.before - 1) * 100).toFixed(0)}%)`,
    );
    return `slower than the baseline by more than the budget: ${lines.join('; ')}`;
  }
}

/** A bench run whose frames' pixels differ from the baseline's. */
export class PixelsMoved extends Schema.TaggedError<PixelsMoved>()('PixelsMoved', {
  frames: Schema.Array(Schema.Int),
}) {
  override get message() {
    return `${this.frames.length} hashed frames differ from the baseline: ${this.frames.join(', ')}`;
  }
}

/** A video render that would open more hardware encoders than run at once: it would hang, not fail. */
export class TooManyEncoders extends Schema.TaggedError<TooManyEncoders>()('TooManyEncoders', {
  workers: Schema.Int,
  share: Schema.Boolean,
  max: Schema.Int,
}) {
  override get message() {
    const perPage = 1 + Number(this.share);
    const copy = ' with a share copy'.repeat(Number(this.share));
    const orNoShare = ', or --no-share'.repeat(Number(this.share));
    return `${this.workers} pages${copy} need ${this.workers * perPage} encoders at once, over the ${this.max} a render may run; use --workers ${Math.floor(this.max / perPage)} or fewer${orNoShare}`;
  }
}

/** A render range with no frames in it. */
export class RangeEmpty extends Schema.TaggedError<RangeEmpty>()('RangeEmpty', {
  from: Schema.Finite,
  to: Schema.Finite,
}) {
  override get message() {
    return `nothing to render between ${this.from}s and ${this.to}s`;
  }
}

// ---------------------------------------------------------------------------
// `film check` findings. Each is a value the check collects, never the first
// failure only; the run fails with `CheckFailed` once every one is reported.

/** A named cue that ends after its scene does. */
export class CueLate extends Schema.TaggedError<CueLate>()('CueLate', {
  scene: Schema.String,
  cue: Schema.String,
  end: Schema.Finite,
  dur: Schema.Finite,
}) {
  override get message() {
    return `scene "${this.scene}": cue "${this.cue}" ends at ${this.end.toFixed(2)}s, after the scene (${this.dur.toFixed(2)}s)`;
  }
}

/**
 * The pause between one scene's last word and the next scene's first is over
 * the default seam, and neither scene declares it (no `tail` or `min` on the
 * first, no `lead` on the second): a default stretched it, not the script.
 */
export class SeamLong extends Schema.TaggedError<SeamLong>()('SeamLong', {
  from: Schema.String,
  to: Schema.String,
  seam: Schema.Finite,
  max: Schema.Finite,
}) {
  override get message() {
    return `scenes "${this.from}" → "${this.to}": ${this.seam.toFixed(2)}s between their words, over ${this.max.toFixed(1)}s, and neither declares the pause (set "${this.to}".lead or "${this.from}".tail)`;
  }
}

/** A beat whose take is missing, or was recorded for other text or another voice. */
export class TakeStale extends Schema.TaggedError<TakeStale>()('TakeStale', {
  scene: Schema.String,
  reason: Schema.Literals(['missing', 'text changed', 'voice changed']),
}) {
  override get message() {
    return `scene "${this.scene}": take is stale (${this.reason}); run narrate`;
  }
}

/** A generated sound asset whose stored hash no longer matches its request. */
export class AssetStale extends Schema.TaggedError<AssetStale>()('AssetStale', {
  asset: Schema.String,
  stored: Schema.String,
  wanted: Schema.String,
}) {
  override get message() {
    return `sound "${this.asset}" is stale (made for ${this.stored}, the film now asks for ${this.wanted}); run score`;
  }
}

/** A sound the film declares that has never been generated, so the mix leaves it out. */
export class AssetMissing extends Schema.TaggedError<AssetMissing>()('AssetMissing', {
  asset: Schema.String,
}) {
  override get message() {
    return `sound "${this.asset}" has not been generated; the mix plays without it`;
  }
}

/** Where a layout sample was taken: a scene, a film time, and what the time is. */
const sampled = {
  scene: Schema.String,
  time: Schema.Finite,
  at: Schema.String,
};

const where = (f: { readonly scene: string; readonly time: number; readonly at: string }) =>
  `scene "${f.scene}" at ${f.time.toFixed(2)}s (${f.at})`;

/** Two different lines of text on screen over each other. */
export class TextOverlap extends Schema.TaggedError<TextOverlap>()('TextOverlap', {
  ...sampled,
  a: Schema.String,
  b: Schema.String,
  /** Overlap in square canvas pixels. */
  area: Schema.Finite,
  /** How many sampled frames show this pair overlapping. */
  frames: Schema.Int,
}) {
  override get message() {
    return `${where(this)}: "${this.a}" overlaps "${this.b}" by ${Math.round(this.area)} px² (${this.frames} sampled frame(s))`;
  }
}

/** A line of text reaching past the edge of the frame. */
export class TextOffFrame extends Schema.TaggedError<TextOffFrame>()('TextOffFrame', {
  ...sampled,
  text: Schema.String,
  /** How far past the frame's edges it reaches, in canvas pixels. */
  left: Schema.Finite,
  top: Schema.Finite,
  right: Schema.Finite,
  bottom: Schema.Finite,
  frames: Schema.Int,
}) {
  override get message() {
    const edges: ReadonlyArray<readonly [string, number]> = [
      ['left', this.left],
      ['top', this.top],
      ['right', this.right],
      ['bottom', this.bottom],
    ];
    const past = edges
      .filter(([, px]) => px > 0)
      .map(([edge, px]) => `${Math.round(px)} px past the ${edge}`);
    return `${where(this)}: "${this.text}" leaves the frame, ${past.join(', ')} (${this.frames} sampled frame(s))`;
  }
}

/** The check found errors; each was printed above. */
export class CheckFailed extends Schema.TaggedError<CheckFailed>()('CheckFailed', {
  errors: Schema.Int,
  warnings: Schema.Int,
}) {
  override get message() {
    return `film check failed: ${this.errors} error(s), ${this.warnings} warning(s)`;
  }
}

/** `film notes reply|resolve` named a note the film's lab does not have. */
export class NoteNotFound extends Schema.TaggedError<NoteNotFound>()('NoteNotFound', {
  film: Schema.String,
  id: Schema.String,
  /** The ids the film's notes do have. */
  known: Schema.Array(Schema.String),
}) {
  override get message() {
    if (this.known.length === 0) return `film "${this.film}" has no note "${this.id}"; it has none`;
    return `film "${this.film}" has no note "${this.id}"; its notes are ${this.known.join(', ')}`;
  }
}

/** Another process held the notes lock for too long: a crashed writer left it behind. */
export class NotesLocked extends Schema.TaggedError<NotesLocked>()('NotesLocked', {
  lock: Schema.String,
}) {
  override get message() {
    return `${this.lock} is held by a running writer; it is broken once that writer exits or the lock is 30 s old`;
  }
}

// ---------------------------------------------------------------------------
// Lab write-back: the scene source the lab edits.

/** A scene whose drawing the lab cannot find in the film's source files. */
export class SceneNotLocated extends Schema.TaggedError<SceneNotLocated>()('SceneNotLocated', {
  film: Schema.String,
  scene: Schema.String,
  reason: Schema.String,
}) {
  override get message() {
    return `film "${this.film}": scene "${this.scene}" has no editable drawing in source: ${this.reason}`;
  }
}

/**
 * A literal more than one scene reads (each spreads one drawing): a write for
 * one scene would move the others too, so the lab does not make it.
 */
export class SourceShared extends Schema.TaggedError<SourceShared>()('SourceShared', {
  film: Schema.String,
  field: Schema.Literals(['timeline', 'knobs']),
  file: Schema.String,
  scenes: Schema.Array(Schema.String),
}) {
  override get message() {
    return `film "${this.film}": the ${this.field} in ${this.file} is read by scenes ${this.scenes.join(', ')}; the lab will not write a literal they share (give each scene its own drawing)`;
  }
}

/**
 * An edit the lab will not make: the target is not a literal it can prove it
 * rewrites (a computed value, a spread, a shorthand), or it does not exist.
 */
export class SourceRefused extends Schema.TaggedError<SourceRefused>()('SourceRefused', {
  file: Schema.String,
  target: Schema.String,
  reason: Schema.String,
}) {
  override get message() {
    return `${this.file}: will not edit ${this.target}: ${this.reason}`;
  }
}

/** oxfmt failed on a file the lab wrote; the file was put back as it was. */
export class FormatFailed extends Schema.TaggedError<FormatFailed>()('FormatFailed', {
  file: Schema.String,
  reason: Schema.String,
}) {
  override get message() {
    return `${this.file}: oxfmt failed, the file was left as it was: ${this.reason}`;
  }
}

/** A written value did not read back from the formatted file; the file was put back as it was. */
export class WriteUnverified extends Schema.TaggedError<WriteUnverified>()('WriteUnverified', {
  file: Schema.String,
  target: Schema.String,
  reason: Schema.String,
}) {
  override get message() {
    return `${this.file}: ${this.target} did not read back once formatted (${this.reason}); the file was left as it was`;
  }
}

/**
 * The scene file changed on disk (an editor saved it) between the lab reading
 * it and writing it back: the lab writes nothing over it, and the change stays.
 */
export class SourceChanged extends Schema.TaggedError<SourceChanged>()('SourceChanged', {
  file: Schema.String,
  target: Schema.String,
}) {
  override get message() {
    return `${this.file} changed on disk while the lab was writing ${this.target}; it was left as it is now: reload and write again`;
  }
}

/** A child process that ran past its time limit, and was stopped. */
export class ProcessTimedOut extends Schema.TaggedError<ProcessTimedOut>()('ProcessTimedOut', {
  command: Schema.String,
  seconds: Schema.Finite,
}) {
  override get message() {
    return `${this.command} did not finish within ${this.seconds} s and was stopped`;
  }
}

/** An undo with no write to undo, or one whose file has changed since the write. */
export class UndoUnavailable extends Schema.TaggedError<UndoUnavailable>()('UndoUnavailable', {
  reason: Schema.String,
}) {
  override get message() {
    return `nothing to undo: ${this.reason}`;
  }
}

/** The lab's Redo has no undone write to write again, or its file changed since the undo. */
export class RedoUnavailable extends Schema.TaggedError<RedoUnavailable>()('RedoUnavailable', {
  reason: Schema.String,
}) {
  override get message() {
    return `nothing to redo: ${this.reason}`;
  }
}

/** `film check --static`, run for the lab after a write, did not run to a report. */
export class StaticCheckFailed extends Schema.TaggedError<StaticCheckFailed>()(
  'StaticCheckFailed',
  { reason: Schema.String },
) {
  override get message() {
    return `the static check did not run: ${this.reason}`;
  }
}

/** A scene file with no version at HEAD the lab can compare with: new, or not in a git repository. */
export class HeadUnavailable extends Schema.TaggedError<HeadUnavailable>()('HeadUnavailable', {
  file: Schema.String,
  reason: Schema.String,
}) {
  override get message() {
    return `${this.file}: no HEAD version to compare with: ${this.reason}`;
  }
}

/** Brush strokes drawn across a line of text, where the check can see them. */
export class InkOverText extends Schema.TaggedError<InkOverText>()('InkOverText', {
  ...sampled,
  text: Schema.String,
  /** How many strokes cross it. */
  strokes: Schema.Int,
  /** How much of their length runs visibly through the text's box, in canvas pixels. */
  length: Schema.Finite,
  /** The box around the crossing strokes, in canvas pixels. */
  x: Schema.Finite,
  y: Schema.Finite,
  w: Schema.Finite,
  h: Schema.Finite,
  frames: Schema.Int,
}) {
  override get message() {
    const box = `${Math.round(this.x)},${Math.round(this.y)} ${Math.round(this.w)}×${Math.round(this.h)}`;
    return `${where(this)}: ${this.strokes} stroke(s) at ${box} cross "${this.text}" for ${Math.round(this.length)} px (${this.frames} sampled frame(s))`;
  }
}

/** A line of text running off the plate under it (a card, a tag), past the plate's edge. */
export class TextOffPlate extends Schema.TaggedError<TextOffPlate>()('TextOffPlate', {
  ...sampled,
  text: Schema.String,
  /** How far the line's box reaches past each side of the plate's box, in canvas pixels. */
  left: Schema.Finite,
  top: Schema.Finite,
  right: Schema.Finite,
  bottom: Schema.Finite,
  frames: Schema.Int,
}) {
  override get message() {
    const edges: ReadonlyArray<readonly [string, number]> = [
      ['left', this.left],
      ['top', this.top],
      ['right', this.right],
      ['bottom', this.bottom],
    ];
    const past = edges
      .filter(([, px]) => px > 0)
      .map(([edge, px]) => `${Math.round(px)} px past the ${edge}`);
    return `${where(this)}: "${this.text}" runs off the plate under it, ${past.join(', ')} (${this.frames} sampled frame(s))`;
  }
}

/** A plate (a cutout smaller than the frame) carrying text, cut off by the frame's edge. */
export class PlateOffFrame extends Schema.TaggedError<PlateOffFrame>()('PlateOffFrame', {
  ...sampled,
  /** A line of text the plate carries. */
  text: Schema.String,
  left: Schema.Finite,
  top: Schema.Finite,
  right: Schema.Finite,
  bottom: Schema.Finite,
  frames: Schema.Int,
}) {
  override get message() {
    const edges: ReadonlyArray<readonly [string, number]> = [
      ['left', this.left],
      ['top', this.top],
      ['right', this.right],
      ['bottom', this.bottom],
    ];
    const past = edges
      .filter(([, px]) => px > 0)
      .map(([edge, px]) => `${Math.round(px)} px past the ${edge}`);
    return `${where(this)}: the plate under "${this.text}" leaves the frame, ${past.join(', ')} (${this.frames} sampled frame(s))`;
  }
}
