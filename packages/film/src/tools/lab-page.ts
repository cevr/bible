// The lab's pages, built in the lab's own process and answered behind its
// gate: the app's HTML entries (its lab, its review and its player), bundled
// with the framework's Solid plugin as Bun's page server would bundle them,
// but by `Bun.build` here, so every file is answered by a route `admit` has
// passed (Bun's own routes would answer before the gate, and its development
// server has no Host check). A build takes about a tenth of a second, so there is no
// build step: the pages are built when first asked, and again when asked
// after a file the last build read has changed. The lab runs for days, so the
// change is watched (`FileSystem.watch` over `sources`), each one numbered
// (the build), and an open page that waits on `/api/review/build?since=` hears of
// it and reloads onto the new code, as the development server's hot reload did.
//
// A build that fails answers its page as the failure, the bundler's words,
// and reloads itself once a source changes; the lab itself keeps serving.

import {
  Array as Arr,
  Context,
  Duration,
  Effect,
  FileSystem,
  Layer,
  Option,
  Path,
  Predicate,
  Record,
  Ref,
  Semaphore,
  Stream,
  SubscriptionRef,
} from 'effect';
import { HttpServerRequest, HttpServerResponse } from 'effect/http';
import { type PageBuild, type PageName, labUrls, pageAt } from '../core/api.ts';
import type { PageAnswer } from './api-server.ts';
import { isNarrationUrl, narrationFile } from './narration-route.ts';
import { serveFile } from './review-file.ts';

/** What the app builds its pages from. */
export interface LabPageSpec {
  /** Each page's HTML entry; the paths each is served at are the framework's (`PAGE_PATHS`). */
  readonly pages: Readonly<Record<PageName, string>>;
  /**
   * The folders the app's sources lie under: a change to a file a build read
   * rebuilds the pages. The framework's own source is watched beside them.
   */
  readonly sources: ReadonlyArray<string>;
  /** The films folder, whose narration the pages play (`/films/<film>/narration/<file>`). */
  readonly films: string;
}

