// The app the lab-page tests serve (`lab-page*.test.ts`): its pages as one
// lab process serves them (`served`), over an app in a temp folder
// (`appFolderWith`, `app`) where the box's watch is the question (a save, a
// rename, a folder made), or over films in memory (`filmsInMemory`) where
// only what a film's pages hear of a mix is, their watches told by the test.

import { BunHttpPlatform, BunServices } from '@effect/platform-bun';
import {
  Array as Arr,
  Context,
  type Duration,
  Effect,
  FileSystem,
  Layer,
  Option,
  Path,
  PubSub,
  Record,
  Ref,
  Schedule,
  Stream,
} from 'effect';
import { HttpPlatform, HttpServerRequest, HttpServerResponse } from 'effect/http';
import { LabPage, type LabPageSpec, PageBundler } from '../lab-page.ts';
import { PageReads } from '../api-server.ts';
import { PageRenderer } from '../page-render.ts';
import { memoryFileSystem, text } from '../testing.ts';

export const Platform = Layer.provideMerge(BunHttpPlatform.layer, BunServices.layer);

export const html = (title: string, script: string) =>
  `<!doctype html><html><head><title>${title}</title></head><body><script type="module" src="${script}"></script></body></html>`;

/**
 * An app in a temp folder, by its real path (macOS's temp folder is a link,
 * and the bundler names what it reads by where it lies): its review
 * (`review.html` over `src/p.ts`, which imports `lib/shared.ts`, another
 * package's source), its lab, its player (`sub/player.html`, an entry below
 * the others) and its render page, each file as `own` has it if it names
 * it. The folder is written under another name and renamed into place: a
 * watch armed a few milliseconds after a save may still be told of it on
 * macOS (FSEvents hands a new watch the events still on their way), where
 * inotify never tells one, and those events name the folder written, so a
 * lab started after hears no save of the folder's making. `write` writes a
 * file under the folder.
 */
export const appFolderWith = (own: Readonly<Record<string, string>>) =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const parent = yield* fs.realPath(yield* fs.makeTempDirectoryScoped());
    const making = path.join(parent, 'making');
    for (const folder of ['src/films', 'sub', 'lib', 'extra'])
      yield* fs.makeDirectory(path.join(making, folder), { recursive: true });
    const files = {
      'review.html': html('review', './src/p.ts'),
      'lab.html': html('lab', './src/lab.ts'),
      'sub/player.html': html('player', '../src/play.ts'),
      'index.html': html('render', './src/render.ts'),
      'src/p.ts': "import { shared } from '../lib/shared.ts';\nconsole.log('first', shared);\n",
      'lib/shared.ts': "export const shared = 'shared one';\n",
      'src/lab.ts': "console.log('the lab');\n",
      'src/play.ts': "console.log('the player');\n",
      'src/render.ts': "console.log('the render page');\n",
      'src/notes.json': '{}',
      // The review's server entry: the same shared source, and one only the server reads.
      'src/review.server.tsx':
        "import { shared } from '../lib/shared.ts';\nimport { only } from '../lib/server-only.ts';\nexport const rendered = () => `${shared} ${only}`;\n",
      'lib/server-only.ts': "export const only = 'server one';\n",
      ...own,
    };
    for (const [name, text] of Record.toEntries(files))
      yield* fs.writeFileString(path.join(making, name), text);
    const dir = path.join(parent, 'app');
    yield* fs.rename(making, dir);
    const write = (name: string, text: string) => fs.writeFileString(path.join(dir, name), text);
    const spec = {
      pages: {
        review: path.join(dir, 'review.html'),
        lab: path.join(dir, 'lab.html'),
        player: path.join(dir, 'sub', 'player.html'),
        render: path.join(dir, 'index.html'),
      },
      servers: { review: path.join(dir, 'src', 'review.server.tsx') },
      films: path.join(dir, 'src', 'films'),
      footage: { dir: path.join(dir, 'footage'), out: path.join(dir, 'out') },
    };
    return { spec, write };
  });

/** The app as `appFolderWith` writes it, every file its own. */
export const appFolder = appFolderWith({});

/** A page's reads as it renders, answered `read <path>`. */
const echoReads = PageReads.of({
  read: (path) => Effect.succeed(new Response(`read ${path}`)),
});

/**
 * The pages over a folder, as one lab process serves them, with `bundler`
 * and `renderer` (one that writes the page's name and URL, by default).
 */
export const served = (
  spec: LabPageSpec,
  bundler: Layer.Layer<PageBundler, never, FileSystem.FileSystem | Path.Path>,
  renderer: Layer.Layer<PageRenderer> = PageRenderer.layerTest,
) =>
  Effect.gen(function* () {
    const page = Context.get(
      yield* Layer.build(LabPage.layer(spec).pipe(Layer.provide([bundler, renderer]))),
      LabPage,
    );
    const ask = (pathname: string, method = 'GET', headers: Record<string, string> = {}) =>
      Effect.gen(function* () {
        const request = HttpServerRequest.fromWeb(
          new Request(`http://127.0.0.1:8229${pathname}`, {
            method,
            headers: { host: '127.0.0.1:8229', ...headers },
          }),
        );
        const response = HttpServerResponse.toWeb(
          yield* page.answer.pipe(
            Effect.provideService(HttpServerRequest.HttpServerRequest, request),
            Effect.provideService(PageReads, echoReads),
          ),
        );
        const bytes = new Uint8Array(yield* Effect.promise(() => response.arrayBuffer()));
        return {
          status: response.status,
          location: response.headers.get('location') ?? '',
          type: response.headers.get('content-type') ?? '',
          encoding: response.headers.get('content-encoding') ?? '',
          bytes,
          text: new TextDecoder().decode(bytes),
        };
      });
    return { page, ask };
  });

