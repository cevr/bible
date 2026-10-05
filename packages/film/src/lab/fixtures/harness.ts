// The lab's browser tests: the lab page (`fixtures/lab-page.ts`, the real
// `mountLab` over the probe film) bundled with Solid's compiler, served to a
// tab of the test process's Chrome (`browsers.ts`) at its own origin, with the
// lab API answered by routes the test gives (then the defaults below). Every
// request the page makes is kept, so a test can read what the lab wrote.
// The review page (`openReview`) and the player's (`openPlayer`, the play
// page and the Scenes) are served the same way, the player's routes too.

import { BunServices } from '@effect/platform-bun';
import {
  Array as Arr,
  Deferred,
  Duration,
  Effect,
  FileSystem,
  Match,
  Option,
  Predicate,
  Schema,
} from 'effect';
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
import { PAGE_CUT_MARK, PAGE_MOUNTED, type PageRender } from '../../core/page-render.ts';
import { splice } from '../../tools/lab-page.ts';
import { type Asset, asset, openTab, respond, scriptOf } from './browsers.ts';
import { bundled, served } from './bundles.ts';
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

/**
 * A fake lab route: the method, the path under `/api/films/probe` it
 * matches, its answer, and how long the answer takes (none by default; a
 * read the real lab makes in a fresh process takes about a second).
 */
export interface FakeRoute {
  readonly method: 'GET' | 'POST';
  readonly path: RegExp;
  readonly answer: (asked: Asked) => Answer;
  readonly after: Duration.Duration;
}

export const route = (
  method: FakeRoute['method'],
  path: RegExp,
  answer: FakeRoute['answer'],
  after: Duration.Input = Duration.zero,
): FakeRoute => ({ method, path, answer, after: Duration.fromInputUnsafe(after) });

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

/** Scene three's source: its `until` cue, its camera's target and zoom, and a pole, all literals. */
const sourceThree = {
  scene: 'three',
  file: 'scenes/three.ts',
  cues: [cueSource('push')],
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
        return Effect.delay(answer(f.answer(made)), f.after);
      },
    });
  };

/** A page's fake server: the page a path serves (its HTML and its script), then the API (`apiAnswer`). */
const fakeServer =
  (
    pageFor: (request: Request) => Option.Option<Effect.Effect<Response>>,
    prefix: string,
    routes: ReadonlyArray<FakeRoute>,
    asked: Array<Asked>,
  ) =>
  (request: Request): Effect.Effect<Option.Option<Response>> =>
    Option.match(pageFor(request), {
      onSome: Effect.asSome,
      onNone: () => apiAnswer(prefix, routes, asked)(request),
    });

/** What `answer` makes of each request for `name`, on every path the real server serves it on (`pageAt`, `core/api.ts`). */
const servedBy =
  (name: PageName, answer: (request: Request) => Effect.Effect<Response>) =>
  (request: Request): Option.Option<Effect.Effect<Response>> =>
    Option.as(
      Option.filter(pageAt(request.url.pathname), (page) => page === name),
      answer(request),
    );

/** `html` on every path the real server serves `name` on. */
const servedAs = (name: PageName, html: Response) => servedBy(name, () => Effect.succeed(html));

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

/** A desk's window, as the studio is checked on a laptop: 1440 × 900, with a mouse. */
export const DESK: Viewport = { width: 1440, height: 900 };

/** A phone's window, as the studio is designed for first: 390 × 844, with a finger. */
export const PHONE: Viewport = { width: 390, height: 844, coarse: true };

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
  // The panel stands before the film is staged; its tools are in it once it is.
  yield* page.waitFor('.lab-panel[data-staged="true"]');
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
  /**
   * A served page's render, cut this long after it began if it has not ended
   * (`rendered`), as the lab cuts one; none: each render ends.
   */
  readonly cut?: Duration.Input;
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

/** A page the tests serve rendered on the server. */
type ServedName = 'review' | 'lab' | 'player';

/**
 * A page as the tests serve it rendered: its server entry, bundled as the
 * lab bundles it, and its script with Solid's development build (it warns of
 * a hydration mismatch), each once, when a test first asks; its HTML entry
 * as the app has it; the API its reads and requests go to (by their path
 * past `prefix`, then the lab's `defaults` after the test's own routes); and
 * the link it opens at.
 */
