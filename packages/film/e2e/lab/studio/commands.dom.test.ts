// The studio's commands in a browser, over the probe film: ⌘K lists what is
// available, filters by every word typed and runs the chosen command, and a
// query no command matches names no row and says so beside the list; a row
// pressed while the film plays is the row released on, and runs; the `?`
// sheet lists a command with the key the transport's key names, and that key
// runs it; a right-click on no thing opens the page's own
// context menu, and on a clip the clip's; on a phone a touch held still on a
// clip opens its menu, and a touch that moves does not.

import { Effect } from 'effect';
import { describe, expect, it } from 'effect-bun-test';
import { pageHref } from '../../../src/core/api.ts';
import { MENU_ITEMS, rightClick, touch } from '../../../src/lab/fixtures/gestures.ts';
import { DESK, PHONE, type Viewport, openPlayer } from '../../../src/lab/fixtures/harness.ts';
import { PROBE } from '../../../src/lab/fixtures/probe-film.ts';
import {
  attributeIs,
  countIs,
  evaluates,
  textHas,
  textIs,
  waitFor,
} from '../../../src/lab/fixtures/settled.ts';

const SLOW = 30_000;

/** The studio's first clip drawn: the timeline is read and laid out. */
const READY = '.st-timeline .st-clip';

const MENU = '[data-role="command-menu"]';
const CONTEXT = '[data-role="context-menu"]';
const PLAY = '.st-key[data-act="play.toggle"]';

/** Script clip `beat`. */
const clip = (beat: string) => `.st-lane[data-track="script"] .st-clip[data-beat="${beat}"]`;

/** The ids of the rows the command menu lists. */
const ROWS = `[...document.querySelectorAll('${MENU} [data-command]')].map((e) => e.dataset.command)`;

/** The studio at its start on `viewport`, its timeline drawn. */
const studioAt = (viewport: Viewport) =>
  openPlayer({ href: pageHref.studio(PROBE), viewport }, READY);

describe("the studio's command menu", () => {
  it.live(
    'lists the commands available, filters by every word typed, and runs one',
    () =>
      Effect.gen(function* () {
        const { page, errors } = yield* studioAt(DESK);
        yield* page.press('Control+k');
        yield* waitFor(page, `${MENU} [data-command="studio.on"]`);
        yield* page.fill('.lab-command-query', 'next beat');
        yield* evaluates(page, ROWS, ['studio.on']);
        // The query names the row it would run, one that exists.
        yield* attributeIs(page, '.lab-command-query', 'aria-activedescendant', 'lab-command-0');
        yield* attributeIs(page, '#lab-command-0', 'data-command', 'studio.on');
        yield* page.pressIn('.lab-command-query', 'Enter');
        yield* textIs(page, '.st-tc', /^0:04\.7/);
        expect(errors).toEqual([]);
      }).pipe(Effect.scoped),
    SLOW,
  );

  it.live(
    'a query no command matches names no row, even after the arrows, and says so beside the list, not in it',
    () =>
      Effect.gen(function* () {
        const { page, errors } = yield* studioAt(DESK);
        yield* page.press('Control+k');
        yield* waitFor(page, `${MENU} [data-command]`);
        yield* page.fill('.lab-command-query', 'zzzz no such command');
        yield* textIs(page, `${MENU} .lab-command-none`, 'No command matches.');
        // The listbox holds options alone; the query points at no row, nor does an arrow make it.
        yield* countIs(page, '[role="listbox"] > :not([role="option"])', 0);
        const names =
          "document.querySelector('.lab-command-query').hasAttribute('aria-activedescendant')";
        yield* evaluates(page, names, false);
        yield* page.pressIn('.lab-command-query', 'ArrowDown');
        yield* evaluates(page, names, false);
        yield* page.pressIn('.lab-command-query', 'ArrowUp');
        yield* evaluates(page, names, false);
        expect(errors).toEqual([]);
      }).pipe(Effect.scoped),
    SLOW,
  );

  it.live(
    'a row pressed while the film plays is the row released on, and runs',
    () =>
      Effect.gen(function* () {
        const { page, errors } = yield* studioAt(DESK);
        yield* page.click(PLAY);
        yield* attributeIs(page, PLAY, 'aria-pressed', 'true');
        yield* page.press('Control+k');
        yield* page.fill('.lab-command-query', 'to the end');
        const at = yield* page.box(`${MENU} [data-command="studio.end"]`);
        yield* page.mouse.move(at.x + at.width / 2, at.y + at.height / 2);
        // Frames play between the press and the release, as a hand's click takes them.
        yield* page.mouse.down;
        yield* page.clock.runFor(200);
        yield* page.mouse.up;
        yield* textIs(page, '.st-tc', /^0:12\.3/);
        expect(errors).toEqual([]);
      }).pipe(Effect.scoped),
    SLOW,
  );
});

