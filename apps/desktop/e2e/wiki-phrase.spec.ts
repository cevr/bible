/* oxlint-disable effect/noAsyncFunction, effect/noGlobals, effect/noNodeBuiltinImport, effect/noTryCatch -- Playwright's API is promise-based and its own runner owns the lifecycle, so an Effect runtime has nothing to attach to; `smoke.spec.ts` and `study-pane.spec.ts` beside this file carry the same exemptions in `.oxlintrc.json`. */
/* oxlint-disable no-await-in-loop -- the section walk asserts an ordering: each `<details>` must be opened, and the open must have settled, before its items are counted. Six clicks fired together would race the disclosure they are counting inside, which is the same reason `study-pane.spec.ts` beside this file carries the exemption. */

/** §8.5's gesture rule and §5's peek/navigate model, asserted against the
 *  **compiled components** in a real browser engine — **both directions**.
 *
 *  §8.5 says a phrase link and the verse-tap study pane must coexist: a tap on a
 *  hot phrase opens the peek and *not* the pane, and a tap on the surrounding
 *  verse opens the pane and *not* a peek. Two claims that only a mounted page can
 *  settle. `packages/app/src/reading/gesture.test.ts` proves `claimedGesture`
 *  walks a hand-built tree correctly, and `peek-state.test.ts` proves the tap
 *  transition — but neither can show that the button the renderer actually emits
 *  carries the attribute, or that the reader's real click lands where the walk
 *  expects. A phrase span that forgot `data-claims-gesture` would leave both unit
 *  suites green and open the study pane under every peek.
 *
 *  **The fixture artifact, and why there has to be one.** The installed
 *  `~/.bible/topics.db` is currently an *empty* artifact — `bun run build:topics`
 *  reports `0 approved, 40 draft skipped`, and a direct read confirms zero topics
 *  and zero aliases. A dictionary with no aliases matches nothing, so a phrase
 *  test against the installed corpus would assert over a page with no phrase
 *  spans on it and pass whatever the renderer did. This file therefore seeds its
 *  own single-entry artifact into the temp `userData` directory the launch
 *  already isolates, through the same `topic_aliases` DDL a compiled artifact
 *  carries and the same path `main.ts` reads (`userData/topics.db`) — so the
 *  dictionary under test arrives the way a shipped one would, not through a stub.
 *  When an approved artifact ships, the seed becomes redundant rather than wrong.
 *
 *  The alias is `the beginning`, chosen because it occurs in Genesis 1:1 — the
 *  chapter the app already opens on, so the assertion needs no navigation and the
 *  phrase is the first thing on screen.
 *
 *  Not in `turbo run gate`: this needs a built Electron app and the installed
 *  `~/.bible` corpora, like the two specs beside it. Run it with
 *  `bun run --cwd apps/desktop test:e2e`.
 */

import { BlocksJson, ParagraphBlock, TextInline } from '@bible/core/wiki';
import {
  _electron as electron,
  expect,
  test,
  type ElectronApplication,
  type Page,
} from '@playwright/test';
import { Schema } from 'effect';
import { constants, existsSync } from 'node:fs';
import { copyFile, mkdtemp, rm } from 'node:fs/promises';
import { homedir, tmpdir } from 'node:os';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';

/** The artifact stores each AST column as the JSON string `BlocksJson` encodes
 *  to, so the fixture is built through that codec rather than hand-written.
 *
 *  Not a stylistic preference. The first draft of this file wrote the JSON by
 *  hand, guessed `{_tag:'Paragraph', children:[…]}`, and produced an artifact
 *  whose thesis silently failed to decode — the peek rendered "This topic could
 *  not be opened" and four tests failed pointing at the wrong thing. Encoding
 *  through the schema makes that class of mistake a type error at authoring
 *  time, and keeps the fixture correct by construction when the wire model
 *  changes. */
const encodeBlocks = Schema.encodeSync(BlocksJson);