interface ServedPage {
  readonly render: Effect.Effect<PageRender>;
  readonly script: Effect.Effect<Asset>;
  /** The page's HTML, stamped with the build it was served at when the test gives one. */
  readonly html: (script: Asset, build: Option.Option<PageBuild>) => string;
  readonly prefix: string;
  readonly defaults: ReadonlyArray<FakeRoute>;
  readonly home: string;
}

const SERVED: Readonly<Record<ServedName, ServedPage>> = {
  review: {
    render: Effect.runSync(Effect.cached(served('../review/server.tsx', 'reviewRender'))),
    script: Effect.runSync(
      Effect.cached(scriptAsset('review-hydrated-page.ts', 'review-hydrated.js')),
    ),
    html: (script, build) => reviewPage(script, build),
    prefix: '',
    defaults: [],
    home: '/',
  },
  lab: {
    render: Effect.runSync(Effect.cached(served('../film-server.tsx', 'labRender'))),
    script: Effect.runSync(Effect.cached(scriptAsset('lab-hydrated-page.ts', 'lab-hydrated.js'))),
    html: (script, build) => labPage(css, script, build),
    prefix: API,
    defaults,
    home: pageHref.lab(PROBE),
  },
  player: {
    render: Effect.runSync(Effect.cached(served('../film-server.tsx', 'playRender'))),
    script: Effect.runSync(
      Effect.cached(scriptAsset('player-hydrated-page.ts', 'player-hydrated.js')),
    ),
    html: (script) => playerPage(css, script),
    prefix: API,
    defaults,
    home: pageHref.play(PROBE),
  },
};

/** A page's render, whole: its head, its body's class and its markup. */
interface Rendered {
  readonly head: string;
  readonly bodyClass: string;
  readonly body: string;
  /** The markup as the render wrote it, piece by piece: what a browser could paint first is the first. */
  readonly pieces: ReadonlyArray<string>;
}

/** The fake server's answer as the render's fetch resolves it. */
const fetched = (response: Response): globalThis.Response =>
  new globalThis.Response(
    new Blob([
      Match.value(response.body).pipe(
        Match.when(Predicate.isString, (text) => text),
        Match.orElse((bytes) => new Uint8Array(bytes)),
      ),
    ]),
    {
      status: response.status,
      headers: { 'content-type': response.type, ...response.headers },
    },
  );

/**
 * `render` of the page at `url`, whole, its reads answered by `read` (a
 * GET of the path, as the lab answers a render's reads); a held read holds
 * it, and a failed render fails the test. Given `cut`, a render still under
 * way that long after it began is cut as the lab cuts one (`END_WAIT`,
 * `tools/page-render.ts`): stopped, its markup what it wrote and the mark
 * of a cut (`PAGE_CUT_MARK`).
 */
const rendered = (
  render: PageRender,
  url: URL,
  read: (request: Request) => Effect.Effect<Option.Option<Response>>,
  cut: Option.Option<Duration.Duration>,
): Effect.Effect<Rendered> =>
  Effect.suspend(() => {
    const written: Written = { head: '', body: [] };
    const sofar = (): Rendered => ({
      head: written.head,
      bodyClass: render.bodyClass,
      body: written.body.join(''),
      pieces: written.body,
    });
    const whole = Effect.map(rendering(render, url, read, written), sofar);
    return Option.match(cut, {
      onNone: () => whole,
      onSome: (after) =>
        Effect.map(Effect.timeoutOption(whole, after), (ended) =>
          Option.getOrElse(ended, () => {
            written.body.push(PAGE_CUT_MARK);
            return sofar();
          }),
        ),
    });
  });

/** What a render has written so far: its head, and each piece of its markup in order. */
interface Written {
  head: string;
  readonly body: Array<string>;
}

/** `render` of the page at `url` to its end, what it writes kept in `written` as it is written. */
const rendering = (
  render: PageRender,
  url: URL,
  read: (request: Request) => Effect.Effect<Option.Option<Response>>,
  written: Written,
): Effect.Effect<void> =>
  Effect.callback<void>((resume, signal) => {
    // The render's client asks at the page's origin, so every read's URL is whole.
    const readOf = (input: RequestInfo | URL) =>
      Effect.runPromise(
        read({ method: 'GET', url: new URL(new globalThis.Request(input).url), body: '' }).pipe(
          Effect.flatMap(Option.match({ onNone: () => Effect.never, onSome: Effect.succeed })),
          Effect.map(fetched),
        ),
      );
    render.render(
      {
        url: `${url.origin}${url.pathname}${url.search}`,
        signal,
        fetch: Object.assign(readOf, { preconnect: globalThis.fetch.preconnect }),
      },
      {
        head: (html) => {
          written.head = html;
        },
        write: (html) => {
          written.body.push(html);
        },
        end: () => resume(Effect.void),
        fail: (reason) => resume(Effect.die(`the page's server render failed: ${reason}`)),
      },
    );
  });

