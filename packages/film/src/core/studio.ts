// The lab's studio on the wire: what its panel reads (each beat's line as the
// reading sheet sets it, and where its take stands) and what it sends (a
// recorded take, or an earlier attempt to keep). Every body and answer is one
// of these Schemas, decoded on both sides. Pure: the page and the tools share
// them.

import { Schema } from 'effect';
import { TakeSource, Timings, VoiceTiming } from './schema.ts';

/** A stretch of a beat on the sheet: words to read (and who reads them), or a quotation. */
export const StudioPart = Schema.Union([
  Schema.Struct({
    kind: Schema.Literal('line'),
    /** The reader a turn names; absent for the film's one voice. */
    voice: Schema.optionalKey(Schema.String),
    text: Schema.String,
  }),
  Schema.Struct({
    kind: Schema.Literal('quotation'),
    text: Schema.String,
    /** `author, ref` of the `quotes.jsonl` record whose words hold it. */
    by: Schema.optionalKey(Schema.String),
  }),
]);
export type StudioPart = typeof StudioPart.Type;

/** Why a take is stale. */
export const StudioStaleReason = Schema.Literals(['missing', 'text changed', 'voice changed']);

/** One beat as the studio lists it. */
export const StudioBeat = Schema.Struct({
  id: Schema.String,
  /** The name `takes import` reads it under, for a recording made elsewhere. */
  file: Schema.String,
  parts: Schema.Array(StudioPart),
  sources: Schema.Array(Schema.String),
  /** `recorded`: a person's take, current; `staging`: ElevenLabs'; `stale`: see `staleReason`. */
  state: Schema.Literals(['recorded', 'staging', 'stale']),
  staleReason: Schema.optionalKey(StudioStaleReason),
  /** Whether the take the timings name (current or stale) is a person's. */
  recorded: Schema.Boolean,
  /** The take the timings name, if any. */
  take: Schema.optionalKey(
    Schema.Struct({ file: Schema.String, duration: Schema.Finite, source: TakeSource }),
  ),
  /** How many recordings of this beat are kept to hear or keep instead. */
  attempts: Schema.Int,
});
export type StudioBeat = typeof StudioBeat.Type;

/** `GET /lab/<film>/studio/beats`. */
export const StudioBeats = Schema.Struct({ film: Schema.String, beats: Schema.Array(StudioBeat) });
export type StudioBeats = typeof StudioBeats.Type;

/** `POST /lab/<film>/studio/takes/:beat`: one recording, as the browser made it. */
export const TakePost = Schema.Struct({
  /** The recording's bytes, base64. */
  audio: Schema.String,
  /**
   * Its media type: `audio/wav` or `audio/flac` (and their `x-` spellings),
   * since the take is the film's master; a lossy type (`audio/webm`,
   * `audio/mp4`, `audio/mpeg`…) is refused 415 `RecordingLossy`.
   */
  type: Schema.String,
  /** Keep it even when its transcript does not match the line. */
  acceptMismatch: Schema.optionalKey(Schema.Boolean),
});
export type TakePost = typeof TakePost.Type;

/** `POST /lab/<film>/studio/takes/:beat/keep`: an earlier attempt, kept as the take. */
export const KeepPost = Schema.Struct({
  file: Schema.String,
  acceptMismatch: Schema.optionalKey(Schema.Boolean),
});
export type KeepPost = typeof KeepPost.Type;

/** A take kept: the beat's new timing, the film's timings as they now stand, and whether the track was remixed. */
export const StudioTake = Schema.Struct({
  beat: Schema.String,
  take: VoiceTiming,
  heard: Schema.String,
  wer: Schema.Finite,
  timings: Timings,
  /** `narration/full.wav` was rebuilt with the take (false: the mix failed, and the log says why). */
  mixed: Schema.Boolean,
});
export type StudioTake = typeof StudioTake.Type;

/** One recording of a beat, as the studio lists it to hear or keep. */
export const StudioAttempt = Schema.Struct({
  file: Schema.String,
  heard: Schema.String,
  wer: Schema.Finite,
  /** When it was recorded, epoch milliseconds. */
  at: Schema.Finite,
  duration: Schema.Finite,
  /** The take the timings name. */
  kept: Schema.Boolean,
  /** Recorded for the line as it reads now (an attempt at an earlier line cannot be kept). */
  current: Schema.Boolean,
});
export type StudioAttempt = typeof StudioAttempt.Type;

/** `GET /lab/<film>/studio/takes/:beat/attempts`: newest first. */
export const StudioAttempts = Schema.Struct({
  beat: Schema.String,
  attempts: Schema.Array(StudioAttempt),
});
export type StudioAttempts = typeof StudioAttempts.Type;

/**
 * What the studio answers when it does not keep a take: the failure's tag and
 * message, and for a `TakeMismatch` what was heard and the attempt it saved,
 * which `keep` with `acceptMismatch` makes the take.
 */
export const StudioRefusal = Schema.Struct({
  _tag: Schema.String,
  message: Schema.String,
  beat: Schema.optionalKey(Schema.String),
  script: Schema.optionalKey(Schema.String),
  heard: Schema.optionalKey(Schema.String),
  wer: Schema.optionalKey(Schema.Finite),
  attempt: Schema.optionalKey(Schema.String),
});
export type StudioRefusal = typeof StudioRefusal.Type;