/** A built file: its bytes and its media type. */
interface BuiltFile {
  readonly bytes: Uint8Array;
  readonly type: string;
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

interface LabPageService {
  /** The page, script, style or narration the request asks for, or a 404. */
  readonly answer: PageAnswer;
  /** The pages' build as the sources stand: past `since` once a source changes, held up to `timeout`. */
  readonly wait: (since: number, timeout: Duration.Input) => Effect.Effect<PageBuild>;
}

export class LabPage extends Context.Service<LabPage, LabPageService>()(
  '@bible/film/tools/LabPage',
) {
  /** The app's pages over `spec`, watched while the scope is open. */
  static layer(spec: LabPageSpec): Layer.Layer<LabPage, never, FileSystem.FileSystem | Path.Path> {
    return Layer.effect(LabPage, make(spec));
  }
}

/** What the bundler said of a build it threw for: each of its messages, a line each. */
const bundlerWords = (cause: unknown): string => {
  if (Predicate.hasProperty(cause, 'errors') && Array.isArray(cause.errors))
    return cause.errors.map(String).join('\n');
  return String(cause);
};

const escapeHtml = (text: string) =>
  text.replace(
    /[&<>"]/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c] ?? c,
  );

/** The build a page was served from, for its wait: `<meta name="lab-build">`. */
const stamped = (html: string, build: number) =>
  html.replace('</head>', `<meta name="lab-build" content="${build}" /></head>`);

/** A failed build's page: the bundler's words, reloading itself once a source changes. */
const failedPage = (reason: string, build: number) =>
  stamped(
    `<!doctype html><html><head><meta charset="utf-8" /><title>Lab: the page did not build</title></head>`,
    build,
  ) +
  `<body style="font:14px/1.5 ui-monospace,monospace;background:#121110;color:#eee;padding:24px">` +
  `<h1 style="font-size:16px">The lab's page did not build</h1><pre style="white-space:pre-wrap">${escapeHtml(reason)}</pre>` +
  `<script>(async()=>{for(;;){try{const r=await fetch('${labUrls.page.wait({ query: { since: build } })}');` +
  `if(r.ok&&(await r.json()).build>${build})return location.reload()}catch{await new Promise(f=>setTimeout(f,2000))}}})()</script>` +
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

const make = Effect.fnUntraced(function* (spec: LabPageSpec) {
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  // The number of changes seen: a build is current while it was made at this number.
  const changes = yield* SubscriptionRef.make(0);
  // The files the last build read, absolute: only a change to one of them makes a new build.
  // None before a build has read any, or after one failed: then every change does.
  const read = yield* Ref.make(Option.none<ReadonlySet<string>>());
  const builds = yield* Ref.make<ReadonlyArray<Built>>([]);
  const building = yield* Semaphore.make(1);
  // Bun names each output by its entry's path relative to the build's root: the
  // entries' common folder, given to the build so the names cannot drift.
  const entries = Record.toEntries(spec.pages);
  const root = commonDir(entries.map(([, html]) => path.dirname(path.resolve(html))));
  const pageOf = new Map(entries.map(([page, html]) => [path.relative(root, html), page]));

  const bundle = Effect.fnUntraced(function* (build: number) {
    const { solidPlugin } = yield* Effect.promise(() => import('./solid-plugin.ts'));
    const outcome = yield* Effect.tryPromise({
      try: () =>
        Bun.build({
          entrypoints: entries.map(([, html]) => html),
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
          // A failed build throws its messages (an AggregateError), caught below.
          throw: true,
        }),
      catch: bundlerWords,
    }).pipe(
      Effect.flatMap((out) =>
        Effect.gen(function* () {
          // The metafile names inputs relative to this process's directory.
          const inputs = Object.keys(out.metafile?.inputs ?? {}).map((input) =>
            path.resolve(input),
          );
          yield* Ref.set(read, Option.some(new Set(inputs)));
          const pages = new Map<PageName, BuiltFile>();
          const files = new Map<string, BuiltFile>();
          for (const file of out.outputs) {
            const name = file.path.replace(/^\.\//, '');
            const bytes = new Uint8Array(yield* Effect.promise(() => file.arrayBuffer()));
            const built = { bytes, type: file.type };
            Option.match(Option.fromUndefinedOr(pageOf.get(name)), {
              onNone: () => files.set(`/${name}`, built),
              onSome: (page) => pages.set(page, built),
            });
          }
          return { _tag: 'Built', pages, files } as const;
        }),
      ),
      Effect.catch((reason) =>
        Effect.as(Ref.set(read, Option.none()), { _tag: 'Failed', reason } as const),
      ),
    );
    yield* Effect.log(`lab.page.build build=${build} outcome=${outcome._tag}`);
    return { build, outcome } satisfies Built;
  });

  /** The build as the sources stand: the last one if nothing it read changed since, else a new one. */
  const current = building.withPermit(
    Effect.gen(function* () {
      const now = yield* SubscriptionRef.get(changes);
      const last = Arr.head(yield* Ref.get(builds)).pipe(Option.filter((b) => b.build === now));
      if (Option.isSome(last)) return last.value;
      const made = yield* bundle(now);
      yield* Ref.update(builds, (kept) => [made, ...kept].slice(0, KEPT));
      return made;
    }),
  );

  // Each change to a file the last build read is one more change; anything else (a mix, a render,
  // a note) is not.
  const watched = Stream.mergeAll(
    [...spec.sources, path.resolve(import.meta.dir, '..')].map((dir) =>
      fs.watch(dir, { recursive: true }).pipe(
        Stream.map((event) => path.resolve(dir, event.path)),
        Stream.catch((error) =>
          Stream.fromEffect(
            Effect.logWarning(`lab.page.watch.failed dir=${dir} ${error.message}`),
          ).pipe(Stream.drain),
        ),
      ),
    ),
    { concurrency: 'unbounded' },
  );
  yield* watched.pipe(
    Stream.runForEach((file) =>
      Effect.flatMap(Ref.get(read), (inputs) =>
        Effect.when(
          SubscriptionRef.update(changes, (n) => n + 1),
          Effect.succeed(
            Option.match(inputs, { onNone: () => true, onSome: (set) => set.has(file) }),
          ),
        ),
      ),
    ),
    Effect.forkScoped,
  );

  const wait = (since: number, timeout: Duration.Input): Effect.Effect<PageBuild> =>
    SubscriptionRef.changes(changes).pipe(
      Stream.filter((n) => n > since),
      Stream.runHead,
      Effect.andThen(Effect.sleep(SETTLE)),
      Effect.andThen(SubscriptionRef.get(changes)),
      Effect.timeoutOption(Duration.min(Duration.fromInputUnsafe(timeout), MAX_WAIT)),
      Effect.flatMap(
        Option.match({ onNone: () => SubscriptionRef.get(changes), onSome: Effect.succeed }),
      ),
      Effect.map((build) => ({ build })),
    );

  /** A page's HTML as the sources stand, built now if they changed: asked again each load. */
  const page = (name: PageName) =>
    Effect.gen(function* () {
      const built = yield* current;
      if (built.outcome._tag === 'Failed')
        return HttpServerResponse.text(failedPage(built.outcome.reason, built.build), {
          status: 500,
          contentType: HTML,
          headers: { 'cache-control': 'no-store' },
        });
      const html = Option.fromUndefinedOr(built.outcome.pages.get(name));
      if (Option.isNone(html)) return NOT_FOUND;
      return HttpServerResponse.text(
        stamped(new TextDecoder().decode(html.value.bytes), built.build),
        { contentType: HTML, headers: { 'cache-control': 'no-store' } },
      );
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

  // A narration file by its exact URL, then a built file, then the page the
  // path serves (`PAGE_PATHS`); anything else, a chunk of a build no longer
  // kept among them, is a 404 and never a page's HTML.
  const answer = Effect.gen(function* () {
    const request = yield* HttpServerRequest.HttpServerRequest;
    const pathname = new URL(request.url, 'http://lab').pathname;
    if (isNarrationUrl(pathname)) return yield* narration(request, pathname);
    const built = yield* asset(pathname);
    if (Option.isSome(built)) return built.value;
    return yield* Option.match(pageAt(pathname), {
      onNone: () => Effect.succeed(NOT_FOUND),
      onSome: page,
    });
  });

  return LabPage.of({ answer, wait });
});
