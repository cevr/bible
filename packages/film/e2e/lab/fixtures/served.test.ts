// The purity guard on a page's server render (`served`, `bundles.ts`):
// a render that writes a signal fails, naming the write; the same render
// reading only ends. Here, with the served pages it guards, since each case
// bundles a server entry as the lab bundles it.

import { describe, expect, it } from 'effect-bun-test';
import { Effect } from 'effect';
import type { PageRender } from '../../../src/core/page-render.ts';
import { served } from '../../../src/lab/fixtures/bundles.ts';

/** `render` of a page to its end: its markup, or the reason it failed. */
const rendered = (render: PageRender) =>
  Effect.callback<string, string>((resume) => {
    const body: Array<string> = [];
    render.render(
      { url: 'http://probe.test/', signal: new AbortController().signal, fetch: globalThis.fetch },
      {
        head: () => {},
        write: (html) => {
          body.push(html);
        },
        end: () => resume(Effect.succeed(body.join(''))),
        fail: (reason) => resume(Effect.fail(reason)),
      },
    );
  });

/** Long enough to bundle a server entry twice as the lab bundles it. */
const BUNDLING = 20_000;

describe('a served page is held pure', () => {
  it.live(
    'a render that writes a signal fails, naming the write; one that only reads ends',
    () =>
      Effect.gen(function* () {
        const writing = yield* Effect.flip(
          rendered(yield* served('server-write-page.tsx', 'writingRender')),
        );
        expect(writing).toContain(
          'the page wrote state while the server rendered it: [SERVER_WRITE] Writing a signal',
        );
        const reading = yield* rendered(yield* served('server-write-page.tsx', 'readingRender'));
        expect(reading).toContain('<p');
      }),
    BUNDLING,
  );
});
