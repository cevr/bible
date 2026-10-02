// The pool lends a case's view to the next case with nothing of the first
// left in it. One case dirties every kind of state a page or a tab keeps:
// its storage, cookie, tab name, history and hash, a script for new pages,
// a request still held, the mouse button held down, the viewport, and a
// page that throws and logs as it goes. The view it gave back is lent again
// (no new view opened): the next page on it sees none of that, its own
// server answers, and nothing the first page did reaches its errors or log.

import { Effect, Option } from 'effect';
import { describe, expect, it } from 'effect-bun-test';
import {
  asset,
  openTab,
  respond,
  scriptOf,
  viewsMade,
} from '../../../src/lab/fixtures/browsers.ts';
import { evaluates } from '../../../src/lab/fixtures/settled.ts';
import { type Request, type Tab, jsonOf } from '../../../src/lab/fixtures/tab.ts';

/** A page whose script answers `window.served` from its server's `/probe`. */
const page = (word: string) => {
  const script = asset(
    'probe.js',
    respond(
      `fetch('/probe').then((r) => r.text()).then((t) => { window.served = t; });`,
      'text/javascript',
    ),
  );
  return {
    script,
    serve: (asked: Array<string>) => (request: Request) =>
      Effect.sync(() => {
        asked.push(request.url.pathname);
        if (request.url.pathname === '/hold') return Option.none();
        if (request.url.pathname === '/probe') return Option.some(respond(word, 'text/plain'));
        return Option.some(
          respond(`<!doctype html><html><body>${scriptOf(script)}</body></html>`, 'text/html'),
        );
      }),
  };
};

/** The page's state, as one JSON value a wait can compare. */
const STATE = `JSON.stringify({
  init: globalThis.dirty ?? 'none',
  local: localStorage.length,
  session: sessionStorage.length,
  cookie: document.cookie,
  name: window.name,
  hash: location.hash,
  history: history.length,
  width: innerWidth,
  served: globalThis.served ?? 'none',
})`;

const dirty = (tab: Tab) =>
  Effect.gen(function* () {
    yield* tab.goto('/');
    yield* evaluates(tab, "globalThis.served ?? 'none'", 'one');
    yield* tab.evaluate(`
      localStorage.setItem('k', 'v');
      sessionStorage.setItem('k', 'v');
      document.cookie = 'k=v';
      window.name = 'leaked';
      history.pushState(null, '', '#dirty');
      fetch('/hold');
      addEventListener('pagehide', () => {
        console.log('leaked log');
        setTimeout(() => { throw new Error('leaked throw'); });
        throw new Error('leaked throw');
      });
      true`);
    yield* tab.mouse.move(20, 20);
    yield* tab.mouse.down;
  });

describe('the pool of views', () => {
  it.live('lends a view to the next case with nothing of the last case left in it', () =>
    Effect.gen(function* () {
      const first = page('one');
      const firstAsked: Array<string> = [];
      const made = yield* Effect.scoped(
        Effect.gen(function* () {
          const tab = yield* openTab({
            width: 500,
            height: 400,
            microphone: false,
            init: [`globalThis.dirty = 'init'`],
            assets: [first.script],
            serve: first.serve(firstAsked),
          });
          yield* dirty(tab);
          yield* evaluates(tab, 'location.hash', '#dirty');
          return viewsMade();
        }),
      );

      const second = page('two');
      const asked: Array<string> = [];
      yield* Effect.scoped(
        Effect.gen(function* () {
          const tab = yield* openTab({
            width: 900,
            height: 700,
            microphone: false,
            init: [],
            assets: [second.script],
            serve: second.serve(asked),
          });
          // The view the first case gave back, not a new one.
          expect(viewsMade()).toBe(made);
          yield* tab.goto('/');
          yield* evaluates(
            tab,
            STATE,
            jsonOf({
              init: 'none',
              local: 0,
              session: 0,
              cookie: '',
              name: '',
              hash: '',
              // The idle page the view waited on, and this one.
              history: 2,
              width: 900,
              served: 'two',
            }),
          );
          // The button the first case held is up: a click is a whole click.
          yield* tab.evaluate(`
            window.seen = [];
            for (const type of ['mousedown', 'mouseup', 'click'])
              addEventListener(type, (e) => window.seen.push(type + ':' + e.buttons));
            true`);
          yield* tab.mouse.click(40, 40);
          yield* evaluates(tab, 'window.seen', ['mousedown:1', 'mouseup:0', 'click:0']);
          // Its own requests only: the first page's held one never reaches it.
          expect(asked.filter((path) => path !== '/favicon.ico')).toEqual(['/', '/probe']);
          expect(tab.errors).toEqual([]);
          expect(tab.logged.map((m) => m.text)).not.toContain('leaked log');
        }),
      );
      expect(firstAsked).toContain('/hold');
    }),
  );
});
