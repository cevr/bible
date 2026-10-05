// A build's render worker (`page-render.ts`): one per build, so the build's
// server bundle is imported fresh and gone with the worker (Bun keeps a
// module it imported for the life of its thread, so the lab's own thread
// never imports one). Each `Render` imports the page's server entry (once
// per worker) and runs its `PageRender` at the URL asked, its writes sent on
// as they come; the render's fetch sends each GET to the lab as a `Read` and
// waits for its `Answer`, and refuses any other method, as a render only
// reads. A `Cancel` aborts a render whose request is gone.

import { BunWorkerRunner } from '@effect/platform-bun';
import { Deferred, Effect, Option, Predicate, Schema } from 'effect';
import * as WorkerRunner from 'effect/workers/WorkerRunner';
import type { PageRender, PageSink } from '../core/page-render.ts';
import { FromRender, ToRender } from './page-render-protocol.ts';

/** Whether a server entry's default export is a page's render. */
const isPageRender = (value: unknown): value is PageRender =>
  Predicate.hasProperty(value, 'render') &&
  Predicate.isFunction(value.render) &&
  Predicate.hasProperty(value, 'bodyClass') &&
  Predicate.isString(value.bodyClass);

/** The statuses whose answer has no body: a `Response` refuses one. */
const BODILESS: ReadonlyArray<number> = [101, 204, 205, 304];

/** A read's answer as the render's fetch resolves it. */
const responseOf = (answer: ToRender & { readonly _tag: 'Answer' }): Response => {
  const headers = new Headers();
  for (const [name, value] of answer.headers) headers.append(name, value);
  const init = { status: answer.status, headers };
  // oxlint-disable-next-line effect/noNullish -- the web's Response takes null for an answer with no body
  if (BODILESS.includes(answer.status)) return new Response(null, init);
  return new Response(new Blob([new Uint8Array(answer.body)]), init);
};

/** A page's server entry, imported in this worker (once: a module is kept for the thread's life). */
const serverEntry = (module: string): Promise<unknown> => import(module);

/** A render's fetch refused: it asked for more than a read. */
class NotARead extends Schema.TaggedError<NotARead>()('NotARead', { message: Schema.String }) {}

const serve = Effect.gen(function* () {
  const runner = yield* (yield* WorkerRunner.WorkerRunnerPlatform).start<FromRender, ToRender>();
  const send = (message: FromRender) => runner.sendUnsafe(0, message);
  const renders = new Map<number, AbortController>();
  const reads = new Map<number, Deferred.Deferred<Response>>();
  const services = yield* Effect.context<never>();
  let readsMade = 0;

  /** Render `id`'s fetch: a GET read through the lab, anything else refused. */
  const fetchOf = (id: number): typeof globalThis.fetch => {
    const read = (input: RequestInfo | URL, init?: RequestInit) =>
      Effect.runPromiseWith(services)(
        Effect.gen(function* () {
          const request = new Request(input, init);
          if (request.method !== 'GET')
            return yield* NotARead.make({
              message: `a page's render only reads: ${request.method} ${request.url}`,
            });
          readsMade += 1;
          const made = readsMade;
          const answered = yield* Deferred.make<Response>();
          reads.set(made, answered);
          const url = new URL(request.url);
          send(FromRender.Read({ id, read: made, path: `${url.pathname}${url.search}` }));
          return yield* Deferred.await(answered);
        }),
      );
    return Object.assign(read, { preconnect: globalThis.fetch.preconnect });
  };

  /** Render the page `message` asks for, its writes sent on; a failure is its `Failed`. */
  const render = (message: ToRender & { readonly _tag: 'Render' }) => {
    const { id } = message;
    const failed = (reason: string) =>
      Effect.sync(() => {
        renders.delete(id);
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
          renders.delete(id);
          send(FromRender.End({ id }));
        },
        fail: (reason) => {
          renders.delete(id);
          send(FromRender.Failed({ id, reason }));
        },
      };
      yield* Effect.try({
        try: () =>
          page.render({ url: message.url, fetch: fetchOf(id), signal: controller.signal }, sink),
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
          renders.delete(id);
        }),
      Answer: (answer) =>
        Option.match(Option.fromUndefinedOr(reads.get(answer.read)), {
          onNone: () => Effect.void,
          onSome: (answered) => {
            reads.delete(answer.read);
            return Deferred.succeed(answered, responseOf(answer));
          },
        }),
    }),
  );
});

Effect.runFork(serve.pipe(Effect.provide(BunWorkerRunner.layer)));
