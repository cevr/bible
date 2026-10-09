// Upstream: packages/react/src/menu/root/MenuRoot.test.tsx,
// packages/react/src/menu/trigger/MenuTrigger.test.tsx,
// packages/react/src/menu/item/MenuItem.test.tsx,
// packages/react/src/menu/group-label/MenuGroupLabel.test.tsx,
// packages/react/src/menu/popup/MenuPopup.test.tsx
//
// The menu's behaviour cases, against one menu of plain items in a group.
// Upstream's cases for parts not ported (hover opening, submenus, checkbox,
// radio and link items, arrow, backdrop, filter, list, viewport, detached
// triggers, menubar) and for React-only machinery are left out.
import { describe, expect, it } from 'bun:test';

import { expect as see, type Page } from '@playwright/test';

import { focused, harness, logOf } from './harness.ts';

const h = harness('menu.tsx');

describe('Menu.Trigger', () => {
  it('carries the button ARIA and toggles the menu on click', async () => {
    const page = await h.open('menu');
    const trigger = page.locator('#trigger');
    await see(trigger).toHaveAttribute('aria-haspopup', 'menu');
    await see(trigger).toHaveAttribute('aria-expanded', 'false');
    await trigger.click();
    await see(page.locator('#popup')).toBeVisible();
    await see(trigger).toHaveAttribute('aria-expanded', 'true');
    await see(trigger).toHaveAttribute('data-popup-open', '');
    await see(trigger).toHaveAttribute('aria-controls', 'popup');
    await trigger.click();
    await see(page.locator('#popup')).toHaveCount(0);
    await see(trigger).toHaveAttribute('aria-expanded', 'false');
  });

  it('a press on the trigger closes a menu the keyboard opened', async () => {
    const page = await h.open('menu');
    await page.focus('#trigger');
    await page.keyboard.press('ArrowDown');
    await see.poll(() => focused(page)).toBe('cut');
    await page.click('#trigger');
    await see(page.locator('#popup')).toHaveCount(0);
    expect(await logOf(page)).toContain('open false trigger-press');
  });

  // The second fixture is the lab's shape: every lab page wraps its menus in a
  // context menu's page trigger, and the menu is still a plain one.
  it.each(['menu', 'in-context-menu'])(
    'a press held on the trigger, dragged to an item and released there picks it (%s)',
    async (fixture) => {
      const page = await h.open(fixture);
      await page.clock.install();
      const at = async (selector: string) => {
        const box = await page.locator(selector).boundingBox();
        expect(box).not.toBeNull();
        return {
          x: (box?.x ?? 0) + (box?.width ?? 0) / 2,
          y: (box?.y ?? 0) + (box?.height ?? 0) / 2,
        };
      };
      const trigger = await at('#trigger');
      await page.mouse.move(trigger.x, trigger.y);
      await page.mouse.down();
      await see(page.locator('#popup')).toBeVisible();
      // Held past the trigger's 200 ms, so the release is a pick, not the press's own end.
      await page.clock.runFor(250);
      const grid = await at('#grid');
      await page.mouse.move(grid.x, grid.y, { steps: 5 });
      await page.mouse.up();
      await see(page.locator('#popup')).toHaveCount(0);
      expect(await logOf(page)).toContain('click grid');
    },
  );
});

describe('Menu.Root', () => {
  // The lab runs the chosen row's command here, once the menu is gone.
  it('reports the close complete once the exit animation ends, after the item ran', async () => {
    const page = await h.open('menu', { query: { animated: 'true' } });
    await page.click('#trigger');
    await see.poll(() => logOf(page)).toContain('complete true');
    await page.click('#cut');
    await see(page.locator('#popup')).toHaveAttribute('data-ending-style', '');
    expect(await logOf(page)).not.toContain('complete false');
    await see(page.locator('#popup')).toHaveCount(0);
    const lines = await logOf(page);
    expect(lines.slice(lines.indexOf('click cut'))).toEqual([
      'click cut',
      'open false item-press',
      'complete false',
    ]);
  });
});

describe('Menu.Popup', () => {
  it('renders role=menu labelled by the trigger, items role=menuitem', async () => {
    const page = await h.open('menu');
    await page.click('#trigger');
    const popup = page.locator('#popup');
    await see(popup).toHaveAttribute('role', 'menu');
    await see(popup).toHaveAttribute('aria-labelledby', 'trigger');
    await see(page.locator('#cut')).toHaveAttribute('role', 'menuitem');
    await see(page.locator('#sep')).toHaveAttribute('role', 'separator');
  });
});

