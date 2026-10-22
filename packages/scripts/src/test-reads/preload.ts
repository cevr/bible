// A Bun preload (`--preload`) for `test-reads.ts`: appends each path a test
// process reads to the file `MANNA_TEST_READS` names, one absolute path a line.
// It records:
// - `node:fs` and `node:fs/promises` reads and stats (which Effect's Bun file
//   system calls), `Bun.file` and `bun:sqlite` databases;
// - native libraries loaded through `bun:ffi`'s `dlopen` and `process.dlopen`;
// - each module the process loaded (`require.cache`, which holds ES modules
//   and dynamic imports too), after its tests: a relative import that leaves
//   its workspace is a file its task hashes only when its `turbo.json` lists it.
// With no `MANNA_TEST_READS` it changes nothing. Child bun processes inherit it
// through `BUN_OPTIONS`; other children (a shell, node) and folder listings
// are not recorded.

import * as ffi from 'bun:ffi';
import * as sqlite from 'bun:sqlite';
import { afterAll, mock } from 'bun:test';
import * as fs from 'node:fs';
import * as fsp from 'node:fs/promises';
import { isAbsolute, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const log = process.env['MANNA_TEST_READS'] ?? '';

/** Records `target` when it names a path: a string, a file URL or a buffer. */
const record = (target: unknown) => {
  const named =
    typeof target === 'string'
      ? target
      : target instanceof URL && target.protocol === 'file:'
        ? fileURLToPath(target)
        : Buffer.isBuffer(target)
          ? target.toString()
          : '';
  if (named === '' || named === ':memory:') return;
  fs.appendFileSync(log, `${resolve(named)}\n`);
};

/** `module` with each function `names` lists recording its first argument. */
const traced = (module: object, names: ReadonlyArray<string>) => {
  const copy: Record<string, unknown> = { ...module };
  for (const name of names) {
    const original = copy[name];
    if (typeof original !== 'function') continue;
    const read = original as (...args: Array<unknown>) => unknown;
    copy[name] = (...args: Array<unknown>) => {
      record(args[0]);
      return read(...args);
    };
  }
  return copy;
};

const READS = ['readFile', 'stat', 'lstat', 'open', 'access', 'realpath'];
const SYNC_READS = [
  'readFileSync',
  'existsSync',
  'statSync',
  'lstatSync',
  'openSync',
  'accessSync',
  'realpathSync',
  'createReadStream',
];

if (log !== '') {
  const promises = traced(fsp, READS);
  const sync = { ...traced(fs, [...SYNC_READS, ...READS]), promises };
  mock.module('node:fs', () => ({ ...sync, default: sync }));
  mock.module('fs', () => ({ ...sync, default: sync }));
  mock.module('node:fs/promises', () => ({ ...promises, default: promises }));
  mock.module('fs/promises', () => ({ ...promises, default: promises }));

  const file = Bun.file;
  Object.assign(Bun, {
    file: (target: Parameters<typeof Bun.file>[0], options?: Parameters<typeof Bun.file>[1]) => {
      record(target);
      return file(target, options);
    },
  });

  class Database extends sqlite.Database {
    constructor(...args: ConstructorParameters<typeof sqlite.Database>) {
      record(args[0]);
      super(...args);
    }
  }
  mock.module('bun:sqlite', () => ({ ...sqlite, Database, default: Database }));

  const native = traced(ffi, ['dlopen']);
  mock.module('bun:ffi', () => ({ ...native, default: native }));
  const dlopen = process.dlopen.bind(process);
  Object.assign(process, {
    dlopen: (...args: Parameters<typeof process.dlopen>) => {
      record(args[1]);
      return dlopen(...args);
    },
  });

  // Each test file's modules, once its tests are done (under `--isolate` this
  // preload runs again for each file). The preload itself is not the test's.
  const modules = () => {
    for (const loaded of Object.keys(require.cache)) {
      if (isAbsolute(loaded) && loaded !== import.meta.path) record(loaded);
    }
  };
  // `afterAll` throws outside `bun test` (a script a test task runs, as
  // animations' `bun cli.ts drafts`), where `exit` fires; under `bun test`
  // it does not.
  try {
    afterAll(modules);
  } catch {
    process.on('exit', modules);
  }
}
