import { _electron as electron, expect, test } from '@playwright/test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

test('boots the shared application through the desktop procedure runtime', async () => {
  const userDataPath = await mkdtemp(path.join(tmpdir(), 'bible-desktop-e2e-'));
  const legacyCliStatePath = path.join(userDataPath, 'missing-legacy-cli-state.db');
  const application = await electron.launch({
    args: ['dist/main/main.cjs'],
    cwd: path.resolve(import.meta.dirname, '..'),
    env: {
      // eslint-disable-next-line node/no-process-env -- preserve the Playwright worker environment
      ...process.env,
      BIBLE_LEGACY_CLI_STATE_PATH: legacyCliStatePath,
      BIBLE_USER_DATA_PATH: userDataPath,
      NODE_ENV: 'test',
    },
  });
  const runtimeOutput: string[] = [];
  application.process().stdout?.on('data', (chunk: Buffer) => runtimeOutput.push(chunk.toString()));
  application.process().stderr?.on('data', (chunk: Buffer) => runtimeOutput.push(chunk.toString()));

  try {
    const page = await application.firstWindow();
    const pageErrors: string[] = [];
    page.on('pageerror', (error) => pageErrors.push(error.message));

    await expect(page.getByRole('heading', { level: 1 })).toContainText('Genesis', {
      timeout: 90_000,
    });
    await expect(page.getByRole('listitem').first()).toContainText('In the beginning');
    await expect(page.getByRole('navigation', { name: 'Primary navigation' })).toBeVisible();

    await page.getByRole('button', { name: 'Open command palette' }).click();
    const commandSearch = page.getByRole('textbox', { name: 'Search commands' });
    await expect(commandSearch).toBeFocused();
    await commandSearch.fill('Topics');
    await commandSearch.press('Enter');
    await expect(page).toHaveURL(/#\/topics$/);

    await page.goto(`${page.url().split('#')[0]}#/bible/1/1/1`);
    await expect(
      page.getByRole('separator', { name: 'Resize Scripture and study tools' }),
    ).toBeVisible();
    // `exact`, because the §8 study pane now renders its own tablist above the
    // annotation tools and its "Margin notes" tab is a substring match for
    // "Notes". A non-exact name resolved to two elements from the moment the
    // pane shipped.
    const notesTab = page.getByRole('tab', { name: 'Notes', exact: true });
    if (!(await notesTab.isVisible())) await page.getByText('Study', { exact: true }).click();
    await notesTab.focus();
    await notesTab.press('ArrowRight');
    // `exact` for the same reason: the study pane's "Cross-references" tab is a
    // substring match for the annotation tools' "References".
    await expect(page.getByRole('tab', { name: 'References', exact: true })).toHaveAttribute(
      'aria-selected',
      'true',
    );

    await page.getByRole('link', { name: 'Next chapter' }).click();
    await expect(page).toHaveURL(/#\/bible\/1\/2$/);
    await expect(page.getByRole('heading', { level: 1 })).toContainText('Genesis 2');

    await page.getByRole('link', { name: 'Search' }).click();
    const search = page.getByRole('textbox', { name: 'Search the Bible' });
    await search.fill('beginning');
    await page.getByRole('button', { name: 'Search' }).click();
    await expect(page.getByRole('link', { name: /Genesis 1:1/ })).toContainText(
      'In the beginning',
      { timeout: 30_000 },
    );

    await page.goto(`${page.url().split('#')[0]}#/`);
    await expect(page).toHaveURL(/#\/bible\/1\/2$/);
    await expect(page.getByRole('heading', { level: 1 })).toContainText('Genesis 2');

    expect(pageErrors).toEqual([]);
    expect(runtimeOutput.join('')).toContain('[main] legacy-cli-source configured=true');
    expect(runtimeOutput.join('')).not.toMatch(/(?:uncaught|unhandled|fatal)/iu);
  } finally {
    await application.close();
    await rm(userDataPath, { recursive: true, force: true });
  }
});
