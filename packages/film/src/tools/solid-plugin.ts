// The lab's Solid 2 JSX, compiled for Bun's bundler: a `.tsx` module goes
// through Solid's native compiler (`@solidjs/compiler`, the transform
// `vite-plugin-solid` runs) into expressions that import `@solidjs/web`, and
// Bun strips the types that remain. One source compiles two ways
// (`solidPluginFor`): for the browser (`dom`) and for the server's render of
// the same components (`ssr`, `LabPage`'s server bundle); both hydratable,
// so the browser's copy claims the markup the server's wrote. The app's
// `bunfig.toml` names the browser one under `[serve.static]`; the render page
// imports no `.tsx`, so it never runs there. The DOM tests bundle their
// fixtures with it too. A module is only read, so a load runs with the file
// system alone, built once for the plugin: the whole platform per load (a
// terminal each) put a listener on stdin for every module of a bundle.

import { BunFileSystem } from '@effect/platform-bun';
import { transform } from '@solidjs/compiler';
import type { BunPlugin } from 'bun';
import { Effect, FileSystem, ManagedRuntime } from 'effect';

/** What a module compiles to: DOM expressions for the browser, string templates for the server. */
export type SolidOutput = 'dom' | 'ssr';

/** A `.tsx` module as the bundler loads it: Solid's `generate` output, hydratable, types still in. */
const compile = Effect.fn('solid.compile')(function* (path: string, generate: SolidOutput) {
  const fs = yield* FileSystem.FileSystem;
  const code = yield* fs.readFileString(path);
  const out = transform(code, {
    filename: path,
    generate,
    hydratable: true,
    moduleName: '@solidjs/web',
  });
  return { contents: out.code, loader: 'ts' as const };
});

/** The plugin compiling `.tsx` to `generate`'s output. */
export const solidPluginFor = (generate: SolidOutput): BunPlugin => ({
  name: `solid-jsx-${generate}`,
  setup(build) {
    const runtime = ManagedRuntime.make(BunFileSystem.layer);
    build.onLoad({ filter: /\.tsx$/ }, (args) => runtime.runPromise(compile(args.path, generate)));
  },
});

/** The browser's: DOM output, which a server render's markup hydrates under. */
export const solidPlugin: BunPlugin = solidPluginFor('dom');

export default solidPlugin;
