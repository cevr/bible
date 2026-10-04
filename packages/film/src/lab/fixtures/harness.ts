// The lab's browser tests: the lab page (`fixtures/lab-page.ts`, the real
// `mountLab` over the probe film) bundled with Solid's compiler, served to a
// tab of the test process's Chrome (`browsers.ts`) at its own origin, with the
// lab API answered by routes the test gives (then the defaults below). Every
// request the page makes is kept, so a test can read what the lab wrote.
// The review page (`openReview`) and the player's (`openPlayer`, the play
// page and the Scenes) are served the same way, the player's routes too.

import { BunServices } from '@effect/platform-bun';
import { Array as Arr, Deferred, Effect, FileSystem, Option, Schema } from 'effect';
import {
  type CompareView,
  LabHttpApi,
  declares,
  type PageName,
  Refusal,
  pageAt,
  pageHref,
  statusOf,
} from '../../core/api.ts';
import type { PageBuild } from '../../core/schema.ts';
import { type Asset, asset, openTab, respond, scriptOf } from './browsers.ts';
import { bundled } from './bundles.ts';
import { CLOCK_SCRIPT } from './clock.ts';
import type { LabSelection } from '../../command/selection.ts';
import { labHref } from '../place.ts';
import type { LabMode } from '../mode.ts';
import { PROBE, probeFilm } from './probe-film.ts';
import { type Request, type Response, type Tab, jsonOf } from './tab.ts';

const API = `/api/films/${PROBE}`;

/** The probe film as the lab page lays it out: where each scene starts. */
const probePlaced = probeFilm().placed;

/** What a lab link picks: a cue or a knob of a scene, and a note. */
interface LabPick {
  readonly selection?: LabSelection;
  readonly note?: string;
  readonly view?: CompareView;
}

/** The probe film's lab at film seconds `T` with `pick`: the link the lab itself writes (`labHref`). */
export const labAt = (T: number, pick: LabPick = {}): string =>
  labHref(
    PROBE,
    probePlaced,
    {
      selection: Option.fromUndefinedOr(pick.selection),
      note: Option.fromUndefinedOr(pick.note),
      view: Option.getOrElse(Option.fromUndefinedOr(pick.view), (): CompareView => 'off'),
    },
    T,
  );

/**
 * The film seconds the page's URL names, as a page-side expression: its
 * path's scene's start (the probe film's) plus `#t=`, as `labOpensAt` reads
 * a lab link; a play page's `#t=` is film time. The one reader of the time
 * in the URL the browser tests poll.
 */
export const URL_T = `(() => {
  const starts = ${jsonOf(Object.fromEntries(probePlaced.map((p) => [p.spec.id, p.start])))};
  const url = new URL(location.href);
  const scene = /^\\/films\\/[^/]+\\/lab\\/([^/]+)$/.exec(url.pathname)?.[1] ?? '';
  return (starts[decodeURIComponent(scene)] ?? 0) + Number(new URLSearchParams(url.hash.slice(1)).get('t'));
})()`;

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

/** A fake lab route: the method, the path under `/api/films/probe` it matches, and its answer. */
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

/** The id the fake lab gives the change a write of `target` to `scene` makes (`HistoryStep.change`). */
export const changeOf = (target: string, scene = 'one'): string => `${scene}:${target}`;

