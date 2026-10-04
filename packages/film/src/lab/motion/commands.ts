// Motion's loop as the page's commands (AA-9, UR-95): Loop the selected cue
// (⇧L, on the cue's context menu too), Loop this scene, Set the in point
// here (I) and Set the out point here (O: once the out point lies after the
// in point the range loops, as every editor's in/out points do), and Stop
// looping. The loop chip in Motion's section opens them, and the rate chip
// the transport's rates (`player/transport.ts`). Each answers quietly: the
// section's status and the time line say the loop.

import { Effect, Option } from 'effect';
import { type Command, quiet } from '../../command/command.ts';

/** What the loop's commands drive: Motion's actions, and what they read. */
export interface LoopVerbs {
  /** Whether a cue is selected, which Loop the selected cue plays. */
  readonly cueSelected: () => boolean;
  /** Whether anything loops or is marked: Stop looping is offered then. */
  readonly looping: () => boolean;
  readonly loopCue: () => void;
  readonly loopScene: () => void;
  readonly markIn: () => void;
  readonly markOut: () => void;
  readonly stop: () => void;
}

/** The loop chip's commands, in its menu's order. */
export const LOOP_IDS = [
  'motion.loop-cue',
  'motion.loop-scene',
  'motion.in',
  'motion.out',
  'motion.loop-off',
] as const;

/** Run `move` and answer quietly. */
const doing = (move: () => void) => () =>
  Effect.sync(() => {
    move();
    return quiet;
  });

/** The loop's commands over `verbs`. */
export const loopCommands = (verbs: LoopVerbs): ReadonlyArray<Command> => [
  {
    id: 'motion.loop-cue',
    label: 'Loop the selected cue',
    group: 'Motion',
    keys: ['shift+l'],
    about: ['Cue', 'Page'],
    touch: 'hold the cue, or the loop chip',
    when: verbs.cueSelected,
    run: doing(verbs.loopCue),
  },
  {
    id: 'motion.loop-scene',
    label: 'Loop this scene',
    group: 'Motion',
    about: ['Page'],
    touch: 'the loop chip',
    when: () => true,
    run: doing(verbs.loopScene),
  },
  {
    id: 'motion.in',
    label: 'Set the in point here',
    group: 'Motion',
    keys: ['i'],
    touch: 'the loop chip',
    when: () => true,
    run: doing(verbs.markIn),
  },
  {
    id: 'motion.out',
    label: 'Set the out point here',
    group: 'Motion',
    keys: ['o'],
    touch: 'the loop chip',
    when: () => true,
    run: doing(verbs.markOut),
  },
  {
    id: 'motion.loop-off',
    label: 'Stop looping',
    group: 'Motion',
    about: ['Page'],
    touch: 'the loop chip',
    when: verbs.looping,
    run: doing(verbs.stop),
  },
];

/** The span of the scene at `T`, among `placed`: where Loop this scene plays. */
export const sceneSpan = (
  placed: ReadonlyArray<{ readonly start: number; readonly dur: number }>,
  T: number,
): Option.Option<{ readonly from: number; readonly to: number }> =>
  Option.map(Option.fromUndefinedOr(placed.findLast((p) => p.start <= T) ?? placed[0]), (p) => ({
    from: p.start,
    to: p.start + p.dur,
  }));
