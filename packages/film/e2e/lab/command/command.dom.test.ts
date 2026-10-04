// The lab's commands in a browser, over the probe film: ⌘K lists what is
// available, filters by what is typed and runs the chosen command; the `?`
// sheet rebinds a key, and the rebound key survives a reload; a cue's context
// menu (a right-click, or a touch held still) lists its commands and runs
// one, and a touch that moves (a drag) never opens it; `/` opens ⌘K to Go to
// a scene or a cue by its name; a row pressed while the film plays, in ⌘K
// or a cue's menu, runs.

import { Effect } from 'effect';
import { describe, expect, it } from 'effect-bun-test';
import {
  MENU_ITEMS,
  closeCommandMenu,
  rightClick,
  touch,
} from '../../../src/lab/fixtures/gestures.ts';
import { URL_T, labAt, openLab } from '../../../src/lab/fixtures/harness.ts';
import { attached, evaluates, textHas, textIs } from '../../../src/lab/fixtures/settled.ts';

/** The probe's first cue's bar on the strip. */
const RISE = '.lab-cue[data-cue="rise"]';

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
      yield* evaluates(page, MENU_ITEMS, [
        'edit.select',
        'edit.nudge-right',
        'edit.nudge-left',
        'edit.nudge-up',
        'edit.nudge-down',
        'edit.cue-next',
        'link.copy',
        'app.command-menu',
      ]);
      yield* textHas(page, '[data-command="edit.select"]', 'Select cue rise in one');
      yield* page.click('[data-role="context-menu"] [data-command="edit.select"]');
      yield* evaluates(page, 'location.search', '?cue=rise');
      yield* attached(page, `${RISE}.selected`);
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

  it.live('a touch held still opens it; a touch that moves does not', () =>
    Effect.gen(function* () {
      const { page } = yield* openLab([], { href: labAt(1) });
      yield* page.waitFor(RISE);
      yield* evaluates(page, URL_T, 1);
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
    }).pipe(Effect.scoped),
  );
});
