// The notes on the Script's words: each on the words of its line where they
// still read as they did, else on the first run of the line that does, else
// at the line's end; the reader shows each until it is resolved, and the one
// selected whatever its status; a note's words are underlined, a
// correction's or a removal's struck.

import { describe, expect, test } from 'bun:test';
import { Option } from 'effect';
import { addNote, emptyNotes, resolveNote } from '../../core/notes.ts';
import type { NoteDraft, NoteWords } from '../../core/schema.ts';
import type { Row, SectionRows } from '../transcript/lit.ts';
import { notedIn, notedOn, notedPainted } from './noted.ts';

/** Beat `id`'s line saying `said`, each word's offset in the one text running on from 0. */
const lineOf = (id: string, said: string): SectionRows => {
  let from = 0;
  const rows = said.split(' ').map((text, index): Row => {
    const row: Row = { index, text, struck: false, from, start: Option.none() };
    from += text.length + 1;
    return row;
  });
  return { id, take: '', rows, marks: {} };
};

// "By"(0) "grace"(3) "you"(9) "are"(13) "saved"(17) "through"(23) "faith"(31)
const line = lineOf('gift', 'By grace you are saved through faith');
const words = (from: number, to: number, text: string): NoteWords => ({
  beat: 'gift',
  from,
  to,
  text,
});
const indices = (rows: ReadonlyArray<Row>) => rows.map((r) => r.index);

/** The words of `on` the reader shows a note on `noted` on, by their indices. */
const placed = (on: SectionRows, noted: NoteWords): ReadonlyArray<number> =>
  notedOn(
    addNote(
      emptyNotes('f'),
      { scene: 'gift', T: 1, frame: 30, text: 'see', words: noted },
      '2026-10-13T00:00:00Z',
    ).notes,
    on,
    Option.none(),
  ).flatMap((n) => indices(n.rows));

describe('where a note on words stands in its line', () => {
  test('on its words, while they read as they did', () => {
    expect(placed(line, words(1, 1, 'grace'))).toEqual([1]);
    expect(placed(line, words(3, 4, 'are saved'))).toEqual([3, 4]);
  });

  test('on the first run that reads as they did, once a word before them moved them', () => {
    const moved = lineOf('gift', 'By His grace you are saved through faith');
    expect(placed(moved, words(1, 1, 'grace'))).toEqual([2]);
    expect(placed(moved, words(3, 4, 'are saved'))).toEqual([4, 5]);
  });

  test('nowhere, once the line no longer says them', () => {
    expect(placed(line, words(1, 1, 'mercy'))).toEqual([]);
    expect(placed(line, words(6, 8, 'faith and hope'))).toEqual([]);
  });
});

describe('which notes the reader shows on a line, and how', () => {
  const draft = (over: Partial<NoteDraft>): NoteDraft => ({
    scene: 'gift',
    T: 1,
    frame: 30,
    text: 'see',
    ...over,
  });
  const made = [
    draft({ words: words(1, 1, 'grace'), kind: 'note', text: 'slower' }),
    draft({ words: words(3, 4, 'are saved'), kind: 'correction', replace: 'were saved' }),
    draft({ words: words(6, 6, 'faith'), kind: 'removal' }),
    draft({ text: 'the frame alone' }),
    draft({ scene: 'other', words: { beat: 'other', from: 0, to: 0, text: 'By' } }),
    draft({ words: words(0, 0, 'Once') }),
  ].reduce((file, d) => addNote(file, d, '2026-10-13T00:00:00Z'), emptyNotes('f'));
  const notes = resolveNote(made, 'n3').notes;
  const ids = (noted: ReadonlyArray<{ readonly note: { readonly id: string } }>) =>
    noted.map((n) => n.note.id);

  test("each on the line's words not yet resolved, in the order made: none of the frame alone, none of another line", () => {
    const shown = notedOn(notes, line, Option.none());
    expect(ids(shown)).toEqual(['n1', 'n2', 'n6']);
    // A note that says nothing of what it asks is a note.
    expect(shown.map((n) => n.kind)).toEqual(['note', 'correction', 'note']);
  });

  test('the note selected, whatever its status', () => {
    expect(ids(notedOn(notes, line, Option.some('n3')))).toEqual(['n1', 'n2', 'n3', 'n6']);
  });

  test('each marker after its last word; one whose words are gone at the line end', () => {
    const at = notedIn(notedOn(notes, line, Option.some('n3')));
    expect(ids(at.at(1))).toEqual(['n1']);
    expect(ids(at.at(3))).toEqual([]);
    expect(ids(at.at(4))).toEqual(['n2']);
    expect(ids(at.at(6))).toEqual(['n3']);
    expect(ids(at.end)).toEqual(['n6']);
  });

  test("a note's words underlined, a correction's or a removal's struck, as ranges of the one text", () => {
    expect(notedPainted(notedOn(notes, line, Option.some('n3')))).toEqual({
      'lab-noted': [[3, 8]],
      'lab-struck': [
        [13, 16],
        [17, 22],
        [31, 36],
      ],
    });
    expect(notedPainted([])).toEqual({ 'lab-noted': [], 'lab-struck': [] });
  });
});
