// A wipe's divider by the keyboard, as a slider is moved, through the page's
// keymap: on its focused grip ←/→ (and ↓/↑) nudge it a hundredth of the
// frame, ten with ⇧ and a thousandth with ⌥; Home and End put it at the
// frame's edges; it never leaves the frame. Off the grip the keys are the
// page's again.

import { describe, expect, test } from 'bun:test';
import { Effect, Option } from 'effect';
import { type Context, contextAt } from '../command/context.ts';
import { resolve, bindingsOf } from '../command/keymap.ts';
import { nudged, wipeCommands } from './wipe-keys.ts';

describe("a wipe's divider by the keyboard", () => {
  test('a nudge is a hundredth of the frame, ten coarse, a thousandth fine, and stays in the frame', () => {
    expect(nudged(0.5, 1, 'normal')).toBe(0.51);
    expect(nudged(0.5, -1, 'normal')).toBe(0.49);
    expect(nudged(0.5, 1, 'coarse')).toBe(0.6);
    expect(nudged(0.5, -1, 'fine')).toBe(0.499);
    expect(nudged(0.95, 1, 'coarse')).toBe(1);
    expect(nudged(0.004, -1, 'normal')).toBe(0);
  });

  test("on its grip the arrows, Home and End move it; on the page they are not the wipe's", () => {
    let split = 0.5;
    const commands = wipeCommands(
      'compare',
      () => split,
      (to) => {
        split = to;
      },
    );
    const bindings = bindingsOf(commands, []);
    const onGrip: Context = { ...contextAt('lab', '/films/f/lab'), focus: 'slider' };
    const press = (key: string, shift = false, ctx = onGrip) =>
      resolve(
        { key, code: '', shift, meta: false, ctrl: false, alt: false, target: Option.none() },
        ctx,
        commands,
        bindings,
      );
    const run = (key: string, shift = false) => {
      const got = press(key, shift);
      if (got._tag === 'Run') Effect.runSync(got.command.run(onGrip, got.how));
      return got._tag;
    };
    expect(run('ArrowRight')).toBe('Run');
    expect(split).toBe(0.51);
    expect(run('ArrowRight', true)).toBe('Run');
    expect(split).toBe(0.61);
    expect(run('ArrowDown')).toBe('Run');
    expect(split).toBe(0.6);
    expect(run('Home')).toBe('Run');
    expect(split).toBe(0);
    expect(run('End')).toBe('Run');
    expect(split).toBe(1);
    expect(press('ArrowRight', false, contextAt('lab', '/films/f/lab'))._tag).toBe('Pass');
  });
});
