/* oxlint-disable effect/noAsyncFunction, effect/noGlobals, effect/noNodeBuiltinImport, effect/noNullish, effect/noTryCatch -- `Locator.boundingBox()` is typed `Promise<… | null>` by Playwright itself and an off-screen element is the null case; the drag helpers below read it once and stop there. Otherwise: Playwright's API is promise-based and its own runner owns the lifecycle, so an Effect runtime has nothing to attach to; `smoke.spec.ts`, `study-pane.spec.ts` and `wiki-phrase.spec.ts` beside this file carry the same exemptions. */
/* oxlint-disable no-await-in-loop -- the group walk asserts a per-row property: each `<details>` is read after the one before it, and firing the reads together would race the panel's own resolution. The three specs beside this file carry the same exemption. */

/** §7's select-to-lookup panel, asserted against the **compiled components** in
 *  a real browser engine.
 *
 *  §10's Milestone 7 UI acceptance is "one panel, all groups, empty groups
 *  collapsed, no action menu, identical on web and desktop". Three of those four
 *  are claims about rendered markup that no unit test in `packages/app` can
 *  settle: that package has no DOM, so `lookup-panel-state.test.ts` proves which
 *  rows *should* exist and this file proves the renderer draws them. The fourth
 *  — identical on web and desktop — is structural: both hosts render
 *  `packages/app/src/reading/lookup-panel.tsx`, so there is no second panel to
 *  compare.
 *
 *  **The gesture under test is the selection itself.** §7 gives the panel no
 *  action menu, so there is no button to press between selecting text and seeing
 *  what it could mean. The selection is made through a real DOM `Range` and the
 *  `mouseup` the reader's drag would end with, so what runs is the app's own
 *  `lookupSelection` over the browser's own `Selection`.
 *
 *  **The seeded artifact**, and why: the installed `~/.bible/topics.db` compiles
 *  to zero topics and zero aliases while all 40 sources are drafts, so the topic
 *  group would be empty for want of a dictionary rather than for want of a
 *  renderer. This file seeds a one-alias artifact into the temp `userData` the
 *  launch isolates, exactly as `wiki-phrase.spec.ts` does.
 *
 *  **What is not here.** §7's lone-topic-hit peek card needs a selection that
 *  *only* the dictionary answers — no verse, no paragraph, no catalog row — and
 *  a selection is made out of rendered Scripture, which the Bible FTS answers by
 *  construction. The flag is decided in core (`lookup-service.test.ts`) and
 *  obeyed by one branch (`lookup-panel-state.test.ts`); a browser cannot reach
 *  the case honestly, so it is not faked here.

 *  **The real drag.** Two tests below press, move and release the mouse — over
 *  plain verse text, and from plain verse text into a phrase span — rather than
 *  dispatching a `mouseup`. That is the gesture §8.5's rule is about: the
 *  browser follows the drag's `mouseup` with a `click` on the element the press
 *  and the release share, so a synthetic `mouseup` cannot see the case where
 *  one gesture opens both the lookup panel and a second surface. A third test
 *  dispatches the `mouseup`/`click` pair on the phrase span itself, which is
 *  the one shape of that gesture this engine will not produce — see
 *  `selectAndClickPhrase` for what was probed and why the pair is asserted
 *  anyway.
 *
 *  Not in `turbo run gate`: this needs a built Electron app and the installed
 *  `~/.bible` corpora, like the three specs beside it. Run it with
 *  `bun run --cwd apps/desktop test:e2e`.
 */

import { BlocksJson, ParagraphBlock, TextInline } from '@bible/core/wiki';
import {
  _electron as electron,
  expect,
  test,
  type ElectronApplication,
  type Locator,
  type Page,
} from '@playwright/test';
import { Schema } from 'effect';
import { constants, existsSync } from 'node:fs';
import { copyFile, mkdtemp, rm } from 'node:fs/promises';
import { homedir, tmpdir } from 'node:os';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';

const encodeBlocks = Schema.encodeSync(BlocksJson);

/** The topic the seeded artifact carries. `the beginning` occurs in Genesis 1:1
 *  — the chapter the app opens on — so the selection needs no navigation. */
const TOPIC = {
  slug: 'beginning',
  title: 'The Beginning',
  alias: 'the beginning',
  thesis: 'Where the Scripture record opens.',
} satisfies Record<string, string>;

/** §7's five groups, in §7's order. The panel's rows are asserted against this
 *  list rather than against whatever the markup emitted, because the order is
 *  the contract the CLI and the two visual hosts share. */
