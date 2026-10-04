import { describe, expect, test } from 'bun:test';
import { Effect, Option } from 'effect';
import type { KeyPress } from '../browser/keys.ts';
import { type Command, quiet } from './command.ts';
import { type Context, contextAt } from './context.ts';
import {
  Resolved,
  bindingsOf,
  chordLabel,
  chordOf,
  keysOf,
  parseChord,
  rebind,
  resetKeys,
  resolve,
} from './keymap.ts';

const press = (key: string, held: Partial<Omit<KeyPress, 'key'>> = {}): KeyPress => ({
  key,
  code: '',
  shift: false,
  meta: false,
  ctrl: false,
  alt: false,
  target: Option.none(),
  ...held,
});

const command = (id: string, over: Partial<Command> = {}): Command => ({
  id,
  label: id,
  group: 'test',
  when: () => true,
  run: () => Effect.succeed(quiet),
  ...over,
});

const page = contextAt('lab', '/films/f/lab');

/** What `p` does among `commands` in `ctx`: the command and step it runs, `owned` or `pass`. */
const does = (p: KeyPress, commands: ReadonlyArray<Command>, ctx: Context = page) =>
  Resolved.$match(resolve(p, ctx, commands, bindingsOf(commands, [])), {
    Run: ({ command, how }) => `${command.id} ${how.step}`,
    Owned: () => 'owned',
    Pass: () => 'pass',
  });

describe('chords', () => {
  test('read in one canonical text, whatever names their modifiers', () => {
    expect(parseChord('Shift+Cmd+Z')).toEqual(Option.some('mod+shift+z'));
    expect(parseChord('ctrl+k')).toEqual(Option.some('mod+k'));
    expect(parseChord('Esc')).toEqual(Option.some('escape'));
    expect(parseChord('shift+?')).toEqual(Option.some('?'));
    expect(parseChord('mod++')).toEqual(Option.some('mod++'));
    expect(parseChord('hyper+k')).toEqual(Option.none());
  });

  test('a press reads as its chord: ⌘ or Ctrl is mod, Caps Lock is no Shift, a symbol drops Shift', () => {
    expect(chordOf(press('z', { meta: true, shift: true }))).toBe('mod+shift+z');
    expect(chordOf(press('Z', { ctrl: true, shift: true }))).toBe('mod+shift+z');
    expect(chordOf(press('N'))).toBe('n');
    expect(chordOf(press('?', { shift: true }))).toBe('?');
    expect(chordOf(press(' '))).toBe('space');
    expect(chordOf(press('ArrowLeft', { shift: true }))).toBe('shift+arrowleft');
  });

  test('a letter held with Alt reads by its physical key', () => {
    expect(chordOf(press('ø', { alt: true, code: 'KeyO' }))).toBe('alt+o');
    expect(chordOf(press('¡', { alt: true, code: 'Digit1' }))).toBe('alt+1');
  });

  test('read as each platform writes them', () => {
    expect(chordLabel('mod+shift+z', true)).toBe('⇧⌘Z');
    expect(chordLabel('mod+shift+z', false)).toBe('Shift+Ctrl+Z');
    expect(chordLabel('arrowleft', true)).toBe('←');
    expect(chordLabel('space', false)).toBe('Space');
  });
});

describe('the keymap', () => {
  const undo = command('edit.undo', { keys: ['mod+z'] });
  const frame = command('play.frame-next', { keys: ['arrowright'], stepped: true });

  test('runs the command a press is bound to, and passes a press bound to nothing', () => {
    expect(does(press('z', { meta: true }), [undo])).toBe('edit.undo normal');
    expect(does(press('q'), [undo])).toBe('pass');
  });

  test('a stepped command takes its keys with Shift as its coarse step and Alt as its fine one', () => {
    expect(does(press('ArrowRight'), [frame])).toBe('play.frame-next normal');
    expect(does(press('ArrowRight', { shift: true }), [frame])).toBe('play.frame-next coarse');
    expect(does(press('ArrowRight', { alt: true }), [frame])).toBe('play.frame-next fine');
    // Not stepped: Shift makes another chord.
    expect(does(press('z', { meta: true, shift: true }), [undo])).toBe('pass');
  });

  test('a chord bound itself wins over a stepped command read with its modifier', () => {
    const jump = command('play.jump', { keys: ['shift+arrowright'] });
    expect(does(press('ArrowRight', { shift: true }), [frame, jump])).toBe('play.jump normal');
  });

  test('a command not available is not run; the last available one on a key is', () => {
    const grip = command('edit.cancel-grip', { keys: ['escape'], when: () => false });
    const note = command('notes.cancel', { keys: ['escape'] });
    expect(does(press('Escape'), [note, grip])).toBe('notes.cancel normal');
    expect(does(press('Escape'), [grip])).toBe('pass');
  });

  test('a field takes the page keys but those that run there too', () => {
    const field = { ...page, focus: 'field' as const };
    const escape = command('notes.cancel', { keys: ['escape'], keysIn: ['page', 'field'] });
    expect(does(press('ArrowRight'), [frame], field)).toBe('pass');
    expect(does(press('Escape'), [escape], field)).toBe('notes.cancel normal');
  });

  test("the studio's keys come first in the studio, and it owns them; the page's others still run", () => {
    const studio = { ...page, focus: 'studio' as const };
    const stop = command('studio.stop', { keys: ['space'], keysIn: ['studio'], when: () => false });
    const play = command('play.toggle', { keys: ['space'] });
    const scene = command('play.scene-next', { keys: [']'] });
    expect(does(press(' '), [play, stop, scene], studio)).toBe('owned');
    expect(does(press(']'), [play, stop, scene], studio)).toBe('play.scene-next normal');
    expect(does(press(' '), [play, stop, scene])).toBe('play.toggle normal');
  });

  test("a control hears the page's keys; a command's `when` can keep Tab moving focus there", () => {
    const control = { ...page, focus: 'control' as const };
    const walk = command('edit.cue-next', { keys: ['tab'], when: (ctx) => ctx.focus === 'page' });
    expect(does(press('ArrowRight'), [frame], control)).toBe('play.frame-next normal');
    expect(does(press('Tab'), [walk])).toBe('edit.cue-next normal');
    expect(does(press('Tab'), [walk], control)).toBe('pass');
  });

  test("the viewer's overrides add keys and take defaults away; Reset puts them back", () => {
    const commands = [undo, frame];
    const moved = rebind([], undo, 'mod+u');
    expect(moved).toEqual([
      { key: 'mod+z', command: '-edit.undo' },
      { key: 'mod+u', command: 'edit.undo' },
    ]);
    expect(keysOf(bindingsOf(commands, moved), 'edit.undo')).toEqual(['mod+u']);
    expect(keysOf(bindingsOf(commands, moved), 'play.frame-next')).toEqual(['arrowright']);
    expect(keysOf(bindingsOf(commands, resetKeys(moved, 'edit.undo')), 'edit.undo')).toEqual([
      'mod+z',
    ]);
    // Rebound to its own default: nothing taken away, nothing added.
    expect(rebind([], undo, 'cmd+z')).toEqual([]);
  });

  test("a viewer's key wins over a default on the same key", () => {
    const commands = [undo, command('edit.other')];
    const bindings = bindingsOf(commands, rebind([], commands[1] ?? undo, 'mod+z'));
    const run = resolve(press('z', { meta: true }), page, commands, bindings);
    expect(Resolved.$is('Run')(run) && run.command.id).toBe('edit.other');
  });
});
