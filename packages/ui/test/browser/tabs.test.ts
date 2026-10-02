// Upstream: packages/react/src/tabs/root/TabsRoot.test.tsx,
// packages/react/src/tabs/list/TabsList.test.tsx,
// packages/react/src/tabs/tab/TabsTab.test.tsx,
// packages/react/src/tabs/panel/TabsPanel.test.tsx,
// packages/react/src/tabs/indicator/TabsIndicator.test.tsx
//
// Tabs' ARIA wiring, selection (click, keyboard, automatic and manual
// activation), the uncontrolled root's fallbacks off disabled and missing
// tabs, the activation direction, the roving tab stop, keepMounted panels
// and the indicator's measured CSS variables. Upstream's cases for React-only
// machinery (Strict Mode, Suspense, pre-hydration script, render counts) and
// for parts not ported yet (Popover, Dialog) are left out.
import { afterAll, beforeAll, describe, expect, it } from 'bun:test';

import { expect as see } from '@playwright/test';
import type { Page } from '@playwright/test';

import { type Harness, focused, harness, logOf } from './harness.ts';

/** Runs `run` over `items` one after another (each step waits on the page). */
const inSequence = <T>(items: ReadonlyArray<T>, run: (item: T) => Promise<void>) =>
  items.reduce<Promise<void>>(
    (previous, item) => previous.then(() => run(item)),
    Promise.resolve(),
  );

let h: Harness;
beforeAll(async () => {
  h = await harness('tabs.tsx');
});
afterAll(async () => {
  await h.close();
});

const expectFocus = (page: Page, id: string) => see.poll(() => focused(page)).toBe(id);
const selected = (page: Page, index: number) =>
  see(page.locator(`#tab-${index}`)).toHaveAttribute('aria-selected', 'true');
/** Clicks a button without moving focus. */
const press = (page: Page, id: string) =>
  page.locator(`#${id}`).evaluate((el: HTMLElement) => el.click());

describe('Tabs ARIA', () => {
  it('wires tabs to their panels and back', async () => {
    const page = await h.open('tabs');
    await see(page.locator('#list')).toHaveAttribute('role', 'tablist');
    await see(page.locator('#list')).not.toHaveAttribute('aria-orientation');
    await see(page.locator('#tab-0')).toHaveAttribute('role', 'tab');
    await see(page.locator('#tab-0')).toHaveAttribute('aria-controls', 'panel-0');
    // Only the mounted panel is named.
    await see(page.locator('#tab-1')).not.toHaveAttribute('aria-controls');
    await see(page.locator('#panel-0')).toHaveAttribute('role', 'tabpanel');
    await see(page.locator('#panel-0')).toHaveAttribute('aria-labelledby', 'tab-0');
    await see(page.locator('#panel-0')).toHaveAttribute('data-index', '0');
    await see(page.locator('#panel-0')).toHaveAttribute('tabindex', '0');
    await see(page.locator('#panel-1')).toHaveCount(0);
    await page.click('#tab-1');
    await see(page.locator('#tab-1')).toHaveAttribute('aria-controls', 'panel-1');
    await see(page.locator('#panel-0')).toHaveCount(0);
  });

  it('keeps hidden, inert panels mounted with keepMounted', async () => {
    const page = await h.open('tabs', { query: { keepMounted: 'true' } });
    const hidden = page.locator('#panel-1');
    await see(hidden).toHaveAttribute('hidden', '');
    await see(hidden).toHaveAttribute('inert', '');
    await see(hidden).toHaveAttribute('data-hidden', '');
    await see(hidden).toHaveAttribute('tabindex', '-1');
    await see(hidden).toHaveAttribute('data-index', '1');
    await see(page.locator('#tab-1')).toHaveAttribute('aria-controls', 'panel-1');
    await page.click('#tab-1');
    await see(hidden).not.toHaveAttribute('hidden');
    await see(page.locator('#panel-0')).toHaveAttribute('hidden', '');
  });

  it('adds aria-orientation and data-orientation when vertical', async () => {
    const page = await h.open('tabs', { query: { orientation: 'vertical' } });
    await see(page.locator('#list')).toHaveAttribute('aria-orientation', 'vertical');
    await see(page.locator('#tabs-root')).toHaveAttribute('data-orientation', 'vertical');
    await see(page.locator('#tab-0')).toHaveAttribute('data-orientation', 'vertical');
  });
});

