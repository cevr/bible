// Fixture for film/lock-through-sqlite: each line marked RED fires the rule,
// and nothing else does.

import { lockFile, lockFile as lockOf } from '../../src/tools/manifest-lock-bun.ts';
import * as lock from '../../src/tools/manifest-lock-bun.ts';

declare const dir: string;
declare const name: string;
declare const read: (path: string) => string;

export const held = read(lockFile(`${dir}/catalogue.json`)); // RED film/lock-through-sqlite
export const literal = read(`${dir}/.catalogue.json.lock`); // RED film/lock-through-sqlite
export const built = read(`${dir}/.${name}.lock`); // RED film/lock-through-sqlite
export const listed = ['.assets.json.lock']; // RED film/lock-through-sqlite

// The library's own file and a lock of another kind are not a manifest's lock.
export const library = read(`${dir}/library.lock.json`);
export const bunLock = read('bun.lock');
export const old = read(`${dir}/notes.json.lock`);

// The lock's path under an alias or off the module whole; a parameter named `lockFile` is the page's own.
export const aliased = read(lockOf(`${dir}/catalogue.json`)); // RED film/lock-through-sqlite
export const whole = read(lock.lockFile(`${dir}/catalogue.json`)); // RED film/lock-through-sqlite
export const own = (lockFile: (file: string) => string) => read(lockFile(`${dir}/catalogue.json`));
