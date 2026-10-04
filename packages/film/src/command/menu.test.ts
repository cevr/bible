import { describe, expect, test } from 'bun:test';
import { Effect } from 'effect';
import { type Command, quiet } from './command.ts';
import { contextAt } from './context.ts';
import { byGroup, menuRows } from './menu.ts';

const command = (id: string, group: string, label: string): Command => ({
  id,
  label,
  group,
  when: () => true,
  run: () => Effect.succeed(quiet),
});

const commands = [
  command('play.toggle', 'Transport', 'Play or pause'),
  command('edit.undo', 'Edit', 'Undo'),
  command('play.frame-next', 'Transport', 'Next frame'),
];
const ctx = contextAt('lab', '/films/f/lab');

describe('the command menu and the sheet', () => {
  test('group commands where their group first comes, keeping their order within it', () => {
    expect(byGroup(commands).map(([g, cs]) => [g, cs.map((c) => c.id)])).toEqual([
      ['Transport', ['play.toggle', 'play.frame-next']],
      ['Edit', ['edit.undo']],
    ]);
  });

  test('the menu matches every word typed, in the label, the group or the id', () => {
    expect(menuRows(commands, ctx, '').map((r) => r.command.id)).toEqual([
      'play.toggle',
      'play.frame-next',
      'edit.undo',
    ]);
    expect(menuRows(commands, ctx, 'next FRAME').map((r) => r.label)).toEqual(['Next frame']);
    expect(menuRows(commands, ctx, 'transport pause').map((r) => r.command.id)).toEqual([
      'play.toggle',
    ]);
    expect(menuRows(commands, ctx, 'edit.un').map((r) => r.command.id)).toEqual(['edit.undo']);
    expect(menuRows(commands, ctx, 'nothing')).toEqual([]);
  });
});
