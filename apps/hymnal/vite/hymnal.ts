/* oxlint-disable effect/noNodeBuiltinImport, effect/noNullish, effect/noTernary -- a Vite and rolldown plugin, the bundler's host boundary: it runs the derivation as a child process, and its hooks answer `undefined` for a module that is not theirs, as the plugin API defines. */

/**
 * The words the app carries, derived from the compiled 1985 set when the app
 * is bundled: `virtual:hymnal` exports every hymn's `HymnText` (about 650 KB
 * of words, against 14 MB of compiled hymns with their chords). The web and
 * the native bundle both take it from this plugin, so the app reads its
 * hymns offline and nothing derived is committed.
 *
 * The derivation (`words.ts`) runs under Bun: Vite loads this config under
 * Node, which cannot import the hymnal package's TypeScript.
 */

import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const id = 'virtual:hymnal';
const resolved = `\0${id}`;
const script = fileURLToPath(new URL('./words.ts', import.meta.url));

let words: string | undefined;

/** A Vite and rolldown plugin: `import hymns from 'virtual:hymnal'`. */
export const hymnal = () => ({
  name: 'hymnal-words',
  resolveId: (source: string) => (source === id ? resolved : undefined),
  load: (module: string) => {
    if (module !== resolved) return undefined;
    words ??= execFileSync('bun', [script], { encoding: 'utf8', maxBuffer: 16 * 1024 * 1024 });
    return `export default ${words};`;
  },
});
