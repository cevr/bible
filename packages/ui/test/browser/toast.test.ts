// Upstream: packages/react/src/toast/useToastManager.test.tsx,
// packages/react/src/toast/createToastManager.test.tsx,
// packages/react/src/toast/root/ToastRoot.test.tsx,
// packages/react/src/toast/viewport/ToastViewport.test.tsx,
// packages/react/src/toast/action/ToastAction.test.tsx,
// packages/react/src/toast/close/ToastClose.test.tsx,
// packages/react/src/toast/title/ToastTitle.test.tsx,
// packages/react/src/toast/content/ToastContent.test.tsx
//
// The behaviour cases, against a receipt toast (a title, a tone, an Undo
// action) raised through a manager created outside the tree; its title
// carries the receipt's count. Timers run on
// Playwright's clock. Upstream's cases for React-only machinery (strict
// mode, abandoned renders, layout-effect ordering) are left out.
import { describe, expect, it } from 'bun:test';

import { expect as see, type Page } from '@playwright/test';

import { focused, harness, logOf } from './harness.ts';

const h = harness('toast.tsx');

const roots = (page: Page) => page.locator('[data-testid="root"]');

/** Opens the receipt fixture on Playwright's clock. */
const openReceipt = async (query: Record<string, string> = {}) => {
  const page = await h.open('receipt', { query });
  await page.clock.install();
  return page;
};

/**
 * Holds the page's clock: from here only `runFor` moves it, so the wall time a
 * click, a hover or a slow machine takes spends none of a toast's timeout and
 * a margin of 100 ms is exact. A second ahead of the page's time, so the jump
 * is never into the past; nothing is pending before a toast is raised. The
 * exits still run: each `runFor` past a dismissal fires the frames the exit
 * waits on, and the exit's own animation runs on the browser's time.
 */
const hold = async (page: Page) => {
  const now = await page.evaluate(() => Date.now());
  await page.clock.pauseAt(now + 1000);
};

/** Drags with the mouse from the element's centre by (dx, dy), in steps. */
const drag = async (page: Page, selector: string, dx: number, dy: number, steps = 10) => {
  const box = await page.locator(selector).first().boundingBox();
  if (!box) {
    throw new Error(`${selector} has no box`);
  }
  const x = box.x + box.width / 2;
  const y = box.y + box.height / 2;
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(x + dx, y + dy, { steps });
  await page.mouse.up();
};

describe('createToastManager', () => {
  it('adds a toast raised outside the tree, with its title and type', async () => {
    const page = await openReceipt();
    await page.click('#raise-danger');
    await see(roots(page)).toHaveCount(1);
    const root = roots(page).first();
    await see(root.getByTestId('title')).toHaveText('Removed tag 1');
    await see(root).toHaveAttribute('data-type', 'danger');
    await see(root).toHaveAttribute('role', 'dialog');
    await see(root).toHaveAttribute('aria-modal', 'false');
    const titleId = await root.getByTestId('title').getAttribute('id');
    await see(root).toHaveAttribute('aria-labelledby', titleId ?? '');
    await see(page.locator('#viewport')).toHaveAttribute('role', 'region');
    await see(page.locator('#viewport')).toHaveAttribute('aria-live', 'polite');
  });

  it('runs the action slot: Undo fires its handler and closes the toast', async () => {
    const page = await openReceipt();
    await page.click('#raise');
    const action = roots(page).first().getByTestId('action');
    await see(action).toHaveText('Undo');
    await see(action).toHaveAttribute('type', 'button');
    await action.click();
    await see(roots(page)).toHaveCount(0);
    expect(await logOf(page)).toEqual(['undo 1', 'closed 1', 'removed 1']);
  });

  it('closes every toast', async () => {
    const page = await openReceipt();
    await page.click('#raise');
    await page.click('#raise');
    await see(roots(page)).toHaveCount(2);
    await page.click('#close-all');
    await see(roots(page)).toHaveCount(0);
    const lines = await logOf(page);
    expect(lines.filter((line) => line.startsWith('closed')).sort()).toEqual([
      'closed 1',
      'closed 2',
    ]);
  });

  it('newest toast first, with its index and offset variables', async () => {
    const page = await openReceipt();
    await page.click('#raise');
    await page.click('#raise');
    await see(roots(page)).toHaveCount(2);
    await see(roots(page).first().getByTestId('title')).toHaveText('Deleted note 2');
    const vars = await roots(page).evaluateAll((elements) =>
      elements.map((el) => [
        (el as HTMLElement).style.getPropertyValue('--toast-index'),
        (el as HTMLElement).style.getPropertyValue('--toast-offset-y'),
        (el as HTMLElement).style.getPropertyValue('--toast-height'),
      ]),
    );
    expect(vars).toEqual([
      ['0', '0px', '60px'],
      ['1', '60px', '60px'],
    ]);
    await see(page.locator('#viewport')).toHaveCSS('--toast-frontmost-height', '60px');
    await see(roots(page).nth(1).getByTestId('content')).toHaveAttribute('data-behind', '');
    await see(roots(page).first().getByTestId('content')).not.toHaveAttribute('data-behind', '');
  });
});

