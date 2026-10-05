import { describe, expect, test } from 'bun:test';
import { Effect, Option } from 'effect';
import { BY_BUTTON, type Command, quiet } from './command.ts';
import { contextAt } from './context.ts';
import { pageHref } from '../core/api.ts';
import { GO_TO, goToCommands, partCommands } from './go.ts';
import { byGroup, contextRows, menuRows, rowChord, rowKey, sheetRows, viewRows } from './menu.ts';
import { walkFrom } from './walk.ts';

const command = (id: string, group: string, label: string): Command => ({
  id,
  label,
  group,
  touch: 'a test command',
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

  test('a Go to entry is a row once a word is typed, and never in the sheet or a context menu', () => {
    const goes = goToCommands([{ kind: 'scene', id: 'cold', name: 'cold', go: () => {} }]);
    const all = [...commands, ...goes];
    expect(menuRows(all, ctx, '').map((r) => r.command.id)).not.toContain('go.scene.cold');
    expect(menuRows(all, ctx, 'cold').map((r) => r.label)).toEqual(['Go to scene cold']);
    expect(sheetRows(all).map(([group]) => group)).toEqual(['Transport', 'Edit']);
    expect(contextRows(all, ctx)).toEqual([]);
  });

  test('the view menu lists the View commands available, then what it ends on, each at its step', () => {
    const view = [command('review.captions', 'View', 'Captions'), ...commands];
    const sheet = command('app.keys', 'Help', 'Keyboard shortcuts');
    expect(viewRows(view, ctx, [sheet]).map((r) => [r.command.id, r.step])).toEqual([
      ['review.captions', 'normal'],
      ['app.keys', 'normal'],
    ]);
  });
});

describe("a stepped command in a context menu (a finger's Shift)", () => {
  test('is a row at its step and a row at its coarse step (×10), each its own row', () => {
    const next: Command = {
      ...command('play.frame-next', 'Transport', 'Next frame'),
      stepped: true,
      about: ['Page'],
    };
    const scene: Command = {
      ...command('play.scene-next', 'Transport', 'Next scene'),
      about: ['Page'],
    };
    const rows = contextRows([next, scene], ctx).flatMap(([, r]) => r);
    expect(rows.map((r) => [r.command.id, r.label, r.step])).toEqual([
      ['play.frame-next', 'Next frame', 'normal'],
      ['play.frame-next', 'Next frame ×10', 'coarse'],
      ['play.scene-next', 'Next scene', 'normal'],
    ]);
    expect(new Set(rows.map(rowKey)).size).toBe(rows.length);
    // Its keys read as the keymap steps them: the coarse row's with Shift.
    expect(rows.slice(0, 2).map((r) => rowChord(r, 'arrowright'))).toEqual([
      'arrowright',
      'shift+arrowright',
    ]);
  });

  test('⌘K and a chip list it once, at its step', () => {
    const next: Command = {
      ...command('play.frame-next', 'Transport', 'Next frame'),
      stepped: true,
    };
    expect(menuRows([next], ctx, '').map((r) => [r.label, r.step])).toEqual([
      ['Next frame', 'normal'],
    ]);
  });
});

describe('Go to (AA-2)', () => {
  test('each destination is a command named by its kind and id that goes there', () => {
    const went: Array<string> = [];
    const [go] = goToCommands([
      { kind: 'folder', id: 'out/art', name: 'Roofs out/art', go: () => went.push('out/art') },
    ]);
    expect(go?.id).toBe('go.folder.out/art');
    expect(go?.label).toBe('Go to folder Roofs out/art');
    expect(go?.group).toBe(GO_TO);
    Effect.runSync(go?.run(ctx, BY_BUTTON) ?? Effect.succeed(quiet));
    expect(went).toEqual(['out/art']);
  });

  test("the studio's parts are commands on ⇧1-⇧6; a short has only Films, Scenes and Play", () => {
    const went: Array<string> = [];
    const parts = (film: string) =>
      partCommands(
        () => Option.some(film),
        () => 'films',
        (href) => went.push(href),
      );
    const open = (film: string) =>
      parts(film)
        .filter((c) => c.when(ctx))
        .map((c) => c.id);
    expect(parts('roofs').map((c) => [c.id, c.keys])).toEqual([
      ['page.films', ['shift+1']],
      ['page.scenes', ['shift+2']],
      ['page.lab', ['shift+3']],
      ['page.choices', ['shift+4']],
      ['page.project', ['shift+5']],
      ['page.play', ['shift+6']],
    ]);
    // The part the page is on is no move.
    expect(open('roofs')).toEqual([
      'page.scenes',
      'page.lab',
      'page.choices',
      'page.project',
      'page.play',
    ]);
    expect(open('roofs/shorts/hook')).toEqual(['page.scenes', 'page.play']);
    const play = parts('roofs/shorts/hook').find((c) => c.id === 'page.play');
    Effect.runSync(play?.run(ctx, BY_BUTTON) ?? Effect.succeed(quiet));
    expect(went).toEqual([pageHref.play('roofs/shorts/hook')]);
  });
});

describe('a walk through time (`.`/`,`, ⇧N/⌥⇧N, F/⇧F)', () => {
  const times = [3, 1, 2];
  const at = (T: number, toward: 'next' | 'previous') => walkFrom(times, (t) => t, T, toward);

  test('the next past the time shown, the previous before it, in time order', () => {
    expect(at(1.5, 'next')).toEqual(Option.some(2));
    expect(at(1.5, 'previous')).toEqual(Option.some(1));
  });

  test('a step from a thing never lands on the same thing', () => {
    expect(at(2, 'next')).toEqual(Option.some(3));
    expect(at(2 + 1 / 120, 'previous')).toEqual(Option.some(1));
  });

  test('past either end there is nothing', () => {
    expect(at(3, 'next')).toEqual(Option.none());
    expect(at(1, 'previous')).toEqual(Option.none());
  });
});
