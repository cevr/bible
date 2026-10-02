/* oxlint-disable effect/noAsyncFunction, effect/noGlobals, effect/noNodeBuiltinImport, effect/noTestLifecycleHooks, effect/noThrowStatement, effect/noNewError -- Playwright's
 * browser protocol and Bun's server are Promise based, and the browser and
 * server live for the file, as Playwright's own fixtures would. */
// The SSR proof in a browser: the server renders a place from the request
// (no hash), Chromium hydrates it with the hash in its URL, and the page
// must hydrate without a mismatch and then show the hash.
//
// Run with `bun run test:ssr`; it needs Playwright's Chromium, so the gate
// leaves it out (the server half runs in `server.test.ts`).
import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';

import { chromium, type Browser } from '@playwright/test';

import { build } from './build.ts';

let browser: Browser;
let server: ReturnType<typeof Bun.serve>;

beforeAll(async () => {
  const { page, client } = await build(await mkdtemp(`${tmpdir()}/atom-solid-ssr-`));
  server = Bun.serve({
    port: 0,
    fetch(request) {
      const url = new URL(request.url);
      if (url.pathname === '/client.js')
        return new Response(client, { headers: { 'content-type': 'text/javascript' } });
      return new Response(page(`${url.pathname}${url.search}`), {
        headers: { 'content-type': 'text/html;charset=utf-8' },
      });
    },
  });
  browser = await chromium.launch();
});

afterAll(async () => {
  await browser.close();
  await server.stop(true);
});

describe('hydrating a place', () => {
  test('matches the server markup, then shows the hash', async () => {
    const page = await browser.newPage();
    const problems: Array<string> = [];
    page.on('pageerror', (error) => problems.push(`pageerror: ${error.message}`));
    page.on('console', (message) => {
      if (message.type() === 'error' || message.type() === 'warning')
        problems.push(`${message.type()}: ${message.text()}`);
    });

    const response = await page.goto(`${server.url.origin}/films/f/lab/s?cue=c#t=2`);
    // What the server sent: the hash at its default.
    expect(await response?.text()).toMatch(/<i [^>]*id="t"[^>]*>0<\/i>/);

    // After hydration: the hash the browser holds.
    await page
      .locator('b#t')
      .waitFor({ timeout: 5000 })
      .catch((error: unknown) => {
        throw new Error(`no hydrated hash: ${String(error)}\n${problems.join('\n')}`);
      });
    expect(await page.locator('#t').textContent()).toBe('2');
    expect(await page.locator('#film').textContent()).toBe('f');
    expect(await page.locator('#cue').textContent()).toBe('c');
    expect(problems).toEqual([]);
    await page.close();
  });
});
