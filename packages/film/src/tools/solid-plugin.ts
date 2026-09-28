// The lab's Solid 2 JSX, compiled for Bun's bundler: a `.tsx` module goes
// through Solid's native compiler (`@solidjs/compiler`, the transform
// `vite-plugin-solid` runs) into DOM expressions that import `@solidjs/web`,
// and Bun strips the types that remain. The app's `bunfig.toml` names this
// plugin under `[serve.static]`, so the lab page's bundle is built with it; the
// render page imports no `.tsx`, so it never runs there. The DOM tests bundle
// their fixtures with it too.

import { BunServices } from '@effect/platform-bun';
import { transform } from '@solidjs/compiler';
import type { BunPlugin } from 'bun';
import { Effect, FileSystem } from 'effect';

/** A `.tsx` module as the bundler loads it: Solid's DOM output, types still in. */
const compile = Effect.fn('solid.compile')(function* (path: string) {
  const fs = yield* FileSystem.FileSystem;
  const code = yield* fs.readFileString(path);
  const out = transform(code, { filename: path, generate: 'dom', moduleName: '@solidjs/web' });
  return { contents: out.code, loader: 'ts' as const };
});

const run = (path: string) =>
  Effect.runPromise(compile(path).pipe(Effect.provide(BunServices.layer)));

export const solidPlugin: BunPlugin = {
  name: 'solid-jsx',
  setup(build) {
    build.onLoad({ filter: /\.tsx$/ }, (args) => run(args.path));
  },
};

export default solidPlugin;
