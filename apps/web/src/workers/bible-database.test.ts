import { describe, expect, it } from 'bun:test';
import { BIBLE_ARTIFACT_RELEASE, CorpusSupply } from '@bible/core/corpus-supply';
import { Effect, Layer } from 'effect';

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
}): SqliteDatabase => ({
  isOpen: false,
  open: async (flags) => {
    options.events.push(`open:${String(flags)}`);
  },
  close: async () => {
    options.events.push('close');
  },
  query: async (sql): Promise<readonly SqliteRow[]> => {
    if (sql === 'PRAGMA integrity_check') return [{ integrity_check: 'ok' }];
    if (sql.includes('FROM meta')) {
      return options.provenance
        ? [
            { key: 'corpus_source', value: 'bible-release' },
            {
              key: 'corpus_revision',
              value: options.revision ?? BIBLE_ARTIFACT_RELEASE.revision,
            },
            { key: 'corpus_digest', value: digest },
          ]
        : [];
    }
    if (sql.includes('FROM books')) return [{ count: options.valid === false ? 0 : 66 }];
    if (sql.includes('FROM verses')) return [{ count: 31_102 }];
    return [{ count: 1 }];
  },
  values: async () => [],
  write: async (_sql, params) => {
    options.events.push(`write:${String(params?.[0])}`);
    return 1;
  },
  exec: async (sql) => {
    options.events.push(`exec:${sql}`);
  },
});

const makeDownloader = (events: string[]): DatabaseFileDownloader => ({
  install: async (_bytes, filename, onProgress) => {
    events.push(`install:${filename}`);
    onProgress(100);
    return { bytes: 149_000_000, digest };
  },
});

const ensure = async (options: {
  readonly provenance: boolean;
  readonly events: string[];
  readonly valid?: boolean;
  readonly revision?: string;
  readonly generation?: string;
}) => {
  const database = makeDatabase(options);
  let activeFilename: string | undefined;
  const databases: SqliteDatabaseFamily = {
    active: database,
    candidate: () => database,
    activate: async (filename) => {
      options.events.push(`activate:${filename}`);
      activeFilename = filename;
    },
    deactivate: async () => {
      options.events.push('deactivate');
      activeFilename = undefined;
    },
    get activeFilename() {
      return activeFilename;
    },
  };
  let registry: GenerationRegistry = {
    active: options.provenance ? (options.generation ?? 'bible-db-v2-e72244f576be.db') : undefined,
    managed: options.provenance ? [options.generation ?? 'bible-db-v2-e72244f576be.db'] : [],
  };
  const registryStore: GenerationRegistryStore = {
    read: async () => {
      options.events.push('registry:read');
      return registry;
    },
    write: async (next) => {
      options.events.push(`registry:write:${next.active ?? 'none'}`);
      registry = next;
    },
  };
  const artifacts = layerBrowserBibleArtifacts({
    generations: makeBibleGenerationStore({
      databases,
      registry: registryStore,
      discard: async (filename) => {
        options.events.push(`discard:${filename}`);
      },
    }),
    downloader: makeDownloader(options.events),
    fetch: async () => new Response(new Uint8Array([1])),
  });
  const supply = CorpusSupply.layer.pipe(Layer.provide(artifacts));
  return Effect.runPromise(
    Effect.gen(function* () {
      return yield* (yield* CorpusSupply).ensure();
    }).pipe(Effect.provide(supply)),
  );
};

describe('browser Bible Artifact adapter', () => {
  it('keeps an exact verified Artifact active', async () => {
    const events: string[] = [];
    const receipt = await ensure({ provenance: true, events });

    expect(receipt.activated).toEqual([]);
    expect(receipt.skipped).toEqual(['canonical']);
    expect(events[0]).toBe('registry:read');
    expect(events[1]).toStartWith('activate:');
  });

  it('atomically installs, verifies, and records Provenance for an absent Artifact', async () => {
    const events: string[] = [];
    const receipt = await ensure({ provenance: false, events });

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
  });

  it('preserves the active generation when semantic verification rejects a candidate', async () => {
    const events: string[] = [];

    expect(ensure({ provenance: false, valid: false, events })).rejects.toMatchObject({
      _tag: 'CorpusInstallationError',
    });
    expect(events.some((event) => event === 'registry:write:bible-db-v2-e72244f576be.db')).toBe(
      false,
    );
    expect(events.some((event) => event.startsWith('activate:'))).toBe(false);
    expect(events).toContain('discard:bible-db-v2-e72244f576be.db');
  });

  it('retires the closed predecessor only after activating the verified generation', async () => {
    const events: string[] = [];
    await ensure({
      provenance: true,
      revision: 'db-v1',
      generation: 'bible-db-v1-5f3bfd31151b.db',
      events,
    });

    const activated = events.indexOf('activate:bible-db-v2-e72244f576be.db');
    const discarded = events.indexOf('discard:bible-db-v1-5f3bfd31151b.db');
    expect(activated).toBeGreaterThanOrEqual(0);
    expect(discarded).toBeGreaterThan(activated);
  });
});
