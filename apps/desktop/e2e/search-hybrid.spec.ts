/* oxlint-disable effect/noAsyncFunction, effect/noGlobals, effect/noNodeBuiltinImport, effect/noNullish, effect/noTryCatch -- Playwright's API is promise-based and its locators are typed against the DOM's own nullable shapes; this file is a browser driver, not Effect code. */
/* oxlint-disable no-await-in-loop -- the hit walk asserts a per-row property in order, and a concurrent read would race the list it is walking. */

/** §10 Milestone 8's UI parity, at the half only a running app can state.
 *
 * > **UI parity:** one search surface, shared query/scope/book URL state,
 * > identical pinned-topics presentation on web and desktop.
 *
 *  `packages/app/src/reading/search-state.test.ts` proves the *plan* — which
 *  groups exist, what each row says about why it is present, what the surface
 *  tells a reader whose vector leg did not run. What it cannot see is whether
 *  the compiled component draws that plan: a component that read the accessor
 *  per branch, or that fused the pinned group into the ranking, would leave
 *  every unit assertion green. That is what runs here.
 *
 *  **This spec pins the lexical-only degradation path.** It was written when no
 *  vector index release existed; since `vectors-v1` was pinned in
 *  `VECTORS_ARTIFACT_RELEASE` (2026-08-24), a machine that has installed the
 *  index (or holds `~/.bible/vectors.bvi`) runs the vector leg instead, and the
 *  absence assertions below no longer describe it. On such a machine the
 *  degradation path still needs pinning — run with the index moved aside. The
 *  spec asserts: results still arrive, the notice explains why the meaning leg
 *  did not run, and each row still says which leg found it.
 *
 *  Not in `turbo run gate`: this needs a built Electron app and the installed
 *  `~/.bible` corpora. Run it with `bun run --cwd apps/desktop test:e2e`.
 */

import {
  _electron as electron,
  expect,
  test,
  type ElectronApplication,
  type Page,
} from '@playwright/test';
import { BlocksJson, ParagraphBlock, TextInline } from '@bible/core/wiki';
import { Schema } from 'effect';
import { constants, existsSync } from 'node:fs';
import { copyFile, mkdtemp, rm } from 'node:fs/promises';
import { homedir, tmpdir } from 'node:os';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';

/** A query §9.3 routes to the hybrid path: three words or more, no quotes, not
 *  a refcode. A one-word query would be answered lexically by the router's own
 *  decision and never reach the vector leg, which would make the absence notice
 *  below vacuous.
 *
 *  **Every term has to appear in the same paragraph.** §9.3 builds the lexical
 *  leg by joining the query's terms with FTS5's implicit AND, so a long
 *  natural-language question is not a query the corpus can answer: this spec
 *  previously asked `what happens at the close of probation`, whose seven terms
 *  match **0** rows of the shipped archive — every assertion below about hits,
 *  provenance and the pinned group was therefore asserting against an empty
 *  result. Four terms that do co-occur (817 paragraphs) keep the route hybrid
 *  and give the ranking something real to hold. */
const HYBRID_QUERY = 'the close of probation';

/** The topic §9.4 must pin for `HYBRID_QUERY`, and its slug in the DOM.
 *
 *  The same pair `golden-fixture.ts` uses, spelled here rather than imported:
 *  Playwright's runner resolves `@bible/core/search/testing` through a Bun
 *  condition this process does not have. */
const GOLDEN_TOPIC_SLUG = 'close-of-probation';
/** Titled so that `HYBRID_QUERY` is a **substring** of it.
 *
 *  §9.4's pinned group comes from `WikiService.list({ query })`, which matches
 *  with `title LIKE %query%` over the whole query string rather than per term —
 *  so `The Close of Probation` is pinned for `the close of probation`, and
 *  `Close of Probation` would not be. */
const GOLDEN_TOPIC_TITLE = 'The Close of Probation';

/** A topics artifact holding the golden topic, at `userData/topics.db`.
 *
 *  Why this is seeded rather than taken from the machine: the installed
 *  `~/.bible/topics.db` is currently an *empty* artifact, so §9.4's pinned group
 *  never rendered and the assertion that it precedes the ranking was skipped on
 *  every run (round-2 F14). `WikiService.list({ query })` searches authored
 *  titles, so a topic titled "Close of Probation" is pinned for `HYBRID_QUERY`.
 *
 *  `node:sqlite` rather than `bun:sqlite`, and the DDL a compiled artifact
 *  carries — the same choice `wiki-phrase.spec.ts` documents in full. */
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
  const blocks = Schema.encodeSync(BlocksJson);
  database
    .prepare('INSERT INTO topics (slug, title, thesis_ast, body_ast, position) VALUES (?,?,?,?,?)')
    .run(
      GOLDEN_TOPIC_SLUG,
      GOLDEN_TOPIC_TITLE,
      blocks([
        ParagraphBlock.make({
          content: [TextInline.make({ text: 'When probation closes, every case is decided.' })],
        }),
      ]),
      blocks([]),
      0,
    );
  database
    .prepare('INSERT INTO topic_aliases (alias, display, slug, canonical) VALUES (?,?,?,?)')
    .run('close of probation', 'close of probation', GOLDEN_TOPIC_SLUG, 1);
  database.close();
};

