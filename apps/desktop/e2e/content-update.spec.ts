/* oxlint-disable effect/noAsyncFunction, effect/noGlobals, effect/noNewPromise, effect/noNodeBuiltinImport, effect/noNullish, effect/noAs, effect/noTryCatch -- Playwright's API is promise-based and its locators are typed against the DOM's own nullable shapes; the manifest fixture server is `node:http`, whose listen and close are callback APIs and whose `address()` is a union the bound-TCP case always resolves. This file is a browser driver, not Effect code. */

/** §10 Milestone 9's UI parity, at the half only a running app can state.
 *
 * > **UI parity:** identical non-blocking toast and identical settings entry on
 * > web and desktop.
 *
 *  `packages/app/src/reading/content-update-state.test.ts` proves the *plan* —
 *  which state raises a toast, what each sentence says, when the settings entry
 *  offers a control. What it cannot see is whether the compiled components draw
 *  that plan: a toast that read the accessor per branch, that stole focus, or a
 *  settings entry that never mounted would leave every unit assertion green.
 *  That is what runs here.
 *
 *  **The manifest is seeded through the Config seam.** `BIBLE_CONTENT_MANIFEST_URL`
 *  is the one override `layerHttpContentManifest` reads, so a local HTTP server
 *  standing in for the release host is the whole of the fixture — Electron main
 *  runs its production adapter, its production decision and its production RPC
 *  against it, and nothing in the shipped graph is replaced.
 *
 *  Not in `turbo run gate`: this needs a built Electron app. Run it with
 *  `bun run --cwd apps/desktop test:e2e`.
 */

import {
  _electron as electron,
  expect,
  test,
  type ElectronApplication,
  type Page,
} from '@playwright/test';
import { createServer, type Server } from 'node:http';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';

/** The revision the seeded manifest offers, and the one the toast must name.
 *
 *  Above whatever this build has installed, and at a schema major this build
 *  reads — so the decision is an `offer` rather than a refusal, which is the
 *  one state §3.6 lets interrupt the reader. */
const OFFERED_REVISION = 'content-e2e-v9';

/** The schema major the shipped topics verifier gates on. Spelled here rather
 *  than imported: Playwright's runner resolves `@bible/core/corpus-supply`
 *  through a Bun condition this process does not have. A build that raises its
 *  schema major turns this manifest into a refusal, and the offer assertion
 *  below fails loudly rather than silently testing the other branch. */
const TOPICS_SCHEMA_MAJOR = 1;

const MANIFEST_BODY = JSON.stringify({
  revision: 'manifest-e2e',
  artifacts: {
    topics: {
      revision: OFFERED_REVISION,
      url: 'https://manifest.test/topics.db',
      sha256: `sha256:${'e'.repeat(64)}`,
      size: 16_384,
      schema_major: TOPICS_SCHEMA_MAJOR,
      // §3.6's ordinal (round-3 F2). Above this build's compiled floor, which
      // is what makes this an offer rather than an up-to-date — a manifest
      // whose generation was at or below the pin would report no update
      // however new its revision tag read.
      generation: 9,
    },
  },
});

/** A topics artifact at `userData/topics.db`, so the host has something
 *  installed to be offered an update *over*.
 *
 *  Without it the decision is still an offer — nothing installed is below any
 *  manifest entry — but the toast would say "none installed", and the sentence
 *  under test is the two-version one §3.6 gives as its example. The DDL is the
 *  one a compiled artifact carries, as `search-hybrid.spec.ts` documents. */
const seedTopics = (userDataPath: string): void => {
  const database = new DatabaseSync(path.join(userDataPath, 'topics.db'));
  database.exec(`
    CREATE TABLE meta (key TEXT PRIMARY KEY, value TEXT NOT NULL);
    CREATE TABLE topics (slug TEXT PRIMARY KEY, title TEXT NOT NULL, thesis_ast TEXT NOT NULL, body_ast TEXT NOT NULL, position INTEGER NOT NULL);
    CREATE TABLE topic_aliases (alias TEXT PRIMARY KEY, display TEXT NOT NULL, slug TEXT NOT NULL, canonical INTEGER NOT NULL);
    CREATE TABLE topic_edges (from_slug TEXT NOT NULL, to_slug TEXT NOT NULL, kind TEXT NOT NULL, position INTEGER NOT NULL, PRIMARY KEY (from_slug, to_slug, kind));
    CREATE TABLE topic_catalog_keys (slug TEXT PRIMARY KEY, catalog_id TEXT NOT NULL, matched_by TEXT NOT NULL);
    INSERT INTO meta (key, value) VALUES ('schema_major', '1');
  `);
  database.close();
};

/** The release host, locally. One route, one body — the adapter under test is
 *  the step from an HTTP response to a decision, so anything more would be
 *  testing the server. */
