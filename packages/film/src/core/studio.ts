// The lab's studio on the wire: what its panel reads (each beat's line as the
// reading sheet sets it, and where its take stands) and what it sends (a
// recorded take, or an earlier attempt to keep). Every body and answer is one
// of these Schemas, decoded on both sides. Pure: the page and the tools share
// them.

import { Schema } from 'effect';
import { Line, TakeStaleReason } from './narration.ts';
import { HeardAs, TakeSource, Timings, Voice, VoiceTiming } from './schema.ts';
import { SheetBeat } from './sheet.ts';

/**
 * The largest body the studio reads, in bytes: 64 MiB, a base64 recording of
 * about six minutes of 48 kHz 24-bit mono (a beat's line runs seconds). The
 * page derives the longest take it may record from it.
 */
export const STUDIO_MAX_BODY = 64 * 1024 * 1024;

/**
 * How long the page waits for an import (a take made, heard, kept and the
 * track remixed) before it stops waiting and reads the beat's attempts to
 * learn what became of it. Measured through the studio harness, an import
 * with its speech-to-text faked takes 5 to 7 s (a 2 s and a 60 s take); the
 * real transcriber adds its own time, longest for the longest take.
 */
export const STUDIO_IMPORT_WAIT_S = 210;

/**
 * How long the server keeps a take's connection open with nothing sent: past
 * the page's wait, so the page is the one that stops waiting, never the
 * socket (Bun's idle limit is 255 s at most).
 */
export const STUDIO_IMPORT_IDLE_S = 240;

/** A beat as a take is kept against it: its words, the text a take is hashed under, and who reads what. */
export const ReadBeat = Schema.Struct({
  id: Schema.String,
  /** What is said. */
  text: Schema.String,
  /** What is said and who says it: a take is kept under this text's hash. */
  script: Schema.String,
  /** Who reads what: the whole beat for a film with one voice, a line per turn for a cast. */
  lines: Schema.Array(Line),
});
export type ReadBeat = typeof ReadBeat.Type;

/**
 * What the studio reads of a film's script and voice, as `film read voice`
 * answers it from a fresh process: the lab's own imports of `script.ts`,
 * `voice.ts` and the scenes stay as they were when it started, so a line
 * fixed while the lab is open reaches the sheet and the take only through
 * this.
 */
export const StudioReading = Schema.Struct({
  voice: Voice,
  heardAs: HeardAs,
  beats: Schema.Array(ReadBeat),
  sheet: Schema.Array(SheetBeat),
});
export type StudioReading = typeof StudioReading.Type;

/** One beat as the studio lists it. */
export const StudioBeat = Schema.Struct({
  /** Its line as the sheet sets it: the file `takes import` reads it under, its parts and sources. */
  ...SheetBeat.fields,
  /** `recorded`: a person's take, current; `staging`: ElevenLabs'; `stale`: see `staleReason`. */
  state: Schema.Literals(['recorded', 'staging', 'stale']),
  staleReason: Schema.optionalKey(TakeStaleReason),
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

/** `GET /api/films/<film>/studio/beats`. */
export const StudioBeats = Schema.Struct({ film: Schema.String, beats: Schema.Array(StudioBeat) });
export type StudioBeats = typeof StudioBeats.Type;

/** `POST /api/films/<film>/studio/takes/:beat`: one recording, as the browser made it. */
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

/** `POST /api/films/<film>/studio/takes/:beat/keep`: an earlier attempt, kept as the take. */
export const KeepPost = Schema.Struct({
  file: Schema.String,
  acceptMismatch: Schema.optionalKey(Schema.Boolean),
});
export type KeepPost = typeof KeepPost.Type;

/** A take kept: the beat's new timing, the film's timings as they now stand, and whether the track was remixed. */
export const StudioTake = Schema.Struct({
  beat: Schema.String,
  take: VoiceTiming,
  /** What speech-to-text heard the take say. */
  transcript: Schema.String,
  wer: Schema.Finite,
  timings: Timings,
  /** `narration/full.wav` was rebuilt with the take (false: the mix failed, and the log says why). */
  mixed: Schema.Boolean,
});
export type StudioTake = typeof StudioTake.Type;

/** One recording of a beat, as the studio lists it to hear or keep. */
export const StudioAttempt = Schema.Struct({
  file: Schema.String,
  /** What speech-to-text heard the attempt say. */
  transcript: Schema.String,
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

/** `GET /api/films/<film>/studio/takes/:beat/attempts`: newest first. */
export const StudioAttempts = Schema.Struct({
  beat: Schema.String,
  attempts: Schema.Array(StudioAttempt),
});
export type StudioAttempts = typeof StudioAttempts.Type;
