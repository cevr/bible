/* oxlint-disable effect/noGlobals, effect/noAsyncFunction, eslint/no-await-in-loop, effect/noNewPromise, effect/noThrowStatement, effect/noNewError, effect/noNullish, effect/noTernary, effect/noTestLifecycleHooks -- a browser harness, a host boundary: it builds the page with Bun, serves it, and drives Chromium one step after another through Playwright's promises, as packages/ui's browser tests do. */

/**
 * The Hymns and Search lists in a real browser (Chromium, through
 * Playwright), because a scroll place needs layout and a fake DOM has none.
 * Each page is the app's HTML rendered on the server (`server.tsx`, with no
 * window, as One's server and its static build render it) and hydrated in
 * the browser with `hydrateRoot` (`page.tsx`). On the web a list is mounted
 * anew when the reader comes back to it, and it must come back as he left
 * it:
 * - hydration keeps the server's list: no hydration error, at window
 *   heights from a small phone's to a tall Mac window's, and a scroll made
 *   before it or after it is never undone, its rows drawn;
 * - Back, the header's back link and a tab switch return to the saved
 *   offset within one row, its row drawn in the first frame, at offsets
 *   across the whole list and window heights across the same range;
 * - after a return, the list never moves by itself once the reader scrolls,
 *   and it draws every row on screen after a move straight to the top, a
 *   fling to the top, or a search with no result cleared again;
 * - a press right after a scroll saves the true offset;
 * - the search field keeps the reader's focus and his keys through
 *   hydration and a return, and lets go of them when he drags the list
 *   with a finger.
 * The visits and the cold loads are drawn from the property's whole domain
 * by a seeded sampler (`visits.ts`): every pair of values it names meets in
 * each run, and the seed, printed once a run and with every miss, decides the rest
 * (`HYMNAL_LIST_SEED=<seed>` runs a run's cases again).
 * A row is a real link: Enter opens it inside the app, and a Cmd- or
 * Ctrl-click leaves it to the browser, which opens the hymn in a new tab.
 *
 * The page is bundled here with the boundaries the app's other tests use
 * (`src/test/setup.ts`): react-native-web, the real words, and
 * `src/test/one.tsx` for the router. Each case has a page of its own, so
 * the cases run at once. It needs Playwright's Chromium
 * (`bunx playwright install chromium`).
 */

import { afterAll, beforeAll, describe, expect, it } from 'bun:test';
import { chromium, type Browser, type BrowserContext, type Page } from '@playwright/test';
import type { BunPlugin } from 'bun';

import type { First } from './page';
import { type ListName, lists } from './routes';
import {
  type Cold,
  type Move,
  type Press,
  type Visit,
  type Way,
  coldDomain,
  coldsOf,
  heights,
  uncovered,
  visitDomain,
  visitsOf,
} from './visits';

/** A row's height at the web's text size. */
const rowHeight = 44;

/** A window of `height`: a phone's width, or a Mac window's when it is tall. */
const windowOf = (height: number) => ({ width: height > 1000 ? 1024 : 402, height });

/** The bundler boundaries, as `src/test/setup.ts` sets them for the other tests, with the hymns' `words` as JSON. */
const boundaries = (words: string): BunPlugin => ({
  name: 'hymnal-browser-boundaries',
  setup(build) {
    const web = Bun.resolveSync('react-native-web', import.meta.dir);
    const one = Bun.resolveSync('../../src/test/one.tsx', import.meta.dir);
    build.onResolve({ filter: /^react-native$/ }, () => ({ path: web }));
    build.onResolve({ filter: /^one$/ }, () => ({ path: one }));
    build.onResolve({ filter: /^virtual:hymnal$/ }, () => ({
      path: 'virtual:hymnal',
      namespace: 'hymnal',
    }));
    build.onLoad({ filter: /.*/, namespace: 'hymnal' }, () => ({
      contents: `export default ${words};`,
      loader: 'js',
    }));
  },
});

const bundle = async (words: string): Promise<string> => {
  const output = await Bun.build({
    entrypoints: [`${import.meta.dir}/page.tsx`],
    plugins: [boundaries(words)],
    target: 'browser',
    define: { 'process.env.NODE_ENV': '"development"' },
  });
  const [script] = output.outputs;
  if (!output.success || !script) throw new Error(output.logs.map(String).join('\n'));
  return script.text();
};

