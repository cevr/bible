// The browser tests' Chrome: Bun's one per test process (`tools/chrome.ts`),
// launched by the first case that opens a tab. A case's tab is lent from a
// pool of views and goes back to it when the case ends, so a case pays for a
// page load, not for a new renderer: a fresh view costs Chrome a renderer
// process and a cold compile of the page's script, three to four times the
// CPU of the load itself. Each case still gets an origin of its own
// (`https://<n>.lab.test`, secure, so the microphone may be asked for), so
// cases running at once, or one after another in a view, share no storage
// and no permissions; and between cases the view waits on an empty page of
// the tests' site, its history, scripts and listeners dropped (`lend`).
// Scripts load from one origin for every case (`asset`), so a view's
// renderer compiles them once. The process's flags are the same for every
// case: the renderer's software 2D canvas, media that plays without a
// gesture, and one fake microphone every case shares (`FAKE_MIC`).

import { BunServices } from '@effect/platform-bun';
import { Config, Effect, FileSystem, Option, Path, Schema, Scope, Semaphore } from 'effect';
import { openView, thrownBy } from '../../tools/chrome.ts';
import { BrowserFailed } from '../../tools/errors.ts';
import { type Logged, type Request, type Response, type Tab, type View, makeTab } from './tab.ts';
import { tone } from './tone.ts';

/**
 * The fake microphone every tab hears: a 440 Hz sine at half scale on input
 * 1 of a two-input interface, input 2 silent, four seconds looped. Chromium's
 * fake device runs at 44.1 kHz, as the file does.
 */
const FAKE_MIC = { seconds: 4, amplitude: 0.5, rate: 44100 } as const;

/**
 * The microphone's WAV in the system's temp folder: the same bytes for every
 * run and process, so it is written whole (to a file of this process's, then
 * renamed over the name) and left for the next run.
 */
const micFile = Effect.gen(function* () {
  const fs = yield* FileSystem.FileSystem;
  const temp = yield* Config.String('TMPDIR').pipe(Config.withDefault('/tmp'));
  const wav = (yield* Path.Path).join(temp, 'film-fake-mic.wav');
  const own = `${wav}.${process.pid}`;
  yield* fs.writeFile(
    own,
    tone(FAKE_MIC.seconds, FAKE_MIC.amplitude, { rate: FAKE_MIC.rate, channels: 'left-only' }),
  );
  yield* fs.rename(own, wav);
  return wav;
}).pipe(Effect.orDie, Effect.provide(BunServices.layer));

/** Every test tab's Chrome flags, worked out once per process. */
const flags = Effect.runSync(
  Effect.cached(
    Effect.map(micFile, (wav) => [
      // The renderer's software 2D canvas (`tools/browser.ts`), as every test draws.
      '--disable-accelerated-2d-canvas',
      // Plays media without a gesture: the test is the reviewer, and it never clicks first.
      '--autoplay-policy=no-user-gesture-required',
      '--use-fake-device-for-media-stream',
      `--use-file-for-fake-audio-capture=${wav}`,
    ]),
  ),
);

/** The scope the pooled views live in: the process's, never closed (Chrome goes with the process). */
const forever = Scope.makeUnsafe();

/**
 * Lets an origin use the microphone. Chrome drops every permission it was
 * told of when the protocol session that told it closes, so it is told
 * through a view of its own, opened with the first tab that asks and left
 * open until the process ends.
 */
const allowMicrophone = Effect.runSync(
  Effect.cached(
    Effect.gen(function* () {
      const view = yield* openView(yield* flags, { width: 1, height: 1 }).pipe(
        Effect.provideService(Scope.Scope, forever),
        Effect.orDie,
      );
      yield* Effect.promise(() => view.navigate('about:blank'));
      const one = yield* Semaphore.make(1);
      return (origin: string) =>
        one.withPermits(1)(
          Effect.promise(() =>
            view.cdp('Browser.setPermission', {
              origin,
              permission: { name: 'microphone' },
              setting: 'granted',
            }),
          ),
        );
    }).pipe(Effect.provide(BunServices.layer)),
  ),
);

/** The tests' site: every case's origin is under it, and the assets' origin is it. */
const SITE = 'lab.test';

/** The origin every case loads its scripts from (`asset`). */
const ASSETS = `https://${SITE}`;

/** The page a view waits on between cases: empty, and it clears the tab's name. */
const IDLE = `${ASSETS}/idle`;
const IDLE_PAGE = `<!doctype html><title>idle</title><script>window.name = ''</script>`;

