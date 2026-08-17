/* oxlint-disable effect/noAsyncFunction, effect/noGlobals, effect/noNodeBuiltinImport, effect/noTryCatch -- Playwright's API is promise-based and its own runner owns the lifecycle, so an Effect runtime has nothing to attach to; `smoke.spec.ts` beside this file carries the same four exemptions in `.oxlintrc.json`. */
/* oxlint-disable no-await-in-loop -- the two loops here assert an ordering: each Tab press is only meaningful after the previous one moved focus, and each tab click after the previous tab settled. Running them together would assert nothing. */
/* oxlint-disable effect/noNullish, effect/noRuntimeTypeof, effect/noUnknownParameters -- the recorder below runs *inside the page*, where it inspects a raw `postMessage` frame before anything has parsed it. That is the I/O boundary these rules point at, and the browser's own API hands it over as `unknown` with `undefined` as the absent case; Effect is not in scope there. */

/** The §8 study pane, asserted against the **compiled component** in a real
 *  browser engine.
 *
 *  Three claims that only a mounted pane can settle, and that the model tests in
 *  `packages/app/src/reading/study-pane-state.test.ts` structurally cannot:
 *
 *  1. **One transport crossing per verse (§8.2).** `tests/study-round-trip.test.ts`
 *     counts crossings for a hand-written client call, so it proves the
 *     *procedure* is one round trip. It says nothing about the pane: a second
 *     `useVerseStudy` added to the JSX, or a per-section read inside a `Tabs`
 *     item, would leave that test green and double the traffic. This counts what
 *     the real `VerseStudyPane` posts when a reader taps a verse.
 *
 *  2. **The narrow presentation is a real modal.** The pane used to declare
 *     `role="dialog"` and `aria-modal="true"` on a plain `<aside>` with no focus
 *     trap, no focus restore and no body scroll lock — three promises the
 *     attributes make and the markup did not keep. Composing `ui/dialog.tsx` is
 *     the fix, and the only honest check of it is Tab actually staying inside
 *     the sheet in an engine that implements focus.
 *
 *  3. **Closing leaves no duplicate history entry.** The model test asserts the
 *     entry *sequence*; this asserts the browser's own `history.length`, which
 *     is the number the reader's Back button is counting.
 *
 *  **Why desktop rather than web.** Both hosts render this one component, and
 *  the desktop app opens the corpora already on disk while the web app installs
 *  them into OPFS over the API server first. The desktop suite is therefore the
 *  one that reaches the pane, and the parity the component gives means what is
 *  proved here is proved for both. The count is transport-shaped rather than
 *  host-shaped: it patches `MessagePort.prototype.postMessage`, which is the
 *  wire on both.
 *
 *  Not in `turbo run gate`: this needs a built Electron app and the installed
 *  `~/.bible` corpora, like the smoke spec beside it. Run it with
 *  `bun run --cwd apps/desktop test:e2e`.
 */

import {
  _electron as electron,
  expect,
  test,
  type ElectronApplication,
  type Page,
} from '@playwright/test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

interface RecordedRequest {
  readonly tag: string;
}

declare global {
  interface Window {
    __studyRequests?: RecordedRequest[];
  }
}

interface LaunchedApp {
  readonly application: ElectronApplication;
  readonly page: Page;
  readonly userDataPath: string;
}