/** The topic the seeded artifact carries, and the alias that makes it hot. */
const TOPIC = {
  slug: 'beginning',
  title: 'The Beginning',
  alias: 'the beginning',
  thesis: 'Where the Scripture record opens.',
} satisfies Record<string, string>;

/** A second seeded topic, and the one this file asserts a **populated** page
 *  for (§10 Milestone 6's "identity for identity").
 *
 *  `sanctuary`, and keyed to the catalog id the installed `bible.db` really
 *  carries (`naves-topical-bible.sanctuary`, twelve references across five
 *  Nave's sections). That key is what makes every section fill against the
 *  corpora the packaged app has in `userData`: section 1 from the catalog,
 *  sections 3 and 5 from the verses section 1 resolved, sections 2 and 4 from
 *  the EGW and pioneer FTS over the canonical phrase, section 6 from the
 *  authored edge below. Nothing here stubs a source — the assertions are over
 *  what the shipped composer produces from the shipped corpora.
 *
 *  The identities are therefore **not** pinned to the strings the unit and CLI
 *  suites share: those come from `@bible/core/wiki/testing`'s fixture corpora,
 *  and this app reads the operator's real ones. What is asserted here is the
 *  claim only a rendered page can settle — that each section draws its items at
 *  all, and draws them where the model says. */
const POPULATED = {
  slug: 'sanctuary',
  title: 'The Sanctuary',
  alias: 'sanctuary',
  thesis: 'The framework of the plan of redemption.',
  catalogId: 'naves-topical-bible.sanctuary',
  related: { slug: 'day-of-atonement', title: 'Day of Atonement' },
} satisfies {
  readonly slug: string;
  readonly title: string;
  readonly alias: string;
  readonly thesis: string;
  readonly catalogId: string;
  readonly related: { readonly slug: string; readonly title: string };
};

/** A two-topic artifact at `userData/topics.db`, written through the DDL a
 *  compiled artifact carries.
 *
 *  `node:sqlite` rather than `bun:sqlite`: Playwright's runner is Node, so a
 *  `bun:` import fails to resolve before any test runs. */
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
  const thesis = (text: string): string =>
    encodeBlocks([ParagraphBlock.make({ content: [TextInline.make({ text })] })]);
  const topic = database.prepare(
    'INSERT INTO topics (slug, title, thesis_ast, body_ast, position) VALUES (?,?,?,?,?)',
  );
  topic.run(TOPIC.slug, TOPIC.title, thesis(TOPIC.thesis), encodeBlocks([]), 0);
  topic.run(POPULATED.slug, POPULATED.title, thesis(POPULATED.thesis), encodeBlocks([]), 1);
  // The neighbour section 6 lists. A real row rather than a dangling edge: the
  // composer resolves a related topic's *title* from the artifact.
  topic.run(POPULATED.related.slug, POPULATED.related.title, encodeBlocks([]), encodeBlocks([]), 2);
  const alias = database.prepare(
    'INSERT INTO topic_aliases (alias, display, slug, canonical) VALUES (?,?,?,?)',
  );
  alias.run(TOPIC.alias, TOPIC.alias, TOPIC.slug, 1);
  alias.run(POPULATED.alias, POPULATED.alias, POPULATED.slug, 1);
  database
    .prepare('INSERT INTO topic_edges (from_slug, to_slug, kind, position) VALUES (?,?,?,?)')
    .run(POPULATED.slug, POPULATED.related.slug, 'authored', 0);
  // The one row that turns four of the six sections on: it points the composer
  // at the Nave's topic the installed `bible.db` already holds.
  database
    .prepare('INSERT INTO topic_catalog_keys (slug, catalog_id, matched_by) VALUES (?,?,?)')
    .run(POPULATED.slug, POPULATED.catalogId, 'override');
  database.close();
};

interface LaunchedApp {
  readonly application: ElectronApplication;
  readonly page: Page;
  readonly userDataPath: string;
  /** Whether this run has an EGW archive at all. The two FTS-backed sections
   *  cannot compose without one, and that is a fact about the machine rather
   *  than about the renderer. */
  readonly writings: boolean;
}

