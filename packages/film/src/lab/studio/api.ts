// The studio's routes as the recorder calls them, through the client derived
// from the lab API (`StudioGroup` in `core/api.ts`): each body encoded and
// each answer decoded by the `core/studio.ts` Schemas. A failure becomes the
// StudioRefusal the panel shows: the server's own (its tag, its words, and
// for a TakeMismatch the attempt it saved), or a request that never reached
// the server in its own words, so the panel always has a refusal to show.

import { Context, Effect, Layer, Option, Schema } from 'effect';
import { Base64 } from 'effect/encoding';
import { FetchHttpClient } from 'effect/http';
import {
  STUDIO_MAX_BODY,
  type StudioAttempts,
  type StudioBeats,
  StudioRefusal,
  type StudioTake,
  TakePost,
} from '../../core/studio.ts';
import { type LabFailure, heard, labClient } from '../api.ts';
import { BYTES_PER_SAMPLE, WAV_HEADER_BYTES, wavBytes, wavRate, wavSeconds } from './wav.ts';

/** The studio said no, or could not be reached: the refusal to show. */
export class StudioRefused extends Schema.TaggedError<StudioRefused>()('StudioRefused', {
  refusal: StudioRefusal,
}) {
  override get message() {
    return this.refusal.message;
  }
}

export interface StudioCalls {
  /** Every beat with a line: its sheet text and where its take stands. */
  readonly beats: Effect.Effect<StudioBeats, StudioRefused>;
  /** A beat's recordings, newest first. */
  readonly attempts: (beat: string) => Effect.Effect<StudioAttempts, StudioRefused>;
  /** A recording (a 24-bit WAV) made the beat's take. */
  readonly take: (beat: string, wav: Uint8Array) => Effect.Effect<StudioTake, StudioRefused>;
  /** An earlier attempt made the beat's take; `acceptMismatch` keeps one heard as something else. */
  readonly keep: (
    beat: string,
    file: string,
    acceptMismatch: boolean,
  ) => Effect.Effect<StudioTake, StudioRefused>;
}

export class StudioApi extends Context.Service<StudioApi, StudioCalls>()(
  '@bible/film/lab/StudioApi',
) {}

/** A failed call as the refusal it shows: a TakeMismatch with what it heard and the attempt it saved. */
export const refusalOf = (failure: LabFailure): StudioRefused => {
  if (failure._tag !== 'TakeMismatch')
    return StudioRefused.make({ refusal: { _tag: failure._tag, message: failure.message } });
  const heard: StudioRefusal = {
    _tag: failure._tag,
    message: failure.message,
    beat: failure.id,
    script: failure.script,
    heard: failure.heard,
    wer: failure.wer,
  };
  const refusal = Option.match(Option.fromUndefinedOr(failure.attempt), {
    onNone: () => heard,
    onSome: (attempt): StudioRefusal => ({ ...heard, attempt }),
  });
  return StudioRefused.make({ refusal });
};

/** The type a take is posted as. */
const WAV_TYPE = 'audio/wav';

const TakeJson = Schema.fromJsonString(TakePost);

/** The body a take posts: the WAV in base64, and its type, as JSON. */
export const takeBody = (wav: Uint8Array): string =>
  Schema.encodeSync(TakeJson)({ audio: Base64.encode(wav), type: WAV_TYPE });

/** The body's bytes around the base64. */
const ENVELOPE = takeBody(new Uint8Array(0)).length;

/** The longest take the studio reads: in samples, and in seconds at its rate. */
interface TakeLimit {
  readonly frames: number;
  readonly seconds: number;
}

/** The longest take at `rate` whose post fits STUDIO_MAX_BODY. */
export const takeLimit = (rate: number): TakeLimit => {
  // Base64 is 4 bytes for every 3 (the last 3 padded).
  const wavMax = Math.floor((STUDIO_MAX_BODY - ENVELOPE) / 4) * 3;
  const most = Math.floor((wavMax - WAV_HEADER_BYTES) / BYTES_PER_SAMPLE);
  // The pad byte after an odd data chunk may be one too many.
  const frames = most - Number(wavBytes(most) > wavMax);
  return { frames, seconds: frames / rate };
};

/** A length of time as the owner reads it: `6 min 20 s`, `6 min`, `42 s`. */
export const minutes = (seconds: number): string => {
  const whole = Math.floor(seconds);
  const m = Math.floor(whole / 60);
  const s = whole % 60;
  if (m === 0) return `${s} s`;
  if (s === 0) return `${m} min`;
  return `${m} min ${s} s`;
};

/** A refusal of `wav` as too large, in time rather than bytes; any other as it is. */
export const tooLong =
  (wav: Uint8Array) =>
  (refusal: StudioRefusal): StudioRefusal => {
    if (refusal._tag !== 'BodyTooLarge') return refusal;
    const rate = wavRate(wav);
    return {
      ...refusal,
      message: `the take is ${minutes(wavSeconds(wav))} long, and at ${rate / 1000} kHz the lab takes at most ${minutes(takeLimit(rate).seconds)}: record the beat in a shorter take`,
    };
  };

/** The studio's routes for `film` on `origin`. */
const makeStudioApi = Effect.fn('lab.studio.make')(function* (origin: string, film: string) {
  const client = (yield* labClient(origin)).studio;
  const api: StudioCalls = {
    beats: heard(client.beats({ params: { film } })).pipe(Effect.mapError(refusalOf)),
    attempts: (beat) =>
      heard(client.attempts({ params: { film, beat } })).pipe(Effect.mapError(refusalOf)),
    take: (beat, wav) =>
      heard(
        client.take({
          params: { film, beat },
          payload: { audio: Base64.encode(wav), type: WAV_TYPE },
        }),
      ).pipe(
        Effect.mapError((failure) =>
          StudioRefused.make({ refusal: tooLong(wav)(refusalOf(failure).refusal) }),
        ),
      ),
    keep: (beat, file, acceptMismatch) =>
      heard(client.keep({ params: { film, beat }, payload: { file, acceptMismatch } })).pipe(
        Effect.mapError(refusalOf),
      ),
  };
  return api;
});

/** The studio's routes for `film`, on the page's own origin, over `fetch`. */
export const studioApiLayer = (origin: string, film: string): Layer.Layer<StudioApi> =>
  Layer.effect(StudioApi, makeStudioApi(origin, film)).pipe(Layer.provide(FetchHttpClient.layer));
