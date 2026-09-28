// Authoring errors the pure core returns as values. Tools lift them into their
// typed failures; the browser, which cannot recover from a broken film, turns
// them into a thrown error once at load.

import { Schema } from 'effect';

export class UnknownScene extends Schema.TaggedError<UnknownScene>()('UnknownScene', {
  scene: Schema.String,
  /** The scenes the film has, in film order. */
  known: Schema.Array(Schema.String),
}) {
  override get message() {
    return `the film has no scene "${this.scene}"; its scenes are ${this.known.join(', ')}`;
  }
}

export class UnknownCue extends Schema.TaggedError<UnknownCue>()('UnknownCue', {
  scene: Schema.String,
  cue: Schema.String,
}) {
  override get message() {
    return `sound: scene "${this.scene}" has no cue "${this.cue}"`;
  }
}

export class UnknownMark extends Schema.TaggedError<UnknownMark>()('UnknownMark', {
  scene: Schema.String,
  mark: Schema.String,
}) {
  override get message() {
    return `sound: scene "${this.scene}" has no mark "${this.mark}"`;
  }
}

/**
 * A cue pinned to a word (`{ mark, word }`) whose line never says that word
 * at or after its mark: the pin has nothing to land on, so the film does not
 * lay out (never a silent fall back to the mark).
 */
export class WordMissing extends Schema.TaggedError<WordMissing>()('WordMissing', {
  scene: Schema.String,
  cue: Schema.String,
  mark: Schema.String,
  word: Schema.String,
}) {
  override get message() {
    return `scene ${this.scene}: cue "${this.cue}" is pinned to the word "${this.word}", which the line never says at or after {${this.mark}}`;
  }
}

/** A sound cue that names both a cue and a mark, or an edge without a cue. */
export class CueInvalid extends Schema.TaggedError<CueInvalid>()('CueInvalid', {
  scene: Schema.String,
  reason: Schema.String,
}) {
  override get message() {
    return `sound: a cue in scene "${this.scene}" ${this.reason}`;
  }
}

export class ActTooShort extends Schema.TaggedError<ActTooShort>()('ActTooShort', {
  act: Schema.String,
  ms: Schema.Finite,
}) {
  override get message() {
    return `sound: act "${this.act}" is ${this.ms}ms; acts must run in film order, 3s or more`;
  }
}

/** A take's character alignment does not regroup into the words of its text. */
export class AlignmentMismatch extends Schema.TaggedError<AlignmentMismatch>()(
  'AlignmentMismatch',
  { spoken: Schema.String, words: Schema.Int, expected: Schema.Int },
) {
  override get message() {
    return `alignment has ${this.words} words, text has ${this.expected}: ${this.spoken}`;
  }
}

export type SoundCueError = UnknownScene | UnknownCue | UnknownMark | CueInvalid;

/** A line hands over to a voice the film's cast does not have. */
export class UnknownVoice extends Schema.TaggedError<UnknownVoice>()('UnknownVoice', {
  scene: Schema.String,
  voice: Schema.String,
  /** The cast's voices; empty when one voice reads the film. */
  known: Schema.Array(Schema.String),
}) {
  override get message() {
    if (this.known.length === 0)
      return `scene "${this.scene}" hands a line to "${this.voice}", but one voice reads this film; declare a cast in voice.ts`;
    return `scene "${this.scene}" hands a line to "${this.voice}"; the cast is ${this.known.join(', ')}`;
  }
}
