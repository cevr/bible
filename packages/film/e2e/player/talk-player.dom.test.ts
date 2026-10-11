// A talk on the player whose footage will not decode: the page never shows
// the frame black or leaves an old one up without a word. The film stops and
// the page says why in its place, naming the footage it could not read, as
// it does for a film that will not start. The player page
// (`fixtures/player-page.ts`, the real `mountPlay`) is served with the talk's
// library (its lock and transcript, as the footage route serves them) and
// nothing else: its proxy is a 404.

import { Effect } from 'effect';
import { describe, expect, it } from 'effect-bun-test';
import { pageHref } from '../../src/core/api.ts';
import { FOOTAGE_LOCK_HREF } from '../../src/core/footage.ts';
import { asset, openTab, respond, scriptOf } from '../../src/lab/fixtures/browsers.ts';
import { bundled } from '../../src/lab/fixtures/bundles.ts';
import { jsonOf } from '../../src/lab/fixtures/tab.ts';
import { TALK, TALK_LIBRARY, TALK_TAKE } from '../../src/lab/fixtures/talk-film.ts';

/** A laptop's window. */
const DESK = { width: 1440, height: 900 };

/** The player page's script: built the first time a case asks for it. */
const playerScript = Effect.runSync(
  Effect.cached(
    Effect.map(bundled('player-page.ts'), (js) =>
      asset('player.js', respond(js, 'text/javascript')),
    ),
  ),
);

describe('a talk on the player', () => {
  it.live(
    'whose footage will not decode stops, and the page says why in its place, naming the footage',
    () =>
      Effect.gen(function* () {
        const library = yield* TALK_LIBRARY;
        const script = yield* playerScript;
        const play = pageHref.play(TALK);
        const asked: Array<string> = [];
        const served = {
          ...Object.fromEntries(
            Object.entries(library).map(([path, body]) => [
              path,
              respond(body, 'application/json'),
            ]),
          ),
          [play]: respond(
            `<!doctype html><html><head><meta charset="utf-8"></head><body>${scriptOf(script)}</body></html>`,
            'text/html',
          ),
        };
        const tab = yield* openTab({
          ...DESK,
          microphone: false,
          init: [],
          assets: [script],
          serve: (request) =>
            Effect.sync(() => {
              asked.push(request.url.pathname);
              return served[request.url.pathname] ?? respond('no such file', 'text/plain', 404);
            }).pipe(Effect.asSome),
        });
        yield* tab.goto(play);
        yield* tab.until(
          `document.querySelector('body > pre')?.textContent.includes(${jsonOf(
            `footage ${TALK_TAKE.source} has no frame`,
          )}) === true`,
          {
            now: 'document.body.innerText',
            say: (now) => `the player never said its footage would not decode: ${now}`,
          },
        );
        // The page cut the talk on the library's lock before it asked for the picture.
        expect(asked).toContain(FOOTAGE_LOCK_HREF);
      }).pipe(Effect.scoped),
    60_000,
  );
});
