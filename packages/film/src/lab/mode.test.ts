// The lab's modes, pure: the mode a kept value names (the first when it
// names none), and a command per mode that shows it, none for the mode shown.

import { Effect, Option } from 'effect';
import { describe, expect, test } from 'effect-bun-test';
import { BY_BUTTON } from '../command/command.ts';
import { contextAt } from '../command/context.ts';
import { FIRST_MODE, LAB_MODES, type LabMode, citedMode, modeCommands, modeOf } from './mode.ts';

describe('the mode kept', () => {
  test('names its mode; nothing kept, or an old value, is the first mode', () => {
    expect(modeOf(Option.some('motion'))).toBe('motion');
    expect(modeOf(Option.none())).toBe(FIRST_MODE);
    expect(modeOf(Option.some('Lab'))).toBe(FIRST_MODE);
  });
});

describe('the mode a link cites', () => {
  const none = { note: Option.none(), beat: Option.none(), selection: Option.none() };

  const kept = (now: LabMode, phone = false) => ({ now, phone });

  test('a note shows Note, a beat the film lists Record, a cue or a knob Edit', () => {
    expect(citedMode({ ...none, note: Option.some('n1') }, kept('edit'))).toEqual(
      Option.some('note'),
    );
    expect(citedMode({ ...none, beat: Option.some('two') }, kept('edit'))).toEqual(
      Option.some('record'),
    );
    for (const now of ['note', 'compare', 'record'] as const)
      expect(citedMode({ ...none, selection: Option.some('cue charge') }, kept(now))).toEqual(
        Option.some('edit'),
      );
  });

  test('a cue or a knob stays in a mode that shows it: Edit, and Motion on a laptop', () => {
    const cue = { ...none, selection: Option.some('cue charge') };
    expect(citedMode(cue, kept('edit'))).toEqual(Option.none());
    expect(citedMode(cue, kept('motion'))).toEqual(Option.none());
    expect(citedMode(cue, kept('motion', true))).toEqual(Option.some('edit'));
  });

  test('a link citing nothing leaves the mode alone; the note outranks a beat, a beat a selection', () => {
    expect(citedMode(none, kept('record'))).toEqual(Option.none());
    expect(
      citedMode(
        { note: Option.some('n1'), beat: Option.some('two'), selection: Option.some('x') },
        kept('edit'),
      ),
    ).toEqual(Option.some('note'));
    expect(
      citedMode({ ...none, beat: Option.some('two'), selection: Option.some('x') }, kept('edit')),
    ).toEqual(Option.some('record'));
  });
});

describe('the mode commands', () => {
  test('one a mode, each showing it; the mode shown is no move', () => {
    const shown: Array<LabMode> = [];
    const commands = modeCommands(
      () => 'edit',
      (m) => shown.push(m),
    );
    const ctx = contextAt('lab', 'https://lab.test/films/probe/lab');
    expect(commands.filter((c) => c.when(ctx)).map((c) => c.id)).toEqual([
      'lab.mode.note',
      'lab.mode.motion',
      'lab.mode.compare',
      'lab.mode.record',
    ]);
    for (const c of commands) Effect.runSync(c.run(ctx, BY_BUTTON));
    expect(shown).toEqual([...LAB_MODES]);
  });
});
