// `bun run redfirst` over a real repository: a base it cannot resolve is a
// failure, never an empty report that reads as "no new case is green"; a
// new test of a module the base lacks is red whole, even as its package's
// one changed test file; a binary fixture, in a package's `fixtures/` or the
// root's, reaches the base's tree byte for byte.

import * as BunServices from '@effect/platform-bun/BunServices';
import { describe, expect, test } from 'bun:test';
import { Effect, FileSystem, Path, Stream } from 'effect';
import * as ChildProcess from 'effect/process/ChildProcess';
import { ChildProcessSpawner } from 'effect/process/ChildProcessSpawner';

/** Git in the fixture repository, kept from the machine's own config (hooks, signing). */
const GIT = [
  '-c',
  'user.name=probe',
  '-c',
  'user.email=probe@example.com',
  '-c',
  'commit.gpgsign=false',
  '-c',
  'core.hooksPath=/nonexistent/film-probe-hooks',
];

const text = (stream: Stream.Stream<Uint8Array, unknown>) =>
  Stream.mkString(Stream.decodeText(stream));

/** A command in `dir`: its stdout, its stderr and its exit code. */
const exec = (dir: string, command: string, args: ReadonlyArray<string>) =>
  Effect.gen(function* () {
    const spawner = yield* ChildProcessSpawner;
    const child = yield* spawner.spawn(
      ChildProcess.make(command, args, { cwd: dir, forceKillAfter: '5 seconds' }),
    );
    const [stdout, stderr, code] = yield* Effect.all(
      [text(child.stdout), text(child.stderr), child.exitCode],
      { concurrency: 3 },
    );
    return { stdout, stderr, code: Number(code) };
  }).pipe(Effect.scoped);

const badBase = Effect.gen(function* () {
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const dir = yield* fs.makeTempDirectoryScoped({ prefix: 'redfirst-' });
  yield* exec(dir, 'git', [...GIT, 'init', '-q', '-b', 'main']);
  yield* fs.writeFileString(path.join(dir, 'a.txt'), 'a\n');
  yield* exec(dir, 'git', [...GIT, 'add', '-A']);
  yield* exec(dir, 'git', [...GIT, 'commit', '-q', '-m', 'base']);
  return yield* exec(dir, 'bun', [path.join(import.meta.dir, 'redfirst.ts'), 'no-such-base']);
}).pipe(Effect.scoped, Effect.provide(BunServices.layer));

/** A base with a module, and a head that adds a module and the one test of it. */
const newModule = Effect.gen(function* () {
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const dir = yield* fs.makeTempDirectoryScoped({ prefix: 'redfirst-' });
  yield* exec(dir, 'git', [...GIT, 'init', '-q', '-b', 'main']);
  yield* fs.writeFileString(path.join(dir, 'package.json'), '{ "name": "probe" }\n');
  yield* fs.writeFileString(path.join(dir, 'one.ts'), 'export const one = 1;\n');
  yield* exec(dir, 'git', [...GIT, 'add', '-A']);
  yield* exec(dir, 'git', [...GIT, 'commit', '-q', '-m', 'base']);
  yield* fs.writeFileString(path.join(dir, 'two.ts'), 'export const two = 2;\n');
  yield* fs.writeFileString(
    path.join(dir, 'two.test.ts'),
    "import { expect, test } from 'bun:test';\nimport { two } from './two.ts';\n\ntest('two', () => expect(two).toBe(2));\n",
  );
  yield* exec(dir, 'git', [...GIT, 'add', '-A']);
  yield* exec(dir, 'git', [...GIT, 'commit', '-q', '-m', 'head']);
  return yield* exec(dir, 'bun', [path.join(import.meta.dir, 'redfirst.ts'), 'HEAD~1']);
}).pipe(Effect.scoped, Effect.provide(BunServices.layer));

/** Bytes that are not UTF-8, as a PNG's are: a text round trip changes them. */
const BINARY = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0xff, 0xfe, 0x00, 0x80];
const BINARY_SOURCE = `[${BINARY.join(', ')}]`;

/** A head that adds binary fixtures and a test of their bytes alone, which no base source can fail. */
const binaryFixture = Effect.gen(function* () {
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const dir = yield* fs.makeTempDirectoryScoped({ prefix: 'redfirst-' });
  yield* exec(dir, 'git', [...GIT, 'init', '-q', '-b', 'main']);
  yield* fs.writeFileString(path.join(dir, 'package.json'), '{ "name": "probe" }\n');
  yield* fs.writeFileString(path.join(dir, 'one.ts'), 'export const one = 1;\n');
  yield* exec(dir, 'git', [...GIT, 'add', '-A']);
  yield* exec(dir, 'git', [...GIT, 'commit', '-q', '-m', 'base']);
  // One fixture in a package's folder, one in a `fixtures/` at the root.
  yield* fs.makeDirectory(path.join(dir, 'src', 'fixtures'), { recursive: true });
  yield* fs.makeDirectory(path.join(dir, 'fixtures'));
  yield* fs.writeFile(path.join(dir, 'src', 'fixtures', 'probe.png'), new Uint8Array(BINARY));
  yield* fs.writeFile(path.join(dir, 'fixtures', 'root.png'), new Uint8Array(BINARY));
  const bytes = (file: string) =>
    `[...new Uint8Array(await Bun.file(\`\${import.meta.dir}/${file}\`).arrayBuffer())]`;
  yield* fs.writeFileString(
    path.join(dir, 'src', 'probe.test.ts'),
    `import { expect, test } from 'bun:test';\n\ntest('fixture bytes', async () => {\n  expect(${bytes('fixtures/probe.png')}).toEqual(${BINARY_SOURCE});\n  expect(${bytes('../fixtures/root.png')}).toEqual(${BINARY_SOURCE});\n});\n`,
  );
  yield* exec(dir, 'git', [...GIT, 'add', '-A']);
  yield* exec(dir, 'git', [...GIT, 'commit', '-q', '-m', 'head']);
  return yield* exec(dir, 'bun', [path.join(import.meta.dir, 'redfirst.ts'), 'HEAD~1']);
}).pipe(Effect.scoped, Effect.provide(BunServices.layer));

describe('redfirst, run', () => {
  test(
    "copies a head's binary fixtures into the base's tree byte for byte, a root fixtures/ too",
    () =>
      Effect.runPromise(
        Effect.map(binaryFixture, ({ stdout, code }) => {
          expect(code).toBe(0);
          expect(stdout).toContain('redfirst green on base: src/probe.test.ts');
          expect(stdout).toContain('cases=1 red=0 green=1');
        }),
      ),
    30_000,
  );

  test(
    'names a new test of a module the base lacks red whole',
    () =>
      Effect.runPromise(
        Effect.map(newModule, ({ stdout, code }) => {
          expect(code).toBe(0);
          expect(stdout).toContain('redfirst two.test.ts red whole: no case ran on the base');
          expect(stdout).toContain('cases=0 red=0 green=0');
        }),
      ),
    30_000,
  );

  test(
    'fails on a base that names no commit, and prints no report',
    () =>
      Effect.runPromise(
        Effect.map(badBase, ({ stdout, stderr, code }) => {
          expect(code).not.toBe(0);
          expect(stdout).not.toContain('cases=');
          expect(stderr).toContain('no-such-base');
        }),
      ),
    30_000,
  );
});
