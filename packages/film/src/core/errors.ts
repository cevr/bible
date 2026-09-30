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

/** A film's act named by an address (`--act`) that its `look` does not declare. */
export class UnknownAct extends Schema.TaggedError<UnknownAct>()('UnknownAct', {
  act: Schema.String,
  /** The acts the film declares, in order; empty when it declares no look. */
  known: Schema.Array(Schema.String),
}) {
  override get message() {
    if (this.known.length === 0) return `the film has no act "${this.act}": it declares no acts`;
    return `the film has no act "${this.act}"; its acts are ${this.known.join(', ')}`;
  }
}

/** An address (`--short`) names a short the film's `shorts.ts` does not declare. */
export class UnknownShort extends Schema.TaggedError<UnknownShort>()('UnknownShort', {
  film: Schema.String,
  id: Schema.String,
  /** The shorts the film declares, in order; empty when it has no `shorts.ts`. */
  known: Schema.Array(Schema.String),
}) {
  override get message() {
    if (this.known.length === 0)
      return `film "${this.film}" has no short "${this.id}": it declares none (a shorts.ts beside its script)`;
    return `film "${this.film}" has no short "${this.id}"; its shorts are ${this.known.join(', ')}`;
  }
}

/** An address that names more than one scope: a film, one act, some scenes or one short. */
export class AddressConflict extends Schema.TaggedError<AddressConflict>()('AddressConflict', {
  /** The scopes it names: `act`, `scene`, `short`. */
  given: Schema.Array(Schema.String),
}) {
  override get message() {
    return `an address names one scope (an act, scenes or a short), not ${this.given.join(' and ')}`;
  }
}

/**
 * A point names a cue its scene's timeline does not have. `by` says who
 * named it: a cue of the timeline (`cue "lift"`), the sound, or a short.
 */
export class UnknownCue extends Schema.TaggedError<UnknownCue>()('UnknownCue', {
  scene: Schema.String,
  cue: Schema.String,
  by: Schema.String,
  /** The scene's cues. */
  known: Schema.Array(Schema.String),
}) {
  override get message() {
    return `${this.by}: scene "${this.scene}" has no cue "${this.cue}"; its cues are ${this.known.join(', ') || 'none'}`;
  }
}

/** A point names a `{mark}` its scene's narration does not have. `by` as for `UnknownCue`. */
export class UnknownMark extends Schema.TaggedError<UnknownMark>()('UnknownMark', {
  scene: Schema.String,
  mark: Schema.String,
  by: Schema.String,
  /** The scene's marks, in narration order. */
  known: Schema.Array(Schema.String),
}) {
  override get message() {
    const marks = this.known.map((m) => `{${m}}`).join(' ') || 'none';
    return `${this.by}: scene "${this.scene}" has no mark {${this.mark}}; its marks are ${marks}`;
  }
}

/**
 * A point pinned to a word (`{ mark, word }`) whose line never says that
 * word at or after its mark: the pin has nothing to land on, so the film does
 * not lay out (never a silent fall back to the mark).
 */
export class WordMissing extends Schema.TaggedError<WordMissing>()('WordMissing', {
  scene: Schema.String,
  by: Schema.String,
  mark: Schema.String,
  word: Schema.String,
}) {
  override get message() {
    return `${this.by}: scene "${this.scene}" pins the word "${this.word}", which the line never says at or after {${this.mark}}`;
  }
}

/** A timeline whose cues anchor on each other in a ring: `cycle` runs round it, back to its first cue. */
export class CueCycle extends Schema.TaggedError<CueCycle>()('CueCycle', {
  scene: Schema.String,
  cycle: Schema.Array(Schema.String),
}) {
  override get message() {
    return `scene "${this.scene}": cue "${this.cycle.at(-1) ?? ''}" is part of a cycle (${this.cycle.join(' → ')})`;
  }
}

/** A cue that runs `until` a mark said before the cue starts. */
export class UntilBeforeStart extends Schema.TaggedError<UntilBeforeStart>()('UntilBeforeStart', {
  scene: Schema.String,
  cue: Schema.String,
  mark: Schema.String,
}) {
  override get message() {
    return `scene "${this.scene}": cue "${this.cue}" ends at {${this.mark}}, before it starts`;
  }
}