describe("the studio's keys sheet", () => {
  it.live(
    "lists a command with the key the transport's key names, and the key runs it",
    () =>
      Effect.gen(function* () {
        const { page, errors } = yield* studioAt(DESK);
        const key = '.st-key[data-act="studio.on"]';
        yield* evaluates(page, `document.querySelector('${key}').title`, 'Next beat (↓)');
        yield* page.press('ArrowDown');
        yield* textIs(page, '.st-tc', /^0:04\.7/);
        yield* page.press('?');
        const row = '[data-role="keys-sheet"] [data-command="studio.on"]';
        yield* textHas(page, `${row} .lab-keys-bound`, '↓');
        yield* countIs(page, '[data-role="keys-sheet"] button', 0);
        expect(errors).toEqual([]);
      }).pipe(Effect.scoped),
    SLOW,
  );
});

describe("the studio's context menus", () => {
  it.live(
    "a right-click on no thing lists the page's commands, and none of a clip's",
    () =>
      Effect.gen(function* () {
        const { page } = yield* studioAt(DESK);
        expect(yield* rightClick(page, '.st-transport')).toBe(false);
        yield* waitFor(page, `${CONTEXT} [data-command="app.command-menu"]`);
        yield* countIs(page, `${CONTEXT} [data-command="studio.split"]`, 0);
        yield* countIs(page, `${CONTEXT} [data-command="studio.move-before"]`, 0);
      }).pipe(Effect.scoped),
    SLOW,
  );

  it.live(
    "a right-click on a clip lists the clip's commands, and Open opens it",
    () =>
      Effect.gen(function* () {
        const { page, errors } = yield* studioAt(DESK);
        yield* rightClick(page, clip('two'));
        yield* waitFor(page, `${CONTEXT} [data-command="studio.open"]`);
        yield* evaluates(page, MENU_ITEMS, [
          'studio.open',
          'studio.note',
          'studio.move-before',
          'link.copy',
          'app.command-menu',
        ]);
        yield* page.click(`${CONTEXT} [data-command="studio.open"]`);
        yield* waitFor(page, '.st-pane[data-beat="two"]');
        expect(errors).toEqual([]);
      }).pipe(Effect.scoped),
    SLOW,
  );

  // Serial: a finger's touches (`film/touches-serial`).
  it.scopedLive.serial(
    'on a phone, a touch held still on a clip opens its menu; one that moves does not',
    () =>
      Effect.gen(function* () {
        const { page } = yield* studioAt(PHONE);
        // The clock held: the long press's delay passes only as the test runs it on, however slow the gesture.
        yield* page.clock.hold;
        yield* touch(page, clip('two'), 40);
        yield* page.clock.runFor(700);
        yield* countIs(page, CONTEXT, 0);
        yield* page.finger.up;
        yield* touch(page, clip('two'), 0);
        yield* page.clock.runFor(700);
        yield* waitFor(page, `${CONTEXT} [data-command="studio.move-before"]`);
        yield* page.finger.up;
      }),
  );
});
