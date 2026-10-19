// A beat's line as the words reader lays it out, pure: its spoken words, each
// with its offset in the one text the page paints, and its `{mark}`s, each by
// the word it stands before (`SectionRows.marks`). The reader keeps the marks
// beside the words, and the studio's code view sets the line over the code
// with a chip at each mark (`piecesOf`, from the parsed line, whose marks
// keep the order the line names them), so the script lines up with the code
// mark by mark.

import { Array as Arr, Data, Option, Order } from 'effect';
import type { Parsed } from '../../core/narration.ts';
import type { Row, SectionRows } from '../transcript/lit.ts';

/**
 * Beat `id`'s line, as `parse` read it, laid out from offset `at` of the
 * page's one text: each word with its offset, a space after it, and each
 * mark by the index of the word it stands before.
 */
export const lineRows = (id: string, parsed: Parsed, at: number): SectionRows => {
  let from = at;
  return {
    id,
    take: '',
    marks: Object.fromEntries(parsed.marks),
    rows: parsed.spoken.split(' ').map((text, index): Row => {
      const row = { index, text, struck: false, from, start: Option.none<number>() };
      from += text.length + 1;
      return row;
    }),
  };
};

/** A piece of a line split at its marks: words said, or a mark's chip. */
export type LinePiece = Data.TaggedEnum<{
  Said: { readonly text: string };
  Mark: { readonly name: string };
}>;
export const LinePiece = Data.taggedEnum<LinePiece>();

/**
 * A line, as `parse` read it, split at its marks, in reading order: each
 * mark's chip before the word it stands before (two at one word in the order
 * the line names them, whatever their names), a mark past the last word
 * after the words, and the words between marks as one piece.
 */
export const piecesOf = (parsed: Parsed): ReadonlyArray<LinePiece> => {
  // A stable sort of the parse's marks, which keep the line's order: a record's keys would put `{2}` first.
  const marks = Arr.sort(
    [...parsed.marks],
    Order.mapInput(Order.Number, ([, word]: readonly [string, number]) => word),
  );
  const words = parsed.spoken
    .split(' ')
    .map((text, index) => ({ index, text }))
    .filter((r) => r.text !== '');
  const pieces: Array<LinePiece> = [];
  let next = 0;
  const said = (to: number) => {
    const text = words
      .filter((r) => r.index >= next && r.index < to)
      .map((r) => r.text)
      .join(' ');
    if (text !== '') pieces.push(LinePiece.Said({ text }));
    next = Math.max(next, to);
  };
  for (const [name, word] of marks) {
    said(word);
    pieces.push(LinePiece.Mark({ name }));
  }
  said(Number.POSITIVE_INFINITY);
  return pieces;
};
