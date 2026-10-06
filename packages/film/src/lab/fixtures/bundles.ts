// Browser fixture scripts are compiled once by the suite runner, shared as
// immutable files for that invocation. A direct `bun test` still builds its
// own script. No result survives an invocation or a source change. A page's
// server entry is bundled as the lab bundles it (Solid's server output, for
// Bun) by the test process that renders it, and loaded there.

import { BunServices } from '@effect/platform-bun';
import { Array as Arr, Config, Effect, FileSystem, Option, Predicate } from 'effect';
import type { BunPlugin } from 'bun';
import { type PageRender, isPageRender } from '../../core/page-render.ts';
import { solidPlugin, solidPluginFor } from '../../tools/solid-plugin.ts';

/**
 * A font file a fixture script imports, named from the pages' root as the
 * lab's build names it (`/<file>.woff2`): the fixtures' fake server answers
 * it as the lab's asset route does (`faceFiles`, `harness.ts`), so a test
 * can hold the UI face's file and read the page laid out without it (G10).
 */
const servedFonts: BunPlugin = {
  name: 'served-fonts',
  setup(build) {
    build.onLoad({ filter: /\.woff2$/ }, (args) => ({
      // A fontsource file's name is letters, digits and dashes: no quote to escape.
      contents: `export default "/${args.path.slice(args.path.lastIndexOf('/') + 1)}";`,
      loader: 'js' as const,
    }));
  },
};

export const ENTRIES = [
  'lab-page.ts',
  'lab-narrated-page.ts',
  'lab-hydrated-page.ts',
  'review-page.ts',
  'review-hydrated-page.ts',
  'player-page.ts',
  'player-hydrated-page.ts',
  'capture-page.ts',
  'on-screen-page.tsx',
];

/**
 * The entries bundled with Solid's development build, whose pages say what
 * a production build keeps quiet: each hydration mismatch, as a warning.
 */
const DEVELOPMENT: ReadonlySet<string> = new Set([
  'lab-hydrated-page.ts',
  'review-hydrated-page.ts',
  'player-hydrated-page.ts',
]);

export const compile = (entry: string) =>
  Effect.promise(() =>
    Bun.build({
      entrypoints: [`${import.meta.dir}/${entry}`],
      target: 'browser',
      format: 'iife',
      minify: true,
      plugins: [solidPlugin, servedFonts],
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

/** What Solid's diagnostics channel tells a listener of a finding: its code, and its words. */
interface Finding {
  readonly code: string;
  readonly message: string;
}

/** Solid's diagnostics channel (`OBSERVE.diagnostics`), which its development build exports. */
interface Diagnostics {
  readonly subscribe: (listener: (finding: Finding) => void) => () => void;
}

/** Whether `value` is Solid's diagnostics channel. */
const isDiagnostics = (value: unknown): value is Diagnostics =>
  Predicate.hasProperty(value, 'subscribe') && Predicate.isFunction(value.subscribe);

/**
 * `render`, failing every render in which the page wrote a signal or a store
 * (Solid's `SERVER_WRITE`, heard on its diagnostics channel `diagnostics`):
 * a server's render is pure, its state flowing from its reads, never a
 * setter. Solid disposes the render's owners as its stream ends, so what
 * their cleanups write is heard too: the render's end is passed on once
 * that is done. Solid tells of each kind of write once per loaded module, so
 * the first render that writes fails, and the test that made it.
 */
const pure = (render: PageRender, diagnostics: Diagnostics): PageRender => ({
  bodyClass: render.bodyClass,
  render: (request, sink) => {
    const writes: Array<string> = [];
    const stop = diagnostics.subscribe((finding) => {
      if (finding.code === 'SERVER_WRITE') writes.push(finding.message);
    });
    render.render(request, {
      head: sink.head,
      write: sink.write,
      end: () =>
        void Effect.runFork(
          Effect.andThen(
            Effect.yieldNow,
            Effect.sync(() => {
              stop();
              if (writes.length === 0) return sink.end();
              sink.fail(`the page wrote state while the server rendered it: ${writes.join(' ')}`);
            }),
          ),
        ),
      fail: (reason) => {
        stop();
        sink.fail(reason);
      },
    });
  },
});

/**
 * The page render a server entry (`entry`, from this folder) exports as
 * `name`, bundled as the lab bundles it (`solidPluginFor('ssr')`, for Bun)
 * into a folder of its own and loaded from there, and held pure (`pure`):
 * the bundle exports Solid's diagnostics channel beside it, from the copy of
 * Solid its render runs on, and a build with none dies, so no render passes
 * for want of a listener. The folder is gone once the module is loaded (it
 * is one file, read whole).
 */
export const served = (entry: string, name: string): Effect.Effect<PageRender> =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const dir = yield* fs.makeTempDirectoryScoped({ prefix: 'film-test-server-' });
    const heard = `${import.meta.dir}/heard-${name}.ts`;
    const built = yield* Effect.promise(() =>
      Bun.build({
        entrypoints: [heard],
        files: {
          [heard]: `export { ${name} } from '${import.meta.dir}/${entry}';\nexport { OBSERVE } from 'solid-js';\n`,
        },
        target: 'bun',
        // The head's face (`FACE_HEAD`) named as the fixture's scripts name it, from the pages' root.
        plugins: [solidPluginFor('ssr'), servedFonts],
        outdir: dir,
        naming: 'server.js',
      }),
    );
    if (!built.success)
      return yield* Effect.die(`${entry} did not bundle: ${built.logs.join('\n')}`);
    const loaded: unknown = yield* Effect.promise(() => import(`${dir}/server.js`));
    if (!Predicate.hasProperty(loaded, name) || !isPageRender(loaded[name]))
      return yield* Effect.die(`${entry} exports no page render named ${name}`);
    const render = loaded[name];
    if (
      !Predicate.hasProperty(loaded, 'OBSERVE') ||
      !Predicate.hasProperty(loaded.OBSERVE, 'diagnostics') ||
      !isDiagnostics(loaded.OBSERVE.diagnostics)
    )
      return yield* Effect.die(
        `${entry}'s bundle has no Solid diagnostics channel to hear a server write on`,
      );
    return pure(render, loaded.OBSERVE.diagnostics);
  }).pipe(Effect.scoped, Effect.orDie, Effect.provide(BunServices.layer));
