// A page's command registry, read and run from ⌘K as the viewer would, for
// the e2e suites that walk every command a page offers: the ring's property
// (`focus-follows-input.dom.test.ts`) and the floating roots' guard
// (`semantics.dom.test.ts`).

import { Effect, Option } from 'effect';
import { menuEntry } from '../../src/lab/fixtures/gestures.ts';
import { until, waitFor } from '../../src/lab/fixtures/settled.ts';
import type { Tab } from '../../src/lab/fixtures/tab.ts';

/** How a path was asked for. */
export type Input = 'key' | 'pointer';

export const COMMAND_MENU = '[data-role="command-menu"]';

/** Every command ⌘K lists on the page now, a query every id matches (`.`) listing the typed ones too. */
export const registry = (page: Tab) =>
  Effect.gen(function* () {
    yield* page.press('Control+k');
    yield* waitFor(page, '.lab-command-query');
    yield* page.fill('.lab-command-query', '.');
    yield* waitFor(page, `${COMMAND_MENU} [data-command]`);
    const ids = yield* page.evaluate<ReadonlyArray<string>>(
      `[...new Set([...document.querySelectorAll('${COMMAND_MENU} [data-command]')].map((e) => e.dataset.command))]`,
    );
    yield* page.press('Escape');
    yield* until(page, `document.querySelector('${COMMAND_MENU}') === null`);
    return ids;
  });

/** One per kind of thing a Go to goes to, and one per microphone: entries that share one `go`. */
const SAMPLED = /^(go\.[^.]+\.|studio\.mic\.)/;

/** The commands of `ids` worth running: each, but one of a family that shares its run. */
export const sampled = (ids: ReadonlyArray<string>): ReadonlyArray<string> => {
  const seen = new Set<string>();
  return ids.filter((id) => {
    const family = Option.match(Option.fromNullishOr(SAMPLED.exec(id)), {
      onNone: () => id,
      onSome: ([prefix]) => prefix,
    });
    if (seen.has(family)) return false;
    seen.add(family);
    return true;
  });
};

/**
 * Run `id` from ⌘K by `input`: by the keys, Control+k, its id typed, the arrows down to its
 * row and Enter; by the pointer, the header's Go to… clicked, its id typed, the row clicked.
 * Done once the menu has gone; answers whether ⌘K offered it (a command an earlier run made
 * unavailable, a take now recording, is not: no run).
 */
export const runFromMenu = (page: Tab, id: string, input: Input) =>
  Effect.gen(function* () {
    const row = menuEntry(id);
    if (input === 'key') yield* page.press('Control+k');
    else yield* page.click('.sh-header [data-act="search"]');
    yield* waitFor(page, '.lab-command-query');
    yield* page.fill('.lab-command-query', id);
    yield* until(
      page,
      `document.querySelector('${COMMAND_MENU} [data-command]') !== null || document.querySelector('.lab-command-none') !== null`,
    );
    if (!(yield* page.evaluate<boolean>(`document.querySelector('${row}') !== null`))) {
      yield* page.press('Escape');
      yield* until(page, `document.querySelector('${COMMAND_MENU}') === null`);
      return false;
    }
    if (input === 'key') {
      const at = yield* page.evaluate<number>(
        `[...document.querySelectorAll('${COMMAND_MENU} [data-command]')].findIndex((e) => e.dataset.command === '${id}')`,
      );
      for (let i = 0; i < at; i++) yield* page.press('ArrowDown');
      yield* until(
        page,
        `document.getElementById(document.querySelector('.lab-command-query').getAttribute('aria-activedescendant'))?.dataset.command === '${id}'`,
      );
      yield* page.press('Enter');
    } else yield* page.click(row);
    yield* until(page, `document.querySelector('${COMMAND_MENU}') === null`);
    return true;
  });

/** A floating root, known by its role, as the page's commands know one (`command/context.ts`). */
export const FLOATING = '[role=dialog], [role=alertdialog], [role=menu], [role=listbox]';

/** Whether a floating root a command left is open (a receipt is not one: it waits beside the page). */
export const LEFT_OPEN = `[...document.querySelectorAll('${FLOATING}')].some((e) => !e.matches('.lab-receipt') && e.checkVisibility())`;
