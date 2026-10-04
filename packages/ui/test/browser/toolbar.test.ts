// Upstream: packages/react/src/toolbar/root/ToolbarRoot.test.tsx,
// packages/react/src/toolbar/group/ToolbarGroup.test.tsx,
// packages/react/src/toolbar/button/ToolbarButton.test.tsx,
// packages/react/src/toolbar/link/ToolbarLink.test.tsx,
// packages/react/src/toolbar/input/ToolbarInput.test.tsx,
// packages/react/src/toolbar/separator/ToolbarSeparator.test.tsx,
// packages/react/src/internals/composite/root/CompositeRoot.test.tsx (roving focus)
//
// The toolbar's roving tab stop (arrow keys per orientation and direction,
// looping, disabled items focusable or skipped), the text input's caret, the
// custom-element button, toggle groups inside a toolbar, and the separator.
// Upstream's cases that render other parts through a toolbar button (Menu,
// Select, Dialog, Popover, Switch, NumberField) wait for those parts.
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
  h = await harness('toolbar.tsx');
});
afterAll(async () => {
  await h.close();
});

const tabIn = async (page: Page) => {
  await page.focus('#before');
  await page.keyboard.press('Tab');
};

const expectFocus = (page: Page, id: string) => see.poll(() => focused(page)).toBe(id);

