// The lab's browser tests: the lab page (`fixtures/lab-page.ts`, the real
// `mountLab` over the probe film) bundled with Solid's compiler, served to
// headless Chromium at a fake origin, with the lab API answered by routes the
// test gives (then the defaults below). Every request the page makes is kept,
// so a test can read what the lab wrote.

import { BunServices } from '@effect/platform-bun';
import { Deferred, Effect, FileSystem, Option, Schema } from 'effect';
import { type Page, type Route, chromium } from 'playwright-core';
import { Refusal, statusOf } from '../../core/api.ts';
import { solidPlugin } from '../../tools/solid-plugin.ts';
import { PROBE } from './probe-film.ts';

/** The fake origin the page is served at. */
const ORIGIN = 'http://lab.test';
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

/** How a fake route answers: JSON with a status, a refusal as the server answers it, or text. */
type Answer =
  | { readonly _tag: 'Json'; readonly status: number; readonly json: Json }
  | { readonly _tag: 'Refused'; readonly refusal: Refusal }
  | { readonly _tag: 'Text'; readonly status: number; readonly text: string }
  | { readonly _tag: 'File'; readonly path: string }
  | { readonly _tag: 'Hold' }
  | { readonly _tag: 'Later'; readonly gate: Deferred.Deferred<void>; readonly then: Answer };

export const json = (value: Json, status = 200): Answer => ({
  _tag: 'Json',
  status,
  json: value,
});
/** A refusal as the server answers it: its JSON, at the status the contract gives it. */
export const refused = (refusal: Refusal): Answer => ({ _tag: 'Refused', refusal });
export const text = (value: string, status: number): Answer => ({
  _tag: 'Text',
  status,
  text: value,
});
/** Never answered: a long-poll that is still waiting. */
export const hold: Answer = { _tag: 'Hold' };
/** Answered `then` once `gate` is done: a request the test lets land after others. */
export const later = (gate: Deferred.Deferred<void>, then: Answer): Answer => ({
  _tag: 'Later',
  gate,
  then,
});
/** A file on disk, its type read from its name (a fixture video). */
export const file = (path: string): Answer => ({ _tag: 'File', path });

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
    { name: 'tilt', state: literal },
  ],
  refused: [],
};

const sourceTwo = { scene: 'two', file: 'scenes/two.ts', cues: [], knobs: [], refused: [] };

/** Scene three's source: its camera's target and zoom, and a pole, all literals. */
const sourceThree = {
  scene: 'three',
  file: 'scenes/three.ts',
  cues: [],
  knobs: [
    { name: 'face', state: literal },
    { name: 'faceZoom', state: literal },
    { name: 'pole', state: literal },
  ],
  refused: [],
};

