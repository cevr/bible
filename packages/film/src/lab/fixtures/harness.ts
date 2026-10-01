// The lab's browser tests: the lab page (`fixtures/lab-page.ts`, the real
// `mountLab` over the probe film) bundled with Solid's compiler, served to a
// tab of the test process's Chrome (`browsers.ts`) at its own origin, with the
// lab API answered by routes the test gives (then the defaults below). Every
// request the page makes is kept, so a test can read what the lab wrote.

import { BunServices } from '@effect/platform-bun';
import { Array as Arr, Deferred, Effect, FileSystem, Option, Schema } from 'effect';
import { Refusal, statusOf } from '../../core/api.ts';
import { solidPlugin } from '../../tools/solid-plugin.ts';
import { openTab, respond } from './browsers.ts';
import { CLOCK_SCRIPT } from './clock.ts';
import { PROBE } from './probe-film.ts';
import type { Request, Response, Tab } from './tab.ts';

const API = `/lab/${PROBE}`;

/** A JSON value, as the fake server answers and the page posts. */
export type Json = Schema.Json;

const JsonText = Schema.fromJsonString(Schema.Json);

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

/**
 * A page's script (`entry`, beside this file), bundled for the browser with
 * Solid's compiler: once per test file, however many cases open the page.
 */
export const bundleOf = (entry: string) => Effect.runSync(Effect.cached(bundled(entry)));

const bundled = (entry: string) =>
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

const css = Effect.runSync(
  Effect.cached(
    FileSystem.FileSystem.use((fs) =>
      fs.readFileString(`${import.meta.dir}/../../player/player.css`),
    ).pipe(Effect.orDie, Effect.provide(BunServices.layer)),
  ),
);

/** The lab page as `lab.html` has it, with the player's styles inline. */
const labPage = (style: string) =>
  `<!doctype html><html><head><meta charset="utf-8"><title>Lab</title><style>${style}</style></head><body class="lab"><script src="/lab.js"></script></body></html>`;

/** The page's JSON body, when it sent one. */
const bodyOf = (request: Request): Option.Option<Json> =>
  Schema.decodeOption(JsonText)(request.body);

const encodeRefusal = Schema.encodeSync(Schema.fromJsonString(Refusal));

/** A file the fake server answers, its type read from its name. */
const fileAnswer = (path: string) =>
  FileSystem.FileSystem.use((fs) => fs.readFile(path)).pipe(
    Effect.map((bytes) => respond(bytes, typeOfFile(path))),
    Effect.orDie,
    Effect.provide(BunServices.layer),
  );

/** The media types of the files the tests answer with (a tone, as a fixture video's sound). */
const TYPES = new Map([['.wav', 'audio/wav']]);

const typeOfFile = (path: string) =>
  Option.getOrElse(
    Option.fromUndefinedOr(TYPES.get(path.slice(path.lastIndexOf('.')))),
    () => 'application/octet-stream',
  );

/** `found` as the tab's server answers it: never, for a hold; after its gate, for a later one. */
const answer = (found: Answer): Effect.Effect<Option.Option<Response>> => {
  if (found._tag === 'Hold') return Effect.succeedNone;
  if (found._tag === 'Later') return Effect.andThen(Deferred.await(found.gate), answer(found.then));
  if (found._tag === 'File') return Effect.asSome(fileAnswer(found.path));
  if (found._tag === 'Text')
    return Effect.succeedSome(respond(found.text, 'text/plain', found.status));
  if (found._tag === 'Refused')
    return Effect.succeedSome(
      respond(encodeRefusal(found.refusal), 'application/json', statusOf(found.refusal)),
    );
  return Effect.succeedSome(
    respond(Schema.encodeSync(JsonText)(found.json), 'application/json', found.status),
  );
};

/**
 * A request to the API: kept in `asked` (its path past `prefix`) and
 * answered by the first of `routes` that matches it, or a 404.
 */
const apiAnswer =
  (prefix: string, routes: ReadonlyArray<FakeRoute>, asked: Array<Asked>) =>
  (request: Request): Effect.Effect<Option.Option<Response>> => {
    const made: Asked = {
      method: request.method,
      path: `${request.url.pathname.slice(prefix.length)}${request.url.search}`,
      body: bodyOf(request),
    };
    asked.push(made);
    const found = routes.find((f) => f.method === made.method && f.path.test(made.path));
    return Option.match(Option.fromUndefinedOr(found), {
      onNone: () => Effect.succeedSome(respond('no fake route', 'text/plain', 404)),
      onSome: (f) => answer(f.answer(made)),
    });
  };

