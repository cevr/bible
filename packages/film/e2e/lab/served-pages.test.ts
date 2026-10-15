// Every place of the studio rendered on the server once, by its page's own
// server entry (`LAB_SERVERS`) bundled as the lab bundles it and held pure
// (`servedFile`, `bundles.ts`): a render that writes state (Solid's
// `SERVER_WRITE`, which the owner's lab logged at its start) or throws fails
// here, naming the place. Its reads are answered as a lab with no film
// answers them (a 404), but for the draft its reader is read over (`READS`).

import { describe, expect, it } from 'effect-bun-test';
import { Effect, Option, Result, Struct } from 'effect';
import { LAB_SERVERS } from '../../../../apps/animations/server.ts';
import { type DraftRead, pageAt } from '../../src/core/api.ts';
import type { PageRender, PageSink } from '../../src/core/page-render.ts';
import { servedFile } from '../../src/lab/fixtures/bundles.ts';
import { PLACE_HREFS } from '../../src/lab/fixtures/places.ts';

/** The draft `PLACE_HREFS.draft` opens, read: one beat that says a line. */
const DRAFT: DraftRead = {
  series: 's',
  draft: 'd',
  title: 'A draft',
  beats: [{ id: '1', label: 'The first', say: 'In the beginning {was} the Word.', cite: [] }],
};

/**
 * The reads answered, by path: what a place renders past its fallback with
 * (the draft reader mounts its beats only once its draft is read). Every
 * other read is a 404, as a lab with no film answers it.
 */
const READS: ReadonlyMap<string, DraftRead> = new Map([
  [`/api/series/${DRAFT.series}/${DRAFT.draft}`, DRAFT],
]);

/** A read of the render's: its answer from `READS`, else a 404. */
const readOf = (input: RequestInfo | URL) =>
  Effect.runPromise(
    Effect.sync(() =>
      Option.match(
        Option.fromUndefinedOr(READS.get(new URL(new globalThis.Request(input).url).pathname)),
        {
          onNone: () => new Response('{}', { status: 404 }),
          onSome: (body) => Response.json(body),
        },
      ),
    ),
  );

/** `render` of the page at `href` to its end: its markup, or the reason it failed (a throw is one). */
const rendered = (render: PageRender, href: string) =>
  Effect.callback<string, string>((resume) => {
    const body: Array<string> = [];
    const sink: PageSink = {
      head: () => {},
      write: (html) => {
        body.push(html);
      },
      end: () => resume(Effect.succeed(body.join(''))),
      fail: (reason) => resume(Effect.fail(reason)),
    };
    const threw = Result.try(() =>
      render.render(
        {
          url: `http://127.0.0.1:8229${href}`,
          mac: false,
          signal: new AbortController().signal,
          fetch: Object.assign(readOf, { preconnect: globalThis.fetch.preconnect }),
        },
        sink,
      ),
    );
    if (Result.isFailure(threw)) sink.fail(`the render threw: ${String(threw.failure)}`);
  });

/** Long enough to bundle the three server entries as the lab bundles them, and render each place. */
const BUNDLING = 60_000;

describe("every place's server render", () => {
  it.live(
    'renders each place by its page, writing no state and throwing nothing',
    () =>
      Effect.gen(function* () {
        const renders = yield* Effect.forEach(
          Object.entries(LAB_SERVERS),
          ([page, module]) =>
            Effect.map(servedFile(`${module}`, 'default'), (r) => [page, r] as const),
          { concurrency: 3 },
        );
        const byPage = new Map(renders);
        const failed = yield* Effect.forEach(Struct.keys(PLACE_HREFS), (place) => {
          const href = PLACE_HREFS[place];
          const render = Option.flatMap(pageAt(new URL(href, 'http://lab').pathname), (page) =>
            Option.fromUndefinedOr(byPage.get(page)),
          );
          return Option.match(render, {
            onNone: () => Effect.succeed([`${place}: no server render serves ${href}`]),
            onSome: (r) =>
              rendered(r, href).pipe(
                Effect.as([]),
                Effect.catch((reason) => Effect.succeed([`${place} (${href}): ${reason}`])),
              ),
          });
        });
        expect(failed.flat()).toEqual([]);
      }),
    BUNDLING,
  );
});
