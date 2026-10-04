// The editor's verbs as the page's commands (`command/command.ts`): Undo and
// Redo of the lab's writes, available while the server's stack has a step
// that way (and labelled with what they would undo or redo), and Escape
// letting a held grip go, from a field as well; and Select, from a cue's or a
// knob's context menu. Each answers quietly: the write reloads the page, and
// the status line says what it did; a selection shows in the URL and the strip.

import { Effect, Option } from 'effect';
import { type Command, quiet } from '../../command/command.ts';
import { type Context, selected } from '../../command/context.ts';
import { type LabSelection, sameSelection, selectionText } from '../../command/selection.ts';
import type { StepVerb } from '../api.ts';

/** What the editor's commands drive. */
interface EditorVerbs {
  /** What the server's stack would undo or redo now (its target), if anything. */
  readonly undoable: (verb: StepVerb) => Option.Option<{ readonly target: string }>;
  readonly step: (verb: StepVerb) => void;
  /** Whether a grip is held: pressed on a cue or a handle, or dragging. */
  readonly holding: () => boolean;
  /** Let the held grip go: it goes back where it was. */
  readonly cancel: () => void;
  /** What the lab selects now (the URL's cue or knob). */
  readonly selected: () => Option.Option<LabSelection>;
  readonly select: (selection: LabSelection) => void;
}

/** The cue or knob `ctx` is about, if it is not the one selected already. */
const toSelect = (verbs: EditorVerbs, ctx: Context): Option.Option<LabSelection> =>
  Option.filter(
    Option.firstSomeOf<LabSelection>([selected(ctx, 'Cue'), selected(ctx, 'Knob')]),
    (s) => !Option.exists(verbs.selected(), (now) => sameSelection(now, s)),
  );

const stepCommand = (verbs: EditorVerbs, verb: StepVerb, label: string, key: string): Command => ({
  id: `edit.${verb}`,
  label,
  labelIn: () =>
    Option.match(verbs.undoable(verb), {
      onNone: () => label,
      onSome: (s) => `${label} ${s.target}`,
    }),
  group: 'Edit',
  keys: [key],
  touch: `the ${label} button in the editor`,
  when: () => Option.isSome(verbs.undoable(verb)),
  run: () =>
    Effect.sync(() => {
      verbs.step(verb);
      return quiet;
    }),
});

/** The editor's commands over `verbs`. */
export const editorCommands = (verbs: EditorVerbs): ReadonlyArray<Command> => [
  stepCommand(verbs, 'undo', 'Undo', 'mod+z'),
  stepCommand(verbs, 'redo', 'Redo', 'mod+shift+z'),
  {
    id: 'edit.cancel-grip',
    label: 'Cancel the drag',
    group: 'Edit',
    keys: ['escape'],
    keysIn: ['page', 'field'],
    when: verbs.holding,
    run: () =>
      Effect.sync(() => {
        verbs.cancel();
        return quiet;
      }),
  },
  {
    id: 'edit.select',
    label: 'Select',
    labelIn: (ctx) =>
      Option.match(toSelect(verbs, ctx), {
        onNone: () => 'Select',
        onSome: (s) => `Select ${selectionText(s)}`,
      }),
    group: 'Edit',
    about: ['Cue', 'Knob'],
    touch: 'tap it, or long-press it, then Select',
    when: (ctx) => Option.isSome(toSelect(verbs, ctx)),
    run: (ctx) =>
      Effect.sync(() => {
        Option.map(toSelect(verbs, ctx), verbs.select);
        return quiet;
      }),
  },
];
