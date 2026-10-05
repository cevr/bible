// The server's render of the lab's pages (PA-12). A page with a server entry
// (`LabPageSpec.servers`) is rendered by its build's server bundle, which
// `LabPage` builds beside the browser's from the same sources. Each build's
// bundle runs in a worker of its own: written to a temp folder of the
// build's, imported there and nowhere else, so the lab's own thread never
// imports a page's code (Bun keeps a module for the life of its thread) and
// a build's modules go when its worker does. A worker is spawned on its
// build's first render; once a newer build renders, the older one's worker
// is retired as soon as its last render ends (a reference count). A render's
// reads of the lab's API come back to the lab (`PageReads`): answered by the
// lab's own handler as the page's request would be, so they pass the one
// gate and the same handlers. Bun is the only host: the live adapter is
// Effect's `BunWorker`; `layerTest` renders without one.

import { BunWorker } from '@effect/platform-bun';
import {
  Cause,
  Context,
  Deferred,
  Duration,
  Effect,
  Exit,
  FileSystem,
  Layer,
  Option,
  Path,
  Predicate,
  Queue,
  RcMap,
  Ref,
  Schema,
  type Scope,
  Stream,
} from 'effect';
import * as Worker from 'effect/workers/Worker';
import type { PageName } from '../core/api.ts';
import { FromRender, ToRender } from './page-render-protocol.ts';

/** A module of a build's server bundle, at its path under the build's root. */
interface BundledModule {
  readonly path: string;
  readonly bytes: Uint8Array;
}

/** A build's server bundle: its modules, and each server-rendered page's entry among them. */
export interface ServerBundle {
  readonly files: ReadonlyArray<BundledModule>;
  readonly entries: ReadonlyMap<PageName, string>;
}

/** A build as a render names it: its number among the builds, and its server bundle. */
export interface RenderBuild {
  readonly id: number;
  readonly bundle: ServerBundle;
}

/** A page did not render: its server entry, its worker or its render failed, in their words. */
export class RenderFailed extends Schema.TaggedError<RenderFailed>()('RenderFailed', {
  reason: Schema.String,
}) {}

/** A read of the lab's API by a page's render: the GET of `path`, answered as the page's own request would be. */
type Read = (path: string) => Effect.Effect<Response>;

/**
 * The reads a page's render makes of the lab's API, for the page being
 * answered: the lab's server gives them (`serveApi`), each a GET through its
 * own handler with the page's Host, so the gate admits it as it admitted the
 * page.
 */
export class PageReads extends Context.Service<PageReads, { readonly read: Read }>()(
  '@bible/film/tools/PageReads',
) {}

/** A page as its render writes it. */
export interface RenderedPage {
  /** What the page's head holds beside its HTML entry's. */
  readonly head: string;
  /** The class the page's body carries. */
  readonly bodyClass: string;
  /** The page's markup, piece by piece; it fails, past what it wrote, when the render does. */
  readonly markup: Stream.Stream<string, RenderFailed>;
}

interface PageRendererService {
  /**
   * `page` of `build` rendered at `url`, its reads through `read`: once its
   * head is written (or `HEAD_WAIT` passes, a failure). The render holds its
   * build's worker until the scope closes; closed before its markup ends,
   * the render is stopped.
   */
  readonly render: (
    build: RenderBuild,
    page: PageName,
    url: string,
    read: Read,
  ) => Effect.Effect<RenderedPage, RenderFailed, Scope.Scope>;
}

export class PageRenderer extends Context.Service<PageRenderer, PageRendererService>()(
  '@bible/film/tools/PageRenderer',
) {
  /** Each build's pages rendered in a Bun worker of the build's. */
  static readonly layer: Layer.Layer<PageRenderer, never, FileSystem.FileSystem | Path.Path> =
    Layer.effect(
      PageRenderer,
      Effect.suspend(() => make),
    ).pipe(Layer.provide(BunWorker.layer(() => new globalThis.Worker(WORKER))));

  /**
   * Pages rendered with no worker, for tests of what serves them: a page's
   * head names it, its body's class is `rendered`, and its markup is a
   * `<main>` naming the page and the URL it was asked at.
   */
  static readonly layerTest: Layer.Layer<PageRenderer> = Layer.succeed(
    PageRenderer,
    PageRenderer.of({
      render: (_build, page, url) =>
        Effect.succeed({
          head: `<meta name="rendered" content="${page}">`,
          bodyClass: 'rendered',
          markup: Stream.make('<main>', `${page} at ${url}`, '</main>'),
        }),
    }),
  );
}

