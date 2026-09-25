/* oxlint-disable effect/noUnsafeDictionaryType, effect/noAs, effect/noRuntimeTypeof, effect/noDynamicImports, effect/noNewError, effect/noGlobals -- this file is the host boundary for two foreign module systems.
 *
 * `bun:ffi` and `WebAssembly.Instance` both hand back untyped symbol tables:
 * the shapes are fixed by the C sources next door, not by anything TypeScript
 * can see, and there is no schema to decode them from — a `dlopen` symbol is a
 * function pointer, not data. So the contract is *asserted* here, once, at the
 * one place the artifacts are loaded, and everything downstream of
 * `VectorAccel` is ordinary typed code.
 *
 * The dynamic import is load-bearing rather than stylistic: `bun:ffi` does not
 * exist in a browser or Electron renderer build, and a static import would be
 * followed by the bundler on exactly the hosts this file is designed to skip.
 * `fetch` is the artifact read for those same hosts, which have no filesystem.
 */

/** The optional accelerated dot product behind `scanVectorIndex`.
 *
 *  **What this is for.** Scoring one query against the index is 961,253 vectors
 *  × 256 dimensions, ~246 million multiply-adds, and it is the dominant leg of
 *  a semantic search. The arithmetic is trivially data-parallel and JavaScript
 *  has no portable way to say so. Measured on the deployed index:
 *
 *  | tier          | scan    | vs JS | where it runs                  |
 *  |---------------|---------|-------|--------------------------------|
 *  | native SIMD   |  5.5 ms | 14.8× | Bun, with the built library    |
 *  | WebAssembly   | 11.8 ms |  6.9× | every host, from one artifact  |
 *  | TypeScript    | 81.8 ms |  1×   | always                         |
 *
 *  **Every tier is optional and the fallback is the specification.** A checkout
 *  that never runs `scripts/build-native.sh` has no artifacts and answers from
 *  the TypeScript loop — correct, only slower. That is what keeps
 *  `vector-index.ts`'s promise that the scan "runs byte-identically in a
 *  browser worker and in Electron and under Bun": the *result* is identical
 *  everywhere, and only the speed is not.
 *
 *  **Identical rather than merely close.** The accelerators compute dot
 *  products and nothing else — ranking, `topK`, the per-book ranges and the
 *  paragraph ids all stay in `vector-index.ts`. Every value in the chain is an
 *  integer: int8 inputs, int16 products, int32 sums, none of which can round or
 *  saturate at 256 terms. So the tiers cannot disagree, and the tests assert
 *  exactly that rather than a tolerance.
 *
 *  **Why this file and not `vector-index.ts`.** That module is pure, portable
 *  and has no I/O by design. Loading a dynamic library or instantiating a
 *  WebAssembly module is host-specific side-effecting work, so it lives behind
 *  this seam and the pure module keeps its shape.
 */

import { Data, Effect, Match, Option, Schema } from 'effect';

/** Why a tier did not load.
 *
 *  Never surfaced: every constructor below is caught and turned into `None`,
 *  because "this host has no accelerator" is a supported state rather than a
 *  failure. It is tagged anyway so the failure channel stays typed while it
 *  exists. */
class AccelUnavailable extends Data.TaggedError('AccelUnavailable')<{
  readonly tier: string;
}> {}

/** Which vector unit answered, for the one log line that says so. */
export const VectorAccelKind = Schema.Literals(['neon', 'avx2', 'wasm']);
export type VectorAccelKind = typeof VectorAccelKind.Type;

/** What the C sources return from `vector_scan_isa`.
 *
 *  A scalar build reports 0 and is deliberately absent from this map: it is
 *  correct but slower than the JIT'd TypeScript loop it would replace, so it
 *  resolves to no accelerator rather than to a pointless one.
 */
const kindForIsa = (isa: number): Option.Option<VectorAccelKind> => {
  if (isa === 1) return Option.some('avx2');
  if (isa === 2) return Option.some('neon');
  if (isa === 3) return Option.some('wasm');
  return Option.none();
};

/** An accelerator, as the scanner uses it.
 *
 *  One call scores a contiguous run of rows into a caller-owned buffer, which
 *  is the shape `rangesFor` already produces: a scoped search scores its book
 *  ranges and skips the rest, and this preserves that rather than forcing a
 *  whole-index scan to use SIMD.
 */
