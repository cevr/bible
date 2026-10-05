// A build's render worker (`page-render.ts`): one per build, so the build's
// server bundle is imported fresh and gone with the worker (Bun keeps a
// module it imported for the life of its thread, so the lab's own thread
// never imports one). Each `Render` imports the page's server entry (once
// per worker) and runs its `PageRender` at the URL asked, its writes sent on
// as they come; the render's fetch sends each GET to the lab as a `Read` and
// waits for its `Answer` (`page-render-reads.ts`). A render is a fiber from
// its `Render` on, so a `Cancel` stops it wherever it is: still loading its
// entry (it then never starts), or rendering (its signal aborts). A render
// over (ended, failed or cancelled) aborts each read it still waits on and
// says nothing more.

import { BunWorkerRunner } from '@effect/platform-bun';
import { Deferred, Effect, Exit, FiberMap } from 'effect';
import * as WorkerRunner from 'effect/workers/WorkerRunner';
import { type PageSink, isPageRender } from '../core/page-render.ts';
import { FromRender, ToRender } from './page-render-protocol.ts';
import { renderReads } from './page-render-reads.ts';

/** A page's server entry, imported in this worker (once: a module is kept for the thread's life). */
const serverEntry = (module: string): Promise<unknown> => import(module);

const serve = Effect.gen(function* () {
  const runner = yield* (yield* WorkerRunner.WorkerRunnerPlatform).start<FromRender, ToRender>();
  const send = (message: FromRender) => runner.sendUnsafe(0, message);
  const reads = renderReads(send);
  /** Each render under way, by its id, from its `Render` until it is over. */
  const renders = yield* FiberMap.make<number>();

  /**
   * Render the page `message` asks for, its writes sent on, until it ends or
   * fails (its `Failed`). Interrupted (a `Cancel`), it stops where it is: a
   * render whose entry is still loading opens no read and never renders, and
   * one rendering has its signal aborted.
   */
  const render = (message: ToRender & { readonly _tag: 'Render' }) => {
    const { id } = message;
    return Effect.gen(function* () {
      // The render's own, before anything is loaded: once it is over its
      // reads are aborted and its sink is shut, and a cancel aborts its signal.
      const live = yield* Effect.acquireRelease(
        Effect.sync(() => ({ controller: new AbortController(), open: true })),
        (owned, exit) =>
          Effect.sync(() => {
            owned.open = false;
            if (Exit.hasInterrupts(exit)) owned.controller.abort();
            reads.close(id);
          }),
      );
      const loaded = yield* Effect.tryPromise({
        try: () => serverEntry(message.module),
        catch: (cause) => `the page's server entry did not load: ${String(cause)}`,
      });
      const page: unknown = Reflect.get(Object(loaded), 'default');
      if (!isPageRender(page))
        return yield* Effect.fail("the page's server entry exports no PageRender as its default");
      const over = yield* Deferred.make<void, string>();
      /** `said` sent while the render is live; a render over says nothing more. */
      const say = (said: FromRender) => {
        if (live.open) send(said);
      };
      let headed = false;
      const head = (html: string) => {
        if (headed) return;
        headed = true;
        say(FromRender.Head({ id, html, bodyClass: page.bodyClass }));
      };
      const sink: PageSink = {
        head,
        write: (html) => {
          head('');
          say(FromRender.Chunk({ id, html }));
        },
        end: () => {
          head('');
          say(FromRender.End({ id }));
          Deferred.doneUnsafe(over, Exit.void);
        },
        fail: (reason) => Deferred.doneUnsafe(over, Exit.fail(reason)),
      };
      yield* Effect.try({
        try: () =>
          page.render(
            { url: message.url, fetch: reads.open(id), signal: live.controller.signal },
            sink,
          ),
        catch: (cause) => `the page's render threw: ${String(cause)}`,
      });
      yield* Deferred.await(over);
    }).pipe(
      Effect.scoped,
      Effect.catch((reason) => Effect.sync(() => send(FromRender.Failed({ id, reason })))),
    );
  };

  return yield* runner.run((_port, message: ToRender) =>
    ToRender.$match(message, {
      Render: (asked) => Effect.asVoid(FiberMap.run(renders, asked.id, render(asked))),
      Cancel: ({ id }) => FiberMap.remove(renders, id),
      Answer: reads.answer,
    }),
  );
});

Effect.runFork(serve.pipe(Effect.scoped, Effect.provide(BunWorkerRunner.layer)));
