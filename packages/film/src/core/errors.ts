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

/**
 * One recording of the whole script, lined up with the script's words, where
 * too few of a beat's words were heard to say where it was read.
 */
export class BeatUnplaced extends Schema.TaggedError<BeatUnplaced>()('BeatUnplaced', {
  beat: Schema.String,
  /** The share of the beat's words heard, 0 to 1. */
  heard: Schema.Finite,
}) {
  override get message() {
    return `beat "${this.beat}" was not found in the recording (${Math.round(this.heard * 100)}% of its words heard); record it again, or import it alone`;
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

// ---------------------------------------------------------------------------
// Shorts: a span of a short (`shorts.ts`) that names what its film lacks.

/** A short's span names a scene the film does not have. */
export class ShortUnknownScene extends Schema.TaggedError<ShortUnknownScene>()(
  'ShortUnknownScene',
  {
    short: Schema.String,
    scene: Schema.String,
    /** The film's scenes, in film order. */
    known: Schema.Array(Schema.String),
  },
) {
  override get message() {
    return `short "${this.short}": the film has no scene "${this.scene}"; its scenes are ${this.known.join(', ')}`;
  }
}

/** A short's span starts or ends on a `{mark}` its scene's narration does not have. */
export class ShortUnknownMark extends Schema.TaggedError<ShortUnknownMark>()('ShortUnknownMark', {
  short: Schema.String,
  scene: Schema.String,
  mark: Schema.String,
  /** The scene's marks, in narration order. */
  known: Schema.Array(Schema.String),
}) {
  override get message() {
    const marks = this.known.map((m) => `{${m}}`).join(' ') || 'none';
    return `short "${this.short}": scene "${this.scene}" has no mark {${this.mark}}; its marks are ${marks}`;
  }
}

/** A short's span starts or ends on a named cue its scene's timeline does not have. */
export class ShortUnknownCue extends Schema.TaggedError<ShortUnknownCue>()('ShortUnknownCue', {
  short: Schema.String,
  scene: Schema.String,
  cue: Schema.String,
  /** The scene's cues. */
  known: Schema.Array(Schema.String),
}) {
  override get message() {
    return `short "${this.short}": scene "${this.scene}" has no cue "${this.cue}"; its cues are ${this.known.join(', ') || 'none'}`;
  }
}

/** A short's span that ends where it starts, or before. */
export class ShortSpanEmpty extends Schema.TaggedError<ShortSpanEmpty>()('ShortSpanEmpty', {
  short: Schema.String,
  scene: Schema.String,
  /** Film seconds, each on its frame. */
  from: Schema.Finite,
  to: Schema.Finite,
}) {
  override get message() {
    return `short "${this.short}": the span in scene "${this.scene}" runs from ${this.from.toFixed(2)}s to ${this.to.toFixed(2)}s (film time), which holds no frame`;
  }
}

export type ShortError = ShortUnknownScene | ShortUnknownMark | ShortUnknownCue | ShortSpanEmpty;

/** A film names a sound the library does not declare. */
export class UnknownSound extends Schema.TaggedError<UnknownSound>()('UnknownSound', {
  name: Schema.String,
  /** The library's names in the same family, or every name when the family has none. */
  known: Schema.Array(Schema.String),
}) {
  override get message() {
    return `the library has no sound "${this.name}"; it has ${this.known.join(', ') || 'none'}`;
  }
}

/** A bed placed as a one-shot, or a one-shot laid as a bed. */
export class SoundUseMismatch extends Schema.TaggedError<SoundUseMismatch>()('SoundUseMismatch', {
  name: Schema.String,
  declared: Schema.Literals(['one-shot', 'bed']),
  placed: Schema.Literals(['one-shot', 'bed']),
}) {
  override get message() {
    return `sound "${this.name}" is declared a ${this.declared}, and placed as a ${this.placed}`;
  }
}
