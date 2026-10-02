// Upstream: packages/react/src/popover/root/PopoverRoot.test.tsx,
// packages/react/src/popover/trigger/PopoverTrigger.test.tsx,
// packages/react/src/popover/popup/PopoverPopup.test.tsx,
// packages/react/src/popover/close/PopoverClose.test.tsx,
// packages/react/src/popover/title/PopoverTitle.test.tsx,
// packages/react/src/popover/description/PopoverDescription.test.tsx,
// packages/react/src/popover/backdrop/PopoverBackdrop.test.tsx,
// packages/react/src/popover/portal/PopoverPortal.test.tsx,
// packages/react/src/popover/arrow/PopoverArrow.test.tsx
//
// The popover's behaviour cases. Upstream's cases for parts not ported
// (viewport, detached triggers, handles and payloads, the trigger-switch
// transition), for positioning math (covered by the floating layer's own
// tests) and for React-only machinery are left out.
import { afterAll, beforeAll, describe, expect, it } from 'bun:test';

import { expect as see } from '@playwright/test';

import { type Harness, focused, harness, logOf } from './harness.ts';

let h: Harness;
beforeAll(async () => {
  h = await harness('popover.tsx');
});
afterAll(async () => {
  await h.close();
});

describe('Popover.Trigger', () => {
  it('carries the dialog ARIA and toggles the popover on click', async () => {
    const page = await h.open('popover');
    const trigger = page.locator('#trigger');
    await see(trigger).toHaveAttribute('aria-haspopup', 'dialog');
    await see(trigger).toHaveAttribute('aria-expanded', 'false');
    await see(trigger).not.toHaveAttribute('aria-controls');
    await trigger.click();
    await see(page.locator('#popup')).toBeVisible();
    await see(trigger).toHaveAttribute('aria-expanded', 'true');
    await see(trigger).toHaveAttribute('aria-controls', 'popup');
    await see(trigger).toHaveAttribute('data-popup-open', '');
    await see(trigger).toHaveAttribute('data-pressed', '');
    await trigger.click();
    await see(page.locator('#popup')).toHaveCount(0);
    await see(trigger).toHaveAttribute('aria-expanded', 'false');
    expect(await logOf(page)).toEqual([
      'open true trigger-press',
      'complete true',
      'open false trigger-press',
      'complete false',
    ]);
  });

  it('does not open when disabled', async () => {
    const page = await h.open('popover', { query: { disabled: 'true' } });
    const trigger = page.locator('#trigger');
    await see(trigger).toBeDisabled();
    await trigger.click({ force: true });
    await see(page.locator('#popup')).toHaveCount(0);
  });

  it('does not open on hover when disabled', async () => {
    const page = await h.open('popover', { query: { disabled: 'true', hover: 'true' } });
    await page.hover('#trigger', { force: true });
    await page.mouse.move(5, 5);
    await page.hover('#trigger', { force: true });
    await see(page.locator('#popup')).toHaveCount(0);
  });
});

describe('Popover.Popup', () => {
  it('is a dialog labelled by the title and described by the description', async () => {
    const page = await h.open('popover');
    await page.click('#trigger');
    const popup = page.locator('#popup');
    await see(popup).toHaveAttribute('role', 'dialog');
    await see(popup).toHaveAttribute('aria-labelledby', 'title');
    await see(popup).toHaveAttribute('aria-describedby', 'description');
    await see(page.locator('#title')).toHaveText('Notifications');
    await see(page.locator('#arrow')).toHaveAttribute('aria-hidden', 'true');
    await see(page.locator('#arrow')).toHaveAttribute('data-side', 'bottom');
  });

  it('focuses the first tabbable element on open and the trigger on close', async () => {
    const page = await h.open('popover');
    await page.focus('#trigger');
    await page.keyboard.press('Enter');
    await see.poll(() => focused(page)).toBe('inside');
    await page.keyboard.press('Escape');
    await see(page.locator('#popup')).toHaveCount(0);
    await see.poll(() => focused(page)).toBe('trigger');
    expect(await logOf(page)).toContain('open false escape-key');
  });

  it('marks a keyboard open as instant', async () => {
    const page = await h.open('popover');
    await page.focus('#trigger');
    await page.keyboard.press('Enter');
    await see(page.locator('#popup')).toHaveAttribute('data-instant', 'click');
  });
});

