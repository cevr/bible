// The repository files a lint config's JS plugins run: each plugin entry and
// every file it imports, followed import by import. A plugin rule's answer on a
// file is a function of that file and of this code, so the gate keys the files
// it keeps on these files' contents (`lint-gate.ts`): an edit to a module a
// rule imports (a constant, a parser) lints every file again.
//
// An import is followed as Bun resolves it from the importing file: a relative
// path, a `.js` name for a `.ts` file, a workspace package through its link in
// `node_modules`. A file that resolves outside the root or inside a
// `node_modules` folder is a dependency's, and `bun.lock` keys those; an import
// that does not resolve is left to oxlint to report.

import { Effect, FileSystem, Option, Path } from 'effect';
import * as Bool from 'effect/Boolean';

import type { LintConfig } from './config.js';

/** The JS plugins `config` loads, top level and in its overrides, each once. */
export const pluginsOf = (config: LintConfig): ReadonlyArray<string> => [
  ...new Set([...config.jsPlugins, ...config.overrides.flatMap((override) => override.jsPlugins)]),
];

/** The loader Bun's transpiler reads `file` with. */
const loaderOf = (file: string) =>
  Bool.match(/\.[cm]?[jt]sx$/.test(file), {
    onTrue: () => 'tsx' as const,
    onFalse: () => 'ts' as const,
  });

/** `specifier` as Bun resolves it from `dir`; none when it does not resolve. */
const resolved = (specifier: string, dir: string) =>
  Effect.try(() => Bun.resolveSync(specifier, dir)).pipe(Effect.option);

/**
 * The repository files under `root` that `entries` (paths or package names,
 * resolved from `root`) run, the entries among them: relative to the root,
 * sorted.
 */
export const importClosure = Effect.fn('importClosure')(function* (
  root: string,
  entries: ReadonlyArray<string>,
) {
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  // Bun resolves through links, so the root is compared as its real path.
  const real = yield* fs.realPath(root);
  const inRepo = (file: string) =>
    file.startsWith(`${real}${path.sep}`) && !file.split(path.sep).includes('node_modules');
  const seen = new Set<string>();
  const firsts = yield* Effect.forEach(entries, (entry) => resolved(entry, root));
  let pending = firsts.flatMap((first) => Option.toArray(first)).filter(inRepo);
  while (pending.length > 0) {
    const fresh = [...new Set(pending)].filter((file) => !seen.has(file));
    fresh.forEach((file) => seen.add(file));
    const next = yield* Effect.forEach(
      fresh,
      (file) =>
        Effect.gen(function* () {
          const source = yield* fs.readFileString(file);
          const imports = new Bun.Transpiler({ loader: loaderOf(file) }).scanImports(source);
          const targets = yield* Effect.forEach(imports, (found) =>
            resolved(found.path, path.dirname(file)),
          );
          return targets.flatMap((target) => Option.toArray(target)).filter(inRepo);
        }),
      { concurrency: 16 },
    );
    pending = next.flat();
  }
  return [...seen].map((file) => path.relative(real, file)).toSorted();
});
