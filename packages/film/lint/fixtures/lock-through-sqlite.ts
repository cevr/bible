// Fixture for film/lock-through-sqlite: each line marked RED fires the rule,
// and nothing else does.

declare const dir: string;
declare const name: string;
declare const lockFile: (file: string) => string;
declare const read: (path: string) => string;

export const held = read(lockFile(`${dir}/catalogue.json`)); // RED film/lock-through-sqlite
export const literal = read(`${dir}/.catalogue.json.lock`); // RED film/lock-through-sqlite
export const built = read(`${dir}/.${name}.lock`); // RED film/lock-through-sqlite
export const listed = ['.assets.json.lock']; // RED film/lock-through-sqlite

// The library's own file and a lock of another kind are not a manifest's lock.
export const library = read(`${dir}/library.lock.json`);
export const bunLock = read('bun.lock');
export const old = read(`${dir}/notes.json.lock`);
