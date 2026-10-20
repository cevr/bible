/* oxlint-disable effect/noGlobals, effect/noAsyncFunction, eslint/no-await-in-loop, effect/noNewPromise, effect/noThrowStatement, effect/noNewError, effect/noNullish, effect/noTernary, effect/noTestLifecycleHooks -- a browser harness, a host boundary: it builds the page with Bun, serves it, and drives Chromium one step after another through Playwright's promises, as packages/ui's browser tests do. */

/**
 * The Hymns list in a real browser (Chromium, through Playwright), because
 * a scroll place needs layout and a fake DOM has none. On the web a list is
 * mounted anew when the reader comes back to it (Back from a hymn, or its
 * tab), and it must come back where he left it:
 * - Back and a tab switch return to the saved offset (the spec asks within
 *   one row; the list keeps it to the pixel, and so does this test), at
 *   offsets across the whole list, from hymn 1 to the very end;
 * - once the reader scrolls, the list never moves by itself;
 * - a press right after a scroll saves the true offset.
 * A row is a real link: Enter opens it inside the app, and a Cmd- or
 * Ctrl-click leaves it to the browser, which opens it in a new tab.
 *
 * The page (`page.tsx`) is bundled here with the boundaries the app's other
 * tests use (`src/test/setup.ts`): react-native-web, the real words, and
 * `src/test/one.tsx` for the router. Each case has a page of its own, so
 * the cases run at once. It needs Playwright's Chromium
 * (`bunx playwright install chromium`).
 */

import { afterAll, beforeAll, describe, expect, it } from 'bun:test';
import { chromium, type Browser, type BrowserContext, type Page } from '@playwright/test';
import type { BunPlugin } from 'bun';

import { readWords } from '../../vite/words';

/** The page's window: a phone's width and height, in CSS pixels. */
const viewport = { width: 402, height: 874 };

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

const html =
  '<!doctype html><html><head><meta charset="utf-8"></head><body><div id="root"></div><script type="module" src="/page.js"></script></body></html>';

let server: ReturnType<typeof Bun.serve>;
let browser: Browser;

/** The offsets sampled, by share of the list's height: its first rows to its very end. */
const shares = [0.005, 0.1, 0.33, 0.6, 0.85, 1];

/** The offsets each list case visits, measured once by scrolling to the list's end. */
let offsets: ReadonlyArray<number> = [];

/**
 * A page of the app of its own, in a window of `size`, at the list's top,
 * and what a case does on it: each step waits for the page as a reader's
 * next move would.
 */
