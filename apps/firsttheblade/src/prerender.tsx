/**
 * The prerender: draws every page (`./pages.ts`) to a whole HTML file in
 * `dist/`, beside the browser build, and writes the sitemap, robots.txt, llms.txt and
 * the web app manifest. The package's `build` script builds this module
 * with Vite (`--ssr`, so the pages compile to Solid's server output and the
 * art they import is emitted) and then runs it with Bun.
 *
 * The pages are served as they are written: nothing hydrates. The phone
 * menu mounts itself from the browser build's script (`./client.tsx`).
 */
import { BunRuntime, BunServices } from '@effect/platform-bun';
import { NoHydration, renderToString } from '@solidjs/web';
import { Effect, FileSystem, Option, Path, Schema } from 'effect';

import { type Build, Document } from './document.tsx';
import { llmsTxt, robots, sitemap, webManifest } from './meta.ts';
import { PAGES, type Page } from './pages.ts';
import { View } from './views.tsx';

/** The browser build's entry, as Vite's manifest names it. */
const ENTRY = 'src/client.tsx';

/** The faces the first screen sets (the wordmark, the nav, the verse in italic), preloaded. */
const FIRST_SCREEN_FONTS = ['Newsreader-normal-latin', 'Newsreader-italic-latin'];

/** A built font's face, its name without Vite's eight-character fingerprint. */
const faceOf = (file: string) => file.replace(/-[\w-]{8}\.woff2$/, '');

const ManifestChunk = Schema.Struct({
  file: Schema.String,
  css: Schema.optionalKey(Schema.Array(Schema.String)),
  assets: Schema.optionalKey(Schema.Array(Schema.String)),
});
const Manifest = Schema.fromJsonString(Schema.Record(Schema.String, ManifestChunk));

class PrerenderError extends Schema.TaggedError<PrerenderError>()('PrerenderError', {
  message: Schema.String,
}) {}

const readBuild = Effect.fn('Prerender.readBuild')(function* (dist: string) {
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const text = yield* fs.readFileString(path.join(dist, '.vite', 'manifest.json'));
  const manifest = yield* Schema.decodeEffect(Manifest)(text);
  const found = Option.fromNullishOr(manifest[ENTRY]);
  if (Option.isNone(found)) {
    return yield* PrerenderError.make({ message: `the manifest has no entry for ${ENTRY}` });
  }
  const entry = found.value;
  const assets = entry.assets ?? [];
  const build: Build = {
    script: `/${entry.file}`,
    styles: (entry.css ?? []).map((file) => `/${file}`),
    fonts: FIRST_SCREEN_FONTS.flatMap((face) =>
      assets.filter((file) => faceOf(path.basename(file)) === face).map((file) => `/${file}`),
    ),
  };
  if (build.fonts.length !== FIRST_SCREEN_FONTS.length) {
    return yield* PrerenderError.make({
      message: `expected the first screen's ${FIRST_SCREEN_FONTS.length} fonts in the manifest, found ${build.fonts.length}`,
    });
  }
  return build;
});

const draw = (page: Page, build: Build) =>
  `<!doctype html>\n${renderToString(() => (
    <NoHydration>
      <Document page={page} build={build}>
        <View page={page} />
      </Document>
    </NoHydration>
  ))}\n`;

const writePage = Effect.fn('Prerender.writePage')(function* (
  dist: string,
  page: Page,
  build: Build,
) {
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const file = path.join(dist, page.file);
  yield* fs.makeDirectory(path.dirname(file), { recursive: true });
  yield* fs.writeFileString(file, draw(page, build));
  yield* Effect.logInfo('prerender.page').pipe(Effect.annotateLogs({ path: page.path }));
});

const prerender = Effect.gen(function* () {
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const dist = path.resolve('dist');
  const build = yield* readBuild(dist);
  yield* Effect.forEach(PAGES, (page) => writePage(dist, page, build), { concurrency: 4 });

  // The art the pages import, emitted by the server build under the same
  // fingerprinted names the pages print.
  yield* fs.copy(path.resolve('.prerender', 'assets'), path.join(dist, 'assets'), {
    overwrite: true,
  });

  const manifest = yield* Schema.encodeEffect(Schema.fromJsonString(Schema.Unknown))(webManifest());
  yield* fs.writeFileString(path.join(dist, 'sitemap.xml'), sitemap(PAGES));
  yield* fs.writeFileString(path.join(dist, 'robots.txt'), robots());
  yield* fs.writeFileString(path.join(dist, 'llms.txt'), llmsTxt(PAGES));
  yield* fs.writeFileString(path.join(dist, 'site.webmanifest'), `${manifest}\n`);

  // Vite's manifest has been read; the site does not serve it.
  yield* fs.remove(path.join(dist, '.vite'), { recursive: true });
  yield* Effect.logInfo('prerender.done').pipe(Effect.annotateLogs({ pages: PAGES.length }));
});

prerender.pipe(Effect.provide(BunServices.layer), BunRuntime.runMain);
