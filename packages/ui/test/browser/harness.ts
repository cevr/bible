// The browser tests' page: the fixture file a test file names, compiled once
// per test file by Solid's compiler (the DOM build, Solid's development runtime
// so its diagnostics show), served by a Bun server on a free port, and opened
// in Playwright's Chromium. A case opens a fixture by name; the page mounts
// it into `#root` and records what the fixture logs in `window.__log`.
//
// Real Chromium, not a fake DOM: focus, pointer and touch events, layout and
// `:focus-visible` are what the parts are about, and a fake DOM gets them
// wrong. Run with `bun run test:browser` (it needs Playwright's Chromium).
import { afterAll, afterEach, beforeAll } from 'bun:test';

import { transform } from '@solidjs/compiler';
import { chromium, type Browser, type BrowserContext, type Page } from '@playwright/test';
import type { BunPlugin } from 'bun';

/** Solid's DOM compiler, with `fixtures/index.ts` resolved to `fixtureFile`. */
const solid = (fixtureFile: string): BunPlugin => ({
  name: 'solid-dom',
  setup(build) {
    build.onResolve({ filter: /fixtures\/index\.ts$/ }, () => ({ path: fixtureFile }));
    build.onLoad({ filter: /\.tsx$/ }, async (args) => {
      const code = await Bun.file(args.path).text();
      const out = transform(code, {
        filename: args.path,
        generate: 'dom',
        moduleName: '@solidjs/web',
      });
      return { contents: out.code, loader: 'ts' };
    });
  },
});

/** The page script serving one fixture file's fixtures, built in memory (nothing is written to disk). */
const bundle = async (fixtureFile: string): Promise<string> => {
  const output = await Bun.build({
    entrypoints: [`${import.meta.dir}/client.tsx`],
    plugins: [solid(fixtureFile)],
    target: 'browser',
    conditions: ['browser', 'development'],
  });
  const [script] = output.outputs;
  if (!output.success || !script) {
    throw new Error(output.logs.map(String).join('\n'));
  }
  return script.text();
};

const PAGE = `<!doctype html>
<html><head><meta charset="utf-8"><title>ui</title>
<style>
  body { margin: 0; font: 14px sans-serif; }
  [hidden] { display: none !important; }
</style></head>
<body><div id="root"></div><script type="module" src="/client.js"></script></body></html>`;

export interface Harness {
  /** Opens `fixture` in a fresh page; `query` reaches the fixture as URL params. */
  open(fixture: string, options?: OpenOptions): Promise<Page>;
}

export interface OpenOptions {
  readonly query?: Record<string, string>;
  /** A touch device: `hasTouch` and `isMobile`, as a phone's browser reports. */
  readonly touch?: boolean;
  readonly viewport?: { width: number; height: number };
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
export const harness = (fixtureFile: string): Harness => {
  let server: ReturnType<typeof Bun.serve> | undefined;
  let browser: Browser | undefined;
  let contexts: Array<BrowserContext> = [];
  let problems: Array<string> = [];

  beforeAll(async () => {
    const script = await bundle(`${import.meta.dir}/fixtures/${fixtureFile}`);
    server = Bun.serve({
      port: 0,
      fetch(request) {
        const url = new URL(request.url);
        if (url.pathname === '/client.js') {
          return new Response(script, { headers: { 'content-type': 'text/javascript' } });
        }
        return new Response(PAGE, { headers: { 'content-type': 'text/html;charset=utf-8' } });
      },
    });
    browser = await chromium.launch();
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
    await server?.stop(true);
  });

  return {
    async open(fixture, options = {}) {
      if (!browser || !server) {
        throw new Error('harness: open a fixture inside a case');
      }
      const context = await browser.newContext({
        hasTouch: options.touch ?? false,
        isMobile: options.touch ?? false,
        viewport: options.viewport ?? { width: 800, height: 600 },
      });
      contexts.push(context);
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

/** The `id` of the focused element, or the tag name when it has none. */
export const focused = (page: Page): Promise<string> =>
  page.evaluate(() => {
    const el = document.activeElement;
    if (!el) {
      return '';
    }
    return el.id || el.getAttribute('data-testid') || el.tagName.toLowerCase();
  });