let server: ReturnType<typeof Bun.serve>;
let browser: Browser;

/**
 * How many pages are open at once: four for every three cores. A page
 * spends most of its time waiting on frames and timers, so on 12 cores the
 * run measured fastest with 16 pages, about 0.4 s faster than with 12; with
 * 20 or 24 the pages slowed each other's waits and the run took longer. A
 * page waits for a place to open.
 */
const places = Math.ceil((navigator.hardwareConcurrency * 4) / 3);
let taken = 0;
const queue: Array<() => void> = [];
const take = () =>
  taken < places
    ? Promise.resolve(void (taken += 1))
    : new Promise<void>((done) => queue.push(done));
const give = () => {
  const next = queue.shift();
  if (next) next();
  else taken -= 1;
};

/**
 * A page of the app of its own, loaded cold at `path` in a window of
 * `height`, and what a case does on it: each step waits for the page as a
 * reader's next move would. With `hold`, the page waits to hydrate until
 * the case says.
 */
const open = async ({
  path = '/',
  height = 874,
  hold = false,
  touch = false,
}: { path?: string; height?: number; hold?: boolean; touch?: boolean } = {}) => {
  await take();
  const context: BrowserContext = await browser
    .newContext({ viewport: windowOf(height), hasTouch: touch })
    .catch((error: Error) => {
      give();
      return Promise.reject(error);
    });
  /** Closes the page and gives its place back. */
  const close = () => context.close().finally(give);
  /** Closes the page, then fails with `error`: a page that fails to open keeps no place. */
  const fail = (error: Error) =>
    close().then(
      () => Promise.reject(error),
      () => Promise.reject(error),
    );
  // A step that waits waits for a reader's moment, not for ever: a list that draws no row fails here.
  context.setDefaultTimeout(3000);
  const page: Page = await context.newPage().catch(fail);
  let size = windowOf(height);

  /** Waits `ms`, then two frames. */
  const settle = (ms: number) =>
    page.evaluate(
      (wait) =>
        new Promise<void>((done) =>
          setTimeout(() => requestAnimationFrame(() => requestAnimationFrame(() => done())), wait),
        ),
      ms,
    );

  /** Waits for a list to be on screen with its rows, then for two frames. */
  const shown = async () => {
    await page.waitForFunction(() => window.hymnal?.showing() === true);
    await settle(0);
  };

  /** Waits for the page to hydrate. */
  const hydrated = () => page.waitForFunction(() => window.hymnal.hydrated);

  /** Resizes the window to `height`. */
  const resize = async (to: number) => {
    size = windowOf(to);
    await page.setViewportSize(size);
    await settle(0);
    // A shorter window can scroll less: the browser moves the list in, and the reader did that.
    await page.evaluate(() => window.hymnal.jumps.splice(0));
  };

  /** The list's scroll offset now, and the most it can scroll. */
  const place = async () => {
    const now = await page.evaluate(() => window.hymnal.place());
    if (now === undefined) throw new Error('the list is not shown');
    return now;
  };

  /** Scrolls the list to `top` once, as a scroll does, and answers where the browser took it. */
  const scroll = (top: number) => page.evaluate((y) => window.hymnal.scroll(y), top);

  /**
   * Scrolls the list to `top` as a reader does: sixteen windows at a time,
   * until the list is there or can go no further. Answers where it stopped.
   */
  const scrollTo = async (top: number) => {
    /**
     * Scrolls the list to `to` (none: leaves it), waits `ms` and two frames,
     * and answers its place then: one round trip a step.
     */
    const step = (to: number | undefined, ms: number) =>
      page.evaluate(
        ([y, wait]) => {
          if (y !== undefined) window.hymnal.scroll(y);
          return new Promise<{ top: number; max: number } | undefined>((done) =>
            setTimeout(
              () =>
                requestAnimationFrame(() =>
                  requestAnimationFrame(() => done(window.hymnal.place())),
                ),
              wait,
            ),
          );
        },
        [to, ms] as const,
      );
    let now = await place();
    for (let steps = 0; steps < 200; steps++) {
      const to =
        top > now.top
          ? Math.min(top, now.top + size.height * 16, now.max)
          : Math.max(top, now.top - size.height * 16);
      const done = now.top === to && (to === top || to === now.max);
      const after = await step(done ? undefined : to, done ? 40 : 0);
      if (after === undefined) throw new Error('the list is not shown');
      if (done && after.max === now.max && after.top === now.top) return now.top;
      now = after;
    }
    return now.top;
  };

  /** Each time the list moved by itself since the last time this was asked. */
  const jumps = () => page.evaluate(() => window.hymnal.jumps.splice(0));

  /**
   * How many pixels of the list's shown rows stay blank: rows the list
   * draws within a second (it draws them after a scroll, in its own time)
   * are not blank.
   */
  const blank = async () => {
    await page
      .waitForFunction(() => window.hymnal.blank() === 0, undefined, { timeout: 1000 })
      .catch(() => undefined);
    return page.evaluate(() => window.hymnal.blank());
  };

  /** What hydration reported. */
  const errors = () => page.evaluate(() => [...window.hymnal.errors]);

  /** The fully shown row nearest the list's middle, once the list draws one. */
  const middleRow = async () => {
    await page.waitForFunction(() => window.hymnal.showing(), undefined, { timeout: 2000 });
    return page.evaluate(() => window.hymnal.middle());
  };

  /** Waits for the hymn at `path` opened from `list`. */
  const opened = (list: ListName, label: string) => {
    const want = `${list === 'hymns' ? '/hymns' : '/search'}/${label.split(',')[0]}`;
    return page.waitForFunction((path) => window.hymnal.on(path), want, { timeout: 2000 });
  };

  /**
   * Scrolls the list three rows away from `at` and lets it hear of that,
   * then in one task scrolls it back to `at` and clicks the row nearest its
   * middle, or the tab bar's link named `tab`: a press at once. That task
   * runs as a frame begins, its scroll's event already sent for that frame,
   * so the app has a whole frame to leave the list before the event comes.
   * Answers where he left the list and the row; fails at once, with its
   * message, when the list is not shown or the link is not there.
   */
  const leaveAtOnce = async (at: number, tab?: string) => {
    // A row he can press is drawn.
    await middleRow();
    await page.evaluate((y) => window.hymnal.away(y), at);
    return page.evaluate(
      ([y, link]) =>
        // Inside the frame's callback a throw reaches only the page's error event; in the
        // microtask that follows it, still before the frame draws, it rejects what the press answers.
        new Promise<number>((frame) => requestAnimationFrame(frame)).then(() =>
          window.hymnal.leave(y, link),
        ),
      [at, tab] as const,
    );
  };

  /**
   * Presses the row nearest the list's middle: as a pointer does, or `now`,
   * in the same task as his last scroll, back to `at` from three rows away.
   * Answers the row and where he left the list.
   */
  const press = async (list: ListName, when: Press, at: number) => {
    if (when === 'now') {
      const left = await leaveAtOnce(at);
      await opened(list, left.label);
      return left;
    }
    const row = await middleRow();
    const { top } = await place();
    await page.mouse.click(row.x, row.y);
    await opened(list, row.label);
    return { top, label: row.label };
  };

  /** Clicks the tab bar's link to `list`. */
  const tab = (list: ListName) =>
    page.getByRole('navigation').getByText(lists[list].title, { exact: true }).click();

  /**
   * Does `go`, which shows `list`; answers the first frame that drew the
   * list: whether the row named `label` was fully on screen, its blank
   * pixels, and the frames before it with no row.
   */
  const comeBack = async (list: ListName, label: string, go: () => Promise<unknown>) => {
    await page.evaluate(
      ([path, name]) => {
        window.hymnal.watching = window.hymnal.watch(path, name);
      },
      [lists[list].path, label] as const,
    );
    await go();
    const first = await page.evaluate(() => window.hymnal.watching);
    await shown();
    if (first === undefined) throw new Error('no frame drew the list');
    return first;
  };

  /** Loads the page cold at `path`, as the browser does a new address. */
  const load = async () => {
    await page.goto(`${server.url.href.replace(/\/$/, '')}${path}${hold ? '?hold' : ''}`);
    if (!hold) await hydrated();
    await shown();
  };

  await load().catch(fail);
  return {
    page,
    context,
    settle,
    hydrated,
    resize,
    place,
    scroll,
    scrollTo,
    jumps,
    blank,
    errors,
    middleRow,
    leaveAtOnce,
    press,
    tab,
    comeBack,
    load,
    [Symbol.asyncDispose]: close,
  };
};