describe('useToastManager', () => {
  it('adds a toast from inside the tree', async () => {
    const page = await openReceipt();
    await page.click('#add-inside');
    await see(roots(page)).toHaveCount(1);
    await see(roots(page).first().getByTestId('title')).toHaveText('Inside');
    // No action content: the action part renders nothing.
    await see(roots(page).first().getByTestId('action')).toHaveCount(0);
  });
});

describe('timeout', () => {
  it('auto-dismisses after the timeout', async () => {
    const page = await openReceipt();
    await hold(page);
    await page.click('#raise');
    await see(roots(page)).toHaveCount(1);
    await page.clock.runFor(4900);
    await see(roots(page)).toHaveCount(1);
    await page.clock.runFor(200);
    await see(roots(page)).toHaveCount(0);
    expect(await logOf(page)).toEqual(['closed 1', 'removed 1']);
  });

  it('uses the provider timeout; 0 never dismisses', async () => {
    const page = await openReceipt({ timeout: '0' });
    await page.click('#raise');
    await page.clock.runFor(60_000);
    await see(roots(page)).toHaveCount(1);
  });

  it('pauses while the viewport is hovered and resumes with the time left', async () => {
    const page = await openReceipt();
    await hold(page);
    await page.click('#raise');
    await see(roots(page)).toHaveCount(1);
    await page.clock.runFor(3000);
    await roots(page).first().getByTestId('title').hover();
    await see(roots(page).first()).toHaveAttribute('data-expanded', '');
    await see(page.locator('#viewport')).toHaveAttribute('data-expanded', '');
    await page.clock.runFor(10_000);
    await see(roots(page)).toHaveCount(1);
    await page.mouse.move(5, 5);
    await see(page.locator('#viewport')).not.toHaveAttribute('data-expanded', '');
    await page.clock.runFor(1900);
    await see(roots(page)).toHaveCount(1);
    await page.clock.runFor(200);
    await see(roots(page)).toHaveCount(0);
  });

  it('pauses while the window is blurred', async () => {
    const page = await openReceipt();
    await hold(page);
    await page.click('#raise');
    await see(roots(page)).toHaveCount(1);
    await page.evaluate(() => window.dispatchEvent(new FocusEvent('blur')));
    await page.clock.runFor(10_000);
    await see(roots(page)).toHaveCount(1);
    await page.evaluate(() => window.dispatchEvent(new FocusEvent('focus')));
    await page.clock.runFor(5100);
    await see(roots(page)).toHaveCount(0);
  });
});

describe('keyboard', () => {
  it('closes the focused toast on Escape', async () => {
    const page = await openReceipt();
    await page.click('#raise');
    await roots(page).first().focus();
    await page.keyboard.press('Escape');
    await see(roots(page)).toHaveCount(0);
  });

  it('closes with the close button', async () => {
    const page = await openReceipt();
    await page.click('#raise');
    const close = roots(page).first().getByTestId('close');
    // Hidden while the stack is collapsed and the button is unfocused.
    await see(close).toHaveAttribute('aria-hidden', 'true');
    await close.click();
    await see(roots(page)).toHaveCount(0);
    expect(await logOf(page)).toEqual(['closed 1', 'removed 1']);
  });

  it('F6 focuses the viewport, Tab enters the first toast, Shift+Tab returns', async () => {
    const page = await openReceipt();
    await page.click('#raise');
    await see(roots(page)).toHaveCount(1);
    await page.focus('#raise');
    await page.keyboard.press('F6');
    await see.poll(() => focused(page)).toBe('viewport');
    // Focused: timers stay paused.
    await page.clock.runFor(10_000);
    await see(roots(page)).toHaveCount(1);
    await page.keyboard.press('Tab');
    await see.poll(() => focused(page)).toBe('root');
    await page.keyboard.press('Shift+Tab');
    await see.poll(() => focused(page)).toBe('raise');
  });
});