/** The EGW corpus, cloned into the isolated `userData` the launch creates.
 *
 *  `main.ts` reads `userData/egw-paragraphs.db` whenever `BIBLE_USER_DATA_PATH`
 *  is set, and this launch sets it to a fresh temp directory — so without this
 *  the writings database is simply absent, and §6.1's sections 2 and 4 compose
 *  empty for want of a **corpus** rather than for want of a renderer. The supply
 *  pipeline copies `bible.db` in on its own; it does not fetch the EGW archive.
 *
 *  A private copy, not a symlink: the app opens this database read-write — it is
 *  where `writingsPublication.download` installs books — so a link would point
 *  the run at the operator's own archive and let a test write to it.
 *
 *  `COPYFILE_FICLONE` makes that affordable. The archive is several gigabytes,
 *  and a byte copy per launch would dominate the suite; on APFS (and on
 *  reflink-capable Linux filesystems) the clone is a metadata operation that
 *  completes in milliseconds and diverges copy-on-write, so the operator's file
 *  is untouched however the app writes. The flag degrades to a real copy where
 *  the filesystem cannot clone, which is correct if slow.
 *
 *  Returns whether it landed. An operator with no archive installed gets a
 *  populated-page test that asserts the four sections their corpora can honestly
 *  produce and says why the other two are out of scope, rather than a failure
 *  about their machine. */
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

const launch = async (): Promise<LaunchedApp> => {
  const userDataPath = await mkdtemp(path.join(tmpdir(), 'bible-desktop-wiki-'));
  // Before launch: the supply pipeline leaves an artifact already at the
  // destination in place, so the seed is what the runtime opens.
  seedArtifact(userDataPath);
  const writings = await cloneWritingsCorpus(userDataPath);
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
  return { application, page, userDataPath, writings };
};

const shutdown = async (app: LaunchedApp): Promise<void> => {
  await app.application.close();
  await rm(app.userDataPath, { force: true, recursive: true });
};

/** The one hot phrase in Genesis 1:1. */
const phrase = (page: Page) => page.locator('button.bible-phrase').first();

/** The verse tap §8.5 describes: a pointer down on the verse paragraph, clear of
 *  any element that claims its own gesture — including, now, the phrase button.
 *  `x: 200` lands right of both the verse-number anchor and the phrase span,
 *  which sit at the start of the line. */
const tapVerse = async (page: Page): Promise<void> => {
  await page
    .locator('#verse-1 p')
    .first()
    .click({ position: { x: 200, y: 8 } });
};

const studyPane = (page: Page) => page.getByRole('heading', { name: 'Genesis 1:1', exact: true });