/** A write the server took, as it answers one. */
const wrote = (target: string, scene = 'one') => ({
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
  route('GET', /^\/scenes\/three\/source$/, () => json(sourceThree)),
  route('GET', /^\/scenes\/(one|two|three)\/head$/, (asked) => {
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
  route('GET', /^\/studio\/beats$/, () => json({ film: PROBE, beats: [] })),
  route('POST', /^\/cues\//, () => json(wrote('cue'))),
  route('POST', /^\/knobs\//, () => json(wrote('knob'))),
  route('POST', /^\/(undo|redo)$/, (asked) => json(wrote(asked.path.slice(1)))),
];

/** A page's script (`entry`, beside this file), bundled for the browser with Solid's compiler. */
const bundleOf = (entry: string) =>
  Effect.promise(() =>
    Bun.build({
      entrypoints: [`${import.meta.dir}/${entry}`],
      target: 'browser',
      format: 'iife',
      plugins: [solidPlugin],
    }),
  ).pipe(
    Effect.flatMap((built) =>
      Option.match(Option.fromUndefinedOr(built.outputs[0]), {
        onNone: () => Effect.die(`${entry} did not bundle: ${built.logs.join('\n')}`),
        onSome: (out) => Effect.promise(() => out.text()),
      }),
    ),
  );

/** The lab page's script. */
const bundle = bundleOf('lab-page.ts');

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

const encodeRefusal = Schema.encodeSync(Schema.fromJsonString(Refusal));

const answer = (r: Route, found: Answer) => {
  if (found._tag === 'Hold') return;
  if (found._tag === 'Later') {
    const { gate, then } = found;
    Effect.runFork(
      Effect.andThen(
        Deferred.await(gate),
        Effect.sync(() => {
          void answer(r, then);
        }),
      ),
    );
    return;
  }
  if (found._tag === 'File') return r.fulfill({ path: found.path });
  if (found._tag === 'Text')
    return r.fulfill({ status: found.status, contentType: 'text/plain', body: found.text });
  if (found._tag === 'Refused')
    return r.fulfill({
      status: statusOf(found.refusal),
      contentType: 'application/json',
      body: encodeRefusal(found.refusal),
    });
  return r.fulfill({ status: found.status, json: found.json });
};

/**
 * The lab open in a fresh page: the page, what it asked of the API, and any
 * page errors, Solid's reactivity diagnostics among them (a `[STRICT_…]`
 * warning is a read or a write the page does not mean).
 */
interface OpenLab {
  readonly page: Page;
  readonly asked: ReadonlyArray<Asked>;
  readonly errors: ReadonlyArray<string>;
}

/** Collect `tab`'s errors into `errors`: what it throws, and each reactivity diagnostic it warns. */
const collectErrors = (tab: Page, errors: Array<string>) => {
  tab.on('pageerror', (e) => errors.push(String(e)));
  tab.on('console', (m) => {
    if (m.type() === 'warning' && m.text().startsWith('[STRICT_')) errors.push(m.text());
  });
};

/**
 * A microphone for the page: the browser's fake device playing `wav`, and
 * the permissions the page has (`['microphone']`, or none to be refused).
 * The full Chromium runs it (the headless shell has no getUserMedia), and
 * the fake origin counts as secure, as localhost does.
 */
interface FakeMic {
  readonly wav: string;
  readonly permissions: ReadonlyArray<string>;
}

const micLaunch = (mic: FakeMic) => ({
  channel: 'chromium',
  args: [
    '--disable-accelerated-2d-canvas',
    '--use-fake-device-for-media-stream',
    `--use-file-for-fake-audio-capture=${mic.wav}`,
    `--unsafely-treat-insecure-origin-as-secure=${ORIGIN}`,
    '--autoplay-policy=no-user-gesture-required',
  ],
});

/**
 * Open the lab on the probe film at `hash` (`#T`, `&sel=…` in `query`), with
 * `routes` answering the API before the defaults, and `mic` as its
 * microphone when given. The browser closes with the scope.
 */
export const openLab = Effect.fn('lab.fixture.open')(function* (
  routes: ReadonlyArray<FakeRoute> = [],
  at: { readonly query?: string; readonly hash?: string; readonly mic?: FakeMic } = {},
) {
  const [script, style] = yield* Effect.all([bundle, css], { concurrency: 2 });
  const mic = Option.fromUndefinedOr(at.mic);
  const browser = yield* Effect.acquireRelease(
    Effect.promise(() =>
      chromium.launch(
        Option.getOrElse(Option.map(mic, micLaunch), () => ({
          args: ['--disable-accelerated-2d-canvas'],
        })),
      ),
    ),
    (b) => Effect.promise(() => b.close()),
  );
  const tab = yield* Effect.promise(() =>
    browser.newPage({
      viewport: { width: 1400, height: 900 },
      permissions: [
        ...Option.getOrElse(
          Option.map(mic, (m) => m.permissions),
          () => [],
        ),
      ],
    }),
  );
  const asked: Array<Asked> = [];
  const errors: Array<string> = [];
  collectErrors(tab, errors);
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
  // The page's clock (timers, animation frames, `Date`, `performance.now`) is
  // the test's: it runs on with real time, and a test moves it on with
  // `page.clock.runFor` rather than waiting out a count-in, a retry or a
  // loop's playback. Audio still runs on its own, real, clock.
  yield* Effect.promise(() => tab.clock.install());
  yield* Effect.promise(() =>
    tab.goto(`${ORIGIN}/lab?film=${PROBE}${at.query ?? ''}${at.hash ?? ''}`),
  );
  yield* Effect.promise(() => tab.waitForSelector('.lab-panel'));
  const open: OpenLab = { page: tab, asked, errors };
  return open;
});

/** The review page's script. */
const reviewBundle = bundleOf('review-page.ts');

const reviewPage = `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Film review</title></head><body><script src="/review.js"></script></body></html>`;

/** Where the review opens, and how wide its window is (a phone's, or a desk's). */
interface ReviewAt {
  readonly search?: string;
  readonly viewport?: { readonly width: number; readonly height: number };
}

/**
 * Open the review page (`fixtures/review-page.ts`, the real `mountReview`)
 * at `search`, with `routes` answering its requests by their whole path
 * (`/review/index`, `/review/files/…`): what none answers is a 404. The
 * browser plays media without a gesture, its clock is the test's, and it
 * closes with the scope.
 */
export const openReview = Effect.fn('lab.fixture.review')(function* (
  routes: ReadonlyArray<FakeRoute>,
  at: ReviewAt = {},
) {
  const script = yield* reviewBundle;
  const browser = yield* Effect.acquireRelease(
    Effect.promise(() =>
      chromium.launch({
        args: ['--disable-accelerated-2d-canvas', '--autoplay-policy=no-user-gesture-required'],
      }),
    ),
    (b) => Effect.promise(() => b.close()),
  );
  const tab = yield* Effect.promise(() =>
    browser.newPage({ viewport: at.viewport ?? { width: 1400, height: 900 } }),
  );
  const asked: Array<Asked> = [];
  const errors: Array<string> = [];
  collectErrors(tab, errors);
  yield* Effect.promise(() =>
    tab.route(`${ORIGIN}/**`, (r) => {
      const url = new URL(r.request().url());
      if (url.pathname === '/') return r.fulfill({ contentType: 'text/html', body: reviewPage });
      if (url.pathname === '/review.js')
        return r.fulfill({ contentType: 'text/javascript', body: script });
      const request: Asked = {
        method: r.request().method(),
        path: `${url.pathname}${url.search}`,
        body: bodyOf(r),
      };
      asked.push(request);
      const found = routes.find((f) => f.method === request.method && f.path.test(request.path));
      return Option.match(Option.fromUndefinedOr(found), {
        onNone: () => r.fulfill({ status: 404, body: 'no fake route' }),
        onSome: (f) => answer(r, f.answer(request)),
      });
    }),
  );
  // The page's clock is the test's, as the lab's is: it runs on with real
  // time, and a test moves it on (`page.clock.runFor`) rather than waiting.
  yield* Effect.promise(() => tab.clock.install());
  yield* Effect.promise(() => tab.goto(`${ORIGIN}/${at.search ?? ''}`));
  yield* Effect.promise(() => tab.waitForSelector('.rv-main'));
  const open: OpenLab = { page: tab, asked, errors };
  return open;
});