describe('Tabs selection', () => {
  it('selects the clicked tab, once, with its direction', async () => {
    const page = await h.open('tabs', { query: { defaultValue: '0' } });
    await selected(page, 0);
    await see(page.locator('#tab-0')).toHaveAttribute('data-active', '');
    await page.click('#tab-1');
    await selected(page, 1);
    await see(page.locator('#tab-0')).toHaveAttribute('aria-selected', 'false');
    await page.click('#tab-1');
    expect(await logOf(page)).toEqual(['value 1 none right']);
  });

  it('does not select on a secondary-button click', async () => {
    const page = await h.open('tabs', { query: { defaultValue: '0' } });
    await page.click('#tab-1', { button: 'right' });
    await selected(page, 0);
    expect(await logOf(page)).toEqual([]);
  });

  it('does not select a disabled tab', async () => {
    const page = await h.open('tabs', { query: { defaultValue: '0', disabled: '1' } });
    await see(page.locator('#tab-1')).toHaveAttribute('aria-disabled', 'true');
    await see(page.locator('#tab-1')).toHaveAttribute('data-disabled', '');
    await page.click('#tab-1', { force: true });
    await selected(page, 0);
  });

  it('keeps the selection when a user change is canceled', async () => {
    const page = await h.open('tabs', { query: { defaultValue: '0', cancel: 'true' } });
    await page.click('#tab-1');
    await selected(page, 0);
    expect(await logOf(page)).toEqual(['value 1 none right']);
  });

  it('follows the owner when controlled, including a disabled tab', async () => {
    const page = await h.open('tabs', { query: { controlled: 'true', disabled: '2' } });
    await page.click('#tab-1');
    await selected(page, 1);
    await page.click('#set-2');
    await selected(page, 2);
    await see(page.locator('#panel-2')).toBeVisible();
    // A disabled selected tab does not take the tab stop.
    await see(page.locator('#tab-2')).toHaveAttribute('tabindex', '-1');
    expect(await logOf(page)).toEqual(['value 1 none right']);
  });

  it('selects no tab with a null value, and renders no indicator', async () => {
    const page = await h.open('tabs', { query: { defaultValue: 'null' } });
    await inSequence([0, 1, 2], async (index) => {
      await see(page.locator(`#tab-${index}`)).toHaveAttribute('aria-selected', 'false');
    });
    await see(page.locator('#indicator')).toHaveCount(0);
    await see(page.locator('#tab-0')).toHaveAttribute('tabindex', '0');
    expect(await logOf(page)).toEqual([]);
  });
});

describe('Tabs fallbacks (uncontrolled)', () => {
  it('reports the implicit first selection', async () => {
    const page = await h.open('tabs');
    await selected(page, 0);
    await see.poll(() => logOf(page)).toEqual(['value 0 initial none']);
  });

  it('selects the first enabled tab when the implicit first is disabled', async () => {
    const page = await h.open('tabs', { query: { disabled: '0,1' } });
    await selected(page, 2);
    await see.poll(() => logOf(page)).toEqual(['value 2 initial none']);
    await see(page.locator('#tabs-root')).toHaveAttribute('data-activation-direction', 'none');
  });

  it('selects no tab when every tab is disabled', async () => {
    const page = await h.open('tabs', { query: { disabled: '0,1,2' } });
    await see.poll(() => logOf(page)).toEqual(['value null initial none']);
    await see(page.locator('#tab-0')).toHaveAttribute('aria-selected', 'false');
  });

  it('honors an explicit default that points at a disabled tab, quietly', async () => {
    const page = await h.open('tabs', { query: { defaultValue: '1', disabled: '1' } });
    await selected(page, 1);
    await see(page.locator('#panel-1')).toBeVisible();
    expect(await logOf(page)).toEqual([]);
  });

  it('falls back when the selected tab becomes disabled, or is removed', async () => {
    const page = await h.open('tabs', { query: { defaultValue: '0' } });
    await page.click('#disable-0');
    await selected(page, 1);
    await see.poll(() => logOf(page)).toEqual(['value 1 disabled none']);
    const removed = await h.open('tabs', { query: { defaultValue: '0' } });
    await removed.click('#remove-0');
    await selected(removed, 1);
    await see(removed.locator('#tab-1')).toHaveAttribute('tabindex', '0');
    await see.poll(() => logOf(removed)).toEqual(['value 1 missing none']);
  });

  it('falls back to null when every tab is removed', async () => {
    const page = await h.open('tabs', { query: { defaultValue: '0' } });
    await page.click('#remove-all');
    await see.poll(() => logOf(page)).toEqual(['value null missing none']);
  });

  it('falls back from an explicit default that matches no tab', async () => {
    const page = await h.open('tabs', { query: { defaultValue: '7' } });
    await selected(page, 0);
    await see.poll(() => logOf(page)).toEqual(['value 0 missing none']);
  });

  it('leaves a controlled selection alone when its tab becomes disabled', async () => {
    const page = await h.open('tabs', { query: { controlled: 'true' } });
    await page.click('#disable-0');
    await see(page.locator('#tab-0')).toHaveAttribute('data-disabled', '');
    await selected(page, 0);
    expect(await logOf(page)).toEqual([]);
  });
});

