// A build's render worker (`page-render.ts`): one per build, so the build's
// server bundle is imported fresh and gone with the worker (Bun keeps a
// module it imported for the life of its thread, so the lab's own thread
// never imports one). Each `Render` imports the page's server entry (once
// per worker) and runs its `PageRender` at the URL asked, its writes sent on
// as they come; the render's fetch sends each GET to the lab as a `Read` and
// waits for its `Answer` (`page-render-reads.ts`). A `Cancel` aborts a render
// whose request is gone, and a render over (ended, failed or cancelled)
// aborts each read it still waits on.

import { BunWorkerRunner } from '@effect/platform-bun';
import { Effect, Option } from 'effect';
import * as WorkerRunner from 'effect/workers/WorkerRunner';
import { type PageSink, isPageRender } from '../core/page-render.ts';
import { FromRender, ToRender } from './page-render-protocol.ts';
import { renderReads } from './page-render-reads.ts';

/** A page's server entry, imported in this worker (once: a module is kept for the thread's life). */
const serverEntry = (module: string): Promise<unknown> => import(module);

const serve = Effect.gen(function* () {
  const runner = yield* (yield* WorkerRunner.WorkerRunnerPlatform).start<FromRender, ToRender>();
  const send = (message: FromRender) => runner.sendUnsafe(0, message);
  const renders = new Map<number, AbortController>();
  const reads = renderReads(send);

  /** Render `id` is over: forgotten, and its reads still waiting aborted. */
  const over = (id: number) => {
    renders.delete(id);
    reads.close(id);
  };

  /** Render the page `message` asks for, its writes sent on; a failure is its `Failed`. */
  const render = (message: ToRender & { readonly _tag: 'Render' }) => {
    const { id } = message;
    const failed = (reason: string) =>
      Effect.sync(() => {
        over(id);
        send(FromRender.Failed({ id, reason }));
      });
    return Effect.gen(function* () {
      const loaded = yield* Effect.tryPromise({
        try: () => serverEntry(message.module),
        catch: (cause) => `the page's server entry did not load: ${String(cause)}`,
      });
      const page: unknown = Reflect.get(Object(loaded), 'default');
      if (!isPageRender(page))
        return yield* Effect.fail("the page's server entry exports no PageRender as its default");
      const controller = new AbortController();
      renders.set(id, controller);
      let headed = false;
      const head = (html: string) => {
        if (headed) return;
        headed = true;
        send(FromRender.Head({ id, html, bodyClass: page.bodyClass }));
      };
      const sink: PageSink = {
        head,
        write: (html) => {
          head('');
          send(FromRender.Chunk({ id, html }));
        },
        end: () => {
          head('');
          over(id);
          send(FromRender.End({ id }));
        },
        fail: (reason) => {
          over(id);
          send(FromRender.Failed({ id, reason }));
        },
      };
      yield* Effect.try({
        try: () =>
          page.render({ url: message.url, fetch: reads.open(id), signal: controller.signal }, sink),
        catch: (cause) => `the page's render threw: ${String(cause)}`,
      });
    }).pipe(Effect.catch(failed));
  };

  return yield* runner.run((_port, message: ToRender) =>
    ToRender.$match(message, {
      Render: render,
      Cancel: ({ id }) =>
        Effect.sync(() => {
          Option.map(Option.fromUndefinedOr(renders.get(id)), (render) => render.abort());
          over(id);
        }),
      Answer: reads.answer,
    }),
  );
});

Effect.runFork(serve.pipe(Effect.provide(BunWorkerRunner.layer)));