/** A page's fake server: `pages` by path (its HTML and its script), then the API (`apiAnswer`). */
const fakeServer =
  (
    pages: ReadonlyMap<string, Response>,
    prefix: string,
    routes: ReadonlyArray<FakeRoute>,
    asked: Array<Asked>,
  ) =>
  (request: Request): Effect.Effect<Option.Option<Response>> =>
    Option.match(Option.fromUndefinedOr(pages.get(request.url.pathname)), {
      onSome: Effect.succeedSome,
      onNone: () => apiAnswer(prefix, routes, asked)(request),
    });

/**
 * `canvas.toBlob` encoding at once, from `toDataURL`: the same image in the
 * same type. Chromium encodes a toBlob in the renderer's idle time and, when
 * a page animating on a loaded machine leaves none, only after its 5 s
 * fallback, so a note's still took 1 s or 7 s by chance. Answered after the
 * call, as the real one is.
 */
const TO_BLOB_AT_ONCE = `HTMLCanvasElement.prototype.toBlob = function (done, type, quality) {
  const url = this.toDataURL(type, quality);
  const bytes = Uint8Array.from(atob(url.slice(url.indexOf(',') + 1)), (c) => c.charCodeAt(0));
  const blob = new Blob([bytes], { type: url.slice(5, url.indexOf(';')) });
  queueMicrotask(() => done(blob));
};`;

/**
 * A microphone 6 dB hotter than the shared fake one, its tone at 0.99 of
 * full scale: every microphone source the page makes goes through a gain.
 */
const HOT_MIC = `(() => {
  const real = AudioContext.prototype.createMediaStreamSource;
  AudioContext.prototype.createMediaStreamSource = function (stream) {
    const source = real.call(this, stream);
    const gain = this.createGain();
    gain.gain.value = 1.98;
    source.connect(gain);
    return gain;
  };
})()`;

/**
 * A page open in a fresh tab: the tab, what it asked of its server, and any
 * page errors, Solid's reactivity diagnostics among them (a `[STRICT_…]`
 * warning is a read or a write the page does not mean).
 */
interface OpenLab {
  readonly page: Tab;
  readonly asked: ReadonlyArray<Asked>;
  readonly errors: ReadonlyArray<string>;
}

/**
 * The page's microphone: the shared fake (`browsers.ts`), allowed or
 * refused, and `hot` when it should clip.
 */
interface FakeMic {
  readonly allowed: boolean;
  readonly hot?: boolean;
}

/**
 * Open the lab on the probe film at `hash` (`#T`, `&sel=…` in `query`), with
 * `routes` answering the API before the defaults, and `mic` as its
 * microphone when given. The tab closes with the scope.
 */
export const openLab = Effect.fn('lab.fixture.open')(function* (
  routes: ReadonlyArray<FakeRoute> = [],
  at: { readonly query?: string; readonly hash?: string; readonly mic?: FakeMic } = {},
) {
  const [script, style] = yield* Effect.all([bundle, css], { concurrency: 2 });
  const mic = Option.fromUndefinedOr(at.mic);
  const asked: Array<Asked> = [];
  const page = yield* openTab({
    width: 1400,
    height: 900,
    microphone: Option.exists(mic, (m) => m.allowed),
    // The page's clock (timers, animation frames, `Date`, `performance.now`) is
    // the test's: it runs on with real time, and a test moves it on with
    // `clock.runFor` rather than waiting out a count-in, a retry or a loop's
    // playback. Audio still runs on its own, real, clock.
    init: [
      CLOCK_SCRIPT,
      TO_BLOB_AT_ONCE,
      ...Arr.filter([HOT_MIC], () => Option.exists(mic, (m) => m.hot === true)),
    ],
    serve: fakeServer(
      new Map([
        ['/lab', respond(labPage(style), 'text/html')],
        ['/lab.js', respond(script, 'text/javascript')],
      ]),
      API,
      [...routes, ...defaults],
      asked,
    ),
  });
  yield* page.goto(`/lab?film=${PROBE}${at.query ?? ''}${at.hash ?? ''}`);
  yield* page.waitFor('.lab-panel');
  const open: OpenLab = { page, asked, errors: page.errors };
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
 * browser plays media without a gesture, its clock is the test's, and the
 * tab closes with the scope.
 */
export const openReview = Effect.fn('lab.fixture.review')(function* (
  routes: ReadonlyArray<FakeRoute>,
  at: ReviewAt = {},
) {
  const script = yield* reviewBundle;
  const asked: Array<Asked> = [];
  const page = yield* openTab({
    ...(at.viewport ?? { width: 1400, height: 900 }),
    microphone: false,
    // The page's clock is the test's, as the lab's is.
    init: [CLOCK_SCRIPT],
    serve: fakeServer(
      new Map([
        ['/', respond(reviewPage, 'text/html')],
        ['/review.js', respond(script, 'text/javascript')],
      ]),
      '',
      routes,
      asked,
    ),
  });
  yield* page.goto(`/${at.search ?? ''}`);
  yield* page.waitFor('.rv-main');
  const open: OpenLab = { page, asked, errors: page.errors };
  return open;
});