describe('Tabs keyboard', () => {
  const cases = [
    ['ltr', 'horizontal', 'ArrowRight', 'ArrowLeft'],
    ['rtl', 'horizontal', 'ArrowLeft', 'ArrowRight'],
    ['ltr', 'vertical', 'ArrowDown', 'ArrowUp'],
  ] as const;
  for (const [direction, orientation, next, prev] of cases) {
    it(`moves focus without activating (manual): ${direction} ${orientation}`, async () => {
      const page = await h.open('tabs', { query: { direction, orientation, defaultValue: '0' } });
      await page.focus('#before');
      await page.keyboard.press('Tab');
      await expectFocus(page, 'tab-0');
      await page.keyboard.press(prev);
      await expectFocus(page, 'tab-2');
      await page.keyboard.press(next);
      await expectFocus(page, 'tab-0');
      await page.keyboard.press(next);
      await expectFocus(page, 'tab-1');
      await see(page.locator('#tab-1')).toHaveAttribute('tabindex', '0');
      await selected(page, 0);
      await page.keyboard.press('Enter');
      await selected(page, 1);
      await page.keyboard.press(prev);
      await page.keyboard.press('Space');
      await selected(page, 0);
    });

    it(`activates on focus (automatic): ${direction} ${orientation}`, async () => {
      const page = await h.open('tabs', {
        query: { direction, orientation, defaultValue: '0', activateOnFocus: 'true' },
      });
      await page.focus('#tab-0');
      await page.keyboard.press(next);
      await expectFocus(page, 'tab-1');
      await selected(page, 1);
      await page.keyboard.press(prev);
      await page.keyboard.press(prev);
      await expectFocus(page, 'tab-2');
      await selected(page, 2);
    });
  }

  it('moves to a disabled tab without activating it', async () => {
    const page = await h.open('tabs', {
      query: { defaultValue: '0', disabled: '1', activateOnFocus: 'true' },
    });
    await page.focus('#tab-0');
    await page.keyboard.press('ArrowRight');
    await expectFocus(page, 'tab-1');
    await selected(page, 0);
  });

  it('moves to the first and last tabs with Home and End', async () => {
    const page = await h.open('tabs', { query: { defaultValue: '1' } });
    await page.focus('#tab-1');
    await page.keyboard.press('End');
    await expectFocus(page, 'tab-2');
    await page.keyboard.press('Home');
    await expectFocus(page, 'tab-0');
    await selected(page, 1);
  });

  it('does not wrap without loopFocus', async () => {
    const page = await h.open('tabs', { query: { defaultValue: '0', loop: 'false' } });
    await page.focus('#tab-0');
    await page.keyboard.press('ArrowLeft');
    await expectFocus(page, 'tab-0');
    await page.keyboard.press('End');
    await page.keyboard.press('ArrowRight');
    await expectFocus(page, 'tab-2');
  });

  for (const modifier of ['Shift', 'Control', 'Alt', 'Meta']) {
    it(`does not move with ${modifier} held`, async () => {
      const page = await h.open('tabs', { query: { defaultValue: '0' } });
      await page.focus('#tab-0');
      await page.keyboard.press(`${modifier}+ArrowRight`);
      await expectFocus(page, 'tab-0');
    });
  }

  it('puts the selected tab in the tab order', async () => {
    const page = await h.open('tabs', { query: { defaultValue: '2' } });
    await see(page.locator('#tab-2')).toHaveAttribute('tabindex', '0');
    await see(page.locator('#tab-0')).toHaveAttribute('tabindex', '-1');
    await page.focus('#before');
    await page.keyboard.press('Tab');
    await expectFocus(page, 'tab-2');
  });

  it('moves the tab stop to an outside selection while focus is outside the list', async () => {
    const page = await h.open('tabs', { query: { controlled: 'true' } });
    await page.click('#set-2');
    await see(page.locator('#tab-2')).toHaveAttribute('tabindex', '0');
    await see(page.locator('#tab-0')).toHaveAttribute('tabindex', '-1');
  });

  it('keeps the tab stop where the keyboard left it while focus is in the list', async () => {
    const page = await h.open('tabs', { query: { controlled: 'true' } });
    await page.focus('#tab-0');
    await press(page, 'set-2');
    await selected(page, 2);
    await see(page.locator('#tab-0')).toHaveAttribute('tabindex', '0');
    await page.keyboard.press('ArrowRight');
    await expectFocus(page, 'tab-1');
    await selected(page, 2);
  });

  it('activates anchor tabs rendered with nativeButton false', async () => {
    const page = await h.open('tabs', { query: { defaultValue: '0', anchors: 'true' } });
    await see(page.locator('#tab-1')).toHaveJSProperty('tagName', 'A');
    await see(page.locator('#tab-1')).toHaveAttribute('role', 'tab');
    await page.click('#tab-1');
    await selected(page, 1);
    await page.focus('#tab-1');
    await page.keyboard.press('ArrowRight');
    await page.keyboard.press('Enter');
    await selected(page, 2);
  });
});

