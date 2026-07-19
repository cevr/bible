import { mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { afterEach, describe, expect, test } from 'vitest';

import { provisionBibleCorpus } from '../electron/bible-corpus-file.js';

const directories: string[] = [];

const temporaryDirectory = async (): Promise<string> => {
  const directory = await mkdtemp(path.join(tmpdir(), 'bible-desktop-corpus-'));
  directories.push(directory);
  return directory;
};

afterEach(async () => {
  await Promise.all(directories.splice(0).map((directory) => rm(directory, { recursive: true })));
});

describe('desktop Bible corpus provisioning', () => {
  test('copies the first available source atomically and reuses an unchanged corpus', async () => {
    const directory = await temporaryDirectory();
    const missing = path.join(directory, 'missing.db');
    const source = path.join(directory, 'source.db');
    const destination = path.join(directory, 'user-data', 'bible.db');
    await writeFile(source, 'canonical-corpus');

    const first = await provisionBibleCorpus({
      destination,
      sources: [
        { path: missing, label: 'packaged' },
        { path: source, label: 'development' },
      ],
    });
    const second = await provisionBibleCorpus({
      destination,
      sources: [{ path: source, label: 'development' }],
    });

    expect(first).toMatchObject({ copied: true, source: { label: 'development' } });
    expect(second.copied).toBe(false);
    expect(await readFile(destination, 'utf8')).toBe('canonical-corpus');
    await expect(stat(`${destination}.building`)).rejects.toMatchObject({ code: 'ENOENT' });
  });

  test('replaces the destination when the canonical corpus changes', async () => {
    const directory = await temporaryDirectory();
    const source = path.join(directory, 'source.db');
    const destination = path.join(directory, 'bible.db');
    await writeFile(source, 'first');
    await provisionBibleCorpus({ destination, sources: [{ path: source, label: 'test' }] });

    await writeFile(source, 'second-version');
    const result = await provisionBibleCorpus({
      destination,
      sources: [{ path: source, label: 'test' }],
    });

    expect(result.copied).toBe(true);
    expect(await readFile(destination, 'utf8')).toBe('second-version');
  });

  test('fails before runtime construction when no corpus exists', async () => {
    const directory = await temporaryDirectory();
    await expect(
      provisionBibleCorpus({
        destination: path.join(directory, 'bible.db'),
        sources: [{ path: path.join(directory, 'missing.db'), label: 'missing' }],
      }),
    ).rejects.toThrow('Bible corpus is unavailable');
  });
});
