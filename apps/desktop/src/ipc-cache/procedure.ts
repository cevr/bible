import type { Effect, Schema } from 'effect';

/**
 * A procedure is an Effect handler tied to a pair of Schemas (input/output).
 * Cache reads validate input → key → run handler → decode output. Mutations
 * skip the cache but go through the same validate/decode pipeline.
 *
 * The `kind` discriminant distinguishes cacheable reads (`query`) from
 * effectful writes (`mutation`). At the proxy layer, queries expose
 * `.query` + `.invalidate`; mutations expose `.mutate`. Trying to call the
 * other method on a procedure is a type error.
 */
export type ProcedureKind = 'query' | 'mutation';

// `OEnc` is the output schema's *Encoded* (wire) type, distinct from `O` (its
// decoded Type). The proxy runs the handler's result through
// `Schema.decodeUnknownEffect(output)`, so the handler must return the wire
// shape `OEnc`; the consumer receives the decoded `O`. For the common case
// where a schema's Type === Encoded (plain structs, `NullOr`, `optional`)
// `OEnc` defaults to `O` and callers don't notice the distinction. It only
// matters for schemas carrying a transform whose two sides differ — e.g.
// `OptionFromOptionalNullishOrEmpty` (Type `Option<string>` ↔ Encoded
// `string | null | undefined`), where the handler must hand back the encoded
// form for the proxy's decode to reconstruct the Option.
export interface Procedure<K extends ProcedureKind, I, O, OEnc = O, R = never, E = never> {
  readonly kind: K;
  readonly input: Schema.Schema<I>;
  readonly output: Schema.Codec<O, OEnc>;
  readonly handle: (input: I) => Effect.Effect<OEnc, E, R>;
}

/**
 * Define a cacheable read. `input` is decoded to typed `I` before the cache
 * key is computed (so the key uses the decoded shape, not the raw caller
 * args — keeps numeric-string coercions etc. from poisoning the cache).
 * `output` is decoded after the handler resolves, so the handler returns the
 * output schema's *Encoded* (wire) shape and consumers receive the decoded
 * Type.
 *
 * Pass `Schema.Void` (or a literal) for procedures that don't take args.
 */
export const query = <I, O, OEnc = O, R = never, E = never>(spec: {
  readonly input: Schema.Schema<I>;
  readonly output: Schema.Codec<O, OEnc>;
  readonly handle: (input: I) => Effect.Effect<OEnc, E, R>;
}): Procedure<'query', I, O, OEnc, R, E> => ({
  kind: 'query',
  input: spec.input,
  output: spec.output,
  handle: spec.handle,
});

/**
 * Define an effectful write. Inputs/outputs run through Schema the same way
 * as queries; the only difference is the proxy exposes `.mutate` (one-shot
 * Promise, no cache entry) instead of `.query`.
 */
export const mutation = <I, O, OEnc = O, R = never, E = never>(spec: {
  readonly input: Schema.Schema<I>;
  readonly output: Schema.Codec<O, OEnc>;
  readonly handle: (input: I) => Effect.Effect<OEnc, E, R>;
}): Procedure<'mutation', I, O, OEnc, R, E> => ({
  kind: 'mutation',
  input: spec.input,
  output: spec.output,
  handle: spec.handle,
});

/**
 * Procedure tree: nested object whose leaves are `Procedure`s. The proxy
 * walks this shape and produces a mirrored tree where each leaf has
 * `.query`/`.mutate`/`.invalidate` instead of the bare procedure.
 *
 * The leaf shape uses a *structural* sentinel rather than a fully-typed
 * `Procedure<...>` — `Procedure`'s `handle` field is contravariant in
 * `input`, so a precise `Procedure<'query', {lang: string}, ...>` does not
 * assign to a `Procedure<..., unknown, ...>` constraint. The structural
 * shape (`kind` + `input`/`output`/`handle` as functions) accepts all
 * `Procedure` variants uniformly. Precise types flow through
 * `defineProcedures<T>` / `buildIpc<T>` so the structural relaxation here
 * never leaks to call sites.
 */
export type ProcedureShape = {
  readonly kind: ProcedureKind;
  readonly input: Schema.Schema<unknown>;
  readonly output: Schema.Schema<unknown>;
  readonly handle: (input: never) => Effect.Effect<unknown, unknown, unknown>;
};

export type ProcedureNode = ProcedureShape | { readonly [key: string]: ProcedureNode };

/**
 * Identity function over a procedure tree — present purely so call sites
 * can write `defineProcedures({ ... })` and get inference for the leaf
 * input/output types when consuming `ipc.foo.bar.query(input)`.
 */
export const defineProcedures = <T extends Record<string, ProcedureNode>>(tree: T): T => tree;

export const isProcedure = (value: unknown): value is ProcedureShape => {
  if (value === null || typeof value !== 'object') return false;
  if (!('kind' in value) || !('input' in value) || !('output' in value)) return false;
  if (!('handle' in value)) return false;
  const k = (value as { kind: unknown }).kind;
  return k === 'query' || k === 'mutation';
};
