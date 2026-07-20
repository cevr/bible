import { BIBLE_ARTIFACT_RELEASE, CorpusSupply } from '@bible/core/corpus-supply';
import { describe, expect, it } from 'effect-bun-test';
import { Effect, Layer, Stream } from 'effect';

import { layerBrowserBibleArtifacts } from './bible-database.js';
import { makeBibleGenerationStore } from './bible-generation-store.js';
import type { DatabaseFileDownloader } from './database-file-downloader.js';
import type { GenerationRegistry, GenerationRegistryStore } from './generation-marker.js';
import type { SqliteDatabase, SqliteDatabaseFamily, SqliteRow } from './sqlite-database.js';

const digest = BIBLE_ARTIFACT_RELEASE.digest;

const makeDatabase = (options: {
  readonly events: string[];
  readonly provenance: boolean;
  readonly valid?: boolean;
  readonly revision?: string;
  readonly generation?: string;
  readonly refresh?: boolean;
}): SqliteDatabase => ({
  isOpen: false,
  open: (flags) =>
    Effect.sync(() => options.events.push(`open:${String(flags)}`)).pipe(Effect.asVoid),
  close: () => Effect.sync(() => options.events.push('close')).pipe(Effect.asVoid),
  query: (sql) =>
    Effect.sync((): readonly SqliteRow[] => {
      if (sql === 'PRAGMA integrity_check') return [{ integrity_check: 'ok' }];
      if (sql.includes('FROM meta')) {
        if (!options.provenance) return [];
        return [
          { key: 'corpus_source', value: 'bible-release' },
          {
            key: 'corpus_revision',
            value: options.revision ?? BIBLE_ARTIFACT_RELEASE.revision,
          },
          { key: 'corpus_digest', value: digest },
        ];
      }
      if (sql.includes('FROM books')) {
        if (options.valid === false) return [{ count: 0 }];
        return [{ count: 66 }];
      }
      if (sql.includes('FROM verses')) return [{ count: 31_102 }];
      return [{ count: 1 }];
    }),
  values: () => Effect.succeed([]),
  write: (_sql, params) =>
    Effect.sync(() => {
      options.events.push(`write:${String(params?.[0])}`);
      return 1;
    }),
  exec: (sql) => Effect.sync(() => options.events.push(`exec:${sql}`)).pipe(Effect.asVoid),
});

const makeDownloader = (events: string[]): DatabaseFileDownloader => ({
  install: (_bytes, filename, onProgress) =>
    Effect.sync(() => {
      events.push(`install:${filename}`);
      onProgress(100);
      return { bytes: 149_000_000, digest };
    }),
});

const ensure = (options: {
  readonly provenance: boolean;
  readonly events: string[];
  readonly valid?: boolean;
  readonly revision?: string;
  readonly generation?: string;
  readonly refresh?: boolean;
}) => {
  const database = makeDatabase(options);
  let activeFilename: string | undefined;
  const databases: SqliteDatabaseFamily = {
    active: database,
    candidate: () => database,
    activate: (filename) =>
      Effect.sync(() => {
        options.events.push(`activate:${filename}`);
        activeFilename = filename;
      }),
    deactivate: () =>
      Effect.sync(() => {
        options.events.push('deactivate');
        activeFilename = undefined;
      }),
    get activeFilename() {
      return activeFilename;
    },
  };
  let registry: GenerationRegistry = { active: undefined, managed: [] };
  if (options.provenance) {
    const generation = options.generation ?? 'bible-db-v2-e72244f576be.db';
    registry = { active: generation, managed: [generation] };
  }
  const registryStore: GenerationRegistryStore = {
    read: () =>
      Effect.sync(() => {
        options.events.push('registry:read');
        return registry;
      }),
    write: (next) =>
      Effect.sync(() => {
        options.events.push(`registry:write:${next.active ?? 'none'}`);
        registry = next;
      }),
  };
  const artifacts = layerBrowserBibleArtifacts({
    generations: makeBibleGenerationStore({
      databases,
      registry: registryStore,
      discard: (filename) =>
        Effect.sync(() => options.events.push(`discard:${filename}`)).pipe(Effect.asVoid),
    }),
    downloader: makeDownloader(options.events),
    fetch: () => Effect.succeed({ status: 200, bytes: Stream.make(new Uint8Array([1])) }),
  });
  const supply = CorpusSupply.layer.pipe(Layer.provide(artifacts));
  return Effect.gen(function* () {
    return yield* (yield* CorpusSupply).ensure({ refresh: options.refresh });
  }).pipe(Effect.provide(supply));
};

