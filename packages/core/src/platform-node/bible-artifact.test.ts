import { BunFileSystem } from '@effect/platform-bun';
import { Effect, FileSystem, Layer, Option } from 'effect';
import { describe, expect, it } from 'effect-bun-test';

import type { CorpusSupplyReceipt } from '../corpus-supply/model.js';
import { CorpusSupply } from '../corpus-supply/service.js';
import {
  layerNativeBibleArtifacts,
  type NativeBibleArtifactProvenanceStore,
  type NativeBibleArtifactSource,
} from './bible-artifact.js';

const makeProvenanceStore = (): NativeBibleArtifactProvenanceStore => {
  let current: ReturnType<NativeBibleArtifactProvenanceStore['read']> | undefined;

  return {
    read: () => Option.getOrThrow(Option.fromNullishOr(current)),
    write: (_filename, provenance) => {
      current = provenance;
    },
  };
};

const ensure = (
  destination: string,
  sources: readonly NativeBibleArtifactSource[],
  provenanceStore: NativeBibleArtifactProvenanceStore,
  fetch?: (url: string) => Effect.Effect<Response, unknown>,
): Effect.Effect<CorpusSupplyReceipt, unknown> => {
  const artifacts = layerNativeBibleArtifacts({
    destination,
    sources,
    fetch,
    provenanceStore,
    verify: () => 1,
  });
  const supply = CorpusSupply.layer.pipe(Layer.provide(artifacts));
  return Effect.gen(function* () {
    return yield* (yield* CorpusSupply).ensure();
  }).pipe(Effect.provide(supply));
};

describe('desktop Bible Artifact adapter', () => {
  const test = it.scopedLive.layer(BunFileSystem.layer);

  test('activates the first available source atomically and reuses exact Provenance', () =>
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const directory = yield* fs.makeTempDirectoryScoped({ prefix: 'bible-desktop-corpus-' });
      const missing = `${directory}/missing.db`;
      const source = `${directory}/source.db`;
      const destination = `${directory}/user-data/bible.db`;
      const provenanceStore = makeProvenanceStore();
      yield* fs.writeFileString(source, 'canonical-corpus');
      const sources: readonly NativeBibleArtifactSource[] = [
        { kind: 'packaged', path: missing, label: 'packaged' },
        { kind: 'workspace', path: source, label: 'development' },
      ];

      const first = yield* ensure(destination, sources, provenanceStore);
      const second = yield* ensure(destination, sources, provenanceStore);

      expect(first.activated).toMatchObject([{ corpus: 'bible', identity: 'canonical' }]);
      expect(second.activated).toEqual([]);
      expect(second.skipped).toEqual(['canonical']);
      expect(yield* fs.readFileString(destination)).toBe('canonical-corpus');
      expect(yield* fs.exists(`${destination}.building`)).toBe(false);
      expect(yield* fs.exists(`${destination}.provenance.json`)).toBe(false);
    }));

  test('replaces the active Artifact when source revision changes', () =>
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const directory = yield* fs.makeTempDirectoryScoped({ prefix: 'bible-desktop-corpus-' });
      const source = `${directory}/source.db`;
      const destination = `${directory}/bible.db`;
      const provenanceStore = makeProvenanceStore();
      const sources: readonly NativeBibleArtifactSource[] = [
        { kind: 'workspace', path: source, label: 'test' },
      ];
      yield* fs.writeFileString(source, 'first');
      yield* ensure(destination, sources, provenanceStore);

      yield* fs.writeFileString(source, 'second-version');
      const result = yield* ensure(destination, sources, provenanceStore);

      expect(result.activated).toHaveLength(1);
      expect(yield* fs.readFileString(destination)).toBe('second-version');
    }));

  test('fails before runtime construction when every source is unavailable', () =>
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const directory = yield* fs.makeTempDirectoryScoped({ prefix: 'bible-desktop-corpus-' });
      const failure = yield* Effect.flip(
        ensure(
          `${directory}/bible.db`,
          [{ kind: 'packaged', path: `${directory}/missing.db`, label: 'missing' }],
          makeProvenanceStore(),
        ),
      );

      expect(failure).toMatchObject({ _tag: 'CorpusSourceUnavailableError' });
    }));

  test('rejects release bytes that do not match the pinned manifest', () =>
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const directory = yield* fs.makeTempDirectoryScoped({ prefix: 'bible-desktop-corpus-' });
      const destination = `${directory}/bible.db`;
      const failure = yield* Effect.flip(
        ensure(
          destination,
          [
            {
              kind: 'release',
              url: 'https://example.test/bible.db',
              revision: 'fixture',
              digest: `sha256:${'a'.repeat(64)}`,
            },
          ],
          makeProvenanceStore(),
          () => Effect.succeed(new Response('wrong bytes')),
        ),
      );

      expect(failure).toMatchObject({ _tag: 'CorpusInstallationError' });
      expect(yield* fs.exists(destination)).toBe(false);
    }));
});
