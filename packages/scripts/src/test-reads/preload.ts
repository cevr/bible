// A Bun preload (`--preload`) for `test-reads.ts`: appends each path a test
// opens to read to the file `MANNA_TEST_READS` names, one absolute path a line.
// It records `node:fs` and `node:fs/promises` reads and stats (which Effect's
// Bun file system calls), `Bun.file` and `bun:sqlite` databases; with no
// `MANNA_TEST_READS` it changes nothing. Child bun processes inherit it
// through `BUN_OPTIONS`. Module imports are not recorded: turbo hashes a
// workspace's own files and its dependencies' through `transit`.

import * as sqlite from 'bun:sqlite';
import { mock } from 'bun:test';
import * as fs from 'node:fs';
import * as fsp from 'node:fs/promises';
import { resolve } from 'node:path';
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

type Read = (target: unknown, ...rest: Array<unknown>) => unknown;

/** `module` with each function `names` lists recording its first argument. */
const traced = (module: object, names: ReadonlyArray<string>) => {
  const copy: Record<string, unknown> = { ...module };
  for (const name of names) {
    const original = copy[name];
    if (typeof original !== 'function') continue;
    const read = original as Read;
    copy[name] = (target: unknown, ...rest: Array<unknown>) => {
      record(target);
      return read(target, ...rest);
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
}
