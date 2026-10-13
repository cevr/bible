// The Script's words as the page's commands: Select to here, on the context
// menu of a word (a right-click, or a finger held still on it), so a phone,
// which has no Shift, selects a range as a laptop does: tap the first word,
// hold the last, Select to here. It is the Transcript's (`selectedTo`): a
// beat's line is selected as a talk's section is. And Note, Correct or
// Remove these words, on the same menu and ⌘K, while no note is being made:
// each opens the composer on the words it is about (`notedAbout`), asking
// that of them. Pure but for what `ScriptVerbs` and `NoteVerbs` do.

import { Option } from 'effect';
import { type Command, quietly } from '../../command/command.ts';
import { type Context, selected } from '../../command/context.ts';
import type { WordsSelection } from '../../command/selection.ts';
import type { NoteKind } from '../../core/schema.ts';
import { selectedTo, within } from '../transcript/commands.ts';

/** What the commands drive: the words selected, as the URL holds them, and a selection made. */
interface ScriptVerbs {
  readonly selection: () => Option.Option<WordsSelection>;
  readonly select: (words: WordsSelection) => void;
}

/** The Script's commands over `verbs`. */
export const scriptCommands = (verbs: ScriptVerbs): ReadonlyArray<Command> => [
  {
    id: 'script.select-to',
    label: 'Select to here',
    group: 'Script',
    about: ['Words'],
    touch: 'tap the first word, hold the last, then Select to here',
    when: (ctx) => Option.isSome(selectedTo(ctx, verbs.selection())),
    run: quietly((ctx) => Option.map(selectedTo(ctx, verbs.selection()), verbs.select)),
  },
];

/**
 * The words a note about `ctx` is on, the Script's selection being
 * `selection`: a word the menu opened on inside the selection is about the
 * selection, any other word about itself; a line (the menu opened beside
 * its words) about the selection in it, else all its words; the page (⌘K)
 * about the selection.
 */
export const notedAbout = (
  ctx: Context,
  selection: Option.Option<WordsSelection>,
): Option.Option<WordsSelection> =>
  Option.match(selected(ctx, 'Words'), {
    onNone: () => selection,
    onSome: (about) =>
      Option.orElse(
        Option.filter(selection, (s) => within(about, s) || within(s, about)),
        () => Option.some(about),
      ),
  });

/** What the note commands drive: the words selected, whether a note is being made, and a note begun on words. */
interface NoteVerbs {
  readonly selection: () => Option.Option<WordsSelection>;
  /** Whether a note is being made: none is begun until it is saved or cancelled. */
  readonly composing: () => boolean;
  /** Begin a note on `words`, asking `kind` of them. */
  readonly note: (words: WordsSelection, kind: NoteKind) => void;
}

/** What each note command asks of its words, and how the menu names it. */
const ASKING: ReadonlyArray<{
  readonly kind: NoteKind;
  readonly id: string;
  readonly label: string;
}> = [
  { kind: 'note', id: 'script.note', label: 'Note these words' },
  { kind: 'correction', id: 'script.correct', label: 'Correct these words' },
  { kind: 'removal', id: 'script.remove', label: 'Remove these words' },
];

/** The Script's note commands over `verbs`: Note, Correct and Remove these words. */
export const noteCommands = (verbs: NoteVerbs): ReadonlyArray<Command> =>
  ASKING.map((ask): Command => ({
    id: ask.id,
    label: ask.label,
    group: 'Notes',
    about: ['Words'],
    touch: `select the words, then Note… under them; or hold a word, then ${ask.label}`,
    when: (ctx) => !verbs.composing() && Option.isSome(notedAbout(ctx, verbs.selection())),
    run: quietly((ctx) =>
      Option.map(notedAbout(ctx, verbs.selection()), (words) => verbs.note(words, ask.kind)),
    ),
  }));
