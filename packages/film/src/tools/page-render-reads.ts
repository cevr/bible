// A build's render worker's reads of the lab (`page-render-worker.ts`): each
// render's fetch sends a GET to the lab as a `Read` and waits for its
// `Answer`, and refuses any other method, as a render only reads. A render
// owns its reads: once it is over (ended, failed or cancelled), each read it
// still waits on is aborted and dropped, as is one whose fetch's own signal
// aborts, and an answer that comes after is no one's.

import { Deferred, Effect, Option, Schema } from 'effect';
import { FromRender, type ToRender } from './page-render-protocol.ts';

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

/** A render's fetch refused: it asked for more than a read. */
class NotARead extends Schema.TaggedError<NotARead>()('NotARead', { message: Schema.String }) {}

/** Fails with `signal`'s reason once it aborts. */
const abortedBy = (signal: AbortSignal) =>
  Effect.callback<never, unknown>((resume) => {
    const aborted = () => resume(Effect.fail(signal.reason));
    signal.addEventListener('abort', aborted, { once: true });
    return Effect.sync(() => signal.removeEventListener('abort', aborted));
  });

/** The renders' reads, sent through `send`. */
interface RenderReads {
  /** Render `id`'s fetch: a GET read through the lab, anything else refused. */
  readonly open: (id: number) => typeof globalThis.fetch;
  /** Render `id` is over: its end, its failure or its cancel. */
  readonly close: (id: number) => void;
  /** The lab's answer to a read: resolves the read's fetch. */
  readonly answer: (answer: ToRender & { readonly _tag: 'Answer' }) => Effect.Effect<void>;
  /** How many reads render `id` waits on. */
  readonly held: (id: number) => number;
}

export const renderReads = (send: (message: FromRender) => void): RenderReads => {
  const reads = new Map<
    number,
    { readonly render: number; readonly answered: Deferred.Deferred<Response> }
  >();
  /** Each open render's reads, aborted together when it is over. */
  const renders = new Map<number, AbortController>();
  let readsMade = 0;

  /** Render `id`'s read of `request`, held (in `reads`) until answered or interrupted. */
  const readOf = (id: number, request: Request) =>
    Effect.gen(function* () {
      if (request.method !== 'GET')
        return yield* NotARead.make({
          message: `a page's render only reads: ${request.method} ${request.url}`,
        });
      readsMade += 1;
      const made = readsMade;
      const answered = yield* Deferred.make<Response>();
      reads.set(made, { render: id, answered });
      const url = new URL(request.url);
      send(FromRender.Read({ id, read: made, path: `${url.pathname}${url.search}` }));
      return yield* Deferred.await(answered).pipe(
        Effect.ensuring(Effect.sync(() => reads.delete(made))),
      );
    });

  const open = (id: number): typeof globalThis.fetch => {
    const over = new AbortController();
    renders.set(id, over);
    const read = (input: RequestInfo | URL, init?: RequestInit) => {
      const request = new Request(input, init);
      // Over when the render is, or when the fetch's own signal aborts: the
      // fetch then fails with the signal's reason, as the web's fetch does.
      const signal = AbortSignal.any([over.signal, request.signal]);
      return Effect.runPromise(
        Effect.gen(function* () {
          if (signal.aborted) return yield* Effect.fail(signal.reason);
          return yield* readOf(id, request).pipe(Effect.raceFirst(abortedBy(signal)));
        }),
      );
    };
    return Object.assign(read, { preconnect: globalThis.fetch.preconnect });
  };

  return {
    open,
    close: (id) => {
      Option.map(Option.fromUndefinedOr(renders.get(id)), (over) => over.abort());
      renders.delete(id);
    },
    answer: (answer) =>
      Option.match(Option.fromUndefinedOr(reads.get(answer.read)), {
        onNone: () => Effect.void,
        onSome: ({ answered }) => {
          reads.delete(answer.read);
          return Deferred.succeed(answered, responseOf(answer));
        },
      }),
    held: (id) => [...reads.values()].filter((read) => read.render === id).length,
  };
};
