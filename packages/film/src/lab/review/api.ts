// The review's routes as its page calls them, through the page's one client
// of the lab's API (`LabClient`, `ReviewGroup` in `core/api.ts`): the index, a
// video's length and a say on a set's version decoded by their
// Schemas. A doc's text is the file itself, fetched by its URL (the route's
// path is the ref, which the derived client does not build). A refusal is
// the server's own failure; a request that never arrived says so
// (`LabFailure`, as every lab call fails).

import { Context, Effect, Layer } from 'effect';
import { HttpClient, HttpClientResponse } from 'effect/http';
import {
  type DraftRead,
  type MarksPost,
  Refusal,
  type ScriptBeats,
  type ScriptVoice,
  type SeriesList,
  type SetSaid,
  type SetSayPost,
  reviewFileUrl,
  reviewPhoneUrl,
} from '../../core/api.ts';
import type { BoardFile } from '../../core/board.ts';
import type { MoveForward, ProductionFile, Productions } from '../../core/production.ts';
import type { AskRecord, StepValues } from '../../core/ask.ts';
import type { LabWrite } from '../../core/schema.ts';
import type { StudioAttempts } from '../../core/studio.ts';
import type { ReviewDuration, ReviewIndex } from '../../core/review.ts';
import { LabClient, type LabFailure, called } from '../api.ts';

interface ReviewCalls {
  /** Every folder with something to review; `fresh` walks the roots again now. */
  readonly index: (fresh: boolean) => Effect.Effect<ReviewIndex, LabFailure>;
  /** A video's length, in seconds, and its frames a second as its own packets give them (never rounded; none when it has no video). */
  readonly duration: (ref: string) => Effect.Effect<ReviewDuration, LabFailure>;
  /** A doc's text (a variant's notes, a folder's markdown). */
  readonly text: (ref: string) => Effect.Effect<string, LabFailure>;
  /** Whether a video's phone copy is made: its URL asked for its head alone, none of its bytes. */
  readonly phoneMade: (ref: string) => Effect.Effect<boolean, LabFailure>;
  /** A say on a version of the set `point` in `folder`: the folder as it leaves it, what it gave or took. */
  readonly say: (
    folder: string,
    point: string,
    said: SetSayPost,
  ) => Effect.Effect<SetSaid, LabFailure>;
  /** Every production's ledger (`core/production.ts`). */
  readonly productions: Effect.Effect<Productions, LabFailure>;
  /** A film's storyboard as its record stands now (`core/board.ts`): a production's first stage. */
  readonly board: (film: string) => Effect.Effect<BoardFile, LabFailure>;
  /** `production` moved forward from the version the page saw: its ledger as the move leaves it. */
  readonly forward: (
    production: string,
    move: MoveForward,
  ) => Effect.Effect<ProductionFile, LabFailure>;
  /** An agent's ask, as the lab keeps it (`core/ask.ts`). */
  readonly ask: (id: string) => Effect.Effect<AskRecord, LabFailure>;
  /** The owner's answers to ask `id`'s page, each section's in order: the ask as they leave it. */
  readonly answer: (
    id: string,
    sections: ReadonlyArray<{ readonly step: string; readonly values: StepValues }>,
  ) => Effect.Effect<AskRecord, LabFailure>;
  /** A film's script as its `script.ts` reads now: each beat's line, picture and sources. */
  readonly script: (film: string) => Effect.Effect<ScriptBeats, LabFailure>;
  /** Each spoken beat of a film's script as its staging take stands, and the day's spend. */
  readonly filmVoice: (film: string) => Effect.Effect<ScriptVoice, LabFailure>;
  /** A beat's delivery marks written into a film's `script.ts`. */
  readonly filmMarks: (film: string, post: MarksPost) => Effect.Effect<LabWrite, LabFailure>;
  /** A film's recorded takes of beat `beat`, newest first, the kept one among them. */
  readonly attempts: (film: string, beat: string) => Effect.Effect<StudioAttempts, LabFailure>;
  /** The app's series and their drafts. */
  readonly series: Effect.Effect<SeriesList, LabFailure>;
  /** Series draft `draft` of `series`, as its Markdown reads now. */
  readonly draft: (series: string, draft: string) => Effect.Effect<DraftRead, LabFailure>;
  /** Each spoken beat of a series draft as its staging take stands, and the day's spend. */
  readonly draftVoice: (series: string, draft: string) => Effect.Effect<ScriptVoice, LabFailure>;
  /** A beat's delivery marks written into a series draft: the draft as it leaves it. */
  readonly draftMarks: (
    series: string,
    draft: string,
    post: MarksPost,
  ) => Effect.Effect<DraftRead, LabFailure>;
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
    phoneMade: (ref) =>
      called(Effect.map(http.head(reviewPhoneUrl(ref)), (res) => res.status === 200)),
    say: (folder, point, said) => called(client.say({ params: { folder, point }, payload: said })),
    productions: called(lab.productions.list()),
    board: (film) => called(lab.board.read({ params: { film } })),
    forward: (production, move) =>
      called(lab.productions.forward({ params: { production }, payload: move })),
    ask: (id) => called(lab.asks.read({ params: { ask: id } })),
    answer: (id, sections) =>
      called(lab.asks.answer({ params: { ask: id }, payload: { sections } })),
    script: (film) => called(lab.script.beats({ params: { film } })),
    filmVoice: (film) => called(lab.script.voice({ params: { film } })),
    filmMarks: (film, post) => called(lab.script.marks({ params: { film }, payload: post })),
    attempts: (film, beat) => called(lab.studio.attempts({ params: { film, beat } })),
    series: called(lab.series.list()),
    draft: (series, draft) => called(lab.series.read({ params: { series, draft } })),
    draftVoice: (series, draft) => called(lab.series.voice({ params: { series, draft } })),
    draftMarks: (series, draft, post) =>
      called(lab.series.marks({ params: { series, draft }, payload: post })),
  };
  return api;
});

/** The review's routes on the page's own origin, over the page's one client (given at its root). */
export const reviewApiLayer: Layer.Layer<ReviewApi, never, LabClient | HttpClient.HttpClient> =
  Layer.effect(ReviewApi, makeReviewApi());
