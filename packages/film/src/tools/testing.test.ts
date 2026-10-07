// The in-memory file system the tool tests run on writes as a disk does for
// each flag it models, and refuses a flag it does not model. One contract runs
// every operation the tools lean on against it and against Bun's file system,
// and their outcomes must match: a test on the double then passes only where
// the box would.

import { BunServices } from '@effect/platform-bun';
import { describe, expect, it } from 'effect-bun-test';
import { Context, Effect, FileSystem, Layer, Predicate } from 'effect';
import type { PlatformError } from 'effect/PlatformError';
import { memoryFileSystem, text } from './testing.ts';

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

  it.effect('refuses to make a path that is not absolute, having no folder to make it in', () => {
    const files = new Map<string, Uint8Array>();
    return over(
      files,
      Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem;
        for (const made of [
          fs.writeFileString('tally.tsv', 'x'),
          fs.makeDirectory('films'),
          fs.writeFileString('C:\\films\\tally.tsv', 'x'),
        ])
          expect((yield* Effect.flip(made)).reason._tag).toBe('BadArgument');
        expect(files.size).toBe(0);
        expect(yield* fs.exists('tally.tsv')).toBe(false);
      }),
    );
  });
});

/** An operation of the contract, on a file system whose tree sits at `at('')`. */
type Operation = (
  fs: FileSystem.FileSystem,
  at: (relative: string) => string,
) => Effect.Effect<unknown, PlatformError>;

/**
 * What every case starts from, under the case's own folder: a file `a.txt`,
 * a folder `sub` holding `inner.txt`, and an empty folder `empty`.
 */
const START = { files: { 'a.txt': 'a', 'sub/inner.txt': 'i' }, folders: ['sub', 'empty'] };

/** Each operation the tools lean on, at the edges a disk refuses. */
const CASES: ReadonlyArray<readonly [string, Operation]> = [
  ['writes into a folder never made', (fs, at) => fs.writeFileString(at('nope/b.txt'), 'b')],
  ['writes into a file as if a folder', (fs, at) => fs.writeFileString(at('a.txt/b.txt'), 'b')],
  ["replaces a file with 'w'", (fs, at) => fs.writeFileString(at('a.txt'), 'w', { flag: 'w' })],
  ["appends to a file with 'a'", (fs, at) => fs.writeFileString(at('a.txt'), '+', { flag: 'a' })],
  ["'wx' over a file", (fs, at) => fs.writeFileString(at('a.txt'), 'x', { flag: 'wx' })],
  ["'wx' over a folder", (fs, at) => fs.writeFileString(at('empty'), 'x', { flag: 'wx' })],
  ["'ax' over a file", (fs, at) => fs.writeFileString(at('a.txt'), 'x', { flag: 'ax' })],
  ["'ax' where nothing is", (fs, at) => fs.writeFileString(at('new.txt'), 'n', { flag: 'ax' })],
  ['writes where a folder is', (fs, at) => fs.writeFileString(at('sub'), 'x')],
  ['reads a file', (fs, at) => fs.readFileString(at('a.txt'))],
  ['reads a folder', (fs, at) => fs.readFileString(at('sub'))],
  ['reads a file not there', (fs, at) => fs.readFileString(at('nope.txt'))],
  ['renames a file over another', (fs, at) => fs.rename(at('a.txt'), at('sub/inner.txt'))],
  ['renames a file into a folder never made', (fs, at) => fs.rename(at('a.txt'), at('no/b.txt'))],
  ['renames a file over a folder', (fs, at) => fs.rename(at('a.txt'), at('empty'))],
  ['renames a file not there', (fs, at) => fs.rename(at('nope.txt'), at('b.txt'))],
  ['renames a folder', (fs, at) => fs.rename(at('sub'), at('moved'))],
  ['makes a folder whose parent is missing', (fs, at) => fs.makeDirectory(at('x/y'))],
  ['makes a folder already there', (fs, at) => fs.makeDirectory(at('sub'))],
  ['makes a folder where a file is', (fs, at) => fs.makeDirectory(at('a.txt'))],
  // Node's recursive `mkdir` answers the first folder it made, past `void`.
  [
    'makes a folder already there, recursive',
    (fs, at) => Effect.asVoid(fs.makeDirectory(at('sub'), { recursive: true })),
  ],
  [
    'makes folders, recursive',
    (fs, at) => Effect.asVoid(fs.makeDirectory(at('x/y/z'), { recursive: true })),
  ],
  [
    'makes folders through a file, recursive',
    (fs, at) => fs.makeDirectory(at('a.txt/y'), { recursive: true }),
  ],
  ['lists a folder', (fs, at) => fs.readDirectory(at(''))],
  ['lists a folder not there', (fs, at) => fs.readDirectory(at('nope'))],
  ['lists a file', (fs, at) => fs.readDirectory(at('a.txt'))],
  ['removes a file', (fs, at) => fs.remove(at('a.txt'))],
  ['removes a file not there', (fs, at) => fs.remove(at('nope.txt'))],
  ['removes a file not there, forced', (fs, at) => fs.remove(at('nope.txt'), { force: true })],
  ['removes a folder, not recursive', (fs, at) => fs.remove(at('sub'))],
  ['removes an empty folder, not recursive', (fs, at) => fs.remove(at('empty'))],
  ['removes a folder, recursive', (fs, at) => fs.remove(at('sub'), { recursive: true })],
  ['links a file to a new name', (fs, at) => fs.link(at('a.txt'), at('b.txt'))],
  ['links a file over one there', (fs, at) => fs.link(at('a.txt'), at('sub/inner.txt'))],
  ['links a file not there', (fs, at) => fs.link(at('nope.txt'), at('b.txt'))],
  ['links into a folder never made', (fs, at) => fs.link(at('a.txt'), at('no/b.txt'))],
  ['tells a file', (fs, at) => Effect.map(fs.stat(at('a.txt')), (info) => info.type)],
  ['tells a folder', (fs, at) => Effect.map(fs.stat(at('sub')), (info) => info.type)],
  ['tells a path not there', (fs, at) => Effect.map(fs.stat(at('nope')), (info) => info.type)],
];

