// The lab's modes, pure: the mode a kept value names (the first when it
// names none), and a command per mode that shows it, none for the mode shown.

import { Effect, Option } from 'effect';
import { describe, expect, test } from 'effect-bun-test';
import { BY_BUTTON } from '../command/command.ts';
import { contextAt } from '../command/context.ts';
import { FIRST_MODE, LAB_MODES, type LabMode, modeCommands, modeOf } from './mode.ts';

describe('the mode kept', () => {
  test('names its mode; nothing kept, or an old value, is the first mode', () => {
    expect(modeOf(Option.some('motion'))).toBe('motion');
    expect(modeOf(Option.none())).toBe(FIRST_MODE);
    expect(modeOf(Option.some('Lab'))).toBe(FIRST_MODE);
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
