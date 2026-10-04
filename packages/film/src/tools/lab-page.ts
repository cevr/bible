// The lab's pages, built in the lab's own process and answered behind its
// gate: the app's HTML entries (its lab, its review and its player), bundled
// with the framework's Solid plugin as Bun's page server would bundle them,
// but by `Bun.build` here (`PageBundler`), so every file is answered by a
// route `admit` has passed (Bun's own routes would answer before the gate,
// and its development server has no Host check). A build takes about a tenth
// of a second, so there is no build step: the pages are built when first
// asked, and again when asked after a file the last build read has changed.
// The lab runs for days, so the folders of the files the last build read are
// watched (`FileSystem.watch`; a package's `node_modules` aside), with the
// entries' folders from the start and, after a failed build, the folders of
// the files the bundler named; a folder still read keeps its watch, and a
// file read in a newly watched folder, or new to the read set, that changed
// from a second before its build began is one more change. Each change to
// one of those files is numbered (the build), and an open page that waits on
// `/api/review/build?since=` hears of it and reloads onto the new code, as
// the development server's hot reload did. A film's mixed track
// (`narration/full.wav`) is no source, but a page plays the one it loaded:
// once one is asked for, there or not (a film before its first mix), its
// folder is watched too, or the nearest one there on the way to it until the
// mix makes it, and a mix landing it (last, and whole, by a rename: the mix
// finished) is one more change, with no new build, that a page waiting with
// that film (`&film=`) hears and no other. A take's timings, saved before its mix, are none,
// so a page reloads once, onto the new track. Each lab process draws its own
// id (`server`): a page served by an earlier process hears at once that it
// is old code.
//
// A build that fails answers its page as the failure, the bundler's words,
// is tried again on each request and, while a page waits, by its wait every
// half second (the failed page asks only its wait), and the page reloads
// itself once a build is made; the lab itself keeps serving.

import {
  Array as Arr,
  Clock,
  Context,
  Duration,
  Effect,
  Equal,
  Fiber,
  FileSystem,
  Layer,
  Option,
  Order,
  Path,
  Predicate,
  Random,
  Record,
  Ref,
  Schema,
  Semaphore,
  Stream,
  SubscriptionRef,
} from 'effect';
import { HttpServerRequest, HttpServerResponse } from 'effect/http';
import { type PageBuild, type PageName, labUrls, legacyPlace, pageAt } from '../core/api.ts';
import type { PageAnswer } from './api-server.ts';
import { isNarrationUrl, narrationPath } from './narration-route.ts';
import { narrationUrls } from '../player/narrated.ts';
import { serveFile } from './review-file.ts';

/** What the app builds its pages from. */
export interface LabPageSpec {
  /** Each page's HTML entry; the paths each is served at are the framework's (`PAGE_PATHS`). */
  readonly pages: Readonly<Record<PageName, string>>;
  /** The films folder, whose narration the pages play (`/films/<film>/narration/<file>`). */
  readonly films: string;
}

/** A built file: its bytes and its media type. */
interface BuiltFile {
  readonly bytes: Uint8Array;
  readonly type: string;
}

/**
 * What a build made: each output by its path relative to the build's root
 * (`lab.html`, `chunk-….js`), and the files it read, absolute.
 */
interface Bundled {
  readonly outputs: ReadonlyArray<BuiltFile & { readonly path: string }>;
  readonly inputs: ReadonlyArray<string>;
}

/** A build the bundler refused: its words, and the files they name, absolute. */
interface BundleFailed {
  readonly reason: string;
  readonly files: ReadonlyArray<string>;
}

interface PageBundlerService {
  /** The pages `entries` (HTML files under `root`) bundled for the browser, or why not. */
  readonly bundle: (
    entries: ReadonlyArray<string>,
    root: string,
  ) => Effect.Effect<Bundled, BundleFailed>;
}

