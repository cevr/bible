// A talk's edit rewritten by its literal, text in and text out: a Cut adds
// its words to a section's runs (a `cut` added after `to` when it has none),
// a Restore takes them out (the `cut` taken away when it strikes none), a
// mark goes where the section names its marks; anything the literal does not
// prove is refused, and words already so leave the text as it is. A write
// keeps every comment on the key it is about, which the sweep at the end
// proves over many layouts as the repo's oxfmt prints them.

import { BunServices } from '@effect/platform-bun';
import { describe, expect, it } from 'effect-bun-test';
import { Array as Arr, Boolean as Bool, Effect, Option, Predicate, Result, Stream } from 'effect';
import { ChildProcess, ChildProcessSpawner } from 'effect/process';
import { collect } from './process.ts';
import { editMark, editStrikes, markMissed } from './talk-source.ts';

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
            'to: 5, // the question ends here\n      cut: [[3, 3]]\n',
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
        // Marks that hold only a comment: the mark goes in after it, and the comment stays.
        const anchored = talkOf(
          '    { id: "law", take: "a", from: 0, to: 5, marks: { /* anchors to come */ } },',
        );
        expect(Result.getOrThrow(editMark(at, anchored, 'law', 'law', 3))).toBe(
          anchored.replace('/* anchors to come */ }', '/* anchors to come */ law: 3 }'),
        );
        const anchoredOver = over.replace(
          '        why: 1, // the ask\n',
          '        // anchors to come\n',
        );
        expect(Result.getOrThrow(editMark(at, anchoredOver, 'law', 'law', 3))).toBe(
          anchoredOver.replace('// anchors to come\n', '// anchors to come\n        law: 3,\n'),
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

/** Where a section's one comment sits, by the key it is about. */
type Said = 'trailing' | 'after' | 'hugging' | 'above';

/** One way a section of a talk may be written. */
interface Layout {
  /** Over lines, a key to a line (else on one line, as the formatter keeps it when it fits). */
  readonly lines: boolean;
  /** Whether it strikes word 1 already. */
  readonly cut: boolean;
  /** No marks, a mark, or marks that hold only a comment. */
  readonly marks: 'none' | 'named' | 'anchored';
  /** No knobs, knobs on one line, or knobs over lines (as only an author breaks them). */
  readonly knobs: 'none' | 'flat' | 'broken';
  /** A comment about one key: `// on to` after its comma, `/* on to *\/` after or before it, `// above to` on the line before. */
  readonly comment: Option.Option<readonly [string, Said]>;
}

/** `items` when `held`, else none. */
const onlyIf = <A>(held: boolean, ...items: ReadonlyArray<A>) => Arr.filter(items, () => held);

const keysOf = (l: Layout): ReadonlyArray<string> => [
  'id',
  'take',
  'from',
  'to',
  ...onlyIf(l.cut, 'cut'),
  ...onlyIf(l.marks !== 'none', 'marks'),
  ...onlyIf(l.knobs !== 'none', 'knobs'),
];

const valueOf = (l: Layout, key: string): string => {
  switch (key) {
    case 'id':
      return '"law"';
    case 'take':
      return '"a"';
    case 'from':
      return '0';
    case 'to':
      return '9';
    case 'cut':
      return '[[1, 1]]';
    case 'marks':
      if (l.marks === 'named') return '{ why: 0 }';
      if (l.lines) return '{\n        // anchors to come\n      }';
      return '{ /* anchors to come */ }';
    default:
      if (l.knobs === 'broken') return '{\n        zoom: 1.5,\n      }';
      return '{ zoom: 1.5 }';
  }
};

/** The talk whose one section `l` lays out. */
const layoutText = (l: Layout) => {
  const said = (key: string, how: Said) =>
    Option.exists(l.comment, ([k, s]) => k === key && s === how);
  const comment = (key: string, how: Said, text: string) => onlyIf(said(key, how), text).join('');
  const keyText = (key: string) =>
    `${key}: ${valueOf(l, key)}${comment(key, 'hugging', ` /* on ${key} */`)}`;
  if (!l.lines) return talkOf(`    { ${keysOf(l).map(keyText).join(', ')} },`);
  return talkOf(
    [
      '    {',
      ...keysOf(l).flatMap((key) => [
        ...onlyIf(said(key, 'above'), `      // above ${key}`),
        `      ${keyText(key)},${comment(key, 'trailing', ` // on ${key}`)}${comment(key, 'after', ` /* on ${key} */`)}`,
      ]),
      '    },',
    ].join('\n'),
  );
};

const layoutName = (l: Layout) =>
  `${Bool.match(l.lines, { onTrue: () => 'lines', onFalse: () => 'line' })} cut=${l.cut} marks=${l.marks} knobs=${l.knobs} comment=${Option.match(
    l.comment,
    { onNone: () => 'none', onSome: ([key, how]) => `${how} ${key}` },
  )}`;

/**
 * Whether `l`'s section stays within the print width (100) with the longest
 * key a write here adds (`, marks: { grace: 7 }`): on one line, one a write
 * pushes past it stays broken after (only Undo gives back its line).
 */
const fits = (l: Layout) =>
  l.lines ||
  layoutText(l)
    .split('\n')
    .every((line) => line.length + ', marks: { grace: 7 }'.length <= 100);

/** Every layout: each shape, with no comment or one about `to` or the last key, each way it may sit. */
const LAYOUTS: ReadonlyArray<Layout> = [true, false]
  .flatMap((lines) =>
    [false, true].flatMap((cut) =>
      (['none', 'named', 'anchored'] as const).flatMap((marks) =>
        Bool.match(lines, {
          onTrue: (): ReadonlyArray<Layout['knobs']> => ['none', 'broken'],
          onFalse: (): ReadonlyArray<Layout['knobs']> => ['none', 'flat'],
        }).flatMap((knobs) => {
          const bare: Layout = { lines, cut, marks, knobs, comment: Option.none() };
          const hows = Bool.match(lines, {
            onTrue: (): ReadonlyArray<Said> => ['trailing', 'after', 'hugging', 'above'],
            onFalse: (): ReadonlyArray<Said> => ['hugging'],
          });
          return [
            bare,
            ...Arr.dedupe(['to', ...Arr.takeRight(keysOf(bare), 1)]).flatMap((key) =>
              hows.map((how): Layout => ({ ...bare, comment: Option.some([key, how] as const) })),
            ),
          ];
        }),
      ),
    ),
  )
  .filter(fits);

/** Whether the only break of `l`'s section that outlasts it is its `{`'s: over lines, with no line comment or object over lines in it. */
const brokenOnlyAtItsBrace = (l: Layout) =>
  l.lines &&
  l.marks !== 'anchored' &&
  l.knobs !== 'broken' &&
  !Option.exists(l.comment, ([, how]) => how === 'trailing' || how === 'above');

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

/** A comment of a one-section talk: how deep in the section it sits, and the section's keys before and after it. */
interface Placed {
  readonly text: string;
  readonly depth: number;
  readonly before: string;
  readonly after: string;
}

interface Token {
  readonly key: boolean;
  readonly text: string;
  readonly depth: number;
}

/** Each comment of the one-section talk `text`, where it sits. */
const commentsIn = (text: string): ReadonlyArray<Placed> => {
  const tokens = Arr.reduce(
    text
      .slice(text.indexOf('sections: [') + 'sections: ['.length)
      .matchAll(/\/\/[^\n]*|\/\*[\s\S]*?\*\/|[{}[\]]|(\w+):/g),
    { depth: 0, read: Arr.empty<Token>() },
    (s, [token, key]) => {
      if (token === '{' || token === '[') return { ...s, depth: s.depth + 1 };
      if (token === '}' || token === ']') return { ...s, depth: s.depth - 1 };
      if (Predicate.isString(key))
        return { ...s, read: [...s.read, { key: true, text: key, depth: s.depth }] };
      const said = token.replace(/^\/[/*]\s*|\s*\*\/$/g, '');
      return { ...s, read: [...s.read, { key: false, text: said, depth: s.depth }] };
    },
  ).read;
  const sectionKey = (t: Token) => t.key && t.depth === 1;
  return tokens.flatMap((t, i) => {
    if (t.key) return [];
    const before = Arr.findLast(tokens.slice(0, i), sectionKey);
    const after = Arr.findFirst(tokens.slice(i + 1), sectionKey);
    return [
      {
        text: t.text,
        depth: t.depth,
        before: Option.match(before, { onNone: () => '', onSome: (k) => k.text }),
        after: Option.match(after, { onNone: () => '', onSome: (k) => k.text }),
      },
    ];
  });
};

/** What of `base`'s comments is not where it was in `text`: each still about its key, none lost or added. */
const misplaced = (base: string, text: string): ReadonlyArray<string> => {
  const found = commentsIn(text);
  const lost = Arr.map(commentsIn(base), (c) => c.text).join('|');
  if (found.map((c) => c.text).join('|') !== lost)
    return [`comments ${lost} became ${found.map((c) => c.text).join('|')}`];
  return found.flatMap((c) => {
    const on = /^on (\w+)$/.exec(c.text)?.[1];
    const above = /^above (\w+)$/.exec(c.text)?.[1];
    if (Predicate.isString(on) && (c.depth !== 1 || c.before !== on))
      return [`"${c.text}" follows ${c.before}`];
    if (Predicate.isString(above) && (c.depth !== 1 || c.after !== above))
      return [`"${c.text}" is above ${c.after}`];
    if (c.text === 'anchors to come' && (c.depth !== 2 || c.before !== 'marks'))
      return ['"anchors to come" is not in the marks'];
    return [];
  });
};

describe("a talk's writes over every layout, as the repo's oxfmt prints them", () => {
  it.effect(
    'keep each comment on its key; a Restore gives back the text its Cut found, but for a section broken only at its brace, which a Restore that leaves one run lets the formatter put back on one line',
    () =>
      Effect.gen(function* () {
        const base = yield* formatted(LAYOUTS.map(layoutText));
        const read = (r: Result.Result<string, { readonly reason: string }>) =>
          Result.getOrElse(r, (e) => `refused: ${e.reason}`);
        // Word 2 joins the run struck; word 5 adds one (two runs, when the section strikes word 1).
        const grown = base.map((b) => read(editStrikes(at, b, 'law', { from: 2, to: 2 }, true)));
        const added = base.map((b) => read(editStrikes(at, b, 'law', { from: 5, to: 5 }, true)));
        const marked = base.map((b) => read(editMark(at, b, 'law', 'grace', 7)));
        // The section as the formatter lays it out once the break after its `{` is let go.
        const loosed = base.map((b) => b.replace(/(sections: \[\n\s*)\{\n\s*/, '$1{ '));
        const written = yield* formatted([...grown, ...added, ...marked, ...loosed]);
        const n = LAYOUTS.length;
        const part = (k: number) => written.slice(k * n, (k + 1) * n);
        const [grownF, addedF, markedF, loosedF] = [part(0), part(1), part(2), part(3)];
        const back = yield* formatted([
          ...grownF.map((t) => read(editStrikes(at, t, 'law', { from: 2, to: 2 }, false))),
          ...addedF.map((t) => read(editStrikes(at, t, 'law', { from: 5, to: 5 }, false))),
        ]);
        const failures = LAYOUTS.flatMap((l, i) => {
          const name = layoutName(l);
          const b = base[i] ?? '';
          // A cut of one run made two by word 5 is left one again: its section as the formatter lays it out.
          const restored = Bool.match(l.cut, { onTrue: () => loosedF[i] ?? '', onFalse: () => b });
          const mark = markedF[i] ?? '';
          return [
            ...misplaced(b, grownF[i] ?? '').map((m) => `${name}: Cut 2: ${m}`),
            ...misplaced(b, addedF[i] ?? '').map((m) => `${name}: Cut 5: ${m}`),
            ...misplaced(b, mark).map((m) => `${name}: Mark here: ${m}`),
            ...onlyIf(back[i] !== b, `${name}: Restore 2 is not the base:\n${back[i]}`),
            ...onlyIf(back[n + i] !== restored, `${name}: Restore 5 is not:\n${back[n + i]}`),
            ...onlyIf(
              read(editMark(at, mark, 'law', 'grace', 7)) !== mark,
              `${name}: the mark does not read back`,
            ),
          ];
        });
        expect(failures).toEqual([]);
        // The one layout a Restore does not give back to the byte: over lines by its author's
        // brace alone, which the formatter puts back on one line (only Undo gives it back).
        expect(LAYOUTS.filter((l, i) => l.cut && loosedF[i] !== base[i]).map(layoutName)).toEqual(
          LAYOUTS.filter((l) => l.cut && brokenOnlyAtItsBrace(l)).map(layoutName),
        );
      }),
    SPAWNS_MS,
  );
});