/** A write the server took, as it answers one, with the change it made. */
const wrote = (target: string, scene = 'one') => ({
  scene,
  file: `scenes/${scene}.ts`,
  target,
  change: changeOf(target, scene),
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
  route('POST', /^\/scenes\/\w+\/cues\//, () => json(wrote('cue'))),
  route('POST', /^\/scenes\/\w+\/knobs\//, () => json(wrote('knob'))),
  route('POST', /^\/(undo|redo)$/, (asked) => json(wrote(asked.path.slice(1)))),
];

/**
 * A page's script (`entry`, beside this file), bundled for the browser with
 * Solid's compiler: read from the suite's fresh bundles, or built once when
 * running its test file directly, however many cases open the page.
 */
export const bundleOf = (entry: string) => Effect.runSync(Effect.cached(bundled(entry)));

/** A page's script (`entry`) as the asset `name` (`browsers.ts`). */
const scriptAsset = (entry: string, name: string): Effect.Effect<Asset> =>
  Effect.map(bundled(entry), (js) => asset(name, respond(js, 'text/javascript')));

/**
 * The lab's and the review's scripts, the tokens and the player's styles: read as the
 * module loads, once per process, so no case's timeout counts
 * them (on a loaded runner the first cases spent 1-2 s waiting on them).
 */
// oxlint-disable-next-line effect/noAsyncFunction -- the module's own load waits for its setup, so no case's timeout counts it
const [labScript, reviewScript, playerScript, tokens, playerCss] = await Effect.runPromise(
  Effect.all(
    [
      scriptAsset('lab-page.ts', 'lab.js'),
      scriptAsset('review-page.ts', 'review.js'),
      scriptAsset('player-page.ts', 'player.js'),
      FileSystem.FileSystem.use((fs) =>
        fs.readFileString(`${import.meta.dir}/../../player/tokens.css`),
      ).pipe(Effect.orDie, Effect.provide(BunServices.layer)),
      FileSystem.FileSystem.use((fs) =>
        fs.readFileString(`${import.meta.dir}/../../player/player.css`),
      ).pipe(Effect.orDie, Effect.provide(BunServices.layer)),
    ],
    { concurrency: 5 },
  ),
);

/** The styles `lab.html` and `index.html` link: the tokens, then the player's. */
const css = `${tokens}${playerCss}`;

/** The `<meta>`s a page served at `build` carries (`lab-build`, `lab-server`); none unstamped. */
const stampOf = (build: Option.Option<PageBuild>) =>
  Option.match(build, {
    onNone: () => '',
    onSome: (b) =>
      `<meta name="lab-build" content="${b.build}"><meta name="lab-server" content="${b.server}">`,
  });

/**
 * The lab page as `lab.html` has it, with the player's styles inline, and
 * the build it was served at as the lab's server stamps it (`lab-build`,
 * `lab-server`) when the test gives one: then it waits on the rebuild.
 */
const labPage = (style: string, script: Asset, build: Option.Option<PageBuild>) =>
  `<!doctype html><html><head><meta charset="utf-8"><title>Lab</title><style>${style}</style>${stampOf(build)}</head><body class="lab">${scriptOf(script)}</body></html>`;

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

/** Whether the lab's API declares a route a request reaches (`declares`, `core/api.ts`). */
const declared = declares(LabHttpApi);

/**
 * A request to the API: kept in `asked` (its path past `prefix`) and
 * answered by the first of `routes` that matches it, or a 404. A fake that
 * matches a path `LabHttpApi` does not declare answers a 500 naming it: the
 * test would otherwise pass over a route the real server never serves.
 */
const apiAnswer =
  (prefix: string, routes: ReadonlyArray<FakeRoute>, asked: Array<Asked>) =>
  (request: Request): Effect.Effect<Option.Option<Response>> => {
    // Past `prefix` when under it (`/scenes/one/source`), else whole (`/api/review/build`).
    const under = Option.liftPredicate(request.url.pathname, (p) => p.startsWith(`${prefix}/`));
    const made: Asked = {
      method: request.method,
      path: `${Option.getOrElse(
        Option.map(under, (p) => p.slice(prefix.length)),
        () => request.url.pathname,
      )}${request.url.search}`,
      body: bodyOf(request),
    };
    asked.push(made);
    const found = routes.find((f) => f.method === made.method && f.path.test(made.path));
    return Option.match(Option.fromUndefinedOr(found), {
      onNone: () => Effect.succeedSome(respond('no fake route', 'text/plain', 404)),
      onSome: (f) => {
        if (!declared(request.method, request.url.pathname))
          return Effect.succeedSome(
            respond(
              `a fake route answers ${request.method} ${request.url.pathname}, which the lab's API does not declare`,
              'text/plain',
              500,
            ),
          );
        return answer(f.answer(made));
      },
    });
  };

/** A page's fake server: the page a path serves (its HTML and its script), then the API (`apiAnswer`). */
const fakeServer =
  (
    pageFor: (pathname: string) => Option.Option<Response>,
    prefix: string,
    routes: ReadonlyArray<FakeRoute>,
    asked: Array<Asked>,
  ) =>
  (request: Request): Effect.Effect<Option.Option<Response>> =>
    Option.match(pageFor(request.url.pathname), {
      onSome: Effect.succeedSome,
      onNone: () => apiAnswer(prefix, routes, asked)(request),
    });

/** `html` on every path the real server serves `name` on (`pageAt`, `core/api.ts`). */
const servedAs =
  (name: PageName, html: Response) =>
  (pathname: string): Option.Option<Response> =>
    Option.as(
      Option.filter(pageAt(pathname), (page) => page === name),
      html,
    );

/**
 * `canvas.toBlob` encoding at once, from `toDataURL`: the same image in the
 * same type. Chromium encodes a toBlob in the renderer's idle time and, when
 * a page animating on a loaded machine leaves none, only after its 5 s
 * fallback, so a note's still took 1 s or 7 s by chance. The data URL is
 * read back as a blob by the browser (a 640×360 still's half-megabyte of
 * base64 in a few ms, where a decode in script took 20), answered after the
 * call, as the real one is.
 */
const TO_BLOB_AT_ONCE = `HTMLCanvasElement.prototype.toBlob = function (done, type, quality) {
  fetch(this.toDataURL(type, quality)).then((r) => r.blob()).then(done);
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
 * A page open in a tab of its own: the tab, what it asked of its server, and any
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
 * A page's window: its size, and with `coarse` a phone's pointer (touch
 * emulation, so `(pointer: coarse)` matches); none, a mouse.
 */
export interface Viewport {
  readonly width: number;
  readonly height: number;
  readonly coarse?: boolean;
}

/** A desk's window: wide, with a mouse. */
const DESK: Viewport = { width: 1400, height: 900 };

/**
 * Open the lab at `href` (`pageHref.lab`, `pageHref.labScene`, `core/api.ts`;
 * the probe film's lab when none), served on every lab place as the server
 * serves it, with `routes` answering the API before the defaults, and `mic`
 * as its microphone when given, in `mode` when given. The tab goes back to
 * the pool with the scope.
 */
export const openLab = Effect.fn('lab.fixture.open')(function* (
  routes: ReadonlyArray<FakeRoute> = [],
  at: {
    readonly href?: string;
    readonly mic?: FakeMic;
    /** The build the page is served at, as the lab's server stamps it; none: it waits on no rebuild. */
    readonly build?: PageBuild;
    /** The mode to show, picked on the mode tray as the owner would; none: the first (Edit). */
    readonly mode?: LabMode;
    /** The window, and its pointer; none: a desk's, 1400 × 900 with a mouse. */
    readonly viewport?: Viewport;
  } = {},
) {
  const script = labScript;
  const mic = Option.fromUndefinedOr(at.mic);
  const asked: Array<Asked> = [];
  const page = yield* openTab({
    ...(at.viewport ?? DESK),
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
    assets: [script],
    serve: fakeServer(
      servedAs('lab', respond(labPage(css, script, Option.fromUndefinedOr(at.build)), 'text/html')),
      API,
      [...routes, ...defaults],
      asked,
    ),
  });
  yield* page.goto(at.href ?? pageHref.lab(PROBE));
  yield* page.waitFor('.lab-panel');
  for (const mode of Option.toArray(Option.fromUndefinedOr(at.mode))) {
    yield* page.click(`.lab-modes [data-mode-pick="${mode}"]`);
    yield* page.waitFor(`.lab-panel[data-mode="${mode}"]`);
  }
  const open: OpenLab = { page, asked, errors: page.errors };
  return open;
});

/** The player's page as the app's `index.html` has it, with its styles inline. */
const playerPage = (style: string, script: Asset) =>
  `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Player</title><style>${style}</style></head><body>${scriptOf(script)}</body></html>`;

/** Where the player opens, and how wide its window is. */
interface PlayerAt {
  /** The link opened (`pageHref.play`, `pageHref.scenes`, `core/api.ts`). */
  readonly href: string;
  readonly viewport: Viewport;
}

/**
 * Open the player (`fixtures/player-page.ts`, the real `mountPlay` over the
 * probe film) at `href`, served on every player place as the lab serves it,
 * in a window `viewport` wide, with `routes` answering its API requests
 * (then the defaults), and wait until `ready` is on the page. Its
 * clock is the test's, and the tab goes back to the pool with the scope.
 */
export const openPlayer = Effect.fn('lab.fixture.player')(function* (
  at: PlayerAt,
  ready: string,
  routes: ReadonlyArray<FakeRoute> = [],
) {
  const asked: Array<Asked> = [];
  const page = yield* openTab({
    ...at.viewport,
    microphone: false,
    init: [CLOCK_SCRIPT],
    assets: [playerScript],
    serve: fakeServer(
      servedAs('player', respond(playerPage(css, playerScript), 'text/html')),
      API,
      [...routes, ...defaults],
      asked,
    ),
  });
  yield* page.goto(at.href);
  yield* page.waitFor(ready);
  const open: OpenLab = { page, asked, errors: page.errors };
  return open;
});

/** The review page, stamped with the build it was served at when the test gives one: then a film's choices hear its mixes. */
const reviewPage = (script: Asset, build: Option.Option<PageBuild>) =>
  `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Film review</title><style>${tokens}</style>${stampOf(build)}</head><body>${scriptOf(script)}</body></html>`;

/** Where the review opens, and how wide its window is (a phone's, or a desk's). */
interface ReviewAt {
  /** The link opened (`pageHref`, `core/api.ts`): home when none. */
  readonly href?: string;
  readonly viewport?: Viewport;
  /** The build the page was served at, as the lab stamps it; none: unstamped (it hears no mixes). */
  readonly build?: PageBuild;
}

/**
 * Open the review page (`fixtures/review-page.ts`, the real `mountReview`)
 * at `href`, served on every review place as the lab serves it, with
 * `routes` answering its requests by their whole path (`/api/review/index`,
 * `/api/review/files/…`): what none answers is a 404. The browser plays
 * media without a gesture, its clock is the test's, and the tab goes back to
 * the pool with the scope.
 */
export const openReview = Effect.fn('lab.fixture.review')(function* (
  routes: ReadonlyArray<FakeRoute>,
  at: ReviewAt = {},
) {
  const script = reviewScript;
  const asked: Array<Asked> = [];
  const page = yield* openTab({
    ...(at.viewport ?? DESK),
    microphone: false,
    // The page's clock is the test's, as the lab's is.
    init: [CLOCK_SCRIPT],
    assets: [script],
    serve: fakeServer(
      servedAs(
        'review',
        respond(reviewPage(script, Option.fromUndefinedOr(at.build)), 'text/html'),
      ),
      '',
      routes,
      asked,
    ),
  });
  yield* page.goto(at.href ?? '/');
  yield* page.waitFor('.rv-main');
  const open: OpenLab = { page, asked, errors: page.errors };
  return open;
});
