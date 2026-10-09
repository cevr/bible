// The server's render of the lab's pages. A page with a server entry
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
  Equal,
  Exit,
  Hash,
  FiberMap,
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
import { LONGEST_WAIT, type PageName } from '../core/api.ts';
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

/**
 * A read of the lab's API by a page's render: the GET of `path`, answered as
 * the page's own request would be (the lab's server gives it, `PageReads`).
 */
type Read = (path: string) => Effect.Effect<Response>;

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
   * head is written (or `HEAD_WAIT` passes, a failure). Its markup fails
   * once `END_WAIT` passes after the head. The render holds its build's
   * worker until the scope closes; closed before its markup ends, the render
   * is stopped.
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

/**
 * How long a render may go on after its head before it is cut: the longest a
 * lab request is held (`LONGEST_WAIT`), so a read the lab answers in that time
 * is rendered, and a few seconds to render its answer. The lab ends a cut
 * page marked (`PAGE_CUT_MARK`), and the browser renders that page anew (a
 * read the lab never answers would otherwise hold the page unhydrated).
 */
export const END_WAIT = Duration.sum(Duration.seconds(LONGEST_WAIT), Duration.seconds(5));

/**
 * A render under way: the worker's messages for it, its reads, and the
 * fiber answering each read by its number (interrupted when the render gives
 * the read up, and all of them when it closes).
 */
interface Pending {
  readonly parts: Queue.Queue<FromRender>;
  readonly read: Read;
  readonly answering: FiberMap.FiberMap<number, void>;
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
    ReadCancelled: () => Effect.succeed(''),
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

  /** `answer` sent back to the render; a send that fails is logged, the render ends without it. */
  const sendAnswer = (path: string, answer: ToRender) =>
    worker
      .send(answer)
      .pipe(
        Effect.catch((error) =>
          Effect.logWarning(`lab.render.read.failed build=${build} path=${path} ${error.message}`),
        ),
      );

  /**
   * A read of the render's, answered and sent back. A read the lab cannot
   * answer (its handler died, its body would not read) is answered a 502
   * with the reason, so the render's fetch always settles; one given up
   * (interrupted) is answered nothing, as the render no longer waits.
   */
  const answer = (render: Pending, asked: FromRender & { readonly _tag: 'Read' }) =>
    Effect.gen(function* () {
      const response = yield* render.read(asked.path);
      const body = new Uint8Array(yield* Effect.promise(() => response.arrayBuffer()));
      yield* Effect.logDebug(
        `lab.render.read build=${build} path=${asked.path} status=${response.status}`,
      );
      return ToRender.Answer({
        read: asked.read,
        status: response.status,
        headers: [...response.headers],
        body,
      });
    }).pipe(
      Effect.catchCause((cause) => {
        if (Cause.hasInterruptsOnly(cause)) return Effect.failCause(cause);
        const reason = String(Cause.squash(cause));
        return Effect.as(
          Effect.logWarning(
            `lab.render.read.failed build=${build} path=${asked.path} reason="${reason}"`,
          ),
          ToRender.Answer({
            read: asked.read,
            status: 502,
            headers: [['content-type', 'text/plain;charset=utf-8']],
            body: new TextEncoder().encode(reason),
          }),
        );
      }),
      Effect.flatMap((answered) => sendAnswer(asked.path, answered)),
    );

