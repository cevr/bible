// Motion's loop as commands: Loop the selected cue is offered (and on the
// cue's menu) only while a cue is selected, Stop looping only while
// something loops, the in and out points answer I and O; Loop this scene
// plays the span of the scene shown.

import { describe, expect, test } from 'bun:test';
import { Option } from 'effect';
import { contextAt } from '../../command/context.ts';
import { chipRows } from '../../command/menu.ts';
import { LOOP_IDS, type LoopVerbs, loopCommands, sceneSpan } from './commands.ts';

const ctx = contextAt('lab', '/films/f/lab');

const verbs = (cue: boolean, looping: boolean): LoopVerbs => ({
  cueSelected: () => cue,
  looping: () => looping,
  loopCue: () => {},
  loopScene: () => {},
  markIn: () => {},
  markOut: () => {},
  stop: () => {},
});

const offered = (cue: boolean, looping: boolean) =>
  chipRows(
    loopCommands(verbs(cue, looping)).filter((c) => c.when(ctx)),
    ctx,
    LOOP_IDS,
  ).map((r) => r.command.id);

describe('the loop chip', () => {
  test('offers the cue only while one is selected, and Stop only while something loops', () => {
    expect(offered(false, false)).toEqual(['motion.loop-scene', 'motion.in', 'motion.out']);
    expect(offered(true, true)).toEqual([...LOOP_IDS]);
  });

  test('the in and out points answer I and O, the cue ⇧L on its own menu', () => {
    const keys = Object.fromEntries(
      loopCommands(verbs(true, false)).map((c) => [c.id, [c.keys ?? [], c.about ?? []]]),
    );
    expect(keys['motion.in']).toEqual([['i'], []]);
    expect(keys['motion.out']).toEqual([['o'], []]);
    expect(keys['motion.loop-cue']).toEqual([['shift+l'], ['Cue', 'Page']]);
  });
});

describe('Loop this scene', () => {
  const placed = [
    { start: 0, dur: 4 },
    { start: 4, dur: 2.5 },
  ];

  test('plays the span of the scene shown', () => {
    expect(sceneSpan(placed, 5)).toEqual(Option.some({ from: 4, to: 6.5 }));
    expect(sceneSpan(placed, 0)).toEqual(Option.some({ from: 0, to: 4 }));
    expect(sceneSpan([], 1)).toEqual(Option.none());
  });
});