export interface VectorAccel {
  readonly kind: VectorAccelKind;
  /** Scores `count` rows from `offset`, writing `count` dot products into
   *  `out`. Returns how many it wrote, which the caller checks. */
  readonly scoreRange: (query: Int8Array, offset: number, count: number, out: Int32Array) => number;
}

/** What an accelerator needs to know about the index it will score. */
export interface AccelTarget {
  readonly vectors: Int8Array;
  readonly dimensions: number;
  readonly count: number;
}

/** The FFI surface, named once.
 *
 *  `bun:ffi` is imported dynamically because it does not exist in a browser or
 *  Electron renderer build, and a static import would be followed by the
 *  bundler on hosts that have no such module.
 */
interface FfiModule {
  readonly dlopen: (
    path: string,
    symbols: Record<string, { readonly args: readonly unknown[]; readonly returns: unknown }>,
  ) => { readonly symbols: Record<string, (...args: readonly number[]) => number> };
  readonly FFIType: Record<string, unknown>;
  readonly ptr: (view: ArrayBufferView) => number;
}

/** Where `scripts/build-native.sh` leaves its artifacts. */
const artifactUrl = (file: string): URL => new URL(`../../dist-native/${file}`, import.meta.url);

/** The library names this host could load, best first.
 *
 *  Two, not one, because the two ways an artifact arrives have to coexist. A
 *  developer runs `build-native.sh` and gets a host-named file
 *  (`vector-scan.dylib`); the deployment gets a committed cross-compile named
 *  for its triple (`vector-scan-x86_64-linux-gnu.so`). A single flat name would
 *  make those collide on Linux, where a local build and the committed artifact
 *  want the same path and the committed one would win — silently running the
 *  wrong ISA for the machine.
 *
 *  The host build is preferred because it is the more specific claim: someone
 *  built it *here*. The triple-named file is the fallback, and it is only ever
 *  right for the triple in its name.
 *
 *  An unknown platform resolves to the Unix names and then simply fails to
 *  load, which is the same outcome as having no artifact — the next tier down.
 */
const nativeFilenames = (): readonly string[] => {
  const runtime = Option.fromNullishOr(globalThis.process);
  const platform = Option.match(runtime, {
    onNone: () => 'linux',
    onSome: (process) => process.platform,
  });
  const arch = Option.match(runtime, {
    onNone: () => 'x64',
    onSome: (process) => process.arch,
  });
  if (platform === 'darwin') return ['vector-scan.dylib'];
  if (platform === 'win32') return ['vector-scan.dll'];
  // The triples `build-native.sh` cross-compiles to, named as zig names them.
  const triple = Match.value(arch).pipe(
    Match.when('arm64', () => 'aarch64-linux-gnu'),
    Match.orElse(() => 'x86_64-linux-gnu'),
  );
  return ['vector-scan.so', `vector-scan-${triple}.so`];
};

/** Tier one: the native library through `bun:ffi`.
 *
 *  Zero copy — it reads the `Int8Array` the parser already produced, in place.
 *  That is why it beats WebAssembly despite both being SIMD: the WebAssembly
 *  tier has to hold the corpus inside its own linear memory.
 *
 *  Every failure here is the same answer: `None`, and the next tier. A missing
 *  artifact, an absent `bun:ffi`, a library built for another architecture and
 *  a scalar build are all "no native accelerator on this host", which is a
 *  supported state rather than an error.
 */
