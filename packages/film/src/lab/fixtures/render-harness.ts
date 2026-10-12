// The render page in a browser (`render-page.ts`, the real `mountRender`)
// for a film of the test registry, its export handle driven as the tools
// drive it (`window.__film`): each call's answer as JSON. Its footage files
// are answered by path, by byte range as the lab's routes answer media
// (`tab.ts`), so mediabunny reads them as it reads them live.

import { Effect, Option } from 'effect';
import type { Scope } from 'effect';
import type { CallArgs, ExportCall, WireAnswers } from '../../core/export-handle.ts';
import { asset, openTab, respond, scriptOf, servePaths } from './browsers.ts';
import { bundled } from './bundles.ts';
import { jsonOf } from './tab.ts';

/** The render page with its script. */
const renderScript = Effect.runSync(
  Effect.cached(
    Effect.map(bundled('render-page.ts'), (js) =>
      asset('render.js', respond(js, 'text/javascript')),
    ),
  ),
);

/** A render page open on a film: each call of its export handle. */
interface RenderPage {
  readonly call: <K extends ExportCall>(
    name: K,
    ...args: CallArgs[K]
  ) => Effect.Effect<WireAnswers[K]>;
  /** What the page threw, and every warning and error it logged. */
  readonly errors: ReadonlyArray<string>;
}

/** A served file's type, by its extension: JSON (the footage library's lock and transcripts), else video. */
const typeOf = (path: string): string =>
  Option.match(
    Option.liftPredicate(path, (p) => p.endsWith('.json')),
    {
      onNone: () => 'video/mp4',
      onSome: () => 'application/json',
    },
  );

/**
 * The render page open on `film` (`?film=<film>&export`), with `files`
 * answered at their paths (a footage source's copies, the footage library's
 * lock and transcripts) and anything else a 404, once its handle is up.
 */
export const openRender = (
  film: string,
  files: Readonly<Record<string, Uint8Array | string>> = {},
): Effect.Effect<RenderPage, never, Scope.Scope> =>
  Effect.gen(function* () {
    const script = yield* renderScript;
    const html = `<!doctype html><html><head><meta charset="utf-8"></head><body>${scriptOf(script)}</body></html>`;
    const tab = yield* openTab({
      width: 800,
      height: 600,
      microphone: false,
      init: [],
      assets: [script],
      serve: servePaths({
        ...Object.fromEntries(
          Object.entries(files).map(([path, body]) => [path, respond(body, typeOf(path))]),
        ),
        '/': respond(html, 'text/html'),
      }),
    });
    yield* tab.goto(`/?film=${film}&export`);
    yield* tab.until('window.__film !== undefined', {
      now: 'document.body.innerText',
      say: (now) => `the render page never handed out its handle: ${now}`,
    });
    const page: RenderPage = {
      call: (name, ...args) => tab.evaluate(`window.__film[${jsonOf(name)}](...${jsonOf(args)})`),
      errors: tab.errors,
    };
    return page;
  });
