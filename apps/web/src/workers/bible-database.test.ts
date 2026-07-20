import { describe, expect, it } from 'bun:test';
import { BIBLE_ARTIFACT_RELEASE, CorpusSupply } from '@bible/core/corpus-supply';
import { Effect, Layer } from 'effect';

import { layerBrowserBibleArtifacts } from './bible-database.js';
import type { DatabaseFileDownloader } from './database-file-downloader.js';
import type { GenerationMarkerStore } from './generation-marker.js';
import type { SqliteDatabase, SqliteDatabaseFamily, SqliteRow } from './sqlite-database.js';

const digest = BIBLE_ARTIFACT_RELEASE.digest;

const makeDatabase = (options: {
  readonly events: string[];
  readonly provenance: boolean;
  readonly valid?: boolean;
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
            { key: 'corpus_revision', value: BIBLE_ARTIFACT_RELEASE.revision },
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
    get activeFilename() {
      return activeFilename;
    },
  };
  const marker: GenerationMarkerStore = {
    read: async () => {
      options.events.push('marker:read');
      return options.provenance ? 'bible-db-v2-e72244f576be.db' : undefined;
    },
    write: async (generation) => {
      options.events.push(`marker:write:${generation}`);
    },
  };
  const artifacts = layerBrowserBibleArtifacts({
    databases,
    marker,
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
    expect(events[0]).toBe('marker:read');
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
      events.indexOf('marker:write:bible-db-v2-e72244f576be.db'),
    );
    expect(events.indexOf('marker:write:bible-db-v2-e72244f576be.db')).toBeLessThan(
      events.indexOf('activate:bible-db-v2-e72244f576be.db'),
    );
  });

  it('preserves the active generation when semantic verification rejects a candidate', async () => {
    const events: string[] = [];

    expect(ensure({ provenance: false, valid: false, events })).rejects.toMatchObject({
      _tag: 'CorpusInstallationError',
    });
    expect(events.some((event) => event.startsWith('marker:write:'))).toBe(false);
    expect(events.some((event) => event.startsWith('activate:'))).toBe(false);
  });
});
