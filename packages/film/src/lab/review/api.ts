// The review's routes as its page calls them, through the page's one client
// of the lab's API (`LabClient`, `ReviewGroup` in `core/api.ts`): the index, a
// video's length and a say on a set's version decoded by their
// Schemas. A doc's text is the file itself, fetched by its URL (the route's
// path is the ref, which the derived client does not build). A refusal is
// the server's own failure; a request that never arrived says so
// (`LabFailure`, as every lab call fails).

import { Context, Effect, Layer } from 'effect';
import { HttpClient, HttpClientResponse } from 'effect/http';
import { Refusal, type SetSaid, type SetSayPost, reviewFileUrl } from '../../core/api.ts';
import type { MoveForward, ProductionFile, Productions } from '../../core/production.ts';
import type { ReviewDuration, ReviewIndex } from '../../core/review.ts';
import { LabClient, type LabFailure, called } from '../api.ts';

interface ReviewCalls {
  /** Every folder with something to review; `fresh` walks the roots again now. */
  readonly index: (fresh: boolean) => Effect.Effect<ReviewIndex, LabFailure>;
  /** A video's length, in seconds, and its frames a second as its own packets give them (never rounded; none when it has no video). */
  readonly duration: (ref: string) => Effect.Effect<ReviewDuration, LabFailure>;
  /** A doc's text (a variant's notes, a folder's markdown). */
  readonly text: (ref: string) => Effect.Effect<string, LabFailure>;
  /** A say on a version of the set `point` in `folder`: the folder as it leaves it, what it gave or took. */
  readonly say: (
    folder: string,
    point: string,
    said: SetSayPost,
  ) => Effect.Effect<SetSaid, LabFailure>;
  /** Every production's ledger (`core/production.ts`). */
  readonly productions: Effect.Effect<Productions, LabFailure>;
  /** `production` moved forward from the version the page saw: its ledger as the move leaves it. */
  readonly forward: (
    production: string,
    move: MoveForward,
  ) => Effect.Effect<ProductionFile, LabFailure>;
}

export class ReviewApi extends Context.Service<ReviewApi, ReviewCalls>()(
  '@bible/film/lab/ReviewApi',
) {}

/** A file's text when it is served; the server's refusal (JSON, by the contract) when not. */
const fileText = (res: HttpClientResponse.HttpClientResponse) => {
  if (res.status >= 200 && res.status < 300) return res.text;
  return Effect.flatMap(HttpClientResponse.schemaBodyJson(Refusal)(res), Effect.fail);
};

/** The review's routes on the page's own origin: a doc's URL is a path, resolved against the page's address. */
const makeReviewApi = Effect.fn('lab.review.api')(function* () {
  const lab = yield* LabClient;
  const client = lab.review;
  const http = yield* HttpClient.HttpClient;
  const api: ReviewCalls = {
    index: (fresh) => {
      if (fresh) return called(client.index({ query: { fresh: '1' } }));
      return called(client.index({ query: {} }));
    },
    duration: (ref) => called(client.duration({ query: { ref } })),
    text: (ref) => called(Effect.flatMap(http.get(reviewFileUrl(ref)), fileText)),
    say: (folder, point, said) => called(client.say({ params: { folder, point }, payload: said })),
    productions: called(lab.productions.list()),
    forward: (production, move) =>
      called(lab.productions.forward({ params: { production }, payload: move })),
  };
  return api;
});

/** The review's routes on the page's own origin, over the page's one client (given at its root). */
export const reviewApiLayer: Layer.Layer<ReviewApi, never, LabClient | HttpClient.HttpClient> =
  Layer.effect(ReviewApi, makeReviewApi());
