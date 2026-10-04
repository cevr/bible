// Browser fixture scripts are compiled once by the suite runner, shared as
// immutable files for that invocation. A direct `bun test` still builds its
// own script. No result survives an invocation or a source change.

import { BunFileSystem, BunServices } from '@effect/platform-bun';
import { Config, Effect, FileSystem, ManagedRuntime, Option } from 'effect';
import { Base64 } from 'effect/encoding';
import type { BunPlugin } from 'bun';
import { solidPlugin } from '../../tools/solid-plugin.ts';

/**
 * A font file a fixture script imports, inlined as a `data:` URL: a fixture
 * page is one script with no asset route, and the bundler's own `dataurl`
 * loader answers an empty string for a woff2.
 */
const inlineFonts: BunPlugin = {
  name: 'inline-fonts',
  setup(build) {
    const runtime = ManagedRuntime.make(BunFileSystem.layer);
    build.onLoad({ filter: /\.woff2$/ }, (args) =>
      runtime.runPromise(
        FileSystem.FileSystem.use((fs) => fs.readFile(args.path)).pipe(
          Effect.map((bytes) => ({
            contents: `export default "data:font/woff2;base64,${Base64.encode(bytes)}";`,
            loader: 'js' as const,
          })),
        ),
      ),
    );
  },
};

export const ENTRIES = ['lab-page.ts', 'review-page.ts', 'player-page.ts', 'capture-page.ts'];

export const compile = (entry: string) =>
  Effect.promise(() =>
    Bun.build({
      entrypoints: [`${import.meta.dir}/${entry}`],
      target: 'browser',
      format: 'iife',
      minify: true,
      plugins: [solidPlugin, inlineFonts],
    }),
  ).pipe(
    Effect.flatMap((built) => {
      if (!built.success) return Effect.die(`${entry} did not bundle: ${built.logs.join('\n')}`);
      return Option.match(Option.fromUndefinedOr(built.outputs[0]), {
        onNone: () => Effect.die(`${entry} did not bundle: ${built.logs.join('\n')}`),
        onSome: (out) => Effect.promise(() => out.text()),
      });
    }),
  );

export const bundled = (entry: string) =>
  Effect.flatMap(Config.option(Config.String('FILM_TEST_BUNDLES')), (dir) =>
    Option.match(dir, {
      onNone: () => compile(entry),
      onSome: (root) =>
        FileSystem.FileSystem.use((fs) => fs.readFileString(`${root}/${entry}.js`)).pipe(
          Effect.orDie,
          Effect.provide(BunServices.layer),
        ),
    }),
  ).pipe(Effect.orDie);