describe('dismissal', () => {
  it('closes on an outside click', async () => {
    const page = await h.open('popover');
    await page.click('#trigger');
    await see(page.locator('#popup')).toBeVisible();
    await page.mouse.click(400, 500);
    await see(page.locator('#popup')).toHaveCount(0);
    expect(await logOf(page)).toContain('open false outside-press');
  });

  it('keeps the popover open when a press starts inside and ends outside', async () => {
    const page = await h.open('popover');
    await page.click('#trigger');
    const box = await page.locator('#description').boundingBox();
    if (!box) {
      throw new Error('no description box');
    }
    await page.mouse.move(box.x + 2, box.y + 2);
    await page.mouse.down();
    await page.mouse.move(400, 500);
    await page.mouse.up();
    await see(page.locator('#popup')).toBeVisible();
  });

  it('Popover.Close closes it with the close-press reason', async () => {
    const page = await h.open('popover');
    await page.click('#trigger');
    await page.click('#close');
    await see(page.locator('#popup')).toHaveCount(0);
    expect(await logOf(page)).toContain('open false close-press');
    await see.poll(() => focused(page)).toBe('trigger');
  });

  it('the close action closes it', async () => {
    const page = await h.open('popover');
    await page.click('#trigger');
    await see(page.locator('#popup')).toBeVisible();
    await page.locator('#imperative-close').dispatchEvent('click');
    await see(page.locator('#popup')).toHaveCount(0);
    expect(await logOf(page)).toContain('open false imperative-action');
  });

  it('a canceled onOpenChange keeps it closed', async () => {
    const page = await h.open('popover', { query: { cancel: 'true' } });
    await page.click('#trigger');
    expect(await logOf(page)).toContain('open true trigger-press');
    await see(page.locator('#popup')).toHaveCount(0);
  });
});

describe('prop: defaultOpen and keepMounted', () => {
  it('opens on mount', async () => {
    const page = await h.open('popover', { query: { defaultOpen: 'true' } });
    await see(page.locator('#popup')).toBeVisible();
    await see(page.locator('#trigger')).toHaveAttribute('aria-expanded', 'true');
  });

  it('keeps the closed popup in the DOM, hidden', async () => {
    const page = await h.open('popover', { query: { keepMounted: 'true' } });
    await see(page.locator('#positioner')).toBeAttached();
    await see(page.locator('#positioner')).toBeHidden();
    await page.click('#trigger');
    await see(page.locator('#popup')).toBeVisible();
    await page.keyboard.press('Escape');
    await see(page.locator('#positioner')).toBeHidden();
    await see(page.locator('#popup')).toHaveAttribute('data-closed', '');
  });
});

describe('controlled', () => {
  it('follows the open prop and reports changes', async () => {
    const page = await h.open('controlled');
    await page.click('#toggle');
    await see(page.locator('#popup')).toBeVisible();
    await see(page.locator('#trigger')).toHaveAttribute('aria-expanded', 'true');
    await see(page.locator('#trigger')).toHaveAttribute('aria-controls', 'popup');
    await page.keyboard.press('Escape');
    await see(page.locator('#popup')).toHaveCount(0);
    expect(await logOf(page)).toEqual(['open false escape-key']);
  });
});

