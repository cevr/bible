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
 * - a press right after a scroll saves the true offset.
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

import { readWords } from '../../vite/words';
import { type ListName, lists } from './routes';
import { render } from './server';

/** A row's height at the web's text size. */
const rowHeight = 44;

/** Window heights, in CSS pixels: a small phone's to a tall Mac window's. */
const heights = [320, 568, 874, 1400];

/** A window of `height`: a phone's width, or a Mac window's when it is tall. */
const windowOf = (height: number) => ({ width: height > 1000 ? 1024 : 402, height });

/** The offsets sampled, by share of the list's height: its first rows to its very end. */
const shares = [0.005, 0.1, 0.33, 0.6, 0.85, 1];

/** The bundler boundaries, as `src/test/setup.ts` sets them for the other tests. */
const boundaries: BunPlugin = {
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
      contents: `export default ${JSON.stringify(readWords())};`,
      loader: 'js',
    }));
  },
};

const bundle = async (): Promise<string> => {
  const output = await Bun.build({
    entrypoints: [`${import.meta.dir}/page.tsx`],
    plugins: [boundaries],
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
 * A page of the app of its own, loaded cold at `path` in a window of
 * `height`, and what a case does on it: each step waits for the page as a
 * reader's next move would. With `hold`, the page waits to hydrate until
 * the case says.
 */
const open = async ({
  path = '/',
  height = 874,
  hold = false,
}: { path?: string; height?: number; hold?: boolean } = {}) => {
  const context: BrowserContext = await browser.newContext({ viewport: windowOf(height) });
  // A step that waits waits for a reader's moment, not for ever: a list that draws no row fails here.
  context.setDefaultTimeout(3000);
  const page: Page = await context.newPage();
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
    for (let step = 0; step < 200; step++) {
      const now = await place();
      const to =
        top > now.top
          ? Math.min(top, now.top + size.height * 16, now.max)
          : Math.max(top, now.top - size.height * 16);
      if (now.top === to && (to === top || to === now.max)) {
        await settle(40);
        const after = await place();
        if (after.max === now.max && after.top === now.top) return now.top;
        continue;
      }
      await scroll(to);
      await settle(0);
    }
    return (await place()).top;
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

  /** Presses the row nearest the list's middle, as a pointer does; answers the row. */
  const press = async (list: ListName) => {
    const row = await middleRow();
    await page.mouse.click(row.x, row.y);
    const prefix = list === 'hymns' ? '/hymns' : '/search';
    const want = `${prefix}/${row.label.split(',')[0]}`;
    await page.waitForURL((url) => url.pathname === want, { timeout: 2000 });
    return row;
  };

  /** Clicks the tab bar's link to `list`. */
  const tab = (list: ListName) =>
    page.getByRole('navigation').getByText(lists[list].title, { exact: true }).click();

  /**
   * Does `go`, which shows `list`; answers whether the row named `label`
   * was fully on screen in the first frame that drew the list.
   */
  const comeBack = async (list: ListName, label: string, go: () => Promise<unknown>) => {
    await page.evaluate(
      ([path, name]) => {
        window.hymnal.watching = window.hymnal.watch(path, name);
      },
      [lists[list].path, label] as const,
    );
    await go();
    const drawn = await page.evaluate(() => window.hymnal.watching);
    await shown();
    return drawn === true;
  };

  await page.goto(`${server.url.href.replace(/\/$/, '')}${path}${hold ? '?hold' : ''}`);
  if (!hold) await hydrated();
  await shown();
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
    press,
    tab,
    comeBack,
    [Symbol.asyncDispose]: () => context.close(),
  };
};

type Session = Awaited<ReturnType<typeof open>>;

beforeAll(async () => {
  const [script, launched] = await Promise.all([bundle(), chromium.launch()]);
  browser = launched;
  server = Bun.serve({
    port: 0,
    fetch: (request) => {
      const { pathname } = new URL(request.url);
      return pathname === '/page.js'
        ? new Response(script, { headers: { 'content-type': 'text/javascript' } })
        : new Response(render(pathname), { headers: { 'content-type': 'text/html' } });
    },
  });
});

afterAll(async () => {
  await browser?.close();
  await server?.stop(true);
});

/** The ways back to a list after the reader leaves it, and how he leaves it for each. */
const paths = {
  /** He opens a hymn from a row, then presses the browser's Back. */
  back: async (app: Session, list: ListName, label: string) => {
    await app.press(list);
    return app.comeBack(list, label, () => app.page.goBack());
  },
  /** He opens a hymn from a row, then follows the header's back link to the list. */
  header: async (app: Session, list: ListName, label: string) => {
    await app.press(list);
    return app.comeBack(list, label, () =>
      app.page.getByText(`‹ ${lists[list].title}`, { exact: true }).click(),
    );
  },
  /** He switches to the other list's tab, then back to this one's. */
  tab: async (app: Session, list: ListName, label: string) => {
    await app.tab(list === 'hymns' ? 'search' : 'hymns');
    await app.page.waitForFunction(
      (path) => location.pathname === path && window.hymnal.place() !== undefined,
      lists[list === 'hymns' ? 'search' : 'hymns'].path,
    );
    return app.comeBack(list, label, () => app.tab(list));
  },
} as const;

type Way = keyof typeof paths;

/** What the reader does after the list is back; answers how many pixels of rows on screen were blank. */
const moves = {
  /** He moves it straight to the top, in one step (the scroll bar, a key). */
  top: async (app: Session) => {
    await app.scroll(0);
    await app.settle(100);
    return app.blank();
  },
  /** He flings it to the top: a burst of wheel turns, the last ones small. */
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
    return app.blank();
  },
  /** He searches for what no hymn has, then clears the search (the Search list only). */
  nothing: async (app: Session) => {
    const field = app.page.getByRole('searchbox');
    await field.fill('zzqxj');
    await app.page.getByText('No hymn matches', { exact: false }).waitFor();
    await field.fill('');
    await app.page.waitForFunction(() => window.hymnal.showing());
    await app.settle(150);
    return app.blank();
  },
  /** He scrolls on: up halfway to the top, then down to the very end. */
  onward: async (app: Session) => {
    const { top, max } = await app.place();
    for (const want of [top / 2, max]) {
      await app.scrollTo(Math.round(want));
      await app.settle(0);
    }
    await app.settle(150);
    return app.blank();
  },
} as const;

type Move = keyof typeof moves;

/** The moves each list's visits take in turn. */
const movesOf: Record<ListName, ReadonlyArray<Move>> = {
  hymns: ['top', 'fling', 'onward'],
  search: ['top', 'fling', 'nothing', 'onward'],
};

interface Visit {
  readonly height: number;
  readonly share: number;
  /** Where the reader left the list. */
  readonly left: number;
  /** Where the list was when it was shown again. */
  readonly found: number;
  /** Whether the row the reader left was on screen in the first frame of the list shown again. */
  readonly drawn: boolean;
  /** Times the list moved by itself: as he scrolled to leave it, and after it came back. */
  readonly jumps: ReadonlyArray<unknown>;
  readonly move: Move;
  /** Pixels of rows on screen left blank after the move. */
  readonly blank: number;
}

/**
 * The visits that did not come back within one row, did not draw the
 * reader's row at once, saw the list move by itself, or left rows blank.
 */
const missed = (visits: ReadonlyArray<Visit>) =>
  visits.filter(
    (v) => Math.abs(v.found - v.left) > rowHeight || !v.drawn || v.jumps.length > 0 || v.blank > 0,
  );

/**
 * On a page of its own, cold-loaded at `list`, visits the shares of the
 * list's height at `part` (their indexes in `shares`) in turn: at a window height that turns with the visit and
 * the case (`turn`), so every height meets every share and every way back,
 * the reader scrolls there and leaves the list (pressing a row 150 ms after
 * his scroll on even visits, at once on odd ones); he comes back the `way`
 * the case names, then makes the visit's move.
 */
const visit = async (list: ListName, way: Way, turn: number, part: ReadonlyArray<number>) => {
  await using app = await open({ path: lists[list].path });
  const hydration = await app.errors();
  const visits: Array<Visit> = [];
  for (const index of part) {
    const share = shares[index] ?? 1;
    const height = heights[(index + turn) % heights.length] ?? 874;
    await app.resize(height);
    const { max } = await app.place();
    const left = await app.scrollTo(Math.round(max * share));
    await app.settle(index % 2 === 0 ? 150 : 0);
    const row = await app.middleRow();
    const drawn = await paths[way](app, list, row.label);
    const { top: found } = await app.place();
    const move = movesOf[list][index % movesOf[list].length] ?? 'top';
    const blank = await moves[move](app);
    visits.push({ height, share, left, found, drawn, jumps: await app.jumps(), move, blank });
  }
  return { hydration, misses: missed(visits) };
};

describe('a list comes back where the reader left it', () => {
  for (const [turn, [list, way]] of (
    [
      ['hymns', 'back'],
      ['hymns', 'header'],
      ['hymns', 'tab'],
      ['search', 'back'],
      ['search', 'header'],
      ['search', 'tab'],
    ] as const
  ).entries()) {
    // Each case's visits in two pages at once, the first shares and the last.
    for (const part of [
      [0, 1, 2],
      [3, 4, 5],
    ]) {
      it.concurrent(`the ${list} list, by ${way}, at shares ${part.map((index) => shares[index]).join(', ')} of its height`, async () => {
        expect(await visit(list, way, turn, part)).toEqual({ hydration: [], misses: [] });
      });
    }
  }
});

describe('a list loaded cold hydrates the server’s list', () => {
  for (const list of ['hymns', 'search'] as const) {
    for (const [index, height] of heights.entries()) {
      it.concurrent(`the ${list} list, ${height} px high, keeps a scroll made before and after hydration`, async () => {
        await using app = await open({ path: lists[list].path, height, hold: true });
        const { max } = await app.place();
        const before = await app.scroll(Math.round(max * (shares[index + 1] ?? 1)));
        await app.page.evaluate(() => window.hymnal.hydrate());
        await app.hydrated();
        await app.settle(150);
        const kept = (await app.place()).top;
        const blankBefore = await app.blank();
        const after = await app.scroll(Math.round(max * (shares[index + 2] ?? 0)));
        await app.settle(150);
        expect({
          errors: await app.errors(),
          kept: kept - before,
          blankBefore,
          moved: (await app.place()).top - after,
          blankAfter: await app.blank(),
          jumps: await app.jumps(),
        }).toEqual({ errors: [], kept: 0, blankBefore: 0, moved: 0, blankAfter: 0, jumps: [] });
      });
    }
  }
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
