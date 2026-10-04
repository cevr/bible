// Upstream: packages/react/src/menu/root/MenuRoot.test.tsx,
// packages/react/src/menu/trigger/MenuTrigger.test.tsx,
// packages/react/src/menu/item/MenuItem.test.tsx,
// packages/react/src/menu/checkbox-item/MenuCheckboxItem.test.tsx,
// packages/react/src/menu/radio-item/MenuRadioItem.test.tsx,
// packages/react/src/menu/group-label/MenuGroupLabel.test.tsx,
// packages/react/src/menu/submenu-trigger/MenuSubmenuTrigger.test.tsx,
// packages/react/src/menu/popup/MenuPopup.test.tsx,
// packages/react/src/menu/backdrop/MenuBackdrop.test.tsx
//
// The menu's behaviour cases, against one menu with every kind of item.
// Upstream's cases for parts not ported (filter, list, viewport, detached
// triggers, menubar) and for React-only machinery are left out.
import { afterAll, beforeAll, describe, expect, it } from 'bun:test';

import { expect as see } from '@playwright/test';

import { type Harness, focused, harness, logOf } from './harness.ts';

let h: Harness;
beforeAll(async () => {
  h = await harness('menu.tsx');
});
afterAll(async () => {
  await h.close();
});

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

  it('opens on hover when openOnHover is set', async () => {
    const page = await h.open('menu', { query: { hover: 'true' } });
    await page.hover('#trigger');
    await see(page.locator('#popup')).toBeVisible();
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
    await see(page.locator('#grid')).toHaveAttribute('role', 'menuitemcheckbox');
    await see(page.locator('#zoom-fit')).toHaveAttribute('role', 'menuitemradio');
    await see(page.locator('#sep')).toHaveAttribute('role', 'separator');
    await see(page.locator('#copy')).toHaveAttribute('aria-disabled', 'true');
    await see(page.locator('#copy')).toHaveAttribute('data-disabled', '');
  });

  it('stops toolbar navigation keys without blocking ordinary key events', async () => {
    const page = await h.open('in-toolbar');
    await page.click('#trigger');
    await see(page.locator('#popup')).toBeVisible();
    await page.keyboard.press('ArrowDown');
    await see(page.locator('#cut')).toBeFocused();
    await page.keyboard.press('ArrowRight');
    await page.keyboard.press('End');
    await see(page.locator('#paste')).toBeFocused();
    await see(page.locator('#popup')).toBeVisible();
    await page.keyboard.press('F1');
    expect(await logOf(page)).toEqual(['toolbar key F1']);
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

  // Upstream: 'includes disabled items during keyboard navigation' (aria-disabled items stay reachable).
  it('arrow keys reach disabled items, wrap, and Home/End jump', async () => {
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

  it('stops at the ends when loopFocus is false', async () => {
    const page = await h.open('menu', { query: { loop: 'false' } });
    await page.focus('#trigger');
    await page.keyboard.press('ArrowDown');
    await see.poll(() => focused(page)).toBe('cut');
    await page.keyboard.press('ArrowUp');
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

  it('typeahead reaches aria-disabled items', async () => {
    const page = await h.open('menu');
    await page.focus('#trigger');
    await page.keyboard.press('ArrowDown');
    await see.poll(() => focused(page)).toBe('cut');
    await page.keyboard.type('co');
    await see.poll(() => focused(page)).toBe('copy');
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
  it('runs onClick and closes the menu; closeOnClick=false keeps it open', async () => {
    const page = await h.open('menu');
    await page.click('#trigger');
    await page.click('#paste');
    await see(page.locator('#popup')).toBeVisible();
    await page.click('#cut');
    await see(page.locator('#popup')).toHaveCount(0);
    const lines = await logOf(page);
    expect(lines).toContain('click paste');
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

  it('a disabled item does not run onClick nor close the menu', async () => {
    const page = await h.open('menu');
    await page.click('#trigger');
    await page.locator('#copy').click({ force: true });
    await see(page.locator('#popup')).toBeVisible();
    expect(await logOf(page)).not.toContain('click copy');
  });

  it('hovering an item highlights it', async () => {
    const page = await h.open('menu');
    await page.click('#trigger');
    await page.hover('#paste');
    await see(page.locator('#paste')).toHaveAttribute('data-highlighted', '');
    await see.poll(() => focused(page)).toBe('paste');
  });
});

describe('Menu.CheckboxItem', () => {
  // A checkbox item keeps the menu open by default (closeOnClick=false).
  it('toggles checked, aria-checked, data-checked and the indicator, menu kept open', async () => {
    const page = await h.open('menu');
    await page.click('#trigger');
    const grid = page.locator('#grid');
    await see(grid).toHaveAttribute('aria-checked', 'false');
    await see(grid).toHaveAttribute('data-unchecked', '');
    await see(page.locator('#grid-indicator')).toHaveCount(0);
    await grid.click();
    await see(page.locator('#popup')).toBeVisible();
    await see(grid).toHaveAttribute('aria-checked', 'true');
    await see(grid).toHaveAttribute('data-checked', '');
    await see(page.locator('#grid-indicator')).toHaveAttribute('data-checked', '');
    expect(await logOf(page)).toContain('grid true');
  });
});

describe('Menu.RadioGroup + Menu.RadioItem', () => {
  it('starts on the default value and checks the pressed item', async () => {
    const page = await h.open('menu');
    await page.click('#trigger');
    await see(page.locator('#zoom')).toHaveAttribute('role', 'group');
    await see(page.locator('#zoom-fit')).toHaveAttribute('aria-checked', 'true');
    await see(page.locator('#zoom-full')).toHaveAttribute('aria-checked', 'false');
    await see(page.locator('#fit-indicator')).toHaveCount(1);
    await see(page.locator('#full-indicator')).toHaveCount(0);
    await page.click('#zoom-full');
    await see(page.locator('#popup')).toBeVisible();
    await see(page.locator('#zoom-fit')).toHaveAttribute('aria-checked', 'false');
    await see(page.locator('#zoom-full')).toHaveAttribute('aria-checked', 'true');
    await see(page.locator('#full-indicator')).toHaveCount(1);
    expect(await logOf(page)).toContain('zoom full');
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

describe('Menu.SubmenuTrigger', () => {
  it('opens the submenu with ArrowRight and closes it with ArrowLeft', async () => {
    const page = await h.open('menu');
    await page.focus('#trigger');
    await page.keyboard.press('ArrowDown');
    await page.keyboard.press('End');
    await see.poll(() => focused(page)).toBe('more');
    await see(page.locator('#more')).toHaveAttribute('aria-haspopup', 'menu');
    await page.keyboard.press('ArrowRight');
    await see(page.locator('#sub-popup')).toBeVisible();
    await see.poll(() => focused(page)).toBe('rename');
    await page.keyboard.press('ArrowLeft');
    await see(page.locator('#sub-popup')).toHaveCount(0);
    await see.poll(() => focused(page)).toBe('more');
    await see(page.locator('#popup')).toBeVisible();
  });

  it('opens the submenu on hover and closes everything on a submenu item click', async () => {
    const page = await h.open('menu');
    await page.click('#trigger');
    await page.hover('#more');
    await see(page.locator('#sub-popup')).toBeVisible();
    await see(page.locator('#more')).toHaveAttribute('data-popup-open', '');
    await page.click('#rename');
    await see(page.locator('#sub-popup')).toHaveCount(0);
    await see(page.locator('#popup')).toHaveCount(0);
    expect(await logOf(page)).toContain('click rename');
  });

  // closeParentOnEsc defaults to false: Escape closes only the submenu.
  it('Escape in the submenu closes only the submenu', async () => {
    const page = await h.open('menu');
    await page.focus('#trigger');
    await page.keyboard.press('ArrowDown');
    await page.keyboard.press('End');
    await page.keyboard.press('ArrowRight');
    await see.poll(() => focused(page)).toBe('rename');
    await page.keyboard.press('Escape');
    await see(page.locator('#sub-popup')).toHaveCount(0);
    await see(page.locator('#popup')).toBeVisible();
    await see.poll(() => focused(page)).toBe('more');
    await page.keyboard.press('Escape');
    await see(page.locator('#popup')).toHaveCount(0);
    await see.poll(() => focused(page)).toBe('trigger');
  });
});

describe('dismissal', () => {
  it('an outside press closes the menu', async () => {
    const page = await h.open('menu', { query: { modal: 'false' } });
    await page.click('#trigger');
    await see(page.locator('#popup')).toBeVisible();
    await page.mouse.click(700, 500);
    await see(page.locator('#popup')).toHaveCount(0);
    expect(await logOf(page)).toContain('open false outside-press');
  });

  it('a modal menu covers the page with an internal backdrop cut out around the trigger', async () => {
    const page = await h.open('menu');
    await page.click('#trigger');
    await see(page.locator('#popup')).toBeVisible();
    const internal = page.locator(
      'body > [data-base-ui-portal] > [role=presentation][data-base-ui-inert]:not(#backdrop)',
    );
    await see(internal).toHaveCount(1);
    await see(internal).toHaveCSS('position', 'fixed');
    expect(await internal.evaluate((el) => el.style.clipPath)).toContain('polygon');
    await page.mouse.click(700, 500);
    await see(page.locator('#popup')).toHaveCount(0);
  });

  it('the backdrop carries data-open while the menu is open', async () => {
    const page = await h.open('menu');
    await page.click('#trigger');
    await see(page.locator('#backdrop')).toHaveAttribute('data-open', '');
    await see(page.locator('#backdrop')).toHaveAttribute('role', 'presentation');
  });
});