/** The app over Bun's bundler. */
export const app = Effect.gen(function* () {
  const { spec, write } = yield* appFolder;
  const { page, ask } = yield* served(spec, PageBundler.layer);
  /** The script of the page `pathname` serves, as its HTML names it. */
  const scriptOf = (pathname: string) =>
    Effect.gen(function* () {
      const text = (yield* ask(pathname)).text;
      const src = /src="\.?(\/[^"]+\.js)"/.exec(text)?.[1] ?? '';
      return (yield* ask(src)).text;
    });
  const script = scriptOf('/');
  /**
   * A wait past `since`, while `name` is written as `text` until it answers:
   * the watch may start after the first write, and the same bytes again are
   * the same change.
   */
  const waitWriting = (since: number, timeout: Duration.Input, name: string, text: string) =>
    Effect.raceFirst(
      page.wait({ since, server: Option.none(), film: Option.none() }, timeout),
      write(name, text).pipe(
        Effect.repeat(Schedule.spaced('200 millis')),
        Effect.andThen(Effect.never),
      ),
    );
  /** A wait past `since` after `name` is written as `text` once: one save, heard or not. */
  const waitOnce = (since: number, timeout: Duration.Input, name: string, text: string) =>
    Effect.andThen(
      write(name, text),
      page.wait({ since, server: Option.none(), film: Option.none() }, timeout),
    );
  return { ask, page, script, scriptOf, spec, waitWriting, waitOnce, write };
});

export const buildOf = (text: string) => Number(/name="lab-build" content="(\d+)"/.exec(text)?.[1]);
export const serverOf = (text: string) =>
  /name="lab-server" content="([^"]+)"/.exec(text)?.[1] ?? '';

/** When each film's track in memory was first mixed (ms). */
export const MIXED_AT = 1_900_000_000_000;

/**
 * The app over files in memory, for what a film's pages hear of its mixes
 * where how the box's watch reports a save is not the question: films `f`
 * and `g`, each with its track mixed once at `MIXED_AT`, the pages built by
 * the test bundler. A watch hears only what the test tells it: `land` mixes
 * a film's track (a new mtime) unheard, `mix` mixes it and tells the watch;
 * each answers the track's new mtime. `armed` waits until the watch of a
 * film's narration folder runs.
 */
export const filmsInMemory = Effect.gen(function* () {
  const html = text('<!doctype html><html><head></head><body></body></html>');
  const files = new Map<string, Uint8Array>([
    ['/app/review.html', html],
    ['/app/lab.html', html],
    ['/app/player.html', html],
    ['/app/index.html', html],
  ]);
  const mtimes = new Map<string, number>();
  const trackOf = (film: string) => `/app/films/${film}/narration/full.wav`;
  for (const film of ['f', 'g']) {
    files.set(`/app/films/${film}/scenes/index.ts`, text('export {};\n'));
    files.set(trackOf(film), text(`${film} one`));
    mtimes.set(trackOf(film), MIXED_AT);
  }
  const saves = yield* PubSub.unbounded<string>();
  const live = yield* Ref.make<ReadonlyArray<string>>([]);
  const path = yield* Path.Path;
  const fileSystem = Layer.effect(
    FileSystem.FileSystem,
    Effect.map(FileSystem.FileSystem, (fs) =>
      FileSystem.FileSystem.of({
        ...fs,
        // Subscribed before it counts as running, so a save told once it runs is heard.
        watch: (dir) =>
          Stream.unwrap(
            Effect.gen(function* () {
              const told = yield* PubSub.subscribe(saves);
              yield* Ref.update(live, (dirs) => [...dirs, dir]);
              return Stream.fromSubscription(told).pipe(
                Stream.filter((file) => path.dirname(file) === dir),
                Stream.map((file): FileSystem.WatchEvent => ({
                  _tag: 'Update',
                  path: path.basename(file),
                })),
              );
            }),
          ).pipe(Stream.ensuring(Ref.update(live, (dirs) => Arr.remove(dirs, dirs.indexOf(dir))))),
      }),
    ),
  ).pipe(Layer.provide(memoryFileSystem(files, new Set(), mtimes)));
  const memory = yield* Layer.build(
    Layer.provideMerge(HttpPlatform.layer, Layer.mergeAll(fileSystem, Path.layer)),
  );
  const spec = {
    pages: {
      review: '/app/review.html',
      lab: '/app/lab.html',
      player: '/app/player.html',
      render: '/app/index.html',
    },
    servers: {},
    films: '/app/films',
    footage: { dir: '/app/footage', out: '/app/out' },
  };
  const { page, ask } = yield* served(spec, PageBundler.layerTest).pipe(
    Effect.provideContext(memory),
  );
  const land = (film: string, mixed: string) =>
    Effect.sync(() => {
      const at = (mtimes.get(trackOf(film)) ?? MIXED_AT) + 10_000;
      files.set(trackOf(film), text(mixed));
      mtimes.set(trackOf(film), at);
      return at;
    });
  const mix = (film: string, mixed: string) =>
    Effect.tap(land(film, mixed), () => PubSub.publish(saves, trackOf(film)));
  const armed = (film: string) =>
    Ref.get(live).pipe(
      Effect.repeat({
        until: (dirs) => dirs.includes(path.dirname(trackOf(film))),
        schedule: Schedule.spaced('10 millis'),
      }),
      Effect.timeout('2 seconds'),
      Effect.orDie,
      Effect.asVoid,
    );
  return {
    page,
    ask: (pathname: string) => ask(pathname).pipe(Effect.provideContext(memory)),
    land,
    mix,
    armed,
  };
});