describe('openOnHover', () => {
  it('opens on hover without moving focus and closes when the pointer leaves', async () => {
    const page = await h.open('popover', { query: { hover: 'true' } });
    await page.focus('#before');
    await page.hover('#trigger');
    await see(page.locator('#popup')).toBeVisible();
    await see(page.locator('#trigger')).toHaveAttribute('data-popup-open', '');
    await see(page.locator('#trigger')).not.toHaveAttribute('data-pressed');
    expect(await focused(page)).toBe('before');
    await page.mouse.move(700, 580);
    await see(page.locator('#popup')).toHaveCount(0);
    expect(await logOf(page)).toEqual([
      'open true trigger-hover',
      'complete true',
      'open false trigger-hover',
      'complete false',
    ]);
  });

  it('stays open while the pointer travels to the popup', async () => {
    const page = await h.open('popover', { query: { hover: 'true' } });
    await page.hover('#trigger');
    await see(page.locator('#popup')).toBeVisible();
    await page.hover('#description');
    await see(page.locator('#popup')).toBeVisible();
    await page.mouse.move(700, 580);
    await see(page.locator('#popup')).toHaveCount(0);
  });

  it('waits for the delay before opening', async () => {
    const page = await h.open('popover', { query: { hover: 'true', delay: '300' } });
    await page.clock.install();
    const box = await page.locator('#trigger').boundingBox();
    if (!box) {
      throw new Error('no trigger box');
    }
    await page.mouse.move(box.x + 4, box.y + 4);
    await page.mouse.move(box.x + 8, box.y + 6);
    await page.clock.runFor(100);
    await see(page.locator('#popup')).toHaveCount(0);
    await page.clock.runFor(400);
    await see(page.locator('#popup')).toBeVisible();
  });

  it('waits for closeDelay before closing', async () => {
    const page = await h.open('popover', { query: { hover: 'true', closeDelay: '300' } });
    await page.clock.install();
    await page.hover('#trigger');
    await see(page.locator('#popup')).toBeVisible();
    await page.mouse.move(700, 580);
    await page.clock.runFor(100);
    await see(page.locator('#popup')).toBeVisible();
    await page.clock.runFor(400);
    await see(page.locator('#popup')).toHaveCount(0);
  });

  it('an impatient click after a hover-open keeps it open', async () => {
    const page = await h.open('popover', { query: { hover: 'true' } });
    await page.hover('#trigger');
    await see(page.locator('#popup')).toBeVisible();
    await page.click('#trigger');
    await see(page.locator('#popup')).toBeVisible();
    await see(page.locator('#trigger')).toHaveAttribute('data-pressed', '');
  });

  it('the backdrop ignores the pointer when opened by hover', async () => {
    const page = await h.open('popover', { query: { hover: 'true', backdrop: 'true' } });
    await page.hover('#trigger');
    await see(page.locator('#popup')).toBeVisible();
    await see(page.locator('#backdrop')).toHaveCSS('pointer-events', 'none');
  });

  it('the backdrop takes the pointer when opened by click', async () => {
    const page = await h.open('popover', { query: { backdrop: 'true' } });
    await page.click('#trigger');
    await see(page.locator('#backdrop')).toHaveCSS('pointer-events', 'auto');
    await see(page.locator('#backdrop')).toHaveAttribute('role', 'presentation');
  });
});

