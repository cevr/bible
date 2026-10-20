// Upstream: packages/react/src/dialog/root/DialogRoot.test.tsx,
// packages/react/src/dialog/popup/DialogPopup.test.tsx,
// packages/react/src/dialog/backdrop/DialogBackdrop.test.tsx,
// packages/react/src/dialog/close/DialogClose.test.tsx
//
// The dialog's behaviour cases: closing (Close, Escape, outside presses per
// modal mode, an owner that keeps it open), focus (trap, the first tabbable
// element, the return to the button that opened it), scroll lock, the ARIA wiring and
// dialogs open side by side. Every dialog opens from its owner's `open`, as
// every page's does; upstream's trigger cases, detached triggers, handles and
// payloads, nested dialogs, alert dialogs, shadow roots, and React-only machinery (Suspense, act
// timing, owner stacks) are left out.
import { describe, expect, it } from 'bun:test';

import { expect as see, type Page } from '@playwright/test';

import { focused, harness, logOf, recordTransitions, scriptClick } from './harness.ts';

const h = harness('dialog.tsx');

/** Whether the page's scroll is locked (the scroller's `overflow` is hidden). */
const scrollLocked = (page: Page) =>
  page.evaluate(() => {
    const html = getComputedStyle(document.documentElement).overflowY;
    const body = getComputedStyle(document.body).overflowY;
    return html === 'hidden' || body === 'hidden';
  });

describe('Dialog.Root', () => {
  it("opens from its owner's open with the dialog ARIA wiring", async () => {
    const page = await h.open('dialog');
    await see(page.locator('#popup')).toHaveCount(0);
    await page.click('#open');
    const popup = page.locator('#popup');
    await see(popup).toBeVisible();
    await see(popup).toHaveAttribute('role', 'dialog');
    await see(popup).toHaveAttribute('aria-labelledby', 'title');
    await see(popup).toHaveAttribute('aria-describedby', 'description');
    await see(popup).toHaveAttribute('data-open', '');
    expect(await logOf(page)).not.toContainEqual(expect.stringMatching(/^open /));
  });

  it("keeps a newer title's id when an older title unmounts", async () => {
    const page = await h.open('dialog', { query: { titles: 'two' } });
    await page.click('#open');
    const popup = page.locator('#popup');
    await see(popup).toHaveAttribute('aria-labelledby', 'title-2');
    await page.evaluate(() => (window as unknown as { __dropTitle: () => void }).__dropTitle());
    await see(page.locator('#title')).toHaveCount(0);
    await see(popup).toHaveAttribute('aria-labelledby', 'title-2');
  });

  it('closes from Dialog.Close with reason close-press', async () => {
    const page = await h.open('dialog');
    await page.click('#open');
    await page.click('#close');
    await see(page.locator('#popup')).toHaveCount(0);
    expect(await logOf(page)).toContain('open false close-press');
  });

  it('closes on Escape with reason escape-key', async () => {
    const page = await h.open('dialog');
    await page.click('#open');
    await see.poll(() => focused(page)).toBe('first');
    await page.keyboard.press('Escape');
    await see(page.locator('#popup')).toHaveCount(0);
    expect(await logOf(page)).toContain('open false escape-key');
  });

  it('stays open, focus inside, while the owner keeps open through a close request', async () => {
    const page = await h.open('dialog', { query: { owner: 'keep' } });
    await page.click('#open');
    await see.poll(() => focused(page)).toBe('first');
    await page.keyboard.press('Escape');
    expect(await logOf(page)).toContain('open false escape-key');
    await see(page.locator('#popup')).toBeVisible();
    expect(await focused(page)).toBe('first');
  });

  it('calls onOpenChangeComplete after opening and after closing', async () => {
    const page = await h.open('dialog');
    await page.click('#open');
    await see.poll(() => logOf(page)).toContain('complete true');
    await page.click('#close');
    await see.poll(() => logOf(page)).toContain('complete false');
  });

  it('runs the enter transition from its starting style when a script opens it', async () => {
    const page = await h.open('animated');
    await recordTransitions(page);
    await scriptClick(page, '#open');
    await see.poll(() => logOf(page), { timeout: 1000 }).toContain('transition popup opacity');
  });

  it('waits for the exit transition before unmounting', async () => {
    const page = await h.open('animated');
    await page.click('#open');
    await see.poll(() => logOf(page)).toContain('complete true');
    await page.click('#close');
    const popup = page.locator('#popup');
    await see(popup).toHaveAttribute('data-ending-style', '');
    await see(popup).toHaveAttribute('data-closed', '');
    await see(popup).toHaveCount(0);
    expect(await logOf(page)).toContain('complete false');
  });
});

