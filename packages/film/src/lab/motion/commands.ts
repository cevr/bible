// Motion's loop as the page's commands: Loop the selected cue
// (⇧L, on the cue's context menu too), Loop this scene, Set the in point
// here (I) and Set the out point here (O: once the out point lies after the
// in point the range loops, as every editor's in/out points do), and Stop
// looping. The loop chip in Motion's section opens them, and the rate chip
// the transport's rates (`player/transport.ts`). Each answers quietly: the
// section's status and the time line say the loop. The onion skin's on and
// off is one more (`onionCommand`), behind the section's Onion button.

import { Option } from 'effect';
import { type Command, quietly } from '../../command/command.ts';
import { sceneAt } from '../../core/layout.ts';

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
    run: quietly(verbs.loopCue),
  },
  {
    id: 'motion.loop-scene',
    label: 'Loop this scene',
    group: 'Motion',
    about: ['Page'],
    touch: 'the loop chip',
    when: () => true,
    run: quietly(verbs.loopScene),
  },
  {
    id: 'motion.in',
    label: 'Set the in point here',
    group: 'Motion',
    keys: ['i'],
    touch: 'the loop chip',
    when: () => true,
    run: quietly(verbs.markIn),
  },
  {
    id: 'motion.out',
    label: 'Set the out point here',
    group: 'Motion',
    keys: ['o'],
    touch: 'the loop chip',
    when: () => true,
    run: quietly(verbs.markOut),
  },
  {
    id: 'motion.loop-off',
    label: 'Stop looping',
    group: 'Motion',
    about: ['Page'],
    touch: 'the loop chip',
    when: verbs.looping,
    run: quietly(verbs.stop),
  },
];

/** The onion skin's command: Motion's Onion button and ⌘K turn it on and off. */
export const ONION = 'motion.onion';

/** Turn the onion skin on or off (`toggle`): no key until a visit wants one. */
export const onionCommand = (toggle: () => void): Command => ({
  id: ONION,
  label: 'Onion skin on or off',
  group: 'Motion',
  touch: 'the Onion button in Motion',
  when: () => true,
  run: quietly(toggle),
});

/** The span of the scene at `T` (`sceneAt`), among `placed`: where Loop this scene plays. */
export const sceneSpan = (
  placed: ReadonlyArray<{ readonly start: number; readonly dur: number }>,
  T: number,
): Option.Option<{ readonly from: number; readonly to: number }> =>
  Option.map(sceneAt(placed, T), (p) => ({ from: p.start, to: p.start + p.dur }));
