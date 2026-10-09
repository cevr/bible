// A page's reach of the host is failed by the harness, whatever the spelling:
// a script whose source map names a file of the film's own source outside its
// adapters (`src/browser/`) and that moves the history, hears the window's
// keys, ends a press or takes a pointer fails its case, though the case never
// looked. The same call from an adapter, a library or a script with no source
// map is told and let through. Each script here is a page's script with its
// inline source map naming the file that "wrote" it.

import { Effect } from 'effect';
import { Base64 } from 'effect/encoding';
import { describe, expect, it } from 'effect-bun-test';
import {
  asset,
  openTab,
  respond,
  scriptOf,
  servePaths,
} from '../../../src/lab/fixtures/browsers.ts';
import { evaluates } from '../../../src/lab/fixtures/settled.ts';

/** `js` (one line) with a source map that reads all of it back to `source`, relative to the film package. */
const writtenBy = (js: string, source: string) => {
  const map = `{"version":3,"sources":["${source}"],"names":[],"mappings":"AAAA"}`;
  return `${js};window.ran=true\n//# sourceMappingURL=data:application/json;base64,${Base64.encode(map)}`;
};

/** The lab's own file that must not reach the host, and the adapter that may. */
const FILM_FILE = 'src/lab/shell.tsx';
const ADAPTER = 'src/browser/keys-browser.ts';

/** A page that runs `js` once it loads, and says so (`window.ran`). */
const pageRunning = (js: string) => {
  const script = asset('reach.js', respond(js, 'text/javascript'));
  return {
    script,
    serve: servePaths({
      '/': respond(
        `<!doctype html><html><body><div id="a"></div>${scriptOf(script)}</body></html>`,
        'text/html',
      ),
    }),
  };
};

/** Whether the case that loaded `js` failed, and how. */
const outcome = (js: string) =>
  Effect.gen(function* () {
    const control = pageRunning(js);
    const exit = yield* Effect.exit(
      Effect.scoped(
        Effect.gen(function* () {
          const tab = yield* openTab({
            width: 500,
            height: 400,
            microphone: false,
            init: [],
            assets: [control.script],
            serve: control.serve,
          });
          yield* tab.goto('/');
          yield* evaluates(tab, 'window.ran === true', true);
          // The page's report is an event: one more round trip, and it has been heard.
          yield* tab.evaluate('true');
        }),
      ),
    );
    return String(exit);
  });

describe('the host-reach check', () => {
  for (const [api, js] of [
    ['history.pushState', "history.pushState({}, '', '#x')"],
    ['history.replaceState', "history.replaceState({}, '', '#x')"],
    ['history.forward', 'history.forward()'],
    ['addEventListener(keydown) on the host', "window.addEventListener('keydown', () => {})"],
    ['addEventListener(popstate) on the host', "addEventListener('popstate', () => {})"],
    [
      'addEventListener(pointermove) on the host',
      "document.addEventListener('pointermove', () => {})",
    ],
    [
      'addEventListener(pointerup)',
      "document.getElementById('a').addEventListener('pointerup', () => {})",
    ],
    ['setPointerCapture', "document.getElementById('a').setPointerCapture(1)"],
  ] as const)
    it.live(`fails a case whose film file calls ${api}`, () =>
      Effect.gen(function* () {
        const failed = yield* outcome(writtenBy(js, FILM_FILE));
        expect(failed).toContain(`host reach: ${api} from `);
        expect(failed).toContain('from src/lab/shell.tsx');
      }),
    );

  it.live('lets an adapter, a script with no source map and an element listener through', () =>
    Effect.gen(function* () {
      const adapter = yield* outcome(
        writtenBy(
          "history.pushState({}, '', '#x');window.addEventListener('keydown', () => {})",
          ADAPTER,
        ),
      );
      expect(adapter).not.toContain('host reach');
      const unmapped = yield* outcome("history.pushState({}, '', '#y');window.ran=true");
      expect(unmapped).not.toContain('host reach');
      const element = yield* outcome(
        writtenBy("document.getElementById('a').addEventListener('keydown', () => {})", FILM_FILE),
      );
      expect(element).not.toContain('host reach');
    }),
  );
});
