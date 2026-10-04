// Upstream: packages/react/src/dialog/root/DialogRoot.test.tsx,
// packages/react/src/dialog/popup/DialogPopup.test.tsx,
// packages/react/src/dialog/backdrop/DialogBackdrop.test.tsx,
// packages/react/src/dialog/close/DialogClose.test.tsx,
// packages/react/src/dialog/trigger/DialogTrigger.test.tsx,
// packages/react/src/dialog/viewport/DialogViewport.test.tsx,
// packages/react/src/alert-dialog/root/AlertDialogRoot.test.tsx
//
// The dialog's behaviour cases: opening and closing (trigger, Close, Escape,
// outside presses per modal mode), focus (trap, initial, final), scroll
// lock, the ARIA wiring, nested dialogs and the alert dialog. Upstream's
// cases for detached triggers, handles and payloads, shadow roots, and
// React-only machinery (Suspense, act timing, owner stacks) are left out.
import { afterAll, beforeAll, describe, expect, it } from 'bun:test';

import { expect as see, type Page } from '@playwright/test';

import { type Harness, focused, harness, logOf } from './harness.ts';

let h: Harness;
beforeAll(async () => {
  h = await harness('dialog.tsx');
});
afterAll(async () => {
  await h.close();
});

/** Whether the page's scroll is locked (the scroller's `overflow` is hidden). */
const scrollLocked = (page: Page) =>
  page.evaluate(() => {
    const html = getComputedStyle(document.documentElement).overflowY;
    const body = getComputedStyle(document.body).overflowY;
    return html === 'hidden' || body === 'hidden';
  });