const GROUPS: readonly string[] = ['topics', 'strongs', 'verses', 'writings', 'catalog'];

const seedArtifact = (userDataPath: string): void => {
  const database = new DatabaseSync(path.join(userDataPath, 'topics.db'));
  database.exec(`
    CREATE TABLE meta (key TEXT PRIMARY KEY, value TEXT NOT NULL);
    CREATE TABLE topics (slug TEXT PRIMARY KEY, title TEXT NOT NULL, thesis_ast TEXT NOT NULL, body_ast TEXT NOT NULL, position INTEGER NOT NULL);
    CREATE TABLE topic_aliases (alias TEXT PRIMARY KEY, display TEXT NOT NULL, slug TEXT NOT NULL, canonical INTEGER NOT NULL);
    CREATE TABLE topic_edges (from_slug TEXT NOT NULL, to_slug TEXT NOT NULL, kind TEXT NOT NULL, position INTEGER NOT NULL, PRIMARY KEY (from_slug, to_slug, kind));
    CREATE TABLE topic_catalog_keys (slug TEXT PRIMARY KEY, catalog_id TEXT NOT NULL, matched_by TEXT NOT NULL);
    INSERT INTO meta (key, value) VALUES ('schema_major', '1');
  `);
  database
    .prepare('INSERT INTO topics (slug, title, thesis_ast, body_ast, position) VALUES (?,?,?,?,?)')
    .run(
      TOPIC.slug,
      TOPIC.title,
      encodeBlocks([ParagraphBlock.make({ content: [TextInline.make({ text: TOPIC.thesis })] })]),
      encodeBlocks([]),
      0,
    );
  database
    .prepare('INSERT INTO topic_aliases (alias, display, slug, canonical) VALUES (?,?,?,?)')
    .run(TOPIC.alias, TOPIC.alias, TOPIC.slug, 1);
  database.close();
};

interface LaunchedApp {
  readonly application: ElectronApplication;
  readonly page: Page;
  readonly userDataPath: string;
}

/** The EGW corpus, cloned into the isolated `userData` — the same reflink clone
 *  `wiki-phrase.spec.ts` uses, for the same reason: the EGW group is FTS over
 *  this archive, and without it that group is empty for want of a corpus. Its
 *  absence is not a failure here, because every assertion below is about the
 *  panel's *shape*, which holds however many groups answered. */
const cloneWritingsCorpus = async (userDataPath: string): Promise<void> => {
  const installed = path.join(homedir(), '.bible', 'egw-paragraphs.db');
  if (!existsSync(installed)) return;
  await copyFile(
    installed,
    path.join(userDataPath, 'egw-paragraphs.db'),
    constants.COPYFILE_FICLONE,
  );
};

const launch = async (): Promise<LaunchedApp> => {
  const userDataPath = await mkdtemp(path.join(tmpdir(), 'bible-desktop-lookup-'));
  seedArtifact(userDataPath);
  await cloneWritingsCorpus(userDataPath);
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
  await expect(page.getByRole('listitem').first()).toContainText('In the beginning');
  return { application, page, userDataPath };
};

const shutdown = async (app: LaunchedApp): Promise<void> => {
  await app.application.close();
  await rm(app.userDataPath, { force: true, recursive: true });
};

/** The reader's own gesture: a range over the phrase's text, then the `mouseup`
 *  a drag ends with.
 *
 *  A real `Range` on a real `Selection` rather than a synthetic event carrying a
 *  string, so what the app reads is `window.getSelection()` — the exact call
 *  `lookupSelection` is written against, and the one a stubbed event would step
 *  over. */
const selectContents = async (target: Locator): Promise<void> => {
  await target.evaluate((node) => {
    const range = document.createRange();
    range.selectNodeContents(node);
    const selection = window.getSelection();
    /* oxlint-disable-next-line effect/noNullish -- `Document.getSelection()` is
     typed `Selection | null` by the DOM itself, and this closure runs inside
     the page rather than in the app's own code. */
    if (selection === null) return;
    selection.removeAllRanges();
    selection.addRange(range);
    node.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
  });
};

const selectPhrase = (page: Page): Promise<void> =>
  selectContents(page.locator('button.bible-phrase').first());

/** A reader's own mouse drag across plain verse text.
 *
 *  `page.mouse` rather than a dispatched event, and plain text rather than a
 *  phrase button, because both differences are the point: a real press-move-
 *  release produces the browser's own `Selection` *and* the `click` that
 *  follows a drag, and a phrase span claims the click for the peek layer, which
 *  would hide the case where nothing claims it. */
