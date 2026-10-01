// A browser test's tab: a Bun.WebView of the process's Chrome (`browsers.ts`)
// driven over the DevTools protocol, as Effects. Every request to the tab's
// own origin is answered by the test (`serve`), never the network; what the
// page throws is kept; input is native (trusted) mouse and key events; waits
// run in the page on its real timers, so a stopped page clock (`clock.ts`)
// never stops a wait. A wait or an action on an element waits for it to be
// there and shown, up to `WAIT_MS`, and fails saying what it waited for.

import { Effect, FiberSet, Option, Schema, Semaphore } from 'effect';
import { thrownBy } from '../../tools/chrome.ts';
import { BrowserFailed } from '../../tools/errors.ts';
import { CLOCK, REAL_TIMERS } from './clock.ts';

/** How long a wait or an action waits for the page before it fails. */
const WAIT_MS = 15_000;

/** How many times a wait runs again in a page loaded under it before it gives up. */
const RUNS = 20;

/** A request the page made, as the test's server sees it. */
export interface Request {
  readonly method: string;
  readonly url: URL;
  /** The body, as text (a page's JSON); empty when it sent none. */
  readonly body: string;
}

/** What the test's server answers: a status, the body's type, and the body. */
export interface Response {
  readonly status: number;
  readonly type: string;
  readonly body: Uint8Array | string;
}

/** A request answered: its URL and the status it was given. */
interface Answered {
  readonly url: string;
  readonly status: number;
}

/** A console message the page logged. */
export interface Logged {
  readonly type: string;
  readonly text: string;
}

