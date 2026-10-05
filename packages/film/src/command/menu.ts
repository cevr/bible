// What ⌘K (the command menu), a context menu and the `?` sheet list, from
// the registry and the keymap alone (nothing is written twice): the menu,
// the commands available where the page is, matched by what was typed; a
// context menu, the commands available about the thing it opened on
// (`target.ts`), a stepped one also at ×10, a finger's Shift; the sheet,
// every command registered, by group, with its
// keys and how a phone reaches it; a chip, the commands it names that are
// available (`chipRows`); the view menu, the `View` commands available and
// the keys sheet (`viewRows`). Pure.

import { Array as Arr, Option } from 'effect';
import { type Command, type Invocation, labelOf } from './command.ts';
import type { Context } from './context.ts';
import { EVERYWHERE, type Target, targetOf } from './target.ts';

/**
 * One row of a menu: the command, its label where the page is, and the step
 * it runs at (`coarse` for a context menu's ×10 row: a finger's Shift).
 */
export interface MenuRow {
  readonly command: Command;
  readonly label: string;
  readonly step: Invocation['step'];
}

/** `command`'s row at its own step. */
const rowOf = (command: Command, ctx: Context): MenuRow => ({
  command,
  label: labelOf(command, ctx),
  step: 'normal',
});

/**
 * A row's identity in a rendered list: its command's id, and its step when
 * not the normal one. A menu's rows are
 * made again whenever what they read moves (a command's `when` and its label
 * read the player, so each frame a film plays; a command registered again);
 * a list keyed by it keeps each row's element, so a press on a row and its
 * release are on one element, and the click is that row's.
 */
export const rowKey = (row: MenuRow): string =>
  [row.command.id, ...[row.step].filter((s) => s !== 'normal')].join(' ');

/** The chord that runs `row` from its command's `key`: a coarse row's with Shift, as the keymap steps it. */
export const rowChord = (row: MenuRow, key: string): string =>
  [...['shift'].filter(() => row.step === 'coarse'), key].join('+');

/** Whether every word of `query` is in `text`, ignoring case. */
const matches = (query: string, text: string): boolean => {
  const said = text.toLowerCase();
  return query
    .toLowerCase()
    .split(/\s+/)
    .filter((word) => word !== '')
    .every((word) => said.includes(word));
};

/** Whether a command is found only by typing (`Command.typed`). */
const isTyped = (command: Command): boolean => command.typed === true;

/**
 * The command menu's rows: the commands of `available` (those available in
 * `ctx`) that every word typed names (in the label, the group or the id),
 * grouped in the order their groups first come. A command found only by
 * typing (a Go to entry) is a row once a word is typed.
 */
export const menuRows = (
  available: ReadonlyArray<Command>,
  ctx: Context,
  query: string,
): ReadonlyArray<MenuRow> => {
  const typing = query.trim() !== '';
  return byGroup(available.filter((command) => typing || !isTyped(command)))
    .flatMap(([, commands]) => commands)
    .map((command) => rowOf(command, ctx))
    .filter((row) => matches(query, `${row.label} ${row.command.group} ${row.command.id}`));
};

/** The `?` sheet's rows: every command registered but those found only by typing, by group. */
export const sheetRows = (
  all: ReadonlyArray<Command>,
): ReadonlyArray<readonly [string, ReadonlyArray<Command>]> =>
  byGroup(all.filter((command) => !isTyped(command)));

/**
 * A chip's menu rows (the rate chip, the loop chip): the commands named by
 * `ids` that are available in `ctx`, in the order `ids` gives (the rate the
 * transport plays at now is not one of them: the chip says it).
 */
export const chipRows = (
  available: ReadonlyArray<Command>,
  ctx: Context,
  ids: ReadonlyArray<string>,
): ReadonlyArray<MenuRow> =>
  ids.flatMap((id) =>
    available.filter((command) => command.id === id).map((command) => rowOf(command, ctx)),
  );

/** The group of the commands the view menu (`⋯`) lists. */
const VIEW = 'View';

/**
 * The view menu's rows (`⋯`): the commands of `available` (those available
 * in `ctx`) of the `View` group, then `last` (the keys sheet), each where
 * the page is.
 */
export const viewRows = (
  available: ReadonlyArray<Command>,
  ctx: Context,
  last: ReadonlyArray<Command>,
): ReadonlyArray<MenuRow> =>
  [...available.filter((c) => c.group === VIEW), ...last].map((command) => rowOf(command, ctx));

/**
 * A stepped command's rows in a context menu: its step, then its coarse
 * step (Shift's, ×10), since a finger has no Shift. ⌘K and the keys keep the
 * one row: there Shift is at hand.
 */
const steppedRows = (command: Command, ctx: Context): ReadonlyArray<MenuRow> => {
  const row = rowOf(command, ctx);
  return [
    row,
    ...[{ ...row, label: `${row.label} ×10`, step: 'coarse' as const }].filter(
      () => command.stepped === true,
    ),
  ];
};

/**
 * A context menu's rows, by group: the commands of `available` (those
 * available in `ctx`, whose selection is the thing the menu opened on) about
 * that thing, or about the page where it opened on nothing; the thing's own
 * first, then those every menu offers. A stepped command has a ×10 row
 * after its own (`steppedRows`).
 */
export const contextRows = (
  available: ReadonlyArray<Command>,
  ctx: Context,
): ReadonlyArray<readonly [string, ReadonlyArray<MenuRow>]> => {
  const target: Target = targetOf(Option.fromUndefinedOr(ctx.selection[0]));
  const targetsOf = (c: Command): ReadonlyArray<Target> =>
    Option.getOrElse(Option.fromUndefinedOr(c.about), () => []);
  const about = available.filter((c) => targetsOf(c).includes(target));
  // The thing's own verbs first; what every menu offers (Copy link, the command menu) after them.
  const everywhere = (c: Command) => EVERYWHERE.every((t) => targetsOf(c).includes(t));
  return byGroup([...about.filter((c) => !everywhere(c)), ...about.filter(everywhere)]).map(
    ([group, commands]) =>
      [group, commands.flatMap((command) => steppedRows(command, ctx))] as const,
  );
};

/** `commands` by group, each group where its first command comes, in registration order within it. */
export const byGroup = (
  commands: ReadonlyArray<Command>,
): ReadonlyArray<readonly [string, ReadonlyArray<Command>]> =>
  Arr.dedupe(commands.map((c) => c.group)).map(
    (group) => [group, commands.filter((c) => c.group === group)] as const,
  );