const dragOverVerseText = async (page: Page, verse: number): Promise<void> => {
  const text = page.locator(`#verse-${String(verse)} p`);
  await expect(text).toBeVisible();
  const box = await text.boundingBox();
  expect(box).not.toBeNull();
  if (box === null) return;
  // The middle of the block, and a run that stays well inside the measure: a
  // press past the end of a line selects nothing, and this file is about the
  // gesture rather than about the geometry of one verse.
  const y = box.y + 10;
  await page.mouse.move(box.x + box.width * 0.4, y);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width * 0.75, y, { steps: 12 });
  await page.mouse.up();
  await expect.poll(() => page.evaluate(() => String(window.getSelection()))).not.toBe('');
};

/** A reader's own mouse drag from plain verse text **into a phrase span**.
 *
 *  A real press-move-release, so the browser makes its own `Selection` and
 *  delivers its own `click` afterwards. The release lands inside the phrase
 *  button, which is the reader gesture §8.5's rule has to survive: two layers
 *  are listening over the same pixels, and only one of them may answer. */
const dragIntoPhrase = async (page: Page): Promise<void> => {
  const phrase = page.locator('button.bible-phrase').first();
  await expect(phrase).toBeVisible();
  const text = page.locator('#verse-1 p');
  const phraseBox = await phrase.boundingBox();
  const textBox = await text.boundingBox();
  expect(phraseBox).not.toBeNull();
  expect(textBox).not.toBeNull();
  if (phraseBox === null || textBox === null) return;
  const y = phraseBox.y + phraseBox.height / 2;
  await page.mouse.move(textBox.x + 6, y);
  await page.mouse.down();
  await page.mouse.move(phraseBox.x + phraseBox.width * 0.6, y, { steps: 15 });
  await page.mouse.up();
  await expect.poll(() => page.evaluate(() => String(window.getSelection()))).not.toBe('');
};

/** The two events one gesture delivers when a selection is completed **on the
 *  phrase span itself**: `mouseup`, and then the `click` the browser sends to
 *  the same element.
 *
 *  Dispatched rather than driven with `page.mouse`, and that is the honest
 *  shape of this claim. Chromium refuses to begin a text selection from a press
 *  inside a `<button>` — probed four ways: a drag inside the span, out of it,
 *  back into it, and a shift-click extension all leave `window.getSelection()`
 *  empty or retarget the `click` to the paragraph — so this engine cannot be
 *  made to produce the pair. The pair is nonetheless what *any* engine that does
 *  start such a selection delivers, and the ordering it exposes is real in every
 *  engine: the phrase's own `click` handler runs during bubbling, before the
 *  reading surface's. This test pins which layer wins, so the answer does not
 *  depend on a UA behaviour no specification pins down. */
const selectAndClickPhrase = async (page: Page): Promise<void> => {
  await page
    .locator('button.bible-phrase')
    .first()
    .evaluate((node) => {
      const range = document.createRange();
      range.selectNodeContents(node);
      const selection = window.getSelection();
      /* oxlint-disable-next-line effect/noNullish -- `Document.getSelection()` is
     typed `Selection | null` by the DOM itself, and this closure runs inside
     the page rather than in the app's own code. */
      if (selection === null) return;
      selection.removeAllRanges();
      selection.addRange(range);
      node.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
      node.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
    });
};

const panel = (page: Page): Locator => page.locator('.bible-lookup');

const groups = (page: Page): Locator => page.locator('.bible-lookup details.bible-lookup__group');

