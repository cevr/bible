// The gestures the browser tests make on a page as the browser fires them:
// a right-click (the press, then the menu's event) and a touch held or
// moved, each on the middle of an element's box; the commands an open
// context menu lists; and the command menu (⌘K) opened on what is typed,
// and closed. Shared by every page's tests.

import { Effect } from 'effect';
import { countIs, evaluates, waitFor } from './settled.ts';
import type { Tab } from './tab.ts';

/** Run `script` with `el` (the element at `selector`) and `x`, `y` (its box's middle) in scope. */
const fire = (page: Tab, selector: string, script: string) =>
  page.evaluate(`(() => {
    const el = document.querySelector('${selector}');
    const r = el.getBoundingClientRect();
    const x = r.left + r.width / 2, y = r.top + r.height / 2;
    ${script}
    return true;
  })()`);

/** A right-click on `selector`'s middle: the press (button 2), then the menu's event. */
export const rightClick = (page: Tab, selector: string) =>
  fire(
    page,
    selector,
    `el.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, cancelable: true, button: 2, buttons: 2, pointerId: 1, isPrimary: true, clientX: x, clientY: y }));
     el.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, button: 2, clientX: x, clientY: y }));`,
  );

/** A touch on `selector`'s middle, moved `dx` px along, still held. */
export const touch = (page: Tab, selector: string, dx: number) =>
  fire(
    page,
    selector,
    `const at = (cx) => [new Touch({ identifier: 1, target: el, clientX: cx, clientY: y })];
     el.dispatchEvent(new TouchEvent('touchstart', { bubbles: true, cancelable: true, touches: at(x) }));
     if (${dx} !== 0) el.dispatchEvent(new TouchEvent('touchmove', { bubbles: true, cancelable: true, touches: at(x + ${dx}) }));
     if (${dx} !== 0) el.dispatchEvent(new TouchEvent('touchend', { bubbles: true, cancelable: true, touches: [] }));`,
  );

/** The ids of the commands the open context menu lists, in order (a script `evaluates` reads). */
export const MENU_ITEMS = `[...document.querySelectorAll('[data-role="context-menu"] [data-command]')].map((e) => e.dataset.command)`;

/** The command menu's (⌘K) entry for command `id`. */
export const menuEntry = (id: string) => `[data-role="command-menu"] [data-command="${id}"]`;

/** Open the command menu (⌘K) and type `query` into it. */
export const openCommandMenu = (page: Tab, query: string) =>
  Effect.gen(function* () {
    yield* page.press('Control+k');
    yield* waitFor(page, '.lab-command-query');
    yield* page.fill('.lab-command-query', query);
  });

/** Close the command menu, and wait until it is gone: until then it holds the keys. */
export const closeCommandMenu = (page: Tab) =>
  Effect.andThen(page.press('Escape'), countIs(page, '[data-role="command-menu"]', 0));

/** Whether the command menu, as `query` filters it, offers command `id`; closed after. */
export const menuOffers = (page: Tab, query: string, id: string, want: boolean) =>
  Effect.gen(function* () {
    yield* openCommandMenu(page, query);
    yield* evaluates(page, `document.querySelector('${menuEntry(id)}') !== null`, want);
    yield* closeCommandMenu(page);
  });