type Session = Awaited<ReturnType<typeof open>>;

beforeAll(async () => {
  // Chromium starts while the server's app loads: neither needs the other. Its pages run V8 with
  // no optimizing compiler (TurboFan): with it, a run of the file measured about 7 CPU seconds more
  // (55 against 48) and no shorter wall. Turning off Maglev as well measured slower.
  const launching = chromium.launch({ args: ['--js-flags=--no-opt'] }).then((launched) => {
    browser = launched;
  });
  const { render, words } = await import('./server');
  const [script] = await Promise.all([bundle(words), launching]);
  server = Bun.serve({
    port: 0,
    fetch: (request) => {
      const { pathname } = new URL(request.url);
      return pathname === '/page.js'
        ? new Response(script, {
            // Each page loads it again on every cold load: the browser keeps it.
            headers: {
              'content-type': 'text/javascript',
              'cache-control': 'max-age=3600, immutable',
            },
          })
        : new Response(render(pathname), { headers: { 'content-type': 'text/html' } });
    },
  });
});

afterAll(async () => {
  await browser?.close();
  await server?.stop(true);
});

/** This run's seed: `HYMNAL_LIST_SEED=<seed>` runs its cases again. */
const seed = ((given) =>
  given !== undefined && given !== '' ? Number(given) >>> 0 : Math.floor(Math.random() * 2 ** 32))(
  process.env['HYMNAL_LIST_SEED'],
);
// Once a run, before any case: a case that throws or times out names no seed of its own.
console.log(`hymnal browser test: HYMNAL_LIST_SEED=${seed}`);