describe('browser Bible Artifact adapter', () => {
  it.effect('keeps an exact verified Artifact active', () =>
    Effect.gen(function* () {
      const events: string[] = [];
      const receipt = yield* ensure({ provenance: true, events });

      expect(receipt.activated).toEqual([]);
      expect(receipt.skipped).toEqual(['canonical']);
      expect(events[0]).toBe('registry:read');
      expect(events[1]).toStartWith('activate:');
    }),
  );

  it.effect('atomically installs, verifies, and records Provenance for an absent Artifact', () =>
    Effect.gen(function* () {
      const events: string[] = [];
      const receipt = yield* ensure({ provenance: false, events });

      expect(receipt.activated).toMatchObject([{ corpus: 'bible', installed: 31_102 }]);
      expect(events).toContain('install:bible-db-v2-e72244f576be.db');
      expect(events).toContain('exec:BEGIN IMMEDIATE');
      expect(events).toContain('exec:COMMIT');
      expect(events).toContain('write:corpus_source');
      expect(events).toContain('write:corpus_revision');
      expect(events).toContain('write:corpus_digest');
      expect(events.indexOf('exec:COMMIT')).toBeLessThan(
        events.lastIndexOf('registry:write:bible-db-v2-e72244f576be.db'),
      );
      expect(events.indexOf('activate:bible-db-v2-e72244f576be.db')).toBeLessThan(
        events.lastIndexOf('registry:write:bible-db-v2-e72244f576be.db'),
      );
    }),
  );

  it.effect('preserves the active generation when semantic verification rejects a candidate', () =>
    Effect.gen(function* () {
      const events: string[] = [];

      const failure = yield* Effect.flip(ensure({ provenance: false, valid: false, events }));
      expect(failure).toMatchObject({ _tag: 'CorpusInstallationError' });
      expect(events.some((event) => event === 'registry:write:bible-db-v2-e72244f576be.db')).toBe(
        false,
      );
      expect(events.some((event) => event.startsWith('activate:'))).toBe(false);
      expect(events).toContain('discard:bible-db-v2-e72244f576be.db');
    }),
  );

  it.effect('retires the closed predecessor only after activating the verified generation', () =>
    Effect.gen(function* () {
      const events: string[] = [];
      yield* ensure({
        provenance: true,
        revision: 'db-v1',
        generation: 'bible-db-v1-5f3bfd31151b.db',
        events,
      });

      const activated = events.indexOf('activate:bible-db-v2-e72244f576be.db');
      const discarded = events.indexOf('discard:bible-db-v1-5f3bfd31151b.db');
      expect(activated).toBeGreaterThanOrEqual(0);
      expect(discarded).toBeGreaterThan(activated);
    }),
  );

  it.effect('refreshes a current Artifact through an inactive generation slot', () =>
    Effect.gen(function* () {
      const events: string[] = [];
      const active = 'bible-db-v2-e72244f576be.db';

      yield* ensure({ provenance: true, generation: active, refresh: true, events });

      expect(events).toContain('install:bible-db-v2-e72244f576be-next.db');
      expect(events).toContain('activate:bible-db-v2-e72244f576be-next.db');
      expect(events).toContain(`discard:${active}`);
      expect(events.indexOf(`discard:${active}`)).toBeGreaterThan(
        events.indexOf('activate:bible-db-v2-e72244f576be-next.db'),
      );
    }),
  );
});
