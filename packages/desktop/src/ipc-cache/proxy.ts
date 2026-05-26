import { Effect, type Exit, Schema } from 'effect';
import { createMemo, type Resource } from 'solid-js';
import { makeCacheKey } from './key.js';
import { isProcedure, type ProcedureNode, type ProcedureShape } from './procedure.js';
import {
  invalidate as invalidateEntry,
  IpcCacheError,
  type QueryOptions,
  runFetcher,
  subscribe,
} from './registry.js';
import type { Arg, IpcProxy } from './types.js';

/**
 * Minimal runtime surface the proxy needs. Matches the shape of
 * `ManagedRuntime<R, ER>.runPromiseExit` — the proxy doesn't constrain
 * handlers' service requirements at runtime; it's the caller of
 * `buildIpc` that ties handler `R` to the runtime's provided context.
 * The R channel is fixed by the runtime instance, not by individual
 * procedures, so we erase it at this boundary.
 */
type RuntimeLike = {
  readonly runPromiseExit: <A, X>(effect: Effect.Effect<A, X>) => Promise<Exit.Exit<A, X>>;
};

/**
 * Build a typed proxy from a procedure tree. Each `Procedure` leaf becomes
 * a `QueryProc` or `MutationProc`; nested namespaces recurse. Schema
 * validation happens at the proxy boundary: inputs are decoded before the
 * cache key is computed; outputs are decoded after the handler resolves.
 *
 * Invalid input or output throws an `IpcCacheError` carrying the procedure
 * path — same shape as IPC failures, so `<ErrorBoundary>` and `catchTag`
 * handle both uniformly.
 */
export const buildIpc = <T extends Record<string, ProcedureNode>>(
  procedures: T,
  runtime: RuntimeLike,
): IpcProxy<T> =>
  // Public boundary: the structural shape is verified by the ProcedureNode
  // recursion in `build` above; IpcProxy<T> is the typed projection of that.
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion
  build(procedures, runtime, []) as IpcProxy<T>;

const build = (node: ProcedureNode, runtime: RuntimeLike, path: readonly string[]): unknown => {
  if (isProcedure(node)) {
    return makeProcedureProxy(node, runtime, path);
  }
  const out: Record<string, unknown> = {};
  const namespace: { readonly [k: string]: ProcedureNode } = node;
  for (const key of Object.keys(namespace)) {
    const child = namespace[key];
    if (child === undefined) continue;
    out[key] = build(child, runtime, [...path, key]);
  }
  return out;
};

const makeProcedureProxy = (
  proc: ProcedureShape,
  runtime: RuntimeLike,
  path: readonly string[],
): unknown => {
  const dotted = path.join('.');

  if (proc.kind === 'query') {
    return {
      query: (input: Arg<unknown>, options?: QueryOptions): Resource<unknown> =>
        createQueryResource(proc, runtime, dotted, input, options ?? {}),
      invalidate: (input: unknown): void => {
        // Use the raw input directly for the cache key — `query` does the
        // same when decode fails, and successful decodes are structurally
        // stable through JSON.stringify, so the keys line up either way.
        const key = makeCacheKey(dotted, [input]);
        invalidateEntry(key);
      },
    };
  }

  return {
    mutate: (input: unknown): Promise<unknown> => runProcedure(proc, runtime, dotted, input),
  };
};

const createQueryResource = (
  proc: ProcedureShape,
  runtime: RuntimeLike,
  dotted: string,
  inputArg: Arg<unknown>,
  options: QueryOptions,
): Resource<unknown> => {
  // Track the accessor (if any) so signal changes refetch with a new key.
  // Plain values pass through and the memo runs exactly once.
  const resolvedInput = createMemo(() => resolveArg(inputArg));

  const entry = createMemo(() => {
    const raw = resolvedInput();
    // Key off the raw input, not the decoded shape. Decoding can change
    // arg shape (e.g. NumberFromString turns '1' into 1), but using the
    // raw input here keeps `query(x)` and `invalidate(x)` in sync without
    // forcing both call sites through Schema first.
    const key = makeCacheKey(dotted, [raw]);
    return subscribe(key, dotted, () => runProcedure(proc, runtime, dotted, raw), options);
  });

  return makeForwardedResource(entry);
};

