// The "on screen first" order (`useOnScreenFirst`, `review/options/stills.tsx`;
// RS-5), the one both the Scenes tape and the Project's cards draw their
// stills by, over a column of forty 100 px rows on a phone's window: it asks
// for the rows on screen and within 120 px of it, in the page's order, and
// for no other; scrolled to the end, it asks for the end's rows, not the
// start's.

import { Effect } from 'effect';
import { describe, it } from 'effect-bun-test';
import { asset, openTab, respond, scriptOf, servePaths } from '../../src/lab/fixtures/browsers.ts';
import { bundled } from '../../src/lab/fixtures/bundles.ts';
import { evaluates, until } from '../../src/lab/fixtures/settled.ts';

/** The order's newest ask, as the page keeps it. */
const LAST_ASK = `window.wanted.at(-1) ?? []`;

describe('the on-screen-first order', () => {
  it.live(
    "asks for the rows on screen and 120 px past it, in the page's order; scrolled, the end's",
    () =>
      Effect.gen(function* () {
        const script = asset(
          'on-screen.js',
          respond(yield* bundled('on-screen-page.tsx'), 'text/javascript'),
        );
        const html = `<!doctype html><html><head><style>body { margin: 0; }</style></head><body>${scriptOf(script)}</body></html>`;
        const tab = yield* openTab({
          width: 390,
          height: 844,
          microphone: false,
          init: [],
          assets: [script],
          serve: servePaths({ '/': respond(html, 'text/html') }),
        });
        yield* tab.goto('/');
        // Rows 0..8 show (0..844 px) and row 9 starts within 120 px under it.
        yield* evaluates(tab, LAST_ASK, [0, 1, 2, 3, 4, 5, 6, 7, 8, 9]);
        yield* tab.evaluate(`(window.scrollTo(0, document.documentElement.scrollHeight), 0)`);
        yield* until(tab, 'scrollY > 0');
        // The last 844 px are rows 31.56..39; row 30 ends within 120 px above.
        yield* evaluates(tab, LAST_ASK, [30, 31, 32, 33, 34, 35, 36, 37, 38, 39]);
      }).pipe(Effect.scoped),
    30_000,
  );
});
