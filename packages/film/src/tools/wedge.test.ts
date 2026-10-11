// A wedge draws a look at another level than the film plays, its pick never
// written: the palette is read as the pick would write it, each look and
// level checked against the ones it declares, and the file on disk stays as
// it was; `render --level` builds its render page with that palette swapped
// in and serves it, with the films' narration, on a loopback server of its
// own. No browser and no bundler: the test bundler answers each page as
// written (or as swapped).

import { BunServices } from '@effect/platform-bun';
import { describe, expect, it } from 'effect-bun-test';
import { Effect, FileSystem, Layer, Option, Path } from 'effect';
import { FetchHttpClient, HttpClient } from 'effect/http';
import { PageBundler } from './lab-page.ts';
import { PALETTE_FILE, paletteSwaps, wedgeServer } from './wedge.ts';
import { wedgedModule } from './wedge-module.ts';

const PALETTE = `export const looks = {
  style: {
    options: { cutpaper: 0, ps1: 1 },
    play: 'cutpaper',
  },
} as const;
`;

/** A film folder holding only its palette, in a fresh directory: its palette's path. */
const paletteFile = Effect.gen(function* () {
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const dir = yield* fs.makeTempDirectoryScoped();
  const file = path.join(dir, PALETTE_FILE);
  yield* fs.writeFileString(file, PALETTE);
  return yield* fs.realPath(file);
});

const layer = Layer.mergeAll(
  PageBundler.layerTest.pipe(Layer.provide(BunServices.layer)),
  BunServices.layer,
  FetchHttpClient.layer,
);

/** The body a GET of `url` answers, and its status. */
const get = (url: string) =>
  Effect.gen(function* () {
    const response = yield* HttpClient.get(url);
    return { status: response.status, body: yield* response.text };
  });

describe('a wedge', () => {
  it.live('reads the palette as the pick would write it, and leaves the file as it was', () =>
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const file = yield* paletteFile;
      const swaps = yield* paletteSwaps(fs, file, { style: 'ps1' });
      expect([...swaps.keys()]).toEqual([file]);
      expect(swaps.get(file)).toContain("play: 'ps1'");
      expect(yield* fs.readFileString(file)).toBe(PALETTE);
      // No levels: nothing swapped, the PreviewServer draws.
      expect((yield* paletteSwaps(fs, file, {})).size).toBe(0);
      expect(yield* wedgeServer('/nowhere/index.html', '/nowhere', new Map())).toEqual(
        Option.none(),
      );
    }).pipe(Effect.scoped, Effect.provide(layer)),
  );

  it.live('refuses a look the palette does not declare, and a level its look lacks', () =>
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const file = yield* paletteFile;
      const look = yield* Effect.flip(paletteSwaps(fs, file, { ground: 'light' }));
      expect(look).toMatchObject({ _tag: 'LookLevelUnknown', missing: 'look', known: ['style'] });
      const level = yield* Effect.flip(paletteSwaps(fs, file, { style: 'oil' }));
      expect(level).toMatchObject({ _tag: 'LookLevelUnknown', missing: 'level' });
      expect(yield* fs.readFileString(file)).toBe(PALETTE);
    }).pipe(Effect.scoped, Effect.provide(layer)),
  );

  it.live('serves its render page, swapped, and the films’ narration, until the scope closes', () =>
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const path = yield* Path.Path;
      const root = yield* fs.realPath(yield* fs.makeTempDirectoryScoped());
      const page = path.join(root, 'index.html');
      yield* fs.writeFileString(page, '<p>as written</p>');
      const films = path.join(root, 'films');
      yield* fs.makeDirectory(path.join(films, 'study', 'scenes'), { recursive: true });
      yield* fs.makeDirectory(path.join(films, 'study', 'narration'));
      yield* fs.writeFileString(path.join(films, 'study', 'scenes', 'index.ts'), '');
      yield* fs.writeFileString(path.join(films, 'study', 'narration', 'timings.json'), '{}');
      const url = yield* Effect.scoped(
        Effect.gen(function* () {
          const wedged = yield* wedgeServer(page, films, new Map([[page, '<p>wedged</p>']]));
          const served = Option.getOrElse(wedged, () => 'none');
          expect(served).toMatch(/^http:\/\/127\.0\.0\.1:\d+\/$/);
          expect(yield* get(served)).toEqual({ status: 200, body: '<p>wedged</p>' });
          expect(yield* get(`${served}films/study/narration/timings.json`)).toEqual({
            status: 200,
            body: '{}',
          });
          expect((yield* get(`${served}films/study/narration/gone.flac`)).status).toBe(404);
          expect((yield* get(`${served}chunk-none.js`)).status).toBe(404);
          return served;
        }),
      );
      // Closed with its scope: nothing answers there now.
      const after = yield* Effect.exit(HttpClient.get(url));
      expect(after._tag).toBe('Failure');
      expect(yield* fs.readFileString(page)).toBe('<p>as written</p>');
    }).pipe(Effect.scoped, Effect.provide(layer)),
  );

  it.live(
    'builds a module with the palette swapped for this process, sharing the packages the film resolves, its folder gone after',
    () =>
      Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem;
        const path = yield* Path.Path;
        const palette = yield* paletteFile;
        const dir = path.dirname(palette);
        // A package only the film's folder resolves, as the app's `@bible/film` is.
        const pkg = path.join(dir, 'node_modules', 'film-engine');
        yield* fs.makeDirectory(pkg, { recursive: true });
        yield* fs.writeFileString(
          path.join(pkg, 'package.json'),
          '{ "name": "film-engine", "type": "module", "main": "index.js" }',
        );
        yield* fs.writeFileString(path.join(pkg, 'index.js'), 'export const engine = {};\n');
        const film = path.join(dir, 'film.ts');
        yield* fs.writeFileString(
          film,
          [
            "import { looks } from './palette.ts';",
            "import { engine } from 'film-engine';",
            "import { sep } from 'node:path';",
            'export const play = looks.style.play;',
            'export const same = engine;',
            'export const where = import.meta.dir;',
            'export const slash = sep;',
            '',
          ].join('\n'),
        );
        const swaps = yield* paletteSwaps(fs, palette, { style: 'ps1' });
        const wedged = yield* Effect.scoped(
          Effect.gen(function* () {
            const module = yield* wedgedModule(film, swaps);
            // Built and imported while the scope holds, outside the film's folder.
            expect(module).toMatchObject({ play: 'ps1', slash: '/' });
            return module;
          }),
        );
        const direct = yield* Effect.promise(
          (): Promise<unknown> => import(path.join(pkg, 'index.js')),
        );
        // The very module the film's folder resolves, not a copy of it.
        expect(Reflect.get(Object(wedged), 'same')).toBe(Reflect.get(Object(direct), 'engine'));
        const where = String(Reflect.get(Object(wedged), 'where'));
        expect(where.startsWith(dir)).toBe(false);
        expect(yield* fs.exists(where)).toBe(false);
        // No swaps: the module as written.
        expect(yield* Effect.scoped(wedgedModule(film, new Map()))).toMatchObject({
          play: 'cutpaper',
        });
        expect(yield* fs.readFileString(palette)).toBe(PALETTE);
      }).pipe(Effect.scoped, Effect.provide(layer)),
  );
});
