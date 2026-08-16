import type { CorpusStorageIdentity } from '@bible/core/corpus-supply';
import { Effect, Option } from 'effect';
import * as SQLite from 'wa-sqlite';

import type { GenerationRegistry, GenerationRegistryStore } from './generation-marker.js';
import type { SqliteDatabase, SqliteDatabaseFamily } from './sqlite-database.js';

export interface ReservedCorpusGeneration {
  readonly filename: string;
  readonly database: SqliteDatabase;
}

export interface CorpusGenerationStore<Corpus extends string = string> {
  /** The corpus whose generations this store owns. An installer only accepts a
   *  store whose identity is its own corpus, so a topics artifact cannot be
   *  wired onto Bible's store. */
  readonly identity: CorpusStorageIdentity<Corpus>;
  readonly active: SqliteDatabase;
  readonly activeFilename: Option.Option<string>;
  readonly openActive: Effect.Effect<boolean, unknown>;
  readonly reserve: (preferredFilename: string) => Effect.Effect<ReservedCorpusGeneration, unknown>;
  readonly activateVerified: (filename: string) => Effect.Effect<void, unknown>;
  readonly discardCandidate: (filename: string) => Effect.Effect<void, unknown>;
}

const without = (values: readonly string[], removed: string): readonly string[] =>
  values.filter((value) => value !== removed);

const withGeneration = (registry: GenerationRegistry, generation: string): GenerationRegistry => {
  if (registry.managed.includes(generation)) return registry;
  return { active: registry.active, managed: [...registry.managed, generation] };
};

const inactiveFilename = (preferredFilename: string, active: Option.Option<string>): string => {
  if (Option.contains(active, preferredFilename)) {
    return preferredFilename.replace(/\.db$/u, '-next.db');
  }
  return preferredFilename;
};

const registryRead = (registry: GenerationRegistryStore) => registry.read;

const registryWrite = (registry: GenerationRegistryStore, value: GenerationRegistry) =>
  registry.write(value);

/**
 * Owns the durable marker, reader handoff, and retirement policy for one browser corpus's generations.
 * Candidates are registered before bytes are written so startup can reconcile interrupted work.
 * Which filenames the store owns comes from the corpus storage identity, so a
 * generation belonging to another File Corpus is left registered and untouched.
 */
export const makeCorpusGenerationStore = <Corpus extends string>(input: {
  readonly identity: CorpusStorageIdentity<Corpus>;
  readonly databases: SqliteDatabaseFamily;
  readonly registry: GenerationRegistryStore;
  readonly discard: (filename: string) => Effect.Effect<void, unknown>;
}): CorpusGenerationStore<Corpus> => {
  const owned = input.identity.ownsGeneration;

  const discardFiles = (filename: string): Effect.Effect<boolean> =>
    input.discard(filename).pipe(
      Effect.as(true),
      Effect.orElseSucceed(() => false),
    );

  const reconcile = Effect.fn('CorpusGenerationStore.reconcile')(function* (
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
      { concurrency: 'unbounded' },
    );
    const retained = retirement
      .filter(({ discarded }) => !discarded)
      .map(({ generation }) => generation);
    if (retained.length !== registry.managed.length) {
      yield* registryWrite(input.registry, { active: registry.active, managed: retained });
    }
  });

  const discardCandidate = Effect.fn('CorpusGenerationStore.discardCandidate')(function* (
    filename: string,
  ) {
    const registry = yield* registryRead(input.registry);
    if (Option.contains(registry.active, filename)) return;
    if (!(yield* discardFiles(filename))) return;
    yield* registryWrite(input.registry, {
      active: registry.active,
      managed: without(registry.managed, filename),
    });
  });

  const runOpenActive = Effect.fn('CorpusGenerationStore.openActive')(function* () {
    const registry = yield* registryRead(input.registry);
    if (Option.isNone(registry.active)) {
      yield* reconcile(registry);
      return false;
    }
    const active = registry.active.value;
    yield* input.databases.activate(active, SQLite.SQLITE_OPEN_READWRITE);
    yield* reconcile(withGeneration(registry, active));
    return true;
  });
  const openActive = Effect.suspend(runOpenActive);

  const reserve = Effect.fn('CorpusGenerationStore.reserve')(function* (preferredFilename: string) {
    const current = yield* registryRead(input.registry);
    const filename = inactiveFilename(preferredFilename, current.active);
    if (Option.contains(current.active, filename)) {
      return yield* Effect.fail(
        `${input.identity.generationPrefix} candidate generation must be inactive`,
      );
    }
    const registry = withGeneration(current, filename);
    yield* registryWrite(input.registry, registry);
    return { filename, database: input.databases.candidate(filename) };
  });

  const activateVerified = Effect.fn('CorpusGenerationStore.activateVerified')(function* (
    filename: string,
  ) {
    const before = withGeneration(yield* registryRead(input.registry), filename);
    yield* input.databases.activate(filename, SQLite.SQLITE_OPEN_READWRITE);
    const commit = registryWrite(input.registry, {
      active: Option.some(filename),
      managed: before.managed,
    });
    yield* commit.pipe(
      Effect.onError(() =>
        Effect.gen(function* () {
          yield* Option.match(before.active, {
            onNone: () => input.databases.deactivate,
            onSome: (previous) => input.databases.activate(previous, SQLite.SQLITE_OPEN_READWRITE),
          });
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
    active: input.databases.active,
    get activeFilename() {
      return input.databases.activeFilename;
    },
    openActive,
    reserve,
    activateVerified,
    discardCandidate,
  };
};