/** What a bundler said of a build it threw for: each of its messages, a line each. */
const bundlerWords = (cause: unknown): string => {
  if (Predicate.hasProperty(cause, 'errors') && Array.isArray(cause.errors))
    return cause.errors.map(String).join('\n');
  return String(cause);
};

/** A bundler's thrown messages, each with where it is, when it says. */
const BundlerMessages = Schema.Struct({
  errors: Schema.Array(
    Schema.Struct({ position: Schema.NullOr(Schema.Struct({ file: Schema.String })) }),
  ),
});

/** The files a bundler's messages name, as it named them. */
const bundlerFiles = (cause: unknown): ReadonlyArray<string> =>
  Option.match(Schema.decodeUnknownOption(BundlerMessages)(cause), {
    onNone: () => [],
    onSome: ({ errors }) =>
      errors.flatMap(({ position }) =>
        Option.toArray(Option.filter(Option.fromNullOr(position), (at) => at.file.length > 0)).map(
          (at) => at.file,
        ),
      ),
  });

/** `Bun.build` over the pages with the framework's Solid plugin; `path` resolves what it read. */
const bunBundle = (path: Path.Path) => (entries: ReadonlyArray<string>, root: string) =>
  Effect.gen(function* () {
    const { solidPlugin } = yield* Effect.promise(() => import('./solid-plugin.ts'));
    const out = yield* Effect.tryPromise({
      try: () =>
        Bun.build({
          entrypoints: [...entries],
          root,
          // Every page links its scripts and styles from the root (`/chunk-….js`), so a
          // page served under a film's path (`/films/<film>/lab/<scene>`) finds them.
          publicPath: '/',
          plugins: [solidPlugin],
          target: 'browser',
          splitting: true,
          minify: true,
          sourcemap: 'linked',
          metafile: true,
          // A failed build throws its messages (an AggregateError), caught here.
          throw: true,
        }),
      catch: (cause): BundleFailed => ({
        reason: bundlerWords(cause),
        files: bundlerFiles(cause).map((file) => path.resolve(file)),
      }),
    });
    const outputs = yield* Effect.forEach(out.outputs, (file) =>
      Effect.map(
        Effect.promise(() => file.arrayBuffer()),
        (buffer) => ({
          path: file.path.replace(/^\.\//, ''),
          bytes: new Uint8Array(buffer),
          type: file.type,
        }),
      ),
    );
    // The metafile names inputs relative to this process's directory.
    const inputs = Object.keys(out.metafile?.inputs ?? {}).map((input) => path.resolve(input));
    return { outputs, inputs } satisfies Bundled;
  });

/** The bundler the pages are built with. */
export class PageBundler extends Context.Service<PageBundler, PageBundlerService>()(
  '@bible/film/tools/PageBundler',
) {
  /** Bun's bundler with the framework's Solid plugin. */
  static readonly layer = Layer.effect(
    PageBundler,
    Effect.map(Path.Path, (path) => PageBundler.of({ bundle: bunBundle(path) })),
  );

  /**
   * A bundler for tests that need no browser code: each entry is its own
   * page, its HTML as written, read from the file system, and the entries
   * are all a build reads.
   */
  static readonly layerTest = Layer.effect(
    PageBundler,
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const path = yield* Path.Path;
      return PageBundler.of({
        bundle: (entries, root) =>
          Effect.forEach(entries, (entry) =>
            Effect.map(fs.readFile(entry), (bytes) => ({
              path: path.relative(root, entry),
              bytes,
              type: 'text/html;charset=utf-8',
            })),
          ).pipe(
            Effect.map((outputs) => ({ outputs, inputs: [...entries] })),
            Effect.mapError((error): BundleFailed => ({ reason: error.message, files: [] })),
          ),
      });
    }),
  );
}

/**
 * One build: its number, and its pages' HTML by page and its other files
 * (scripts, styles, maps) by the path they are asked for, or the bundler's words.
 */
interface Built {
  readonly build: number;
  readonly outcome:
    | {
        readonly _tag: 'Built';
        readonly pages: ReadonlyMap<PageName, BuiltFile>;
        readonly files: ReadonlyMap<string, BuiltFile>;
      }
    | { readonly _tag: 'Failed'; readonly reason: string };
}

