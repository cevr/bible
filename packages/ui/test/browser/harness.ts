// The browser tests' page: the fixture file a test file names, compiled once
// per test file by Solid's compiler (the DOM build, Solid's development runtime
// so its diagnostics show), served by a Bun server on a free port, and opened
// in Playwright's Chromium. A case opens a fixture by name; the page mounts
// it into `#root` and records what the fixture logs in `window.__log`.
//
// A test file opened with `hydrate` serves each page as its fixture's server
// render instead (`server.ts`: Solid's server build, run in the test's
// process per page, with the script hydration needs), and the page
// hydrates the browser's build over it; both builds are hydratable.
//
// Real Chromium, not a fake DOM: focus, pointer and touch events, layout and
// `:focus-visible` are what the parts are about, and a fake DOM gets them
// wrong. Run with `bun run test:browser` (it needs Playwright's Chromium:
// `bunx playwright install chromium`).
//
// The whole browser in Chrome's headless mode, not Playwright's default
// headless shell: the shell is a separate, slimmer build, and on macOS its
// view never takes the pointer lock (`requestPointerLock` rejects with
// WrongDocumentError), so a scrub's lock was never tested there.
import { afterAll, afterEach, beforeAll } from 'bun:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';

import { transform } from '@solidjs/compiler';
import { chromium, type Browser, type BrowserContext, type Page } from '@playwright/test';
import type { BunPlugin } from 'bun';

import type * as ServerEntry from './server.ts';

/**
 * The flags every Chromium here launches with, as the film's `chromeArgs`:
 * `--mute-audio` mutes its pages and `--disable-audio-output` plays to a fake
 * device, so a test never opens the host's speakers.
 */
const SILENT = [
  '--mute-audio',
  '--disable-audio-output',
  '--overscroll-history-navigation=0',
  '--pull-to-refresh=0',
];

interface SolidOptions {
  /** `dom` for the browser, `ssr` for the server's render. */
  readonly generate: 'dom' | 'ssr';
  /** Whether the output hydrates (`dom`) or renders markup to hydrate (`ssr`). */
  readonly hydratable: boolean;
  /** The fixture file `fixtures/index.ts` resolves to, if any. */
  readonly fixtureFile?: string | undefined;
}

/** Solid's compiler, with `fixtures/index.ts` resolved to the fixture file. */
const solid = (options: SolidOptions): BunPlugin => ({
  name: `solid-${options.generate}`,
  setup(build) {
    const { fixtureFile } = options;
    if (fixtureFile !== undefined) {
      build.onResolve({ filter: /fixtures\/index\.ts$/ }, () => ({ path: fixtureFile }));
    }
    build.onLoad({ filter: /\.tsx$/ }, async (args) => {
      const code = await Bun.file(args.path).text();
      const out = transform(code, {
        filename: args.path,
        generate: options.generate,
        hydratable: options.hydratable,
        moduleName: '@solidjs/web',
      });
      return { contents: out.code, loader: 'ts' };
    });
  },
});

/** The page script serving one fixture file's fixtures, built in memory (nothing is written to disk). */
const bundle = async (fixtureFile: string, hydratable: boolean): Promise<string> => {
  const output = await Bun.build({
    entrypoints: [`${import.meta.dir}/client.tsx`],
    plugins: [solid({ generate: 'dom', hydratable, fixtureFile })],
    target: 'browser',
    conditions: ['browser', 'development'],
  });
  const [script] = output.outputs;
  if (!output.success || !script) {
    throw new Error(output.logs.map(String).join('\n'));
  }
  return script.text();
};

/** A server build of `entry` (Solid's `ssr` output, hydratable), loaded in this process. */
export interface ServerBuild<Module> {
  readonly module: Module;
  /** Removes the build's files. */
  readonly dispose: () => Promise<void>;
}

/**
 * Builds `entry` for the server, with `fixtures/index.ts` resolved to
 * `fixtureFile` when given, and imports it. The bundle holds its own copy of
 * Solid's server runtime, so whatever renders must be in `entry`.
 */
export const buildServer = async <Module>(
  entry: string,
  fixtureFile?: string,
): Promise<ServerBuild<Module>> => {
  const outdir = await mkdtemp(`${tmpdir()}/ui-server-`);
  const dispose = () => rm(outdir, { recursive: true, force: true });
  const output = await Bun.build({
    entrypoints: [entry],
    plugins: [solid({ generate: 'ssr', hydratable: true, fixtureFile })],
    target: 'bun',
    outdir,
  });
  const [built] = output.outputs;
  if (!output.success || !built) {
    await dispose();
    throw new Error(output.logs.map(String).join('\n'));
  }
  const module: Module = await import(built.path);
  return { module, dispose };
};

