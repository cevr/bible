// The tools' typed failures. The core's authoring errors (unknown scene, cue
// or mark, a short act, a misaligned take) are re-exported so one import names
// every way a run can fail.

import { Schema } from 'effect';

export {
  ActTooShort,
  AlignmentMismatch,
  CueInvalid,
  UnknownCue,
  UnknownMark,
  UnknownScene,
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

export class FfmpegFailed extends Schema.TaggedError<FfmpegFailed>()('FfmpegFailed', {
  tool: Schema.String,
  exitCode: Schema.Int,
  stderr: Schema.String,
}) {
  override get message() {
    return `${this.tool} failed (${this.exitCode}): ${this.stderr}`;
  }
}

export class FfmpegMissing extends Schema.TaggedError<FfmpegMissing>()('FfmpegMissing', {
  tool: Schema.String,
}) {
  override get message() {
    return `${this.tool} is not installed (brew install ffmpeg)`;
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

/** The film declares its mixed track but the lossless master is not there. */
export class AudioMissing extends Schema.TaggedError<AudioMissing>()('AudioMissing', {
  file: Schema.String,
}) {
  override get message() {
    return `no audio master at ${this.file}; run mix to build it (no API calls)`;
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