/** How many builds' files stay answered: a page loaded from one may still fetch its chunks. */
const KEPT = 3;
/** Saves land as a burst (a formatter, several files): a waiting page hears of them once settled. */
const SETTLE = Duration.millis(150);
/** The longest a wait holds a request open. */
const MAX_WAIT = Duration.seconds(60);
/** How long a new watch is given to start before the files it now watches are checked. */
const ARMING = Duration.millis(250);
/** How far a file's mtime may lag the clock: a save during a build is counted from this before it began. */
const MTIME_LAG = Duration.seconds(1);
/** How often a wait builds again while the last build failed. */
const RETRY = Duration.millis(500);

/**
 * What a page asks its wait with: the build it was served, by which server
 * when it knows, and the film whose track it plays, if any (only that
 * film's mix wakes it).
 */
interface Served {
  readonly since: number;
  readonly server: Option.Option<string>;
  readonly film: Option.Option<string>;
}

/**
 * The changes seen: `n` numbers each one (a page is stamped with it), `all`
 * is the number of the last one every page hears (a source changed, a
 * failed build built), and `mixed` that of each film's last mix, which only
 * a page playing that film hears.
 */
interface Changes {
  readonly n: number;
  readonly all: number;
  readonly mixed: ReadonlyMap<string, number>;
}

/** One more change, which every page hears. */
const forAll = (seen: Changes): Changes => ({ ...seen, n: seen.n + 1, all: seen.n + 1 });

/** One more change: `film`'s mix, which only a page playing it hears. */
const mixOf =
  (film: string) =>
  (seen: Changes): Changes => ({
    ...seen,
    n: seen.n + 1,
    mixed: new Map([...seen.mixed, [film, seen.n + 1]]),
  });

/** The number of the last change a page playing `film` (or none) hears. */
const heardBy =
  (film: Option.Option<string>) =>
  (seen: Changes): number =>
    Math.max(
      seen.all,
      Option.getOrElse(
        Option.flatMap(film, (name) => Option.fromUndefinedOr(seen.mixed.get(name))),
        () => 0,
      ),
    );

interface LabPageService {
  /** The page, script, style or narration the request asks for, or a 404. */
  readonly answer: PageAnswer;
  /**
   * The pages' build as the sources stand: past `since` once a source
   * changes, held up to `timeout`; at once when the page was served by
   * another server.
   */
  readonly wait: (served: Served, timeout: Duration.Input) => Effect.Effect<PageBuild>;
}

export class LabPage extends Context.Service<LabPage, LabPageService>()(
  '@bible/film/tools/LabPage',
) {
  /** The app's pages over `spec`, watched while the scope is open. */
  static layer(
    spec: LabPageSpec,
  ): Layer.Layer<LabPage, never, FileSystem.FileSystem | Path.Path | PageBundler> {
    return Layer.effect(LabPage, make(spec));
  }
}

