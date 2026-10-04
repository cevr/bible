// The lab's commands in a browser, over the probe film: ⌘K lists what is
// available, filters by what is typed and runs the chosen command; the `?`
// sheet rebinds a key, and the rebound key survives a reload; a cue's context
// menu (a right-click, or a touch held still) lists its commands and runs
// one, and a touch that moves (a drag) never opens it.

import { Effect } from 'effect';
import { describe, expect, it } from 'effect-bun-test';
import type { Tab } from '../../../src/lab/fixtures/tab.ts';
import { URL_T, labAt, openLab } from '../../../src/lab/fixtures/harness.ts';
import { attached, evaluates, textHas } from '../../../src/lab/fixtures/settled.ts';

/** The probe's first cue's bar on the strip. */
const RISE = '.lab-cue[data-cue="rise"]';

/** Fire `type` on the middle of `selector`'s box, as the browser fires a right-click's or a touch's. */
const fire = (page: Tab, selector: string, script: string) =>
  page.evaluate(`(() => {
    const el = document.querySelector('${selector}');
    const r = el.getBoundingClientRect();
    const x = r.left + r.width / 2, y = r.top + r.height / 2;
    ${script}
    return true;
  })()`);

const rightClick = (page: Tab, selector: string) =>
  fire(
    page,
    selector,
    // As a browser fires a right-click: the press (button 2), then the menu's event.
    `el.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, cancelable: true, button: 2, buttons: 2, pointerId: 1, isPrimary: true, clientX: x, clientY: y }));
     el.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, button: 2, clientX: x, clientY: y }));`,
  );

/** A touch on `selector`'s middle, moved `dx` px along, still held. */
const touch = (page: Tab, selector: string, dx: number) =>
  fire(
    page,
    selector,
    `const at = (cx) => [new Touch({ identifier: 1, target: el, clientX: cx, clientY: y })];
     el.dispatchEvent(new TouchEvent('touchstart', { bubbles: true, cancelable: true, touches: at(x) }));
     if (${dx} !== 0) el.dispatchEvent(new TouchEvent('touchmove', { bubbles: true, cancelable: true, touches: at(x + ${dx}) }));
     if (${dx} !== 0) el.dispatchEvent(new TouchEvent('touchend', { bubbles: true, cancelable: true, touches: [] }));`,
  );

const menuItems = `[...document.querySelectorAll('[data-role="context-menu"] [data-command]')].map((e) => e.dataset.command)`;

describe('the command menu', () => {
  it.live('lists the commands available, filters by every word typed, and runs one', () =>
    Effect.gen(function* () {
      const { page, errors } = yield* openLab([], { href: labAt(0.5) });
      yield* page.press('Control+k');
      yield* page.waitFor('[data-role="command-menu"] [data-command="play.scene-next"]');
      yield* page.fill('.lab-command-query', 'next scene');
      yield* evaluates(
        page,
        `[...document.querySelectorAll('[data-role="command-menu"] [data-command]')].map((e) => e.dataset.command)`,
        ['play.scene-next'],
      );
      yield* page.pressIn('.lab-command-query', 'Enter');
      yield* evaluates(page, 'location.pathname', '/films/probe/lab/two');
      expect(errors).toEqual([]);
    }).pipe(Effect.scoped),
  );
});

describe('the keys sheet', () => {
  it.live('rebinds a key, and the rebound key survives a reload', () =>
    Effect.gen(function* () {
      const { page } = yield* openLab([], { href: labAt(0.5) });
      yield* page.press('?');
      const row = '[data-role="keys-sheet"] [data-command="play.scene-next"]';
      yield* page.click(`${row} [data-act="rebind"]`);
      yield* page.pressIn(`${row} [data-act="press"]`, 'x');
      yield* textHas(page, `${row} .lab-keys-bound`, 'X');
      yield* page.press('Escape');
      yield* page.reload;
      yield* page.waitFor('.lab-panel');
      yield* page.press('x');
      yield* evaluates(page, 'location.pathname', '/films/probe/lab/two');
      yield* page.press('?');
      yield* page.click(`${row} [data-act="reset"]`);
      yield* textHas(page, `${row} .lab-keys-bound`, ']');
    }).pipe(Effect.scoped),
  );
});

describe("a cue's context menu", () => {
  it.live('a right-click lists its commands, and Select selects it', () =>
    Effect.gen(function* () {
      const { page } = yield* openLab([], { href: labAt(1) });
      yield* page.waitFor(RISE);
      yield* rightClick(page, RISE);
      yield* page.waitFor('[data-role="context-menu"] [data-command="edit.select"]');
      yield* evaluates(page, menuItems, ['edit.select', 'link.copy', 'app.command-menu']);
      yield* textHas(page, '[data-command="edit.select"]', 'Select cue rise in one');
      yield* page.click('[data-role="context-menu"] [data-command="edit.select"]');
      yield* evaluates(page, 'location.search', '?cue=rise');
      yield* attached(page, `${RISE}.selected`);
    }).pipe(Effect.scoped),
  );

  it.live('a touch held still opens it; a touch that moves does not', () =>
    Effect.gen(function* () {
      const { page } = yield* openLab([], { href: labAt(1) });
      yield* page.waitFor(RISE);
      yield* evaluates(page, URL_T, 1);
      yield* touch(page, RISE, 40);
      yield* page.clock.runFor(700);
      yield* evaluates(page, `document.querySelector('[data-role="context-menu"]') === null`, true);
      yield* touch(page, RISE, 0);
      yield* page.clock.runFor(700);
      yield* page.waitFor('[data-role="context-menu"] [data-command="link.copy"]');
      yield* evaluates(page, URL_T, 1);
    }).pipe(Effect.scoped),
  );
});