describe('Tabs activation direction', () => {
  it('follows the move between tabs, horizontally and vertically', async () => {
    const page = await h.open('tabs', { query: { defaultValue: '0' } });
    const root = page.locator('#tabs-root');
    await see(root).toHaveAttribute('data-activation-direction', 'none');
    await page.click('#tab-2');
    await see(root).toHaveAttribute('data-activation-direction', 'right');
    await see(page.locator('#panel-2')).toHaveAttribute('data-activation-direction', 'right');
    await page.click('#tab-1');
    await see(root).toHaveAttribute('data-activation-direction', 'left');
    const vertical = await h.open('tabs', {
      query: { defaultValue: '0', orientation: 'vertical' },
    });
    await vertical.click('#tab-1');
    await see(vertical.locator('#tabs-root')).toHaveAttribute('data-activation-direction', 'down');
    await vertical.click('#tab-0');
    await see(vertical.locator('#tabs-root')).toHaveAttribute('data-activation-direction', 'up');
  });

  it('follows an outside change, and resets when the selection is cleared', async () => {
    const page = await h.open('tabs', { query: { controlled: 'true' } });
    await page.click('#set-2');
    await see(page.locator('#tabs-root')).toHaveAttribute('data-activation-direction', 'right');
    await page.click('#set-null');
    await see(page.locator('#tabs-root')).toHaveAttribute('data-activation-direction', 'none');
  });
});

describe('Tabs.Indicator', () => {
  const box = (page: Page, selector: string) =>
    page.locator(selector).evaluate((el) => {
      const r = el.getBoundingClientRect();
      return { left: r.left, top: r.top, width: r.width, height: r.height };
    });
  const vars = (page: Page) =>
    page
      .locator('#indicator')
      .evaluate((el: HTMLElement) =>
        ['left', 'right', 'top', 'bottom', 'width', 'height'].map((side) =>
          el.style.getPropertyValue(`--active-tab-${side}`),
        ),
      );
  const expected = async (page: Page, index: number) => {
    const list = await box(page, '#list');
    const tab = await box(page, `#tab-${index}`);
    const scroll = await page
      .locator('#list')
      .evaluate((el) => ({ width: el.scrollWidth, height: el.scrollHeight }));
    const left = tab.left - list.left;
    const top = tab.top - list.top;
    return [
      `${left}px`,
      `${scroll.width - left - tab.width}px`,
      `${top}px`,
      `${scroll.height - top - tab.height}px`,
      `${tab.width}px`,
      `${tab.height}px`,
    ];
  };

  it('sets the active tab position and size as CSS variables', async () => {
    const page = await h.open('tabs', { query: { defaultValue: '1' } });
    const indicator = page.locator('#indicator');
    await see(indicator).toHaveAttribute('role', 'presentation');
    await see(indicator).not.toHaveAttribute('hidden');
    await see.poll(() => vars(page)).toEqual(await expected(page, 1));
    expect((await vars(page))[0]).toBe('80px');
  });

  it('follows the selection and a tab that resizes', async () => {
    const page = await h.open('tabs', { query: { defaultValue: '1' } });
    await page.click('#tab-2');
    await see.poll(() => vars(page)).toEqual(await expected(page, 2));
    await see(page.locator('#indicator')).toHaveAttribute('data-activation-direction', 'right');
    await page.click('#widen');
    await see.poll(() => vars(page)).toEqual(await expected(page, 2));
    expect((await vars(page))[0]).toBe('230px');
  });
});
