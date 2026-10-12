// A talk's edit rewritten by its literal, text in and text out: a Cut adds
// its words to a section's runs (a `cut` added after `to` when it has none),
// a Restore takes them out (the `cut` taken away when it strikes none), a
// mark goes where the section names its marks; anything the literal does not
// prove is refused, and words already so leave the text as it is.

import { describe, expect, it } from 'effect-bun-test';
import { Effect, Result } from 'effect';
import { editMark, editStrikes, markMissed } from './talk-source.ts';

const at = { file: 'talk.ts', target: 'the test' };

const talkOf = (sections: string) => `export const talk = {
  title: "Why",
  format: "question",
  takes: { a: "take" },
  sections: [
${sections}
  ],
};
`;

const LAW = '    { id: "law", take: "a", from: 0, to: 5 },';
const NEED = '    { id: "need", take: "a", from: 6, to: 11, cut: [[7, 7]], knobs: { zoom: 1.5 } },';
const SOURCE = talkOf(`${LAW}\n${NEED}`);

const reason = <A>(result: Result.Result<A, { readonly reason: string }>) =>
  Result.match(result, { onSuccess: () => '', onFailure: (e) => e.reason });

describe('talk source', () => {
  it.effect('a Cut adds a cut after `to`, and its Restore takes it away again', () =>
    Effect.sync(() => {
      const cut = Result.getOrThrow(editStrikes(at, SOURCE, 'law', { from: 1, to: 2 }, true));
      expect(cut).toBe(SOURCE.replace('to: 5 }', 'to: 5, cut: [[1, 2]] }'));
      expect(Result.getOrThrow(editStrikes(at, cut, 'law', { from: 1, to: 2 }, false))).toBe(
        SOURCE,
      );
    }),
  );

  it.effect('a cut that is not the last key is taken away with its comma', () =>
    Effect.sync(() => {
      expect(Result.getOrThrow(editStrikes(at, SOURCE, 'need', { from: 7, to: 7 }, false))).toBe(
        SOURCE.replace('cut: [[7, 7]], ', ''),
      );
    }),
  );

  it.effect('words already so leave the text as it is', () =>
    Effect.sync(() => {
      expect(Result.getOrThrow(editStrikes(at, SOURCE, 'need', { from: 7, to: 7 }, true))).toBe(
        SOURCE,
      );
      expect(Result.getOrThrow(editStrikes(at, SOURCE, 'law', { from: 3, to: 3 }, false))).toBe(
        SOURCE,
      );
    }),
  );

  it.effect(
    'a section written over lines keeps its lines and comments: a Cut writes its cut on a line of its own, and Restore takes that line away again',
    () =>
      Effect.sync(() => {
        const lines = talkOf(
          [
            '    // the answer',
            '    {',
            '      id: "need", // it plays through the pause',
            '      take: "a",',
            '      from: 6,',
            '      to: 11,',
            '      // the frame holds the speaker',
            '      knobs: { zoom: 1.5 },',
            '    },',
          ].join('\n'),
        );
        const cut = Result.getOrThrow(editStrikes(at, lines, 'need', { from: 8, to: 9 }, true));
        expect(cut).toBe(lines.replace('to: 11,\n', 'to: 11,\n      cut: [[8, 9]],\n'));
        expect(Result.getOrThrow(editStrikes(at, cut, 'need', { from: 8, to: 9 }, false))).toBe(
          lines,
        );
        // Its runs rewritten in place: the section's lines as they are.
        const more = Result.getOrThrow(editStrikes(at, cut, 'need', { from: 10, to: 10 }, true));
        expect(more).toBe(cut.replace('cut: [[8, 9]]', 'cut: [[8, 10]]'));
        expect(Result.getOrThrow(editStrikes(at, more, 'need', { from: 10, to: 10 }, false))).toBe(
          cut,
        );
        // A mark goes on a line of its own too.
        expect(Result.getOrThrow(editMark(at, lines, 'need', 'grace', 7))).toBe(
          lines.replace('to: 11,\n', 'to: 11,\n      marks: { grace: 7 },\n'),
        );
      }),
  );

  it.effect(
    'a section the formatter broke for a cut of two runs is put back on one line by the write that leaves it one; one with a comment keeps its lines',
    () =>
      Effect.sync(() => {
        // As oxfmt prints a cut of two runs: a run to a line, the section broken with it.
        const broken = talkOf(
          '    {\n      id: "law",\n      take: "a",\n      from: 0,\n      to: 5,\n      cut: [\n        [1, 1],\n        [3, 3],\n      ],\n    },',
        );
        expect(Result.getOrThrow(editStrikes(at, broken, 'law', { from: 3, to: 3 }, false))).toBe(
          talkOf('    { id: "law", take: "a", from: 0, to: 5, cut: [[1, 1]] },'),
        );
        expect(Result.getOrThrow(editStrikes(at, broken, 'law', { from: 1, to: 3 }, false))).toBe(
          talkOf('    { id: "law", take: "a", from: 0, to: 5 },'),
        );
        // Still two runs or more: still the formatter's lines, its runs written in place.
        expect(Result.getOrThrow(editStrikes(at, broken, 'law', { from: 5, to: 5 }, true))).toBe(
          broken.replace(
            '[\n        [1, 1],\n        [3, 3],\n      ]',
            '[[1, 1], [3, 3], [5, 5]]',
          ),
        );
        const authored = broken.replace('      to: 5,\n', '      to: 5, // the question\n');
        expect(Result.getOrThrow(editStrikes(at, authored, 'law', { from: 3, to: 3 }, false))).toBe(
          authored.replace('[\n        [1, 1],\n        [3, 3],\n      ]', '[[1, 1]]'),
        );
      }),
  );

  it.effect(
    'a Restore that leaves the section striking nothing takes the cut away and keeps the comments around it',
    () =>
      Effect.sync(() => {
        const commented = talkOf(
          [
            '    {',
            '      id: "law",',
            '      take: "a",',
            '      from: 0,',
            '      to: 5, // the question ends here',
            '      cut: [[1, 1]], // the false start',
            '      // zoom in for the punchline',
            '      knobs: { zoom: 1.2 },',
            '    },',
          ].join('\n'),
        );
        expect(
          Result.getOrThrow(editStrikes(at, commented, 'law', { from: 1, to: 1 }, false)),
        ).toBe(
          commented.replace('      cut: [[1, 1]], // the false start', '      // the false start'),
        );
        // A comment before the cut's own line stays, and so does the line's own.
        const above = commented.replace(
          '      cut: [[1, 1]], // the false start',
          '      // the false start\n      cut: [[1, 1]],',
        );
        expect(Result.getOrThrow(editStrikes(at, above, 'law', { from: 1, to: 1 }, false))).toBe(
          above.replace('\n      cut: [[1, 1]],', ''),
        );
      }),
  );

  it.effect(
    "a mark's name is the talk's own (`MarkName`): a name its decode would drop is refused, and nothing is written",
    () =>
      Effect.sync(() => {
        expect(reason(editMark(at, SOURCE, 'law', 'café', 3))).toContain(
          '"café" is not a mark\'s name',
        );
        expect(reason(editMark(at, SOURCE, 'law', 'two words', 3))).toContain(
          'a mark is letters, digits, _ and -',
        );
      }),
  );

  it.effect(
    'a mark reads back only when the talk decoded from the text has it: a key its decode drops is missed',
    () =>
      Effect.sync(() => {
        const dropped = SOURCE.replace('to: 5 }', "to: 5, marks: { 'café': 3 } }");
        expect(Result.getOrThrow(markMissed(at, dropped, 'law', 'café', 3))).toEqual([
          'the talk read back has no mark café on word 3 of law',
        ]);
        const kept = SOURCE.replace('to: 5 }', 'to: 5, marks: { law: 3 } }');
        expect(Result.getOrThrow(markMissed(at, kept, 'law', 'law', 3))).toEqual([]);
      }),
  );

  it.effect(
    'a mark is added to the marks there, or after the cut, its name quoted when it is no name',
    () =>
      Effect.sync(() => {
        const first = Result.getOrThrow(editMark(at, SOURCE, 'need', 'grace-1', 8));
        expect(first).toBe(
          SOURCE.replace('cut: [[7, 7]],', "cut: [[7, 7]], marks: { 'grace-1': 8 },"),
        );
        expect(Result.getOrThrow(editMark(at, first, 'need', 'law', 9))).toBe(
          SOURCE.replace('cut: [[7, 7]],', "cut: [[7, 7]], marks: { 'grace-1': 8, law: 9 },"),
        );
        expect(Result.getOrThrow(editMark(at, first, 'need', 'grace-1', 8))).toBe(first);
        expect(reason(editMark(at, first, 'need', 'grace-1', 9))).toBe(
          'mark "grace-1" is on word 8 of "need" already: name this one another way',
        );
      }),
  );

  it.effect('what the literal does not prove is refused', () =>
    Effect.sync(() => {
      const computed = SOURCE.replace('cut: [[7, 7]]', 'cut: STRUCK');
      expect(reason(editStrikes(at, computed, 'need', { from: 8, to: 8 }, true))).toBe(
        'its cut is not a literal, so it is not provable',
      );
      expect(reason(editStrikes(at, SOURCE, 'law', { from: 4, to: 6 }, true))).toBe(
        'words 4–6 are not in section "law", which plays words 0–5',
      );
      expect(
        reason(editStrikes(at, 'export const talk = make();', 'law', { from: 1, to: 1 }, true)),
      ).toBe('it exports no `talk` object literal (`export const talk = {…}`)');
    }),
  );
});