/** A page the server rendered: the link it was asked at, the document it answered, and its markup's pieces in order. */
interface Document {
  readonly path: string;
  readonly html: string;
  readonly pieces: ReadonlyArray<string>;
}

/** A page served as the lab serves a page it renders (PA-12): what the server read and answered too. */
interface OpenServed extends OpenLab {
  /** The reads the server's renders made, apart from the page's own requests (`asked`). */
  readonly read: ReadonlyArray<Asked>;
  /** Each document the server answered, in order. */
  readonly documents: ReadonlyArray<Document>;
}

/**
 * Open page `name` (the review, the lab, or the Scenes and Play pages) at
 * `href` as the lab serves it once it renders the page on the server: each
 * document is the page's server entry (`review/server.tsx`,
 * `film-server.tsx`) rendered at the link asked, its reads answered by
 * `routes` (and kept in `read`), spliced into the page's HTML as the lab
 * splices it (`splice`, `tools/lab-page.ts`); the browser's script (the
 * real entry, with Solid's development build) hydrates it. The page's own
 * requests are kept in `asked`. Done once the page says it is hydrated (a
 * page whose render was cut, `at.cut`: rendered anew); a
 * render that fails on the way (one that writes state among them, `served`)
 * is answered as an error and fails the open at once, in its words, where
 * the page would wait for a document that never comes.
 */
export const openServed = Effect.fn('lab.fixture.served')(function* (
  name: ServedName,
  routes: ReadonlyArray<FakeRoute>,
  at: ReviewAt = {},
) {
  const spec = SERVED[name];
  const build = Option.fromUndefinedOr(at.build);
  const cut = Option.map(Option.fromUndefinedOr(at.cut), Duration.fromInputUnsafe);
  const render = yield* spec.render;
  const script = yield* spec.script;
  const all = [...routes, ...spec.defaults];
  const asked: Array<Asked> = [];
  const read: Array<Asked> = [];
  const documents: Array<Document> = [];
  const failed = yield* Deferred.make<never>();
  const document = (request: Request) =>
    Effect.gen(function* () {
      const page = yield* rendered(render, request.url, apiAnswer(spec.prefix, all, read), cut);
      const [before, after] = yield* Option.match(splice(spec.html(script, build), page), {
        onNone: () => Effect.die(`the ${name} page has no head or body to splice into`),
        onSome: Effect.succeed,
      });
      const html = `${before}${page.body}${after}`;
      documents.push({
        path: `${request.url.pathname}${request.url.search}`,
        html,
        pieces: page.pieces,
      });
      return respond(html, 'text/html');
    }).pipe(
      Effect.catchCause((cause) =>
        Effect.as(
          Deferred.failCause(failed, cause),
          respond(`the ${name} page's server render failed`, 'text/plain', 500),
        ),
      ),
    );
  const page = yield* openTab({
    ...(at.viewport ?? DESK),
    microphone: false,
    init: [CLOCK_SCRIPT],
    assets: [script],
    serve: fakeServer(servedBy(name, document), spec.prefix, all, asked),
  });
  yield* page.goto(at.href ?? spec.home);
  // A cut page is rendered anew; any other hydrates the server's markup.
  const mounted = Option.match(cut, { onNone: () => 'hydrated', onSome: () => 'rendered' });
  yield* Effect.raceFirst(
    page.until(`document.body.getAttribute('${PAGE_MOUNTED}') === '${mounted}'`, {
      now: `document.body.getAttribute('${PAGE_MOUNTED}')`,
      say: (now) => `the ${name} page was not ${mounted}: its body says it was mounted ${now}`,
    }),
    Deferred.await(failed),
  );
  const open: OpenServed = { page, asked, errors: page.errors, read, documents };
  return open;
});
