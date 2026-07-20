import { mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { afterEach, describe, expect, test } from 'bun:test';
import { Effect, Layer } from 'effect';

import { layerNativeBibleArtifacts, type NativeBibleArtifactSource } from './bible-artifact.js';
import type { CorpusSupplyReceipt } from '../corpus-supply/model.js';
import { CorpusSupply } from '../corpus-supply/service.js';

const directories: string[] = [];

const temporaryDirectory = async (): Promise<string> => {
  const directory = await mkdtemp(path.join(tmpdir(), 'bible-desktop-corpus-'));
  directories.push(directory);
  return directory;
};

afterEach(async () => {
  await Promise.all(directories.splice(0).map((directory) => rm(directory, { recursive: true })));
});

const ensure = (
  destination: string,
  sources: readonly NativeBibleArtifactSource[],
): Promise<CorpusSupplyReceipt> => {
  const artifacts = layerNativeBibleArtifacts({
    destination,
    sources,
    verify: (filename) => statSync(filename).size,
  });
  const supply = CorpusSupply.layer.pipe(Layer.provide(artifacts));
  return Effect.runPromise(
    Effect.gen(function* () {
      return yield* (yield* CorpusSupply).ensure();
    }).pipe(Effect.provide(supply)),
  );
};

describe('desktop Bible Artifact adapter', () => {
  test('activates the first available source atomically and reuses exact Provenance', async () => {
    const directory = await temporaryDirectory();
    const missing = path.join(directory, 'missing.db');
    const source = path.join(directory, 'source.db');
    const destination = path.join(directory, 'user-data', 'bible.db');
    await writeFile(source, 'canonical-corpus');
    const sources: readonly NativeBibleArtifactSource[] = [
      { kind: 'packaged', path: missing, label: 'packaged' },
      { kind: 'workspace', path: source, label: 'development' },
    ];

    const first = await ensure(destination, sources);
    const second = await ensure(destination, sources);

    expect(first.activated).toMatchObject([{ corpus: 'bible', identity: 'canonical' }]);
    expect(second.activated).toEqual([]);
    expect(second.skipped).toEqual(['canonical']);
    expect(await readFile(destination, 'utf8')).toBe('canonical-corpus');
    expect(stat(`${destination}.building`)).rejects.toMatchObject({ code: 'ENOENT' });
  });

  test('replaces the active Artifact when source revision changes', async () => {
    const directory = await temporaryDirectory();
    const source = path.join(directory, 'source.db');
    const destination = path.join(directory, 'bible.db');
    const sources: readonly NativeBibleArtifactSource[] = [
      { kind: 'workspace', path: source, label: 'test' },
    ];
    await writeFile(source, 'first');
    await ensure(destination, sources);

    await writeFile(source, 'second-version');
    const result = await ensure(destination, sources);

    expect(result.activated).toHaveLength(1);
    expect(await readFile(destination, 'utf8')).toBe('second-version');
  });

  test('fails before runtime construction when every source is unavailable', async () => {
    const directory = await temporaryDirectory();
    expect(
      ensure(path.join(directory, 'bible.db'), [
        { kind: 'packaged', path: path.join(directory, 'missing.db'), label: 'missing' },
      ]),
    ).rejects.toMatchObject({ _tag: 'CorpusSourceUnavailableError' });
  });
});
