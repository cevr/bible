import { describe, expect, test } from 'bun:test';
import { Effect, Option } from 'effect';
import {
  BY_BUTTON,
  type Command,
  labelOf,
  makeCommands,
  moved,
  quiet,
  refused,
  runIfAvailable,
  said,
} from './command.ts';
import {
  type Context,
  contextAt,
  focusOf,
  selected,
  selectedAll,
  withSelection,
} from './context.ts';
import { cueOf, Selection } from './selection.ts';

const command = (id: string, over: Partial<Command> = {}): Command => ({
  id,
  label: id,
  group: 'test',
  when: () => true,
  run: () => Effect.succeed(quiet),
  ...over,
});

const lab = contextAt('lab', '/films/f/lab/one');

describe('the command registry', () => {
  test('lists each id once, in the order first registered', () => {
    const commands = makeCommands();
    commands.register(command('a'), command('b'));
    commands.register(command('c'));
    expect(commands.all().map((c) => c.id)).toEqual(['a', 'b', 'c']);
  });

  test('a later registration of an id replaces the earlier one, in its place, until it goes', () => {
    const commands = makeCommands();
    commands.register(command('a', { label: 'first' }), command('b'));
    const drop = commands.register(command('a', { label: 'second' }));
    expect(commands.all().map((c) => [c.id, c.label])).toEqual([
      ['a', 'second'],
      ['b', 'b'],
    ]);
    drop();
    expect(commands.all().map((c) => [c.id, c.label])).toEqual([
      ['a', 'first'],
      ['b', 'b'],
    ]);
  });

  test('unregistering takes out only what that registration added', () => {
    const commands = makeCommands();
    const dropA = commands.register(command('a'));
    commands.register(command('b'));
    dropA();
    expect(commands.all().map((c) => c.id)).toEqual(['b']);
    expect(Option.isNone(commands.byId('a'))).toBe(true);
    expect(Option.isSome(commands.byId('b'))).toBe(true);
  });

  test('offers only the commands whose `when` holds in the context', () => {
    const commands = makeCommands();
    commands.register(
      command('always'),
      command('on a cue', { when: (ctx) => Option.isSome(selected(ctx, 'Cue')) }),
      command('playing', { when: (ctx) => ctx.playing }),
    );
    expect(commands.available(lab).map((c) => c.id)).toEqual(['always']);
    const onCue = withSelection(lab, [cueOf('one', 'rise')]);
    expect(commands.available(onCue).map((c) => c.id)).toEqual(['always', 'on a cue']);
    expect(commands.available({ ...lab, playing: true }).map((c) => c.id)).toEqual([
      'always',
      'playing',
    ]);
  });

  test('tells its subscribers each time a registration comes or goes', () => {
    const commands = makeCommands();
    let heard = 0;
    const stop = commands.subscribe(() => {
      heard += 1;
    });
    const drop = commands.register(command('a'));
    drop();
    stop();
    commands.register(command('b'));
    expect(heard).toBe(2);
  });

  test('runs a command only where it is available', () => {
    const run = (ctx: Context) =>
      Option.map(
        runIfAvailable(
          command('x', { when: (c) => c.playing, run: () => Effect.succeed(said('ran')) }),
          ctx,
          BY_BUTTON,
        ),
        Effect.runSync,
      );
    expect(run(lab)).toEqual(Option.none());
    expect(run({ ...lab, playing: true })).toEqual(Option.some(said('ran')));
  });

  test('a label may read the context it is shown in', () => {
    const c = command('loop', {
      label: 'Loop',
      labelIn: (ctx) => ['Loop', 'Stop loop'][Number(ctx.playing)] ?? 'Loop',
    });
    expect(labelOf(c, lab)).toBe('Loop');
    expect(labelOf(c, { ...lab, playing: true })).toBe('Stop loop');
  });
});

describe('receipts', () => {
  test('say what moved, from before to after, with its unit', () => {
    expect(moved('cue slam start', '0.42', '0.38', 's')).toBe('cue slam start 0.42 → 0.38 s');
    expect(moved('knob face', '[960, 800]', '[940, 812]')).toBe(
      'knob face [960, 800] → [940, 812]',
    );
  });

  test('carry the command that undoes them, or none; a refusal never undoes', () => {
    expect(said('picked', Option.some('edit.undo'))).toMatchObject({
      _tag: 'Said',
      tone: 'done',
      undo: Option.some('edit.undo'),
    });
    expect(refused('no such cue')).toMatchObject({ tone: 'refused', undo: Option.none() });
  });
});

describe('the context', () => {
  test('reads the first selected thing of a kind, and every one of a kind for a batch', () => {
    const many = withSelection(lab, [
      Selection.cases.Point.make({ film: 'f', point: 'cold' }),
      Selection.cases.Point.make({ film: 'f', point: 'word' }),
      cueOf('one', 'rise'),
    ]);
    expect(Option.map(selected(many, 'Point'), (p) => p.point)).toEqual(Option.some('cold'));
    expect(Option.isNone(selected(many, 'Cue'))).toBe(true);
    expect(selectedAll(many, 'Point').map((p) => p.point)).toEqual(['cold', 'word']);
  });

  test('reads where a press puts the keyboard: a field, the studio, a control, the page', () => {
    // An element as a key press's target is: its tag, and the ancestors `closest` finds.
    const el = (tagName: string, within: ReadonlyArray<string> = []) =>
      Option.some(
        Object.assign(new EventTarget(), {
          tagName,
          closest: (selector: string) => within.find((w) => selector.includes(w)),
        }),
      );
    expect(focusOf(el('INPUT'))).toBe('field');
    expect(focusOf(el('DIV', ['[role="dialog"]']))).toBe('field');
    expect(focusOf(el('BUTTON', ['.lab-studio']))).toBe('studio');
    expect(focusOf(el('BUTTON'))).toBe('control');
    expect(focusOf(el('A'))).toBe('control');
    expect(focusOf(el('BODY'))).toBe('page');
    expect(focusOf(Option.none())).toBe('page');
  });
});
