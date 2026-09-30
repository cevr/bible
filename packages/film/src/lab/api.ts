// The lab API as the page's machines call it: every route of `/lab/<film>/`
// through Effect's HttpClient, each body encoded and each answer decoded by
// the route's Schema. A refusal is the server's own text (`SourceRefused: …`),
// which the panel shows as it is; a request that never reached the server, or
// an answer that does not decode, says so in its own words. The scene source
// routes are `LabApi`; the notes routes are `NotesApi`.

import { Cause, Context, Effect, Layer, Result, Schema } from 'effect';
import { FetchHttpClient, HttpClient, HttpClientRequest, HttpClientResponse } from 'effect/http';
import {
  CheckReport,
  CuePatch,
  HeadSource,
  type Knob,
  KnobPatch,
  LabWrite,
  Note,
  NotePost,
  NotesFile,
  NotesWait,
  ReplyPost,
  SceneSource,
} from '../core/schema.ts';

/** The server answered, and said no: its status and its text, as it words it. */
export class LabRefused extends Schema.TaggedError<LabRefused>()('LabRefused', {
  status: Schema.Finite,
  message: Schema.String,
}) {}

/** The request did not reach the server, or its answer did not decode. */
export class LabUnreachable extends Schema.TaggedError<LabUnreachable>()('LabUnreachable', {
  message: Schema.String,
}) {}

export type LabFailure = LabRefused | LabUnreachable;

/** The server's words without their tag (`SceneNotFound: …` reads `…`). */
export const untagged = (message: string): string => message.replace(/^\w+: /, '');

/** A failed call, in the server's words without its tag. */
export const reasonOf = (cause: Cause.Cause<unknown>): string => {
  const squashed = Cause.squash(cause);
  const text = Result.match(
    Schema.decodeUnknownResult(Schema.Struct({ message: Schema.String }))(squashed),
    {
      onFailure: () => String(squashed),
      onSuccess: (e) => e.message,
    },
  );
  return untagged(text);
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
export type NotePost = typeof NotePost.Type;

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
export const WAIT_S = 55;

const unreachable = (cause: { readonly message: string }) =>
  LabUnreachable.make({ message: cause.message });

/** A 2xx answer decoded by `schema`; any other, its text as the refusal. */
const answer =
  <S extends Schema.Constraint>(schema: S) =>
  (res: HttpClientResponse.HttpClientResponse) => {
    if (res.status >= 200 && res.status < 300)
      return Effect.mapError(HttpClientResponse.schemaBodyJson(schema)(res), unreachable);
    return res.text.pipe(
      Effect.mapError(unreachable),
      Effect.flatMap((text) =>
        Effect.fail(LabRefused.make({ status: res.status, message: text || `${res.status}` })),
      ),
    );
  };

const NoBody = Schema.Struct({});
const Empty = {};

/**
 * A client of the routes under `base` (`labBase(film)`) on `origin`, through
 * `HttpClient`, every answer decoded by its schema. Writes are same-origin
 * JSON, as the server admits them.
 */
export const labClient = Effect.fn('lab.api.client')(function* (origin: string, base: string) {
  const client = (yield* HttpClient.HttpClient).pipe(
    HttpClient.mapRequest(HttpClientRequest.prependUrl(`${origin}${base}`)),
  );
  const get = <S extends Schema.Constraint>(path: string, schema: S) =>
    client.get(path).pipe(Effect.mapError(unreachable), Effect.flatMap(answer(schema)));
  const post = <B extends Schema.Constraint, S extends Schema.Constraint>(
    path: string,
    bodySchema: B,
    body: B['Type'],
    schema: S,
  ) =>
    HttpClientRequest.post(path).pipe(
      HttpClientRequest.schemaBodyJson(bodySchema)(body),
      Effect.mapError(unreachable),
      Effect.flatMap((req) => Effect.mapError(client.execute(req), unreachable)),
      Effect.flatMap(answer(schema)),
    );
  return { get, post };
});

/** A path of `parts`, each one encoded. */
const at = (...parts: ReadonlyArray<string>) =>
  `/${parts.map((p) => encodeURIComponent(p)).join('/')}`;

/** The scene source routes under `base` (`labBase(film)`) on `origin`. */
export const makeLabApi = Effect.fn('lab.api.make')(function* (origin: string, base: string) {
  const { get, post } = yield* labClient(origin, base);
  const api: LabCalls = {
    source: (scene) => get(`${at('scenes', scene)}/source`, SceneSource),
    head: (scene) => get(`${at('scenes', scene)}/head`, HeadSource),
    check: get('/check', CheckReport),
    writeCue: (scene, cue, patch) => post(at('cues', scene, cue), CuePatch, patch, LabWrite),
    writeKnob: (scene, knob, value) =>
      post(at('knobs', scene, knob), KnobPatch, { value }, LabWrite),
    step: (verb) => post(`/${verb}`, NoBody, Empty, LabWrite),
  };
  return api;
});

/** The notes routes under `base` on `origin`. */
export const makeNotesApi = Effect.fn('lab.notes.make')(function* (origin: string, base: string) {
  const { get, post } = yield* labClient(origin, base);
  const api: NotesCalls = {
    notes: get('/notes', NotesFile),
    wait: (since) => get(`/notes/wait?since=${since}&timeout=${WAIT_S}`, NotesWait),
    add: (note) => post('/notes', NotePost, note, Note),
    reply: (id, text) => post(`${at('notes', id)}/reply`, ReplyPost, { text }, Note),
    resolve: (id) => post(`${at('notes', id)}/resolve`, NoBody, Empty, Note),
  };
  return api;
});

/** The lab API for the film at `base`, on the page's own origin, over `fetch`. */
export const labApiLayer = (origin: string, base: string): Layer.Layer<LabApi | NotesApi> =>
  Layer.mergeAll(
    Layer.effect(LabApi, makeLabApi(origin, base)),
    Layer.effect(NotesApi, makeNotesApi(origin, base)),
  ).pipe(Layer.provide(FetchHttpClient.layer));