/** The worker's module: what each build's worker runs. */
const WORKER = new URL('./page-render-worker.ts', import.meta.url);

/** How long a render may take to write its head before the page is answered without it. */
const HEAD_WAIT = Duration.seconds(10);

/** A render under way: the worker's messages for it, and its reads. */
interface Pending {
  readonly parts: Queue.Queue<FromRender>;
  readonly read: Read;
}

/** A build's worker: its pages' renders, and whether it still runs. */
interface BuildWorker {
  readonly render: (
    entry: string,
    url: string,
    read: Read,
  ) => Effect.Effect<RenderedPage, RenderFailed, Scope.Scope>;
  readonly alive: Effect.Effect<boolean>;
}

/** A render's last message: its end, or its failure. */
const isLast = Predicate.or(Predicate.isTagged('End'), Predicate.isTagged('Failed'));

/** The worker's message, done with: a piece of markup, or the end; a failure fails the markup. */
const pieceOf = (part: FromRender): Effect.Effect<string, RenderFailed> =>
  FromRender.$match(part, {
    Head: () => Effect.succeed(''),
    Chunk: ({ html }) => Effect.succeed(html),
    End: () => Effect.succeed(''),
    Read: () => Effect.succeed(''),
    Failed: ({ reason }) => Effect.fail(RenderFailed.make({ reason })),
  });

/**
 * `build`'s worker over its server bundle, written to a temp folder of its
 * own: alive until the scope closes (its worker is then closed, its folder
 * removed).
 */
const spawnWorker = Effect.fnUntraced(function* (build: number, bundle: ServerBundle) {
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const platform = yield* Worker.WorkerPlatform;
  const dir = yield* fs.makeTempDirectoryScoped({ prefix: `lab-render-${build}-` });
  yield* Effect.forEach(
    bundle.files,
    (file) => {
      const at = path.join(dir, file.path);
      return Effect.andThen(
        fs.makeDirectory(path.dirname(at), { recursive: true }),
        fs.writeFile(at, file.bytes),
      );
    },
    { discard: true },
  );
  const worker = yield* platform.spawn<FromRender, ToRender>(build);
  const pending = new Map<number, Pending>();
  const gone = yield* Deferred.make<string>();
  let started = 0;

  /** A read of the render's, answered and sent back. */
  const answer = (render: Pending, asked: FromRender & { readonly _tag: 'Read' }) =>
    Effect.gen(function* () {
      const response = yield* render.read(asked.path);
      const body = new Uint8Array(yield* Effect.promise(() => response.arrayBuffer()));
      yield* Effect.logDebug(
        `lab.render.read build=${build} path=${asked.path} status=${response.status}`,
      );
      yield* worker.send(
        ToRender.Answer({
          read: asked.read,
          status: response.status,
          headers: [...response.headers],
          body,
        }),
      );
    }).pipe(
      Effect.catch((error) =>
        Effect.logWarning(
          `lab.render.read.failed build=${build} path=${asked.path} ${error.message}`,
        ),
      ),
    );

  /** A message of the worker's, to the render it names (a render already gone hears nothing). */
  const deliver = (message: FromRender): Effect.Effect<void> =>
    Option.match(Option.fromUndefinedOr(pending.get(message.id)), {
      onNone: () => Effect.void,
      onSome: (render) => {
        if (message._tag === 'Read') return answer(render, message);
        return Effect.asVoid(Queue.offer(render.parts, message));
      },
    });

  /** The worker stopped: every render under way fails, and so does each one after. */
  const stopped = (reason: string) =>
    Effect.andThen(
      Deferred.succeed(gone, reason),
      Effect.forEach(
        pending.entries(),
        ([id, render]) => Queue.offer(render.parts, FromRender.Failed({ id, reason })),
        { discard: true },
      ),
    );

  yield* worker.run(deliver).pipe(
    Effect.onExit((exit) =>
      Effect.andThen(
        Effect.when(
          Effect.logWarning(`lab.render.worker.failed build=${build}`, exit),
          Effect.succeed(Exit.isFailure(exit) && !Cause.hasInterruptsOnly(exit.cause)),
        ),
        stopped(`the render worker of build ${build} stopped`),
      ),
    ),
    Effect.forkScoped,
  );
  yield* Effect.log(`lab.render.worker.spawned build=${build} files=${bundle.files.length}`);

  const render = (entry: string, url: string, read: Read) =>
    Effect.gen(function* () {
      started += 1;
      const id = started;
      const parts = yield* Queue.unbounded<FromRender>();
      const ended = yield* Ref.make(false);
      pending.set(id, { parts, read });
      yield* Effect.addFinalizer(() =>
        Effect.gen(function* () {
          pending.delete(id);
          if (yield* Ref.get(ended)) return;
          yield* Effect.ignore(worker.send(ToRender.Cancel({ id })));
        }),
      );
      const failed = (reason: string) => RenderFailed.make({ reason });
      yield* worker
        .send(ToRender.Render({ id, module: path.join(dir, entry), url }))
        .pipe(Effect.mapError((error) => failed(error.message)));
      const first = yield* Queue.take(parts).pipe(
        Effect.raceFirst(
          Effect.flatMap(Deferred.await(gone), (reason) => Effect.fail(failed(reason))),
        ),
        Effect.timeoutOrElse({
          duration: HEAD_WAIT,
          orElse: () => Effect.fail(failed(`no head in ${Duration.format(HEAD_WAIT)}`)),
        }),
      );
      if (first._tag === 'Failed') return yield* failed(first.reason);
      if (first._tag !== 'Head') return yield* failed(`a render began with ${first._tag}`);
      const markup = Stream.fromQueue(parts).pipe(
        Stream.takeUntil(isLast),
        Stream.mapEffect((part) =>
          Effect.tap(pieceOf(part), () => Ref.set(ended, part._tag !== 'Chunk')),
        ),
        Stream.filter((piece) => piece.length > 0),
      );
      return { head: first.html, bodyClass: first.bodyClass, markup } satisfies RenderedPage;
    });

  return {
    render,
    alive: Effect.map(Deferred.isDone(gone), (done) => !done),
  } satisfies BuildWorker;
});

