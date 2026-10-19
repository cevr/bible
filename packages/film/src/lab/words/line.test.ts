import { describe, expect, it } from 'bun:test';
import { Result } from 'effect';
import { parse } from '../../core/narration.ts';
import { lineRows, piecesOf } from './line.ts';

/** `say` as `parse` reads it for beat `one`. */
const parsed = (say: string) => Result.getOrThrow(parse('one', say));

/** `say` read and laid out as beat `one` from offset `at`. */
const laid = (say: string, at = 0) => lineRows('one', parsed(say), at);

describe('a line laid out', () => {
  it('keeps each mark by the word it stands before, and each word at its offset', () => {
    const line = laid('The ball {rise}rises, then it {fall}falls.', 10);
    expect(line.marks).toEqual({ rise: 2, fall: 5 });
    expect(line.rows.map((r) => [r.text, r.from])).toEqual([
      ['The', 10],
      ['ball', 14],
      ['rises,', 19],
      ['then', 26],
      ['it', 31],
      ['falls.', 34],
    ]);
  });
});

describe('a line split at its marks', () => {
  it('sets a chip before the word each mark stands before', () => {
    expect(piecesOf(parsed('The ball {rise}rises, then it {fall}falls.'))).toEqual([
      { _tag: 'Said', text: 'The ball' },
      { _tag: 'Mark', name: 'rise' },
      { _tag: 'Said', text: 'rises, then it' },
      { _tag: 'Mark', name: 'fall' },
      { _tag: 'Said', text: 'falls.' },
    ]);
  });

  it('opens on a chip for a mark on the first word, and sets two at one word in the order the line names them', () => {
    expect(piecesOf(parsed('{open}Here {a}{b}it is.'))).toEqual([
      { _tag: 'Mark', name: 'open' },
      { _tag: 'Said', text: 'Here' },
      { _tag: 'Mark', name: 'a' },
      { _tag: 'Mark', name: 'b' },
      { _tag: 'Said', text: 'it is.' },
    ]);
  });

  it("keeps two marks at one word in the line's order whatever their names", () => {
    expect(piecesOf(parsed('Here {b}{2}it is.'))).toEqual([
      { _tag: 'Said', text: 'Here' },
      { _tag: 'Mark', name: 'b' },
      { _tag: 'Mark', name: '2' },
      { _tag: 'Said', text: 'it is.' },
    ]);
  });

  it('is the words alone for a line with no mark', () => {
    expect(piecesOf(parsed('Nothing moves here.'))).toEqual([
      { _tag: 'Said', text: 'Nothing moves here.' },
    ]);
  });
});