  /**
   * A message of the worker's, to the render it names (a render already gone
   * hears nothing). A read is answered in a fiber of the render's, kept by
   * the read's number: it ends when the render gives the read up (its
   * handler interrupted, its request aborted), or when the render ends.
   */
  const deliver = (message: FromRender): Effect.Effect<void> =>
    Option.match(Option.fromUndefinedOr(pending.get(message.id)), {
      onNone: () => Effect.void,
      onSome: (render) => {
        if (message._tag === 'Read')
          return Effect.asVoid(
            FiberMap.run(render.answering, message.read, answer(render, message)),
          );
        if (message._tag === 'ReadCancelled')
          return FiberMap.remove(render.answering, message.read);
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
      const answering = yield* FiberMap.make<number, void>();
      pending.set(id, { parts, read, answering });
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
        // Cut, not ended: the render is stopped (`Cancel`) as its scope closes.
        Stream.interruptWhen(
          Effect.andThen(
            Effect.sleep(END_WAIT),
            Effect.fail(failed(`no end in ${Duration.format(END_WAIT)} after its head`)),
          ),
        ),
      );
      return { head: first.html, bodyClass: first.bodyClass, markup } satisfies RenderedPage;
    });

  return {
    render,
    alive: Effect.map(Deferred.isDone(gone), (done) => !done),
  } satisfies BuildWorker;
});

/**
 * A build as its worker is kept by (`RcMap`): one worker per build number,
 * the build's bundle carried for the worker's spawn.
 */
class WorkerOf implements Equal.Equal {
  constructor(readonly build: RenderBuild) {}
  [Equal.symbol](that: Equal.Equal): boolean {
    return that instanceof WorkerOf && that.build.id === this.build.id;
  }
  [Hash.symbol](): number {
    return Hash.number(this.build.id);
  }
}

/** The renderer over the worker platform: a worker per build, the latest one kept. */
const make = Effect.gen(function* () {
  const workers = yield* RcMap.make({
    lookup: ({ build }: WorkerOf) =>
      Effect.andThen(
        Effect.addFinalizer(() => Effect.log(`lab.render.worker.retired build=${build.id}`)),
        spawnWorker(build.id, build.bundle).pipe(
          Effect.mapError((error) => RenderFailed.make({ reason: error.message })),
        ),
      ),
    idleTimeToLive: Duration.infinity,
  });
  const latest = yield* Ref.make(Option.none<RenderBuild>());

  /** `build` the latest to render, when it is newer: the build it follows is retired once its renders end. */
  const follow = (build: RenderBuild) =>
    Effect.flatMap(
      Ref.modify(latest, (before): [Option.Option<RenderBuild>, Option.Option<RenderBuild>] => {
        if (Option.exists(before, (b) => b.id >= build.id)) return [Option.none(), before];
        return [before, Option.some(build)];
      }),
      (old) =>
        Effect.forEach(Option.toArray(old), (o) => RcMap.invalidate(workers, new WorkerOf(o))),
    );

  /**
   * `build`'s worker, just acquired, retired once its renders end when a
   * newer build has rendered: a request that named an older build, answered
   * after a newer one rendered, ends with that build's worker. Checked after
   * the acquisition, so whichever comes first (the newer build's render, or
   * this one's), no older worker outlives its last render.
   */
  const retireIfOlder = (build: RenderBuild) =>
    Effect.flatMap(Ref.get(latest), (now) =>
      Effect.when(
        RcMap.invalidate(workers, new WorkerOf(build)),
        Effect.succeed(Option.exists(now, (n) => n.id > build.id)),
      ),
    );

  /**
   * `build`'s worker: one that failed to spawn is not kept (RcMap keeps a
   * failed lookup for every later ask), so the next render spawns again.
   */
  const acquire = (build: RenderBuild) =>
    RcMap.get(workers, new WorkerOf(build)).pipe(
      Effect.tapError(() => RcMap.invalidate(workers, new WorkerOf(build))),
    );

  /** `build`'s worker, running: one that stopped is spawned again. */
  const workerOf = (build: RenderBuild): Effect.Effect<BuildWorker, RenderFailed, Scope.Scope> =>
    Effect.gen(function* () {
      const worker = yield* acquire(build);
      if (yield* worker.alive) return worker;
      yield* RcMap.invalidate(workers, new WorkerOf(build));
      return yield* acquire(build);
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
        yield* follow(build);
        const worker = yield* workerOf(build);
        yield* retireIfOlder(build);
        return yield* worker.render(entry, url, read);
      }),
  });
});