const loadNative = (target: AccelTarget): Effect.Effect<Option.Option<VectorAccel>> =>
  Effect.gen(function* () {
    const moduleName = 'bun:ffi';
    const ffi = yield* Effect.tryPromise({
      try: () => import(/* @vite-ignore */ moduleName) as Promise<FfiModule>,
      catch: () => new AccelUnavailable({ tier: 'ffi' }),
    });
    const type = (name: string): unknown => ffi.FFIType[name];
    const symbols = {
      vector_scan_range: {
        args: [type('ptr'), type('ptr'), type('i32'), type('i32'), type('i32'), type('ptr')],
        returns: type('i32'),
      },
      vector_scan_isa: { args: [], returns: type('i32') },
    };
    // `dlopen` throws for a name that is not there, and an absent candidate is
    // the ordinary case rather than a failure: a developer has the host build
    // and not the cross-compile, the deployment has the reverse. Trying each in
    // turn is what lets both exist without one hiding the other.
    const lib = yield* Effect.firstSuccessOf(
      nativeFilenames().map((file) =>
        Effect.try({
          try: () => ffi.dlopen(artifactUrl(file).pathname, symbols),
          catch: () => new AccelUnavailable({ tier: 'ffi' }),
        }),
      ),
    );

    const isaSymbol = Option.fromNullishOr(lib.symbols['vector_scan_isa']);
    const rangeSymbol = Option.fromNullishOr(lib.symbols['vector_scan_range']);
    if (Option.isNone(isaSymbol) || Option.isNone(rangeSymbol)) return Option.none<VectorAccel>();

    const kind = kindForIsa(isaSymbol.value());
    // A `wasm` isa from a native library means the wrong artifact was built
    // into the wrong file; refuse it rather than mislabel the log line.
    if (Option.isNone(kind) || kind.value === 'wasm') return Option.none<VectorAccel>();

    const scoreRange = rangeSymbol.value;
    const vectorsPtr = ffi.ptr(target.vectors);
    return Option.some<VectorAccel>({
      kind: kind.value,
      scoreRange: (query, offset, count, out) =>
        scoreRange(vectorsPtr, ffi.ptr(query), target.dimensions, offset, count, ffi.ptr(out)),
    });
  }).pipe(Effect.catchCause(() => Effect.succeed(Option.none<VectorAccel>())));

/** Reads an artifact without assuming a filesystem.
 *
 *  `Bun.file` where it exists, `fetch` otherwise — which is what a browser
 *  worker has. Either absence resolves to the next tier rather than throwing.
 */
const readArtifact = (url: URL): Effect.Effect<Option.Option<ArrayBuffer>> =>
  Effect.gen(function* () {
    const bun = Option.fromNullishOr(globalThis.Bun);
    if (Option.isSome(bun)) {
      const file = bun.value.file(url.pathname);
      const present = yield* Effect.promise(() => file.exists());
      if (!present) return Option.none<ArrayBuffer>();
      return Option.some(yield* Effect.promise(() => file.arrayBuffer()));
    }
    const response = yield* Effect.promise(() => fetch(url));
    if (!response.ok) return Option.none<ArrayBuffer>();
    return Option.some(yield* Effect.promise(() => response.arrayBuffer()));
  }).pipe(Effect.catchCause(() => Effect.succeed(Option.none<ArrayBuffer>())));

/** One WebAssembly page. The module grows in these units, so the corpus, the
 *  query and the score buffer are sized up to a whole number of them. */
const WASM_PAGE_BYTES = 65_536;

/** The linear memory the compiled module insists on before it will link,
 *  read out of its own import section: 16 pages of toolchain stack and
 *  statics. A host must supply at least this much even for a tiny index. */
const WASM_MINIMUM_PAGES = 16;

/** Tier two: WebAssembly SIMD, which runs on every host from one artifact.
 *
 *  The corpus has to live inside the module's linear memory, so this copies it
 *  once at load (measured: 11 ms for 246 MB) and holds it for the process. That
 *  copy is the tier's real cost — it doubles the index's residency — and it is
 *  why the native tier is preferred where it exists.
 */
const loadWasm = (target: AccelTarget): Effect.Effect<Option.Option<VectorAccel>> =>
  Effect.gen(function* () {
    const bytes = yield* readArtifact(artifactUrl('vector-scan.wasm'));
    if (Option.isNone(bytes)) return Option.none<VectorAccel>();

    // Layout: one guard page, the corpus, the query, then the scores.
    const vectorsAt = WASM_PAGE_BYTES;
    const queryAt = vectorsAt + target.vectors.byteLength;
    const scoresAt = queryAt + target.dimensions;
    const needed = scoresAt + target.count * 4;
    // The module declares its own minimum (16 pages of stack and statics from
    // the toolchain), and a host that supplies less fails to instantiate with
    // a LinkError. Taking the larger of the two means a small index — a test
    // fixture, a single-book scope — gets a module that links rather than one
    // that silently falls through to the pure loop.
    const pages = Math.max(WASM_MINIMUM_PAGES, Math.ceil(needed / WASM_PAGE_BYTES));
    const memory = new WebAssembly.Memory({ initial: pages });

    const instantiated = yield* Effect.promise(() =>
      WebAssembly.instantiate(bytes.value, { env: { memory } }),
    );
    const exports = instantiated.instance.exports;
    const range = Option.fromNullishOr(exports['vector_scan_range']);
    if (Option.isNone(range) || typeof range.value !== 'function') {
      return Option.none<VectorAccel>();
    }
    const call = range.value as (...args: readonly number[]) => number;

    const heap = new Uint8Array(memory.buffer);
    heap.set(target.vectors, vectorsAt);

    return Option.some<VectorAccel>({
      kind: 'wasm',
      scoreRange: (query, offset, count, out) => {
        heap.set(query, queryAt);
        const wrote = call(vectorsAt, queryAt, target.dimensions, offset, count, scoresAt);
        // The scores come back inside linear memory; copy out the run that was
        // asked for. `out` is the scanner's reusable buffer.
        out.set(new Int32Array(memory.buffer, scoresAt, wrote), 0);
        return wrote;
      },
    });
  }).pipe(Effect.catchCause(() => Effect.succeed(Option.none<VectorAccel>())));