/** How an operation ended: what it answered, or the kind of its refusal. */
const outcomeOf = (operation: Effect.Effect<unknown, PlatformError>) =>
  Effect.match(operation, {
    onFailure: (error) => `refused ${error.reason._tag}`,
    onSuccess: (value) => {
      if (Array.isArray(value)) return `answered ${value.toSorted().join(',')}`;
      if (Predicate.isString(value)) return `answered ${value}`;
      return 'answered';
    },
  });

/** The tree under `root` after a case: each folder with a trailing slash, each file with its text. */
const treeOf = (fs: FileSystem.FileSystem, root: string) =>
  Effect.gen(function* () {
    const names = yield* fs.readDirectory(root, { recursive: true });
    const entries = yield* Effect.forEach(names, (name) =>
      Effect.gen(function* () {
        const info = yield* fs.stat(`${root}/${name}`);
        if (info.type === 'Directory') return `${name}/`;
        return `${name}=${yield* fs.readFileString(`${root}/${name}`)}`;
      }),
    );
    return entries.toSorted();
  });

/** The start made under `root` through `fs`. */
const started = (fs: FileSystem.FileSystem, root: string) =>
  Effect.gen(function* () {
    for (const folder of START.folders)
      yield* fs.makeDirectory(`${root}/${folder}`, { recursive: true });
    for (const [name, body] of Object.entries(START.files))
      yield* fs.writeFileString(`${root}/${name}`, body);
  });

/** `operation`'s outcome and the tree it leaves, on Bun's file system in a folder of its own. */
const onDisk = (operation: Operation) =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const root = yield* fs.makeTempDirectoryScoped();
    yield* started(fs, root);
    const outcome = yield* outcomeOf(operation(fs, (relative) => `${root}/${relative}`));
    return { outcome, tree: yield* treeOf(fs, root) };
  }).pipe(Effect.scoped, Effect.provide(BunServices.layer));

/**
 * The tree the in-memory file system holds under `root`, read off its map and
 * its folders as they are (a path held as both a file and a folder shows as
 * both): each folder, made or holding a file, with a trailing slash, each file
 * with its text.
 */
const heldUnder = (root: string, files: Map<string, Uint8Array>, folders: Set<string>) => {
  const under = (path: string) => path.slice(root.length + 1);
  const inside = (path: string) => path.startsWith(`${root}/`);
  const held = [...files.keys()].filter(inside);
  const holding = held.flatMap((path) => {
    const parts = under(path).split('/');
    return parts.slice(1).map((_, i) => `${parts.slice(0, i + 1).join('/')}/`);
  });
  return [
    ...new Set([
      ...held.map((path) => `${under(path)}=${new TextDecoder().decode(files.get(path))}`),
      ...[...folders].filter(inside).map((folder) => `${under(folder)}/`),
      ...holding,
    ]),
  ].toSorted();
};

/** `operation`'s outcome and the tree it leaves, on the in-memory file system. */
const inMemory = (operation: Operation) =>
  Effect.gen(function* () {
    const root = '/case';
    const files = new Map(
      Object.entries(START.files).map(([name, body]) => [`${root}/${name}`, text(body)] as const),
    );
    const folders = new Set([root, ...START.folders.map((folder) => `${root}/${folder}`)]);
    const fs = Context.get(
      yield* Layer.build(memoryFileSystem(files, folders)),
      FileSystem.FileSystem,
    );
    const outcome = yield* outcomeOf(operation(fs, (relative) => `${root}/${relative}`));
    return { outcome, tree: heldUnder(root, files, folders) };
  }).pipe(Effect.scoped);

describe('one file-system contract, the in-memory one and Bun’s', () => {
  for (const [name, operation] of CASES)
    it.live(name, () =>
      Effect.gen(function* () {
        const disk = yield* onDisk(operation);
        const memory = yield* inMemory(operation);
        expect(memory).toEqual(disk);
      }),
    );
});
