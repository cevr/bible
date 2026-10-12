// A talk's edit rewritten by its literal, text in and text out: a Cut adds
// its words to a section's runs (a `cut` added after `to` when it has none),
// a Restore takes them out (the `cut` taken away when it strikes none), a
// mark goes where the section names its marks; anything the literal does not
// prove is refused, and words already so leave the text as it is.

import { describe, expect, it } from 'effect-bun-test';
import { Effect, Result } from 'effect';
import { editMark, editStrikes } from './talk-source.ts';

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

  it.effect('a section the formatter broke over lines is let fit on one again', () =>
    Effect.sync(() => {
      const broken = talkOf(
        '    {\n      id: "law",\n      take: "a",\n      from: 0,\n      to: 5,\n      cut: [\n        [1, 1],\n        [3, 3],\n      ],\n    },',
      );
      expect(Result.getOrThrow(editStrikes(at, broken, 'law', { from: 3, to: 3 }, false))).toBe(
        talkOf(
          '    { id: "law",\n      take: "a",\n      from: 0,\n      to: 5,\n      cut: [[1, 1]],\n    },',
        ),
      );
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
