// Every place of the studio rendered on the server once, by its page's own
// server entry (`LAB_SERVERS`) bundled as the lab bundles it and held pure
// (`servedFile`, `bundles.ts`): a render that writes state (Solid's
// `SERVER_WRITE`, which the owner's lab logged at its start) or throws fails
// here, naming the place. Each place is opened over a fixture film, its reads
// answered as `openServed` answers them (`servedReads`): the review's places
// over the studio film (`studio-film.ts`), the lab's and the player's over
// the probe film. A read the fixture film does not answer fails the place
// too, so each place renders past its fallback, with a film's data, as the
// owner's lab renders a real film.

import { describe, expect, it } from 'effect-bun-test';
import { Effect, Option, Result, Struct } from 'effect';
import { LAB_SERVERS } from '../../../../apps/animations/server.ts';
import { type AppPage, pageAt, pageHref } from '../../src/core/api.ts';
import type { PageRender, PageSink } from '../../src/core/page-render.ts';
import { servedFile } from '../../src/lab/fixtures/bundles.ts';
import { type Asked, type ServedName, servedReads } from '../../src/lab/fixtures/harness.ts';
import type { PLACE_HREFS } from '../../src/lab/fixtures/places.ts';
import { PROBE } from '../../src/lab/fixtures/probe-film.ts';
import {
  STUDIO_ASK,
  STUDIO_DRAFT,
  STUDIO_FOLDER,
  STUDIO_PAGE,
  STUDIO_PRODUCTION,
  STUDIO_SERIES,
  STUDIO_SET,
  studioRoutes,
} from '../../src/lab/fixtures/studio-film.ts';

/** Every place (`PLACE_HREFS`), at a link of a fixture film's. */
const FILM_HREFS = {
  home: pageHref.home(),
  production: pageHref.production(STUDIO_PRODUCTION),
  ask: pageHref.ask(STUDIO_ASK),
  askPage: pageHref.askPage(STUDIO_PAGE),
  draft: pageHref.draft(STUDIO_SERIES, STUDIO_DRAFT),
  draftBeat: pageHref.draftBeat(STUDIO_SERIES, STUDIO_DRAFT, '1', '0-0'),
  folder: pageHref.folder(STUDIO_FOLDER),
  set: pageHref.set(STUDIO_FOLDER, STUDIO_SET),
  studio: pageHref.studio(PROBE),
} satisfies Record<keyof typeof PLACE_HREFS, string>;

/** Whether a page is one the server renders: the export page is drawn in the browser alone. */
const isServed = (page: AppPage): page is ServedName => page !== 'render';

/** A read a render made and the status it was answered with. */
interface Answered {
  readonly path: string;
  readonly status: number;
}

/**
 * The fetch of a render of page `name`: its reads answered by the fixture
 * film, each kept in `answered` with its status.
 */
const readsOf = (name: ServedName, answered: Array<Answered>) => {
  const read: Array<Asked> = [];
  const reads = servedReads(name, studioRoutes, read);
  return (input: RequestInfo | URL) =>
    Effect.runPromise(
      Effect.tap(
        Effect.promise(() => reads(input)),
        (response) =>
          Effect.sync(() => {
            const path = new URL(new globalThis.Request(input).url).pathname;
            answered.push({ path, status: response.status });
          }),
      ),
    );
};

/** `render` of the page at `href` to its end: its markup, or the reason it failed (a throw is one). */
const rendered = (
  render: PageRender,
  href: string,
  fetch: (input: RequestInfo | URL) => Promise<Response>,
) =>
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
          fetch: Object.assign(fetch, { preconnect: globalThis.fetch.preconnect }),
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
        const failed = yield* Effect.forEach(Struct.keys(FILM_HREFS), (place) => {
          const href = FILM_HREFS[place];
          const render = Option.flatMap(
            Option.filter(pageAt(new URL(href, 'http://lab').pathname), isServed),
            (page) =>
              Option.map(Option.fromUndefinedOr(byPage.get(page)), (r) => [page, r] as const),
          );
          return Option.match(render, {
            onNone: () => Effect.succeed([`${place}: no server render serves ${href}`]),
            onSome: ([page, r]) => {
              const answered: Array<Answered> = [];
              return rendered(r, href, readsOf(page, answered)).pipe(
                // Read once the render has ended: every read it made is in.
                Effect.map(() =>
                  answered
                    .filter((a) => a.status >= 400)
                    .map((a) => `${place} (${href}): its read ${a.path} answered ${a.status}`),
                ),
                Effect.catch((reason) => Effect.succeed([`${place} (${href}): ${reason}`])),
              );
            },
          });
        });
        expect(failed.flat()).toEqual([]);
      }),
    BUNDLING,
  );
});