/**
 * The ways back to a list after the reader leaves it, and how he leaves it
 * for each: `when` he presses or clicks after his scroll to `at`. Each
 * answers where he left the list, and the first frame of the list come back.
 */
const paths = {
  /** He opens a hymn from a row, then presses the browser's Back. */
  back: async (app: Session, list: ListName, when: Press, at: number) => {
    const { top, label } = await app.press(list, when, at);
    return { top, first: await app.comeBack(list, label, () => app.page.goBack()) };
  },
  /** He opens a hymn from a row, then follows the header's back link to the list. */
  header: async (app: Session, list: ListName, when: Press, at: number) => {
    const { top, label } = await app.press(list, when, at);
    const first = await app.comeBack(list, label, () =>
      app.page.getByText(`‹ ${lists[list].title}`, { exact: true }).click(),
    );
    return { top, first };
  },
  /** He switches to the other list's tab, then back to this one's. */
  tab: async (app: Session, list: ListName, when: Press, at: number) => {
    const other = list === 'hymns' ? 'search' : 'hymns';
    const { top, label } =
      when === 'now'
        ? await app.leaveAtOnce(at, lists[other].title)
        : { top: (await app.place()).top, label: (await app.middleRow()).label };
    if (when === 'later') await app.tab(other);
    await app.page.waitForFunction(
      (path) => window.hymnal.on(path) && window.hymnal.place() !== undefined,
      lists[other].path,
    );
    return { top, first: await app.comeBack(list, label, () => app.tab(list)) };
  },
} as const satisfies Record<
  Way,
  (app: Session, list: ListName, when: Press, at: number) => Promise<{ top: number; first: First }>
>;

/**
 * What the reader does after the list is back. Each answers how many
 * pixels of rows on screen stayed blank after it, where the list is then,
 * and where the move should have taken it.
 */