describe('Dialog.Root', () => {
  it('opens from the trigger with the dialog ARIA wiring', async () => {
    const page = await h.open('dialog');
    const trigger = page.locator('#trigger');
    await see(trigger).toHaveAttribute('aria-haspopup', 'dialog');
    await see(trigger).toHaveAttribute('aria-expanded', 'false');
    await see(page.locator('#popup')).toHaveCount(0);
    await trigger.click();
    const popup = page.locator('#popup');
    await see(popup).toBeVisible();
    await see(popup).toHaveAttribute('role', 'dialog');
    await see(popup).toHaveAttribute('aria-labelledby', 'title');
    await see(popup).toHaveAttribute('aria-describedby', 'description');
    await see(popup).toHaveAttribute('data-open', '');
    await see(trigger).toHaveAttribute('aria-expanded', 'true');
    await see(trigger).toHaveAttribute('data-popup-open', '');
    await see(trigger).toHaveAttribute('aria-controls', 'popup');
    expect(await logOf(page)).toContain('open true trigger-press');
  });

  it('closes from Dialog.Close with reason close-press', async () => {
    const page = await h.open('dialog');
    await page.click('#trigger');
    await page.click('#close');
    await see(page.locator('#popup')).toHaveCount(0);
    expect(await logOf(page)).toContain('open false close-press');
  });

  it('closes on Escape with reason escape-key', async () => {
    const page = await h.open('dialog');
    await page.click('#trigger');
    await see.poll(() => focused(page)).toBe('first');
    await page.keyboard.press('Escape');
    await see(page.locator('#popup')).toHaveCount(0);
    expect(await logOf(page)).toContain('open false escape-key');
  });

  it('closes when the actions close', async () => {
    const page = await h.open('dialog', { query: { modal: 'false' } });
    await page.click('#trigger');
    await see(page.locator('#popup')).toBeVisible();
    await page.click('#close-imperative');
    await see(page.locator('#popup')).toHaveCount(0);
    expect(await logOf(page)).toContain('open false imperative-action');
  });

  it('cancel() in onOpenChange keeps an uncontrolled dialog closed', async () => {
    const page = await h.open('dialog', { query: { cancel: 'open' } });
    await page.click('#trigger');
    expect(await logOf(page)).toContain('open true trigger-press');
    await see(page.locator('#popup')).toHaveCount(0);
  });

  it('calls onOpenChangeComplete after opening and after closing', async () => {
    const page = await h.open('dialog');
    await page.click('#trigger');
    await see.poll(() => logOf(page)).toContain('complete true');
    await page.click('#close');
    await see.poll(() => logOf(page)).toContain('complete false');
  });

  it('waits for the exit transition before unmounting', async () => {
    const page = await h.open('animated');
    await page.click('#trigger');
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
    await page.click('#trigger');
    await see(page.locator('#portal > [role="presentation"][data-base-ui-inert]')).toHaveCount(1);
    await page.mouse.click(700, 500);
    await see(page.locator('#popup')).toHaveCount(0);
    expect(await logOf(page)).toContain('open false outside-press');
  });

  it('a non-modal dialog renders no internal backdrop and closes on a press outside', async () => {
    const page = await h.open('dialog', { query: { modal: 'false' } });
    await page.click('#trigger');
    await see(page.locator('#popup')).toBeVisible();
    await see(page.locator('#portal > [role="presentation"]')).toHaveCount(0);
    await page.mouse.click(700, 500);
    await see(page.locator('#popup')).toHaveCount(0);
    expect(await logOf(page)).toContain('open false outside-press');
  });

  it('a non-modal dialog closes when focus moves to an element outside', async () => {
    const page = await h.open('dialog', { query: { modal: 'false' } });
    await page.click('#trigger');
    await see.poll(() => focused(page)).toBe('first');
    // The mousedown focuses the button before the click lands, so focus-out closes it.
    await page.click('#outside');
    await see(page.locator('#popup')).toHaveCount(0);
    expect(await logOf(page)).toContain('open false focus-out');
    expect(await focused(page)).toBe('outside');
  });

  it('a trap-focus dialog closes on a press outside', async () => {
    const page = await h.open('dialog', { query: { modal: 'trap-focus' } });
    await page.click('#trigger');
    await see(page.locator('#popup')).toBeVisible();
    await page.mouse.click(700, 500);
    await see(page.locator('#popup')).toHaveCount(0);
  });

  it('with a user backdrop closes on the click, not on the mousedown', async () => {
    const page = await h.open('dialog', { query: { backdrop: 'user', modal: 'false' } });
    await page.click('#trigger');
    await see(page.locator('#backdrop')).toHaveAttribute('role', 'presentation');
    await page.mouse.move(700, 500);
    await page.mouse.down();
    await see(page.locator('#popup')).toBeVisible();
    await page.mouse.up();
    await see(page.locator('#popup')).toHaveCount(0);
  });

  it('does not close on a right-button press', async () => {
    const page = await h.open('dialog', { query: { modal: 'false' } });
    await page.click('#trigger');
    await see(page.locator('#popup')).toBeVisible();
    await page.mouse.click(700, 500, { button: 'right' });
    await see(page.locator('#popup')).toBeVisible();
  });

  for (const modal of ['true', 'false']) {
    it(`disablePointerDismissal keeps a modal=${modal} dialog open; Escape still closes`, async () => {
      const page = await h.open('dialog', { query: { modal, dismissal: 'disabled' } });
      await page.click('#trigger');
      await see(page.locator('#popup')).toBeVisible();
      await page.mouse.click(700, 500);
      await see(page.locator('#popup')).toBeVisible();
      await page.keyboard.press('Escape');
      await see(page.locator('#popup')).toHaveCount(0);
    });
  }
});

