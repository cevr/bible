// The studio's routes (`/lab/<film>/studio/*`) as the recorder calls them,
// through the lab's client: each body encoded and each answer decoded by the
// `core/studio.ts` Schemas. A refusal is the server's StudioRefusal (its tag,
// its words, and for a TakeMismatch the attempt it saved); an answer that is
// not one, or a request that never reached the server, becomes one in its
// own words, so the panel always has a refusal to show.

import { Context, Effect, Layer, Result, Schema } from 'effect';
import { Base64 } from 'effect/encoding';
import { FetchHttpClient } from 'effect/http';
import {
  KeepPost,
  STUDIO_MAX_BODY,
  StudioAttempts,
  StudioBeats,
  StudioRefusal,
  StudioTake,
  TakePost,
} from '../../core/studio.ts';
import { type LabFailure, labClient } from '../api.ts';
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

const RefusalJson = Schema.fromJsonString(StudioRefusal);

/** A failed call as the refusal it shows: the server's own, else its text. */
export const refusalOf = (failure: LabFailure): StudioRefused =>
  StudioRefused.make({
    refusal: Result.getOrElse(
      Schema.decodeResult(RefusalJson)(failure.message),
      (): StudioRefusal => ({ _tag: failure._tag, message: failure.message }),
    ),
  });

/** The type a take is posted as. */
const WAV_TYPE = 'audio/wav';

const TakeJson = Schema.fromJsonString(TakePost);

/** The body a take posts: the WAV in base64, and its type, as JSON. */
export const takeBody = (wav: Uint8Array): string =>
  Schema.encodeSync(TakeJson)({ audio: Base64.encode(wav), type: WAV_TYPE });

/** The body's bytes around the base64. */
const ENVELOPE = takeBody(new Uint8Array(0)).length;

/** The longest take the studio reads: in samples, and in seconds at its rate. */
export interface TakeLimit {
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

/** A path of `parts` under the studio, each one encoded. */
const studioPath = (...parts: ReadonlyArray<string>) =>
  `/studio/${parts.map((p) => encodeURIComponent(p)).join('/')}`;

/** Where an attempt's audio plays from, under the lab API root `base`. */
export const attemptSrc = (base: string, beat: string, file: string): string =>
  `${base}${studioPath('takes', beat, 'attempts', file)}`;

/** The studio's routes under `base` (`labBase(film)`) on `origin`. */
export const makeStudioApi = Effect.fn('lab.studio.make')(function* (origin: string, base: string) {
  const { get, post } = yield* labClient(origin, base);
  const api: StudioCalls = {
    beats: get(studioPath('beats'), StudioBeats).pipe(Effect.mapError(refusalOf)),
    attempts: (beat) =>
      get(studioPath('takes', beat, 'attempts'), StudioAttempts).pipe(Effect.mapError(refusalOf)),
    take: (beat, wav) =>
      post(
        studioPath('takes', beat),
        TakePost,
        { audio: Base64.encode(wav), type: WAV_TYPE },
        StudioTake,
      ).pipe(
        Effect.mapError((failure) =>
          StudioRefused.make({ refusal: tooLong(wav)(refusalOf(failure).refusal) }),
        ),
      ),
    keep: (beat, file, acceptMismatch) =>
      post(studioPath('takes', beat, 'keep'), KeepPost, { file, acceptMismatch }, StudioTake).pipe(
        Effect.mapError(refusalOf),
      ),
  };
  return api;
});

/** The studio's routes for the film at `base`, on the page's own origin, over `fetch`. */
export const studioApiLayer = (origin: string, base: string): Layer.Layer<StudioApi> =>
  Layer.effect(StudioApi, makeStudioApi(origin, base)).pipe(Layer.provide(FetchHttpClient.layer));
