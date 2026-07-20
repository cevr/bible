import * as SQLite from 'wa-sqlite';

import type { GenerationRegistry, GenerationRegistryStore } from './generation-marker.js';
import type { SqliteDatabase, SqliteDatabaseFamily } from './sqlite-database.js';

const BIBLE_GENERATION = /^bible-[a-zA-Z0-9._-]+-[a-f0-9]{12}\.db$/u;

export interface BibleGenerationStore {
  readonly active: SqliteDatabase;
  readonly activeFilename: string | undefined;
  readonly openActive: () => Promise<boolean>;
  readonly reserve: (filename: string) => Promise<SqliteDatabase>;
  readonly activateVerified: (filename: string) => Promise<void>;
  readonly discardCandidate: (filename: string) => Promise<void>;
}

const without = (values: readonly string[], removed: string): readonly string[] =>
  values.filter((value) => value !== removed);

const withGeneration = (registry: GenerationRegistry, generation: string): GenerationRegistry => ({
  active: registry.active,
  managed: registry.managed.includes(generation)
    ? registry.managed
    : [...registry.managed, generation],
});

/**
 * Owns the durable marker, reader handoff, and retirement policy for browser Bible generations.
 * Candidates are registered before bytes are written so startup can reconcile interrupted work.
 */
export const makeBibleGenerationStore = (input: {
  readonly databases: SqliteDatabaseFamily;
  readonly registry: GenerationRegistryStore;
  readonly discard: (filename: string) => Promise<void>;
}): BibleGenerationStore => {
  const discardFiles = async (filename: string): Promise<boolean> => {
    try {
      await input.discard(filename);
      return true;
    } catch {
      return false;
    }
  };

  const reconcile = async (registry: GenerationRegistry): Promise<void> => {
    const retirement = await Promise.all(
      registry.managed.map(async (generation) => ({
        generation,
        discarded:
          generation !== registry.active &&
          BIBLE_GENERATION.test(generation) &&
          (await discardFiles(generation)),
      })),
    );
    const retained = retirement
      .filter(({ discarded }) => !discarded)
      .map(({ generation }) => generation);
    if (retained.length !== registry.managed.length) {
      await input.registry.write({ active: registry.active, managed: retained });
    }
  };

  const discardCandidate = async (filename: string): Promise<void> => {
    const registry = await input.registry.read();
    if (registry.active === filename) return;
    if (!(await discardFiles(filename))) return;
    await input.registry.write({
      active: registry.active,
      managed: without(registry.managed, filename),
    });
  };

  return {
    active: input.databases.active,
    get activeFilename() {
      return input.databases.activeFilename;
    },
    openActive: async () => {
      const registry = await input.registry.read();
      if (registry.active === undefined) {
        await reconcile(registry);
        return false;
      }
      await input.databases.activate(registry.active, SQLite.SQLITE_OPEN_READWRITE);
      await reconcile(withGeneration(registry, registry.active));
      return true;
    },
    reserve: async (filename) => {
      const registry = withGeneration(await input.registry.read(), filename);
      await input.registry.write(registry);
      return input.databases.candidate(filename);
    },
    activateVerified: async (filename) => {
      const before = withGeneration(await input.registry.read(), filename);
      await input.databases.activate(filename, SQLite.SQLITE_OPEN_READWRITE);
      try {
        await input.registry.write({ active: filename, managed: before.managed });
      } catch (cause) {
        if (before.active === undefined) await input.databases.deactivate();
        else await input.databases.activate(before.active, SQLite.SQLITE_OPEN_READWRITE);
        await discardCandidate(filename);
        throw cause;
      }
      await reconcile({ active: filename, managed: before.managed }).catch(() => undefined);
    },
    discardCandidate,
  };
};
