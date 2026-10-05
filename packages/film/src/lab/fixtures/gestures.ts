// The gestures the browser tests make on a page as the browser fires them:
// a right-click (the press, then the menu's event) and a finger held or
// moved (the browser's own touch input), each on the middle of an element's box; the commands an open
// context menu lists; and the command menu (⌘K) opened on what is typed,
// and closed. Shared by every page's tests.

import { Effect } from 'effect';
import { countIs, evaluates, waitFor } from './settled.ts';
import type { Tab } from './tab.ts';

/**
 * Run `script` with `el` (the element at `selector`, once it is shown) and
 * `x`, `y` (its box's middle) in scope: its answer is what the script
 * returns. A gesture waits for what it presses, as a hand does: an element a
 * load paints later (home's film cards) is never pressed before it is there.
 */
const fire = <A>(page: Tab, selector: string, script: string) =>
  Effect.andThen(
    waitFor(page, selector),
    page.evaluate<A>(`(() => {
    const el = document.querySelector('${selector}');
    const r = el.getBoundingClientRect();
    const x = r.left + r.width / 2, y = r.top + r.height / 2;
    ${script}
  })()`),
  );

/**
 * A right-click on `selector`'s middle: the press (button 2), then the menu's
 * event. Its answer is whether the browser's own menu would show: nothing
 * prevented the event.
 */
export const rightClick = (page: Tab, selector: string) =>
  fire<boolean>(
    page,
    selector,
    `el.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, cancelable: true, button: 2, buttons: 2, pointerId: 1, isPrimary: true, clientX: x, clientY: y }));
     return el.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, button: 2, clientX: x, clientY: y }));`,
  );

/**
 * A finger put down on `selector`'s middle and moved `dx` px along, a pixel
 * or two a move, and still held: the browser's own touch input, so the page
 * hears its touch events and the pointer events it makes (a drag follows
 * it). Lift it with `page.finger.up`.
 */
export const touch = (page: Tab, selector: string, dx: number) =>
  Effect.gen(function* () {
    const at = yield* page.box(selector);
    const x = at.x + at.width / 2;
    const y = at.y + at.height / 2;
    yield* page.finger.down(x, y);
    if (dx !== 0) yield* page.finger.move(x + dx, y, Math.ceil(Math.abs(dx) / 2));
  });

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