describe('prop: modal', () => {
  it('renders an internal backdrop and traps focus when a close part is inside', async () => {
    const page = await h.open('popover', { query: { modal: 'true' } });
    await page.click('#trigger');
    await see(page.locator('div[role="presentation"][data-base-ui-inert]')).toHaveCount(1);
    await see.poll(() => focused(page)).toBe('inside');
    await page.keyboard.press('Tab');
    await see.poll(() => focused(page)).toBe('close');
    await page.keyboard.press('Tab');
    await see.poll(() => focused(page)).toBe('inside');
    await see(page.locator('#popup')).toBeVisible();
  });

  it('locks page scroll', async () => {
    const page = await h.open('popover', { query: { modal: 'true' } });
    await page.click('#trigger');
    await see(page.locator('#popup')).toBeVisible();
    await see
      .poll(() =>
        page.evaluate(() =>
          [document.documentElement, document.body].some(
            (element) => getComputedStyle(element).overflowY === 'hidden',
          ),
        ),
      )
      .toBe(true);
  });

  it('closes on a click on the internal backdrop', async () => {
    const page = await h.open('popover', { query: { modal: 'true' } });
    await page.click('#trigger');
    await see(page.locator('#popup')).toBeVisible();
    await page.mouse.click(700, 580);
    await see(page.locator('#popup')).toHaveCount(0);
    expect(await logOf(page)).toContain('open false outside-press');
  });

  it('keeps the trigger focus guards without a close part', async () => {
    const page = await h.open('popover', { query: { modal: 'true', close: 'false' } });
    await page.click('#trigger');
    await see(page.locator('#trigger + [data-base-ui-focus-guard]')).toHaveCount(1);
    await page.focus('#inside');
    await page.keyboard.press('Tab');
    await see.poll(() => focused(page)).toBe('after');
    await see(page.locator('#popup')).toHaveCount(0);
  });

  it('trap-focus traps focus without a backdrop or scroll lock', async () => {
    const page = await h.open('popover', { query: { modal: 'trap-focus' } });
    await page.click('#trigger');
    await see(page.locator('#popup')).toBeVisible();
    await see(page.locator('div[role="presentation"][data-base-ui-inert]')).toHaveCount(0);
    await page.focus('#close');
    await page.keyboard.press('Tab');
    await page.keyboard.press('Tab');
    await see.poll(() => focused(page)).toBe('inside');
  });

  it('a non-modal popover renders no internal backdrop and Tab leaves it in page order', async () => {
    const page = await h.open('popover');
    await page.click('#trigger');
    await see(page.locator('div[role="presentation"][data-base-ui-inert]')).toHaveCount(0);
    await see(page.locator('#trigger + [data-base-ui-focus-guard]')).toHaveCount(1);
    await page.focus('#close');
    await page.keyboard.press('Tab');
    await see.poll(() => focused(page)).toBe('after');
    await see(page.locator('#popup')).toHaveCount(0);
    expect(await logOf(page)).toContain('open false focus-out');
  });

  it('Shift+Tab from the trigger closes and moves before it', async () => {
    const page = await h.open('popover');
    await page.click('#trigger');
    await see(page.locator('#popup')).toBeVisible();
    await page.focus('#trigger');
    await page.keyboard.press('Shift+Tab');
    await see.poll(() => focused(page)).toBe('before');
    await see(page.locator('#popup')).toHaveCount(0);
  });
});

describe('nested popovers', () => {
  it('a press in the nested popover keeps the parent open', async () => {
    const page = await h.open('nested');
    await page.click('#outer-trigger');
    await page.click('#inner-trigger');
    await see(page.locator('#inner-popup')).toBeVisible();
    await page.click('#inner-button');
    await see(page.locator('#outer-popup')).toBeVisible();
    await see(page.locator('#inner-popup')).toBeVisible();
  });

  it('Escape closes only the innermost popover', async () => {
    const page = await h.open('nested');
    await page.click('#outer-trigger');
    await page.click('#inner-trigger');
    await see(page.locator('#inner-popup')).toBeVisible();
    await page.keyboard.press('Escape');
    await see(page.locator('#inner-popup')).toHaveCount(0);
    await see(page.locator('#outer-popup')).toBeVisible();
    await see.poll(() => focused(page)).toBe('inner-trigger');
    await page.keyboard.press('Escape');
    await see(page.locator('#outer-popup')).toHaveCount(0);
  });

  it('a click in the parent popover closes the child', async () => {
    const page = await h.open('nested');
    await page.click('#outer-trigger');
    await page.click('#inner-trigger');
    await see(page.locator('#inner-popup')).toBeVisible();
    await page.click('#outer-button');
    await see(page.locator('#inner-popup')).toHaveCount(0);
    await see(page.locator('#outer-popup')).toBeVisible();
  });

  it('an outside click closes both', async () => {
    const page = await h.open('nested');
    await page.click('#outer-trigger');
    await page.click('#inner-trigger');
    await see(page.locator('#inner-popup')).toBeVisible();
    await page.mouse.click(700, 580);
    await see(page.locator('#inner-popup')).toHaveCount(0);
    await see(page.locator('#outer-popup')).toHaveCount(0);
  });
});
