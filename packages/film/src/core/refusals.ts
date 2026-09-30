// The failures a lab or review route answers with: raised by the tools'
// services, answered by the routes with the status the contract gives each
// (`api.ts`), and decoded by the page into the same classes, so a refusal's
// words are its message on both ends. The tools import them from
// `tools/errors.ts`, which re-exports them with the rest.

import { Schema } from 'effect';

export class FilmNotFound extends Schema.TaggedError<FilmNotFound>()('FilmNotFound', {
  film: Schema.String,
  dir: Schema.String,
}) {
  override get message() {
    return `no film "${this.film}" at ${this.dir}`;
  }
}

/** A name that is none of the films in the folder: answered with the films there are, no path. */
export class FilmUnknown extends Schema.TaggedError<FilmUnknown>()('FilmUnknown', {
  film: Schema.String,
  known: Schema.Array(Schema.String),
}) {
  override get message() {
    return `no film "${this.film}" (the films: ${this.known.join(', ') || 'none'})`;
  }
}

/**
 * A take that does not say its script: the transcript is too far from the
 * text. Its message says what was heard, not how to accept it: the command
 * line and the studio's panel each add their own way.
 */
export class TakeMismatch extends Schema.TaggedError<TakeMismatch>()('TakeMismatch', {
  id: Schema.String,
  script: Schema.String,
  heard: Schema.String,
  wer: Schema.Finite,
  /** The attempt the studio saved of it, which its panel's "accept anyway" keeps. */
  attempt: Schema.optionalKey(Schema.String),
}) {
  override get message() {
    return `take ${this.id} says something else (wer ${(this.wer * 100).toFixed(1)}%)\n  script: ${this.script}\n  heard:  ${this.heard}`;
  }
}

/**
 * A person's recording that cannot become a take: named for no beat, with
 * nothing in it louder than the room, or one file with no beat to be.
 */
export class RecordingInvalid extends Schema.TaggedError<RecordingInvalid>()('RecordingInvalid', {
  file: Schema.String,
  reason: Schema.String,
}) {
  override get message() {
    return `${this.file}: ${this.reason}`;
  }
}

/** A recording the studio was sent that is not one: not base64, or of a type no recorder makes. */
export class AudioInvalid extends Schema.TaggedError<AudioInvalid>()('AudioInvalid', {
  reason: Schema.String,
}) {
  override get message() {
    return `the recording sent is not audio the studio reads: ${this.reason}`;
  }
}

/**
 * A recording sent to the studio in a lossy codec (Opus, AAC, MP3). A
 * person's take is the film's final voice and its master is lossless, so the
 * studio takes PCM (WAV) or FLAC only: a lossy upload would bake its codec's
 * loss into the master.
 */
export class RecordingLossy extends Schema.TaggedError<RecordingLossy>()('RecordingLossy', {
  type: Schema.String,
}) {
  override get message() {
    return `a recording of type "${this.type}" is lossy; send the take as audio/wav (PCM) or audio/flac`;
  }
}