describe('modal', () => {
  it('hides the page from assistive tech while a modal dialog is open', async () => {
    const page = await h.open('dialog');
    await page.click('#trigger');
    await see(page.locator('#root')).toHaveAttribute('aria-hidden', 'true');
    await page.keyboard.press('Escape');
    await see(page.locator('#root')).not.toHaveAttribute('aria-hidden', 'true');
  });

  it('leaves the page to assistive tech while a non-modal dialog is open', async () => {
    const page = await h.open('dialog', { query: { modal: 'false' } });
    await page.click('#trigger');
    await see(page.locator('#popup')).toBeVisible();
    await see(page.locator('#root')).not.toHaveAttribute('aria-hidden', 'true');
  });

  it('locks page scroll while a modal dialog is open, and unlocks on close', async () => {
    const page = await h.open('dialog', { query: { tall: 'true' } });
    expect(await scrollLocked(page)).toBe(false);
    await page.click('#trigger');
    await see.poll(() => scrollLocked(page)).toBe(true);
    await page.keyboard.press('Escape');
    await see(page.locator('#popup')).toHaveCount(0);
    await see.poll(() => scrollLocked(page)).toBe(false);
  });

  for (const modal of ['false', 'trap-focus']) {
    it(`does not lock page scroll when modal=${modal}`, async () => {
      const page = await h.open('dialog', { query: { tall: 'true', modal } });
      await page.click('#trigger');
      await see.poll(() => focused(page)).toBe('first');
      expect(await scrollLocked(page)).toBe(false);
    });
  }

  for (const modal of ['true', 'trap-focus']) {
    it(`traps Tab inside the popup when modal=${modal}`, async () => {
      const page = await h.open('dialog', { query: { modal } });
      await page.click('#trigger');
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
  }
});

describe('Dialog.Popup focus', () => {
  it('focuses the first tabbable element on open and returns focus to the trigger', async () => {
    const page = await h.open('dialog');
    await page.click('#trigger');
    await see.poll(() => focused(page)).toBe('first');
    await page.keyboard.press('Escape');
    await see.poll(() => focused(page)).toBe('trigger');
  });

  it('focuses the initialFocus ref', async () => {
    const page = await h.open('dialog', { query: { initial: 'input' } });
    await page.click('#trigger');
    await see.poll(() => focused(page)).toBe('input');
  });

  it('does not move focus when initialFocus is false', async () => {
    const page = await h.open('dialog', { query: { initial: 'false' } });
    await page.click('#trigger');
    await see(page.locator('#popup')).toBeVisible();
    await see.poll(() => focused(page)).toBe('trigger');
  });

  it('passes how it was opened to an initialFocus function', async () => {
    const page = await h.open('dialog', { query: { initial: 'function' } });
    await page.click('#trigger');
    await see.poll(() => focused(page)).toBe('input');
    expect(await logOf(page)).toContain('initialFocus mouse');
    await page.keyboard.press('Escape');
    await see.poll(() => focused(page)).toBe('trigger');
    await page.keyboard.press('Enter');
    await see.poll(() => logOf(page)).toContain('initialFocus keyboard');
  });

  it('focuses the finalFocus ref on close', async () => {
    const page = await h.open('dialog', { query: { final: 'outside' } });
    await page.click('#trigger');
    await see.poll(() => focused(page)).toBe('first');
    await page.keyboard.press('Escape');
    await see.poll(() => focused(page)).toBe('outside');
  });

  it('does not move focus on close when finalFocus is false', async () => {
    const page = await h.open('dialog', { query: { final: 'false' } });
    await page.click('#trigger');
    await see.poll(() => focused(page)).toBe('first');
    await page.keyboard.press('Escape');
    await see(page.locator('#popup')).toHaveCount(0);
    expect(await focused(page)).not.toBe('trigger');
  });

  it('focuses the popup itself when opened by touch', async () => {
    const page = await h.open('dialog', { touch: true });
    await page.tap('#trigger');
    await see.poll(() => focused(page)).toBe('popup');
  });
});

describe('Dialog.Portal keepMounted', () => {
  it('keeps the viewport and popup mounted, hidden, while closed', async () => {
    const page = await h.open('keep-mounted');
    await see(page.locator('#popup')).toBeHidden();
    await see(page.locator('#viewport')).toHaveAttribute('hidden', '');
    await page.click('#trigger');
    await see(page.locator('#popup')).toBeVisible();
    await see(page.locator('#viewport')).toHaveAttribute('role', 'presentation');
    await see(page.locator('#viewport')).toHaveAttribute('data-open', '');
    await page.click('#close');
    await see(page.locator('#popup')).toHaveAttribute('hidden', '');
    await see(page.locator('#viewport')).toHaveAttribute('data-closed', '');
  });
});

describe('nested dialogs', () => {
  it('marks the nested popup and counts open nested dialogs', async () => {
    const page = await h.open('nested');
    await page.click('#trigger');
    const parent = page.locator('#parent-popup');
    await see(parent).toBeVisible();
    await see(parent).not.toHaveAttribute('data-nested', '');
    await see(parent).toHaveCSS('--nested-dialogs', '0');
    await page.click('#child-trigger');
    const child = page.locator('#child-popup');
    await see(child).toBeVisible();
    await see(child).toHaveAttribute('data-nested', '');
    await see(parent).toHaveAttribute('data-nested-dialog-open', '');
    await see(parent).toHaveCSS('--nested-dialogs', '1');
    await page.click('#grandchild-trigger');
    await see(page.locator('#grandchild-popup')).toBeVisible();
    await see(parent).toHaveCSS('--nested-dialogs', '2');
    await see(child).toHaveCSS('--nested-dialogs', '1');
    await page.click('#grandchild-close');
    await see(parent).toHaveCSS('--nested-dialogs', '1');
    await page.click('#child-close');
    await see(child).toHaveCount(0);
    await see(parent).not.toHaveAttribute('data-nested-dialog-open', '');
    await see(parent).toHaveCSS('--nested-dialogs', '0');
  });

  it('renders only the outermost backdrop', async () => {
    const page = await h.open('nested');
    await page.click('#trigger');
    await page.click('#child-trigger');
    await see(page.locator('#child-popup')).toBeVisible();
    await see(page.locator('#parent-backdrop')).toHaveCount(1);
    await see(page.locator('#child-backdrop')).toHaveCount(0);
  });

  it('Escape closes only the topmost dialog', async () => {
    const page = await h.open('nested');
    await page.click('#trigger');
    await page.click('#child-trigger');
    await see.poll(() => focused(page)).toBe('grandchild-trigger');
    await page.keyboard.press('Escape');
    await see(page.locator('#child-popup')).toHaveCount(0);
    await see(page.locator('#parent-popup')).toBeVisible();
    expect(await logOf(page)).toEqual([
      'parent true trigger-press',
      'child true trigger-press',
      'child false escape-key',
    ]);
    await see.poll(() => focused(page)).toBe('child-trigger');
  });

  it('an outside press closes only the topmost dialog', async () => {
    const page = await h.open('nested');
    await page.click('#trigger');
    await page.click('#child-trigger');
    await see(page.locator('#child-popup')).toBeVisible();
    await page.mouse.click(790, 590);
    await see(page.locator('#child-popup')).toHaveCount(0);
    await see(page.locator('#parent-popup')).toBeVisible();
    await page.mouse.click(790, 590);
    await see(page.locator('#parent-popup')).toHaveCount(0);
  });

  it('a press inside the nested dialog leaves the parent open', async () => {
    const page = await h.open('nested');
    await page.click('#trigger');
    await page.click('#child-trigger');
    await page.click('#child-popup');
    await see(page.locator('#child-popup')).toBeVisible();
    await see(page.locator('#parent-popup')).toBeVisible();
  });

  it('counts a nested alert dialog', async () => {
    const page = await h.open('nested');
    await page.click('#trigger');
    await page.click('#alert-trigger');
    await see(page.locator('#alert-popup')).toBeVisible();
    await see(page.locator('#parent-popup')).toHaveCSS('--nested-dialogs', '1');
    await see(page.locator('#alert-popup')).toHaveAttribute('data-nested', '');
    await page.click('#alert-close');
    await see(page.locator('#parent-popup')).toHaveCSS('--nested-dialogs', '0');
  });

  it('side-by-side modal dialogs close one at a time, newest first', async () => {
    const page = await h.open('side-by-side');
    await page.click('#trigger');
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

describe('AlertDialog', () => {
  it('renders role=alertdialog and ignores outside presses', async () => {
    const page = await h.open('alert');
    await page.click('#trigger');
    const popup = page.locator('#popup');
    await see(popup).toHaveAttribute('role', 'alertdialog');
    await see(popup).toHaveAttribute('aria-labelledby', 'title');
    await page.mouse.click(700, 500);
    await see(popup).toBeVisible();
    await page.locator('#backdrop').dispatchEvent('click');
    await see(popup).toBeVisible();
  });

  it('closes on Escape and on its close button', async () => {
    const page = await h.open('alert');
    await page.click('#trigger');
    await see.poll(() => focused(page)).toBe('cancel');
    await page.keyboard.press('Escape');
    await see(page.locator('#popup')).toHaveCount(0);
    await page.click('#trigger');
    await page.click('#cancel');
    await see(page.locator('#popup')).toHaveCount(0);
    expect(await logOf(page)).toEqual([
      'open true trigger-press',
      'open false escape-key',
      'open true trigger-press',
      'open false close-press',
    ]);
  });
});
