// The studio's routes (`/lab/<film>/studio/*`) as the recorder calls them,
// through the lab's client: each body encoded and each answer decoded by the
// `core/studio.ts` Schemas. A refusal is the server's StudioRefusal (its tag,
// its words, and for a TakeMismatch the attempt it saved); an answer that is
// not one, or a request that never reached the server, becomes one in its
// own words, so the panel always has a refusal to show.

import { Context, Effect, Encoding, Layer, Result, Schema } from 'effect';
import { FetchHttpClient } from 'effect/unstable/http';
import {
  KeepPost,
  StudioAttempts,
  StudioBeats,
  StudioRefusal,
  StudioTake,
  TakePost,
} from '../../core/studio.ts';
import { type LabFailure, labClient } from '../api.ts';

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
        { audio: Encoding.encodeBase64(wav), type: 'audio/wav' },
        StudioTake,
      ).pipe(Effect.mapError(refusalOf)),
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
