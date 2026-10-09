// The lab API as the page's machines call it: a client derived from the
// routes' one declaration (`LabHttpApi` in `core/api.ts`), so each body is
// encoded and each answer decoded by the route's own Schema. A refusal is
// the server's own failure class (`SourceRefused`, `NoteNotFound`, …), its
// message the words the panel shows; a request that never reached the
// server, or an answer that does not decode, is LabUnreachable in its own
// words. One client (`LabClient`) serves every page's calls: the scene
// source routes are `LabApi`, the notes routes `NotesApi`, and the studio's,
// the review's and the choices' build on it (`studio/api.ts`,
// `review/api.ts`, `review/options/api.ts`). An Undo or Redo carries an id
// unique to its request (`stepRequest`), so either page whose step had no
// answer learns from the lab's check whether it landed (`landedStep`).

import { Array as Arr, Cause, Context, Effect, Layer, Option, Predicate, Schema } from 'effect';
import { FetchHttpClient, HttpClient, HttpClientRequest } from 'effect/http';
import { HttpApiClient } from 'effect/http-api';
import * as AsyncResult from 'effect/reactivity/AsyncResult';
import * as Atom from 'effect/reactivity/Atom';
import { type Bound, Unfit, boundChange } from '../command/command.ts';
import { LabHttpApi, Refusal, isRefusal } from '../core/api.ts';
import type { PageRequest } from '../core/page-render.ts';
import { newerFirst } from '../core/refusals.ts';
import { uniqueId } from '../core/unique.ts';
import {
  type ChangeId,
  type CheckReport,
  type CuePatch,
  type HeadSource,
  type Knob,
  type LabWrite,
  type Note,
  type NotePost as NotePostSchema,
  type NotesFile,
  type NotesWait,
  RequestId,
  type SceneCode,
  type SceneSource,
} from '../core/schema.ts';

/** The request did not reach the server, or its answer did not decode. */
export class LabUnreachable extends Schema.TaggedError<LabUnreachable>()('LabUnreachable', {
  message: Schema.String,
}) {}

/** A call that failed: the server said no (its own failure), or could not be reached. */
export type LabFailure = Refusal | LabUnreachable;

/** A failed call as the page's data carries it from the server to the client (`served`). */
const LabFailure = Schema.Union([Refusal, LabUnreachable]);

/**
 * A read of the lab the server renders a page with and sends along, for the
 * client to adopt rather than read again (`Atom.serializable`, adopted by
 * `@bible/atom-solid`'s hooks): the read's answer, or its failure, encoded
 * by `success`'s schema and `LabFailure`'s, under `key`, which names it
 * among the page's reads.
 */
export const served =
  <A, I>(key: string, success: Schema.Codec<A, I>) =>
  (read: Atom.Atom<AsyncResult.AsyncResult<A, LabFailure>>) =>
    Atom.serializable(read, {
      key,
      schema: AsyncResult.Schema({ success, error: LabFailure }),
    });

/**
 * A call through a derived client as the page takes it: the server's refusal
 * as it is, anything else (the request failed, the answer did not decode)
 * LabUnreachable with its words.
 */
export const called = <A, E extends { readonly message: string }, R>(
  self: Effect.Effect<A, E, R>,
): Effect.Effect<A, LabFailure, R> =>
  Effect.mapError(self, (error): LabFailure => {
    if (isRefusal(error)) return error;
    return LabUnreachable.make({ message: error.message });
  });

/** A failed call, in the words its failure gives. */
export const reasonOf = (cause: Cause.Cause<unknown>): string => {
  const squashed = Cause.squash(cause);
  if (Predicate.hasProperty(squashed, 'message') && Predicate.isString(squashed.message))
    return squashed.message;
  return String(squashed);
};

/** Undo or Redo: the server's bounded stack of the lab's writes. */
export const StepVerb = Schema.Literals(['undo', 'redo']);
export type StepVerb = typeof StepVerb.Type;

/** An id for an Undo or Redo request that no other request has, from any page (`StepRequest.request`). */
export const stepRequest: Effect.Effect<RequestId> = uniqueId(RequestId);

/**
 * The step the lab recorded under `request` (`CheckReport.landed`), as its
 * answer would have said it, with the check now: what a page whose step had
 * no answer learns by its id. None when the lab has no record of it (it did
 * not land, or has not yet).
 */
