/** The browser generation store for a **flat** File Corpus artifact (round-2 F6).
 *
 *  `corpus-generation-store.ts` owns generations of SQLite databases: it
 *  reserves a candidate filename, opens it through a `wa-sqlite` VFS, and hands
 *  the reader over by activating that connection. §9.2's vector index is not a
 *  database — it is 246 MB of int8 with a header — so none of that applies, and
 *  the worker's `vectorIndex` was hard-coded to `Option.none()` with a comment
 *  saying the store did not exist. This is that store.
 *
 *  **Everything about the discipline is the same; only the artifact differs.**
 *  Candidates are registered in the durable registry *before* bytes are written,
 *  so an interrupted install is reconcilable on the next boot. The active
 *  generation is only ever replaced by one that already passed the digest gate
 *  and the semantic verifier. A failed candidate is discarded and the previous
 *  active generation is untouched. Which filenames this store owns comes from
 *  the corpus storage identity, so a generation belonging to another File Corpus
 *  is left registered and alone.
 *
 *  What is *not* the same is the handoff. A SQLite store activates a connection;
 *  there is no connection here, so activation is the registry write plus a read
 *  of the bytes into memory. That read is what `VectorIndexBytes` then serves,
 *  and it happens once per activation rather than per query — the same
 *  discipline `SearchService.Live` applies on the native hosts.
 */

import type { CorpusStorageIdentity } from '@bible/core/corpus-supply';
import { Effect, Option, Schema } from 'effect';

import type { GenerationRegistry, GenerationRegistryStore } from './generation-marker.js';

export class BlobGenerationError extends Schema.TaggedError<BlobGenerationError>()(
  'BlobGenerationError',
  { operation: Schema.String, filename: Schema.String, cause: Schema.Unknown },
) {}

/** The three OPFS operations a flat generation needs, as an injectable seam.
 *
 *  A parameter rather than a direct `navigator.storage` call for the reason the
 *  SQLite store takes its `databases` family: the worker's tests run under Bun
 *  with no OPFS, and a store that reached for the global could only be tested by
 *  stubbing a global. The production implementation below is the whole of the
 *  OPFS-specific code. */
export interface BlobFileStore {
  /** The file's bytes, or `None` when it does not exist. */
  readonly read: (filename: string) => Effect.Effect<Option.Option<Uint8Array>, unknown>;
  readonly remove: (filename: string) => Effect.Effect<void, unknown>;
}

export interface BlobGenerationStore<Corpus extends string = string> {
  readonly identity: CorpusStorageIdentity<Corpus>;
  /** The active generation's bytes, or `None` when none is active. Read once at
   *  `openActive` and again at each activation; never per query. */
  readonly activeBytes: Effect.Effect<Option.Option<ArrayBuffer>>;
  readonly activeFilename: Effect.Effect<Option.Option<string>>;
  /** Reconciles the registry against what OPFS actually holds, and reports
   *  whether an active generation survived. */
  readonly openActive: Effect.Effect<boolean, unknown>;
  readonly reserve: (preferredFilename: string) => Effect.Effect<string, unknown>;
  readonly activateVerified: (filename: string) => Effect.Effect<void, unknown>;
  readonly discardCandidate: (filename: string) => Effect.Effect<void, unknown>;
}

const without = (values: readonly string[], removed: string): readonly string[] =>
  values.filter((value) => value !== removed);

const withGeneration = (registry: GenerationRegistry, generation: string): GenerationRegistry => {
  if (registry.managed.includes(generation)) return registry;
  return { active: registry.active, managed: [...registry.managed, generation] };
};

/** A candidate must never be the active file: writing into the active
 *  generation is the one thing the whole two-slot scheme exists to prevent.
 *  The `-next` slot is the same rule `corpus-generation-store.ts` applies, with
 *  the flat suffix rather than `.db`. */
