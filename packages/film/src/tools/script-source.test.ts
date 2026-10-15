import { describe, expect, test } from 'bun:test';
import { Result } from 'effect';
import type { Mark } from '../core/delivery.ts';
import { editMarks, sayMissed } from './script-source.ts';

const SCRIPT = `import { defineScript } from '@bible/film/core';

export const script = defineScript([
  {
    id: 'cold',
    // The joke.
    say: "{open}Not by works. It's {@ask}by faith.",
    cite: ['Eph 2:8'],
  },
  { id: 'title', picture: 'The title.' },
]);
`;

const marks: ReadonlyArray<Mark> = [
  { _tag: 'Hold', before: 3, seconds: 1.5 },
  { _tag: 'Stress', word: 5 },
];

/** Beat cold's words as a page reads them: its cues and marks never said. */
const READ = "Not by works. It's by faith.";

describe('a mark write of script.ts', () => {
  test('splices the beat’s say and nothing else', () => {
    const after = Result.getOrThrow(editMarks(SCRIPT, 'cold', marks, READ));
    expect(after).toContain(`say: '{open}Not by works. {//1.5} It\\'s {@ask}by {*}faith.',`);
    expect(after.replace(/say: .*\n/, '')).toBe(SCRIPT.replace(/say: .*\n/, ''));
    expect(Result.getOrThrow(sayMissed(after, SCRIPT, 'cold', marks))).toEqual([]);
  });

  test('takes the marks out again', () => {
    const marked = Result.getOrThrow(editMarks(SCRIPT, 'cold', marks, READ));
    const plain = Result.getOrThrow(editMarks(marked, 'cold', [], READ));
    expect(plain).toContain(`say: '{open}Not by works. It\\'s {@ask}by faith.',`);
  });

  test('refuses a mark that does not fit the words, or a beat that says nothing', () => {
    const misfit = editMarks(SCRIPT, 'cold', [{ _tag: 'Breath', before: 0 }], READ);
    expect(Result.isFailure(misfit) && misfit.failure.reason).toContain('pauses outside the line');
    const silent = editMarks(SCRIPT, 'title', marks, '');
    expect(Result.isFailure(silent) && silent.failure.reason).toContain('says no plain string');
    const unknown = editMarks(SCRIPT, 'nope', marks, '');
    expect(Result.isFailure(unknown) && unknown.failure.reason).toContain('0 times');
  });

  test('refuses marks made on words the line no longer says: a mark would land on another word', () => {
    // The page read the line before "freely" went in: its stress on word 5 meant "faith".
    const reworded = SCRIPT.replace("It's {@ask}by faith.", "It's {@ask}freely by faith.");
    const stale = editMarks(reworded, 'cold', marks, READ);
    expect(Result.isFailure(stale) && stale.failure.reason).toBe(
      `its words changed since the page read them (it says "Not by works. It's freely by faith." now): read it again and mark it there`,
    );
  });

  test('a text that reads other marks, or other words, is missed', () => {
    const after = Result.getOrThrow(editMarks(SCRIPT, 'cold', marks, READ));
    expect(Result.getOrThrow(sayMissed(after, SCRIPT, 'cold', marks.slice(1)))).toHaveLength(1);
    const reworded = after.replace('Not by works.', 'Not by deeds.');
    expect(Result.getOrThrow(sayMissed(reworded, SCRIPT, 'cold', marks))).toHaveLength(1);
  });
});
