// A build's render worker as the lab speaks to it (`page-render-protocol.ts`),
// the real worker over entries written to a folder of its own: a render the
// lab cancels while its server entry is still loading never starts, so once
// the entry has loaded it sends no head and makes no read.

import { BunServices, BunWorker } from '@effect/platform-bun';
import { describe, expect, it } from 'effect-bun-test';
import { Deferred, Effect, Exit, FileSystem, Layer, Path, Queue, Random } from 'effect';
import * as Worker from 'effect/workers/Worker';
import { type FromRender, ToRender } from './page-render-protocol.ts';

const Services = BunWorker.layer(
  () => new globalThis.Worker(new URL('./page-render-worker.ts', import.meta.url)),
).pipe(Layer.provideMerge(BunServices.layer));

const URL_ASKED = 'http://127.0.0.1:8229/films/toy/choices';

/**
 * A server entry that loads only once `gate` opens: it says `loading` on the
 * gate's channel and waits for `open`. Its page heads with whether its signal
 * is aborted, and reads the lab's API.
 */
const gatedEntry = (gate: string) => `
const channel = new BroadcastChannel('${gate}');
await new Promise((open) => {
  channel.onmessage = (event) => {
    if (event.data !== 'open') return;
    channel.close();
    open();
  };
  channel.postMessage('loading');
});
export default {
  bodyClass: 'gated',
  render: ({ url, fetch, signal }, sink) => {
    sink.head('aborted=' + signal.aborted);
    fetch(new URL('/api/after-load', url)).catch(() => undefined);
  },
};
`;

/** A server entry whose page heads and ends at once. */
const FAST_ENTRY = `
export default {
  bodyClass: 'fast',
  render: (_request, sink) => {
    sink.head('');
    sink.end();
  },
};
`;

describe("a build's render worker", () => {
  it.live(
    'a render cancelled while its server entry loads never starts: no head and no read once the entry has loaded',
    () =>
      Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem;
        const path = yield* Path.Path;
        const dir = yield* fs.makeTempDirectoryScoped({ prefix: 'render-worker-test-' });
        const gate = `render-worker-gate-${(yield* Random.nextIntBetween(0, 36 ** 6)).toString(36)}`;
        const gated = path.join(dir, 'gated.js');
        const fast = path.join(dir, 'fast.js');
        yield* fs.writeFileString(gated, gatedEntry(gate));
        yield* fs.writeFileString(fast, FAST_ENTRY);

        const loading = yield* Deferred.make<void>();
        const channel = yield* Effect.acquireRelease(
          Effect.sync(() => new BroadcastChannel(gate)),
          (opened) => Effect.sync(() => opened.close()),
        );
        channel.addEventListener('message', (event) => {
          if (event.data === 'loading') Deferred.doneUnsafe(loading, Exit.void);
        });

        const platform = yield* Worker.WorkerPlatform;
        const worker = yield* platform.spawn<FromRender, ToRender>(1);
        const heard: Array<FromRender> = [];
        const coming = yield* Queue.unbounded<FromRender>();
        yield* worker
          .run((message) => {
            heard.push(message);
            return Queue.offer(coming, message);
          })
          .pipe(Effect.forkScoped);
        /** Waits for render `id`'s message tagged `tag`. */
        const heardFrom = (id: number, tag: FromRender['_tag']) =>
          Effect.gen(function* () {
            while (true) {
              const message = yield* Queue.take(coming);
              if (message.id === id && message._tag === tag) return message;
            }
          });

        yield* worker.send(ToRender.Render({ id: 1, module: gated, url: URL_ASKED }));
        yield* Deferred.await(loading);
        yield* worker.send(ToRender.Cancel({ id: 1 }));
        // The worker takes its messages in order: once a later render has
        // ended, the cancel was taken.
        yield* worker.send(ToRender.Render({ id: 3, module: fast, url: URL_ASKED }));
        yield* heardFrom(3, 'End');

        channel.postMessage('open');
        // The same entry, rendered again: its load is the one the cancelled
        // render waited on, so its head comes after anything that render did.
        yield* worker.send(ToRender.Render({ id: 2, module: gated, url: URL_ASKED }));
        const head = yield* heardFrom(2, 'Head');
        expect(head).toEqual(expect.objectContaining({ html: 'aborted=false' }));
        expect(heard.filter((message) => message.id === 1)).toEqual([]);
        yield* worker.send(ToRender.Cancel({ id: 2 }));
      }).pipe(Effect.scoped, Effect.provide(Services)),
  );
});