const moves = {
  /** He moves it straight to the top, in one step (the scroll bar, a key). */
  top: async (app: Session) => {
    await app.scroll(0);
    await app.settle(100);
    return { blank: await app.blank(), top: (await app.place()).top, goal: 0 };
  },
  /** He flings it to the top: a burst of wheel turns, the last ones small, past the list's top. */
  fling: async (app: Session) => {
    const { top } = await app.place();
    const row = await app.middleRow();
    await app.page.mouse.move(row.x, row.y);
    const turns = [
      ...Array.from({ length: Math.ceil(top / 2400) }, () => 2400),
      400,
      200,
      100,
      50,
      25,
      12,
    ];
    for (const turn of turns) await app.page.mouse.wheel(0, -turn);
    await app.settle(150);
    return { blank: await app.blank(), top: (await app.place()).top, goal: 0 };
  },
  /**
   * He searches for what no hymn has, then clears the search (the Search
   * list only): the list he left at its top, as the empty search put it,
   * stays there.
   */
  nothing: async (app: Session) => {
    const field = app.page.getByRole('searchbox');
    await field.fill('zzqxj');
    await app.page.getByText('No hymn matches', { exact: false }).waitFor();
    await app.scroll(0);
    await field.fill('');
    await app.page.waitForFunction(() => window.hymnal.showing());
    await app.settle(150);
    return { blank: await app.blank(), top: (await app.place()).top, goal: 0 };
  },
  /** He scrolls on: up halfway to the top, then down to the very end. */
  onward: async (app: Session) => {
    const { top, max } = await app.place();
    for (const want of [top / 2, max]) {
      await app.scrollTo(Math.round(want));
      await app.settle(0);
    }
    await app.settle(150);
    const now = await app.place();
    return { blank: await app.blank(), top: now.top, goal: now.max };
  },
} as const satisfies Record<
  Move,
  (app: Session) => Promise<{ blank: number; top: number; goal: number }>
>;

/**
 * How the reader pressed: after a pause, or at once, with whether its list
 * left the page before any scroll event reached it after the reader's last
 * scroll, so the list never heard of that scroll, as the label says, and
 * which try this was.
 */
type Pressed =
  | { readonly press: 'later' }
  | { readonly press: 'now'; readonly leftBeforeScrollEvent: boolean; readonly tries: number };

export type Seen = Omit<Visit, 'press'> & Pressed & Found;

interface Found {
  /** Where the visit's share puts the list: `round(max × share)`. */
  readonly target: number;
  /** Where the reader left the list. */
  readonly left: number;
  /** Where the list was when it was shown again. */
  readonly found: number;
  /** The first frame of the list shown again. */
  readonly first: First;
  /** Times the list moved by itself: as he scrolled to leave it, and after it came back. */
  readonly jumps: ReadonlyArray<unknown>;
  /** After the move: pixels of rows on screen left blank, where the list is, where it should be. */
  readonly after: { readonly blank: number; readonly top: number; readonly goal: number };
}

/**
 * Whether a visit left the list more than a pixel from its share's offset
 * (so a visit is the case its values name, whatever the way it leaves), did
 * not come back within one row, did not draw the reader's row in the first
 * frame with every row on screen, saw the list move by itself, or after the
 * move left rows blank or the list elsewhere.
 */
const wrong = (v: Seen) =>
  Math.abs(v.left - v.target) > 1 ||
  Math.abs(v.found - v.left) > rowHeight ||
  !v.first.drawn ||
  v.first.blank > 0 ||
  v.first.empty > 0 ||
  v.jumps.length > 0 ||
  v.after.blank > 0 ||
  Math.abs(v.after.top - v.after.goal) > 1;

/** Whether a visit is the press its label says: a press at once whose list never heard of the last scroll. */
const labelled = (v: Seen) => v.press === 'later' || v.leftBeforeScrollEvent;

/** The visits that went wrong, and the presses at once that were not one. */
const missed = (visits: ReadonlyArray<Seen>) => visits.filter((v) => wrong(v) || !labelled(v));

/**
 * How many tries a press at once has to be one: a try whose list heard of
 * the last scroll before it left, and went right otherwise, is made again
 * from its start, up to this many tries; the last is a miss.
 */
const tries = 3;

/** This run's presses at once: their tries, and how many of those were made again. */
const atOnce = { tries: 0, again: 0 };

afterAll(() => {
  console.log(
    `hymnal browser test: HYMNAL_LIST_SEED=${seed}, presses at once: ${atOnce.tries} tries, ${atOnce.again} made again`,
  );
});

/**
 * On a page of its own, cold-loaded at `list`, makes each visit in turn: in
 * a window of the visit's height, the reader scrolls to its share of the
 * list's height and leaves the list from there, within a pixel (pressing
 * or clicking after a pause, or in the same task as his scroll back there
 * from three rows away); he comes back the visit's way, then makes its move.
 */
