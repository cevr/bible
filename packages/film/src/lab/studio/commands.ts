// The studio's keys as the page's commands (`command/command.ts`): each of
// the recorder's controls is pressed by its command (`Control.command`,
// `view.ts`), as its button is, and ←/→ step through the beats. Their keys
// run only while focus is in the studio (`keysIn: ['studio']`), and the
// command menu offers each while it has something to do. The studio owns
// these keys (`command/keymap.ts`): one with nothing to do now is still not
// the lab's. Each answers quietly: the recorder's status line says what
// happened.

import { Option } from 'effect';
import { type Command, quietly } from '../../command/command.ts';
import type { Act, Control, ControlCommand } from './view.ts';

/** What the studio's commands drive: the recorder's controls now, and the beat list. */
interface StudioVerbs {
  /** The control `command` presses now, if it presses one. */
  readonly control: (command: ControlCommand) => Option.Option<Control>;
  readonly perform: (act: Act) => void;
  /** Whether ←/→ step through the beats now. */
  readonly stepsBeats: () => boolean;
  /** Select the beat `by` places on (1 the next, -1 the previous), if there is one. */
  readonly step: (by: 1 | -1) => void;
}

/** The controls' commands: the command, its label, its chord. */
const CONTROLS: ReadonlyArray<readonly [id: ControlCommand, label: string, chord: string]> = [
  ['studio.record', 'Record, or record again', 'r'],
  ['studio.stop', 'Stop recording', 'space'],
  ['studio.submit', 'Submit the take, or accept it anyway', 'k'],
  ['studio.back', 'Cancel, discard or go back', 'escape'],
];

/** The beat steps' commands: the command, its label, its chord, the step. */
const STEPS: ReadonlyArray<readonly [id: string, label: string, chord: string, by: 1 | -1]> = [
  ['studio.beat-next', 'Next beat', 'arrowright', 1],
  ['studio.beat-previous', 'Previous beat', 'arrowleft', -1],
];

const inStudio = {
  group: 'Studio',
  keysIn: ['studio'],
  touch: "the studio's buttons and beat list",
} as const satisfies Pick<Command, 'group' | 'keysIn' | 'touch'>;

/** The studio's commands over `verbs`. */
export const studioCommands = (verbs: StudioVerbs): ReadonlyArray<Command> => [
  ...CONTROLS.map(([id, label, chord]): Command => ({
    id,
    label,
    keys: [chord],
    ...inStudio,
    when: () => Option.isSome(verbs.control(id)),
    run: quietly(() => Option.map(verbs.control(id), (c) => verbs.perform(c.act))),
  })),
  ...STEPS.map(([id, label, chord, by]): Command => ({
    id,
    label,
    keys: [chord],
    ...inStudio,
    when: verbs.stepsBeats,
    run: quietly(() => verbs.step(by)),
  })),
];