describe('outside press', () => {
  it('a modal dialog renders an internal backdrop and closes on a press on it', async () => {
    const page = await h.open('dialog');
    await page.click('#open');
    await see(page.locator('#portal > [role="presentation"][data-base-ui-inert]')).toHaveCount(1);
    await page.mouse.click(700, 500);
    await see(page.locator('#popup')).toHaveCount(0);
    expect(await logOf(page)).toContain('open false outside-press');
  });

  it('a non-modal dialog renders no internal backdrop and closes on a press outside', async () => {
    const page = await h.open('dialog', { query: { modal: 'false' } });
    await page.click('#open');
    await see(page.locator('#popup')).toBeVisible();
    await see(page.locator('#portal > [role="presentation"]')).toHaveCount(0);
    await page.mouse.click(700, 500);
    await see(page.locator('#popup')).toHaveCount(0);
    expect(await logOf(page)).toContain('open false outside-press');
  });

  it('a non-modal dialog closes when focus moves to an element outside', async () => {
    const page = await h.open('dialog', { query: { modal: 'false' } });
    await page.click('#open');
    await see.poll(() => focused(page)).toBe('first');
    // The mousedown focuses the button before the click lands, so focus-out closes it.
    await page.click('#outside');
    await see(page.locator('#popup')).toHaveCount(0);
    expect(await logOf(page)).toContain('open false focus-out');
    expect(await focused(page)).toBe('outside');
  });

  it('with a user backdrop closes on the click, not on the mousedown', async () => {
    const page = await h.open('dialog', { query: { backdrop: 'user', modal: 'false' } });
    await page.click('#open');
    await see(page.locator('#backdrop')).toHaveAttribute('role', 'presentation');
    await page.mouse.move(700, 500);
    await page.mouse.down();
    await see(page.locator('#popup')).toBeVisible();
    await page.mouse.up();
    await see(page.locator('#popup')).toHaveCount(0);
  });

  it('does not close on a right-button press', async () => {
    const page = await h.open('dialog', { query: { modal: 'false' } });
    await page.click('#open');
    await see(page.locator('#popup')).toBeVisible();
    await page.mouse.click(700, 500, { button: 'right' });
    await see(page.locator('#popup')).toBeVisible();
  });
});

describe('Dialog.Portal inline', () => {
  it("keeps its node in place as a non-modal dialog's focus guards appear around it", async () => {
    const page = await h.open('dialog', { query: { modal: 'false', portal: 'inline' } });
    // Every removal of the portal's node: a move resets the scroll positions inside it.
    await page.evaluate(() => {
      const removed: Array<string> = [];
      (window as unknown as { __removed: typeof removed }).__removed = removed;
      new MutationObserver((records) => {
        for (const record of records) {
          for (const node of record.removedNodes) {
            if (node instanceof HTMLElement && node.id === 'portal') {
              removed.push(node.id);
            }
          }
        }
      }).observe(document.getElementById('root') as HTMLElement, {
        childList: true,
        subtree: true,
      });
    });
    await page.click('#open');
    await see.poll(() => focused(page)).toBe('first');
    // The guards are in: Tab from the trigger's place reaches the dialog.
    await see(page.locator('#root [data-type="outside"]:not([hidden])')).toHaveCount(2);
    expect(
      await page.evaluate(() => (window as unknown as { __removed: Array<string> }).__removed),
    ).toEqual([]);
    // The order they keep: back out of the dialog is the trigger, and on again is the dialog.
    await page.keyboard.press('Shift+Tab');
    await see.poll(() => focused(page)).toBe('open');
    await page.keyboard.press('Tab');
    await see.poll(() => focused(page)).toBe('first');
  });
});

describe('modal', () => {
  it('hides the page from assistive tech while a modal dialog is open', async () => {
    const page = await h.open('dialog');
    await page.click('#open');
    await see(page.locator('#root')).toHaveAttribute('aria-hidden', 'true');
    await page.keyboard.press('Escape');
    await see(page.locator('#root')).not.toHaveAttribute('aria-hidden', 'true');
  });

  it('leaves the page to assistive tech while a non-modal dialog is open', async () => {
    const page = await h.open('dialog', { query: { modal: 'false' } });
    await page.click('#open');
    await see(page.locator('#popup')).toBeVisible();
    await see(page.locator('#root')).not.toHaveAttribute('aria-hidden', 'true');
  });

  it('locks page scroll while a modal dialog is open, and unlocks on close', async () => {
    const page = await h.open('dialog', { query: { tall: 'true' } });
    expect(await scrollLocked(page)).toBe(false);
    await page.click('#open');
    await see.poll(() => scrollLocked(page)).toBe(true);
    await page.keyboard.press('Escape');
    await see(page.locator('#popup')).toHaveCount(0);
    await see.poll(() => scrollLocked(page)).toBe(false);
  });

  it('does not lock page scroll when non-modal', async () => {
    const page = await h.open('dialog', { query: { tall: 'true', modal: 'false' } });
    await page.click('#open');
    await see.poll(() => focused(page)).toBe('first');
    expect(await scrollLocked(page)).toBe(false);
  });

  it('traps Tab inside the popup of a modal dialog', async () => {
    const page = await h.open('dialog');
    await page.click('#open');
    await see.poll(() => focused(page)).toBe('first');
    await page.keyboard.press('Tab');
    await see.poll(() => focused(page)).toBe('input');
    await page.keyboard.press('Tab');
    await see.poll(() => focused(page)).toBe('close');
    await page.keyboard.press('Tab');
    await see.poll(() => focused(page)).toBe('first');
    await page.keyboard.press('Shift+Tab');
    await see.poll(() => focused(page)).toBe('close');
  });
});