const visit = async (list: ListName, visits: ReadonlyArray<Visit>) => {
  await using app = await open({ path: lists[list].path });
  const hydration = await app.errors();
  const seen: Array<Seen> = [];
  for (const v of visits) {
    for (let attempt = 1; ; attempt += 1) {
      await app.resize(v.height);
      const { max } = await app.place();
      const target = Math.round(max * v.share);
      await app.scrollTo(target);
      if (v.press === 'later') await app.settle(150);
      const { top: left, first } = await paths[v.way](app, list, v.press, target);
      const pressed: Pressed =
        v.press === 'now'
          ? {
              press: 'now',
              leftBeforeScrollEvent: await app.page.evaluate(() =>
                window.hymnal.leftBeforeScrollEvent(),
              ),
              tries: attempt,
            }
          : { press: 'later' };
      const { top: found } = await app.place();
      const after = await moves[v.move](app);
      const s: Seen = {
        ...v,
        ...pressed,
        target,
        left,
        found,
        first,
        jumps: await app.jumps(),
        after,
      };
      if (v.press === 'now') atOnce.tries += 1;
      // Only the label makes a try again: a try that went wrong is a miss, whatever its label.
      if (labelled(s) || wrong(s) || attempt === tries) {
        seen.push(s);
        break;
      }
      atOnce.again += 1;
    }
  }
  return { seed, hydration, misses: missed(seen) };
};

/** `cases` in groups of `size`, in turn. */
const groups = <T>(cases: ReadonlyArray<T>, size: number): Array<ReadonlyArray<T>> =>
  Array.from({ length: Math.ceil(cases.length / size) }, (_, i) =>
    cases.slice(i * size, (i + 1) * size),
  );

describe('a list comes back where the reader left it', () => {
  it('in visits and cold loads that meet every pair of values their domains name', () => {
    const missing = (['hymns', 'search'] as const).flatMap((list) => [
      ...uncovered(visitDomain(list), visitsOf(list, seed)).map((pair) => `${list} visit ${pair}`),
      ...uncovered(coldDomain, coldsOf(list, seed)).map((pair) => `${list} cold ${pair}`),
    ]);
    expect({ seed, missing }).toEqual({ seed, missing: [] });
  });

  for (const list of ['hymns', 'search'] as const) {
    // A list's visits in pages of three at once.
    for (const [page, part] of groups(visitsOf(list, seed), 3).entries()) {
      it.concurrent(`the ${list} list, visits ${page * 3 + 1} to ${page * 3 + part.length}`, async () => {
        expect(await visit(list, part)).toEqual({ seed, hydration: [], misses: [] });
      });
    }
  }

  it.concurrent('the search list, its results shorter than the window grown while he was away, draws every row once he clears the search', async () => {
    // A small phone's window: the 13 results of "shepherd" scroll there.
    await using app = await open({ path: lists.search.path, height: 320 });
    await app.page.getByRole('searchbox').fill('shepherd');
    await app.page.waitForFunction(() => {
      const max = window.hymnal.place()?.max ?? 0;
      return max > 0 && max < 13 * 44;
    });
    const { max } = await app.place();
    const left = await app.scrollTo(max);
    await app.settle(150);
    const row = await app.press('search', 'later', left);
    // Taller than the 13 results: the list comes back at its top.
    await app.resize(874);
    await app.comeBack('search', row.label, () => app.page.goBack());
    const found = (await app.place()).top;
    await app.page.getByRole('searchbox').fill('');
    await app.page.waitForFunction(() => (window.hymnal.place()?.max ?? 0) > 10_000);
    await app.settle(150);
    expect({ left: left > 0, found, blank: await app.blank(), jumps: await app.jumps() }).toEqual({
      left: true,
      found: 0,
      blank: 0,
      jumps: [],
    });
  });
});