/**
 * A file every case loads from the same URL (its bytes' hash in it), so a
 * view's renderer compiles a script once rather than once a case. A page
 * names it with `scriptOf`.
 */
export interface Asset {
  readonly url: string;
  readonly response: Response;
}

/** `response` as an asset named `name`: CORS-open, so a script from it reports its errors whole. */
export const asset = (name: string, response: Response): Asset => ({
  url: `${ASSETS}/${Bun.hash(response.body).toString(36)}/${name}`,
  response: { ...response, headers: { 'access-control-allow-origin': '*' } },
});

/** The tag that runs `script` (an asset), fetched with CORS as its headers allow. */
export const scriptOf = (script: Asset) => `<script crossorigin src="${script.url}"></script>`;

/** What a case's tab hears from the view it holds: its page's requests, throws and console. */
interface Lease {
  readonly origin: string;
  readonly events: EventTarget;
  readonly console: (type: string, args: ReadonlyArray<unknown>) => void;
}

/** A pooled view: the view, the tab's way of driving it, and the case holding it, if one is. */
interface Slot {
  readonly view: Bun.WebView;
  readonly lent: View;
  readonly held: { lease: Option.Option<Lease> };
}

/** The views no case holds, the last one back on top. */
const idle: Array<Slot> = [];
let made = 0;

/** How many views this process has opened for its tabs: the pool's own test reads it. */
export const viewsMade = () => made;

/**
 * Calls that run one at a time, in order, however their callers fare: run
 * apart from the caller, so a caller interrupted leaves its call out and the
 * next starts once it ends (a view takes one protocol call and one script at
 * a time; Bun refuses a second while one is out).
 */
const inTurn = () => {
  const one = Semaphore.makeUnsafe(1);
  return <A>(call: () => Promise<A>): Promise<A> =>
    Effect.runPromise(
      one.withPermits(1)(
        Effect.tryPromise({
          try: call,
          catch: (cause) => BrowserFailed.make({ reason: String(cause) }),
        }),
      ),
    );
};

/** A paused request, as far as the pool reads it to route it. */
const Paused = Schema.Struct({
  requestId: Schema.String,
  request: Schema.Struct({ url: Schema.String }),
});

/** A protocol call made for no case, its failure (a view closing) of no one's concern. */
const quietly = (call: Promise<unknown>) =>
  Effect.runFork(Effect.ignore(Effect.tryPromise(() => call)));

/**
 * A request the view paused: to the holding case when it is on its origin or
 * the assets'; the idle page answered; anything else (a page of a case that
 * ended, still asking) failed.
 */
const routeRequest = (slot: Slot) => (event: Event) => {
  const data: unknown = Reflect.get(event, 'data');
  Option.map(Schema.decodeUnknownOption(Paused)(data), (paused) => {
    const url = paused.request.url;
    const origin = new URL(url).origin;
    const holder = Option.filter(
      slot.held.lease,
      (lease) => url !== IDLE && (origin === lease.origin || origin === ASSETS),
    );
    if (Option.isSome(holder))
      return holder.value.events.dispatchEvent(new MessageEvent(event.type, { data }));
    if (url === IDLE)
      return quietly(
        slot.lent.cdp('Fetch.fulfillRequest', {
          requestId: paused.requestId,
          responseCode: 200,
          responseHeaders: [{ name: 'content-type', value: 'text/html' }],
          body: Buffer.from(IDLE_PAGE).toString('base64'),
        }),
      );
    return quietly(
      slot.lent.cdp('Fetch.failRequest', { requestId: paused.requestId, errorReason: 'Aborted' }),
    );
  });
};

/** A new view for the pool, its session up, every request to the tests' site paused for it. */
const makeSlot = Effect.gen(function* () {
  const held: Slot['held'] = { lease: Option.none() };
  const view = yield* openView(yield* flags, {
    width: 800,
    height: 600,
    console: (type, ...args) => Option.map(held.lease, (lease) => lease.console(type, args)),
  }).pipe(Effect.provideService(Scope.Scope, forever), Effect.orDie);
  made += 1;
  const protocol = inTurn();
  const scripts = inTurn();
  const slot: Slot = {
    view,
    held,
    lent: {
      cdp: (method, params) => protocol(() => view.cdp(method, params)),
      evaluate: (script) => scripts(() => view.evaluate(script)),
      navigate: (url) => view.navigate(url),
      reload: () => view.reload(),
      resize: (width, height) => view.resize(width, height),
    },
  };
  view.addEventListener('Fetch.requestPaused', routeRequest(slot));
  view.addEventListener('Runtime.exceptionThrown', (event: Event) => {
    Option.map(slot.held.lease, (lease) =>
      lease.events.dispatchEvent(
        new MessageEvent(event.type, { data: Reflect.get(event, 'data') }),
      ),
    );
  });
  yield* Effect.promise(() => view.navigate('about:blank'));
  yield* Effect.promise(() => slot.lent.cdp('Runtime.enable'));
  yield* Effect.promise(() =>
    slot.lent.cdp('Fetch.enable', { patterns: [{ urlPattern: `https://*${SITE}/*` }] }),
  );
  return slot;
}).pipe(Effect.provide(BunServices.layer));