describe('keyboard navigation', () => {
  it('ArrowDown on the trigger opens and highlights the first item', async () => {
    const page = await h.open('menu');
    await page.focus('#trigger');
    await page.keyboard.press('ArrowDown');
    await see(page.locator('#popup')).toBeVisible();
    await see.poll(() => focused(page)).toBe('cut');
    await see(page.locator('#cut')).toHaveAttribute('data-highlighted', '');
  });

  it('Enter on the trigger opens and highlights the first item', async () => {
    const page = await h.open('menu');
    await page.focus('#trigger');
    await page.keyboard.press('Enter');
    await see.poll(() => focused(page)).toBe('cut');
  });

  it('arrow keys move the highlight, wrap, and Home/End jump', async () => {
    const page = await h.open('menu');
    await page.focus('#trigger');
    await page.keyboard.press('ArrowDown');
    await see.poll(() => focused(page)).toBe('cut');
    await page.keyboard.press('ArrowDown');
    await see.poll(() => focused(page)).toBe('copy');
    await see(page.locator('#copy')).toHaveAttribute('data-highlighted', '');
    await page.keyboard.press('ArrowDown');
    await see.poll(() => focused(page)).toBe('paste');
    await page.keyboard.press('ArrowUp');
    await page.keyboard.press('ArrowUp');
    await see.poll(() => focused(page)).toBe('cut');
    await page.keyboard.press('ArrowUp');
    await see.poll(() => focused(page)).toBe('more');
    await page.keyboard.press('ArrowDown');
    await see.poll(() => focused(page)).toBe('cut');
    await page.keyboard.press('End');
    await see.poll(() => focused(page)).toBe('more');
    await page.keyboard.press('Home');
    await see.poll(() => focused(page)).toBe('cut');
  });

  it('typeahead highlights the item whose label starts with the typed text', async () => {
    const page = await h.open('menu');
    await page.focus('#trigger');
    await page.keyboard.press('ArrowDown');
    await see.poll(() => focused(page)).toBe('cut');
    await page.keyboard.type('gr');
    await see.poll(() => focused(page)).toBe('grid');
  });

  it('arrow keys follow the new order after the items move while the menu is open', async () => {
    const page = await h.open('sorted');
    await page.focus('#trigger');
    await page.keyboard.press('ArrowDown');
    await see.poll(() => focused(page)).toBe('alpha');
    await page.evaluate(() => (window as unknown as { __reverse: () => void }).__reverse());
    await see(page.locator('[role="menuitem"]').first()).toHaveId('charlie');
    // The highlight stays on alpha, the item it was on.
    await see(page.locator('[data-highlighted]')).toHaveId('alpha');
    // alpha is last now: the next item down wraps to charlie, then bravo.
    await page.keyboard.press('ArrowDown');
    await see.poll(() => focused(page)).toBe('charlie');
    await see(page.locator('#charlie')).toHaveAttribute('data-highlighted', '');
    await page.keyboard.press('ArrowDown');
    await see.poll(() => focused(page)).toBe('bravo');
    await page.keyboard.press('Home');
    await see.poll(() => focused(page)).toBe('charlie');
  });

  it('typeahead wraps the search past the highlighted item', async () => {
    const page = await h.open('menu');
    await page.click('#trigger');
    // The open popup takes focus a frame after the click; a key before that reaches the trigger.
    await see.poll(() => focused(page)).toBe('popup');
    await page.keyboard.press('End');
    await see.poll(() => focused(page)).toBe('more');
    await page.keyboard.press('c');
    await see.poll(() => focused(page)).toBe('cut');
  });

  it('Escape closes and returns focus to the trigger', async () => {
    const page = await h.open('menu');
    await page.focus('#trigger');
    await page.keyboard.press('ArrowDown');
    await see.poll(() => focused(page)).toBe('cut');
    await page.keyboard.press('Escape');
    await see(page.locator('#popup')).toHaveCount(0);
    await see.poll(() => focused(page)).toBe('trigger');
    expect(await logOf(page)).toContain('open false escape-key');
  });
});

