// What ⌘K (the command menu), a context menu and the `?` sheet list, from
// the registry and the keymap alone (nothing is written twice): the menu,
// the commands available where the page is, matched by what was typed; a
// context menu, the commands available about the thing it opened on
// (`target.ts`); the sheet, every command registered, by group, with its
// keys and how a phone reaches it. Pure.

import { Array as Arr, Option } from 'effect';
import { type Command, labelOf } from './command.ts';
import type { Context } from './context.ts';
import { EVERYWHERE, type Target, targetOf } from './target.ts';

/** One row of the command menu: the command, and its label where the page is. */
export interface MenuRow {
  readonly command: Command;
  readonly label: string;
}

/** Whether every word of `query` is in `text`, ignoring case. */
const matches = (query: string, text: string): boolean => {
  const said = text.toLowerCase();
  return query
    .toLowerCase()
    .split(/\s+/)
    .filter((word) => word !== '')
    .every((word) => said.includes(word));
};

/**
 * The command menu's rows: the commands of `available` (those available in
 * `ctx`) that every word typed names (in the label, the group or the id),
 * grouped in the order their groups first come.
 */
export const menuRows = (
  available: ReadonlyArray<Command>,
  ctx: Context,
  query: string,
): ReadonlyArray<MenuRow> =>
  byGroup(available)
    .flatMap(([, commands]) => commands)
    .map((command) => ({ command, label: labelOf(command, ctx) }))
    .filter((row) => matches(query, `${row.label} ${row.command.group} ${row.command.id}`));

/**
 * A context menu's rows, by group: the commands of `available` (those
 * available in `ctx`, whose selection is the thing the menu opened on) about
 * that thing, or about the page where it opened on nothing; the thing's own
 * first, then those every menu offers.
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
      [group, commands.map((command) => ({ command, label: labelOf(command, ctx) }))] as const,
  );
};

/** `commands` by group, each group where its first command comes, in registration order within it. */
export const byGroup = (
  commands: ReadonlyArray<Command>,
): ReadonlyArray<readonly [string, ReadonlyArray<Command>]> =>
  Arr.dedupe(commands.map((c) => c.group)).map(
    (group) => [group, commands.filter((c) => c.group === group)] as const,
  );
