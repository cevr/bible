/* oxlint-disable effect/noNodeBuiltinImport, effect/noNullish, effect/noTernary -- a Vite and rolldown plugin, the bundler's host boundary: it runs the derivations as child processes, and its hooks answer `undefined` for a module that is not theirs, as the plugin API defines. */

/**
 * The hymnal the app carries, derived from the compiled 1985 set when the
 * app is bundled, in two modules:
 * - `virtual:hymnal` exports every hymn's `HymnText` (about 700 KB of words,
 *   against 14 MB of compiled hymns), made by `words.ts`;
 * - `virtual:hymnal-chords` exports every hymn's guitar chords over its
 *   syllables, one string per hymn (about 780 KB), made by `chords.ts`, and
 *   decoded only for a hymn shown with chords on.
 * The web and the native bundle both take them from this plugin, so the app
 * reads its hymns offline and nothing derived is committed.
 *
 * The derivations run under Bun: Vite loads this config under Node, which
 * cannot import the hymnal package's TypeScript.
 */

import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const modules = new Map([
  ['virtual:hymnal', fileURLToPath(new URL('./words.ts', import.meta.url))],
  ['virtual:hymnal-chords', fileURLToPath(new URL('./chords.ts', import.meta.url))],
]);

const derived = new Map<string, string>();

/** A Vite and rolldown plugin: `import hymns from 'virtual:hymnal'`, and the chords' module. */
export const hymnal = () => ({
  name: 'hymnal',
  resolveId: (source: string) => (modules.has(source) ? `\0${source}` : undefined),
  load: (module: string) => {
    const id = module.slice(1);
    const script = module.startsWith('\0') ? modules.get(id) : undefined;
    if (script === undefined) return undefined;
    const json =
      derived.get(id) ??
      execFileSync('bun', [script], { encoding: 'utf8', maxBuffer: 16 * 1024 * 1024 });
    derived.set(id, json);
    return `export default ${json};`;
  },
});
