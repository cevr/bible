// The lab API as the page's machines call it: every route of `/lab/<film>/`
// through Effect's HttpClient, each body encoded and each answer decoded by
// the route's Schema. A refusal is the server's own text (`SourceRefused: …`),
// which the panel shows as it is; a request that never reached the server, or
// an answer that does not decode, says so in its own words.

import { Context, Effect, Layer, Schema } from 'effect';
import {
  FetchHttpClient,
  HttpClient,
  HttpClientRequest,
  HttpClientResponse,
} from 'effect/unstable/http';
import {
  CheckReport,
  CuePatch,
  HeadSource,
  type Knob,
  KnobPatch,
  LabWrite,
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
 * The lab API under `base` (`labBase(film)`) on `origin`, through `HttpClient`.
 * Writes are same-origin JSON, as the server admits them.
 */
export const makeLabApi = Effect.fn('lab.api.make')(function* (origin: string, base: string) {
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
  const at = (...parts: ReadonlyArray<string>) =>
    `/${parts.map((p) => encodeURIComponent(p)).join('/')}`;
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

/** The lab API for the film at `base`, on the page's own origin, over `fetch`. */
export const labApiLayer = (origin: string, base: string): Layer.Layer<LabApi> =>
  Layer.effect(LabApi, makeLabApi(origin, base)).pipe(Layer.provide(FetchHttpClient.layer));
