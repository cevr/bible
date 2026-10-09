// The page's media loads the WebCodecs decoders (mediabunny, most of the review
// page's bytes) only where the panes are chosen: its entry chunk, bundled for
// the browser with splitting as the lab's pages are, reaches none of it, and
// the panes' module is a chunk of its own.

import { expect, it } from 'effect-bun-test';
import { Effect, Layer, Stream } from 'effect';
import { Frames } from './frames.ts';
import { PANES_NOT_LOADED } from './media-choice.ts';
import { panesMediaLayerWith } from './media-browser.ts';
import { Media } from './media.ts';
import { Viewport } from './viewport.ts';

/** A desk's window (no coarse pointer) and a panes module whose chunk is gone. */
const desk = Layer.succeed(
  Viewport,
  Viewport.of({ matches: () => Effect.succeed(false), changes: () => Stream.empty }),
);
const media = Layer.provide(
  // oxlint-disable-next-line effect/noNewPromise, effect/noNewError -- a chunk that 404s rejects the import() promise
  panesMediaLayerWith(() => Promise.reject(new Error('chunk 404'))),
  Layer.merge(Frames.layerClock, desk),
);

it.effect('a panes module that will not load plays on <video>, saying so', () =>
  Effect.gen(function* () {
    const hadDecoder = 'VideoDecoder' in globalThis;
    Reflect.set(globalThis, 'VideoDecoder', {});
    const compare = yield* Media.use((m) => m.compare(['https://lab.test/a.mp4'])).pipe(
      Effect.ensuring(
        Effect.sync(() => {
          if (!hadDecoder) Reflect.deleteProperty(globalThis, 'VideoDecoder');
        }),
      ),
      Effect.scoped,
    );
    expect(compare.engine).toEqual({ engine: 'video', why: PANES_NOT_LOADED });
  }).pipe(Effect.provide(media)),
);

const MEDIABUNNY = /node_modules\/(\.bun\/)?[^/]*mediabunny/;

it.effect('mediabunny is a lazy chunk of the page media, not part of its entry', () =>
  Effect.gen(function* () {
    const out = yield* Effect.promise(() =>
      Bun.build({
        entrypoints: [new URL('./media-browser.ts', import.meta.url).pathname],
        target: 'browser',
        splitting: true,
        metafile: true,
        throw: true,
      }),
    );
    const outputs = Object.entries(out.metafile?.outputs ?? {});
    const holders = outputs.filter(([, o]) =>
      Object.keys(o.inputs).some((input) => MEDIABUNNY.test(input)),
    );
    const entry = outputs.filter(([, o]) => o.entryPoint?.endsWith('browser/media-browser.ts'));
    expect(holders.length).toBeGreaterThan(0);
    expect(entry.length).toBe(1);
    expect(holders.map(([name]) => name)).not.toContain(entry[0]?.[0]);
  }),
);