// The cases run at once, each taking a page as one opens, in the order they are declared: the
// longest first, so the short ones fill the last places and the run ends soon after its last page.
describe('a list loaded cold hydrates the server’s list', () => {
  /**
   * On a page of its own in a window of `height`, loads the list cold once
   * for each case: the reader scrolls the server's list to the case's share
   * before hydration, and to its share after it. Answers the loads whose
   * scroll's event did not come before hydration, and those that reported a
   * hydration error, lost or moved a scroll, or left rows blank.
   */
  const loads = async (list: ListName, height: number, cases: ReadonlyArray<Cold>) => {
    await using app = await open({ path: lists[list].path, height, hold: true });
    const misses: Array<unknown> = [];
    for (const [index, c] of cases.entries()) {
      if (index > 0) await app.load();
      const { max } = await app.place();
      const before = await app.scroll(Math.round(max * c.before));
      // Hydration waits for the scroll's own event, so the list cannot see it and must be told of
      // it. Every case scrolls before hydration, so a load with no event is a miss, named below.
      const waited = await app.page
        .evaluate(() => window.hymnal.heard())
        .then(
          () => 'heard',
          (error: Error) => error.message,
        );
      await app.page.evaluate(() => window.hymnal.hydrate());
      await app.hydrated();
      await app.settle(150);
      const kept = (await app.place()).top - before;
      const blankBefore = await app.blank();
      const after = await app.scroll(Math.round(max * c.after));
      await app.settle(150);
      const seen = {
        ...c,
        eventBeforeHydration: await app.page.evaluate(() => window.hymnal.eventBeforeHydration),
        waited,
        errors: await app.errors(),
        kept,
        blankBefore,
        moved: (await app.place()).top - after,
        blankAfter: await app.blank(),
        jumps: await app.jumps(),
      };
      // The case the load names: the scroll before hydration, its event too, so the list must be told of it.
      // The wait must end on that event: a load whose wait ran out is a miss, even if the event came.
      const clean =
        waited === 'heard' &&
        seen.eventBeforeHydration &&
        seen.errors.length === 0 &&
        kept === 0 &&
        blankBefore === 0 &&
        seen.moved === 0 &&
        seen.blankAfter === 0 &&
        seen.jumps.length === 0;
      if (!clean) misses.push(seen);
    }
    return { seed, misses };
  };

  for (const list of ['hymns', 'search'] as const) {
    for (const height of heights) {
      // A window height's loads in two pages at once.
      const cases = coldsOf(list, seed).filter((c) => c.height === height);
      for (const [page, part] of groups(cases, Math.ceil(cases.length / 2)).entries()) {
        it.concurrent(`the ${list} list, ${height} px high, keeps a scroll made before and after hydration, page ${page + 1}`, async () => {
          expect(await loads(list, height, part)).toEqual({ seed, misses: [] });
        });
      }
    }
  }
});

describe('a list come back', () => {
  for (const list of ['hymns', 'search'] as const) {
    const other = list === 'hymns' ? 'search' : 'hymns';
    for (const way of ['back', 'header', 'tab'] as const) {
      it.concurrent(`the ${list} list, moved to its top as it is drawn back deep by ${way}, stays at its top`, async () => {
        await using app = await open({ path: lists[list].path });
        await app.scrollTo(20_000);
        await app.settle(150);
        if (way === 'tab') {
          await app.tab(other);
          await app.page.waitForFunction(
            (path) => window.hymnal.on(path) && window.hymnal.place() !== undefined,
            lists[other].path,
          );
        } else await app.press(list, 'later', 20_000);
        const early = app.page.evaluate(() => window.hymnal.early());
        await (way === 'back'
          ? app.page.goBack()
          : way === 'header'
            ? app.page.getByText(`‹ ${lists[list].title}`, { exact: true }).click()
            : app.tab(list));
        const restored = await early;
        await app.settle(150);
        expect({ restored, top: (await app.place()).top, jumps: await app.jumps() }).toEqual({
          restored: 20_000,
          top: 0,
          jumps: [],
        });
      });
    }
  }
});

