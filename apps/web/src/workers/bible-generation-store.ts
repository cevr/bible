import { Effect } from 'effect';
import * as SQLite from 'wa-sqlite';

import type { GenerationRegistry, GenerationRegistryStore } from './generation-marker.js';
import type { SqliteDatabase, SqliteDatabaseFamily } from './sqlite-database.js';

const BIBLE_GENERATION = /^bible-[a-zA-Z0-9._-]+-[a-f0-9]{12}(?:-next)?\.db$/u;

export interface ReservedBibleGeneration {
  readonly filename: string;
  readonly database: SqliteDatabase;
}

export interface BibleGenerationStore {
  readonly active: SqliteDatabase;
  readonly activeFilename: string | undefined;
  readonly openActive: () => Effect.Effect<boolean, unknown>;
  readonly reserve: (preferredFilename: string) => Effect.Effect<ReservedBibleGeneration, unknown>;
  readonly activateVerified: (filename: string) => Effect.Effect<void, unknown>;
  readonly discardCandidate: (filename: string) => Effect.Effect<void, unknown>;
}

const without = (values: readonly string[], removed: string): readonly string[] =>
  values.filter((value) => value !== removed);

const withGeneration = (registry: GenerationRegistry, generation: string): GenerationRegistry => {
  if (registry.managed.includes(generation)) return registry;
  return { active: registry.active, managed: [...registry.managed, generation] };
};

const inactiveFilename = (preferredFilename: string, active: string | undefined): string => {
  if (preferredFilename === active) return preferredFilename.replace(/\.db$/u, '-next.db');
  return preferredFilename;
};

const registryRead = (registry: GenerationRegistryStore) => registry.read();

const registryWrite = (registry: GenerationRegistryStore, value: GenerationRegistry) =>
  registry.write(value);

/**
 * Owns the durable marker, reader handoff, and retirement policy for browser Bible generations.
 * Candidates are registered before bytes are written so startup can reconcile interrupted work.
 */
export const makeBibleGenerationStore = (input: {
  readonly databases: SqliteDatabaseFamily;
  readonly registry: GenerationRegistryStore;
  readonly discard: (filename: string) => Effect.Effect<void, unknown>;
}): BibleGenerationStore => {
  const discardFiles = (filename: string): Effect.Effect<boolean> =>
    input.discard(filename).pipe(
      Effect.as(true),
      Effect.catch(() => Effect.succeed(false)),
    );

  const reconcile = Effect.fn('BibleGenerationStore.reconcile')(function* (
    registry: GenerationRegistry,
  ) {
    const retirement = yield* Effect.forEach(
      registry.managed,
      Effect.fnUntraced(function* (generation) {
        let discarded = false;
        if (generation !== registry.active && BIBLE_GENERATION.test(generation)) {
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

  const discardCandidate = Effect.fn('BibleGenerationStore.discardCandidate')(function* (
    filename: string,
  ) {
    const registry = yield* registryRead(input.registry);
    if (registry.active === filename) return;
    if (!(yield* discardFiles(filename))) return;
    yield* registryWrite(input.registry, {
      active: registry.active,
      managed: without(registry.managed, filename),
    });
  });

  const openActive = Effect.fn('BibleGenerationStore.openActive')(function* () {
    const registry = yield* registryRead(input.registry);
    if (registry.active === undefined) {
      yield* reconcile(registry);
      return false;
    }
    yield* input.databases.activate(registry.active, SQLite.SQLITE_OPEN_READWRITE);
    yield* reconcile(withGeneration(registry, registry.active));
    return true;
  });

  const reserve = Effect.fn('BibleGenerationStore.reserve')(function* (preferredFilename: string) {
    const current = yield* registryRead(input.registry);
    const filename = inactiveFilename(preferredFilename, current.active);
    if (filename === current.active) {
      return yield* Effect.fail('Bible candidate generation must be inactive');
    }
    const registry = withGeneration(current, filename);
    yield* registryWrite(input.registry, registry);
    return { filename, database: input.databases.candidate(filename) };
  });

  const activateVerified = Effect.fn('BibleGenerationStore.activateVerified')(function* (
    filename: string,
  ) {
    const before = withGeneration(yield* registryRead(input.registry), filename);
    yield* input.databases.activate(filename, SQLite.SQLITE_OPEN_READWRITE);
    const commit = registryWrite(input.registry, { active: filename, managed: before.managed });
    yield* commit.pipe(
      Effect.onError(() =>
        Effect.gen(function* () {
          if (before.active === undefined) yield* input.databases.deactivate();
          else yield* input.databases.activate(before.active, SQLite.SQLITE_OPEN_READWRITE);
          yield* discardCandidate(filename);
        }).pipe(Effect.ignore),
      ),
    );
    yield* reconcile({ active: filename, managed: before.managed }).pipe(Effect.ignore);
  });

  return {
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
