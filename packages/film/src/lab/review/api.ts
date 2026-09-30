// The review's routes (`/review/*`) as its page calls them, through the lab's
// client: the index and a video's length decoded by their Schemas, a doc's
// text as it is. A refusal is the server's own words; a request that never
// arrived says so (`LabFailure`, as every lab call fails).

import { Context, Effect, Layer } from 'effect';
import { FetchHttpClient, HttpClient } from 'effect/unstable/http';
import { ReviewDuration, ReviewIndex, reviewFileUrl } from '../../core/schema.ts';
import { type LabFailure, LabRefused, LabUnreachable, labClient } from '../api.ts';

export interface ReviewCalls {
  /** Every folder with something to review; `fresh` walks the roots again now. */
  readonly index: (fresh: boolean) => Effect.Effect<ReviewIndex, LabFailure>;
  /** A video's length, in seconds. */
  readonly duration: (ref: string) => Effect.Effect<number, LabFailure>;
  /** A doc's text (a variant's notes, a folder's markdown). */
  readonly text: (ref: string) => Effect.Effect<string, LabFailure>;
}

export class ReviewApi extends Context.Service<ReviewApi, ReviewCalls>()(
  '@bible/film/lab/ReviewApi',
) {}

const unreachable = (cause: { readonly message: string }) =>
  LabUnreachable.make({ message: cause.message });

/** The review's routes on `origin`. */
export const makeReviewApi = Effect.fn('lab.review.api')(function* (origin: string) {
  const { get } = yield* labClient(origin, '/review');
  const http = yield* HttpClient.HttpClient;
  const text = (ref: string) =>
    http.get(`${origin}${reviewFileUrl(ref)}`).pipe(
      Effect.mapError(unreachable),
      Effect.flatMap((res) =>
        Effect.mapError(res.text, unreachable).pipe(
          Effect.flatMap((body) => {
            if (res.status >= 200 && res.status < 300) return Effect.succeed(body);
            return Effect.fail(LabRefused.make({ status: res.status, message: body }));
          }),
        ),
      ),
    );
  const api: ReviewCalls = {
    index: (fresh) => {
      if (fresh) return get('/index?fresh=1', ReviewIndex);
      return get('/index', ReviewIndex);
    },
    duration: (ref) =>
      Effect.map(get(`/duration?ref=${encodeURIComponent(ref)}`, ReviewDuration), (d) => d.seconds),
    text,
  };
  return api;
});

/** The review's routes on the page's own origin, over `fetch`. */
export const reviewApiLayer = (origin: string): Layer.Layer<ReviewApi> =>
  Layer.effect(ReviewApi, makeReviewApi(origin)).pipe(Layer.provide(FetchHttpClient.layer));