/** The renderer over the worker platform: a worker per build, the latest one kept. */
const make = Effect.gen(function* () {
  const bundles = new Map<number, ServerBundle>();
  const workers = yield* RcMap.make({
    lookup: (build: number) =>
      Effect.gen(function* () {
        const bundle = yield* Effect.fromOption(Option.fromUndefinedOr(bundles.get(build))).pipe(
          Effect.mapError(() =>
            RenderFailed.make({ reason: `build ${build} has no server bundle` }),
          ),
        );
        yield* Effect.addFinalizer(() =>
          Effect.andThen(
            Effect.sync(() => bundles.delete(build)),
            Effect.log(`lab.render.worker.retired build=${build}`),
          ),
        );
        return yield* spawnWorker(build, bundle).pipe(
          Effect.mapError((error) => RenderFailed.make({ reason: error.message })),
        );
      }),
    idleTimeToLive: Duration.infinity,
  });
  const latest = yield* Ref.make(Option.none<number>());

  /** `build` the latest to render: the build it follows is retired once its renders end. */
  const follow = (build: number) =>
    Effect.gen(function* () {
      const before = yield* Ref.get(latest);
      if (Option.exists(before, (b) => b >= build)) return;
      yield* Ref.set(latest, Option.some(build));
      yield* Effect.forEach(Option.toArray(before), (old) => RcMap.invalidate(workers, old));
    });

  /** `build`'s worker, running: one that stopped is spawned again. */
  const workerOf = (build: RenderBuild): Effect.Effect<BuildWorker, RenderFailed, Scope.Scope> =>
    Effect.gen(function* () {
      if (!bundles.has(build.id)) bundles.set(build.id, build.bundle);
      const worker = yield* RcMap.get(workers, build.id);
      if (yield* worker.alive) return worker;
      yield* RcMap.invalidate(workers, build.id);
      bundles.set(build.id, build.bundle);
      return yield* RcMap.get(workers, build.id);
    });

  return PageRenderer.of({
    render: (build, page, url, read) =>
      Effect.gen(function* () {
        const entry = yield* Effect.fromOption(
          Option.fromUndefinedOr(build.bundle.entries.get(page)),
        ).pipe(
          Effect.mapError(() =>
            RenderFailed.make({ reason: `build ${build.id} has no server entry for ${page}` }),
          ),
        );
        yield* follow(build.id);
        const worker = yield* workerOf(build);
        return yield* worker.render(entry, url, read);
      }),
  });
});