const inactiveFilename = (
  preferredFilename: string,
  active: Option.Option<string>,
  suffix: string,
): string => {
  if (Option.contains(active, preferredFilename)) {
    return `${preferredFilename.slice(0, preferredFilename.length - suffix.length)}-next${suffix}`;
  }
  return preferredFilename;
};

/** Bytes of one view, in a buffer of exactly that length.
 *
 *  A read may hand back a view onto a larger pooled buffer, and the vector
 *  parser addresses the index from byte zero — so passing the view's backing
 *  store through would read whatever else shared the pool. The native reader
 *  copies for the identical reason. */
const toBuffer = (bytes: Uint8Array): ArrayBuffer => {
  const buffer = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(buffer).set(bytes);
  return buffer;
};

export const makeBlobGenerationStore = <Corpus extends string>(input: {
  readonly identity: CorpusStorageIdentity<Corpus>;
  readonly files: BlobFileStore;
  readonly registry: GenerationRegistryStore;
  /** The filename suffix this corpus's generations carry. The storage identity
   *  derives `.db` names for every corpus, and a flat artifact keeps that name
   *  rather than inventing a second derivation: what matters is that the name is
   *  owned, unique per (revision, digest), and recognized by `ownsGeneration`,
   *  none of which the extension participates in. */
  readonly suffix?: string;
}): BlobGenerationStore<Corpus> => {
  const owned = input.identity.ownsGeneration;
  const suffix = input.suffix ?? '.db';
  let active = Option.none<string>();
  let cached = Option.none<ArrayBuffer>();

  const discardFiles = (filename: string): Effect.Effect<boolean> =>
    input.files.remove(filename).pipe(
      Effect.as(true),
      Effect.orElseSucceed(() => false),
    );

  const reconcile = Effect.fn('BlobGenerationStore.reconcile')(function* (
    registry: GenerationRegistry,
  ) {
    const retirement = yield* Effect.forEach(
      registry.managed,
      Effect.fnUntraced(function* (generation) {
        let discarded = false;
        if (!Option.contains(registry.active, generation) && owned(generation)) {
          discarded = yield* discardFiles(generation);
        }
        return { generation, discarded };
      }),
      { concurrency: 4 },
    );
    const retained = retirement
      .filter(({ discarded }) => !discarded)
      .map(({ generation }) => generation);
    if (retained.length !== registry.managed.length) {
      yield* input.registry.write({ active: registry.active, managed: retained });
    }
  });

  const discardCandidate = Effect.fn('BlobGenerationStore.discardCandidate')(function* (
    filename: string,
  ) {
    const registry = yield* input.registry.read;
    if (Option.contains(registry.active, filename)) return;
    if (!(yield* discardFiles(filename))) return;
    yield* input.registry.write({
      active: registry.active,
      managed: without(registry.managed, filename),
    });
  });

  /** Loads one generation's bytes into the cache, or reports that it is not
   *  readable. A registered active generation whose file is gone is not an
   *  active generation: the registry is durable and OPFS is not, and reporting
   *  the stale name would hand the reader a filename with no bytes behind it. */
  const load = Effect.fn('BlobGenerationStore.load')(function* (filename: string) {
    const bytes = yield* input.files.read(filename);
    if (Option.isNone(bytes)) {
      active = Option.none();
      cached = Option.none();
      return false;
    }
    active = Option.some(filename);
    cached = Option.some(toBuffer(bytes.value));
    return true;
  });

  const runOpenActive = Effect.fn('BlobGenerationStore.openActive')(function* () {
    const registry = yield* input.registry.read;
    if (Option.isNone(registry.active)) {
      yield* reconcile(registry);
      return false;
    }
    const opened = yield* load(registry.active.value);
    if (!opened) {
      // The registry names a generation OPFS no longer holds. Clearing it is
      // what lets the next `ensure` install cleanly rather than believing a
      // generation is current that cannot be read.
      yield* input.registry.write({ active: Option.none(), managed: registry.managed });
      yield* reconcile({ active: Option.none(), managed: registry.managed });
      return false;
    }
    yield* reconcile(withGeneration(registry, registry.active.value));
    return true;
  });

  const reserve = Effect.fn('BlobGenerationStore.reserve')(function* (preferredFilename: string) {
    const current = yield* input.registry.read;
    const filename = inactiveFilename(preferredFilename, current.active, suffix);
    if (Option.contains(current.active, filename)) {
      return yield* BlobGenerationError.make({
        operation: 'reserve',
        filename,
        cause: `${input.identity.generationPrefix} candidate generation must be inactive`,
      });
    }
    // Registered before a byte is written, so an interrupted install leaves a
    // name the next boot can reconcile rather than an orphan file.
    yield* input.registry.write(withGeneration(current, filename));
    return filename;
  });

  const activateVerified = Effect.fn('BlobGenerationStore.activateVerified')(function* (
    filename: string,
  ) {
    const before = withGeneration(yield* input.registry.read, filename);
    const previousActive = active;
    const previousCached = cached;
    // Read the new generation *before* committing the registry: an activation
    // that commits and then cannot read has published a generation nobody can
    // use, and the previous one is already gone from the marker.
    if (!(yield* load(filename))) {
      active = previousActive;
      cached = previousCached;
      return yield* BlobGenerationError.make({
        operation: 'activate',
        filename,
        cause: 'verified generation could not be read back',
      });
    }
    const commit = input.registry.write({
      active: Option.some(filename),
      managed: before.managed,
    });
    yield* commit.pipe(
      Effect.onError(() =>
        Effect.gen(function* () {
          // Roll the in-memory handoff back to whatever was serving before, so
          // a failed commit leaves the reader on the generation the durable
          // marker still names.
          active = previousActive;
          cached = previousCached;
          yield* discardCandidate(filename);
        }).pipe(Effect.ignore),
      ),
    );
    yield* reconcile({ active: Option.some(filename), managed: before.managed }).pipe(
      Effect.ignore,
    );
  });

  return {
    identity: input.identity,
    activeBytes: Effect.sync(() => cached),
    activeFilename: Effect.sync(() => active),
    openActive: Effect.suspend(runOpenActive),
    reserve,
    activateVerified,
    discardCandidate,
  };
};

