// The Script's note commands: Note, Correct and Remove these words, about
// the word a menu opened on (the words selected when it lies in them), a
// line's words (the selection in it, else all of them) or, from ⌘K, the
// words selected; none offered while a note is being made.

import { Effect, Option } from 'effect';
import { describe, expect, test } from 'effect-bun-test';
import { BY_BUTTON } from '../../command/command.ts';
import { type Context, contextAt, withSelection } from '../../command/context.ts';
import { Selection, type WordsSelection } from '../../command/selection.ts';
import type { NoteKind } from '../../core/schema.ts';
import { noteCommands, notedAbout } from './commands.ts';

const here = contextAt('lab', '/films/f/script/gift#t=1');

const words = (scene: string, from: number, to: number): WordsSelection =>
  Selection.cases.Words.make({ scene, from, to });
/** The menu opened on `on` (a word, or a line's words). */
const onWords = (on: WordsSelection): Context => withSelection(here, [on]);

describe('the words a note is about', () => {
  const selection = Option.some(words('gift', 2, 4));

  test('a word inside the selection is about the selection; any other word about itself', () => {
    expect(notedAbout(onWords(words('gift', 3, 3)), selection)).toEqual(selection);
    expect(notedAbout(onWords(words('gift', 6, 6)), selection)).toEqual(
      Option.some(words('gift', 6, 6)),
    );
    expect(notedAbout(onWords(words('gift', 6, 6)), Option.none())).toEqual(
      Option.some(words('gift', 6, 6)),
    );
  });

  test("a line is about the selection in it, else all its words; another line's words are not its", () => {
    const line = words('gift', 0, 8);
    expect(notedAbout(onWords(line), selection)).toEqual(selection);
    expect(notedAbout(onWords(line), Option.none())).toEqual(Option.some(line));
    expect(notedAbout(onWords(words('other', 0, 5)), selection)).toEqual(
      Option.some(words('other', 0, 5)),
    );
  });

  test('the page (⌘K) is about the selection, and nothing without one', () => {
    expect(notedAbout(here, selection)).toEqual(selection);
    expect(notedAbout(here, Option.none())).toEqual(Option.none());
  });
});

describe('Note, Correct and Remove these words', () => {
  /** The commands over `selection`, a note being made or not, each note begun written to `log`. */
  const over = (
    log: Array<readonly [WordsSelection, NoteKind]>,
    selection: Option.Option<WordsSelection>,
    composing = false,
  ) =>
    noteCommands({
      selection: () => selection,
      composing: () => composing,
      note: (w, kind) => {
        log.push([w, kind]);
      },
    });

  test('each begins a note on the words it is about, asking its own of them', () => {
    const log: Array<readonly [WordsSelection, NoteKind]> = [];
    const commands = over(log, Option.some(words('gift', 2, 4)));
    expect(commands.map((c) => [c.id, c.label])).toEqual([
      ['script.note', 'Note these words'],
      ['script.correct', 'Correct these words'],
      ['script.remove', 'Remove these words'],
    ]);
    const ctx = onWords(words('gift', 3, 3));
    for (const c of commands) {
      expect(c.when(ctx)).toBe(true);
      Effect.runSync(c.run(ctx, { ...BY_BUTTON, input: 'pointer' }));
    }
    expect(log).toEqual([
      [words('gift', 2, 4), 'note'],
      [words('gift', 2, 4), 'correction'],
      [words('gift', 2, 4), 'removal'],
    ]);
  });

  test('none is offered while a note is being made, nor on the page with nothing selected', () => {
    const ctx = onWords(words('gift', 3, 3));
    for (const c of over([], Option.none(), true)) expect(c.when(ctx)).toBe(false);
    for (const c of over([], Option.none())) expect(c.when(here)).toBe(false);
  });
});
