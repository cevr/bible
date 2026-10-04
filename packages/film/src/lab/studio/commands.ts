// The studio's keys as the page's commands (`command/command.ts`): what each
// does in the recorder's state is still `keyOf`'s (`view.ts`), the one place
// that reads the studio's keys; here each key is a command whose keys run
// only while focus is in the studio (`keysIn: ['studio']`), and which the
// command menu offers while the key has something to do. The studio owns
// these keys (`command/keymap.ts`): one with nothing to do now is still not
// the lab's. Each answers quietly: the recorder's status line says what
// happened.

import { Effect } from 'effect';
import { type Command, quiet } from '../../command/command.ts';

/** What the studio's commands drive: the studio's own key, by `KeyboardEvent.key`. */
interface StudioKeys {
  readonly press: (key: string) => boolean;
  readonly canPress: (key: string) => boolean;
}

/** The studio's keys: the command, its label, its chord, and the key `keyOf` reads. */
const KEYS: ReadonlyArray<readonly [id: string, label: string, chord: string, key: string]> = [
  ['studio.record', 'Record, or record again', 'r', 'r'],
  ['studio.stop', 'Stop recording', 'space', ' '],
  ['studio.submit', 'Submit the take, or accept it anyway', 'k', 'k'],
  ['studio.back', 'Cancel, discard or go back', 'escape', 'Escape'],
  ['studio.beat-next', 'Next beat', 'arrowright', 'ArrowRight'],
  ['studio.beat-previous', 'Previous beat', 'arrowleft', 'ArrowLeft'],
];

/** The studio's commands over `keys`. */
export const studioCommands = (keys: StudioKeys): ReadonlyArray<Command> =>
  KEYS.map(([id, label, chord, key]) => ({
    id,
    label,
    group: 'Studio',
    keys: [chord],
    keysIn: ['studio'],
    touch: "the studio's buttons and beat list",
    when: () => keys.canPress(key),
    run: () =>
      Effect.sync(() => {
        keys.press(key);
        return quiet;
      }),
  }));