describe('Toolbar.Root', () => {
  it('renders a toolbar with its orientation', async () => {
    const page = await h.open('navigation', { query: { orientation: 'vertical' } });
    const toolbar = page.locator('#toolbar');
    await see(toolbar).toHaveAttribute('role', 'toolbar');
    await see(toolbar).toHaveAttribute('aria-orientation', 'vertical');
    await see(toolbar).toHaveAttribute('data-orientation', 'vertical');
  });

  const cases = [
    ['ltr', 'horizontal', 'ArrowRight', 'ArrowLeft', 'ArrowDown'],
    ['ltr', 'vertical', 'ArrowDown', 'ArrowUp', 'ArrowRight'],
    ['rtl', 'horizontal', 'ArrowLeft', 'ArrowRight', 'ArrowUp'],
    ['rtl', 'vertical', 'ArrowDown', 'ArrowUp', 'ArrowLeft'],
  ] as const;
  for (const [direction, orientation, next, prev, ignored] of cases) {
    it(`roves with the arrow keys: ${direction} ${orientation}`, async () => {
      const page = await h.open('navigation', { query: { direction, orientation } });
      await tabIn(page);
      await expectFocus(page, 'one');
      await see(page.locator('#one')).toHaveAttribute('tabindex', '0');
      await see(page.locator('#two')).toHaveAttribute('tabindex', '-1');
      await inSequence(
        [
          [next, 'two'],
          [next, 'three'],
          [next, 'one'],
          [prev, 'three'],
          [ignored, 'three'],
        ] as const,
        async ([key, id]) => {
          await page.keyboard.press(key);
          await expectFocus(page, id);
          await see(page.locator(`#${id}`)).toHaveAttribute('tabindex', '0');
        },
      );
      // One tab stop: Tab leaves the toolbar, Shift+Tab returns to the last item.
      await page.keyboard.press('Tab');
      await expectFocus(page, 'after');
      await page.keyboard.press('Shift+Tab');
      await expectFocus(page, 'three');
    });
  }

  it('does not wrap focus when loopFocus is false', async () => {
    const page = await h.open('navigation', { query: { loop: 'false' } });
    await tabIn(page);
    await page.keyboard.press('ArrowLeft');
    await expectFocus(page, 'one');
    await page.keyboard.press('ArrowRight');
    await page.keyboard.press('ArrowRight');
    await page.keyboard.press('ArrowRight');
    await expectFocus(page, 'three');
  });

  it('does not move on Home and End', async () => {
    const page = await h.open('navigation');
    await tabIn(page);
    await page.keyboard.press('End');
    await expectFocus(page, 'one');
  });

  it('disables every item except links', async () => {
    const page = await h.open('disabled');
    await inSequence(['button', 'input', 'g-button', 'g-input'], async (id) => {
      await see(page.locator(`#${id}`)).toHaveAttribute('aria-disabled', 'true');
      await see(page.locator(`#${id}`)).toHaveAttribute('data-disabled', '');
    });
    await see(page.locator('#group')).toHaveAttribute('data-disabled', '');
    await see(page.locator('#group')).toHaveAttribute('role', 'group');
    await inSequence(['link', 'g-link'], async (id) => {
      await see(page.locator(`#${id}`)).not.toHaveAttribute('data-disabled');
      await see(page.locator(`#${id}`)).not.toHaveAttribute('aria-disabled');
    });
  });

  it('keeps disabled items focusable by default', async () => {
    const page = await h.open('focusable-when-disabled');
    await inSequence(['b1', 'g1', 'g2', 'input'], async (id) => {
      await see(page.locator(`#${id}`)).not.toHaveAttribute('disabled');
    });
    await tabIn(page);
    await expectFocus(page, 'b1');
    await inSequence(['g1', 'g2', 'input'], async (id) => {
      await page.keyboard.press('ArrowRight');
      await expectFocus(page, id);
      await see(page.locator(`#${id}`)).toHaveAttribute('aria-disabled', 'true');
      await see(page.locator(`#${id}`)).toHaveAttribute('data-focusable', '');
    });
    await page.keyboard.press('ArrowRight');
    await expectFocus(page, 'b1');
    await page.keyboard.press('ArrowLeft');
    await expectFocus(page, 'input');
  });

  it('skips an item disabled with focusableWhenDisabled false', async () => {
    const page = await h.open('focusable-when-disabled', { query: { individual: 'true' } });
    await see(page.locator('#g2')).toHaveAttribute('disabled', '');
    await see(page.locator('#g2')).not.toHaveAttribute('data-focusable');
    await tabIn(page);
    await page.keyboard.press('ArrowRight');
    await expectFocus(page, 'g1');
    await page.keyboard.press('ArrowRight');
    await expectFocus(page, 'input');
    await page.keyboard.press('ArrowLeft');
    await expectFocus(page, 'g1');
  });

  it('moves the initial tab stop off a disabled, unfocusable first item', async () => {
    const page = await h.open('disabled-first');
    await see(page.locator('#b1')).toHaveAttribute('disabled', '');
    await see(page.locator('#b2')).toHaveAttribute('tabindex', '0');
    await see(page.locator('#b1')).not.toHaveAttribute('tabindex', '0');
    await tabIn(page);
    await expectFocus(page, 'b2');
    await page.keyboard.press('ArrowRight');
    await expectFocus(page, 'b3');
    await page.keyboard.press('ArrowRight');
    await expectFocus(page, 'b2');
  });

  it('keeps an enabled item with focusableWhenDisabled false navigable', async () => {
    const page = await h.open('disabled-first', { query: { enabled: 'true' } });
    await see(page.locator('#b1')).not.toHaveAttribute('disabled');
    await tabIn(page);
    await expectFocus(page, 'b1');
    await page.keyboard.press('ArrowRight');
    await expectFocus(page, 'b2');
  });
});

describe('Toolbar.Button', () => {
  it('is focusable but inert when disabled, keeping hover handlers', async () => {
    const page = await h.open('disabled-button');
    const button = page.locator('#button');
    await see(button).not.toHaveAttribute('disabled');
    await see(button).toHaveAttribute('aria-disabled', 'true');
    await see(button).toHaveAttribute('type', 'button');
    await button.hover();
    await button.click({ force: true });
    await button.focus();
    await page.keyboard.press('Space');
    await page.keyboard.press('Enter');
    const lines = await logOf(page);
    expect(lines).toContain('mousemove');
    expect(lines.filter((line) => line !== 'mousemove')).toEqual([]);
  });

  it('uses the disabled attribute when focusableWhenDisabled is false', async () => {
    const page = await h.open('disabled-button', { query: { focusable: 'false' } });
    const button = page.locator('#button');
    await see(button).toHaveAttribute('disabled', '');
    await see(button).toHaveAttribute('data-disabled', '');
    await see(button).not.toHaveAttribute('aria-disabled');
  });

  for (const key of ['Space', 'Enter']) {
    it(`a custom element dispatches a real click on ${key}`, async () => {
      const page = await h.open('custom-element');
      await see(page.locator('#save')).toHaveAttribute('role', 'button');
      await tabIn(page);
      await expectFocus(page, 'save');
      await page.keyboard.press(key);
      await see.poll(() => logOf(page)).toEqual(['click', 'ancestor click']);
    });
  }
});