interface LaunchedApp {
  readonly application: ElectronApplication;
  readonly page: Page;
  readonly userDataPath: string;
}

/** The EGW corpus, cloned into the isolated `userData` — the same reflink clone
 *  the lookup and phrase specs use. §9's lexical leg is FTS over this archive,
 *  so without it there is nothing to rank and every assertion below would be
 *  about an empty list. */
const cloneWritingsCorpus = async (userDataPath: string): Promise<boolean> => {
  const installed = path.join(homedir(), '.bible', 'egw-paragraphs.db');
  if (!existsSync(installed)) return false;
  await copyFile(
    installed,
    path.join(userDataPath, 'egw-paragraphs.db'),
    constants.COPYFILE_FICLONE,
  );
  return true;
};

const launch = async (): Promise<LaunchedApp & { readonly hasCorpus: boolean }> => {
  const userDataPath = await mkdtemp(path.join(tmpdir(), 'bible-desktop-search-'));
  const hasCorpus = await cloneWritingsCorpus(userDataPath);
  // Before the app opens it, so §9.4's pinned group has something to pin.
  seedTopics(userDataPath);
  const application = await electron.launch({
    args: ['dist/main/main.cjs'],
    cwd: path.resolve(import.meta.dirname, '..'),
    env: {
      // eslint-disable-next-line node/no-process-env -- preserve the Playwright worker environment
      ...process.env,
      BIBLE_LEGACY_CLI_STATE_PATH: path.join(userDataPath, 'missing-legacy-cli-state.db'),
      BIBLE_USER_DATA_PATH: userDataPath,
      NODE_ENV: 'test',
    },
  });
  const page = await application.firstWindow();
  await expect(page.getByRole('heading', { level: 1 })).toContainText('Genesis', {
    timeout: 90_000,
  });
  return { application, page, userDataPath, hasCorpus };
};

const shutdown = async (app: LaunchedApp): Promise<void> => {
  await app.application.close();
  await rm(app.userDataPath, { force: true, recursive: true });
};

/** Navigates to the writings search for a query.
 *
 *  Through the hash, because this host serves the renderer from `file://` and a
 *  plain path navigation leaves the app — the same reason `lookup-panel.spec.ts`
 *  builds its writings URL this way.
 *
 *  The URL is the whole point of the §10 bullet: `q` and `scope` are the shared
 *  state, so this link is the identical link on web. */
const gotoSearch = async (page: Page, query: string, extra = ''): Promise<void> => {
  const base = page.url().split('#')[0] ?? '';
  await page.goto(`${base}#/search?q=${encodeURIComponent(query)}&scope=writings${extra}`);
};