describe('the search field', () => {
  /** Types `text` where the reader's keys go now; answers the focused element's role and the field's text. */
  const typed = async (app: Session, text: string) => {
    await app.page.keyboard.type(text);
    return {
      focused: await app.page.evaluate(() => document.activeElement?.getAttribute('role')),
      text: await app.page.getByRole('searchbox').inputValue(),
    };
  };

  for (const pressed of [false, true]) {
    it.concurrent(`keeps the reader's focus and takes his keys after hydration, the list scrolled before it${pressed ? ' and the field pressed' : ''}`, async () => {
      await using app = await open({ path: lists.search.path, hold: true });
      const { max } = await app.place();
      await app.scroll(Math.round(max * 0.33));
      if (pressed) await app.page.getByRole('searchbox').click();
      await app.page.evaluate(() => window.hymnal.hydrate());
      await app.hydrated();
      // Past the list's scroll end, which it tells 100 ms after a scroll.
      await app.settle(150);
      expect(await typed(app, 'lord')).toEqual({ focused: 'searchbox', text: 'lord' });
    });
  }

  it.concurrent('keeps its focus and takes the reader’s keys when the list comes back deep', async () => {
    await using app = await open({ path: lists.search.path });
    const { max } = await app.place();
    await app.scrollTo(Math.round(max * 0.6));
    await app.settle(150);
    await app.tab('hymns');
    await app.page.waitForFunction(() => window.hymnal.on('/'));
    await app.tab('search');
    await app.page.waitForFunction(() => window.hymnal.on('/search') && window.hymnal.showing());
    await app.settle(150);
    expect(await typed(app, 'lord')).toEqual({ focused: 'searchbox', text: 'lord' });
  });

  it.concurrent('lets go of the reader’s focus, putting the keyboard away, when he drags the list with a finger', async () => {
    await using app = await open({ path: lists.search.path, touch: true });
    const row = await app.middleRow();
    const before = await app.page.evaluate(() => document.activeElement?.getAttribute('role'));
    const touch = await app.context.newCDPSession(app.page);
    const at = (y: number) => [{ x: row.x, y }];
    await touch.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: at(row.y) });
    for (const step of [10, 20, 40, 80])
      await touch.send('Input.dispatchTouchEvent', {
        type: 'touchMove',
        touchPoints: at(row.y - step),
      });
    await touch.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    await app.settle(150);
    const after = await app.page.evaluate(() => document.activeElement?.getAttribute('role'));
    expect({ before, after }).toEqual({ before: 'searchbox', after: null });
  });
});

describe('a press at once', () => {
  it.concurrent('whose link is not there fails at once, saying so', async () => {
    await using app = await open();
    const started = performance.now();
    const outcome = await app.leaveAtOnce(2000, 'Nowhere').then(
      () => 'pressed',
      (error: Error) => error.message,
    );
    expect({ outcome, soon: performance.now() - started < 3000 }).toEqual({
      outcome: expect.stringContaining('no link to Nowhere'),
      soon: true,
    });
  });
});

describe('a row', () => {
  const second = '[aria-label="2, All Creatures of Our God and King"]';

  it.concurrent('is an anchor to its hymn', async () => {
    await using app = await open();
    const link = await app.page.evaluate((selector) => {
      const row = document.querySelector(selector);
      return { tag: row?.tagName, href: row?.getAttribute('href') };
    }, second);
    expect(link).toEqual({ tag: 'A', href: '/hymns/2' });
  });

  it.concurrent('keeps a long title on one line, in a row of the height the list counts on', async () => {
    // The narrowest phone the app meets (an iPhone SE), where the longest titles reach the edge.
    await using app = await open({ height: 568 });
    await app.page.setViewportSize({ width: 320, height: 568 });
    await app.settle(0);
    const sizes = await app.page.evaluate(() => {
      const row = document.querySelector(
        '[aria-label="9, Let All the World in Every Corner Sing"]',
      );
      const texts = [...(row?.querySelectorAll('div[dir]') ?? [])];
      return {
        row: row?.getBoundingClientRect().height,
        lines: texts.map((text) => Math.round(text.getBoundingClientRect().height)),
      };
    });
    expect(sizes).toEqual({ row: rowHeight, lines: [22, 22] });
  });

  it.concurrent('opens its hymn inside the app on Enter, never loading the page anew', async () => {
    await using app = await open();
    await app.page.evaluate(() => Object.assign(window, { kept: true }));
    await app.page.focus(second);
    await app.page.keyboard.press('Enter');
    await app.page.getByText('Hymn 2', { exact: true }).waitFor();
    const after = await app.page.evaluate(() => ({
      kept: 'kept' in window,
      path: location.pathname,
    }));
    expect(after).toEqual({ kept: true, path: '/hymns/2' });
  });

  it.concurrent('leaves a Cmd- or Ctrl-click to the browser, which opens the hymn in a new tab', async () => {
    await using app = await open();
    const [tab] = await Promise.all([
      app.context.waitForEvent('page', { timeout: 5000 }),
      app.page.locator(second).click({ modifiers: ['ControlOrMeta'] }),
    ]);
    await tab.getByText('Hymn 2', { exact: true }).waitFor();
    expect({
      tab: new URL(tab.url()).pathname,
      here: new URL(app.page.url()).pathname,
    }).toEqual({ tab: '/hymns/2', here: '/' });
  });
});
