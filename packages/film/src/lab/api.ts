// The lab API as the page's machines call it: a client derived from the
// routes' one declaration (`LabHttpApi` in `core/api.ts`), so each body is
// encoded and each answer decoded by the route's own Schema. A refusal is
// the server's own failure class (`SourceRefused`, `NoteNotFound`, …), its
// message the words the panel shows; a request that never reached the
// server, or an answer that does not decode, is LabUnreachable in its own
// words. The scene source routes are `LabApi`; the notes routes `NotesApi`.

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

/** A call that failed: the server said no (its own failure), or could not be heard. */
export type LabFailure = Refusal | LabUnreachable;

/**
 * A call through a derived client as the page takes it: the server's refusal
 * as it is, anything else (the request failed, the answer did not decode)
 * LabUnreachable with its words.
 */
export const heard = <A, E extends { readonly message: string }, R>(
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
  /** Undo the newest write, or redo the newest undone one. */
  readonly step: (verb: StepVerb) => Effect.Effect<LabWrite, LabFailure>;
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

/** The lab's client on `origin`: every group of `LabHttpApi`. */
export const labClient = (origin: string) => HttpApiClient.make(LabHttpApi, { baseUrl: origin });

/** The scene source routes for `film` on `origin`. */
const makeLabApi = Effect.fn('lab.api.make')(function* (origin: string, film: string) {
  const client = yield* labClient(origin);
  const api: LabCalls = {
    source: (scene) => heard(client.scenes.source({ params: { film, scene } })),
    head: (scene) => heard(client.scenes.head({ params: { film, scene } })),
    check: heard(client.steps.check({ params: { film } })),
    writeCue: (scene, cue, patch) =>
      heard(client.scenes.cue({ params: { film, scene, cue }, payload: patch })),
    writeKnob: (scene, knob, value) =>
      heard(client.scenes.knob({ params: { film, scene, knob }, payload: { value } })),
    step: (verb) => heard(client.steps[verb]({ params: { film }, payload: {} })),
  };
  return api;
});

/** The notes routes for `film` on `origin`. */
const makeNotesApi = Effect.fn('lab.notes.make')(function* (origin: string, film: string) {
  const client = yield* labClient(origin);
  const api: NotesCalls = {
    notes: heard(client.notes.list({ params: { film } })),
    wait: (since) =>
      heard(client.notes.wait({ params: { film }, query: { since, timeout: WAIT_S } })),
    add: (note) => heard(client.notes.add({ params: { film }, payload: note })),
    reply: (id, text) => heard(client.notes.reply({ params: { film, id }, payload: { text } })),
    resolve: (id) => heard(client.notes.resolve({ params: { film, id }, payload: {} })),
  };
  return api;
});

/** The lab API for `film`, on the page's own origin, over `fetch`. */
export const labApiLayer = (origin: string, film: string): Layer.Layer<LabApi | NotesApi> =>
  Layer.mergeAll(
    Layer.effect(LabApi, makeLabApi(origin, film)),
    Layer.effect(NotesApi, makeNotesApi(origin, film)),
  ).pipe(Layer.provide(FetchHttpClient.layer));
