// The studio's routes as the recorder calls them, through the client derived
// from the lab API (`StudioGroup` in `core/api.ts`): each body encoded and
// each answer decoded by the `core/studio.ts` Schemas. A failure is the
// server's own refusal as it is (a TakeMismatch with what it heard and the
// attempt it saved), a request that never reached the server in its own
// words (LabUnreachable), or a take too long for the route, said in time.

import { Context, Effect, Layer, Schema } from 'effect';
import { Base64 } from 'effect/encoding';
import {
  STUDIO_MAX_BODY,
  type StudioAttempts,
  type StudioBeats,
  type StudioTake,
  TakePost,
} from '../../core/studio.ts';
import { LabClient, type LabFailure, called } from '../api.ts';
import { BYTES_PER_SAMPLE, WAV_HEADER_BYTES, wavBytes, wavRate, wavSeconds } from './wav.ts';

/** A take the studio refused as too large, said in time rather than bytes. */
export class TakeTooLong extends Schema.TaggedError<TakeTooLong>()('TakeTooLong', {
  /** The take's length, in seconds. */
  seconds: Schema.Finite,
  /** Its capture rate, in Hz. */
  rate: Schema.Finite,
}) {
  override get message() {
    return `the take is ${minutes(this.seconds)} long, and at ${this.rate / 1000} kHz the lab takes at most ${minutes(takeLimit(this.rate).seconds)}: record the beat in a shorter take`;
  }
}

/** Why a studio call gave no answer: the server's refusal, the lab not reached, or a take too long. */
type StudioFailure = LabFailure | TakeTooLong;

export interface StudioCalls {
  /** Every beat with a line: its sheet text and where its take stands. */
  readonly beats: Effect.Effect<StudioBeats, LabFailure>;
  /** A beat's recordings, newest first. */
  readonly attempts: (beat: string) => Effect.Effect<StudioAttempts, LabFailure>;
  /** A recording (a 24-bit WAV) made the beat's take. */
  readonly take: (beat: string, wav: Uint8Array) => Effect.Effect<StudioTake, StudioFailure>;
  /** An earlier attempt made the beat's take; `acceptMismatch` keeps one heard as something else. */
  readonly keep: (
    beat: string,
    file: string,
    acceptMismatch: boolean,
  ) => Effect.Effect<StudioTake, LabFailure>;
}

export class StudioApi extends Context.Service<StudioApi, StudioCalls>()(
  '@bible/film/lab/StudioApi',
) {}

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
  (failure: LabFailure): StudioFailure => {
    if (failure._tag !== 'BodyTooLarge') return failure;
    return TakeTooLong.make({ seconds: wavSeconds(wav), rate: wavRate(wav) });
  };

/** The studio's routes for `film`, over the page's derived client. */
const makeStudioApi = Effect.fn('lab.studio.make')(function* (film: string) {
  const client = (yield* LabClient).studio;
  const api: StudioCalls = {
    beats: called(client.beats({ params: { film } })),
    attempts: (beat) => called(client.attempts({ params: { film, beat } })),
    take: (beat, wav) =>
      called(
        client.take({
          params: { film, beat },
          payload: { audio: Base64.encode(wav), type: WAV_TYPE },
        }),
      ).pipe(Effect.mapError(tooLong(wav))),
    keep: (beat, file, acceptMismatch) =>
      called(client.keep({ params: { film, beat }, payload: { file, acceptMismatch } })),
  };
  return api;
});

/** The studio's routes for `film`, over the page's derived client. */
export const studioApiLayer = (film: string): Layer.Layer<StudioApi, never, LabClient> =>
  Layer.effect(StudioApi, makeStudioApi(film));
