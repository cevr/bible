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