const escapeHtml = (text: string) =>
  text.replace(
    /[&<>"]/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c] ?? c,
  );

/** The build a page was served from, for its wait: `<meta name="lab-build">` and `lab-server`. */
const stamped = (html: string, build: PageBuild) =>
  html.replace(
    '</head>',
    `<meta name="lab-build" content="${build.build}" /><meta name="lab-server" content="${escapeHtml(build.server)}" /></head>`,
  );

/** `text` as a script's string literal. */
const jsonText = Schema.encodeSync(Schema.fromJsonString(Schema.String));

/** How long the failed page waits before it asks again, on any answer that is not a newer build. */
const FAILED_PAUSE_MS = 2000;

/**
 * A failed build's page: the bundler's words, reloading itself once a build
 * past it answers, or one from another server; it pauses before asking
 * again on every other answer (a refusal, a proxy's 502, no answer).
 */
const failedPage = (reason: string, build: PageBuild) =>
  stamped(
    `<!doctype html><html><head><meta charset="utf-8" /><title>Lab: the page did not build</title></head>`,
    build,
  ) +
  `<body style="font:14px/1.5 ui-monospace,monospace;background:#121110;color:#eee;padding:24px">` +
  `<h1 style="font-size:16px">The lab's page did not build</h1><pre style="white-space:pre-wrap">${escapeHtml(reason)}</pre>` +
  `<script>(async()=>{const S=${jsonText(build.server)},B=${build.build},` +
  `u=${jsonText(labUrls.page.wait({ query: { since: build.build, server: build.server } }))};` +
  `for(;;){try{const r=await fetch(u);if(r.ok){const b=await r.json();if(b.server!==S||b.build>B)return location.reload()}}catch{}` +
  `await new Promise(f=>setTimeout(f,${FAILED_PAUSE_MS}))}})()</script>` +
  `</body></html>`;

/** A build's files; a failed one has none. */
const filesOf = (built: Built): ReadonlyMap<string, BuiltFile> => {
  if (built.outcome._tag === 'Built') return built.outcome.files;
  return new Map();
};

/** The deepest folder every one of `dirs` (absolute) lies under. */
const commonDir = (dirs: ReadonlyArray<string>): string => {
  const [first = [], ...rest] = dirs.map((dir) => dir.split('/'));
  const common = rest.reduce((shared, parts) => {
    const differs = shared.findIndex((part, i) => part !== parts[i]);
    if (differs === -1) return shared;
    return shared.slice(0, differs);
  }, first);
  return common.join('/') || '/';
};

const NOT_FOUND = HttpServerResponse.text('not found', { status: 404 });
const HTML = 'text/html;charset=utf-8';

/** An id for this process's builds, unlike any other process's: its start, and a draw. */
const serverId = Effect.gen(function* () {
  const started = yield* Clock.currentTimeMillis;
  const draw = yield* Random.nextIntBetween(0, 36 ** 4);
  return `${started.toString(36)}-${draw.toString(36)}`;
});

const make = Effect.fnUntraced(function* (spec: LabPageSpec) {
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const bundler = yield* PageBundler;
  const scope = yield* Effect.scope;
  const server = yield* serverId;
  // The changes seen, each one a page waiting past it hears (`heardBy`): a page is stamped with `n`.
  const changes = yield* SubscriptionRef.make<Changes>({ n: 0, all: 0, mixed: new Map() });
  // The number of changes at the last change to a file a build reads: a build made at or past
  // it is current. A track mixed since (`masters`) wakes its film's pages and needs no build.
  const sourced = yield* Ref.make(0);
  // The files the last build read, absolute: only a change to one of them makes a new build.
  // None before a build has read any, or after one failed: then every change does.
  const read = yield* Ref.make(Option.none<ReadonlySet<string>>());
  // Each film's mixed track a page asked for, absolute, whether it was there or not (a film
  // before its first mix), and its mtime as last heard (none: not there). The mix lands it
  // last and whole (a rename), so a new mtime is the mix finished, and a page loaded then
  // plays the new track.
  const masters = yield* Ref.make<ReadonlyMap<string, Option.Option<number>>>(new Map());
  const films = path.resolve(spec.films);
  // Each folder watched, and the fiber watching it; changed by one at a time (a build, a track served).
  const watchers = yield* Ref.make<ReadonlyMap<string, Fiber.Fiber<void>>>(new Map());
  const watching = yield* Semaphore.make(1);
  // The folders the last build asked to have watched, the tracks' aside.
  const asked = yield* Ref.make<ReadonlyArray<string>>([]);
  const builds = yield* Ref.make<ReadonlyArray<Built>>([]);
  const building = yield* Semaphore.make(1);
  // One wait at a time builds again after a failure (`retryFailed`), however many pages wait.
  const retrying = yield* Semaphore.make(1);
  // Bun names each output by its entry's path relative to the build's root: the
  // entries' common folder, given to the build so the names cannot drift.
  const entries = Record.toEntries(spec.pages);
  const htmls = entries.map(([, html]) => path.resolve(html));
  const root = commonDir(htmls.map(path.dirname));
  const pageOf = new Map(entries.map(([page, html]) => [path.relative(root, html), page]));

  /** The folders `files` lie in, sorted, once each; a package's `node_modules` aside. */
  const foldersOf = (files: ReadonlyArray<string>) =>
    Arr.sort(
      Arr.dedupe(files.filter((file) => !file.includes('/node_modules/')).map(path.dirname)),
      Order.String,
    );

  /** One more change, to a file a build reads: the next page asked is built again. */
  const sourceChanged = Effect.flatMap(SubscriptionRef.updateAndGet(changes, forAll), (seen) =>
    Ref.set(sourced, seen.n),
  );

  /** `file`'s mtime, none when it is not there. */
  const mtimeOf = (file: string) =>
    fs.stat(file).pipe(
      Effect.map((info) => Option.map(info.mtime, (at) => at.getTime())),
      Effect.orElseSucceed(() => Option.none<number>()),
    );

  /** The film a track (`<films>/<film>/narration/full.wav`) is of. */
  const filmOf = (master: string) => path.basename(path.dirname(path.dirname(master)));

  /**
   * Whether `master`, a track a page asked for, landed since last heard: a
   * new mtime is one more change, which only its film's pages hear. The
   * mix always lands the track by a rename (`writeWholeWith` in mixer.ts,
   * then `fs.rename` onto it), never by writes in place, so one mix is one
   * new mtime; a watch's event and a check after arming that both see it
   * count it once.
   */
  const landed = (master: string) =>
    Effect.gen(function* () {
      const at = yield* mtimeOf(master);
      if (Option.isNone(at)) return;
      const fresh = yield* Ref.modify(
        masters,
        (known): readonly [boolean, ReadonlyMap<string, Option.Option<number>>] => {
          const last = Option.fromUndefinedOr(known.get(master));
          if (Option.isNone(last) || Equal.equals(last.value, at)) return [false, known];
          return [true, new Map([...known, [master, at]])];
        },
      );
      if (fresh) yield* SubscriptionRef.update(changes, mixOf(filmOf(master)));
    });

  /** Each of `tracks` that landed while no watch reached it, checked once new watches are armed. */
  const landedUnwatched = (tracks: ReadonlyArray<string>) =>
    Effect.andThen(Effect.sleep(ARMING), Effect.forEach(tracks, landed, { discard: true })).pipe(
      Effect.forkIn(scope),
    );

  // Each change to a file the last build read is one more change, and a new build; a mix
  // landing a track a page asked for is one more change alone, for its film; a folder made
  // on the way to such a track (a film's first mix makes `narration/`) moves the watch down
  // to it; anything else (a take's timings before its mix, a render, a note) is none.
  const heard = (file: string): Effect.Effect<void> =>
    Effect.gen(function* () {
      const inputs = yield* Ref.get(read);
      if (Option.match(inputs, { onNone: () => true, onSome: (set) => set.has(file) }))
        return yield* sourceChanged;
      const tracks = [...(yield* Ref.get(masters)).keys()];
      if (tracks.includes(file)) return yield* landed(file);
      const below = tracks.filter((track) => track.startsWith(`${file}/`));
      if (below.length === 0) return;
      // Forked: the new watch may let go of the folder this one is heard in.
      yield* Effect.forkIn(
        Effect.andThen(watching.withPermit(rewatch), landedUnwatched(below)),
        scope,
      );
    });
  const watch = (dir: string) =>
    fs.watch(dir).pipe(
      Stream.map((event) => path.resolve(dir, event.path)),
      Stream.catch((error) =>
        Stream.fromEffect(
          Effect.logWarning(`lab.page.watch.failed dir=${dir} ${error.message}`),
        ).pipe(Stream.drain),
      ),
      Stream.runForEach(heard),
    );

  /** The nearest folder on the way to `dir` that is there, no higher than the films folder. */
  const nearest = (dir: string): Effect.Effect<string> =>
    Effect.flatMap(
      fs.exists(dir).pipe(Effect.orElseSucceed(() => false)),
      (there): Effect.Effect<string> => {
        if (there || !dir.startsWith(`${films}/`)) return Effect.succeed(dir);
        return nearest(path.dirname(dir));
      },
    );

  /**
   * Watch exactly the folders the builds ask for (`asked`) and, for each
   * track asked for, its folder, or the nearest one there on the way to it:
   * a folder already watched keeps its watch (a save there is never between
   * two watches), one no longer named is let go, and the folders newly
   * watched are answered. Run under `watching`.
   */
  const rewatch: Effect.Effect<ReadonlyArray<string>> = Effect.gen(function* () {
    const tracks = yield* Effect.forEach((yield* Ref.get(masters)).keys(), (track) =>
      nearest(path.dirname(track)),
    );
    const wanted = Arr.dedupe([...(yield* Ref.get(asked)), ...tracks]);
    const was = yield* Ref.get(watchers);
    const next = new Map<string, Fiber.Fiber<void>>();
    for (const [dir, fiber] of was) {
      if (wanted.includes(dir)) next.set(dir, fiber);
      else yield* Fiber.interrupt(fiber);
    }
    const added = wanted.filter((dir) => !was.has(dir));
    for (const dir of added) next.set(dir, yield* Effect.forkIn(watch(dir), scope));
    yield* Ref.set(watchers, next);
    return added;
  });

  /** Watch exactly `dirs` for the builds, beside the tracks' folders; answers the folders newly watched. */
  const watchOnly = (dirs: ReadonlyArray<string>) =>
    watching.withPermit(Effect.andThen(Ref.set(asked, dirs), rewatch));

  /**
   * `file`, asked for at `pathname`, there or not: when it is its film's
   * mixed track, it is watched for from now on (through the nearest folder
   * there, before a film's first mix), so the next mix wakes the film's
   * pages; one that landed before the watch was armed is heard after.
   */
  const trackAsked = (pathname: string, file: string) =>
    Effect.gen(function* () {
      const master = path.resolve(file);
      if (pathname !== narrationUrls(filmOf(master)).audio) return;
      if ((yield* Ref.get(masters)).has(master)) return;
      const at = yield* mtimeOf(master);
      yield* watching.withPermit(
        Effect.andThen(
          Ref.update(masters, (known) => new Map([...known, [master, at]])),
          rewatch,
        ),
      );
      yield* landedUnwatched([master]);
    });

  /**
   * A save no watch counted: once new watches are armed, a file of
   * `suspects` changed since `started` (the build began reading, less
   * MTIME_LAG) is one more change. A suspect is a file the build read that a
   * watch could not count: in a folder newly watched, or new to the read set
   * (the watch judged its save against the build before).
   */
  const missed = (suspects: ReadonlyArray<string>, started: number) =>
    Effect.gen(function* () {
      if (suspects.length === 0) return;
      yield* Effect.sleep(ARMING);
      const since = started - Duration.toMillis(MTIME_LAG);
      const changed = yield* Effect.forEach(suspects, (file) =>
        fs.stat(file).pipe(
          Effect.map((info) => Option.exists(info.mtime, (at) => at.getTime() >= since)),
          // Gone since the build read it: changed.
          Effect.orElseSucceed(() => true),
        ),
      );
      if (!changed.includes(true)) return;
      yield* Effect.log(`lab.page.watch.missed files=${suspects.length}`);
      yield* sourceChanged;
    }).pipe(Effect.forkIn(scope));

  // Before any build: the entries' folders, so a first build that fails still hears its fix.
  yield* watchOnly(foldersOf(htmls));

  const bundle = Effect.fnUntraced(function* (build: number) {
    const started = yield* Clock.currentTimeMillis;
    const outcome = yield* bundler.bundle(htmls, root).pipe(
      Effect.flatMap(({ outputs, inputs }) =>
        Effect.gen(function* () {
          const before = yield* Ref.getAndSet(read, Option.some(new Set(inputs)));
          const added = yield* watchOnly(foldersOf([...htmls, ...inputs]));
          yield* missed(
            inputs.filter(
              (input) =>
                !input.includes('/node_modules/') &&
                (added.includes(path.dirname(input)) ||
                  // With no read set before, the watch counted every save.
                  Option.exists(before, (set) => !set.has(input))),
            ),
            started,
          );
          const pages = new Map<PageName, BuiltFile>();
          const files = new Map<string, BuiltFile>();
          for (const { path: name, ...built } of outputs)
            Option.match(Option.fromUndefinedOr(pageOf.get(name)), {
              onNone: () => files.set(`/${name}`, built),
              onSome: (page) => pages.set(page, built),
            });
          return { _tag: 'Built', pages, files } as const;
        }),
      ),
      Effect.catch((failed) =>
        Effect.gen(function* () {
          // Every change makes a new build now; the folders kept, and those of the files
          // the bundler named, so a fix to any of them is heard.
          yield* Ref.set(read, Option.none());
          const kept = yield* Ref.get(asked);
          const added = yield* watchOnly(
            Arr.sort(Arr.dedupe([...kept, ...foldersOf(failed.files)]), Order.String),
          );
          yield* missed(
            failed.files.filter((file) => added.includes(path.dirname(file))),
            started,
          );
          return { _tag: 'Failed', reason: failed.reason } as const;
        }),
      ),
    );
    yield* Effect.log(`lab.page.build build=${build} outcome=${outcome._tag}`);
    return { build, outcome } satisfies Built;
  });

  /**
   * The build as the sources stand: the last one if nothing it read changed
   * since, else a new one. A failed build is tried again on each ask, and by
   * a waiting page's wait (`retryFailed`), since a fix may lie where no watch reaches (the bundler names the importer, not
   * the file it missed); one that then builds takes a new number, so a failed
   * page waiting past the old one reloads. Asks at once share one build. The
   * last build answered again is stamped with the changes seen now, a mix
   * since among them, so its page waits past them.
   */
  const current = building.withPermit(
    Effect.gen(function* () {
      const now = (yield* SubscriptionRef.get(changes)).n;
      const since = yield* Ref.get(sourced);
      const last = Arr.head(yield* Ref.get(builds)).pipe(Option.filter((b) => b.build >= since));
      if (Option.isSome(last) && last.value.outcome._tag === 'Built')
        return { ...last.value, build: now };
      let made = yield* bundle(now);
      if (Option.isSome(last) && made.outcome._tag === 'Built')
        made = { ...made, build: (yield* SubscriptionRef.updateAndGet(changes, forAll)).n };
      yield* Ref.update(builds, (kept) => [made, ...kept].slice(0, KEPT));
      return made;
    }),
  );

  /** The build a page playing `film` (or none) hears now. */
  const now = (film: Option.Option<string>) =>
    Effect.map(SubscriptionRef.get(changes), (seen) => ({ build: heardBy(film)(seen), server }));

  /**
   * While the last build failed, build again every RETRY, for as long as a
   * page waits: a fix may lie where no watch reaches, or the bundler may still
   * hold what the failed build read a moment ago, and a failed page asks
   * nothing but its wait. One that builds takes a new number (`current`),
   * which the waiting pages hear. One wait at a time does it; it never ends.
   */
  const retryFailed = retrying.withPermit(
    Effect.forever(
      Effect.gen(function* () {
        yield* Effect.sleep(RETRY);
        const last = Arr.head(yield* Ref.get(builds));
        if (Option.exists(last, (built) => built.outcome._tag === 'Failed')) yield* current;
      }),
    ),
  );

  const wait = (served: Served, timeout: Duration.Input): Effect.Effect<PageBuild> => {
    if (Option.exists(served.server, (s) => s !== server)) return now(served.film);
    return Effect.raceFirst(
      SubscriptionRef.changes(changes).pipe(
        Stream.filter((seen) => heardBy(served.film)(seen) > served.since),
        Stream.runHead,
        Effect.andThen(Effect.sleep(SETTLE)),
      ),
      retryFailed,
    ).pipe(
      Effect.timeoutOption(Duration.min(Duration.fromInputUnsafe(timeout), MAX_WAIT)),
      Effect.andThen(now(served.film)),
    );
  };

  /** A page's HTML as the sources stand, built now if they changed: asked again each load. */
  const page = (name: PageName) =>
    Effect.gen(function* () {
      const built = yield* current;
      const stamp = { build: built.build, server };
      if (built.outcome._tag === 'Failed')
        return HttpServerResponse.text(failedPage(built.outcome.reason, stamp), {
          status: 500,
          contentType: HTML,
          headers: { 'cache-control': 'no-store' },
        });
      const html = Option.fromUndefinedOr(built.outcome.pages.get(name));
      if (Option.isNone(html)) return NOT_FOUND;
      return HttpServerResponse.text(stamped(new TextDecoder().decode(html.value.bytes), stamp), {
        contentType: HTML,
        headers: { 'cache-control': 'no-store' },
      });
    });

  /** A script, style or map by its path, in the builds kept: each named by its hash, so never changed. */
  const asset = (pathname: string) =>
    Effect.map(Ref.get(builds), (kept) =>
      Option.map(
        Arr.findFirst(kept, (built) => Option.fromUndefinedOr(filesOf(built).get(pathname))),
        ({ bytes, type }) =>
          HttpServerResponse.uint8Array(bytes, {
            contentType: type,
            headers: { 'cache-control': 'max-age=31536000, immutable' },
          }),
      ),
    );

  /**
   * The narration a page plays: the studio rewrites it in place (a take
   * kept, the track remixed), so asked again each load. A film's track is
   * watched for once asked, there or not (a 404 before its first mix).
   */
  const narration = (request: HttpServerRequest.HttpServerRequest, pathname: string) =>
    narrationPath(spec.films, pathname).pipe(
      Effect.flatMap(
        Option.match({
          onNone: () => Effect.succeed(NOT_FOUND),
          onSome: (file) =>
            Effect.andThen(
              trackAsked(pathname, file),
              Effect.flatMap(fs.exists(file), (there) => {
                if (there) return serveFile(request, file, 'no-cache');
                return Effect.succeed(NOT_FOUND);
              }),
            ),
        }),
      ),
      Effect.catchTags({
        ReviewFileUnknown: () => Effect.succeed(NOT_FOUND),
        PlatformError: (error) =>
          Effect.as(Effect.logWarning(`lab.page.narration.failed ${error.message}`), NOT_FOUND),
      }),
    );

  /** An old link sent on to its place (`legacyPlace`); the browser keeps its hash across. */
  const moved = (from: string, to: string) =>
    Effect.as(
      Effect.logInfo(`lab.page.moved from=${from} to=${to}`),
      HttpServerResponse.redirect(to, { status: 302, headers: { 'cache-control': 'no-store' } }),
    );

  // A narration file by its exact URL, then a built file, then an old link
  // sent on to its place, then the page the path serves (`pageAt`, the
  // places); anything else, a chunk of a build no longer kept among them, is
  // a 404 and never a page's HTML.
  const answer = Effect.gen(function* () {
    const request = yield* HttpServerRequest.HttpServerRequest;
    const url = new URL(request.url, 'http://lab');
    const pathname = url.pathname;
    if (isNarrationUrl(pathname)) return yield* narration(request, pathname);
    const built = yield* asset(pathname);
    if (Option.isSome(built)) return built.value;
    const old = `${pathname}${url.search}`;
    const place = legacyPlace(old);
    if (Option.isSome(place)) return yield* moved(old, place.value);
    return yield* Option.match(pageAt(pathname), {
      onNone: () => Effect.succeed(NOT_FOUND),
      onSome: page,
    });
  });

  return LabPage.of({ answer, wait });
});
