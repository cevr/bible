import { describe, expect, it } from 'effect-bun-test';
import * as BunServices from '@effect/platform-bun/BunServices';
import { Effect, FileSystem, Path } from 'effect';
import * as ChildProcess from 'effect/process/ChildProcess';
import { ChildProcessSpawner } from 'effect/process/ChildProcessSpawner';

/** A test that reads a file, imports a module and loads a native library. */
const FIXTURE = `import { expect, test } from 'bun:test';

import { value } from './module.ts';

test('reads', async () => {
  const ffi = await import('bun:' + 'ffi');
  expect(() => ffi.dlopen(new URL('./native.dylib', import.meta.url).pathname, {})).toThrow();
  expect(await Bun.file(new URL('./page.md', import.meta.url)).text()).toBe('page');
  expect(value).toBe(1);
});
`;

describe('the read recorder test:reads preloads', () => {
  it.effect.layer(BunServices.layer)(
    'records a file a test reads, a module it imports and a native library it loads, in each test runner mode',
    () =>
      Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem;
        const path = yield* Path.Path;
        const spawner = yield* ChildProcessSpawner;
        const dir = yield* fs.realPath(
          yield* fs.makeTempDirectoryScoped({ prefix: 'test-reads-' }),
        );
        yield* fs.writeFileString(path.join(dir, 'reads.test.ts'), FIXTURE);
        yield* fs.writeFileString(path.join(dir, 'module.ts'), 'export const value = 1;\n');
        yield* fs.writeFileString(path.join(dir, 'page.md'), 'page');
        yield* fs.writeFileString(path.join(dir, 'native.dylib'), 'not a library');
        const preload = path.join(import.meta.dir, 'preload.ts');
        const recorded = (mode: string) =>
          Effect.gen(function* () {
            const log = path.join(dir, `${mode}.reads`);
            yield* fs.writeFileString(log, '');
            const exit = yield* spawner.exitCode(
              ChildProcess.make('bun', ['test', mode, './reads.test.ts'], {
                cwd: dir,
                env: { BUN_OPTIONS: `--preload=${preload}`, MANNA_TEST_READS: log },
                extendEnv: true,
                forceKillAfter: '5 seconds',
              }),
            );
            const reads = (yield* fs.readFileString(log)).split('\n');
            return { exit: Number(exit), reads };
          });
        for (const mode of ['--isolate', '--no-isolate', '--parallel']) {
          const { exit, reads } = yield* recorded(mode);
          expect(exit).toBe(0);
          for (const file of ['module.ts', 'page.md', 'native.dylib', 'reads.test.ts']) {
            expect(reads).toContain(path.join(dir, file));
          }
          expect(reads).not.toContain(preload);
        }
      }).pipe(Effect.scoped),
  );
});