/** Two scenes of a film share an id. */
export class DuplicateScene extends Schema.TaggedError<DuplicateScene>()('DuplicateScene', {
  scene: Schema.String,
}) {
  override get message() {
    return `the film has two scenes "${this.scene}"`;
  }
}

/** A scene's line names one `{mark}` twice. */
export class DuplicateMark extends Schema.TaggedError<DuplicateMark>()('DuplicateMark', {
  scene: Schema.String,
  mark: Schema.String,
}) {
  override get message() {
    return `scene "${this.scene}": the line names {${this.mark}} twice`;
  }
}

/**
 * A scene's line hands itself on where no voice can read: two turns before
 * one word, or a turn with no word after it.
 */
export class TurnInvalid extends Schema.TaggedError<TurnInvalid>()('TurnInvalid', {
  scene: Schema.String,
  voice: Schema.String,
  reason: Schema.Literals(['follows another turn before any word', 'has no word after it']),
}) {
  override get message() {
    return `scene "${this.scene}": the turn to {@${this.voice}} ${this.reason}`;
  }
}

/** Why a scene's line does not parse. */
export type LineError = DuplicateMark | TurnInvalid;

/** A bed that ends where it starts, or before. */
export class CueInvalid extends Schema.TaggedError<CueInvalid>()('CueInvalid', {
  scene: Schema.String,
  reason: Schema.String,
}) {
  override get message() {
    return `sound: a cue in scene "${this.scene}" ${this.reason}`;
  }
}

/** A score movement under the music API's shortest chunk, or one declared out of film order. */
export class MovementTooShort extends Schema.TaggedError<MovementTooShort>()('MovementTooShort', {
  movement: Schema.String,
  ms: Schema.Finite,
}) {
  override get message() {
    return `sound: movement "${this.movement}" is ${this.ms}ms; movements must run in film order, 3s or more`;
  }
}

/** A score movement longer than the music API's longest chunk: start another movement inside it. */
export class MovementTooLong extends Schema.TaggedError<MovementTooLong>()('MovementTooLong', {
  movement: Schema.String,
  ms: Schema.Finite,
  max: Schema.Finite,
}) {
  override get message() {
    return `sound: movement "${this.movement}" is ${this.ms}ms, over the ${this.max}ms one movement may last; start another at a scene inside it`;
  }
}

/** A movement the music API cannot compose at its length. */
export type MovementLength = MovementTooShort | MovementTooLong;

/** A part of the film (an act) declared out of film order: it starts on or before the one declared ahead of it. */
export class PartOutOfOrder extends Schema.TaggedError<PartOutOfOrder>()('PartOutOfOrder', {
  part: Schema.String,
  from: Schema.String,
  after: Schema.String,
}) {
  override get message() {
    return `"${this.part}" starts on scene "${this.from}", which does not play after "${this.after}", the part declared ahead of it; declare parts in film order`;
  }
}

/** A score option asked for by name (`mix --score`) that the film's score does not have. */
export class ScoreUnknown extends Schema.TaggedError<ScoreUnknown>()('ScoreUnknown', {
  option: Schema.String,
  /** The score's options. */
  known: Schema.Array(Schema.String),
}) {
  override get message() {
    return `the score has no option "${this.option}"; its options are ${this.known.join(', ') || 'none'}`;
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

/** Why a point in a scene does not resolve. */
export type PointError = UnknownCue | UnknownMark | WordMissing;

export type SoundCueError = UnknownScene | PointError;

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

export type ShortError = ShortUnknownScene | PointError | ShortSpanEmpty;

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

/** A film's timings file is there, but the page could not fetch or read it. */
export class NarrationUnreadable extends Schema.TaggedError<NarrationUnreadable>()(
  'NarrationUnreadable',
  { film: Schema.String, url: Schema.String, reason: Schema.String },
) {
  override get message() {
    return `film "${this.film}": its narration timings at ${this.url} cannot be read (${this.reason}); the page will not lay the film out on estimates the tools do not use`;
  }
}
