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

/** The reads of the answer the server's own render made. */
let serverReads = 0;

beforeAll(async () => {
  const { page, client, answerPage, answerClient } = await build(
    await mkdtemp(`${tmpdir()}/atom-solid-ssr-`),
  );
  server = Bun.serve({
    port: 0,
    async fetch(request) {
      const url = new URL(request.url);
      if (url.pathname === '/client.js')
        return new Response(client, { headers: { 'content-type': 'text/javascript' } });
      if (url.pathname === '/answer-client.js')
        return new Response(answerClient, { headers: { 'content-type': 'text/javascript' } });
      if (url.pathname === '/api/answer') return new Response('from the browser');
      if (url.pathname === '/answer')
        return new Response(
          await answerPage(async () => {
            serverReads += 1;
            return '42';
          }),
          { headers: { 'content-type': 'text/html;charset=utf-8' } },
        );
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

describe('adopting the data the server read', () => {
  test('the server renders the answer; hydration shows it and sends no request for it', async () => {
    const page = await browser.newPage();
    const problems: Array<string> = [];
    const asked: Array<string> = [];
    page.on('pageerror', (error) => problems.push(`pageerror: ${error.message}`));
    page.on('console', (message) => {
      if (message.type() === 'error' || message.type() === 'warning')
        problems.push(`${message.type()}: ${message.text()}`);
    });
    page.on('request', (request) => {
      const { pathname } = new URL(request.url());
      if (pathname.startsWith('/api/')) asked.push(pathname);
    });
    const before = serverReads;

    const response = await page.goto(`${server.url.origin}/answer`);
    // The server read the answer once and sent it rendered.
    expect(await response?.text()).toMatch(/<p [^>]*id="answer"[^>]*>answered 42<\/p>/);
    expect(serverReads - before).toBe(1);

    // Hydrated: the page is live, and still shows the server's answer. A
    // request the hydration made would be on its way by now: the atom's read
    // starts as its hook subscribes, in the hydration pass itself.
    await page.waitForFunction(() => Reflect.get(globalThis, '_$HY')?.done === true);
    expect(await page.locator('#answer').textContent()).toBe('answered 42');
    // No request for what the server already read.
    expect(asked).toEqual([]);
    // The adopted atom is live: read again, it asks the browser's way.
    await page.locator('#again').click();
    await page.locator('#answer', { hasText: 'answered from the browser' }).waitFor({
      timeout: 5000,
    });
    expect(asked).toEqual(['/api/answer']);
    expect(problems).toEqual([]);
    await page.close();
  });
});