/** The tier resolved for this process, and the vectors it was built for.
 *
 *  The native tier captures a pointer to `vectors` and the WebAssembly tier
 *  copies it, so a tier answers only for the buffer it was built from. Holding
 *  that buffer beside the tier lets every read check it rather than trust it. */
let resolved: Option.Option<{
  readonly vectors: Int8Array;
  readonly accel: Option.Option<VectorAccel>;
}> = Option.none();

/** Whether a resolution is already in flight, so `primeVectorAccel` starts at
 *  most one regardless of how many callers ask. */
let priming = false;

/** The tier resolved for exactly this index's vectors. */
const resolvedFor = (target: AccelTarget): Option.Option<Option.Option<VectorAccel>> =>
  Option.map(
    Option.filter(resolved, (entry) => entry.vectors === target.vectors),
    (entry) => entry.accel,
  );

/** The tier this process has *already* resolved for `target`, read synchronously.
 *
 *  This is what the scan uses. Loading an accelerator is asynchronous host work
 *  — a `dlopen`, a `WebAssembly.instantiate` — and search must stay runnable
 *  with `Effect.runSync`: hosts do exactly that, and so does the golden-route
 *  suite. So nothing ever *waits* for a tier. The first queries answer from the
 *  TypeScript loop while `primeVectorAccel` resolves in the background, and
 *  every query after that gets the accelerator.
 *
 *  A tier built for other vectors answers `None`: scoring this index through a
 *  pointer to another one returns plausible, wrong neighbors.
 *
 *  The cost of that choice is a few slow queries at startup. The alternative —
 *  awaiting the tier — turns every caller of `SearchService.query` asynchronous,
 *  which is a far larger change than the speed is worth. */
export const readyVectorAccel = (target: AccelTarget): Option.Option<VectorAccel> =>
  Option.flatten(resolvedFor(target));

/** Starts resolving the tier, without making the caller wait.
 *
 *  Hosts call this when they build the search layer. It is deliberately not an
 *  `Effect` the layer yields on: yielding would make the layer asynchronous and
 *  reintroduce exactly the problem `readyVectorAccel` exists to avoid. */
export const primeVectorAccel = (target: AccelTarget): void => {
  if (Option.isSome(resolvedFor(target)) || priming) return;
  priming = true;
  // `vectorAccel` never fails — every load fault is already an `Option.none`
  // — so this only has to release the flag, never handle an error.
  Effect.runPromise(
    vectorAccel(target).pipe(
      Effect.tap(() =>
        Effect.sync(() => {
          priming = false;
        }),
      ),
    ),
  );
};

/** The accelerator for this index, resolved once per index.
 *
 *  One tier is held per process because a host holds one index. Handing it a
 *  different index resolves a new tier for those vectors and drops the old one.
 *  `resetVectorAccel` exists for the tests that need to.
 */
export const vectorAccel = (target: AccelTarget): Effect.Effect<Option.Option<VectorAccel>> =>
  Effect.gen(function* () {
    const held = resolvedFor(target);
    if (Option.isSome(held)) return held.value;
    // Native first, WebAssembly second, and the pure loop when neither loads.
    const native = yield* loadNative(target);
    const chosen = yield* Option.match(native, {
      onNone: () => loadWasm(target),
      onSome: (ready) => Effect.succeed(Option.some(ready)),
    });
    resolved = Option.some({ vectors: target.vectors, accel: chosen });
    return chosen;
  });

/** Forgets the resolved tier. For tests that exercise more than one. */
export const resetVectorAccel = (): void => {
  resolved = Option.none();
  priming = false;
};