describe('Dialog.Popup focus', () => {
  it('focuses the first tabbable element on open and returns focus to the button that opened it', async () => {
    const page = await h.open('dialog');
    await page.click('#open');
    await see.poll(() => focused(page)).toBe('first');
    await page.keyboard.press('Escape');
    await see.poll(() => focused(page)).toBe('open');
  });

  it('returns focus to the button that opened it after a close from inside', async () => {
    const page = await h.open('dialog');
    await page.focus('#open');
    await page.keyboard.press('Enter');
    await see.poll(() => focused(page)).toBe('first');
    await page.click('#close');
    await see(page.locator('#popup')).toHaveCount(0);
    await see.poll(() => focused(page)).toBe('open');
  });
});

describe("Dialog.Popup return focus after the owner's own close", () => {
  /** Whether the element with the focus shows the ring. */
  const ringed = (page: Page) =>
    page.evaluate(() => document.activeElement?.matches(':focus-visible') ?? false);

  /**
   * From now on, keep the `focusVisible` each focus of the opener asks for: the ring is
   * the kit's to state, never the browser's heuristic to guess (which guesses right most
   * of the time, and wrong under load).
   */
  const askedRings = (page: Page) =>
    page.evaluate(() => {
      const opener = document.getElementById('open');
      const asked: Array<boolean | null> = [];
      (window as unknown as { __asked: typeof asked }).__asked = asked;
      if (opener === null) return;
      const focus = opener.focus.bind(opener);
      opener.focus = (options?: FocusOptions & { focusVisible?: boolean }) => {
        asked.push(options?.focusVisible ?? null);
        focus(options);
      };
    });
  const asked = (page: Page) =>
    page.evaluate(() => (window as unknown as { __asked: Array<boolean | null> }).__asked);

  it('shows the ring on the opener when a key closed it', async () => {
    const page = await h.open('dialog', { query: { closes: 'owner' } });
    await page.click('#open');
    await see.poll(() => focused(page)).toBe('first');
    await askedRings(page);
    await page.focus('#owner-close');
    await page.keyboard.press('Enter');
    await see(page.locator('#popup')).toHaveCount(0);
    await see.poll(() => focused(page)).toBe('open');
    expect(await asked(page)).toEqual([true]);
    expect(await ringed(page)).toBe(true);
  });

  it('shows no ring on the opener when a pointer closed it, the focus left inside ringed', async () => {
    const page = await h.open('dialog', { query: { closes: 'owner' } });
    await page.focus('#open');
    await page.keyboard.press('Enter');
    await see.poll(() => focused(page)).toBe('first');
    expect(await ringed(page)).toBe(true);
    await askedRings(page);
    // A press on a row that takes no focus leaves the ringed button focused, as ⌘K's query is.
    await page.click('#owner-close-row');
    await see(page.locator('#popup')).toHaveCount(0);
    await see.poll(() => focused(page)).toBe('open');
    expect(await asked(page)).toEqual([false]);
    expect(await ringed(page)).toBe(false);
  });

  /** Open the dialog from the `opener` input with the focus on it, then close it by a pointer. */
  const closedByPointerFrom = async (opener: 'range' | 'text') => {
    const page = await h.open('dialog', { query: { closes: 'owner', opener } });
    await page.focus('#open');
    await page.evaluate(() => (window as unknown as { __open: () => void }).__open());
    await see.poll(() => focused(page)).toBe('first');
    await askedRings(page);
    await page.click('#owner-close-row');
    await see(page.locator('#popup')).toHaveCount(0);
    await see.poll(() => focused(page)).toBe('open');
    return asked(page);
  };

  it('shows no ring on a range opener when a pointer closed it: a range is pressed, not typed in', async () => {
    expect(await closedByPointerFrom('range')).toEqual([false]);
  });

  it('shows the ring on a text field opener when a pointer closed it, as a click on one does', async () => {
    expect(await closedByPointerFrom('text')).toEqual([true]);
  });
});

describe('dialogs side by side', () => {
  it('side-by-side modal dialogs close one at a time, newest first', async () => {
    const page = await h.open('side-by-side');
    await page.click('#open');
    await page.click('#open-2');
    await page.click('#open-3');
    await see(page.locator('#level-3')).toBeVisible();
    await page.mouse.click(790, 590);
    await see(page.locator('#level-3')).toHaveCount(0);
    await see(page.locator('#level-2')).toBeVisible();
    await page.mouse.click(790, 590);
    await see(page.locator('#level-2')).toHaveCount(0);
    await see(page.locator('#level-1')).toBeVisible();
    await page.mouse.click(790, 590);
    await see(page.locator('#level-1')).toHaveCount(0);
  });
});
