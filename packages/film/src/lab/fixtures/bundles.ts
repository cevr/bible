// Browser fixture scripts are compiled once by the suite runner, shared as
// immutable files for that invocation. A direct `bun test` still builds its
// own script. No result survives an invocation or a source change. A page's
// server entry is bundled as the lab bundles it (Solid's server output, for
// Bun) by the test process that renders it, and loaded there.

import { BunFileSystem, BunServices } from '@effect/platform-bun';
import {
  Array as Arr,
  Config,
  Effect,
  FileSystem,
  ManagedRuntime,
  Option,
  Predicate,
} from 'effect';
import { Base64 } from 'effect/encoding';
import type { BunPlugin } from 'bun';
import { type PageRender, isPageRender } from '../../core/page-render.ts';
import { solidPlugin, solidPluginFor } from '../../tools/solid-plugin.ts';

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

export const ENTRIES = [
  'lab-page.ts',
  'review-page.ts',
  'review-hydrated-page.ts',
  'player-page.ts',
  'capture-page.ts',
];

/**
 * The entries bundled with Solid's development build, whose pages say what
 * a production build keeps quiet: each hydration mismatch, as a warning.
 */
const DEVELOPMENT: ReadonlySet<string> = new Set(['review-hydrated-page.ts']);

export const compile = (entry: string) =>
  Effect.promise(() =>
    Bun.build({
      entrypoints: [`${import.meta.dir}/${entry}`],
      target: 'browser',
      format: 'iife',
      minify: true,
      plugins: [solidPlugin, inlineFonts],
      conditions: Arr.filter(['development'], () => DEVELOPMENT.has(entry)),
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

/**
 * The page render a server entry (`entry`, from this folder) exports as
 * `name`, bundled as the lab bundles it (`solidPluginFor('ssr')`, for Bun)
 * into a folder of its own and loaded from there; the folder is gone once
 * the module is loaded (it is one file, read whole).
 */
export const served = (entry: string, name: string): Effect.Effect<PageRender> =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const dir = yield* fs.makeTempDirectoryScoped({ prefix: 'film-test-server-' });
    const built = yield* Effect.promise(() =>
      Bun.build({
        entrypoints: [`${import.meta.dir}/${entry}`],
        target: 'bun',
        plugins: [solidPluginFor('ssr')],
        outdir: dir,
        naming: 'server.js',
      }),
    );
    if (!built.success)
      return yield* Effect.die(`${entry} did not bundle: ${built.logs.join('\n')}`);
    const loaded: unknown = yield* Effect.promise(() => import(`${dir}/server.js`));
    if (!Predicate.hasProperty(loaded, name) || !isPageRender(loaded[name]))
      return yield* Effect.die(`${entry} exports no page render named ${name}`);
    return loaded[name];
  }).pipe(Effect.scoped, Effect.orDie, Effect.provide(BunServices.layer));