describe('Menu.Item', () => {
  it('runs onClick and closes the menu', async () => {
    const page = await h.open('menu');
    await page.click('#trigger');
    await page.click('#cut');
    await see(page.locator('#popup')).toHaveCount(0);
    const lines = await logOf(page);
    expect(lines).toContain('click cut');
    expect(lines).toContain('open false item-press');
  });

  it('Enter on a highlighted item activates it', async () => {
    const page = await h.open('menu');
    await page.focus('#trigger');
    await page.keyboard.press('ArrowDown');
    await see.poll(() => focused(page)).toBe('cut');
    await page.keyboard.press('Enter');
    await see(page.locator('#popup')).toHaveCount(0);
    expect(await logOf(page)).toContain('click cut');
  });

  it('hovering an item highlights it', async () => {
    const page = await h.open('menu');
    await page.click('#trigger');
    await page.hover('#paste');
    await see(page.locator('#paste')).toHaveAttribute('data-highlighted', '');
    await see.poll(() => focused(page)).toBe('paste');
  });
});

describe('Menu.Group + Menu.GroupLabel', () => {
  it('labels the group with the group label', async () => {
    const page = await h.open('menu');
    await page.click('#trigger');
    await see(page.locator('#view-group')).toHaveAttribute('role', 'group');
    await see(page.locator('#view-group')).toHaveAttribute('aria-labelledby', 'view-label');
  });
});

describe('Menu.Positioner', () => {
  it('places the popup under the trigger', async () => {
    const page = await h.open('menu');
    await page.click('#trigger');
    await see(page.locator('body > [data-base-ui-portal] #popup')).toHaveCount(1);
    await see(page.locator('#positioner')).not.toHaveCSS('opacity', '0');
    const trigger = (await page.locator('#trigger').boundingBox())!;
    const positioner = (await page.locator('#positioner').boundingBox())!;
    expect(Math.round(positioner.y)).toBe(Math.round(trigger.y + trigger.height + 4));
    expect(Math.round(positioner.x)).toBe(Math.round(trigger.x));
  });
});

describe('dismissal', () => {
  it('Tab out of the open menu closes it and moves focus on from the trigger', async () => {
    const page = await h.open('menu');
    await page.focus('#trigger');
    await page.keyboard.press('Enter');
    await see.poll(() => focused(page)).toBe('cut');
    await page.keyboard.press('Tab');
    await see(page.locator('#popup')).toHaveCount(0);
    await see.poll(() => focused(page)).toBe('after');
    expect(await logOf(page)).toContain('open false focus-out');
  });

  it('a menu opened by the mouse locks the page scroll; one a finger opens does not', async () => {
    const scrollLocked = (page: Page) =>
      page.evaluate(() =>
        [document.documentElement, document.body].some(
          (element) => getComputedStyle(element).overflowY === 'hidden',
        ),
      );
    const page = await h.open('menu');
    await page.click('#trigger');
    await see(page.locator('#popup')).toBeVisible();
    await see.poll(() => scrollLocked(page)).toBe(true);
    await page.keyboard.press('Escape');
    await see.poll(() => scrollLocked(page)).toBe(false);

    // A narrow menu on a phone: a swipe outside may still scroll the page.
    const phone = await h.open('menu', { touch: true });
    await phone.clock.install();
    await phone.tap('#trigger');
    await see(phone.locator('#popup')).toBeVisible();
    // A lock lands on a 0 ms timeout set as the menu opened: run every timer due.
    await phone.clock.runFor(10);
    expect(await scrollLocked(phone)).toBe(false);
  });

  it('covers the page with an internal backdrop cut out around the trigger; a press on it closes the menu', async () => {
    const page = await h.open('menu');
    await page.click('#trigger');
    await see(page.locator('#popup')).toBeVisible();
    const internal = page.locator(
      'body > [data-base-ui-portal] > [role=presentation][data-base-ui-inert]',
    );
    await see(internal).toHaveCount(1);
    await see(internal).toHaveCSS('position', 'fixed');
    expect(await internal.evaluate((el) => el.style.clipPath)).toContain('polygon');
    await page.mouse.click(700, 500);
    await see(page.locator('#popup')).toHaveCount(0);
    expect(await logOf(page)).toContain('open false outside-press');
  });
});