test.describe('the compiled phrase link', () => {
  test('the renderer emits a hot phrase that claims its own gesture', async () => {
    const app = await launch();
    try {
      const { page } = app;
      // The premise every other test here rests on: the seeded alias really did
      // reach the renderer as a phrase span. Asserting it separately means a
      // later failure reads as "the gesture rule broke", not "the fixture died".
      await expect(phrase(page)).toHaveText(TOPIC.alias);
      await expect(phrase(page)).toHaveAttribute('data-topic', `/wiki/${TOPIC.slug}`);
      // §8.5's mechanism, on the element the renderer actually produced.
      await expect(phrase(page)).toHaveAttribute('data-claims-gesture', '');
      await expect(phrase(page)).toHaveAttribute('aria-expanded', 'false');

      // §4.5: one slot per phrase per section, and the section is the chapter.
      // Genesis 1 says "the beginning" once more in verse 1's neighbourhood only
      // if a later verse repeats it — what must hold either way is that no verse
      // shows the same phrase twice.
      expect(await page.locator('#verse-1 button.bible-phrase').count()).toBe(1);
    } finally {
      await shutdown(app);
    }
  });

  test('§8.5 direction one: a tap on the phrase peeks, and does not open the study pane', async () => {
    const app = await launch();
    try {
      const { page } = app;
      await page.setViewportSize({ width: 1440, height: 900 });

      await phrase(page).click();

      // The peek is up, carrying exactly what §5 allows it: the topic title and
      // its thesis.
      const peek = page.getByRole('complementary', { name: `About ${TOPIC.alias}` });
      await expect(peek).toBeVisible({ timeout: 60_000 });
      await expect(peek.getByRole('heading', { name: TOPIC.title })).toBeVisible();
      await expect(peek).toContainText(TOPIC.thesis);
      await expect(phrase(page)).toHaveAttribute('aria-expanded', 'true');

      // The other half of the direction, and the one a missing
      // `data-claims-gesture` would break: the verse tap handler did *not* also
      // fire, so the study pane stayed shut and the route never moved to a verse.
      await expect(studyPane(page)).toHaveCount(0);
      await expect(page).toHaveURL(/#\/bible\/1\/1$/);
    } finally {
      await shutdown(app);
    }
  });

  test('§8.5 direction two: a tap on the verse opens the study pane, and does not peek', async () => {
    const app = await launch();
    try {
      const { page } = app;
      await page.setViewportSize({ width: 1440, height: 900 });

      await tapVerse(page);

      await expect(studyPane(page)).toBeVisible({ timeout: 60_000 });
      // The phrase is on the same paragraph the tap landed on. If the walk were
      // reversed — a verse tap treated as a phrase tap — this would be a peek.
      await expect(page.locator('.bible-peek')).toHaveCount(0);
      await expect(phrase(page)).toHaveAttribute('aria-expanded', 'false');
    } finally {
      await shutdown(app);
    }
  });

  test('§5: a second tap on the same phrase navigates to the topic page', async () => {
    const app = await launch();
    try {
      const { page } = app;
      await page.setViewportSize({ width: 1440, height: 900 });

      await phrase(page).click();
      await expect(page.getByRole('complementary', { name: `About ${TOPIC.alias}` })).toBeVisible({
        timeout: 60_000,
      });

      // Second tap on the *same* occurrence: peek, then go.
      await phrase(page).click();

      await expect(page).toHaveURL(new RegExp(`#/wiki/${TOPIC.slug}$`));
      await expect(page.getByRole('heading', { name: TOPIC.title, level: 1 })).toBeVisible();
      // Arriving closes the card rather than leaving it over the page it opened.
      await expect(page.locator('.bible-peek')).toHaveCount(0);
    } finally {
      await shutdown(app);
    }
  });

  test('§5: a tap away from the phrase dismisses the peek', async () => {
    const app = await launch();
    try {
      const { page } = app;
      await page.setViewportSize({ width: 1440, height: 900 });

      await phrase(page).click();
      const peek = page.getByRole('complementary', { name: `About ${TOPIC.alias}` });
      await expect(peek).toBeVisible({ timeout: 60_000 });

      // First: a tap *inside* the card must not dismiss it. This is the case the
      // handler's original scope got right only positionally — the card sat
      // outside the verse list the listener was on — and which broke the moment
      // the listener was widened to cover the heading below.
      await peek.getByText(TOPIC.thesis).click();
      await expect(peek).toBeVisible();

      // Then: somewhere on the reading surface that is neither the phrase nor
      // the card — the chapter heading. Under the old narrow scope this tap did
      // nothing at all and the card stayed open.
      await page.getByRole('heading', { level: 1 }).click();

      await expect(peek).toHaveCount(0);
      await expect(phrase(page)).toHaveAttribute('aria-expanded', 'false');
    } finally {
      await shutdown(app);
    }
  });

  test('§6.1: every section of a populated topic page draws its items', async () => {
    const app = await launch();
    try {
      const { page } = app;
      await page.setViewportSize({ width: 1440, height: 900 });

      // Straight to the populated page. The route is the same one a phrase tap
      // reaches; going there directly keeps this test about what the page
      // *renders*, which the two gesture tests above do not cover.
      await page.goto(`${page.url().split('#')[0] ?? ''}#/wiki/${POPULATED.slug}`);
      await expect(page.getByRole('heading', { name: POPULATED.title, level: 1 })).toBeVisible({
        timeout: 90_000,
      });

      // The six sections, in the model's own order. The page walks the lineup
      // tuple, so this is the order the wire declared and not one the markup
      // chose.
      const sections = page.locator('details.bible-wiki-section');
      await expect(sections).toHaveCount(6);
      expect(
        await sections.evaluateAll((nodes) =>
          nodes.map((node) => node.getAttribute('data-section')),
        ),
      ).toEqual([
        'key-verses',
        'egw-statements',
        'commentary',
        'pioneer-witnesses',
        'cross-references',
        'related-topics',
      ]);

      // Every one of them draws items. This is the claim the unit and CLI
      // suites make about a fixture and this one makes about the shipped
      // composer over the operator's own corpora: `bible.db` really holds
      // `naves-topical-bible.sanctuary`, its verses really carry commentary and
      // cross-references, and both writings scopes really match the phrase. A
      // section whose JSX branch went missing renders an empty list and fails
      // here.
      //
      // Four sections need only `bible.db` and the seeded artifact, which every
      // run of this file has. Sections 2 and 4 are FTS over the EGW archive, so
      // they are asserted only when `cloneWritingsCorpus` found one — an
      // operator without the archive has no corpus for them to compose from, and
      // asserting them anyway would report their machine as a renderer defect.
      const sectionsToCheck = ['key-verses', 'commentary', 'cross-references', 'related-topics'];
      if (app.writings) sectionsToCheck.push('egw-statements', 'pioneer-witnesses');
      // The sections arrive collapsed except key verses (§5), and `<details>`
      // hides its content — so each is opened before its items are counted.
      for (const kind of sectionsToCheck) {
        const section = page.locator(`details.bible-wiki-section[data-section="${kind}"]`);
        await section.locator('summary').click();
        await expect(section.locator('> ul > li')).not.toHaveCount(0, { timeout: 30_000 });
      }

      // And the identities are the ones the model decides, not markup the page
      // invented. Section 1's first item is a verse link into the reader;
      // section 6's is the neighbour the authored edge names, by its *title*
      // (which only the artifact's `topics` row carries) and carrying the route
      // a tap would follow.
      const keyVerses = page.locator('details[data-section="key-verses"] > ul > li');
      await expect(keyVerses.first().locator('a')).toHaveAttribute(
        'href',
        /^\/bible\/\d+\/\d+\/\d+$/,
      );
      const related = page.locator('details[data-section="related-topics"] > ul > li button');
      await expect(related.first()).toHaveText(POPULATED.related.title);
      await expect(related.first()).toHaveAttribute(
        'data-topic',
        `/wiki/${POPULATED.related.slug}`,
      );
    } finally {
      await shutdown(app);
    }
  });

  test('§5: the narrow viewport presents the peek as a bottom sheet', async () => {
    const app = await launch();
    try {
      const { page } = app;
      // Narrow is where a card beside the text has nowhere to sit, so the peek
      // becomes a sheet — the same breakpoint the study pane switches on.
      await page.setViewportSize({ width: 390, height: 844 });
      await expect(page.getByRole('listitem').first()).toContainText('In the beginning');

      await phrase(page).click();

      // A real dialog this time, not an `<aside>`: it covers what the reader was
      // reading, which is what makes the modal semantics load-bearing.
      const sheet = page.getByRole('dialog');
      await expect(sheet).toBeVisible({ timeout: 60_000 });
      await expect(sheet).toContainText(TOPIC.title);
      await expect(sheet).toContainText(TOPIC.thesis);
      await expect(page.locator('.bible-peek--sheet')).toHaveCount(1);
    } finally {
      await shutdown(app);
    }
  });
});