/** OPFS, as the three operations `BlobFileStore` names.
 *
 *  The whole of the browser-specific code, so everything above is testable
 *  under Bun. `read` answers `None` for a missing file rather than failing,
 *  because "this generation is not on disk" is a state the store decides about
 *  — see `load`. */
export const makeOpfsBlobFileStore = (options?: {
  readonly getStorageRoot?: () => Promise<FileSystemDirectoryHandle>;
}): BlobFileStore => {
  const getStorageRoot = options?.getStorageRoot ?? (() => navigator.storage.getDirectory());
  const hostPromise = <A>(operation: string, filename: string, evaluate: () => Promise<A>) =>
    Effect.tryPromise({
      try: evaluate,
      catch: (cause) => BlobGenerationError.make({ operation, filename, cause }),
    });
  return {
    read: (filename) =>
      hostPromise('read-blob', filename, () =>
        getStorageRoot()
          .then((root) => root.getFileHandle(filename))
          .then((handle) => handle.getFile())
          .then((file) => file.arrayBuffer())
          .then((buffer) => Option.some(new Uint8Array(buffer))),
      ).pipe(
        // A `NotFoundError` from `getFileHandle` is the ordinary "not installed"
        // state, not a fault. Distinguishing it from a real read failure would
        // need the error's name, and the store treats both the same way — it
        // reconciles the registry — so the distinction has nowhere to go.
        Effect.orElseSucceed(() => Option.none<Uint8Array>()),
      ),
    remove: (filename) =>
      hostPromise('remove-blob', filename, () =>
        getStorageRoot().then((root) => root.removeEntry(filename)),
      ),
  };
};
