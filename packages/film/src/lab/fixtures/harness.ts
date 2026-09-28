// The lab's browser tests: the lab page (`fixtures/lab-page.ts`, the real
// `mountLab` over the probe film) bundled with Solid's compiler, served to
// headless Chromium at a fake origin, with the lab API answered by routes the
// test gives (then the defaults below). Every request the page makes is kept,
// so a test can read what the lab wrote.

import { BunServices } from '@effect/platform-bun';
import { Effect, FileSystem, Option } from 'effect';
import { type Page, type Route, chromium } from 'playwright-core';
import { solidPlugin } from '../../tools/solid-plugin.ts';
import { PROBE } from './probe-film.ts';

/** The fake origin the page is served at. */
export const ORIGIN = 'http://lab.test';
const API = `/lab/${PROBE}`;

/** A JSON value, as the fake server answers and the page posts. */
export type Json =
  | string
  | number
  | boolean
  | ReadonlyArray<Json>
  | { readonly [key: string]: Json };

/** A request the page made to the lab API. */
export interface Asked {
  readonly method: string;
  readonly path: string;
  readonly body: Option.Option<Json>;
}

/** How a fake route answers: JSON with a status, or text (a refusal, as the server words it). */
export type Answer =
  | { readonly _tag: 'Json'; readonly status: number; readonly json: Json }
  | { readonly _tag: 'Text'; readonly status: number; readonly text: string }
  | { readonly _tag: 'Hold' };

export const json = (value: Json, status = 200): Answer => ({
  _tag: 'Json',
  status,
  json: value,
});
export const text = (value: string, status: number): Answer => ({
  _tag: 'Text',
  status,
  text: value,
});
/** Never answered: a long-poll that is still waiting. */
export const hold: Answer = { _tag: 'Hold' };

/** A fake lab route: the method, the path under `/lab/probe` it matches, and its answer. */
export interface FakeRoute {
  readonly method: 'GET' | 'POST';
  readonly path: RegExp;
  readonly answer: (asked: Asked) => Answer;
}

export const route = (
  method: FakeRoute['method'],
  path: RegExp,
  answer: FakeRoute['answer'],
): FakeRoute => ({ method, path, answer });

const literal = 'literal' as const;
const cueSource = (name: string) => ({
  name,
  offset: literal,
  dur: literal,
  until: literal,
  ease: literal,
  stagger: literal,
});

/** Scene one's source as the lab reads it: every cue and knob a literal it may write. */
export const sourceOne = {
  scene: 'one',
  file: 'scenes/one.ts',
  cues: [cueSource('rise'), cueSource('fall')],
  knobs: [
    { name: 'spot', state: literal },
    { name: 'size', state: literal },
  ],
  refused: [],
};

const sourceTwo = { scene: 'two', file: 'scenes/two.ts', cues: [], knobs: [], refused: [] };

/** A write the server took, as it answers one. */
export const wrote = (target: string, scene = 'one') => ({
  scene,
  file: `scenes/${scene}.ts`,
  target,
  findings: [],
});