/**
 * A case's hold on a view, `width` × `height`, until the scope closes. Then
 * the view waits on the idle page with no history behind it and goes back
 * to the pool; a view that cannot is closed instead.
 */
const lend = (lease: Lease, width: number, height: number) =>
  Effect.acquireRelease(
    Effect.gen(function* () {
      const slot = yield* Option.match(Option.fromUndefinedOr(idle.pop()), {
        onNone: () => makeSlot,
        onSome: Effect.succeed,
      });
      slot.held.lease = Option.some(lease);
      yield* Effect.promise(() => slot.lent.resize(width, height));
      return slot;
    }),
    (slot) =>
      Effect.gen(function* () {
        slot.held.lease = Option.none();
        yield* Effect.tryPromise(() => slot.lent.navigate(IDLE));
        yield* Effect.tryPromise(() => slot.lent.cdp('Page.resetNavigationHistory'));
        idle.push(slot);
      }).pipe(Effect.catch(() => Effect.sync(() => slot.view.close()))),
  );

let tabs = 0;

/** An object a page logged, as Chrome hands it over: its description. */
const described = Schema.decodeUnknownOption(Schema.Struct({ description: Schema.String }));

/** How a test tab opens: its viewport, whether it may use the microphone, and its server. */
interface TabOptions {
  readonly width: number;
  readonly height: number;
  /** Allowed the microphone, or refused it (the browser's prompt, answered no). */
  readonly microphone: boolean;
  /** Answers every request to the tab's origin; `None` holds it unanswered. */
  readonly serve: (request: Request) => Effect.Effect<Option.Option<Response>>;
  /** The files its pages load from the assets' origin (`asset`). */
  readonly assets: ReadonlyArray<Asset>;
  /** Scripts run before the page's own on every load. */
  readonly init: ReadonlyArray<string>;
}

/** A tab on an origin of its own, on an empty page, given back with the scope. */
export const openTab = (options: TabOptions): Effect.Effect<Tab, never, Scope.Scope> =>
  Effect.gen(function* () {
    const logged: Array<Logged> = [];
    const errors: Array<string> = [];
    tabs += 1;
    const origin = `https://t${tabs}.${SITE}`;
    if (options.microphone) yield* (yield* allowMicrophone)(origin);
    const events = new EventTarget();
    events.addEventListener('Runtime.exceptionThrown', (event: Event) => {
      Option.map(thrownBy(event), (thrown) => errors.push(thrown));
    });
    const slot = yield* lend(
      {
        origin,
        events,
        console: (type, args) => {
          // A primitive as itself, an object as Chrome describes it.
          const text = args
            .map((arg) =>
              Option.match(described(arg), {
                onNone: () => String(arg),
                onSome: (d) => d.description,
              }),
            )
            .join(' ');
          logged.push({ type, text });
          // Solid's reactivity diagnostics: a read or a write the page does not mean.
          if (type.startsWith('warn') && text.startsWith('[STRICT_')) errors.push(text);
        },
      },
      options.width,
      options.height,
    );
    const assets = new Map(options.assets.map((a) => [a.url, a.response]));
    return yield* makeTab(slot.lent, {
      origin,
      events,
      serve: (request) =>
        Option.match(Option.fromUndefinedOr(assets.get(request.url.href)), {
          onNone: () => options.serve(request),
          onSome: Effect.succeedSome,
        }),
      init: options.init,
      logged,
      errors,
    });
  });

/** A response of `type` with `body`, at `status`. */
export const respond = (body: Uint8Array | string, type: string, status = 200): Response => ({
  status,
  type,
  body,
});

/** A server that answers the paths `answers` names, and a 404 to anything else. */
export const servePaths =
  (answers: Readonly<Record<string, Response>>) =>
  (request: Request): Effect.Effect<Option.Option<Response>> =>
    Effect.succeedSome(answers[request.url.pathname] ?? respond('no such page', 'text/plain', 404));
