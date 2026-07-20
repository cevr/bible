import { describe, expect, it } from 'bun:test';
import { BIBLE_ARTIFACT_RELEASE, CorpusSupply } from '@bible/core/corpus-supply';
import { Effect, Layer } from 'effect';

import { layerBrowserBibleArtifacts } from './bible-database.js';
import type { DatabaseFileDownloader } from './database-file-downloader.js';
import type { SqliteDatabase, SqliteRow } from './sqlite-database.js';

const digest = `sha256:${'a'.repeat(64)}`;

const makeDatabase = (options: {
  readonly events: string[];
  readonly provenance: boolean;
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
    if (sql.includes('FROM books')) return [{ count: 66 }];
    if (sql.includes('FROM verses')) return [{ count: 31_102 }];
    return [{ count: 1 }];
  },
  values: async () => [],
  write: async (_sql, params) => {
    options.events.push(`write:${String(params?.[0])}`);
    return 1;
  },
  exec: async () => {},
});

const makeDownloader = (events: string[]): DatabaseFileDownloader => ({
  install: async (_bytes, filename, onProgress) => {
    events.push(`install:${filename}`);
    onProgress(100);
    return { bytes: 149_000_000, digest };
  },
});

const ensure = async (options: { readonly provenance: boolean; readonly events: string[] }) => {
  const artifacts = layerBrowserBibleArtifacts({
    database: makeDatabase(options),
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
    expect(events).toHaveLength(1);
    expect(events[0]).toStartWith('open:');
  });

  it('atomically installs, verifies, and records Provenance for an absent Artifact', async () => {
    const events: string[] = [];
    const receipt = await ensure({ provenance: false, events });

    expect(receipt.activated).toMatchObject([{ corpus: 'bible', installed: 31_102 }]);
    expect(events).toContain('close');
    expect(events).toContain('install:bible.db');
    expect(events).toContain('write:corpus_source');
    expect(events).toContain('write:corpus_revision');
    expect(events).toContain('write:corpus_digest');
  });
});