test.describe('the compiled lookup panel', () => {
  test('§7: a selection opens one panel carrying all five groups in order', async () => {
    const app = await launch();
    try {
      const { page } = app;
      await page.setViewportSize({ width: 1440, height: 900 });

      await selectPhrase(page);

      // One panel — not one per group, and not one per corpus.
      await expect(panel(page)).toHaveCount(1, { timeout: 60_000 });
      await expect(panel(page)).toContainText(TOPIC.alias);

      // Five rows, in §7's order, whatever any of them found. The order is the
      // wire's field order and the CLI's print order; a panel that reordered
      // them would make a reflex gesture unreliable.
      await expect(groups(page)).toHaveCount(GROUPS.length);
      expect(
        await groups(page).evaluateAll((nodes) =>
          nodes.map((node) => node.getAttribute('data-group')),
        ),
      ).toEqual([...GROUPS]);
    } finally {
      await shutdown(app);
    }
  });

  test('§7: empty groups arrive collapsed and the groups that answered arrive open', async () => {
    const app = await launch();
    try {
      const { page } = app;
      await page.setViewportSize({ width: 1440, height: 900 });

      await selectPhrase(page);
      await expect(panel(page)).toHaveCount(1, { timeout: 60_000 });

      // The property, per row, rather than a hardcoded expectation about which
      // corpora this machine holds: a row is open exactly when it has answers.
      // That is `lookupView`'s rule, read off the rendered `<details>`.
      const rows = await groups(page).evaluateAll((nodes) =>
        nodes.map((node) => ({
          id: node.getAttribute('data-group'),
          open: node.hasAttribute('open'),
          count: Number(node.querySelector('summary small')?.textContent ?? '-1'),
        })),
      );
      expect(rows).toHaveLength(GROUPS.length);
      for (const row of rows) {
        expect(row.count).toBeGreaterThanOrEqual(0);
        expect(row.open).toBe(row.count > 0);
      }

      // And the panel is not vacuous: the seeded alias really reached the topic
      // group, which is the group this run controls the corpus for.
      const topics = page.locator('.bible-lookup details[data-group="topics"]');
      await expect(topics.locator('button').first()).toHaveAttribute(
        'data-topic',
        `/wiki/${TOPIC.slug}`,
      );
    } finally {
      await shutdown(app);
    }
  });

  test('§8.5: a drag over verse text opens the panel and not the study pane', async () => {
    const app = await launch();
    try {
      const { page } = app;
      await page.setViewportSize({ width: 1440, height: 900 });
      const route = page.url();

      // Genesis 1:2 — plain verse text, long enough to drag across, and with no
      // phrase span in the seeded artifact to claim the gesture.
      await dragOverVerseText(page, 2);

      await expect(panel(page)).toHaveCount(1, { timeout: 60_000 });
      // The `click` the browser delivers after the drag belongs to the
      // selection. The verse surface must not answer it as a tap: that would
      // open the study pane over the panel the same gesture just asked for.
      await expect(page.getByRole('heading', { name: 'Genesis 1:2', exact: true })).toHaveCount(0);
      expect(page.url()).toBe(route);
    } finally {
      await shutdown(app);
    }
  });

  test('§8.5: a drag into a phrase opens the panel and not the peek', async () => {
    const app = await launch();
    try {
      const { page } = app;
      await page.setViewportSize({ width: 1440, height: 900 });
      const route = page.url();

      // A real press-move-release whose range ends inside a phrase span: the
      // two link layers are both listening over those pixels, and §8.5's rule
      // is that they never claim the same gesture.
      await dragIntoPhrase(page);

      await expect(panel(page)).toHaveCount(1, { timeout: 60_000 });
      // Exactly one surface. A peek card beside the panel — or the study pane
      // under it — is one gesture answered twice, with the second answer
      // covering the one the reader's drag asked for.
      await expect(page.locator('.bible-peek')).toHaveCount(0);
      expect(page.url()).toBe(route);
    } finally {
      await shutdown(app);
    }
  });

  test('§8.5: the click that completes a selection never reaches the phrase layer', async () => {
    const app = await launch();
    try {
      const { page } = app;
      await page.setViewportSize({ width: 1440, height: 900 });

      // `mouseup` then `click`, on the phrase span itself — the pair one
      // gesture delivers, in the order the DOM delivers it. The phrase's own
      // handler runs first during bubbling, so a guard on the reading surface
      // is too late by construction: the peek would already be up.
      await selectAndClickPhrase(page);

      await expect(panel(page)).toHaveCount(1, { timeout: 60_000 });
      await expect(page.locator('.bible-peek')).toHaveCount(0);
    } finally {
      await shutdown(app);
    }
  });

  test('§8.5: a plain tap on a phrase still peeks after a lookup', async () => {
    const app = await launch();
    try {
      const { page } = app;
      await page.setViewportSize({ width: 1440, height: 900 });

      // The claim is one click wide. A drag that opened the panel must not
      // leave the phrase layer deaf to the reader's next ordinary tap — that
      // would be a mode they have to get out of rather than a rule about one
      // gesture. The drag is over verse 2 and the tap is on verse 1's phrase,
      // so the tap is a press *outside* the selection: pressing on selected
      // text starts a text drag in this engine and produces no click at all.
      await dragOverVerseText(page, 2);
      await expect(panel(page)).toHaveCount(1, { timeout: 60_000 });

      await page.locator('button.bible-phrase').first().click();
      await expect(page.locator('.bible-peek')).toHaveCount(1);
    } finally {
      await shutdown(app);
    }
  });

  test('§7: every group’s count is the number of rows it lists', async () => {
    const app = await launch();
    try {
      const { page } = app;
      await page.setViewportSize({ width: 1440, height: 900 });

      await selectPhrase(page);
      await expect(panel(page)).toHaveCount(1, { timeout: 60_000 });

      // The rendered form of "one plan per result". The summary's number and
      // the list below it come from one `lookupView`; a panel that read the
      // live result per branch could print one result's count over another
      // result's rows.
      const rows = await groups(page).evaluateAll((nodes) =>
        nodes.map((node) => ({
          count: Number(node.querySelector('summary small')?.textContent ?? '-1'),
          listed: node.querySelectorAll('ul.bible-lookup__list > li').length,
        })),
      );
      expect(rows).toHaveLength(GROUPS.length);
      for (const row of rows) expect(row.listed).toBe(row.count);
    } finally {
      await shutdown(app);
    }
  });

  test('§7: any selection is lookup-able, writings prose included', async () => {
    const app = await launch();
    try {
      const { page } = app;
      await page.setViewportSize({ width: 1440, height: 900 });

      // §10's Milestone 7 ships "any selection is lookup-able", and the
      // writings readers render prose the phrase overlay already lights. The
      // corpus is optional on a developer machine, so the surface is reached
      // only when the library really holds a publication.
      const base = page.url().split('#')[0] ?? '';
      await page.goto(`${base}#/writings`);
      await expect(page.getByRole('heading', { name: 'Writings', level: 1 })).toBeVisible({
        timeout: 60_000,
      });
      await page.locator('.bible-library__list li').first().waitFor({ timeout: 60_000 });
      // Only an installed publication is a link, so an empty library is a skip
      // rather than a failure: the corpus is optional on a developer machine.
      const publication = page.locator('.bible-library__list a[href*="/writings/"]').first();
      if ((await publication.count()) === 0) test.skip(true, 'no writings library installed');
      // The route is taken from the link and opened as a hash route, because
      // this host serves the renderer from `file://` and a plain click on a
      // path href leaves the app.
      const route = await publication.getAttribute('href');
      await page.goto(`${base}#${String(route)}`);

      const prose = page.locator('.bible-prose p').first();
      await expect(prose).toBeVisible({ timeout: 60_000 });
      await selectContents(prose);

      await expect(panel(page)).toHaveCount(1, { timeout: 60_000 });
      // No verse holds writings prose, so the Strong's group is the one that
      // must be empty — the adapter's `noContext`, on the surface that needs it.
      await expect(
        page.locator('.bible-lookup details[data-group="strongs"] summary small'),
      ).toHaveText('0');
    } finally {
      await shutdown(app);
    }
  });

  test('§7: the panel offers no action menu', async () => {
    const app = await launch();
    try {
      const { page } = app;
      await page.setViewportSize({ width: 1440, height: 900 });

      await selectPhrase(page);
      await expect(panel(page)).toHaveCount(1, { timeout: 60_000 });

      // No menu inside the panel, and none opened beside it. §7's whole point is
      // that a selection goes straight to the answers; a menu would put a step
      // between the reader and them.
      await expect(page.getByRole('menu')).toHaveCount(0);
      await expect(panel(page).getByRole('menuitem')).toHaveCount(0);
    } finally {
      await shutdown(app);
    }
  });

  test('§7: the panel puts itself away', async () => {
    const app = await launch();
    try {
      const { page } = app;
      await page.setViewportSize({ width: 1440, height: 900 });

      await selectPhrase(page);
      await expect(panel(page)).toHaveCount(1, { timeout: 60_000 });

      await panel(page)
        .getByRole('button', { name: /^Close / })
        .click();
      await expect(panel(page)).toHaveCount(0);
    } finally {
      await shutdown(app);
    }
  });

  test('the narrow viewport presents the panel as the study pane’s sheet', async () => {
    const app = await launch();
    try {
      const { page } = app;
      // The Milestone 5 pane surface, at the breakpoint the study pane and the
      // peek card switch on — one definition of narrow for all three.
      await page.setViewportSize({ width: 390, height: 844 });
      await expect(page.getByRole('listitem').first()).toContainText('In the beginning');

      await selectPhrase(page);

      const sheet = page.getByRole('dialog');
      await expect(sheet).toBeVisible({ timeout: 60_000 });
      await expect(page.locator('.bible-lookup--sheet')).toHaveCount(1);
      await expect(sheet.locator('details.bible-lookup__group')).toHaveCount(GROUPS.length);
    } finally {
      await shutdown(app);
    }
  });
});
