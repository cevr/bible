// The Source view as the page's commands: Show the code (⇧C, on the Lab's
// context menu and ⌘K; the view follows the frame), Hide the code (the same
// key while it is open), and on a cue's context menu Show the code for this
// cue (the view held on the line that writes it). Nothing stands at rest for
// them: a phone reaches each through the command menu, a cue's long-press or
// its file line in the inspector.

import { Boolean as Bool, Option } from 'effect';
import { type Command, quietly } from '../../command/command.ts';
import { selected } from '../../command/context.ts';
import { type CodeOpen, FOLLOW, lineOpen } from './open.ts';

/** The ids of the Source view's commands. */
const SOURCE = 'lab.source';
const SOURCE_CUE = 'lab.source.cue';

/** What the commands drive: the view as the URL holds it, and where a cue is written. */
interface SourceVerbs {
  /** Whether the view is open. */
  readonly open: () => boolean;
  readonly show: (open: CodeOpen) => void;
  readonly hide: () => void;
  /** The line that writes cue `name` of `scene` in its file, once the file is read. */
  readonly lineOfCue: (scene: string, name: string) => Option.Option<number>;
}

/** The Source view's commands over `verbs`. */
export const sourceCommands = (verbs: SourceVerbs): ReadonlyArray<Command> => [
  {
    id: SOURCE,
    label: 'Show the code',
    labelIn: () =>
      Bool.match(verbs.open(), {
        onTrue: () => 'Hide the code',
        onFalse: () => 'Show the code',
      }),
    group: 'Source',
    keys: ['shift+c'],
    about: ['Page'],
    touch: 'the command menu, then Show the code',
    when: () => true,
    run: quietly(() =>
      Bool.match(verbs.open(), { onTrue: verbs.hide, onFalse: () => verbs.show(FOLLOW) }),
    ),
  },
  {
    id: SOURCE_CUE,
    label: 'Show the code for this cue',
    group: 'Source',
    about: ['Cue'],
    touch: 'hold the cue, or its file line in the inspector',
    when: (ctx) => Option.isSome(selected(ctx, 'Cue')),
    run: quietly((ctx) =>
      Option.map(selected(ctx, 'Cue'), (cue) =>
        verbs.show(
          Option.match(verbs.lineOfCue(cue.scene, cue.name), {
            onNone: () => FOLLOW,
            onSome: lineOpen,
          }),
        ),
      ),
    ),
  },
];
