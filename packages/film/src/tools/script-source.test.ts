import { describe, expect, test } from 'bun:test';
import { Option, Result } from 'effect';
import type { LineRead, Mark } from '../core/delivery.ts';
import {
  editHold,
  editMarks,
  editOrder,
  holdMissed,
  orderMissed,
  sayMissed,
} from './script-source.ts';

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

/** Beat cold's words as a page reads them (its cues and marks never said), and its line as read: no marks yet. */
const WORDS = "Not by works. It's by faith.";
const READ = Option.some<LineRead>({ spoken: WORDS, marks: [] });

describe('a mark write of script.ts', () => {
  test('splices the beat’s say and nothing else', () => {
    const after = Result.getOrThrow(editMarks(SCRIPT, 'cold', marks, READ));
    expect(after).toContain(`say: '{open}Not by works. {//1.5} It\\'s {@ask}by {*}faith.',`);
    expect(after.replace(/say: .*\n/, '')).toBe(SCRIPT.replace(/say: .*\n/, ''));
    expect(Result.getOrThrow(sayMissed(after, SCRIPT, 'cold', marks))).toEqual([]);
  });

  test('takes the marks out again', () => {
    const marked = Result.getOrThrow(editMarks(SCRIPT, 'cold', marks, READ));
    const plain = Result.getOrThrow(
      editMarks(marked, 'cold', [], Option.some({ spoken: WORDS, marks })),
    );
    expect(plain).toContain(`say: '{open}Not by works. It\\'s {@ask}by faith.',`);
  });

  test('refuses a mark that does not fit the words, or a beat that says nothing', () => {
    const misfit = editMarks(SCRIPT, 'cold', [{ _tag: 'Breath', before: 0 }], READ);
    expect(Result.isFailure(misfit) && misfit.failure.reason).toContain('pauses outside the line');
    const silent = editMarks(SCRIPT, 'title', marks, Option.some({ spoken: '', marks: [] }));
    expect(Result.isFailure(silent) && silent.failure.reason).toContain('says no plain string');
    const unknown = editMarks(SCRIPT, 'nope', marks, Option.some({ spoken: '', marks: [] }));
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

  test('refuses marks made on a line marked since: they would write over the marks made elsewhere', () => {
    // The laptop stressed "faith"; the phone, still showing the line unmarked, stresses "works".
    const laptop = Result.getOrThrow(
      editMarks(SCRIPT, 'cold', [{ _tag: 'Stress', word: 5 }], READ),
    );
    const phone = editMarks(laptop, 'cold', [{ _tag: 'Stress', word: 2 }], READ);
    expect(Result.isFailure(phone) && phone.failure.reason).toBe(
      'its marks changed since the page read them (marked elsewhere): read it again and mark it there',
    );
    // Read again, the phone's write keeps the laptop's stress and adds its own.
    const reread = Option.some<LineRead>({ spoken: WORDS, marks: [{ _tag: 'Stress', word: 5 }] });
    const both: ReadonlyArray<Mark> = [
      { _tag: 'Stress', word: 2 },
      { _tag: 'Stress', word: 5 },
    ];
    expect(Result.getOrThrow(editMarks(laptop, 'cold', both, reread))).toContain(
      `say: '{open}Not by {*}works. It\\'s {@ask}by {*}faith.',`,
    );
  });

  test('refuses a page older than the lab, which sent no line it read: reload it', () => {
    const older = editMarks(SCRIPT, 'cold', marks, Option.none());
    expect(Result.isFailure(older) && older.failure.reason).toBe(
      'this page is older than the lab: reload it, then mark again',
    );
  });

  test('a text that reads other marks, or other words, is missed', () => {
    const after = Result.getOrThrow(editMarks(SCRIPT, 'cold', marks, READ));
    expect(Result.getOrThrow(sayMissed(after, SCRIPT, 'cold', marks.slice(1)))).toHaveLength(1);
    const reworded = after.replace('Not by works.', 'Not by deeds.');
    expect(Result.getOrThrow(sayMissed(reworded, SCRIPT, 'cold', marks))).toHaveLength(1);
  });
});

const THREE = `export const script = [
  // The open.
  { id: 'cold', say: 'One.' },
  {
    id: 'look',
    // He looks.
    say: 'Two.',
    tail: 1.6,
  },
  { id: 'end', min: 3 }, // the close
];
`;

const ids = (source: string) => [...source.matchAll(/id: '(\w+)'/g)].map((m) => m[1]);

describe('a move of script.ts', () => {
  test('puts the beat before another, its comments with it, and reads back', () => {
    const after = Result.getOrThrow(editOrder(THREE, 'end', Option.some('look')));
    expect(ids(after)).toEqual(['cold', 'end', 'look']);
    expect(after).toContain("// The open.\n  { id: 'cold'");
    expect(after).toContain('// He looks.');
    expect(Result.getOrThrow(orderMissed(after, THREE, 'end', Option.some('look')))).toEqual([]);
  });

  test('moves the first beat to the end and back again byte for byte', () => {
    const moved = Result.getOrThrow(editOrder(THREE, 'cold', Option.none()));
    expect(ids(moved)).toEqual(['look', 'end', 'cold']);
    const back = Result.getOrThrow(editOrder(moved, 'cold', Option.some('look')));
    expect(ids(back)).toEqual(['cold', 'look', 'end']);
  });

  test('says what a read-back misses, and refuses a beat it cannot name once', () => {
    expect(Result.getOrThrow(orderMissed(THREE, THREE, 'end', Option.some('look')))).toEqual([
      'the beats read cold, look, end, not cold, end, look',
    ]);
    const unknown = editOrder(THREE, 'nope', Option.none());
    expect(Result.isFailure(unknown) && unknown.failure.reason).toContain('0 times');
  });
});

describe('a hold of script.ts', () => {
  test('replaces a number, adds a field, and takes one away', () => {
    const longer = Result.getOrThrow(editHold(THREE, 'look', 'tail', Option.some(4.5)));
    expect(longer).toContain('tail: 4.5,');
    expect(Result.getOrThrow(holdMissed(longer, 'look', 'tail', Option.some(4.5)))).toEqual([]);
    const led = Result.getOrThrow(editHold(THREE, 'cold', 'lead', Option.some(1)));
    expect(Result.getOrThrow(holdMissed(led, 'cold', 'lead', Option.some(1)))).toEqual([]);
    const gone = Result.getOrThrow(editHold(THREE, 'look', 'tail', Option.none()));
    expect(gone).not.toContain('tail');
    expect(Result.getOrThrow(holdMissed(gone, 'look', 'tail', Option.none()))).toEqual([]);
    expect(Result.getOrThrow(holdMissed(gone, 'look', 'tail', Option.some(1.6)))).toEqual([
      'beat "look" holds its tail as none, not 1.6',
    ]);
  });

  test('refuses a hold the script computes', () => {
    const computed = THREE.replace('tail: 1.6', 'tail: HOLD');
    const refused = editHold(computed, 'look', 'tail', Option.some(2));
    expect(Result.isFailure(refused) && refused.failure.reason).toContain('by no number');
  });
});
