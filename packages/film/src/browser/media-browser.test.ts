// The page's media loads the WebCodecs decoders (mediabunny, most of the review
// page's bytes) only where the panes are chosen: its entry chunk, bundled for
// the browser with splitting as the lab's pages are, reaches none of it, and
// the panes' module is a chunk of its own.

import { expect, it } from 'effect-bun-test';
import { Effect } from 'effect';

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