describe('limit', () => {
  it('marks the oldest toasts past the limit as limited and inert', async () => {
    const page = await openReceipt({ limit: '2' });
    await page.click('#raise');
    await page.click('#raise');
    await page.click('#raise');
    await see(roots(page)).toHaveCount(3);
    const limited = await roots(page).evaluateAll((elements) =>
      elements.map((el) => [el.hasAttribute('data-limited'), el.hasAttribute('inert')]),
    );
    expect(limited).toEqual([
      [false, false],
      [false, false],
      [true, true],
    ]);
    await roots(page).first().getByTestId('close').click();
    await see(roots(page)).toHaveCount(2);
    await see(roots(page).nth(1)).not.toHaveAttribute('data-limited', '');
  });
});

describe('priority', () => {
  it('announces a high priority toast through a hidden alert', async () => {
    const page = await openReceipt({ priority: 'high' });
    await page.click('#raise');
    const root = roots(page).first();
    await see(root).toHaveAttribute('role', 'alertdialog');
    await see(root).toHaveAttribute('aria-hidden', 'true');
    await see(page.locator('[role="alert"]')).toContainText('Deleted note');
  });
});

describe('swipe', () => {
  it('dismisses when dragged right past the threshold', async () => {
    const page = await openReceipt();
    await page.click('#raise');
    await see(roots(page)).toHaveCount(1);
    await drag(page, '[data-testid="title"]', 100, 0);
    await see(roots(page)).toHaveCount(0);
    expect(await logOf(page)).toEqual(['closed 1', 'removed 1']);
  });

  it('dismisses when dragged down past the threshold, the receipts’ other direction', async () => {
    const page = await openReceipt();
    await page.click('#raise');
    await see(roots(page)).toHaveCount(1);
    await drag(page, '[data-testid="title"]', 0, 100);
    await see(roots(page)).toHaveCount(0);
    expect(await logOf(page)).toEqual(['closed 1', 'removed 1']);
  });

  it('marks the toast swiping while dragging, with the swipe direction', async () => {
    const page = await openReceipt();
    await page.click('#raise');
    const box = await page.locator('[data-testid="title"]').boundingBox();
    if (!box) {
      throw new Error('no box');
    }
    await page.mouse.move(box.x + 10, box.y + 5);
    await page.mouse.down();
    await page.mouse.move(box.x + 40, box.y + 5, { steps: 5 });
    const root = roots(page).first();
    await see(root).toHaveAttribute('data-swiping', '');
    await see(root).toHaveAttribute('data-swipe-direction', 'right');
    await see(root).toHaveCSS('--toast-swipe-movement-x', /^2\d(\.\d+)?px$/);
    await page.mouse.up();
    await see(root).not.toHaveAttribute('data-swiping', '');
    // Below the threshold: the toast stays.
    await see(roots(page)).toHaveCount(1);
    await see(root).not.toHaveAttribute('data-swipe-direction', 'right');
  });

  it('does not dismiss in a direction that is not allowed', async () => {
    const page = await openReceipt();
    await page.click('#raise');
    await drag(page, '[data-testid="title"]', -120, 0);
    await see(roots(page)).toHaveCount(1);
  });

  it('cancels when the pointer changes its mind', async () => {
    const page = await openReceipt({ swipe: 'up' });
    await page.click('#raise');
    const box = await page.locator('[data-testid="title"]').boundingBox();
    if (!box) {
      throw new Error('no box');
    }
    const x = box.x + 10;
    const y = box.y + 5;
    await page.mouse.move(x, y);
    await page.mouse.down();
    await page.mouse.move(x, y - 60, { steps: 6 });
    await page.mouse.move(x, y - 45, { steps: 3 });
    await page.mouse.up();
    await see(roots(page)).toHaveCount(1);
  });

  it('does not start a swipe from a button inside the toast', async () => {
    const page = await openReceipt();
    await page.click('#raise');
    await drag(page, '[data-testid="action"]', 120, 0);
    await see(roots(page)).toHaveCount(1);
  });
});