/**
 * Single pipeline shared by query fetchers and mutate calls: decode input →
 * run handler → decode output → return Promise. Any failure (decode or
 * handler) bubbles through `runFetcher` as an `IpcCacheError` tagged with
 * the procedure path.
 *
 * The handler's requirements (`R`) must be `never` by the time it reaches
 * this layer — procedures wire their own services in `defineProcedures`
 * before the proxy is built. The cast asserts that contract.
 */
const runProcedure = (
  proc: ProcedureShape,
  runtime: RuntimeLike,
  dotted: string,
  rawInput: unknown,
): Promise<unknown> => {
  // The ProcedureShape contract erases handler I/O to `unknown` deliberately —
  // see the "structural sentinel" rationale block in procedure.ts. These
  // re-narrowings restore the function-shape TS lost at the boundary; the
  // values themselves were produced by Schema/handler functions whose shapes
  // we erased on the way in.
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion
  const decodeInput = Schema.decodeUnknownEffect(proc.input) as (
    u: unknown,
  ) => Effect.Effect<unknown, Schema.SchemaError>;
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion
  const decodeOutput = Schema.decodeUnknownEffect(proc.output) as (
    u: unknown,
  ) => Effect.Effect<unknown, Schema.SchemaError>;
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion
  const handle = proc.handle as (i: unknown) => Effect.Effect<unknown, unknown>;
  const isIpcError = Schema.is(IpcCacheError);

  const effect: Effect.Effect<unknown, IpcCacheError> = decodeInput(rawInput).pipe(
    Effect.mapError(
      (cause) =>
        new IpcCacheError({ path: dotted, message: `input decode failed: ${cause.message}` }),
    ),
    Effect.flatMap((input) =>
      handle(input).pipe(
        Effect.mapError(
          (cause): IpcCacheError =>
            isIpcError(cause)
              ? cause
              : new IpcCacheError({
                  path: dotted,
                  message: cause instanceof Error ? cause.message : String(cause),
                }),
        ),
      ),
    ),
    Effect.flatMap((output) =>
      decodeOutput(output).pipe(
        Effect.mapError(
          (cause) =>
            new IpcCacheError({
              path: dotted,
              message: `output decode failed: ${cause.message}`,
            }),
        ),
      ),
    ),
  );
  return runFetcher(effect, runtime, dotted);
};

/**
 * Call an accessor input inside the current tracking scope; pass static
 * values through. The runtime function check catches the foot-gun of
 * passing a real function as an IPC input (Schema decode would reject it
 * anyway, but we'd lose reactivity if we treated it as a value).
 */
const resolveArg = (arg: unknown): unknown => {
  if (typeof arg === 'function') {
    // TS narrows `arg` to the built-in `Function` type, which has no callable
    // signature in its public typings — we know it came from `() => unknown`
    // accessor pattern by convention.
    // oxlint-disable-next-line typescript/no-unsafe-type-assertion
    return (arg as () => unknown)();
  }
  return arg;
};

/**
 * Build a Resource accessor whose value/state/error track a memo of the
 * underlying resource. Reading the resulting function suspends + throws
 * like a regular Resource, but switches transparently when the memo points
 * at a new entry (input changed → new cache key → potentially new
 * in-flight fetch).
 */
const makeForwardedResource = <T>(entry: () => { readonly resource: Resource<T> }): Resource<T> => {
  // The bare function expression is `() => T`; it gains the Resource shape
  // (.state/.loading/.error/.latest) via the Object.defineProperties block
  // immediately below.
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion
  const accessor = (() => entry().resource()) as Resource<T>;
  Object.defineProperties(accessor, {
    state: { get: () => entry().resource.state },
    loading: { get: () => entry().resource.loading },
    error: { get: () => entry().resource.error },
    latest: { get: () => entry().resource.latest },
  });
  return accessor;
};

export { IpcCacheError };