/** The page: `head` in its head, and `#root` empty or holding the server's markup to hydrate. */
const page = (head: string, served: string | undefined): string => `<!doctype html>
<html><head><meta charset="utf-8"><title>ui</title>
<style>
  body { margin: 0; font: 14px sans-serif; }
  /* A host page's own overscroll gestures (pull to refresh, swipe back) reload or leave the page under
     a test; a finger that drags past a hidden sheet reaches the document. */
  html { overscroll-behavior: none; }
  [hidden] { display: none !important; }
</style>${head}</head>
<body>${served === undefined ? '<div id="root"></div>' : `<div id="root" data-served>${served}</div>`}<script type="module" src="/client.js"></script></body></html>`;

export interface HarnessOptions {
  /**
   * Each page is its fixture's server render, which the browser hydrates
   * (`hydrate()`), instead of an empty root the browser renders into.
   */
  readonly hydrate?: boolean;
}

export interface Harness {
  /** Opens `fixture` in a fresh page; `query` reaches the fixture as URL params. */
  open(fixture: string, options?: OpenOptions): Promise<Page>;
}

export interface OpenOptions {
  readonly query?: Record<string, string>;
  /** A touch device: `hasTouch` and `isMobile`, as a phone's browser reports. */
  readonly touch?: boolean;
  readonly viewport?: { width: number; height: number };
  /**
   * Scrollbars that take room, as on Windows and Linux: the page opens in a
   * Chromium launched without `--hide-scrollbars` (headless hides them).
   */
  readonly scrollbars?: boolean;
  /**
   * The `navigator.platform` the page reports (`MacIntel`, `Linux x86_64`):
   * the parts read their OS from it as they load, so a case can hold each
   * OS's rule on any host.
   */
  readonly platform?: string;
  /**
   * The engine the page reads itself as: `webkit` answers `CSS.supports` for the
   * `-webkit-backdrop-filter` WebKit alone has, as the parts read it, so a case can hold a
   * WebKit rule in Chromium.
   */
  readonly engine?: 'webkit';
  /**
   * The page's `<meta name="viewport" content="width=device-width">`, as the lab's pages have:
   * a touch page lays out at its window's width, not a desktop page's 980 px.
   */
  readonly deviceWidth?: boolean;
}

/**
 * The browser for one test file, serving the fixtures `fixtureFile` (a file
 * under `fixtures/`) exports as `fixtures`. Call it at the top of the test
 * file: it registers the file's hooks. The server and Chromium start before
 * the first case and stop after the last.
 *
 * A case fails when any page it opened reported an uncaught error, a console
 * error or a console warning (Solid's development diagnostics are warnings)
 * at any time, during mount or after. Each case's pages close when it ends,
 * so nothing a page does later lands on the next case.
 */
