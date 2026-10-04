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
// the development server's hot reload did. Each lab process draws its own
// id (`server`): a page served by an earlier process hears at once that it
// is old code.
//
// A build that fails answers its page as the failure, the bundler's words,
// is tried again on each request, and the page reloads itself once a build
// is made; the lab itself keeps serving.

import {
  Array as Arr,
  Clock,
  Context,
  Duration,
  Effect,
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
import { isNarrationUrl, narrationFile } from './narration-route.ts';
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

/** What a page asks its wait with: the build it was served, and by which server when it knows. */
interface Served {
  readonly since: number;
  readonly server: Option.Option<string>;
}

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
  // The number of changes seen: a build is current while it was made at this number.
  const changes = yield* SubscriptionRef.make(0);
  // The files the last build read, absolute: only a change to one of them makes a new build.
  // None before a build has read any, or after one failed: then every change does.
  const read = yield* Ref.make(Option.none<ReadonlySet<string>>());
  // Each folder watched, and the fiber watching it.
  const watchers = yield* Ref.make<ReadonlyMap<string, Fiber.Fiber<void>>>(new Map());
  const builds = yield* Ref.make<ReadonlyArray<Built>>([]);
  const building = yield* Semaphore.make(1);
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

  // Each change to a file the last build read is one more change; anything else (a mix, a render,
  // a note) is not.
  const heard = (file: string) =>
    Effect.flatMap(Ref.get(read), (inputs) =>
      Effect.when(
        SubscriptionRef.update(changes, (n) => n + 1),
        Effect.succeed(
          Option.match(inputs, { onNone: () => true, onSome: (set) => set.has(file) }),
        ),
      ),
    );
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

  /**
   * Watch exactly `dirs`: a folder already watched keeps its watch (a save
   * there is never between two watches), one no longer named is let go, and
   * the folders newly watched are answered.
   */
  const watchOnly = Effect.fnUntraced(function* (dirs: ReadonlyArray<string>) {
    const was = yield* Ref.get(watchers);
    const next = new Map<string, Fiber.Fiber<void>>();
    for (const [dir, fiber] of was) {
      if (dirs.includes(dir)) next.set(dir, fiber);
      else yield* Fiber.interrupt(fiber);
    }
    const added = dirs.filter((dir) => !was.has(dir));
    for (const dir of added) next.set(dir, yield* Effect.forkIn(watch(dir), scope));
    yield* Ref.set(watchers, next);
    return added;
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
      yield* SubscriptionRef.update(changes, (n) => n + 1);
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
          const kept = [...(yield* Ref.get(watchers)).keys()];
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
   * since, else a new one. A failed build is tried again on each ask, since a
   * fix may lie where no watch reaches (the bundler names the importer, not
   * the file it missed); one that then builds takes a new number, so a failed
   * page waiting past the old one reloads. Asks at once share one build.
   */
  const current = building.withPermit(
    Effect.gen(function* () {
      const now = yield* SubscriptionRef.get(changes);
      const last = Arr.head(yield* Ref.get(builds)).pipe(Option.filter((b) => b.build === now));
      if (Option.isSome(last) && last.value.outcome._tag === 'Built') return last.value;
      let made = yield* bundle(now);
      if (Option.isSome(last) && made.outcome._tag === 'Built')
        made = { ...made, build: yield* SubscriptionRef.updateAndGet(changes, (n) => n + 1) };
      yield* Ref.update(builds, (kept) => [made, ...kept].slice(0, KEPT));
      return made;
    }),
  );

  const now = Effect.map(SubscriptionRef.get(changes), (build) => ({ build, server }));

  const wait = (served: Served, timeout: Duration.Input): Effect.Effect<PageBuild> => {
    if (Option.exists(served.server, (s) => s !== server)) return now;
    return SubscriptionRef.changes(changes).pipe(
      Stream.filter((n) => n > served.since),
      Stream.runHead,
      Effect.andThen(Effect.sleep(SETTLE)),
      Effect.timeoutOption(Duration.min(Duration.fromInputUnsafe(timeout), MAX_WAIT)),
      Effect.andThen(now),
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

  /** The narration a page plays: the studio rewrites it in place (a take kept, the track remixed), so asked again each load. */
  const narration = (request: HttpServerRequest.HttpServerRequest, pathname: string) =>
    narrationFile(spec.films, pathname).pipe(
      Effect.flatMap(
        Option.match({
          onNone: () => Effect.succeed(NOT_FOUND),
          onSome: (found) => serveFile(request, found, 'no-cache'),
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