test.describe('the compiled hybrid search surface', () => {
  test('§9: a URL carrying query and scope opens the writings search', async () => {
    const app = await launch();
    try {
      const { page } = app;
      await page.setViewportSize({ width: 1440, height: 900 });
      await gotoSearch(page, HYBRID_QUERY);
      // The shared URL state is what mounts this surface rather than the Bible
      // one, which is the "one search surface" half of §10's bullet.
      await expect(page.locator('.bible-search--writings')).toHaveCount(1, { timeout: 60_000 });
    } finally {
      await shutdown(app);
    }
  });

  test('§9.6: with no vector index the surface says so and still answers', async () => {
    const app = await launch();
    try {
      const { page } = app;
      if (!app.hasCorpus) test.skip(true, 'no writings corpus installed');
      await page.setViewportSize({ width: 1440, height: 900 });
      await gotoSearch(page, HYBRID_QUERY);
      await expect(page.locator('.bible-search--writings')).toHaveCount(1, { timeout: 60_000 });

      // The typed absence, rendered. A surface that silently degraded would
      // draw the same results with no notice, and the reader would never learn
      // that half the search did not run or that it is installable.
      const notice = page.locator('.bible-search__notice[data-vector="unavailable"]');
      await expect(notice).toHaveCount(1, { timeout: 60_000 });
      await expect(notice).toContainText('text only');

      // And it still answered: degraded, not broken.
      await expect(page.locator('.bible-search__hit').first()).toBeVisible({ timeout: 60_000 });
    } finally {
      await shutdown(app);
    }
  });

  test('§9.4: every hit says which leg found it', async () => {
    const app = await launch();
    try {
      const { page } = app;
      if (!app.hasCorpus) test.skip(true, 'no writings corpus installed');
      await page.setViewportSize({ width: 1440, height: 900 });
      await gotoSearch(page, HYBRID_QUERY);
      await expect(page.locator('.bible-search__hit').first()).toBeVisible({ timeout: 60_000 });

      // The property, per row, rather than a hardcoded expectation about which
      // paragraphs this machine's corpus holds.
      const rows = await page.locator('.bible-search__hit').evaluateAll((nodes) =>
        nodes.map((node) => ({
          provenance: node.getAttribute('data-provenance'),
          hasRefcode: (node.querySelector('a')?.textContent ?? '').length > 0,
        })),
      );
      expect(rows.length).toBeGreaterThan(0);
      for (const row of rows) {
        expect(['both', 'lexical', 'vector']).toContain(row.provenance);
        expect(row.hasRefcode).toBe(true);
      }
      // With no index installed, every row came from the text leg — which is
      // the same fact the notice above states, asserted where the reader sees
      // it rather than only where the service reported it.
      expect(rows.every((row) => row.provenance === 'lexical')).toBe(true);
    } finally {
      await shutdown(app);
    }
  });

  test('§9.4: the pinned topics group is never inside the paragraph ranking', async () => {
    const app = await launch();
    try {
      const { page } = app;
      if (!app.hasCorpus) test.skip(true, 'no writings corpus installed');
      await page.setViewportSize({ width: 1440, height: 900 });
      await gotoSearch(page, HYBRID_QUERY);
      await expect(page.locator('.bible-search__hit').first()).toBeVisible({ timeout: 60_000 });

      // The structural claim, in the DOM: whatever the topics group holds, it
      // is a sibling section above the ranking rather than rows within it. This
      // is the "identical pinned-topics presentation" §10 asks both hosts for,
      // and the assertion a fused ordering would fail.
      const topicsInsideRanking = await page
        .locator('.bible-search__list [data-group="topics"]')
        .count();
      expect(topicsInsideRanking).toBe(0);

      // Required, not conditional (round-2 F14). This launch seeds a topics
      // artifact holding the golden topic, whose title the query matches — so
      // "the group is absent" is no longer an outcome this test may pass on.
      // Before the seed, the installed `topics.db` was empty, the group never
      // rendered, and the whole assertion below was skipped on every run.
      await expect(page.locator('[data-group="topics"]')).toHaveCount(1, { timeout: 60_000 });
      await expect(page.locator(`[data-topic="${GOLDEN_TOPIC_SLUG}"]`)).toBeVisible();

      // The group precedes the ranking in document order.
      const order = await page
        .locator('[data-group="topics"], [data-group="paragraphs"]')
        .evaluateAll((nodes) => nodes.map((node) => node.getAttribute('data-group')));
      expect(order[0]).toBe('topics');
    } finally {
      await shutdown(app);
    }
  });

  test('§10: one form crosses between the two corpora (B3)', async () => {
    const app = await launch();
    try {
      const { page } = app;
      if (!app.hasCorpus) test.skip(true, 'no writings corpus installed');
      await page.setViewportSize({ width: 1440, height: 900 });

      // Start on the Bible side, which is where `/search` lands by default.
      const base = page.url().split('#')[0] ?? '';
      await page.goto(`${base}#/search?q=${encodeURIComponent(HYBRID_QUERY)}`);
      await expect(page.locator('.bible-search__form')).toHaveCount(1, { timeout: 60_000 });
      // One form, drawn above whichever corpus is showing — not one per branch.
      await expect(page.locator('.bible-search--writings')).toHaveCount(0);
      await expect(page.locator('[data-scope="bible"]')).toHaveAttribute('aria-current', 'page');

      // The control that did not exist before B3: a reader on the Bible side had
      // no way to reach §9's hybrid search except by editing the URL.
      await page.locator('[data-scope="writings"]').click();
      await expect(page.locator('.bible-search--writings')).toHaveCount(1, { timeout: 60_000 });
      expect(page.url()).toContain('scope=writings');
      // The query survived the crossing — the one thing both corpora mean the
      // same way. `URLSearchParams` encoding, not `encodeURIComponent`: the
      // codec builds the query string with `URLSearchParams`, which spells a
      // space `+` rather than `%20`.
      expect(page.url()).toContain(new URLSearchParams({ q: HYBRID_QUERY }).toString());
      await expect(page.locator('[data-scope="writings"]')).toHaveAttribute('aria-current', 'page');

      // And §9.4's pinned group is what the writings side then shows.
      await expect(page.locator('[data-group="topics"]')).toHaveCount(1, { timeout: 60_000 });
      await expect(page.locator(`[data-topic="${GOLDEN_TOPIC_SLUG}"]`)).toBeVisible();

      // Still one form, and crossing back returns to the Bible side.
      await expect(page.locator('.bible-search__form')).toHaveCount(1);
      await page.locator('[data-scope="bible"]').click();
      await expect(page.locator('.bible-search--writings')).toHaveCount(0, { timeout: 60_000 });
    } finally {
      await shutdown(app);
    }
  });

  test('§10: the book narrowing rides the URL', async () => {
    const app = await launch();
    try {
      const { page } = app;
      if (!app.hasCorpus) test.skip(true, 'no writings corpus installed');
      await page.setViewportSize({ width: 1440, height: 900 });
      // The third piece of §10's shared state. A link that pins a book is the
      // same link on web, and it must survive the round trip through the codec.
      await gotoSearch(page, HYBRID_QUERY, '&book=GC&corpus=egw');
      await expect(page.locator('.bible-search--writings')).toHaveCount(1, { timeout: 60_000 });
      expect(page.url()).toContain('book=GC');
    } finally {
      await shutdown(app);
    }
  });
});
