// The Transcript view as the page's commands: Show the transcript (⇧T, on
// the Lab's context menu and ⌘K; the view follows the frame) on a talk, and
// Hide the transcript (the same key while it is open); and the view's verbs
// on its words, Select to here, Cut, Restore and Mark here, on the context
// menu of a word (a right-click, or a finger held still on it) and run by the
// view's buttons, so a phone, which has no Shift, selects a range as a laptop
// does: tap the first word, hold the last, Select to here.
//
// A verb acts on the words the menu opened on (`wordsAbout`): a word inside
// the words selected is about them all, any other word about itself; the
// view's buttons, opened on no word, act on the words selected. Pure but for
// what `TranscriptVerbs` does.

import { Boolean as Bool, Option } from 'effect';
import { type Command, quietly } from '../../command/command.ts';
import { type Context, selected } from '../../command/context.ts';
import { Selection, type WordsSelection } from '../../command/selection.ts';
import type { Row } from './lit.ts';

/** The id of the Transcript view's command. */
const TRANSCRIPT = 'lab.transcript';

/** What the commands drive: the film and the view as the URL holds them, the talk read, and its writes. */
interface TranscriptVerbs {
  /** Whether the film is a talk: only a talk has a transcript. */
  readonly talk: () => boolean;
  /** Whether the view is open. */
  readonly open: () => boolean;
  readonly show: () => void;
  readonly hide: () => void;
  /** The words selected, as the URL holds them. */
  readonly selection: () => Option.Option<WordsSelection>;
  /** The words of `words` as the talk read has them: none for words it does not have. */
  readonly rows: (words: WordsSelection) => ReadonlyArray<Row>;
  /** Whether a write of the film's source is out: the view's writes wait for its answer. */
  readonly writing: () => boolean;
  /** Select `words`. */
  readonly select: (words: WordsSelection) => void;
  /** Strike `words` from the cut, play them again, or mark the first the cut plays. */
  readonly cut: (words: WordsSelection) => void;
  readonly restore: (words: WordsSelection) => void;
  readonly mark: (words: WordsSelection) => void;
}

/** Whether `inner` lies within `outer`: one section, and its words among outer's. */
const within = (inner: WordsSelection, outer: WordsSelection): boolean =>
  inner.scene === outer.scene && inner.from >= outer.from && inner.to <= outer.to;

/**
 * The words a verb about `ctx` acts on, the view's selection being
 * `selection`: a word the menu opened on (one word) inside the selection is
 * about the selection, any other word about itself; opened on no one word
 * (a section's words, or the view's buttons: the page), the selection, unless
 * the menu is about another section's.
 */
export const wordsAbout = (
  ctx: Context,
  selection: Option.Option<WordsSelection>,
): Option.Option<WordsSelection> => {
  const about = selected(ctx, 'Words');
  return Option.match(
    Option.filter(about, (w) => w.from === w.to),
    {
      onSome: (word) =>
        Option.orElse(
          Option.filter(selection, (s) => within(word, s)),
          () => Option.some(word),
        ),
      onNone: () =>
        Option.filter(selection, (s) => !Option.exists(about, (w) => w.scene !== s.scene)),
    },
  );
};

/**
 * The words selected once `selection` is extended to word `index` of
 * `scene`: from its first word to that one, whichever comes first; a word
 * of another section (or no selection) is selected alone. What a shift-tap
 * and Select to here both make.
 */
export const extendedTo = (
  selection: Option.Option<WordsSelection>,
  scene: string,
  index: number,
): WordsSelection => {
  const from = Option.getOrElse(
    Option.map(
      Option.filter(selection, (s) => s.scene === scene),
      (s) => s.from,
    ),
    () => index,
  );
  return Selection.cases.Words.make({
    scene,
    from: Math.min(from, index),
    to: Math.max(from, index),
  });
};

/**
 * The words Select to here selects from a word the menu opened on (one
 * word): the selection in its section extended to it; none with no selection
 * there, or when it would select what is selected already.
 */
const selectedTo = (
  ctx: Context,
  selection: Option.Option<WordsSelection>,
): Option.Option<WordsSelection> =>
  Option.flatMap(
    Option.filter(selected(ctx, 'Words'), (w) => w.from === w.to),
    (word) =>
      Option.filter(
        Option.map(
          Option.filter(selection, (s) => s.scene === word.scene),
          () => extendedTo(selection, word.scene, word.from),
        ),
        (to) => !Option.exists(selection, (s) => s.from === to.from && s.to === to.to),
      ),
  );

/** Whether `rows` has a word the cut plays: what Cut strikes, and Mark here marks. */
export const playsAny = (rows: ReadonlyArray<Row>): boolean => rows.some((r) => !r.struck);

/** Whether `rows` has a word the cut strikes: what Restore plays again. */
export const strikesAny = (rows: ReadonlyArray<Row>): boolean => rows.some((r) => r.struck);

/** The Transcript view's commands over `verbs`. */
export const transcriptCommands = (verbs: TranscriptVerbs): ReadonlyArray<Command> => {
  const about = (ctx: Context) => wordsAbout(ctx, verbs.selection());
  /** A write's command: offered on words whose rows `fits`, while the view is open and no write is out. */
  const writes = (
    command: Pick<Command, 'id' | 'label' | 'touch'>,
    fits: (rows: ReadonlyArray<Row>) => boolean,
    write: (words: WordsSelection) => void,
  ): Command => ({
    ...command,
    group: 'Transcript',
    about: ['Words'],
    when: (ctx) =>
      verbs.open() &&
      !verbs.writing() &&
      Option.exists(about(ctx), (words) => fits(verbs.rows(words))),
    run: quietly((ctx) => Option.map(about(ctx), write)),
  });
  return [
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
    {
      id: 'transcript.select-to',
      label: 'Select to here',
      group: 'Transcript',
      about: ['Words'],
      touch: 'tap the first word, hold the last, then Select to here',
      when: (ctx) => verbs.open() && Option.isSome(selectedTo(ctx, verbs.selection())),
      run: quietly((ctx) => Option.map(selectedTo(ctx, verbs.selection()), verbs.select)),
    },
    writes(
      {
        id: 'transcript.cut',
        label: 'Cut',
        touch: 'select the words, then Cut under them, or hold a word, then Cut',
      },
      playsAny,
      verbs.cut,
    ),
    writes(
      {
        id: 'transcript.restore',
        label: 'Restore',
        touch: 'Show cuts, select the words, then Restore under them, or hold a word, then Restore',
      },
      strikesAny,
      verbs.restore,
    ),
    writes(
      {
        id: 'transcript.mark',
        label: 'Mark here',
        touch: 'select the word, then Mark here under it, or hold the word, then Mark here',
      },
      playsAny,
      verbs.mark,
    ),
  ];
};