export const landedStep = (report: CheckReport, request: RequestId): Option.Option<LabWrite> =>
  Option.map(
    Option.flatMap(Option.fromUndefinedOr(report.landed), (steps) =>
      Arr.findFirst(steps, (l) => l.request === request),
    ),
    ({ request: _, ...walked }): LabWrite => ({ ...walked, findings: report.findings }),
  );

/** What a step's receipt's button does once it lands: Redo for an Undo, Undo for a Redo. */
const OTHER: Readonly<Record<StepVerb, StepVerb>> = { undo: 'redo', redo: 'undo' };

const STEPPED: Readonly<Record<StepVerb, string>> = { undo: 'undone', redo: 'redone' };

/**
 * Why a step of `verb` on `film`, whose history the page knows as `steps`
 * (none while it reads it), cannot take the one change `bound` names (a
 * receipt's). For now (`Unfit.Now`): another film's, stepped that way
 * already (the other way's newest), or another change stands before it.
 * Never (`Unfit.Never`): nothing to step that way and the change not the
 * other way's newest, so the lab no longer has it (it restarted: its
 * history is in memory; or it was stepped already). None when it can, or
 * while the page reads the history (the command is not available then, and
 * says so). The lab refuses one it cannot take all the same
 * (`StepNotNewest`), for a page that knew an older history.
 */
export const stepWhyNot =
  (verb: StepVerb, film: string, steps: Option.Option<Pick<CheckReport, 'undo' | 'redo'>>) =>
  (bound: Bound): Option.Option<Unfit> => {
    if (bound.film !== film)
      return Option.some(
        Unfit.Now({
          reason: `that was a change to ${bound.film}: open ${bound.film} to ${verb} it`,
        }),
      );
    const change = boundChange(bound);
    return Option.flatMap(steps, (s) => {
      const top = Option.fromUndefinedOr(s[verb]);
      if (Option.exists(top, (t) => Option.contains(change, t.change))) return Option.none();
      if (
        Option.exists(Option.fromUndefinedOr(s[OTHER[verb]]), (o) =>
          Option.contains(change, o.change),
        )
      )
        return Option.some(Unfit.Now({ reason: `it is ${STEPPED[verb]} already` }));
      return Option.some(
        Option.match(top, {
          onSome: (t) => Unfit.Now({ reason: newerFirst(verb, t.target) }),
          onNone: () =>
            Unfit.Never({
              reason: `the lab no longer has that change to ${verb}: it was ${STEPPED[verb]} already, or the lab restarted since`,
            }),
        }),
      );
    });
  };

export interface LabCalls {
  /** A scene's file and what of it the lab may rewrite. */
  readonly source: (scene: string) => Effect.Effect<SceneSource, LabFailure>;
  /** A scene's file text now, and where its cues, knobs and marks are written and read. */
  readonly code: (scene: string) => Effect.Effect<SceneCode, LabFailure>;
  /** A scene's timeline and knobs at HEAD. */
  readonly head: (scene: string) => Effect.Effect<HeadSource, LabFailure>;
  /** `film check --static` now, the latest change, and what Undo and Redo would do. */
  readonly check: Effect.Effect<CheckReport, LabFailure>;
  /** Write a cue's fields into its scene file. */
  readonly writeCue: (
    scene: string,
    cue: string,
    patch: CuePatch,
  ) => Effect.Effect<LabWrite, LabFailure>;
  /** Write a knob's value into its scene file. */
  readonly writeKnob: (
    scene: string,
    knob: string,
    value: Knob,
  ) => Effect.Effect<LabWrite, LabFailure>;
  /**
   * Undo the newest write, or redo the newest undone one, as request
   * `request` (the id the lab records on it); asked for one change (a
   * receipt's), that change only, or refused (`StepRequest.change`).
   */
  readonly step: (
    verb: StepVerb,
    request: RequestId,
    change: Option.Option<ChangeId>,
  ) => Effect.Effect<LabWrite, LabFailure>;
}

export class LabApi extends Context.Service<LabApi, LabCalls>()('@bible/film/lab/LabApi') {}

/** A new note as the page posts it: the draft and the frame's still, as bytes. */
type NotePost = typeof NotePostSchema.Type;

/** The film's notes: read, long-polled, added to and answered. */
export interface NotesCalls {
  /** The notes file; its `seq` is the cursor a wait waits past. */
  readonly notes: Effect.Effect<NotesFile, LabFailure>;
  /** The changes past `since`, long-polled: answered empty after `WAIT_S` with none. */
  readonly wait: (since: number) => Effect.Effect<NotesWait, LabFailure>;
  /** A new note: its draft and the frame's still. */
  readonly add: (post: NotePost) => Effect.Effect<Note, LabFailure>;
  /** The user replies in a note's thread. */
  readonly reply: (id: string, text: string) => Effect.Effect<Note, LabFailure>;
  readonly resolve: (id: string) => Effect.Effect<Note, LabFailure>;
}

