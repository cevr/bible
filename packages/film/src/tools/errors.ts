// The tools' typed failures. The core's authoring errors (unknown scene, cue,
// mark or voice, a short act, a misaligned take) are re-exported so one import
// names every way a run can fail.

import { Schema } from 'effect';

export {
  ActTooShort,
  AlignmentMismatch,
  CueInvalid,
  UnknownEvent,
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

/** A film module (script, voice, sound) that fails to import or has the wrong shape. */
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

/** `layout()` refused the film: two beats share an id. */
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
  op: Schema.Literals(['read', 'decode', 'write', 'join']),
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

/** The film's page did not load, or loaded without its export handle. */
export class PageLoadFailed extends Schema.TaggedError<PageLoadFailed>()('PageLoadFailed', {
  url: Schema.String,
  reason: Schema.String,
}) {
  override get message() {
    return `the film's page did not load at ${this.url}: ${this.reason}`;
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

/** A beat with no artboard of its name in the film's Rive project. */
export class SceneMissing extends Schema.TaggedError<SceneMissing>()('SceneMissing', {
  scene: Schema.String,
}) {
  override get message() {
    return `beat "${this.scene}" has no artboard in the Rive project; run sync to seed its storyboard`;
  }
}

/** A scene still showing the storyboard `film sync` seeded: nobody has drawn it yet. */
export class SceneUndrawn extends Schema.TaggedError<SceneUndrawn>()('SceneUndrawn', {
  scene: Schema.String,
}) {
  override get message() {
    return `scene "${this.scene}" is still its storyboard`;
  }
}

/** A scene the Film cannot nest: its artboard is not a component. */
export class SceneNotComponent extends Schema.TaggedError<SceneNotComponent>()(
  'SceneNotComponent',
  { scene: Schema.String },
) {
  override get message() {
    return `scene "${this.scene}" is not a component, so the Film cannot nest it; make its artboard a component`;
  }
}

/** A mark with no Event of its name on its scene's main timeline: the picture cannot hit the word. */
export class MarkUnpinned extends Schema.TaggedError<MarkUnpinned>()('MarkUnpinned', {
  scene: Schema.String,
  mark: Schema.String,
}) {
  override get message() {
    return `scene "${this.scene}": no Event "${this.mark}" on the main timeline for the mark {${this.mark}}; key one where the picture hits the word`;
  }
}

/** A mark whose Event is keyed before an earlier mark's, or at the timeline's end: the warp leaves it out. */
export class MarkOrder extends Schema.TaggedError<MarkOrder>()('MarkOrder', {
  scene: Schema.String,
  mark: Schema.String,
}) {
  override get message() {
    return `scene "${this.scene}": Event "${this.mark}" is keyed before an earlier mark's Event, or at the end of the timeline, so the voice cannot land on it`;
  }
}

/** A scene with marks and no `main` timeline: it holds one frame, so no word lands. */
export class TimelineMissing extends Schema.TaggedError<TimelineMissing>()('TimelineMissing', {
  scene: Schema.String,
  marks: Schema.Int,
}) {
  override get message() {
    return `scene "${this.scene}" has ${this.marks} mark(s) and no timeline named main to land them on`;
  }
}

/** `film.rml` is not what `film sync` would write now: a take, the script or a scene changed since. */
export class FilmStale extends Schema.TaggedError<FilmStale>()('FilmStale', {
  file: Schema.String,
}) {
  override get message() {
    return `${this.file} is out of date with the takes, the script or the scenes; run sync`;
  }
}

/** A problem the Rive compiler finds in the project. */
export class ProjectProblem extends Schema.TaggedError<ProjectProblem>()('ProjectProblem', {
  kind: Schema.String,
  /** Where it is: `file:line`, or the project. */
  at: Schema.String,
  reason: Schema.String,
}) {
  override get message() {
    return `${this.at}: ${this.reason} (${this.kind})`;
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

/** A pull would overwrite changes to the film's Rive project that git does not have yet. */
export class ProjectDirty extends Schema.TaggedError<ProjectDirty>()('ProjectDirty', {
  dir: Schema.String,
  /** What git reports changed, a file a line. */
  changed: Schema.Array(Schema.String),
}) {
  override get message() {
    return `${this.dir} has changes git does not have (${this.changed.join(', ')}); commit them first, since a pull overwrites them`;
  }
}

/** The film has no Rive project yet. */
export class ProjectMissing extends Schema.TaggedError<ProjectMissing>()('ProjectMissing', {
  dir: Schema.String,
}) {
  override get message() {
    return `no Rive project at ${this.dir}; run sync to create it`;
  }
}

/** The film's Rive project has no font to set a storyboard in. */
export class FontMissing extends Schema.TaggedError<FontMissing>()('FontMissing', {
  dir: Schema.String,
}) {
  override get message() {
    return `the Rive project at ${this.dir} has no font for the storyboards; add a FontAsset`;
  }
}

/** A beat with no artboard of its name, whose storyboard's file already holds something else. */
export class SceneFileTaken extends Schema.TaggedError<SceneFileTaken>()('SceneFileTaken', {
  beat: Schema.String,
  file: Schema.String,
}) {
  override get message() {
    return `beat "${this.beat}" has no artboard of its name, but ${this.file} exists; name its artboard "${this.beat}" (sync never overwrites a scene)`;
  }
}

/** `git` failed where sync asked it whether the project has changes it lacks. */
export class GitFailed extends Schema.TaggedError<GitFailed>()('GitFailed', {
  exitCode: Schema.Int,
  reason: Schema.String,
}) {
  override get message() {
    return `git status failed (exit ${this.exitCode}): ${this.reason}`;
  }
}

/** The film's page could not be served. */
export class ServeFailed extends Schema.TaggedError<ServeFailed>()('ServeFailed', {
  reason: Schema.String,
}) {
  override get message() {
    return `the film's page could not be served: ${this.reason}`;
  }
}

/** The `rive` CLI is not installed. */
export class RiveMissing extends Schema.TaggedError<RiveMissing>()('RiveMissing', {
  install: Schema.String,
}) {
  override get message() {
    return `the rive CLI is not installed; install it with: ${this.install}`;
  }
}

/** A `rive` command failed: a compile error, no login, a file it cannot reach. */
export class RiveFailed extends Schema.TaggedError<RiveFailed>()('RiveFailed', {
  op: Schema.String,
  exitCode: Schema.Int,
  reason: Schema.String,
}) {
  override get message() {
    return `rive ${this.op} failed (exit ${this.exitCode}): ${this.reason}`;
  }
}

/** A first push with nowhere to go: the project is linked to no Rive file and names no project. */
export class RiveUnlinked extends Schema.TaggedError<RiveUnlinked>()('RiveUnlinked', {
  dir: Schema.String,
}) {
  override get message() {
    return `${this.dir} is linked to no Rive file yet; push once with --project <id> (\`rive push --list\` prints them)`;
  }
}
