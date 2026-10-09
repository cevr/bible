// The lab's commands in a browser, over the probe film: ⌘K lists what is
// available, filters by what is typed and runs the chosen command; the `?`
// sheet rebinds a key, and the rebound key survives a reload, and ends on
// the bar's legend; a right-click
// on no thing opens the page's own context menu; a cue's context
// menu (a right-click, or a touch held still) lists its commands and runs
// one; a touch that moves (a drag) never opens it, and a touch that opened
// it starts no drag; a field inside a thing keeps the browser's own menu;
// `/` opens ⌘K to Go to a scene or a cue by its name; a row pressed while
// the film plays, in ⌘K or a cue's menu, runs.

import { Effect } from 'effect';
import { describe, expect, it, test } from 'effect-bun-test';
import {
  MENU_ITEMS,
  closeCommandMenu,
  rightClick,
  touch,
} from '../../../src/lab/fixtures/gestures.ts';
import { URL_T, labAt, openLab } from '../../../src/lab/fixtures/harness.ts';
import { attached, evaluates, textHas, textIs } from '../../../src/lab/fixtures/settled.ts';
import { jsonOf } from '../../../src/lab/fixtures/tab.ts';

/** The probe's first cue's bar on the strip. */
const RISE = '.lab-cue[data-cue="rise"]';

/** Where that bar sits on the strip, as the page reads it (a drag's preview moves it). */
const BAR_LEFT = `document.querySelector('${RISE}').style.left`;

/** A Go to entry, wherever it is listed. */
const GO_ENTRY = '[data-command^="go."]';

/** The ids of the Go to entries the command menu lists. */
const GO_ENTRIES = `[...document.querySelectorAll('[data-role="command-menu"] ${GO_ENTRY}')].map((e) => e.dataset.command)`;

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

  it.live('/ opens it to Go to: a scene or a cue found by its name, once a word is typed', () =>
    Effect.gen(function* () {
      const { page, errors } = yield* openLab([], { href: labAt(0.5) });
      yield* page.waitFor(RISE);
      yield* page.press('/');
      yield* page.waitFor('[data-role="command-menu"] [data-command="play.scene-next"]');
      // Blank, the menu lists commands, never a Go to entry.
      yield* evaluates(page, `document.querySelectorAll('${GO_ENTRY}').length`, 0);
      yield* page.fill('.lab-command-query', 'go to scene two');
      yield* evaluates(page, GO_ENTRIES, ['go.scene.two']);
      yield* page.pressIn('.lab-command-query', 'Enter');
      yield* evaluates(page, 'location.pathname', '/films/probe/lab/two');
      yield* closeCommandMenu(page);
      yield* page.press('/');
      yield* page.fill('.lab-command-query', 'go to scene one');
      yield* page.pressIn('.lab-command-query', 'Enter');
      yield* evaluates(page, 'location.pathname', '/films/probe/lab/one');
      yield* closeCommandMenu(page);
      yield* page.waitFor(RISE);
      yield* page.press('/');
      yield* page.fill('.lab-command-query', 'go to cue fall');
      yield* evaluates(page, GO_ENTRIES, ['go.cue.one.fall']);
      yield* page.pressIn('.lab-command-query', 'Enter');
      yield* evaluates(page, 'location.search', '?cue=fall');
      // The `?` sheet lists no Go to entry.
      yield* closeCommandMenu(page);
      yield* page.press('?');
      yield* page.waitFor('[data-role="keys-sheet"] [data-command="play.scene-next"]');
      yield* evaluates(page, `document.querySelectorAll('${GO_ENTRY}').length`, 0);
      expect(errors).toEqual([]);
    }).pipe(Effect.scoped),
  );

  it.live('a row pressed while the film plays is the row released on, and runs', () =>
    Effect.gen(function* () {
      const { page } = yield* openLab([], { href: labAt(0.5) });
      yield* page.waitFor(RISE);
      yield* page.click('[data-act="play"]');
      yield* textIs(page, '[data-act="play"]', '❚❚');
      yield* page.press('/');
      yield* page.fill('.lab-command-query', 'go to cue fall');
      const at = yield* page.box('[data-role="command-menu"] [data-command="go.cue.one.fall"]');
      yield* page.mouse.move(at.x + at.width / 2, at.y + at.height / 2);
      // Frames play between the press and the release, as a hand's click takes them.
      yield* page.mouse.down;
      yield* page.clock.runFor(200);
      yield* page.mouse.up;
      yield* evaluates(page, 'location.search', '?cue=fall');
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
      yield* page.waitFor('.lab-panel[data-staged="true"]');
      yield* page.press('x');
      yield* evaluates(page, 'location.pathname', '/films/probe/lab/two');
      yield* page.press('?');
      yield* page.click(`${row} [data-act="reset"]`);
      yield* textHas(page, `${row} .lab-keys-bound`, ']');
    }).pipe(Effect.scoped),
  );

  it.live("a key rebound here is the one the transport's step buttons name", () =>
    Effect.gen(function* () {
      const { page } = yield* openLab([], { href: labAt(0.5) });
      const button = '.bar [data-act="play.frame-next"]';
      yield* evaluates(page, `document.querySelector('${button}').title`, 'Next frame (→)');
      yield* page.press('?');
      const row = '[data-role="keys-sheet"] [data-command="play.frame-next"]';
      yield* page.click(`${row} [data-act="rebind"]`);
      yield* page.pressIn(`${row} [data-act="press"]`, 'x');
      yield* textHas(page, `${row} .lab-keys-bound`, 'X');
      yield* evaluates(page, `document.querySelector('${button}').title`, 'Next frame (X)');
    }).pipe(Effect.scoped),
  );

  it.live("ends on the bar's legend: the stripes, and each tick beside its swatch", () =>
    Effect.gen(function* () {
      const { page, errors } = yield* openLab([], { href: labAt(0.5) });
      yield* page.press('?');
      const legend = '[data-role="keys-sheet"] [data-role="keys-legend"]';
      yield* textHas(page, legend, 'striped = narration estimated, not recorded');
      yield* textHas(page, legend, 'music act');
      // Each swatch is drawn in its tick's look (`player.css`), as on the bar.
      yield* evaluates(
        page,
        `[...document.querySelectorAll('${legend} i')].map((i) => i.className + ':' + (i.getBoundingClientRect().width > 0)).join(' ')`,
        'k-mark:true k-cue:true k-effect:true k-act:true',
      );
      // The bar's own legend stays hidden at rest.
      yield* evaluates(page, "document.querySelector('.bar .keys').hidden", true);
      expect(errors).toEqual([]);
    }).pipe(Effect.scoped),
  );
});