const open = async (size = viewport) => {
  const context: BrowserContext = await browser.newContext({ viewport: size });
  const page: Page = await context.newPage();

  /** Waits `ms`, then two frames. */
  const settle = (ms: number) =>
    page.evaluate(
      (wait) =>
        new Promise<void>((done) =>
          setTimeout(() => requestAnimationFrame(() => requestAnimationFrame(() => done())), wait),
        ),
      ms,
    );

  /** Waits for the list to be on screen, then for two frames, so a restore has run. */
  const shown = async () => {
    await page.waitForFunction(() => window.hymnal?.place() !== undefined);
    await settle(0);
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
   * Scrolls the list to `top` as a reader does: eight screens at a time,
   * until the list is there or can go no further. Answers where it stopped.
   */
  const scrollTo = async (top: number) => {
    for (let step = 0; step < 200; step++) {
      const now = await place();
      const to = Math.min(top, now.top + viewport.height * 8, now.max);
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

  /** Each time the list moved by itself since the reader last scrolled it. */
  const jumps = () => page.evaluate(() => [...window.hymnal.jumps]);

  /** The row nearest the window's middle. */
  const middleRow = () => page.evaluate(() => window.hymnal.middle());

  /** Presses the row nearest the window's middle, as a pointer does; answers the row. */
  const press = async () => {
    const row = await middleRow();
    await page.mouse.click(row.x, row.y);
    const opened = await page.evaluate(() => window.hymnal.opened.at(-1));
    expect(opened).toBe(`/hymns/${row.label.split(',')[0]}`);
    return row;
  };

  /**
   * Shows the list again; answers whether the row named `label` was on
   * screen in the first frame that drew the list (none named: not asked).
   */
  const back = async (label?: string) => {
    const drawn = await page.evaluate(
      (name) =>
        new Promise<boolean>((done) => {
          window.hymnal.back();
          const look = () => {
            const rows = [...document.querySelectorAll('[aria-label]')];
            if (!rows.some((node) => /^\d+, /.test(node.getAttribute('aria-label') ?? ''))) {
              requestAnimationFrame(look);
              return;
            }
            const box = rows
              .find((node) => node.getAttribute('aria-label') === name)
              ?.getBoundingClientRect();
            done(
              name === undefined ||
                (box !== undefined && box.top >= 0 && box.bottom <= innerHeight),
            );
          };
          requestAnimationFrame(look);
        }),
      label,
    );
    await shown();
    return drawn;
  };

  await page.goto(server.url.href);
  await shown();
  return {
    page,
    context,
    settle,
    place,
    scroll,
    scrollTo,
    jumps,
    middleRow,
    press,
    back,
    [Symbol.asyncDispose]: () => context.close(),
  };
};

type Session = Awaited<ReturnType<typeof open>>;

beforeAll(async () => {
  const [script, launched] = await Promise.all([bundle(), chromium.launch()]);
  browser = launched;
  // Every path is the page, so a link opened in a new tab loads it too.
  server = Bun.serve({
    port: 0,
    fetch: (request) =>
      new URL(request.url).pathname === '/page.js'
        ? new Response(script, { headers: { 'content-type': 'text/javascript' } })
        : new Response(html, { headers: { 'content-type': 'text/html' } }),
  });
  await using app = await open();
  await app.scrollTo(Number.MAX_SAFE_INTEGER);
  const { max } = await app.place();
  expect(max).toBeGreaterThan(viewport.height * 20);
  offsets = shares.map((share) => Math.round(max * share));
});

afterAll(async () => {
  await browser?.close();
  await server?.stop(true);
});

interface Visit {
  readonly offset: number;
  /** Where the reader left the list. */
  readonly left: number;
  /** Where the list was when it was shown again. */
  readonly found: number;
  /** Whether the row the reader left was on screen in the first frame of the list shown again. */
  readonly drawn: boolean;
  readonly jumps: ReadonlyArray<unknown>;
}

/**
 * The visits that did not come back to the pixel, did not draw the
 * reader's row at once, or saw the list move by itself.
 */
const missed = (visits: ReadonlyArray<Visit>) =>
  visits.filter((v) => Math.abs(v.found - v.left) > 1 || !v.drawn || v.jumps.length > 0);

/**
 * Visits each offset in turn on a page of its own: `leave` scrolls to it
 * and leaves the list, answering the row in the window's middle; then the
 * list is shown again and read. Every jump the scroll saw before leaving
 * is kept.
 */
const visit = async (
  leave: (
    app: Session,
    offset: number,
  ) => Promise<{ left: number; row: { label: string; height: number } }>,
) => {
  await using app = await open();
  const visits: Array<Visit> = [];
  for (const offset of offsets) {
    const { left, row } = await leave(app, offset);
    const seen = await app.jumps();
    const drawn = await app.back(row.label);
    const { top: found } = await app.place();
    visits.push({ offset, left, found, drawn, jumps: seen });
  }
  return missed(visits);
};

describe('the Hymns list comes back where the reader left it', () => {
  it.concurrent('after Back from a hymn opened from a row, at offsets across the whole list', async () => {
    const misses = await visit(async (app, offset) => {
      const left = await app.scrollTo(offset);
      // Past the 100 ms after a scroll in which react-native-web reports its end.
      await app.settle(150);
      return { left, row: await app.press() };
    });
    expect(misses).toEqual([]);
  });

  it.concurrent('after a tab switch right after a scroll, at offsets across the whole list', async () => {
    const misses = await visit(async (app, offset) => {
      await app.scrollTo(Math.max(0, offset - viewport.height));
      const left = await app.scroll(offset);
      await app.settle(0);
      const row = await app.middleRow();
      await app.page.evaluate(() => window.hymnal.away());
      await app.settle(150);
      return { left, row };
    });
    expect(misses).toEqual([]);
  });

  it.concurrent('saves the true offset when a row is pressed right after a scroll', async () => {
    const misses = await visit(async (app, offset) => {
      await app.scrollTo(Math.max(0, offset - viewport.height));
      const left = await app.scroll(offset);
      await app.settle(0);
      const row = await app.press();
      await app.settle(150);
      return { left, row };
    });
    expect(misses).toEqual([]);
  });

  it.concurrent('never moves by itself once the reader scrolls, after coming back deep in the list', async () => {
    await using app = await open();
    await app.scrollTo(offsets.at(-2) ?? 0);
    await app.settle(150);
    await app.press();
    await app.back();
    // The reader scrolls up to the top, then down past where he was, to the end.
    for (const want of [...offsets.slice(0, 4).toReversed(), 0, ...offsets]) {
      await app.scrollTo(want);
      await app.settle(0);
    }
    await app.settle(150);
    expect(await app.jumps()).toEqual([]);
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
    await using app = await open({ width: 320, height: 568 });
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
    expect(sizes).toEqual({ row: 44, lines: [22, 22] });
  });

  it.concurrent('opens its hymn inside the app on Enter, never loading the page anew', async () => {
    await using app = await open();
    await app.page.evaluate(() => Object.assign(window, { kept: true }));
    await app.page.focus(second);
    await app.page.keyboard.press('Enter');
    await app.settle(0);
    const after = await app.page.evaluate(() => ({
      opened: [...window.hymnal.opened],
      kept: 'kept' in window,
      path: location.pathname,
    }));
    expect(after).toEqual({ opened: ['/hymns/2'], kept: true, path: '/' });
  });

  it.concurrent('leaves a Cmd- or Ctrl-click to the browser, which opens the hymn in a new tab', async () => {
    await using app = await open();
    const [tab] = await Promise.all([
      app.context.waitForEvent('page', { timeout: 5000 }),
      app.page.locator(second).click({ modifiers: ['ControlOrMeta'] }),
    ]);
    await tab.waitForLoadState();
    const opened = await app.page.evaluate(() => [...window.hymnal.opened]);
    expect({ tab: new URL(tab.url()).pathname, opened }).toEqual({ tab: '/hymns/2', opened: [] });
  });
});
