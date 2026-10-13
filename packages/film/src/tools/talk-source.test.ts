// A talk's edit rewritten by its literal, text in and text out: a Cut adds
// its words to a section's runs (a `cut` added after `to` when it has none),
// a Restore takes them out (the `cut` taken away when it strikes none), a
// mark goes where the section names its marks; anything the literal does not
// prove is refused, and words already so leave the text as it is. A write
// keeps every comment on the key it is about, which the sweep at the end
// proves over many layouts as the repo's oxfmt prints them.

import { BunServices } from '@effect/platform-bun';
import { describe, expect, it } from 'effect-bun-test';
import { Array as Arr, Effect, FileSystem, Option, Result, Schema, Stream } from 'effect';
import { ChildProcess, ChildProcessSpawner } from 'effect/process';
import { Talk } from '../core/talk.ts';
import { collect } from './process.ts';
import { commentsMoved, editMark, editStrikes, markMissed } from './talk-source.ts';

/** The timeout of a test here that spawns (bunx oxfmt): a cold start's time is the machine's (film/spawn-budget). */
const SPAWNS_MS = 30_000;

/** The repo's root: oxfmt run from it formats with the repo's config, as a film's file is formatted. */
const REPO = `${import.meta.dir}/../../../..`;

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
    "the write that leaves a cut of two runs or more one or none lets go of the break after its section's `{`, and of nothing else: every nested object and comment stays as it was",
    () =>
      Effect.sync(() => {
        // As oxfmt prints a cut of two runs: a run to a line, the section broken with it.
        const broken = talkOf(
          [
            '    {',
            '      id: "law",',
            '      take: "a",',
            '      from: 0,',
            '      to: 5,',
            '      cut: [',
            '        [1, 1],',
            '        [3, 3],',
            '      ],',
            '      knobs: {',
            '        zoom: 1.5,',
            '      },',
            '    },',
          ].join('\n'),
        );
        const runs = '[\n        [1, 1],\n        [3, 3],\n      ]';
        /** `text` with the break after the section's `{` let go. */
        const loosed = (text: string) => text.replace('    {\n      id', '    { id');
        expect(Result.getOrThrow(editStrikes(at, broken, 'law', { from: 3, to: 3 }, false))).toBe(
          loosed(broken.replace(runs, '[[1, 1]]')),
        );
        expect(Result.getOrThrow(editStrikes(at, broken, 'law', { from: 1, to: 3 }, false))).toBe(
          loosed(broken.replace(`\n      cut: ${runs},`, '')),
        );
        // Still two runs or more: still the formatter's lines, its runs written in place.
        expect(Result.getOrThrow(editStrikes(at, broken, 'law', { from: 5, to: 5 }, true))).toBe(
          broken.replace(runs, '[[1, 1], [3, 3], [5, 5]]'),
        );
        const authored = broken.replace('      to: 5,\n', '      to: 5, // the question\n');
        expect(Result.getOrThrow(editStrikes(at, authored, 'law', { from: 3, to: 3 }, false))).toBe(
          loosed(authored.replace(runs, '[[1, 1]]')),
        );
      }),
  );

  it.effect(
    "a key added goes after the comments on the line of the key before it, so each stays on its own key's line; Restore takes the added line away to the byte",
    () =>
      Effect.sync(() => {
        const section = (to: string) =>
          talkOf(
            [
              '    {',
              '      id: "law",',
              '      take: "a",',
              '      from: 0,',
              `      ${to}`,
              '    },',
            ].join('\n'),
          );
        for (const to of [
          'to: 5, // the question ends here',
          'to: 5, /* the question ends here */',
          'to: 5 /* the question ends here */,',
        ]) {
          const base = section(to);
          const cut = Result.getOrThrow(editStrikes(at, base, 'law', { from: 3, to: 3 }, true));
          expect(cut).toBe(base.replace(`${to}\n`, `${to}\n      cut: [[3, 3]],\n`));
          expect(Result.getOrThrow(editStrikes(at, cut, 'law', { from: 3, to: 3 }, false))).toBe(
            base,
          );
          expect(Result.getOrThrow(editMark(at, base, 'law', 'law', 3))).toBe(
            base.replace(`${to}\n`, `${to}\n      marks: { law: 3 },\n`),
          );
        }
        // The last key, with no comma of its own: the comma goes before its comment.
        const last = section('to: 5 // the question ends here');
        expect(Result.getOrThrow(editStrikes(at, last, 'law', { from: 3, to: 3 }, true))).toBe(
          last.replace(
            'to: 5 // the question ends here\n',
            'to: 5, // the question ends here\n      cut: [[3, 3]],\n',
          ),
        );
      }),
  );

  it.effect(
    'a mark added keeps every comment on its own key: after a commented last mark, after a commented cut, after a block comment hugging the key before, and inside an empty marks that holds only a comment',
    () =>
      Effect.sync(() => {
        const over = talkOf(
          [
            '    {',
            '      id: "law",',
            '      take: "a",',
            '      from: 0,',
            '      to: 5,',
            '      cut: [[2, 2]], // the false start',
            '      marks: {',
            '        why: 1, // the ask',
            '      },',
            '    },',
          ].join('\n'),
        );
        expect(Result.getOrThrow(editMark(at, over, 'law', 'law', 3))).toBe(
          over.replace('// the ask\n', '// the ask\n        law: 3,\n'),
        );
        const unmarked = over.replace('      marks: {\n        why: 1, // the ask\n      },\n', '');
        expect(Result.getOrThrow(editMark(at, unmarked, 'law', 'law', 3))).toBe(
          unmarked.replace(
            '// the false start\n',
            '// the false start\n      marks: { law: 3 },\n',
          ),
        );
        // On one line, a block comment hugging the key before stays with that key.
        const hugged = talkOf('    { id: "law", take: "a", from: 0, to: 5 /* the end */ },');
        const cut = Result.getOrThrow(editStrikes(at, hugged, 'law', { from: 3, to: 3 }, true));
        expect(cut).toBe(hugged.replace('/* the end */ }', '/* the end */, cut: [[3, 3]] }'));
        expect(Result.getOrThrow(editStrikes(at, cut, 'law', { from: 3, to: 3 }, false))).toBe(
          hugged,
        );
        expect(Result.getOrThrow(editMark(at, hugged, 'law', 'law', 3))).toBe(
          hugged.replace('/* the end */ }', '/* the end */, marks: { law: 3 } }'),
        );
        // Marks that hold only a comment, the marks' own: the mark goes in before it, so no
        // mark follows it and it stays theirs; on one line, the marks go over lines for that.
        const anchored = talkOf(
          '    { id: "law", take: "a", from: 0, to: 5, marks: { /* anchors to come */ } },',
        );
        expect(Result.getOrThrow(editMark(at, anchored, 'law', 'law', 3))).toBe(
          anchored.replace(
            '{ /* anchors to come */ }',
            '{\n      law: 3,\n      /* anchors to come */\n    }',
          ),
        );
        const anchoredOver = over.replace(
          '        why: 1, // the ask\n',
          '        // anchors to come\n',
        );
        expect(Result.getOrThrow(editMark(at, anchoredOver, 'law', 'law', 3))).toBe(
          anchoredOver.replace(
            '        // anchors to come\n',
            '        law: 3,\n        // anchors to come\n',
          ),
        );
      }),
  );

  it.effect(
    "a mark named as an object's inherited key (`constructor`, `toString`) is a mark like any other: written, already so, or on another word",
    () =>
      Effect.sync(() => {
        for (const name of ['constructor', 'toString']) {
          const marked = Result.getOrThrow(editMark(at, SOURCE, 'law', name, 3));
          expect(marked).toBe(SOURCE.replace('to: 5 }', `to: 5, marks: { ${name}: 3 } }`));
          expect(Result.getOrThrow(editMark(at, marked, 'law', name, 3))).toBe(marked);
          expect(reason(editMark(at, marked, 'law', name, 4))).toBe(
            `mark "${name}" is on word 3 of "law" already: name this one another way`,
          );
        }
      }),
  );

  it.effect(
    "a Restore that leaves the section striking nothing takes the cut away whole, its own comments with it, and keeps every other key's",
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
        // The comment ending the cut's line is the cut's: it goes with it. `to`'s and the
        // knobs' (the line above them) stay.
        expect(
          Result.getOrThrow(editStrikes(at, commented, 'law', { from: 1, to: 1 }, false)),
        ).toBe(commented.replace('      cut: [[1, 1]], // the false start\n', ''));
        // So does a comment on the line above the cut: the lines standing above a key are its.
        const above = commented.replace(
          '      cut: [[1, 1]], // the false start',
          '      // the false start\n      cut: [[1, 1]],',
        );
        expect(Result.getOrThrow(editStrikes(at, above, 'law', { from: 1, to: 1 }, false))).toBe(
          above.replace('      // the false start\n      cut: [[1, 1]],\n', ''),
        );
        // A rewrite of runs that hold a comment would leave it by no run: refused, nothing written.
        const inRuns = commented.replace('cut: [[1, 1]]', 'cut: [[1, 1] /* the um */]');
        expect(reason(editStrikes(at, inRuns, 'law', { from: 3, to: 3 }, true))).toContain(
          'its cut holds a comment among its runs',
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
    "`__proto__` is refused as a mark's name, in plain words, and nothing is written: in an object literal it sets the prototype, so the film's own import of the talk has no such mark",
    () =>
      Effect.gen(function* () {
        // What the film's import makes of the literal a write would leave: no own key.
        const written = SOURCE.replace('to: 5 }', 'to: 5, marks: { __proto__: 3 } }');
        const read = yield* imported([written, SOURCE.replace('to: 5 }', 'to: 5, marks: {} }')]);
        expect(Result.isSuccess(readAt(read, 1))).toBe(true);
        expect(readAt(read, 0)).toEqual(readAt(read, 1));
        expect(reason(editMark(at, SOURCE, 'law', '__proto__', 3))).toBe(
          '"__proto__" is not a mark\'s name (a mark is never named __proto__: in an object literal that name sets its prototype, so the talk would have no such mark): the talk would drop it',
        );
        // Read back as the import reads it, a literal `__proto__` marks nothing.
        expect(Result.getOrThrow(markMissed(at, written, 'law', '__proto__', 3))).toEqual([
          'the talk read back has no mark __proto__ on word 3 of law',
        ]);
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

  it.effect(
    "the server's read-back of a write finds a comment moved off its key, so such a write is refused whatever the layout: round 3's Restore, round 2's Cut",
    () =>
      Effect.sync(() => {
        /** A section over lines, its last keys `rest`, each line written with its comma. */
        const section = (...rest: ReadonlyArray<string>) =>
          talkOf(
            [
              '    {',
              '      id: "law",',
              '      take: "a",',
              '      from: 0,',
              ...rest,
              '    },',
            ].join('\n'),
          );
        const struck = section('      to: 5,', '      cut: [[2, 2]], // the "um"');
        // Round 3's Restore: the cut went, its comment stayed and labelled `to`.
        expect(
          Result.getOrThrow(commentsMoved(at, section('      to: 5, // the "um"'), struck)),
        ).toEqual([
          'the comment // the "um" stays, by sections[0].to, though sections[0].cut is gone',
        ]);
        // Round 2's Cut: `to`'s comment went onto the cut added.
        const asked = section('      to: 5, // the question');
        expect(
          Result.getOrThrow(
            commentsMoved(
              at,
              section('      to: 5,', '      cut: [[3, 3]], // the question'),
              asked,
            ),
          ),
        ).toEqual(['the comment // the question moves from sections[0].to to sections[0].cut']);
        // As this unit writes them: nothing moved.
        const cut = Result.getOrThrow(editStrikes(at, asked, 'law', { from: 3, to: 3 }, true));
        expect(Result.getOrThrow(commentsMoved(at, cut, asked))).toEqual([]);
        const played = Result.getOrThrow(editStrikes(at, struck, 'law', { from: 2, to: 2 }, false));
        expect(Result.getOrThrow(commentsMoved(at, played, struck))).toEqual([]);
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

// The property: a section of a talk, generated as an author might write it,
// and each write on it, as the repo's oxfmt prints them. Every comment
// names the owner it is about (`@to`, `@marks.why`, `@{}` for the section's
// own, `@marks{}` for its marks' own), so where it sits is checked against
// what it says, by the rule of ownership written out here on its own:
// - a comment on a key's line, before the line breaks and before the next
//   key on that line (after its value, or after its comma), is that key's;
// - after the break, it is the next key's (the lines standing above it), or
//   the object's own when no key follows (before its `}`);
// - on one line, after a comma, it hugs the next key; with no comma before
//   it, it is the key's before it;
// - before the first key (after the `{`), it is the first key's, and in an
//   object with no key, the object's own;
// - inside a value that is no object (the cut's runs), it is the key's.
// It is the formatter's own attachment: oxfmt breaks a line or joins one
// and never moves a comment off its owner.

/** A key of a section, as the property writes it. */
type Key = 'id' | 'take' | 'from' | 'to' | 'cut' | 'marks' | 'knobs';

/**
 * How a comment sits by its owner: `trailing` (`// @k` after the key's comma),
 * `after` (`/* @k *\/` after the comma), `hugging` (`/* @k *\/` after the
 * value, before the comma), `before` (`/* @k *\/` before the key), `above`
 * (`// @k` on the line above), `twoLine` (a block over two lines, hugging
 * the value), `inside` (in the cut's runs), `end` (an object's own, on a
 * line before its `}`: on one line an object with keys has no place for one).
 */
type Kind = 'trailing' | 'after' | 'hugging' | 'before' | 'above' | 'twoLine' | 'inside' | 'end';

/** A section as an author may write it. */
interface Sample {
  /** Over lines, a key to a line (else on one line). */
  readonly lines: boolean;
  /** Its keys, in the order it writes them. */
  readonly order: ReadonlyArray<Key>;
  /** What it strikes: nothing, word 1, or words 1 and 3. */
  readonly cut: 'none' | 'one' | 'two';
  /** No marks, a mark (`why` on word 0), or marks that hold only a comment. */
  readonly marks: 'none' | 'named' | 'anchored';
  /** No knobs, knobs on one line, or knobs over lines. */
  readonly knobs: 'none' | 'flat' | 'broken';
  /** Its comments, by the owner each names. */
  readonly comments: Readonly<Record<string, Kind>>;
}

const RUNS = {
  none: [],
  one: [[1, 1]],
  two: [
    [1, 1],
    [3, 3],
  ],
} as const;

const said = (s: Sample, owner: string, kind: Kind) => s.comments[owner] === kind;

/** `text` when `held`, else nothing. */
const when = (held: boolean, text: string) => {
  if (held) return text;
  return '';
};

/** `items` when `held`, else none. */
const onlyWhen = <A>(held: boolean, items: ReadonlyArray<A>): ReadonlyArray<A> => {
  if (held) return items;
  return [];
};

const blockOn = (owner: string) => `/* @${owner} */`;

/** Key `key`'s value as `s` writes it, its nested lines indented under `ind`. */
const sampleValue = (s: Sample, key: Key, ind: string): string => {
  switch (key) {
    case 'id':
      return "'law'";
    case 'take':
      return "'a'";
    case 'from':
      return '0';
    case 'to':
      return '9';
    case 'cut':
      return `[${when(said(s, 'cut', 'inside'), `${blockOn('cut')} `)}${RUNS[s.cut].map(([a, b]) => `[${a}, ${b}]`).join(', ')}]`;
    case 'marks':
      if (s.marks === 'anchored') {
        if (s.lines) return `{\n${ind}  // @marks{}\n${ind}}`;
        return `{ ${blockOn('marks{}')} }`;
      }
      if (said(s, 'marks.why', 'trailing')) return `{\n${ind}  why: 0, // @marks.why\n${ind}}`;
      return `{ why: 0${when(said(s, 'marks.why', 'hugging'), ` ${blockOn('marks.why')}`)} }`;
    case 'knobs': {
      const hug = when(said(s, 'knobs.zoom', 'hugging'), ` ${blockOn('knobs.zoom')}`);
      if (s.knobs === 'broken')
        return `{\n${ind}  zoom: 1.5${hug},${when(said(s, 'knobs.zoom', 'trailing'), ' // @knobs.zoom')}\n${ind}}`;
      return `{ zoom: 1.5${hug} }`;
    }
  }
};

/** The one-section talk `s` writes. */
const sampleText = (s: Sample) => {
  const ind = '      ';
  const keyed = (k: Key) =>
    `${when(said(s, k, 'before'), `${blockOn(k)} `)}${k}: ${sampleValue(s, k, ind)}${when(said(s, k, 'hugging'), ` ${blockOn(k)}`)}`;
  if (!s.lines) return talkOf(`    { ${s.order.map(keyed).join(', ')} },`);
  return talkOf(
    [
      '    {',
      ...s.order.flatMap((k) => [
        ...onlyWhen(said(s, k, 'above'), [`${ind}// @${k}`]),
        `${ind}${keyed(k)}${when(said(s, k, 'twoLine'), ` /* @${k}\n${ind}   ends here */`)},${when(said(s, k, 'after'), ` ${blockOn(k)}`)}${when(said(s, k, 'trailing'), ` // @${k}`)}`,
      ]),
      ...onlyWhen(said(s, '{}', 'end'), [`${ind}// @{}`]),
      '    },',
    ].join('\n'),
  );
};

const sampleName = (s: Sample) =>
  `line${when(s.lines, 's')} [${s.order.join(' ')}] cut=${s.cut} marks=${s.marks} knobs=${s.knobs} {${Object.entries(
    s.comments,
  )
    .map(([owner, kind]) => `${owner}: ${kind}`)
    .join(', ')}}`;

/** The ways a comment may sit by `owner` in `s`. */
const kindsFor = (s: Sample, owner: string): ReadonlyArray<Kind> => {
  if (owner === '{}') return ['end'];
  if (owner === 'marks.why') return ['hugging', ...onlyWhen<Kind>(s.lines, ['trailing'])];
  if (owner === 'knobs.zoom')
    return ['hugging', ...onlyWhen<Kind>(s.knobs === 'broken', ['trailing'])];
  const inside = onlyWhen<Kind>(owner === 'cut', ['inside']);
  if (s.lines) return ['trailing', 'after', 'hugging', 'before', 'above', 'twoLine', ...inside];
  return ['hugging', 'before', ...inside];
};

/** A seeded generator of numbers in [0, 1) (mulberry32): the same samples on every run. */
const seeded = (seed: number) => {
  const state = { a: seed >>> 0 };
  return () => {
    state.a = (state.a + 0x6d2b79f5) >>> 0;
    const t1 = Math.imul(state.a ^ (state.a >>> 15), state.a | 1);
    const t2 = t1 ^ (t1 + Math.imul(t1 ^ (t1 >>> 7), t1 | 61));
    return ((t2 ^ (t2 >>> 14)) >>> 0) / 4294967296;
  };
};

const pick = <A>(r: () => number, items: ReadonlyArray<A>): A =>
  Option.getOrThrow(Arr.get(items, Math.floor(r() * items.length)));

/** One sample: its shape, its keys in any order, and a comment on each owner one time in three. */
const generated = (r: () => number): Sample => {
  const lines = r() < 0.5;
  const cut = pick(r, ['none', 'one', 'two'] as const);
  const marks = pick(r, ['none', 'named', 'anchored'] as const);
  const knobs = pick<Sample['knobs']>(r, [
    'none',
    'flat',
    ...onlyWhen<Sample['knobs']>(lines, ['broken']),
  ]);
  const keys: ReadonlyArray<Key> = [
    'id',
    'take',
    'from',
    'to',
    ...onlyWhen<Key>(cut !== 'none', ['cut']),
    ...onlyWhen<Key>(marks !== 'none', ['marks']),
    ...onlyWhen<Key>(knobs !== 'none', ['knobs']),
  ];
  const order = keys
    .map((k) => [r(), k] as const)
    .toSorted(([a], [b]) => a - b)
    .map(([, k]) => k);
  const bare: Sample = { lines, order, cut, marks, knobs, comments: {} };
  const owners = [
    ...order,
    ...onlyWhen(lines, ['{}']),
    ...onlyWhen(marks === 'named', ['marks.why']),
    ...onlyWhen(knobs !== 'none', ['knobs.zoom']),
  ];
  const comments = Object.fromEntries(
    owners.flatMap((o) => {
      if (r() >= 1 / 3) return [];
      return [[o, pick(r, kindsFor(bare, o))] as const];
    }),
  );
  if (marks === 'anchored') return { ...bare, comments: { ...comments, 'marks{}': 'end' } };
  return { ...bare, comments };
};

/** The seed of the property's samples. */
const SEED = 0x7a1b_2026;

/** How many samples the property generates. */
const SAMPLES = 160;

/**
 * Samples a review found the writes failing on, kept: each round's case is
 * a sample here, so the property holds them for good.
 */
const FOUND: ReadonlyArray<Sample> = [
  // Round 3, M1 (R1): Restore that empties a cut whose comment ends its line put the comment on `to`.
  {
    lines: true,
    order: ['id', 'take', 'from', 'to', 'cut'],
    cut: 'one',
    marks: 'none',
    knobs: 'none',
    comments: { cut: 'trailing' },
  },
  // R2: a block comment hugging the cut went to `to`.
  {
    lines: true,
    order: ['id', 'take', 'from', 'to', 'cut'],
    cut: 'one',
    marks: 'none',
    knobs: 'none',
    comments: { cut: 'hugging' },
  },
  // R3: R1 with knobs after the cut.
  {
    lines: true,
    order: ['id', 'take', 'from', 'to', 'cut', 'knobs'],
    cut: 'one',
    marks: 'none',
    knobs: 'flat',
    comments: { cut: 'trailing' },
  },
  // R1 on one line: `cut: [[1, 1]] /* @cut */` must not end up hugging `to`.
  {
    lines: false,
    order: ['id', 'take', 'from', 'to', 'cut'],
    cut: 'one',
    marks: 'none',
    knobs: 'none',
    comments: { cut: 'hugging' },
  },
  // Round 3, m1 (R5): a block comment over two lines hugging `to` went onto an added cut.
  {
    lines: true,
    order: ['id', 'take', 'from', 'to'],
    cut: 'none',
    marks: 'none',
    knobs: 'none',
    comments: { to: 'twoLine' },
  },
  // Round 2, M1: a comment ending `to`'s line went onto an added cut, and an empty marks' comment was lost.
  {
    lines: true,
    order: ['id', 'take', 'from', 'to', 'marks'],
    cut: 'none',
    marks: 'anchored',
    knobs: 'none',
    comments: { to: 'trailing', 'marks{}': 'end' },
  },
  // Round 1, M5: a Restore that empties a cut took the next key's comment above it.
  {
    lines: true,
    order: ['id', 'take', 'from', 'to', 'cut', 'knobs'],
    cut: 'one',
    marks: 'none',
    knobs: 'flat',
    comments: { cut: 'trailing', knobs: 'above' },
  },
];

const SAMPLED: ReadonlyArray<Sample> = (() => {
  const r = seeded(SEED);
  return [...FOUND, ...Arr.makeBy(SAMPLES, () => generated(r))];
})();

/**
 * Talk `text` with the break after its section's `{` toggled: made when the
 * section is on one line, let go when it is over lines. Formatted, it is the
 * base's twin, which the formatter tells from it by that break alone, when
 * nothing else in the section holds it over lines.
 */
const braceToggled = (text: string) => {
  if (/sections: \[\n\s*\{ /.test(text))
    return text.replace(/(sections: \[\n\s*)\{ /, '$1{\n      ');
  return text.replace(/(sections: \[\n\s*)\{\n\s*/, '$1{ ');
};

/** `s` with its cut as the lab writes one: right after `to`, and no comment of its own. */
const labCut = (s: Sample): Sample => {
  const rest = s.order.filter((k) => k !== 'cut');
  const to = rest.indexOf('to');
  return {
    ...s,
    order: [...rest.slice(0, to + 1), 'cut', ...rest.slice(to + 1)],
    comments: Object.fromEntries(Object.entries(s.comments).filter(([o]) => o !== 'cut')),
  };
};

/** A comment of a section, by what it says (the owner it names) and where it sits (its owner by the rule). */
interface Owned {
  readonly names: string;
  readonly owner: string;
}

const TOKEN =
  /\/\/[^\n]*|\/\*[\s\S]*?\*\/|'(?:[^'\\]|\\.)*'|"(?:[^"\\]|\\.)*"|[A-Za-z_$][\w$]*|-?\d+(?:\.\d+)?|[{}[\],:\n]/g;

const isComment = (t: string) => t.startsWith('//') || t.startsWith('/*');

/** A section's tokens as the oracle reads them, the next one's index, and what it has found. */
interface Reading {
  readonly tokens: ReadonlyArray<string>;
  readonly at: { i: number };
  readonly found: Array<Owned>;
  readonly owners: Set<string>;
}

/**
 * A gap of an object as the oracle reads it: the key before it (or the
 * object), whether it broke the line, whether its comma came, whether no
 * key came before it, and the comments whose owner waits on what follows.
 */
interface Between {
  prev: string;
  broke: boolean;
  comma: boolean;
  first: boolean;
  readonly held: Array<string>;
  readonly waiting: Array<string>;
}

const nextIn = (r: Reading) => r.tokens[r.at.i++] ?? '}';

const ownBy = (r: Reading, comment: string, owner: string) =>
  r.found.push({ names: /@([\w.{}]+)/.exec(comment)?.[1] ?? comment, owner });

/** The path of key `key` of the object at `path`. */
const pathOf = (path: string, key: string) => {
  if (path === '') return key;
  return `${path}.${key}`;
};

/** A value that is no object, after its `[`: every comment in it is `owner`'s. */
const readRuns = (r: Reading, owner: string) => {
  const depth = { n: 1 };
  while (depth.n > 0) {
    const t = nextIn(r);
    if (t === '[' || t === '{') depth.n += 1;
    else if (t === ']' || t === '}') depth.n -= 1;
    else if (isComment(t)) ownBy(r, t, owner);
  }
};

/** Key `key`'s value, after its `:`: an object read as one, else a value whose comments are the key's. */
const readValue = (r: Reading, key: string) => {
  for (let v = nextIn(r); ; v = nextIn(r)) {
    if (v === '{') return readObject(r, key);
    if (v === '[') return readRuns(r, key);
    if (isComment(v)) ownBy(r, v, key);
    else if (v !== '\n') return;
  }
};

/** The comments the gap holds go: those on the line to `onLine`, those below to `below`. */
const settle = (r: Reading, gap: Between, onLine: string, below: string) => {
  for (const c of gap.held.splice(0)) ownBy(r, c, onLine);
  for (const c of gap.waiting.splice(0)) ownBy(r, c, below);
};

/** A comment in a gap: the key's before it, or waiting on the line's end or the next key. */
const commentIn = (r: Reading, gap: Between, comment: string) => {
  if (gap.broke || gap.first) gap.waiting.push(comment);
  else if (gap.comma) gap.held.push(comment);
  else ownBy(r, comment, gap.prev);
};

/** The gap's line breaks: what waited on its comma's line is the key's before it. */
const breakIn = (r: Reading, gap: Between) => {
  if (!gap.broke) for (const c of gap.held.splice(0)) ownBy(r, c, gap.prev);
  gap.broke = true;
};

/** An object, after its `{`, at `path`. */
const readObject = (r: Reading, path: string) => {
  const self = `${path}{}`;
  r.owners.add(self);
  // Before the first key, every comment waits for it (`first`).
  const gap: Between = {
    prev: self,
    broke: false,
    comma: false,
    first: true,
    held: [],
    waiting: [],
  };
  while (r.at.i < r.tokens.length) {
    const t = nextIn(r);
    if (t === '}') return settle(r, gap, gap.prev, self);
    if (isComment(t)) commentIn(r, gap, t);
    else if (t === '\n') breakIn(r, gap);
    else if (t === ',') gap.comma = true;
    else {
      const key = pathOf(path, t);
      settle(r, gap, key, key);
      r.owners.add(key);
      nextIn(r); // its `:`
      readValue(r, key);
      Object.assign(gap, { prev: key, broke: false, comma: false, first: false });
    }
  }
};

/**
 * The comments of the one section of talk `text`, each with its owner by
 * the rule (above), and the owners there are: the section's keys (`to`,
 * `marks.why`) and objects (`{}`, `marks{}`).
 */
const ownedIn = (text: string) => {
  const r: Reading = {
    tokens: Array.from(
      text.slice(text.indexOf('{', text.indexOf('sections: ['))).matchAll(TOKEN),
      (m) => m[0],
    ),
    at: { i: 1 },
    found: [],
    owners: new Set<string>(['{}']),
  };
  readObject(r, '');
  return { found: r.found, owners: r.owners };
};

/**
 * What of `base`'s comments is not where it was in `text`: each comment
 * must sit by the owner it names, and every comment of an owner `text`
 * still has must be there, no more.
 */
const misplaced = (base: string, text: string): ReadonlyArray<string> => {
  const was = ownedIn(base).found;
  const now = ownedIn(text);
  const kept = was
    .filter((c) => now.owners.has(c.names))
    .map((c) => c.names)
    .toSorted();
  const has = now.found.map((c) => c.names).toSorted();
  return [
    ...onlyWhen(kept.join('|') !== has.join('|'), [
      `comments ${kept.join('|')} became ${has.join('|')}`,
    ]),
    ...now.found.filter((c) => c.owner !== c.names).map((c) => `@${c.names} sits by ${c.owner}`),
  ];
};

/** `texts`, each a talk, as oxfmt formats them under the repo's config: one run for them all, each under its own name. */
const formatted = (texts: ReadonlyArray<string>) =>
  Effect.gen(function* () {
    const spawner = yield* ChildProcessSpawner.ChildProcessSpawner;
    const joined = texts
      .map((t, i) => t.replace('export const talk = {', `export const talk${i} = {`))
      .join('');
    const done = yield* collect(
      spawner,
      ChildProcess.make('bunx', ['oxfmt', `--stdin-filepath=${REPO}/packages/film/talk.ts`], {
        cwd: REPO,
        stdin: Stream.make(new TextEncoder().encode(joined)),
      }),
    );
    expect([done.exitCode, done.stderr]).toEqual([0, '']);
    return done.stdout
      .split(/(?=^export const talk\d+ = \{)/m)
      .map((t) => t.replace(/^export const talk\d+ = \{/, 'export const talk = {'));
  }).pipe(Effect.provide(BunServices.layer));

/** The words `runs` strike, as a set. */
const struckBy = (runs: ReadonlyArray<readonly [number, number]>) =>
  new Set(runs.flatMap(([a, b]) => Arr.makeBy(b - a + 1, (k) => a + k)));

/** `words` as sorted, maximal runs: what a section's `cut` should then read. */
const runsFrom = (words: ReadonlySet<number>): ReadonlyArray<readonly [number, number]> =>
  [...words]
    .toSorted((a, b) => a - b)
    .reduce<ReadonlyArray<readonly [number, number]>>(
      (runs, w) =>
        Option.match(
          Option.filter(Arr.last(runs), ([, b]) => b + 1 === w),
          {
            onNone: (): ReadonlyArray<readonly [number, number]> => [...runs, [w, w]],
            onSome: ([a]): ReadonlyArray<readonly [number, number]> => [
              ...runs.slice(0, -1),
              [a, w],
            ],
          },
        ),
      [],
    );

/** A sample's section as data, before the talk decodes it. */
interface SectionData {
  readonly id: string;
  readonly take: string;
  readonly from: number;
  readonly to: number;
  cut?: ReadonlyArray<readonly [number, number]>;
  marks?: Readonly<Record<string, number>>;
  knobs?: { readonly zoom: number };
}

/** The section `s` decodes to, struck as `runs` and with `more` marks. */
const sectionData = (
  s: Sample,
  runs: ReadonlyArray<readonly [number, number]>,
  more: Readonly<Record<string, number>>,
): SectionData => {
  const section: SectionData = { id: 'law', take: 'a', from: 0, to: 9 };
  if (runs.length > 0) section.cut = runs;
  if (s.marks === 'named') section.marks = { why: 0, ...more };
  else if (Object.keys(more).length > 0) section.marks = more;
  else if (s.marks === 'anchored') section.marks = {};
  if (s.knobs !== 'none') section.knobs = { zoom: 1.5 };
  return section;
};

/** A talk as JSON, as its schema encodes it: two reads of one talk compare equal. */
const talkJson = Schema.encodeSync(Schema.fromJsonString(Talk));

/** The talk `s` should decode to, struck as `runs` and with `more` marks, as JSON. */
const wanted = (
  s: Sample,
  runs: ReadonlyArray<readonly [number, number]>,
  more: Readonly<Record<string, number>>,
) =>
  talkJson(
    Schema.decodeSync(Talk)({
      title: 'Why',
      format: 'question',
      takes: { a: 'take' },
      sections: [sectionData(s, runs, more)],
    }),
  );

/** One write the property makes on a sample, what it should decode to, and the write that undoes it. */
interface Write {
  readonly name: string;
  readonly run: (text: string) => Result.Result<string, { readonly reason: string }>;
  readonly runs: ReadonlyArray<readonly [number, number]>;
  readonly marks: Readonly<Record<string, number>>;
  readonly inverse: Option.Option<
    (text: string) => Result.Result<string, { readonly reason: string }>
  >;
}

const strikeOf = (word: number, strike: boolean) => (text: string) =>
  editStrikes(at, text, 'law', { from: word, to: word }, strike);

/** The writes on `s`: Cut 5 (a run added), Cut 2 (a run grown), Restore 1 (a run shrunk, or the cut emptied), Mark here. */
const writesOn = (s: Sample): ReadonlyArray<Write> => {
  const struck = struckBy(RUNS[s.cut]);
  const strike = (word: number, on: boolean): Write => {
    const now = new Set(struck);
    if (on) now.add(word);
    else now.delete(word);
    return {
      name: `${when(on, 'Cut')}${when(!on, 'Restore')} ${word}`,
      run: strikeOf(word, on),
      runs: runsFrom(now),
      marks: {},
      inverse: Option.some(strikeOf(word, !on)),
    };
  };
  return [
    strike(5, true),
    strike(2, true),
    ...onlyWhen(s.cut !== 'none', [strike(1, false)]),
    {
      name: 'Mark here',
      run: (text) => editMark(at, text, 'law', 'grace', 7),
      runs: RUNS[s.cut],
      marks: { grace: 7 },
      inverse: Option.none(),
    },
  ];
};

/**
 * Whether `w` on `s` rewrites a cut whose runs hold a comment: refused, for
 * the comment would have nothing to stand by (a cut emptied goes whole).
 */
const refusedOn = (s: Sample, w: Write) =>
  said(s, 'cut', 'inside') &&
  w.runs.length > 0 &&
  w.runs.map(String).join('|') !== RUNS[s.cut].map(String).join('|');

/** What a write answers, as text: its new text, or its refusal. */
const answerOf = (r: Result.Result<string, { readonly reason: string }>) =>
  Result.getOrElse(r, (e) => `refused: ${e.reason}`);

const isRefusal = (text: string) => text.startsWith('refused: ');

/** `texts` as `formatted` prints them, each refusal left as it is. */
const formattedAnswers = (texts: ReadonlyArray<string>) =>
  Effect.map(formatted(texts.filter((t) => !isRefusal(t))), (done) => {
    const printed = done.values();
    return texts.map((t) => {
      if (isRefusal(t)) return t;
      return printed.next().value ?? '';
    });
  });

/** A module of talks, as `imported` writes one. */
const Talks = Schema.Struct({ talks: Schema.Array(Schema.Unknown) });

/**
 * Each talk of `texts` as the film's own import of it reads it, then decoded
 * as a talk: as JSON (`talkJson`), or why it does not decode.
 */
const imported = (texts: ReadonlyArray<string>) =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const dir = yield* fs.makeTempDirectoryScoped({ prefix: 'talk-source-' });
    const file = `${dir}/talks.ts`;
    yield* fs.writeFileString(
      file,
      [
        ...texts.map((t, i) => t.replace('export const talk = {', `const talk${i} = {`)),
        `export const talks = [${texts.map((_, i) => `talk${i}`).join(', ')}];\n`,
      ].join(''),
    );
    const { talks } = yield* Effect.promise(() => import(file)).pipe(
      Effect.flatMap(Schema.decodeUnknownEffect(Talks)),
    );
    return texts.map((_, i) =>
      Result.match(Schema.decodeUnknownResult(Talk)(talks[i]), {
        onFailure: (e) => Result.fail(e.message),
        onSuccess: (t) => Result.succeed(talkJson(t)),
      }),
    );
  }).pipe(Effect.scoped, Effect.provide(BunServices.layer));

/** The `i`th of `read`, or a failure when there is none. */
const readAt = (read: ReadonlyArray<Result.Result<string, string>>, i: number) =>
  Option.getOrElse(Arr.get(read, i), () => Result.fail('no talk read back'));

describe("a talk's writes over generated sections, as the repo's oxfmt prints them", () => {
  it.effect(
    'decode to the talk asked for, keep every comment by its owner (gone with an owner taken away), and are undone by their inverse to the byte, but where the write itself made two bases one',
    () =>
      Effect.gen(function* () {
        // Each sample as the formatter prints it: the base, which must decode to the sample
        // and keep each comment by the owner it names.
        const printed = yield* formatted(SAMPLED.map(sampleText));
        const readBack = yield* imported(printed);
        const unlike = SAMPLED.map((s, i) => {
          const name = sampleName(s);
          return [
            ...Result.match(readAt(readBack, i), {
              onFailure: (e) => [`${name}: the base does not decode: ${e}`],
              onSuccess: (got) =>
                onlyWhen(got !== wanted(s, RUNS[s.cut], {}), [
                  `${name}: the base decodes to ${got}`,
                ]),
            }),
            ...ownedIn(printed[i] ?? '')
              .found.filter((c) => c.owner !== c.names)
              .map((c) => `${name}: the base's @${c.names} sits by ${c.owner}`),
          ];
        });
        expect(unlike.flat()).toEqual([]);
        const kept = SAMPLED.map((s, i) => ({ s, b: printed[i] ?? '' }));
        // The bases a write could not tell each from: its twin by the brace's break, its cut as
        // the lab writes one (when a Restore takes the cut away), and that one's twin.
        const labCuts = kept.flatMap(({ s }) => onlyWhen(s.cut === 'one', [sampleText(labCut(s))]));
        const labPrinted = (yield* formatted(labCuts)).values();
        const unformatted = kept.map(({ s, b }) => {
          if (s.cut !== 'one') return [braceToggled(b)];
          const lab = labPrinted.next().value ?? '';
          return [braceToggled(b), lab, braceToggled(lab)];
        });
        const otherPrinted = yield* formatted(unformatted.flat());
        const otherBases = unformatted.reduce<ReadonlyArray<ReadonlyArray<string>>>((acc, list) => {
          const from = acc.flat().length;
          return [...acc, otherPrinted.slice(from, from + list.length)];
        }, []);
        // Each write on each base, and on the bases it could not tell it from.
        const jobs = kept.flatMap(({ s, b }, i) =>
          writesOn(s).map((w) => ({ s, w, b, others: otherBases[i] ?? [] })),
        );
        const written = yield* formattedAnswers([
          ...jobs.map((j) => answerOf(j.w.run(j.b))),
          ...jobs.flatMap((j) => j.others.map((o) => answerOf(j.w.run(o)))),
        ]);
        const after = written.slice(0, jobs.length);
        const othersAfter = jobs.reduce<ReadonlyArray<ReadonlyArray<string>>>((acc, j) => {
          const from = jobs.length + acc.flat().length;
          return [...acc, written.slice(from, from + j.others.length)];
        }, []);
        const back = yield* formattedAnswers(
          jobs.map((j, k) => {
            const text = after[k] ?? '';
            if (isRefusal(text)) return text;
            return Option.match(j.w.inverse, {
              onNone: () => 'refused: no inverse',
              onSome: (inverse) => answerOf(inverse(text)),
            });
          }),
        );
        // A refusal decodes to no talk (a talk of no section).
        const decoded = yield* imported(
          after.map((t) => {
            if (isRefusal(t)) return talkOf('');
            return t;
          }),
        );
        const failures = [
          ...jobs.flatMap((j, k) => {
            const name = `${sampleName(j.s)}: ${j.w.name}`;
            const text = after[k] ?? '';
            if (refusedOn(j.s, j.w))
              return onlyWhen(!isRefusal(text) || !text.includes('comment'), [
                `${name}: should be refused, for a comment in the cut's runs, but wrote\n${text}`,
              ]);
            if (isRefusal(text)) return [`${name}: ${text}`];
            // (a) It decodes to the talk asked for.
            const want = wanted(j.s, j.w.runs, j.w.marks);
            const got = Result.match(readAt(decoded, k), {
              onFailure: (e) => `does not decode: ${e}`,
              onSuccess: (json) => json,
            });
            // (c) Its inverse gives the base back, or a base the write could not tell from it.
            const undone = back[k] ?? '';
            const told = Option.match(j.w.inverse, {
              onNone: () => [],
              onSome: () => {
                if (undone === j.b) return [];
                const twin = j.others.findIndex(
                  (o, m) => o === undone && othersAfter[k]?.[m] === text,
                );
                if (twin >= 0) return [];
                return [`${name}: its inverse is not the base:\n${j.b}\nbut\n${undone}`];
              },
            });
            // (b) by the server's own read-back too: it refuses none of these writes.
            const guard = Result.getOrElse(commentsMoved(at, text, j.b), (e) => [e.reason]);
            return [
              ...onlyWhen(got !== want, [`${name}: decodes to ${got}, not ${want}`]),
              ...misplaced(j.b, text).map((m) => `${name}: ${m}\n${text}`),
              ...guard.map((m) => `${name}: the server's read-back says ${m}`),
              ...told,
            ];
          }),
        ];
        expect(failures).toEqual([]);
      }),
    SPAWNS_MS,
  );
});
