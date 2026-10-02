// The review's routes as its page calls them, through the client derived
// from the review API (`ReviewGroup` in `core/api.ts`): the index and a
// video's length decoded by their Schemas. A doc's text is the file itself,
// fetched by its URL (the route's path is the ref, which the derived client
// does not build). A refusal is the server's own failure; a request that
// never arrived says so (`LabFailure`, as every lab call fails).

import { Context, Effect, Layer } from 'effect';
import { FetchHttpClient, HttpClient, HttpClientResponse } from 'effect/http';
import { HttpApiClient } from 'effect/http-api';
import { Refusal, LabHttpApi, reviewFileUrl } from '../../core/api.ts';
import type { ReviewIndex } from '../../core/review.ts';
import { type LabFailure, called } from '../api.ts';

interface ReviewCalls {
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

/** A file's text when it is served; the server's refusal (JSON, by the contract) when not. */
const fileText = (res: HttpClientResponse.HttpClientResponse) => {
  if (res.status >= 200 && res.status < 300) return res.text;
  return Effect.flatMap(HttpClientResponse.schemaBodyJson(Refusal)(res), Effect.fail);
};

/** The review's routes on `origin`. */
const makeReviewApi = Effect.fn('lab.review.api')(function* (origin: string) {
  const client = (yield* HttpApiClient.make(LabHttpApi, { baseUrl: origin })).review;
  const http = yield* HttpClient.HttpClient;
  const api: ReviewCalls = {
    index: (fresh) => {
      if (fresh) return called(client.index({ query: { fresh: '1' } }));
      return called(client.index({ query: {} }));
    },
    duration: (ref) => called(Effect.map(client.duration({ query: { ref } }), (d) => d.seconds)),
    text: (ref) => called(Effect.flatMap(http.get(`${origin}${reviewFileUrl(ref)}`), fileText)),
  };
  return api;
});

/** The review's routes on the page's own origin, over `fetch`. */
export const reviewApiLayer = (origin: string): Layer.Layer<ReviewApi> =>
  Layer.effect(ReviewApi, makeReviewApi(origin)).pipe(Layer.provide(FetchHttpClient.layer));
