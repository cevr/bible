// What ⌘K (the command menu) and the `?` sheet list, from the registry and
// the keymap alone (nothing is written twice): the menu, the commands
// available where the page is, matched by what was typed; the sheet, every
// command registered, by group, with its keys and how a phone reaches it.
// Pure.

import { Array as Arr } from 'effect';
import { type Command, labelOf } from './command.ts';
import type { Context } from './context.ts';

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

/** `commands` by group, each group where its first command comes, in registration order within it. */
export const byGroup = (
  commands: ReadonlyArray<Command>,
): ReadonlyArray<readonly [string, ReadonlyArray<Command>]> =>
  Arr.dedupe(commands.map((c) => c.group)).map(
    (group) => [group, commands.filter((c) => c.group === group)] as const,
  );
