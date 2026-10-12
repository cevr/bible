// The Transcript view as the page's commands: Show the transcript (⇧T, on
// the Lab's context menu and ⌘K; the view follows the frame) on a talk, and
// Hide the transcript (the same key while it is open). Nothing stands at
// rest for it: a phone reaches it through the command menu.

import { Boolean as Bool } from 'effect';
import { type Command, quietly } from '../../command/command.ts';

/** The id of the Transcript view's command. */
const TRANSCRIPT = 'lab.transcript';

/** What the command drives: whether the film is a talk, and the view as the URL holds it. */
interface TranscriptVerbs {
  /** Whether the film is a talk: only a talk has a transcript. */
  readonly talk: () => boolean;
  /** Whether the view is open. */
  readonly open: () => boolean;
  readonly show: () => void;
  readonly hide: () => void;
}

/** The Transcript view's commands over `verbs`. */
export const transcriptCommands = (verbs: TranscriptVerbs): ReadonlyArray<Command> => [
  {
    id: TRANSCRIPT,
    label: 'Show the transcript',
    labelIn: () =>
      Bool.match(verbs.open(), {
        onTrue: () => 'Hide the transcript',
        onFalse: () => 'Show the transcript',
      }),
    group: 'Transcript',
    keys: ['shift+t'],
    about: ['Page'],
    touch: 'the command menu, then Show the transcript',
    when: () => verbs.talk() || verbs.open(),
    run: quietly(() => Bool.match(verbs.open(), { onTrue: verbs.hide, onFalse: verbs.show })),
  },
];