export const harness = (fixtureFile: string, options: HarnessOptions = {}): Harness => {
  const hydrate = options.hydrate ?? false;
  let server: ReturnType<typeof Bun.serve> | undefined;
  let serverBuild: ServerBuild<typeof ServerEntry> | undefined;
  let browser: Browser | undefined;
  // Launched for the first page that asks for scrollbars that take room.
  let scrollbarBrowser: Promise<Browser> | undefined;
  let contexts: Array<BrowserContext> = [];
  let problems: Array<string> = [];

  beforeAll(async () => {
    const fixturePath = `${import.meta.dir}/fixtures/${fixtureFile}`;
    const script = await bundle(fixturePath, hydrate);
    if (hydrate) {
      serverBuild = await buildServer(`${import.meta.dir}/server.ts`, fixturePath);
    }
    const render = serverBuild?.module.render;
    server = Bun.serve({
      port: 0,
      fetch(request) {
        const url = new URL(request.url);
        if (url.pathname === '/client.js') {
          return new Response(script, { headers: { 'content-type': 'text/javascript' } });
        }
        const rendered = render?.(url.searchParams.get('fixture') ?? '');
        return new Response(page(rendered?.head ?? '', rendered?.html), {
          headers: { 'content-type': 'text/html;charset=utf-8' },
        });
      },
    });
    browser = await chromium.launch({ channel: 'chromium', args: SILENT });
  });

  afterEach(async () => {
    const closing = contexts;
    contexts = [];
    await Promise.all(closing.map((context) => context.close()));
    const found = problems;
    problems = [];
    if (found.length > 0) {
      throw new Error(`the page reported problems:\n${found.join('\n')}`);
    }
  });

  afterAll(async () => {
    await browser?.close();
    await (await scrollbarBrowser)?.close();
    await server?.stop(true);
    await serverBuild?.dispose();
  });

  return {
    async open(fixture, options = {}) {
      if (!browser || !server) {
        throw new Error('harness: open a fixture inside a case');
      }
      if (options.scrollbars) {
        scrollbarBrowser ??= chromium.launch({
          args: SILENT,
          ignoreDefaultArgs: ['--hide-scrollbars'],
        });
      }
      const from = options.scrollbars ? await scrollbarBrowser! : browser;
      const context = await from.newContext({
        hasTouch: options.touch ?? false,
        isMobile: options.touch ?? false,
        viewport: options.viewport ?? { width: 800, height: 600 },
      });
      contexts.push(context);
      if (options.platform !== undefined) {
        await context.addInitScript((platform) => {
          Object.defineProperty(Navigator.prototype, 'platform', { get: () => platform });
        }, options.platform);
      }
      if (options.engine === 'webkit') {
        await context.addInitScript(() => {
          const supports = CSS.supports.bind(CSS) as (...args: Array<string>) => boolean;
          CSS.supports = ((...args: Array<string>) =>
            args.join(' ').replace(/\s/g, '') === '-webkit-backdrop-filter:none' ||
            supports(...args)) as typeof CSS.supports;
        });
      }
      if (options.deviceWidth) {
        await context.addInitScript(() => {
          document.addEventListener('DOMContentLoaded', () => {
            const meta = document.createElement('meta');
            meta.name = 'viewport';
            meta.content = 'width=device-width';
            document.head.append(meta);
          });
        });
      }
      const page = await context.newPage();
      page.setDefaultTimeout(5000);
      page.on('pageerror', (error) => problems.push(`pageerror: ${error.message}`));
      page.on('console', (message) => {
        const type = message.type();
        if (type === 'error' || type === 'warning') {
          problems.push(`console.${type}: ${message.text()}`);
        }
      });
      const query = new URLSearchParams({ fixture, ...options.query });
      await page.goto(`${server.url.origin}/?${query}`);
      await page
        .locator('#root[data-mounted]')
        .waitFor({ state: 'attached', timeout: 5000 })
        .catch((error: unknown) => {
          throw new Error(
            `fixture ${fixture} did not mount: ${String(error)}\n${problems.join('\n')}`,
          );
        });
      return page;
    },
  };
};

/** What the fixture logged (`log(...)` in the page), in order. */
export const logOf = (page: Page): Promise<Array<string>> =>
  page.evaluate(() => (window as unknown as { __log: Array<string> }).__log);

/** The markup the server rendered into `#root`, as the page received it (a hydrating harness's page). */
export const servedOf = (page: Page): Promise<string> =>
  page.evaluate(() => (window as unknown as { __served: string }).__served);

/** The `id` of the focused element, or the tag name when it has none. */
export const focused = (page: Page): Promise<string> =>
  page.evaluate(() => {
    const el = document.activeElement;
    if (!el) {
      return '';
    }
    return el.id || el.getAttribute('data-testid') || el.tagName.toLowerCase();
  });

/**
 * Logs each CSS transition the page creates from here on, as
 * `transition <id> <property>` (the element's `id`, or its `data-testid`).
 * `transitionrun` fires when the browser creates a transition, so a popup
 * whose starting style the browser never computed logs none.
 */
export const recordTransitions = (page: Page): Promise<void> =>
  page.evaluate(() => {
    document.addEventListener(
      'transitionrun',
      (event) => {
        const target = event.target as Element;
        const name = target.id || target.getAttribute('data-testid') || target.tagName;
        (window as unknown as { __log: Array<string> }).__log.push(
          `transition ${name} ${event.propertyName}`,
        );
      },
      true,
    );
  });

/**
 * Clicks `selector` from a script a task later, as a page's own code opens a
 * popup (a timer, a response): no pointer input, so the browser does not
 * update hover state after it, which reads the page's style.
 */
export const scriptClick = (page: Page, selector: string): Promise<void> =>
  page.evaluate((target) => {
    setTimeout(() => (document.querySelector(target) as HTMLElement).click());
  }, selector);