describe('Toolbar.Input', () => {
  for (const [orientation, next, prev] of [
    ['horizontal', 'ArrowRight', 'ArrowLeft'],
    ['vertical', 'ArrowDown', 'ArrowUp'],
  ] as const) {
    it(`selects its text on entry and leaves at the caret's ends: ${orientation}`, async () => {
      const page = await h.open('input', { query: { orientation } });
      await tabIn(page);
      await page.keyboard.press(next);
      await expectFocus(page, 'input');
      const selection = await page
        .locator('#input')
        .evaluate((el: HTMLInputElement) => [el.selectionStart, el.selectionEnd]);
      expect(selection).toEqual([0, 4]);
      // The caret collapses to the end first, then the key moves on.
      await page.keyboard.press('ArrowRight');
      await page.keyboard.press(next);
      await expectFocus(page, 'checkbox');
      await page.keyboard.press(prev);
      await expectFocus(page, 'input');
      await page.keyboard.press('ArrowLeft');
      await page.keyboard.press(prev);
      await expectFocus(page, 'b1');
    });
  }

  for (const [direction, next, prev] of [
    ['ltr', 'ArrowRight', 'ArrowLeft'],
    ['rtl', 'ArrowLeft', 'ArrowRight'],
  ] as const) {
    it(`respects the caret and the selection: ${direction}`, async () => {
      const page = await h.open('input', { query: { direction } });
      await tabIn(page);
      await page.keyboard.press(next);
      await expectFocus(page, 'input');
      const input = page.locator('#input');
      await input.evaluate((el: HTMLInputElement) => el.setSelectionRange(1, 3));
      await page.keyboard.press(next);
      await expectFocus(page, 'input');
      await input.evaluate((el: HTMLInputElement) => el.setSelectionRange(2, 2));
      await page.keyboard.press(`Shift+${next}`);
      await expectFocus(page, 'input');
      await input.evaluate((el: HTMLInputElement) => el.setSelectionRange(4, 4));
      // The caret at the text's end leaves forward; at its start, backward.
      await page.keyboard.press(next);
      await expectFocus(page, 'checkbox');
      await page.keyboard.press(prev);
      await expectFocus(page, 'input');
      await input.evaluate((el: HTMLInputElement) => el.setSelectionRange(0, 0));
      await page.keyboard.press(prev);
      await expectFocus(page, 'b1');
    });
  }

  it('does not trap Tab when disabled, and arrows move past it', async () => {
    const page = await h.open('input', { query: { disabled: 'true' } });
    await see(page.locator('#input')).toHaveAttribute('aria-disabled', 'true');
    await see(page.locator('#input')).not.toHaveAttribute('disabled');
    await tabIn(page);
    await page.keyboard.press('ArrowRight');
    await expectFocus(page, 'input');
    await page.keyboard.press('ArrowRight');
    await expectFocus(page, 'checkbox');
    await page.keyboard.press('ArrowLeft');
    await expectFocus(page, 'input');
    await page.keyboard.press('Tab');
    await expectFocus(page, 'after');
    await page.keyboard.press('Shift+Tab');
    await expectFocus(page, 'input');
  });

  it('does not take pointer focus or act while disabled, and does once enabled', async () => {
    const page = await h.open('input', { query: { disabled: 'true' } });
    await tabIn(page);
    await expectFocus(page, 'b1');
    await page.click('#input', { force: true });
    await expectFocus(page, 'b1');
    await page.click('#checkbox', { force: true });
    await see(page.locator('#checkbox')).not.toBeChecked();
    await page.click('#enable');
    await see(page.locator('#input')).not.toHaveAttribute('aria-disabled');
    await page.click('#input');
    await expectFocus(page, 'input');
    await page.click('#checkbox');
    await see(page.locator('#checkbox')).toBeChecked();
  });

  it('is skipped when disabled with focusableWhenDisabled false', async () => {
    const page = await h.open('input', { query: { disabled: 'true', focusable: 'false' } });
    await tabIn(page);
    await page.keyboard.press('ArrowRight');
    await expectFocus(page, 'checkbox');
  });
});