describe("the page's context menu", () => {
  it.live("a right-click on no thing lists the page's commands, and none of a thing's", () =>
    Effect.gen(function* () {
      const { page } = yield* openLab([], { href: labAt(1) });
      yield* page.waitFor(RISE);
      expect(yield* rightClick(page, '.lab-panel')).toBe(false);
      yield* page.waitFor('[data-role="context-menu"] [data-command="view.legend"]');
      yield* attached(page, '[data-role="context-menu"] [data-command="motion.loop-scene"]');
      yield* evaluates(
        page,
        `document.querySelector('[data-role="context-menu"] [data-command="edit.select"]') === null`,
        true,
      );
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
      // Each nudge twice: its step, and its ×10 (Shift's step, a finger's way to it).
      yield* evaluates(page, MENU_ITEMS, [
        'edit.select',
        'edit.nudge-right',
        'edit.nudge-right',
        'edit.nudge-left',
        'edit.nudge-left',
        'edit.nudge-up',
        'edit.nudge-up',
        'edit.nudge-down',
        'edit.nudge-down',
        'edit.cue-next',
        'lab.source.cue',
        'link.copy',
        'app.command-menu',
      ]);
      yield* textHas(page, '[data-command="edit.select"]', 'Select cue rise in one');
      yield* page.click('[data-role="context-menu"] [data-command="edit.select"]');
      yield* evaluates(page, 'location.search', '?cue=rise');
      yield* attached(page, `${RISE}.selected`);
    }).pipe(Effect.scoped),
  );

  it.live(
    "a right-click on a field inside a thing keeps the browser's own menu, and opens no menu of ours",
    () =>
      Effect.gen(function* () {
        const { page } = yield* openLab([], {
          href: labAt(1, { selection: { _tag: 'Knob', scene: 'one', name: 'size' } }),
        });
        const field = '.lab-knob[data-knob="size"] input';
        yield* page.waitFor(field);
        // The thing itself (its row, off the field) still opens ours, and the browser's stays shut.
        expect(yield* rightClick(page, '.lab-knob[data-knob="size"] .lab-edit-key')).toBe(false);
        yield* page.waitFor('[data-role="context-menu"] [data-command="link.copy"]');
        yield* page.press('Escape');
        yield* evaluates(
          page,
          `document.querySelector('[data-role="context-menu"]') === null`,
          true,
        );
        expect(yield* rightClick(page, field)).toBe(true);
        yield* page.clock.runFor(100);
        yield* evaluates(
          page,
          `document.querySelector('[data-role="context-menu"]') === null`,
          true,
        );
      }).pipe(Effect.scoped),
  );

  it.live('a row pressed while the film plays is the row released on, and runs', () =>
    Effect.gen(function* () {
      const { page } = yield* openLab([], { href: labAt(1) });
      yield* page.waitFor(RISE);
      yield* page.click('[data-act="play"]');
      yield* textIs(page, '[data-act="play"]', '❚❚');
      yield* rightClick(page, RISE);
      const at = yield* page.box('[data-role="context-menu"] [data-command="edit.select"]');
      yield* page.mouse.move(at.x + at.width / 2, at.y + at.height / 2);
      // Frames play between the press and the release, as a hand's click takes them.
      yield* page.mouse.down;
      yield* page.clock.runFor(200);
      yield* page.mouse.up;
      yield* evaluates(page, 'location.search', '?cue=rise');
    }).pipe(Effect.scoped),
  );

  // Serial, each case here: a finger's touches (`film/touches-serial`).
  test.serial('a touch held still opens it; a touch that moves does not', () =>
    Effect.gen(function* () {
      const { page } = yield* openLab([], { href: labAt(1) });
      yield* page.waitFor(RISE);
      yield* evaluates(page, URL_T, 1);
      // The clock held: the long press's delay passes only as the test runs it on, however slow the gesture.
      yield* page.clock.hold;
      // The browser's own finger (its touch and pointer events), still held past
      // the long press: the move, never a lift, keeps the menu shut.
      yield* touch(page, RISE, 40);
      yield* page.clock.runFor(700);
      yield* evaluates(page, `document.querySelector('[data-role="context-menu"]') === null`, true);
      yield* page.finger.up;
      yield* touch(page, RISE, 0);
      yield* page.clock.runFor(700);
      yield* page.waitFor('[data-role="context-menu"] [data-command="link.copy"]');
      yield* evaluates(page, URL_T, 1);
    }).pipe(Effect.scoped, Effect.runPromise),
  );

  test.serial(
    'a finger that drags a cue owns the press: the bar follows it, and no menu opens',
    () =>
      Effect.gen(function* () {
        const { page } = yield* openLab([], { href: labAt(1) });
        yield* page.waitFor(RISE);
        const before = yield* page.evaluate<string>(BAR_LEFT);
        const at = yield* page.box(RISE);
        const x = at.x + at.width / 2;
        const y = at.y + at.height / 2;
        yield* page.clock.hold;
        // Past the press's slop, short of the browser's own: the drag has it.
        yield* page.finger.down(x, y);
        yield* page.finger.move(x + 14, y, 7);
        yield* page.clock.runFor(700);
        yield* evaluates(page, `${BAR_LEFT} !== ${jsonOf(before)}`, true);
        yield* evaluates(
          page,
          `document.querySelector('[data-role="context-menu"]') === null`,
          true,
        );
        // Further, past the browser's slop: still the drag's, never a pan's.
        const near = yield* page.evaluate<string>(BAR_LEFT);
        yield* page.finger.move(x + 40, y, 13);
        yield* page.clock.runFor(100);
        yield* evaluates(page, `${BAR_LEFT} !== ${jsonOf(near)}`, true);
        yield* evaluates(
          page,
          `document.querySelector('[data-role="context-menu"]') === null`,
          true,
        );
        yield* page.finger.up;
      }).pipe(Effect.scoped, Effect.runPromise),
  );

  test.serial(
    'a finger held still owns the press as the menu: moved once it opens, the bar stays',
    () =>
      Effect.gen(function* () {
        const { page } = yield* openLab([], { href: labAt(1) });
        yield* page.waitFor(RISE);
        const before = yield* page.evaluate<string>(BAR_LEFT);
        yield* page.clock.hold;
        yield* touch(page, RISE, 0);
        yield* page.clock.runFor(700);
        yield* page.waitFor('[data-role="context-menu"] [data-command="link.copy"]');
        const at = yield* page.box(RISE);
        yield* page.finger.move(at.x + at.width / 2 + 40, at.y + at.height / 2, 20);
        yield* page.clock.runFor(100);
        yield* evaluates(page, BAR_LEFT, before);
        yield* page.finger.up;
      }).pipe(Effect.scoped, Effect.runPromise),
  );
});