const launch = async (): Promise<LaunchedApp> => {
  const userDataPath = await mkdtemp(path.join(tmpdir(), 'bible-desktop-study-'));
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

/** Wraps `MessagePort.prototype.postMessage` so every RPC `Request` frame is
 *  recorded with its procedure tag.
 *
 *  A prototype patch rather than a hook in application code: the point of this
 *  test is that nothing in the pane had to be written differently to be
 *  observable, so a seam the pane knew about would be a seam a refactor could
 *  route around. The wrapper forwards unchanged.
 *
 *  Two envelopes are recognised because the two hosts use two: desktop posts the
 *  bare encoded message, and the web worker protocol wraps it as
 *  `[clientId, message]`. Both are counted so this file reads the same wire on
 *  either host. */
const recordProcedureTraffic = (page: Page): Promise<void> =>
  page.evaluate(() => {
    if (window.__studyRequests) return;
    const recorded: RecordedRequest[] = [];
    window.__studyRequests = recorded;
    const original = MessagePort.prototype.postMessage;
    const frameTag = (value: unknown): string | undefined => {
      if (!(value instanceof Object)) return undefined;
      const frame: { _tag?: unknown; tag?: unknown } = value;
      if (frame._tag !== 'Request') return undefined;
      if (typeof frame.tag !== 'string') return undefined;
      return frame.tag;
    };
    const requestTag = (message: unknown): string | undefined => {
      if (Array.isArray(message)) return frameTag(message[1]);
      return frameTag(message);
    };
    MessagePort.prototype.postMessage = function patched(
      this: MessagePort,
      ...args: Parameters<MessagePort['postMessage']>
    ): void {
      const tag = requestTag(args[0]);
      if (tag !== undefined) recorded.push({ tag });
      original.apply(this, args);
    };
  });

const requestCount = (page: Page, tag: string): Promise<number> =>
  page.evaluate(
    (procedure) => (window.__studyRequests ?? []).filter((entry) => entry.tag === procedure).length,
    tag,
  );

const clearRequests = (page: Page): Promise<void> =>
  page.evaluate(() => {
    const recorded = window.__studyRequests;
    if (recorded) recorded.length = 0;
  });

/** Desktop routes live after the `#`, so a route change is a hash change. */
const goToRoute = async (page: Page, route: string): Promise<void> => {
  const base = page.url().split('#')[0] ?? '';
  await page.goto(`${base}#${route}`);
};

/** The verse tap §8.5 describes: a pointer down on the verse paragraph, outside
 *  any element that claims its own gesture.
 *
 *  Not the verse-number anchor, deliberately. That anchor's `href` is a path
 *  (`/bible/1/1/1`) and the desktop shell is a `hashHistory()` app served from
 *  `file://`, so activating it leaves the app — a defect that predates this
 *  milestone and belongs to the shell rather than the pane. The paragraph's
 *  handler goes through the router, which is the path a reader on either host
 *  actually takes and the one this file is about. */
const tapVerse = async (page: Page, verse: number): Promise<void> => {
  // Well right of the verse-number anchor, so the tap lands on the paragraph's
  // own text rather than on the element that claims its own gesture.
  await page
    .locator(`#verse-${String(verse)} p`)
    .first()
    .click({ position: { x: 200, y: 8 } });
};

test.describe('the compiled study pane', () => {
  test('a verse tap costs exactly one v1.study.verse.get crossing, tabs included', async () => {
    const app = await launch();
    try {
      const { page } = app;
      await recordProcedureTraffic(page);
      // Everything the chapter itself asked for is already behind us; the count
      // under test is what opening the pane adds.
      await clearRequests(page);

      await tapVerse(page, 1);

      // The pane is on screen and populated — a count of one over a pane that
      // never rendered would be vacuous.
      await expect(page.getByRole('tab', { name: /^Cross-references/ })).toBeVisible({
        timeout: 60_000,
      });
      await expect(page.getByRole('heading', { name: 'Genesis 1:1', exact: true })).toBeVisible();

      // The claim. A second mount-time read in the JSX makes this two.
      expect(await requestCount(page, 'v1.study.verse.get')).toBe(1);

      // §8.2's reason for one composed bundle: the pane always wants all five
      // sections, so a tab is a reveal and not a fetch.
      for (const label of [/^Margin notes/, /^Commentary/, /^Writings/]) {
        await page.getByRole('tab', { name: label }).click();
        await expect(page.getByRole('tab', { name: label })).toHaveAttribute(
          'aria-selected',
          'true',
        );
      }
      expect(await requestCount(page, 'v1.study.verse.get')).toBe(1);
    } finally {
      await shutdown(app);
    }
  });

  test('the wide rail is not a dialog and does not lock the page', async () => {
    const app = await launch();
    try {
      const { page } = app;
      await page.setViewportSize({ width: 1440, height: 900 });
      await goToRoute(page, '/bible/1/1');
      await tapVerse(page, 1);
      await expect(page.getByRole('heading', { name: 'Genesis 1:1', exact: true })).toBeVisible({
        timeout: 60_000,
      });

      // A rail sits beside Scripture the reader can still see. Announcing it as
      // a modal would tell a screen reader the reading view was unreachable, and
      // trapping focus would make it so.
      await expect(page.getByRole('dialog', { name: /Study tools/ })).toHaveCount(0);
      expect(await page.evaluate(() => document.body.style.overflow)).not.toBe('hidden');
    } finally {
      await shutdown(app);
    }
  });

  test('the narrow pane is a real modal: focus enters, is trapped, and the page is locked', async () => {
    const app = await launch();
    try {
      const { page } = app;
      // Narrow is where the pane covers what the reader was reading, which is
      // what makes the three modal behaviours load-bearing rather than polish.
      await page.setViewportSize({ width: 390, height: 844 });
      await goToRoute(page, '/bible/1/1');
      await expect(page.getByRole('listitem').first()).toContainText('In the beginning');

      await tapVerse(page, 1);
      const sheet = page.getByRole('dialog', { name: 'Study tools for Genesis 1:1' });
      await expect(sheet).toBeVisible({ timeout: 60_000 });

      // (a) Focus moved *into* the sheet. Leaving it behind strands a keyboard
      // user on Scripture the sheet is now covering — the original defect.
      await expect
        .poll(() => sheet.evaluate((panel) => panel.contains(document.activeElement)))
        .toBe(true);

      // (b) Body scroll is locked, so the chapter underneath does not move.
      expect(await page.evaluate(() => document.body.style.overflow)).toBe('hidden');

      // (c) Tab is trapped. Twenty presses is far more than the sheet's own
      // focusables, so an untrapped surface would have walked out into the
      // chapter well before the last one.
      for (let press = 0; press < 20; press += 1) {
        await page.keyboard.press('Tab');
        expect(await sheet.evaluate((panel) => panel.contains(document.activeElement))).toBe(true);
      }

      // (d) Escape closes it and the lock is released. Escape at all is the
      // point: on the hand-rolled `<aside>` the key handler lived on the pane
      // root, so it only fired while focus happened to be inside — the dialog
      // installs a capturing document listener guarded by its own stack.
      await page.keyboard.press('Escape');
      await expect(sheet).toBeHidden();
      await expect.poll(() => page.evaluate(() => document.body.style.overflow)).not.toBe('hidden');
    } finally {
      await shutdown(app);
    }
  });

  test('closing a tap-opened pane leaves no dead Back press', async () => {
    const app = await launch();
    try {
      const { page } = app;
      await page.setViewportSize({ width: 1440, height: 900 });

      // Two chapters, so there is somewhere for Back to *go*. On a stack whose
      // only entry is the chapter, "Back leaves the chapter" is unfalsifiable.
      await goToRoute(page, '/bible/1/2');
      await expect(page.getByRole('heading', { level: 1 })).toContainText('Genesis 2');
      await goToRoute(page, '/bible/1/1');
      await expect(page.getByRole('listitem').first()).toContainText('In the beginning');

      await tapVerse(page, 1);
      await expect(page).toHaveURL(/#\/bible\/1\/1\/1$/);

      await page.getByRole('button', { name: 'Close study tools for Genesis 1:1' }).click();
      await expect(page).toHaveURL(/#\/bible\/1\/1$/);

      // Blocker 3, as the reader meets it. The retired close *replaced* the
      // verse entry with a second copy of the chapter, so the stack read
      // `[…, Genesis 2, Genesis 1, Genesis 1]` and the first Back press went
      // from the chapter to the chapter — it appeared to do nothing. One press
      // must leave.
      //
      // `history.length` is deliberately not the assertion: going back keeps
      // the popped entry reachable by Forward, so the number is the same either
      // way and would pass over the bug.
      await page.goBack();
      await expect(page).toHaveURL(/#\/bible\/1\/2$/);
    } finally {
      await shutdown(app);
    }
  });
});