describe('ToggleGroup in a toolbar', () => {
  it('joins the toolbar roving focus and selects with Enter', async () => {
    const page = await h.open('toggles');
    await see(page.locator('#group')).toHaveAttribute('role', 'group');
    await see(page.locator('#one')).toHaveAttribute('aria-pressed', 'true');
    await page.focus('#outside');
    await page.keyboard.press('Tab');
    await expectFocus(page, 'before');
    await inSequence(['one', 'two', 'three', 'after'], async (id) => {
      await page.keyboard.press('ArrowRight');
      await expectFocus(page, id);
    });
    await page.keyboard.press('ArrowLeft');
    await expectFocus(page, 'three');
    await page.keyboard.press('Enter');
    await see(page.locator('#three')).toHaveAttribute('aria-pressed', 'true');
    await see(page.locator('#one')).toHaveAttribute('aria-pressed', 'false');
    expect(await logOf(page)).toEqual(['value [three]']);
  });

  it('supports multiple selection and a controlled value', async () => {
    const page = await h.open('toggles', { query: { multiple: 'true' } });
    await page.focus('#two');
    await page.keyboard.press('Enter');
    expect(await logOf(page)).toEqual(['value [one,two]']);
    await see(page.locator('#one')).toHaveAttribute('aria-pressed', 'true');
    await see(page.locator('#two')).toHaveAttribute('aria-pressed', 'true');
    const controlled = await h.open('toggles', { query: { controlled: 'true' } });
    await see(controlled.locator('#one')).toHaveAttribute('aria-pressed', 'false');
    await controlled.focus('#one');
    await controlled.keyboard.press('Enter');
    await see(controlled.locator('#one')).toHaveAttribute('aria-pressed', 'true');
  });

  it('skips a disabled toggle, and one disabled while mounted', async () => {
    const page = await h.open('toggles', { query: { twoDisabled: 'true' } });
    await see(page.locator('#two')).toBeDisabled();
    await page.focus('#one');
    await page.keyboard.press('ArrowRight');
    await expectFocus(page, 'three');
    const runtime = await h.open('toggles');
    await runtime.click('#disable-two');
    await see(runtime.locator('#two')).toBeDisabled();
    await runtime.focus('#one');
    await runtime.keyboard.press('ArrowRight');
    await expectFocus(runtime, 'three');
  });

  it('disables its toggles inside a disabled Toolbar.Group', async () => {
    const page = await h.open('toggles', { query: { groupDisabled: 'true' } });
    await inSequence(['one', 'two', 'three'], async (id) => {
      await see(page.locator(`#${id}`)).toBeDisabled();
      await see(page.locator(`#${id}`)).toHaveAttribute('data-disabled', '');
    });
    await page.focus('#outside');
    await page.keyboard.press('Tab');
    await expectFocus(page, 'before');
    await page.keyboard.press('ArrowRight');
    await expectFocus(page, 'after');
  });
});

describe('Toolbar.Separator', () => {
  it('is perpendicular to the toolbar unless told otherwise', async () => {
    const page = await h.open('separators');
    await see(page.locator('#in-horizontal')).toHaveAttribute('role', 'separator');
    await see(page.locator('#in-horizontal')).toHaveAttribute('aria-orientation', 'vertical');
    await see(page.locator('#in-vertical')).toHaveAttribute('aria-orientation', 'horizontal');
    await see(page.locator('#overridden')).toHaveAttribute('aria-orientation', 'horizontal');
  });
});