/** A request body over what the studio reads, refused before it is read whole. */
export class BodyTooLarge extends Schema.TaggedError<BodyTooLarge>()('BodyTooLarge', {
  /** The most the route reads, in bytes. */
  limit: Schema.Int,
}) {
  override get message() {
    return `the request body is over ${this.limit} bytes`;
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

/** Speech-to-text heard words in a take but timed none of them: nothing to time the script by. */
export class SttUntimed extends Schema.TaggedError<SttUntimed>()('SttUntimed', {
  file: Schema.String,
  /** How many words its text holds. */
  heard: Schema.Int,
}) {
  override get message() {
    return `speech-to-text heard ${this.heard} words in ${this.file} but timed none of them; import it again`;
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

/**
 * A cue timing the lab will not write: with it, the scene's timeline does not
 * resolve (e.g. a span that would end before it starts). The file is untouched.
 */
export class TimelineUnresolved extends Schema.TaggedError<TimelineUnresolved>()(
  'TimelineUnresolved',
  {
    file: Schema.String,
    target: Schema.String,
    reason: Schema.String,
  },
) {
  override get message() {
    return `${this.file}: will not write ${this.target}: the timeline would not resolve: ${this.reason}`;
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

/** A ref that names no file under the review's roots (an unknown root, a path out of it, or nothing there). */
export class ReviewFileUnknown extends Schema.TaggedError<ReviewFileUnknown>()(
  'ReviewFileUnknown',
  { ref: Schema.String },
) {
  override get message() {
    return `no file ${this.ref} under the review's roots`;
  }
}

/** A video's 720p phone copy asked for before it is made (the index says when it is ready). */
export class PhoneCopyUnmade extends Schema.TaggedError<PhoneCopyUnmade>()('PhoneCopyUnmade', {
  ref: Schema.String,
}) {
  override get message() {
    return `no phone copy of ${this.ref} yet`;
  }
}

/** A note's still named that the film's notes do not hold. */
export class StillUnknown extends Schema.TaggedError<StillUnknown>()('StillUnknown', {
  film: Schema.String,
  name: Schema.String,
}) {
  override get message() {
    return `film "${this.film}" has no still ${this.name}`;
  }
}

/** A studio attempt named that the beat never recorded. */
export class AttemptUnknown extends Schema.TaggedError<AttemptUnknown>()('AttemptUnknown', {
  beat: Schema.String,
  file: Schema.String,
}) {
  override get message() {
    return `beat "${this.beat}" has no attempt ${this.file}`;
  }
}

/** A `film options` run that gave no answer: it failed, timed out, or printed something else. */
export class ChoicesProcessFailed extends Schema.TaggedError<ChoicesProcessFailed>()(
  'ChoicesProcessFailed',
  {
    command: Schema.String,
    reason: Schema.String,
  },
) {
  override get message() {
    return `${this.command} failed: ${this.reason}`;
  }
}

/** A pick naming a score option, or a library sound, the film does not offer. */
export class ChoiceUnknown extends Schema.TaggedError<ChoiceUnknown>()('ChoiceUnknown', {
  film: Schema.String,
  kind: Schema.Literals(['score option', 'sound']),
  name: Schema.String,
  known: Schema.Array(Schema.String),
}) {
  override get message() {
    const known = this.known.join(', ') || 'none';
    return `film "${this.film}" has no ${this.kind} "${this.name}" to choose (it has: ${known})`;
  }
}

/** A take act its take's state does not allow: only a waiting take is kept or rejected, only a kept one unkept. */
export class TakeActRefused extends Schema.TaggedError<TakeActRefused>()('TakeActRefused', {
  sound: Schema.String,
  take: Schema.String,
  /** What was asked, as it would read done: `kept`, `unkept`, `rejected`. */
  act: Schema.String,
  state: Schema.String,
}) {
  override get message() {
    return `take ${this.take.slice(0, 12)} of "${this.sound}" is ${this.state}: it cannot be ${this.act}`;
  }
}

/** A take named by its sha256 that a sound has neither kept nor waiting. */
export class TakeUnknown extends Schema.TaggedError<TakeUnknown>()('TakeUnknown', {
  sound: Schema.String,
  take: Schema.String,
}) {
  override get message() {
    return `sound "${this.sound}" has no kept or waiting take ${this.take.slice(0, 12)}`;
  }
}

/** A derived file the review makes (a frame, a length, a phone copy, a mix) that its cache could not keep. */
export class ReviewToolFailed extends Schema.TaggedError<ReviewToolFailed>()('ReviewToolFailed', {
  tool: Schema.Literal('cache'),
  ref: Schema.String,
  reason: Schema.String,
}) {
  override get message() {
    return `${this.tool} failed on ${this.ref}: ${this.reason}`;
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

/** A scene file with no version at HEAD the lab can compare with: new, or not in a git repository. */
export class HeadUnavailable extends Schema.TaggedError<HeadUnavailable>()('HeadUnavailable', {
  file: Schema.String,
  reason: Schema.String,
}) {
  override get message() {
    return `${this.file}: no HEAD version to compare with: ${this.reason}`;
  }
}