const defaults: ReadonlyArray<FakeRoute> = [
  route('GET', /^\/notes$/, () => json({ film: PROBE, seq: 0, notes: [] })),
  route('GET', /^\/notes\/wait/, () => hold),
  route('GET', /^\/scenes\/one\/source$/, () => json(sourceOne)),
  route('GET', /^\/scenes\/two\/source$/, () => json(sourceTwo)),
  route('GET', /^\/scenes\/(one|two)\/head$/, (asked) => {
    const scene = asked.path.split('/')[2] ?? '';
    return json({
      scene,
      file: `scenes/${scene}.ts`,
      timeline: {},
      knobs: {},
      codeChanged: false,
      sameData: true,
    });
  }),
  route('GET', /^\/check$/, () => json({ findings: [] })),
  route('POST', /^\/cues\//, () => json(wrote('cue'))),
  route('POST', /^\/knobs\//, () => json(wrote('knob'))),
  route('POST', /^\/(undo|redo)$/, (asked) => json(wrote(asked.path.slice(1)))),
];

/** The lab page's script, bundled for the browser with Solid's compiler. */
const bundle = Effect.promise(() =>
  Bun.build({
    entrypoints: [`${import.meta.dir}/lab-page.ts`],
    target: 'browser',
    format: 'iife',
    plugins: [solidPlugin],
  }),
).pipe(
  Effect.flatMap((built) =>
    Option.match(Option.fromUndefinedOr(built.outputs[0]), {
      onNone: () => Effect.die(`lab page did not bundle: ${built.logs.join('\n')}`),
      onSome: (out) => Effect.promise(() => out.text()),
    }),
  ),
);

const css = FileSystem.FileSystem.use((fs) =>
  fs.readFileString(`${import.meta.dir}/../../player/player.css`),
).pipe(Effect.orDie, Effect.provide(BunServices.layer));

/** The lab page as `lab.html` has it, with the player's styles inline. */
const page = (style: string) =>
  `<!doctype html><html><head><meta charset="utf-8"><title>Lab</title><style>${style}</style></head><body class="lab"><script src="/lab.js"></script></body></html>`;

const bodyOf = (r: Route): Option.Option<Json> =>
  Option.flatMap(Option.fromNullishOr(r.request().postData()), () =>
    Option.fromNullishOr<Json>(r.request().postDataJSON()),
  );

const answer = (r: Route, found: Answer) => {
  if (found._tag === 'Hold') return;
  if (found._tag === 'Text')
    return r.fulfill({ status: found.status, contentType: 'text/plain', body: found.text });
  return r.fulfill({ status: found.status, json: found.json });
};

/** The lab open in a fresh page: the page, what it asked of the API, and any page errors. */
export interface OpenLab {
  readonly page: Page;
  readonly asked: ReadonlyArray<Asked>;
  readonly errors: ReadonlyArray<string>;
}

/**
 * Open the lab on the probe film at `hash` (`#T`, `&sel=…` in `query`), with
 * `routes` answering the API before the defaults. The browser closes with the
 * scope.
 */
export const openLab = Effect.fn('lab.fixture.open')(function* (
  routes: ReadonlyArray<FakeRoute> = [],
  at: { readonly query?: string; readonly hash?: string } = {},
) {
  const [script, style] = yield* Effect.all([bundle, css], { concurrency: 2 });
  const browser = yield* Effect.acquireRelease(
    Effect.promise(() => chromium.launch({ args: ['--disable-accelerated-2d-canvas'] })),
    (b) => Effect.promise(() => b.close()),
  );
  const tab = yield* Effect.promise(() =>
    browser.newPage({ viewport: { width: 1400, height: 900 } }),
  );
  const asked: Array<Asked> = [];
  const errors: Array<string> = [];
  tab.on('pageerror', (e) => errors.push(String(e)));
  const all = [...routes, ...defaults];
  yield* Effect.promise(() =>
    tab.route(`${ORIGIN}/**`, (r) => {
      const url = new URL(r.request().url());
      if (url.pathname === '/lab')
        return r.fulfill({ contentType: 'text/html', body: page(style) });
      if (url.pathname === '/lab.js')
        return r.fulfill({ contentType: 'text/javascript', body: script });
      const request: Asked = {
        method: r.request().method(),
        path: `${url.pathname.slice(API.length)}${url.search}`,
        body: bodyOf(r),
      };
      asked.push(request);
      const found = all.find((f) => f.method === request.method && f.path.test(request.path));
      return Option.match(Option.fromUndefinedOr(found), {
        onNone: () => r.fulfill({ status: 404, body: 'no fake route' }),
        onSome: (f) => answer(r, f.answer(request)),
      });
    }),
  );
  yield* Effect.promise(() =>
    tab.goto(`${ORIGIN}/lab?film=${PROBE}${at.query ?? ''}${at.hash ?? ''}`),
  );
  yield* Effect.promise(() => tab.waitForSelector('.lab-panel'));
  const open: OpenLab = { page: tab, asked, errors };
  return open;
});
