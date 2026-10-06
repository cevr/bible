// The in-memory file system the tool tests run on writes as a disk does for
// each flag it models, and refuses a flag it does not model.

import { describe, expect, it } from 'effect-bun-test';
import { Effect, FileSystem } from 'effect';
import { memoryFileSystem } from './testing.ts';

const FILE = '/films/test/tally.tsv';

/** `effect` run over a memory file system on `files`, with `/films/test` made. */
const over = <A, E>(
  files: Map<string, Uint8Array>,
  effect: Effect.Effect<A, E, FileSystem.FileSystem>,
) => Effect.provide(effect, memoryFileSystem(files, new Set(['/films', '/films/test'])));

const read = (files: Map<string, Uint8Array>) => new TextDecoder().decode(files.get(FILE));

describe('the in-memory file system', () => {
  it.effect("appends with 'a', as journal.ts's note and library.ts's tally write", () => {
    const files = new Map<string, Uint8Array>();
    return over(
      files,
      Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem;
        yield* fs.writeFileString(FILE, 'first\n', { flag: 'a' });
        yield* fs.writeFileString(FILE, 'tail\n', { flag: 'a' });
        expect(read(files)).toBe('first\ntail\n');
        yield* fs.writeFile(FILE, new TextEncoder().encode('more\n'), { flag: 'a' });
        expect(read(files)).toBe('first\ntail\nmore\n');
      }),
    );
  });

  // Each writer runs long enough for the scheduler to yield it mid-write.
  it.live("keeps every byte two writers append at once, 1,500 each, as a disk's 'a' does", () => {
    const files = new Map<string, Uint8Array>();
    return over(
      files,
      Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem;
        const writer = (byte: string) =>
          Effect.forEach(
            Array.from({ length: 1500 }, () => byte),
            (b) => fs.writeFileString(FILE, b, { flag: 'a' }),
            { discard: true },
          );
        yield* Effect.all([writer('a'), writer('b')], { concurrency: 2, discard: true });
        expect(read(files).length).toBe(3000);
      }),
    );
  });

  it.effect("replaces with 'w' or no flag; 'wx' and 'ax' create only a path not there", () => {
    const files = new Map<string, Uint8Array>();
    return over(
      files,
      Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem;
        yield* fs.writeFileString(FILE, 'one');
        yield* fs.writeFileString(FILE, 'two', { flag: 'w' });
        expect(read(files)).toBe('two');
        for (const flag of ['wx', 'ax'] as const) {
          const refused = yield* Effect.flip(fs.writeFileString(FILE, 'three', { flag }));
          expect(refused.reason._tag).toBe('AlreadyExists');
        }
        expect(read(files)).toBe('two');
        yield* fs.writeFileString(`${FILE}.new`, 'made', { flag: 'ax' });
        expect(new TextDecoder().decode(files.get(`${FILE}.new`))).toBe('made');
      }),
    );
  });

  it.effect('refuses a flag it does not model, naming it, and writes nothing', () => {
    const files = new Map<string, Uint8Array>();
    return over(
      files,
      Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem;
        for (const flag of ['r', 'r+', 'a+'] as const) {
          const refused = yield* Effect.flip(fs.writeFileString(FILE, 'x', { flag }));
          expect(refused.reason._tag).toBe('BadArgument');
          expect(refused.message).toContain(`'${flag}'`);
        }
        expect(files.has(FILE)).toBe(false);
      }),
    );
  });
});