export class NotesApi extends Context.Service<NotesApi, NotesCalls>()('@bible/film/lab/NotesApi') {}

/** How long one wait for the notes holds on the server, in seconds. */
const WAIT_S = 55;

/**
 * The page's client: every group of `LabHttpApi`. Its requests carry paths,
 * which Effect's `HttpClient` resolves against the page's own address, so a
 * page never names its origin.
 */
const pageClient = HttpApiClient.make(LabHttpApi);

/** The client of the lab at `origin`. */
const clientAt = (origin: string) => HttpApiClient.make(LabHttpApi, { baseUrl: origin });

/**
 * The page's one client of the lab's API, derived from `LabHttpApi`: every
 * call a page makes goes through it. Its layers give the `fetch` client
 * beside it, for a file read by its URL (a review doc's text).
 */
export class LabClient extends Context.Service<LabClient, Effect.Success<typeof pageClient>>()(
  '@bible/film/lab/Client',
) {
  /** The client of the lab that served the page. */
  static readonly layer = Layer.effect(LabClient, pageClient).pipe(
    Layer.provideMerge(FetchHttpClient.layer),
  );
  /** The client of the lab at `origin`: a process with no page (a test). */
  static readonly layerAt = (origin: string) =>
    Layer.effect(LabClient, clientAt(origin)).pipe(Layer.provideMerge(FetchHttpClient.layer));
  /**
   * The client a server render of a page reads the lab with: the render's
   * own reads (`request.fetch`, answered by the lab that renders it), each
   * path resolved against the page's origin, as the browser resolves it.
   */
  static readonly layerRendering = (request: PageRequest) => {
    const origin = new URL(request.url).origin;
    const atOrigin = Layer.effect(
      HttpClient.HttpClient,
      Effect.map(
        HttpClient.HttpClient,
        HttpClient.mapRequest(HttpClientRequest.prependUrl(origin)),
      ),
    ).pipe(
      Layer.provide(FetchHttpClient.layer),
      Layer.provide(Layer.succeed(FetchHttpClient.Fetch, request.fetch)),
    );
    return Layer.effect(LabClient, pageClient).pipe(Layer.provideMerge(atOrigin));
  };
}

/** The scene source routes for `film`, over the page's derived client. */
const makeLabApi = Effect.fn('lab.api.make')(function* (film: string) {
  const client = yield* LabClient;
  const api: LabCalls = {
    source: (scene) => called(client.scenes.source({ params: { film, scene } })),
    code: (scene) => called(client.scenes.code({ params: { film, scene } })),
    head: (scene) => called(client.scenes.head({ params: { film, scene } })),
    check: called(client.steps.check({ params: { film } })),
    writeCue: (scene, cue, patch) =>
      called(client.scenes.cue({ params: { film, scene, cue }, payload: patch })),
    writeKnob: (scene, knob, value) =>
      called(client.scenes.knob({ params: { film, scene, knob }, payload: { value } })),
    step: (verb, request, change) =>
      called(
        client.steps[verb]({
          params: { film },
          payload: {
            request,
            ...Option.match(change, { onNone: () => ({}), onSome: (c) => ({ change: c }) }),
          },
        }),
      ),
  };
  return api;
});

/** The notes routes for `film`, over the page's derived client. */
const makeNotesApi = Effect.fn('lab.notes.make')(function* (film: string) {
  const client = yield* LabClient;
  const api: NotesCalls = {
    notes: called(client.notes.list({ params: { film } })),
    wait: (since) =>
      called(client.notes.wait({ params: { film }, query: { since, timeout: WAIT_S } })),
    add: (note) => called(client.notes.add({ params: { film }, payload: note })),
    reply: (id, text) => called(client.notes.reply({ params: { film, id }, payload: { text } })),
    resolve: (id) => called(client.notes.resolve({ params: { film, id }, payload: {} })),
  };
  return api;
});

/** The lab API for `film`, over the page's derived client. */
export const labApiLayer = (film: string): Layer.Layer<LabApi | NotesApi, never, LabClient> =>
  Layer.mergeAll(
    Layer.effect(LabApi, makeLabApi(film)),
    Layer.effect(NotesApi, makeNotesApi(film)),
  );
