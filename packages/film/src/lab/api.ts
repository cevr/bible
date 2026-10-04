// The lab API as the page's machines call it: a client derived from the
// routes' one declaration (`LabHttpApi` in `core/api.ts`), so each body is
// encoded and each answer decoded by the route's own Schema. A refusal is
// the server's own failure class (`SourceRefused`, `NoteNotFound`, …), its
// message the words the panel shows; a request that never reached the
// server, or an answer that does not decode, is LabUnreachable in its own
// words. One client (`LabClient`) serves every page's calls: the scene
// source routes are `LabApi`, the notes routes `NotesApi`, and the studio's,
// the review's and the choices' build on it (`studio/api.ts`,
// `review/api.ts`, `review/options/api.ts`).

import { Cause, Context, Effect, Layer, Predicate, Schema } from 'effect';
import { FetchHttpClient } from 'effect/http';
import { HttpApiClient } from 'effect/http-api';
import { LabHttpApi, type Refusal, isRefusal } from '../core/api.ts';
import {
  type CheckReport,
  type CuePatch,
  type HeadSource,
  type Knob,
  type LabWrite,
  type Note,
  type NotePost as NotePostSchema,
  type NotesFile,
  type NotesWait,
  type SceneSource,
} from '../core/schema.ts';

/** The request did not reach the server, or its answer did not decode. */
export class LabUnreachable extends Schema.TaggedError<LabUnreachable>()('LabUnreachable', {
  message: Schema.String,
}) {}

/** A call that failed: the server said no (its own failure), or could not be reached. */
export type LabFailure = Refusal | LabUnreachable;

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

export interface LabCalls {
  /** A scene's file and what of it the lab may rewrite. */
  readonly source: (scene: string) => Effect.Effect<SceneSource, LabFailure>;
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
  /** Undo the newest write, or redo the newest undone one, as request `request` (the id the lab records on it). */
  readonly step: (verb: StepVerb, request: string) => Effect.Effect<LabWrite, LabFailure>;
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
}

/** The scene source routes for `film`, over the page's derived client. */
const makeLabApi = Effect.fn('lab.api.make')(function* (film: string) {
  const client = yield* LabClient;
  const api: LabCalls = {
    source: (scene) => called(client.scenes.source({ params: { film, scene } })),
    head: (scene) => called(client.scenes.head({ params: { film, scene } })),
    check: called(client.steps.check({ params: { film } })),
    writeCue: (scene, cue, patch) =>
      called(client.scenes.cue({ params: { film, scene, cue }, payload: patch })),
    writeKnob: (scene, knob, value) =>
      called(client.scenes.knob({ params: { film, scene, knob }, payload: { value } })),
    step: (verb, request) => called(client.steps[verb]({ params: { film }, payload: { request } })),
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