/** An element's box in the viewport, in CSS pixels. */
interface Box {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

export interface Tab {
  /** What the page threw, and every `[STRICT_…]` reactivity warning it logged. */
  readonly errors: ReadonlyArray<string>;
  /** Every console message, in order. */
  readonly logged: ReadonlyArray<Logged>;
  /** `script` (an expression, or statements) run in the page: its answer, awaited, as JSON. */
  readonly evaluate: <A = unknown>(script: string) => Effect.Effect<A>;
  /**
   * Wait until `script`, run in the page, is truthy. A timeout fails saying
   * `failure.say` of what `failure.now`, run in the page then, answers (as JSON).
   */
  readonly until: (
    script: string,
    failure?: { readonly now: string; readonly say: (now: string) => string },
  ) => Effect.Effect<void>;
  /** Wait until `selector` is in the page and shown. */
  readonly waitFor: (selector: string) => Effect.Effect<void>;
  /** Wait until `selector` is in the page, shown or not. */
  readonly attached: (selector: string) => Effect.Effect<void>;
  /** The box of the element at `selector`, once it is shown. */
  readonly box: (selector: string) => Effect.Effect<Box>;
  /** Click the middle of the element at `selector` once it is shown, enabled, still and on top. */
  readonly click: (selector: string) => Effect.Effect<void>;
  /** Clear the field at `selector` and type `value` into it. */
  readonly fill: (selector: string, value: string) => Effect.Effect<void>;
  readonly focus: (selector: string) => Effect.Effect<void>;
  /** Pick the option `value` of the select at `selector`. */
  readonly select: (selector: string, value: string) => Effect.Effect<void>;
  /** Press `key` (`Enter`, `Space`, `ArrowLeft`, `r`, `Shift+ArrowRight`) in the focused element. */
  readonly press: (key: string) => Effect.Effect<void>;
  /** Focus `selector`, then press `key` in it. */
  readonly pressIn: (selector: string, key: string) => Effect.Effect<void>;
  readonly mouse: {
    /** Move to `x`, `y` in `steps` moves from where the mouse is. */
    readonly move: (x: number, y: number, steps?: number) => Effect.Effect<void>;
    readonly down: Effect.Effect<void>;
    readonly up: Effect.Effect<void>;
    readonly click: (x: number, y: number) => Effect.Effect<void>;
  };
  /** Go to `path` (`/lab?…`) on the tab's origin; done when it has loaded. */
  readonly goto: (path: string) => Effect.Effect<void>;
  readonly reload: Effect.Effect<void>;
  /** Back a step in the tab's history: wait on what the page then shows. */
  readonly back: Effect.Effect<void>;
  /** The page's URL now (its hash and query as the page last wrote them). */
  readonly url: Effect.Effect<string>;
  readonly resize: (width: number, height: number) => Effect.Effect<void>;
  /** Mark the page as it stands: the Effect it gives waits for the next page to have loaded. */
  readonly nextLoad: Effect.Effect<Effect.Effect<void>>;
  /** Start listening for an answer `which` matches: the Effect it gives waits for it. */
  readonly nextAnswer: (which: (a: Answered) => boolean) => Effect.Effect<Effect.Effect<void>>;
  /** The page's clock (`clock.ts`), once installed. */
  readonly clock: {
    readonly runFor: (ms: number) => Effect.Effect<void>;
    readonly fastForward: (ms: number) => Effect.Effect<void>;
    readonly pauseAt: (epochMs: number) => Effect.Effect<void>;
  };
}

/** Any value as JSON text, to write into a script the page runs. */
export const jsonOf = Schema.encodeSync(Schema.fromJsonString(Schema.Unknown));

/** A key as the DevTools protocol dispatches it: `text` is what it types, empty for none. */
interface Key {
  readonly key: string;
  readonly code: string;
  readonly keyCode: number;
  readonly text: string;
}

const named = (key: string, code: string, keyCode: number, text = ''): Key => ({
  key,
  code,
  keyCode,
  text,
});

const SPACE = named(' ', 'Space', 32, ' ');

/** The keys the tests press by name. */
const NAMED = new Map<string, Key>([
  [' ', SPACE],
  ['Space', SPACE],
  ['Enter', named('Enter', 'Enter', 13, '\r')],
  ['Escape', named('Escape', 'Escape', 27)],
  ['Tab', named('Tab', 'Tab', 9)],
  ['Backspace', named('Backspace', 'Backspace', 8)],
  ['Delete', named('Delete', 'Delete', 46)],
  ['ArrowLeft', named('ArrowLeft', 'ArrowLeft', 37)],
  ['ArrowUp', named('ArrowUp', 'ArrowUp', 38)],
  ['ArrowRight', named('ArrowRight', 'ArrowRight', 39)],
  ['ArrowDown', named('ArrowDown', 'ArrowDown', 40)],
  ['Shift', named('Shift', 'ShiftLeft', 16)],
  ['Control', named('Control', 'ControlLeft', 17)],
  ['Alt', named('Alt', 'AltLeft', 18)],
  ['Meta', named('Meta', 'MetaLeft', 91)],
]);

/** The DevTools modifier bit of each modifier key. */
const MODIFIER = new Map([
  ['Alt', 1],
  ['Control', 2],
  ['Meta', 4],
  ['Shift', 8],
]);

/** A letter or digit key, typing itself. */
const charKey = (name: string): Key => {
  const upper = name.toUpperCase();
  if (/\d/.test(name)) return named(name, `Digit${name}`, upper.charCodeAt(0), name);
  return named(name, `Key${upper}`, upper.charCodeAt(0), name);
};

const keyOf = (name: string): Option.Option<Key> =>
  Option.orElse(Option.fromUndefinedOr(NAMED.get(name)), () =>
    Option.map(
      Option.liftPredicate(name, (n) => /^[a-z0-9]$/i.test(n)),
      charKey,
    ),
  );

/** What a page-side wait answers: the answer it waited for, that it timed out, or (its page gone) nothing. */
type Waited<A> =
  | { readonly _tag: 'Answered'; readonly answer: A }
  | { readonly _tag: 'TimedOut' }
  | { readonly _tag: 'Gone' };

/**
 * A page-side wait: `ready`, a function expression the page calls until it
 * answers something other than `undefined`, on the page's real timers, for at
 * most `WAIT_MS`.
 */
const waitIn = (ready: string) => `new Promise((done) => {
  const timers = globalThis[Symbol.for('${REAL_TIMERS}')] ?? { setTimeout: globalThis.setTimeout.bind(globalThis), perf: performance.now.bind(performance) };
  const ready = ${ready};
  const end = timers.perf() + ${WAIT_MS};
  const look = () => {
    let answer;
    try { answer = ready(); } catch (e) { answer = undefined; }
    if (answer !== undefined) return done({ _tag: 'Answered', answer });
    if (timers.perf() > end) return done({ _tag: 'TimedOut' });
    timers.setTimeout(look, 16);
  };
  look();
})`;

/** The first element at `selector` when it is shown (a box, not hidden), as a function expression. */
const shownAt = (selector: string) => `() => {
  const el = document.querySelector(${jsonOf(selector)});
  if (el === null) return undefined;
  const r = el.getBoundingClientRect();
  if (r.width === 0 || r.height === 0 || getComputedStyle(el).visibility === 'hidden') return undefined;
  return el;
}`;

/** `Fetch.requestPaused`'s parameters, as far as the tab reads them. */
const Paused = Schema.Struct({
  requestId: Schema.String,
  request: Schema.Struct({
    url: Schema.String,
    method: Schema.String,
    postData: Schema.optionalKey(Schema.String),
    postDataEntries: Schema.optionalKey(
      Schema.Array(Schema.Struct({ bytes: Schema.optionalKey(Schema.String) })),
    ),
  }),
});

/** A request's body as text: its parts (base64) joined, or its text, or nothing. */
const bodyOf = (request: typeof Paused.Type.request) =>
  Option.match(Option.fromUndefinedOr(request.postDataEntries), {
    onNone: () => Option.getOrElse(Option.fromUndefinedOr(request.postData), () => ''),
    onSome: (entries) =>
      entries
        .map((e) =>
          Buffer.from(
            Option.getOrElse(Option.fromUndefinedOr(e.bytes), () => ''),
            'base64',
          ),
        )
        .map((bytes) => bytes.toString('utf8'))
        .join(''),
  });

/** A protocol call's parameters. */
type Wire = string | number | boolean | ReadonlyArray<Wire> | { readonly [key: string]: Wire };

/**
 * The tab over `view`, once it has navigated (so its protocol session is
 * up): `serve` answers every request to `origin`; `init` are scripts run
 * before the page's own on every load.
 */
export const makeTab = (
  view: Bun.WebView,
  page: {
    readonly origin: string;
    readonly serve: (request: Request) => Effect.Effect<Option.Option<Response>>;
    readonly init: ReadonlyArray<string>;
    /** The page's console, as the view hands it over. */
    readonly logged: ReadonlyArray<Logged>;
    /** What the page has done wrong so far; what it throws is added. */
    readonly errors: Array<string>;
  },
) =>
  Effect.gen(function* () {
    const { origin, serve, init, logged, errors } = page;
    // A view takes one protocol call and one script at a time (Bun refuses a
    // second while one is out), but the two run beside each other: a script
    // the page is still running (a wait) never holds up an answer to a request.
    const protocol = yield* Semaphore.make(1);
    const scripts = yield* Semaphore.make(1);
    const send = (method: string, params: { readonly [key: string]: Wire } = {}) =>
      protocol.withPermits(1)(Effect.tryPromise(() => view.cdp(method, params)));
    const call = (method: string, params: { readonly [key: string]: Wire } = {}) =>
      Effect.asVoid(Effect.orDie(send(method, params)));
    // The page's requests, answered while the tab is open: closing it drops the rest.
    const answering = yield* FiberSet.makeRuntime();
    const answerListeners = new Set<(a: Answered) => void>();

    /** Answer the paused request as the test's server does; a hold is never answered. */
    const answer = (paused: typeof Paused.Type) =>
      Effect.flatMap(
        serve({
          method: paused.request.method,
          url: new URL(paused.request.url),
          body: bodyOf(paused.request),
        }),
        Option.match({
          onNone: () => Effect.void,
          onSome: (r) =>
            send('Fetch.fulfillRequest', {
              requestId: paused.requestId,
              responseCode: r.status,
              responseHeaders: [{ name: 'content-type', value: r.type }],
              body: Buffer.from(r.body).toString('base64'),
            }).pipe(
              // A tab closed with requests still waiting.
              Effect.ignore,
              Effect.andThen(
                Effect.sync(() => {
                  for (const listener of [...answerListeners])
                    listener({ url: paused.request.url, status: r.status });
                }),
              ),
            ),
        }),
      );

    view.addEventListener('Runtime.exceptionThrown', (event: Event) => {
      Option.map(thrownBy(event), (thrown) => errors.push(thrown));
    });
    view.addEventListener('Fetch.requestPaused', (event: Event) => {
      Option.map(Schema.decodeUnknownOption(Paused)(Reflect.get(event, 'data')), (paused) =>
        answering(answer(paused)),
      );
    });

    yield* call('Runtime.enable');
    yield* call('Fetch.enable', { patterns: [{ urlPattern: `${origin}/*` }] });
    for (const source of init) yield* call('Page.addScriptToEvaluateOnNewDocument', { source });

    /** `expression` run in the page, its answer (awaited, as JSON); a throw is a defect naming it. */
    const run = <A>(expression: string): Effect.Effect<A> =>
      scripts
        .withPermits(1)(
          Effect.tryPromise({
            // Through `eval`, so a script may be statements (`window.x = 1; true`), its last one's value the answer.
            try: () => view.evaluate<A>(`(0, eval)(${jsonOf(expression)})`),
            catch: (cause) =>
              BrowserFailed.make({ reason: `${expression.slice(0, 200)}: ${String(cause)}` }),
          }),
        )
        .pipe(Effect.orDie);

    /** A page-side wait, once: a run whose page went answers `Gone` while there are runs left. */
    const waitOnce = <A>(ready: string, runs: number) => {
      const once = run<Waited<A>>(waitIn(ready));
      if (runs <= 1) return once;
      return Effect.catchDefect(once, () => Effect.succeed<Waited<A>>({ _tag: 'Gone' }));
    };

    /**
     * Wait in the page until `ready` answers; again in the new page when a
     * load replaced the page under it (the wait's script is lost with it), up
     * to `RUNS` times; a timeout fails with `failure`.
     */
    const waitFor = <A>(
      ready: string,
      failure: () => Effect.Effect<string>,
      runs = RUNS,
    ): Effect.Effect<A> =>
      Effect.flatMap(waitOnce<A>(ready, runs), (waited) => {
        if (waited._tag === 'Answered') return Effect.succeed(waited.answer);
        if (waited._tag === 'TimedOut')
          return Effect.flatMap(failure(), (reason) => Effect.die(BrowserFailed.make({ reason })));
        return waitFor<A>(ready, failure, runs - 1);
      });

    const never = (what: string) => () => Effect.succeed(`${what} within ${WAIT_MS} ms`);

    const until: Tab['until'] = (script, failure) =>
      Effect.asVoid(
        waitFor(
          `() => ((${script}) || undefined)`,
          Option.match(Option.fromUndefinedOr(failure), {
            onNone: () => never(`${script} was never true`),
            onSome: (f) => () =>
              Effect.map(run<string>(`JSON.stringify(${f.now})`), (now) => f.say(now)),
          }),
        ),
      );
    const waitShown = (selector: string) =>
      Effect.asVoid(
        waitFor(`() => ((${shownAt(selector)})() && true)`, never(`${selector} was never shown`)),
      );
    const attached = (selector: string) =>
      Effect.asVoid(
        waitFor(
          `() => ((document.querySelector(${jsonOf(selector)}) !== null) || undefined)`,
          never(`${selector} was never in the page`),
        ),
      );

    const box = (selector: string) =>
      waitFor<Box>(
        `() => { const el = (${shownAt(selector)})(); if (el === undefined) return undefined; const r = el.getBoundingClientRect(); return { x: r.x, y: r.y, width: r.width, height: r.height }; }`,
        never(`${selector} was never shown`),
      );

    /** Why the element at `selector` cannot be clicked, as the page stands. */
    const whyNot = (selector: string) =>
      run<string>(`(() => {
        const el = document.querySelector(${jsonOf(selector)});
        if (el === null) return 'it is not in the page';
        if (el.disabled === true) return 'it is disabled';
        const r = el.getBoundingClientRect();
        if (r.width === 0 || r.height === 0) return 'it has no box';
        const hit = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2);
        if (hit === null) return 'its middle is off the page';
        return 'its middle is under ' + hit.outerHTML.slice(0, 120);
      })()`);

    /**
     * The middle of the element at `selector` once it is shown, enabled,
     * scrolled into view, still for two looks and on top at its middle (as a
     * click waits). Covered (by a sticky header, say), it is scrolled to
     * another place in the view on the next look.
     */
    const target = (selector: string) =>
      waitFor<{ readonly x: number; readonly y: number }>(
        `(() => {
          const places = ['nearest', 'center', 'end', 'start'];
          let tries = 0;
          let last;
          let still = 0;
          return () => {
            const el = (${shownAt(selector)})();
            if (el === undefined || el.disabled === true) return undefined;
            const place = places[tries % places.length];
            el.scrollIntoView({ block: place, inline: place });
            const r = el.getBoundingClientRect();
            const at = { x: r.x + r.width / 2, y: r.y + r.height / 2 };
            const key = [r.x, r.y, r.width, r.height].join();
            still = key === last ? still + 1 : 0;
            last = key;
            if (still < 2) return undefined;
            const hit = document.elementFromPoint(at.x, at.y);
            if (hit === null || !el.contains(hit)) {
              tries += 1;
              return undefined;
            }
            return at;
          };
        })()`,
        () =>
          Effect.map(
            whyNot(selector),
            (why) => `${selector} was never there to act on within ${WAIT_MS} ms: ${why}`,
          ),
      );

    let marks = 0;
    let at = { x: 0, y: 0 };
    // The button a move drags with: the left one while it is held.
    let button = 'none';
    const mouseEvent = (type: string, x: number, y: number, buttons: number) =>
      call('Input.dispatchMouseEvent', {
        type,
        x,
        y,
        button,
        buttons,
        clickCount: Number(type !== 'mouseMoved'),
      });
    const move = (x: number, y: number, steps = 1) =>
      Effect.gen(function* () {
        const from = at;
        for (let i = 1; i <= steps; i++)
          yield* mouseEvent(
            'mouseMoved',
            from.x + ((x - from.x) * i) / steps,
            from.y + ((y - from.y) * i) / steps,
            Number(button === 'left'),
          );
        at = { x, y };
      });
    const down = Effect.suspend(() => {
      button = 'left';
      return mouseEvent('mousePressed', at.x, at.y, 1);
    });
    const up = Effect.andThen(
      Effect.suspend(() => mouseEvent('mouseReleased', at.x, at.y, 0)),
      Effect.sync(() => {
        button = 'none';
      }),
    );
    const clickAt = (x: number, y: number) => Effect.andThen(move(x, y), Effect.andThen(down, up));

    const press = (combo: string) =>
      Effect.gen(function* () {
        const names = combo.split('+');
        const keys = yield* Effect.forEach(names, (name) =>
          Option.match(keyOf(name), {
            onNone: () => Effect.die(BrowserFailed.make({ reason: `no key named ${name}` })),
            onSome: Effect.succeed,
          }),
        );
        const modifiers = names.reduce(
          (bits, name) =>
            bits | Option.getOrElse(Option.fromUndefinedOr(MODIFIER.get(name)), () => 0),
          0,
        );
        const key = (k: Key) => ({
          modifiers,
          key: k.key,
          code: k.code,
          windowsVirtualKeyCode: k.keyCode,
        });
        // A key that types (with no modifier held) goes down with its text; any other goes down raw.
        for (const k of keys)
          if (k.text !== '' && modifiers === 0)
            yield* call('Input.dispatchKeyEvent', {
              type: 'keyDown',
              ...key(k),
              text: k.text,
              unmodifiedText: k.text,
            });
          else yield* call('Input.dispatchKeyEvent', { type: 'rawKeyDown', ...key(k) });
        for (const k of keys.toReversed())
          yield* call('Input.dispatchKeyEvent', { type: 'keyUp', ...key(k) });
      });

    const focus = (selector: string) =>
      Effect.andThen(
        waitShown(selector),
        run(`document.querySelector(${jsonOf(selector)}).focus()`),
      );

    const clock = (control: string) => run(`globalThis[Symbol.for('${CLOCK}')].${control}`);

    const tab: Tab = {
      errors,
      logged,
      evaluate: run,
      until,
      waitFor: waitShown,
      attached,
      box,
      click: (selector) => Effect.flatMap(target(selector), (p) => clickAt(p.x, p.y)),
      fill: (selector, value) =>
        Effect.gen(function* () {
          yield* focus(selector);
          yield* run(`document.querySelector(${jsonOf(selector)}).select()`);
          if (value === '') yield* press('Delete');
          else yield* call('Input.insertText', { text: value });
        }),
      focus,
      select: (selector, value) =>
        Effect.andThen(
          waitShown(selector),
          run(`(() => {
            const el = document.querySelector(${jsonOf(selector)});
            el.value = ${jsonOf(value)};
            el.dispatchEvent(new Event('input', { bubbles: true }));
            el.dispatchEvent(new Event('change', { bubbles: true }));
          })()`),
        ),
      press,
      pressIn: (selector, key) => Effect.andThen(focus(selector), press(key)),
      mouse: { move, down, up, click: clickAt },
      goto: (path) => Effect.promise(() => view.navigate(`${origin}${path}`)),
      reload: Effect.promise(() => view.reload()),
      // Bun's `back` is typed but not there at run time (1.4.2): the page goes back itself.
      back: run('history.back()'),
      url: run<string>('location.href'),
      resize: (width, height) => Effect.promise(() => view.resize(width, height)),
      // The page as it stands is marked; the next one, loaded, has no mark.
      nextLoad: Effect.suspend(() => {
        marks += 1;
        const mark = marks;
        return Effect.as(
          run(`globalThis[Symbol.for('film.page')] = ${mark}`),
          until(
            `globalThis[Symbol.for('film.page')] !== ${mark} && document.readyState === 'complete'`,
          ),
        );
      }),
      nextAnswer: (which) =>
        Effect.sync(() => {
          let seen = false;
          let wake = () => {};
          const listener = (a: Answered) => {
            if (!which(a)) return;
            seen = true;
            wake();
            answerListeners.delete(listener);
          };
          answerListeners.add(listener);
          return Effect.callback<void>((resume) => {
            if (seen) return resume(Effect.void);
            wake = () => resume(Effect.void);
          });
        }),
      clock: {
        runFor: (ms) => clock(`runFor(${ms})`),
        fastForward: (ms) => clock(`fastForward(${ms})`),
        pauseAt: (t) => clock(`pauseAt(${t})`),
      },
    };
    return tab;
  });