const serveManifest = async (): Promise<{ readonly server: Server; readonly url: string }> => {
  const server = createServer((_request, response) => {
    response.writeHead(200, { 'Content-Type': 'application/json' });
    response.end(MANIFEST_BODY);
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  // A bound TCP server always reports an `AddressInfo`; the `null` and string
  // arms are the not-listening and Unix-socket cases this fixture never takes.
  // Asserted rather than thrown on, so a fixture that somehow did not bind
  // fails as a test rather than as an unhandled rejection inside a helper.
  const address = server.address();
  expect(address).not.toBeNull();
  const port = Number((address as { readonly port: number }).port);
  expect(port).toBeGreaterThan(0);
  return { server, url: `http://127.0.0.1:${String(port)}/manifest.json` };
};

interface LaunchedApp {
  readonly application: ElectronApplication;
  readonly page: Page;
  readonly userDataPath: string;
  readonly server: Server;
}

const launch = async (): Promise<LaunchedApp> => {
  const userDataPath = await mkdtemp(path.join(tmpdir(), 'bible-desktop-content-'));
  seedTopics(userDataPath);
  const { server, url } = await serveManifest();
  const application = await electron.launch({
    args: ['dist/main/main.cjs'],
    cwd: path.resolve(import.meta.dirname, '..'),
    env: {
      // eslint-disable-next-line node/no-process-env -- preserve the Playwright worker environment
      ...process.env,
      BIBLE_LEGACY_CLI_STATE_PATH: path.join(userDataPath, 'missing-legacy-cli-state.db'),
      BIBLE_USER_DATA_PATH: userDataPath,
      // The Config seam. Everything else in the graph is production.
      BIBLE_CONTENT_MANIFEST_URL: url,
      NODE_ENV: 'test',
    },
  });
  const page = await application.firstWindow();
  await expect(page.getByRole('heading', { level: 1 })).toContainText('Genesis', {
    timeout: 90_000,
  });
  return { application, page, userDataPath, server };
};

const shutdown = async (app: LaunchedApp): Promise<void> => {
  await app.application.close();
  await new Promise<void>((resolve) => app.server.close(() => resolve()));
  await rm(app.userDataPath, { force: true, recursive: true });
};

/** Navigates to a settings section through the hash, because this host serves
 *  the renderer from `file://` and a plain path navigation leaves the app. */
const gotoSettings = async (page: Page, section: string): Promise<void> => {
  const base = page.url().split('#')[0] ?? '';
  await page.goto(`${base}#/settings/${section}`);
};

test.describe('the compiled content-update surfaces', () => {
  test('§3.6: an offer raises the toast without taking focus', async () => {
    const app = await launch();
    try {
      const { page } = app;
      await page.setViewportSize({ width: 1440, height: 900 });

      const toast = page.locator('.bible-content-toast');
      await expect(toast).toHaveCount(1, { timeout: 60_000 });
      // The version the seeded manifest offers, in the reader's own sentence.
      await expect(toast).toContainText(OFFERED_REVISION);

      // Non-blocking, structurally: a live region that announces without
      // moving focus. A toast that stole focus would interrupt the reader
      // mid-verse, which is the one thing §3.6 forbids of this surface.
      await expect(toast).toHaveAttribute('role', 'status');
      const focusedInToast = await page.evaluate(() => {
        const active = document.activeElement;
        const region = document.querySelector('.bible-content-toast');
        return active !== null && region !== null && region.contains(active);
      });
      expect(focusedInToast).toBe(false);

      // And it is ignorable: dismissing it leaves the reader where they were.
      await toast.getByRole('button', { name: 'Dismiss' }).click();
      await expect(toast).toHaveCount(0);
    } finally {
      await shutdown(app);
    }
  });

  test('§3.6: the settings entry names the offer and offers the control', async () => {
    const app = await launch();
    try {
      const { page } = app;
      await page.setViewportSize({ width: 1440, height: 900 });
      await gotoSettings(page, 'content');

      // The same decision as the toast, on the surface that can act on it —
      // both rendered from one `contentView`, which is what makes them
      // identical here and on web.
      const section = page.locator('.bible-settings__notice').filter({ hasText: 'Topic content' });
      await expect(section).toHaveCount(1, { timeout: 60_000 });
      await expect(section).toContainText(OFFERED_REVISION);
      await expect(section.getByRole('button', { name: 'Update now' })).toBeVisible();
    } finally {
      await shutdown(app);
    }
  });

  test("§3.6: the toast's Review link opens the settings entry", async () => {
    const app = await launch();
    try {
      const { page } = app;
      await page.setViewportSize({ width: 1440, height: 900 });

      const toast = page.locator('.bible-content-toast');
      await expect(toast).toHaveCount(1, { timeout: 60_000 });
      await toast.getByRole('link', { name: 'Review' }).click();

      // The toast reports; the settings entry installs. The link is what joins
      // them, and a reader who follows it must land on the control rather than
      // on the settings index.
      await expect(
        page.locator('.bible-settings__notice').filter({ hasText: 'Topic content' }),
      ).toHaveCount(1, { timeout: 60_000 });
    } finally {
      await shutdown(app);
    }
  });
});
