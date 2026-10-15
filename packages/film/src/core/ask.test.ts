// An ask's machine, with no lab: the check that runs before it renders
// (bounded, every step reached, no loop, every guard on a choice of its own
// step, words required only where nothing is chosen), and the run: a pick
// of try 7 or 8 asks why, any other ends it; words left empty are answered
// skipped unless required; an answer that does not fit, or to a step the ask
// has left, moves nothing; closing keeps what was answered.

import { Boolean as Bool, Effect, Option, Schema } from 'effect';
import { describe, expect, it, test } from 'effect-bun-test';
import { Machine } from 'effect-machine';
import {
  type Ask,
  AskEvent,
  AskRecordJson,
  Ask as AskSchema,
  AskState,
  answerRefusal,
  answeredToEnd,
  answersLine,
  askMachine,
  askProblems,
  askStart,
  materialsIn,
  oneQuestion,
  optionsShown,
  pageRefusal,
  sectionsOf,
  titleOf,
  unrecommended,
} from './ask.ts';

const tries = [1, 2, 3, 4, 5, 6, 7, 8].map((n) => ({
  value: String(n),
  label: `Try ${n}`,
  image: { board: { film: 'f', panel: 'word.church', try: n } },
}));

/** The proof: choose a try; 7 or 8 asks why; done. */
const proof: Ask = {
  start: 'pick',
  steps: {
    pick: {
      blocks: [
        { kind: 'heading', text: 'The church, word beat' },
        { kind: 'choose', id: 'try', label: 'Which try do we keep?', options: tries },
      ],
      next: [{ to: 'why', when: { answer: 'try', is: ['7', '8'] } }, { to: 'done' }],
    },
    why: {
      blocks: [{ kind: 'free_text', id: 'why', label: 'Why that one over the first six?' }],
      next: [{ to: 'done' }],
    },
    done: { end: true, text: 'Thank you.' },
  },
};

describe('the check before an ask renders', () => {
  test('the proof ask and a one-page question pass', () => {
    expect(askProblems(proof)).toEqual([]);
    expect(
      askProblems(oneQuestion([{ kind: 'free_text', id: 'name', label: 'A name for it?' }])),
    ).toEqual([]);
  });

  test('a loop, a step never reached, a dangling way on and no end are each named', () => {
    const looped: Ask = {
      start: 'a',
      steps: {
        a: { blocks: [{ kind: 'prose', text: 'a' }], next: [{ to: 'b' }] },
        b: { blocks: [{ kind: 'prose', text: 'b' }], next: [{ to: 'a' }] },
        lost: { blocks: [{ kind: 'prose', text: 'lost' }], next: [{ to: 'nowhere' }] },
      },
    };
    expect(askProblems(looped)).toEqual([
      'step lost goes on to nowhere, which is not a step',
      'no step ends the ask: add one with end: true',
      'step lost is never reached from a',
      'the steps loop: a → b → a',
    ]);
  });

  test('a guard names a choice of its own step and its options; the last way on is unguarded', () => {
    const guarded: Ask = {
      start: 'pick',
      steps: {
        pick: {
          blocks: [
            {
              kind: 'choose',
              id: 'try',
              label: 'Which?',
              options: [
                { value: '1', label: 'One' },
                { value: '1', label: 'One again' },
              ],
            },
            { kind: 'image', image: {} },
          ],
          next: [
            { to: 'done', when: { answer: 'colour', is: ['red'] } },
            { to: 'done', when: { answer: 'try', is: ['9'] } },
          ],
        },
        done: { end: true },
      },
    };
    expect(askProblems(guarded)).toEqual([
      'step pick: when names colour, which is not a choice in this step',
      'step pick: its last next must have no when, so the step always goes on',
      'step pick: 9 is not an option of try',
      'try offers one value twice',
      "step pick's image names neither a board try (board) nor a path (src)",
    ]);
  });

  test('a blank option value, label or text does not decode, so no blank answer can be sent', () => {
    const decode = Schema.decodeUnknownExit(AskSchema);
    const choice = (value: string, label: string): Ask =>
      oneQuestion([
        {
          kind: 'choose',
          id: 'try',
          label: 'Which?',
          options: [
            { value, label },
            { value: '7', label: 'Try 7' },
          ],
        },
      ]);
    expect(decode(choice('1', 'Try 1'))._tag).toBe('Success');
    expect(String(decode(choice('   ', 'Try 1')))).toContain('not blank');
    expect(String(decode(choice('1', ' \n ')))).toContain('not blank');
  });

  test('words are required only on a step that asks no choice', () => {
    const keep = {
      kind: 'choose' as const,
      id: 'keep',
      label: 'Keep it?',
      options: [
        { value: 'yes', label: 'Yes' },
        { value: 'no', label: 'No' },
      ],
    };
    const more = { kind: 'free_text' as const, id: 'more', label: 'Anything else?' };
    expect(askProblems(oneQuestion([keep, more]))).toEqual([]);
    expect(askProblems(oneQuestion([keep, { ...more, required: true }]))).toEqual([
      'step ask: more is required beside a choice: leave it optional (drop required), or ask it on a step of its own',
    ]);
    expect(
      askProblems(
        oneQuestion([{ kind: 'free_text', id: 'name', label: 'Its name?', required: true }]),
      ),
    ).toEqual([]);
  });

  test('a guided review passes: one titled step per piece of material, a step that asks nothing goes on', () => {
    const review: Ask = {
      start: 'script',
      steps: {
        script: {
          title: 'The script',
          blocks: [{ kind: 'script', film: 'f' }],
          next: [{ to: 'board' }],
        },
        board: {
          title: 'The Board',
          blocks: [
            { kind: 'board', film: 'f', panels: ['word.church'] },
            { kind: 'document', ref: 'p5/rbf-script/script.md' },
            { kind: 'video', ref: 'out/f/f.mp4', at: 12.5 },
            { kind: 'audio', film: 'f', beat: 'cold' },
            { kind: 'script', series: 'theology', draft: '01-breath', beats: ['1'] },
            {
              kind: 'choose',
              id: 'keep',
              label: 'Keep the Board?',
              options: [
                { value: 'redo', label: 'Draw it again' },
                { value: 'keep', label: 'Keep it', recommended: true },
              ],
            },
          ],
          next: [{ to: 'done' }],
        },
        done: { end: true },
      },
    };
    expect(askProblems(review)).toEqual([]);
    expect(materialsIn(review).map((m) => `${m.step}:${m.block.kind}`)).toEqual([
      'script:script',
      'board:board',
      'board:document',
      'board:video',
      'board:audio',
      'board:script',
    ]);
  });

  test('a material block names its material once, by its kind: a script one source, a document Markdown, a video a video', () => {
    const bad = oneQuestion([
      { kind: 'script', film: 'f', series: 's', draft: 'd' },
      { kind: 'script', series: 's' },
      { kind: 'script', film: 'f', beats: [] },
      { kind: 'board', film: 'f', panels: ['a.b', 'a.b'] },
      { kind: 'document', ref: 'p5/set/shape.txt' },
      { kind: 'video', ref: 'p5/set/still.png' },
    ]);
    expect(askProblems(bad)).toEqual([
      'step ask: a script names a film, or a series and its draft, one of them',
      'step ask: beats names none: leave it out for all',
      'step ask: panels names one twice',
      'step ask: document p5/set/shape.txt is not a Markdown file (.md)',
      'step ask: video p5/set/still.png is not a video (.mp4, .webm, .mov, .m4v)',
    ]);
  });

  test('a ref names a file under a review root, never a path on the box or another host', () => {
    const decode = Schema.decodeUnknownExit(AskSchema);
    const doc = (ref: string) => oneQuestion([{ kind: 'document', ref }]);
    expect(decode(doc('p5/rbf-script-2026-10-14/script.md'))._tag).toBe('Success');
    for (const ref of [
      '/Users/cvr/notes.md',
      '../secrets.md',
      'p5/../../etc/passwd.md',
      'p5/./x.md',
      'p5//x.md',
      'script.md',
      'https://evil.example/x.md',
      'p5\\x.md',
    ])
      expect(decode(doc(ref))._tag).toBe('Failure');
    const film = (name: string) => oneQuestion([{ kind: 'board', film: name }]);
    expect(decode(film('righteousness-by-faith'))._tag).toBe('Success');
    expect(decode(film('../f'))._tag).toBe('Failure');
    expect(decode(film('a/b'))._tag).toBe('Failure');
  });

  test('a stored ask from before material decodes and checks as it did', () => {
    const encoded = Schema.encodeSync(AskRecordJson)({
      id: 'a0123456789',
      title: 'Which try?',
      why: 'the beat waits',
      by: 'agent',
      created: '2026-10-14T00:00:00.000Z',
      ask: proof,
      state: askStart(proof),
      answered: [],
    });
    const decoded = Schema.decodeSync(AskRecordJson)(encoded);
    expect(decoded.ask).toEqual(proof);
    expect(askProblems(decoded.ask)).toEqual([]);
    expect(Option.isNone(titleOf(decoded.ask.steps['pick'] ?? { end: true }))).toBe(true);
  });

  test('a choice made now recommends one option, listed first; never two', () => {
    const choice = (marks: ReadonlyArray<boolean>) =>
      oneQuestion([
        {
          kind: 'choose',
          id: 'keep',
          label: 'Keep it?',
          options: marks.map((recommended, i) => ({
            value: `v${i}`,
            label: `V${i}`,
            ...Bool.match(recommended, { onFalse: () => ({}), onTrue: () => ({ recommended }) }),
          })),
        },
      ]);
    expect(unrecommended(choice([false, false]))).toEqual([
      'step ask: keep recommends none of its options: mark one recommended: true',
    ]);
    expect(unrecommended(choice([false, true]))).toEqual([]);
    expect(unrecommended(choice([false]))).toEqual([]);
    expect(askProblems(choice([true, true]))).toEqual([
      'keep recommends more than one option: recommend one',
    ]);
    expect(unrecommended(proof)).toHaveLength(1);
    expect(
      optionsShown([
        { value: 'a', label: 'A' },
        { value: 'b', label: 'B', recommended: true },
        { value: 'c', label: 'C' },
      ]).map((o) => o.value),
    ).toEqual(['b', 'a', 'c']);
  });

  test('one page: every section the answers so far reach, a guarded one once its choice is made', () => {
    const at = askStart(proof);
    const names = (draft: Record<string, string>) =>
      sectionsOf(proof, at, draft).map((s) => s.name);
    expect(names({})).toEqual(['pick']);
    expect(names({ try: '7' })).toEqual(['pick', 'why']);
    expect(names({ try: '7', why: 'light' })).toEqual(['pick', 'why']);
    expect(names({ try: '3', why: 'light' })).toEqual(['pick']);
    expect(sectionsOf(proof, at, { try: '7', why: 'light' }).map((s) => s.values)).toEqual([
      { try: '7' },
      { why: 'light' },
    ]);
    // A run already on a later step shows from there; an ask at its end shows none.
    expect(
      sectionsOf(proof, AskState.Asking({ step: 'why', answers: {} }), {}).map((s) => s.name),
    ).toEqual(['why']);
    expect(sectionsOf(proof, AskState.Answered({ step: 'done', answers: {} }), {})).toEqual([]);
  });

  test("a page's answers are checked in order, the run moved by each, the refusal named by its section", () => {
    const at = askStart(proof);
    expect(Option.getOrUndefined(pageRefusal(proof, at, [{ step: 'pick', values: {} }]))).toBe(
      'try is not answered',
    );
    expect(
      pageRefusal(proof, at, [
        { step: 'pick', values: { try: '7' } },
        { step: 'why', values: {} },
      ]),
    ).toEqual(Option.none());
    const titled: Ask = {
      ...proof,
      steps: {
        ...proof.steps,
        why: {
          title: 'Why',
          blocks: [{ kind: 'free_text', id: 'why', label: 'Why?', required: true }],
          next: [{ to: 'done' }],
        },
      },
    };
    expect(
      Option.getOrUndefined(
        pageRefusal(titled, at, [
          { step: 'pick', values: { try: '7' } },
          { step: 'why', values: {} },
        ]),
      ),
    ).toBe('Why: why is not answered');
  });

  test('an ask is bounded: at most twelve steps', () => {
    const steps = Object.fromEntries(
      Array.from({ length: 13 }, (_, i) => [
        `s${i}`,
        { blocks: [{ kind: 'prose' as const, text: `${i}` }], next: [{ to: `s${i + 1}` }] },
      ]),
    );
    expect(askProblems({ start: 's0', steps: { ...steps, s13: { end: true } } })).toContain(
      '14 steps, at most 12',
    );
  });
});

const run = (events: ReadonlyArray<AskEvent>, from = askStart(proof)) =>
  Machine.replay(askMachine(proof, from), events, { from });

describe('the run', () => {
  it.effect('try 7 asks why, and the end hands back every answer typed', () =>
    Effect.gen(function* () {
      const asked = yield* run([AskEvent.Answer({ step: 'pick', values: { try: '7' } })]);
      expect(asked).toEqual(
        AskState.Asking({
          step: 'why',
          answers: { try: { kind: 'choose', value: '7', label: 'Try 7' } },
        }),
      );
      const done = yield* run(
        [AskEvent.Answer({ step: 'why', values: { why: '  the light falls right ' } })],
        asked,
      );
      expect(done).toEqual(
        AskState.Answered({
          step: 'done',
          answers: {
            try: { kind: 'choose', value: '7', label: 'Try 7' },
            why: { kind: 'free_text', text: 'the light falls right' },
          },
        }),
      );
    }),
  );

  it.effect('words left empty are answered skipped, unless required', () =>
    Effect.gen(function* () {
      const asked = yield* run([AskEvent.Answer({ step: 'pick', values: { try: '7' } })]);
      // The proof's why carries no flag, as no ask made before the flag does: optional.
      const done = yield* run([AskEvent.Answer({ step: 'why', values: { why: ' \n ' } })], asked);
      const answers = {
        try: { kind: 'choose', value: '7', label: 'Try 7' },
        why: { kind: 'skipped' },
      } as const;
      expect(done).toEqual(AskState.Answered({ step: 'done', answers }));
      expect(answersLine(answers)).toBe('try: Try 7 · why: (skipped)');
      const wordsRequired: Ask = {
        ...proof,
        steps: {
          ...proof.steps,
          why: {
            blocks: [{ kind: 'free_text', id: 'why', label: 'Why?', required: true }],
            next: [{ to: 'done' }],
          },
        },
      };
      expect(answerRefusal(wordsRequired, asked, 'why', {})).toEqual(
        Option.some('why is not answered'),
      );
      expect(answerRefusal(proof, asked, 'why', {})).toEqual(Option.none());
    }),
  );

  test('an ask kept before the flag reads as it did, its words now optional', () => {
    // The bytes as an ask kept on 2026-10-15 holds them: a free text with no flag.
    const kept =
      '{"id":"a0123456789","title":"Two calls","why":"the build waits","by":"main",' +
      '"created":"2026-10-15T00:27:56.767Z","ask":{"start":"ask","steps":{"ask":{"blocks":' +
      '[{"kind":"free_text","id":"notes","label":"Anything else (optional)"}],' +
      '"next":[{"to":"done"}]},"done":{"end":true}}},' +
      '"state":{"_tag":"Asking","step":"ask","answers":{}},"answered":[]}';
    const record = Schema.decodeSync(AskRecordJson)(kept);
    expect(answerRefusal(record.ask, record.state, 'ask', {})).toEqual(Option.none());
  });

  it.effect('try 3 ends the ask at once', () =>
    Effect.gen(function* () {
      const done = yield* run([AskEvent.Answer({ step: 'pick', values: { try: '3' } })]);
      expect(done._tag).toBe('Answered');
    }),
  );

  it.effect('an answer that does not fit, or to another step, moves nothing, and says why', () =>
    Effect.gen(function* () {
      const start = askStart(proof);
      expect(answerRefusal(proof, start, 'pick', { try: '9' })).toEqual(
        Option.some('9 is not an option of try'),
      );
      expect(answerRefusal(proof, start, 'pick', {})).toEqual(Option.some('try is not answered'));
      expect(answerRefusal(proof, start, 'why', { why: 'x' })).toEqual(
        Option.some('the ask is at step pick, not why'),
      );
      expect(answerRefusal(proof, start, 'pick', { try: '1', colour: 'red' })).toEqual(
        Option.some('this step asks no colour'),
      );
      expect(yield* run([AskEvent.Answer({ step: 'pick', values: { try: '9' } })])).toEqual(start);
    }),
  );

  test('answered to its end is read from the answered steps, so a close keeps it', () => {
    const at = '2026-10-14T00:00:00.000Z';
    const pick = { step: 'pick', values: { try: '7' }, at };
    expect(answeredToEnd({ ask: proof, answered: [] })).toBe(false);
    expect(answeredToEnd({ ask: proof, answered: [pick] })).toBe(false);
    expect(
      answeredToEnd({ ask: proof, answered: [pick, { step: 'why', values: { why: 'x' }, at }] }),
    ).toBe(true);
    expect(
      answeredToEnd({ ask: proof, answered: [{ step: 'pick', values: { try: '3' }, at }] }),
    ).toBe(true);
  });

  it.effect('closing keeps what was answered, and a closed ask takes no answer', () =>
    Effect.gen(function* () {
      const asked = yield* run([AskEvent.Answer({ step: 'pick', values: { try: '8' } })]);
      const closed = yield* run([AskEvent.Close({ why: 'decided in chat' })], asked);
      expect(closed).toEqual(
        AskState.Closed({
          answers: { try: { kind: 'choose', value: '8', label: 'Try 8' } },
          why: 'decided in chat',
        }),
      );
      expect(answerRefusal(proof, closed, 'why', { why: 'x' })).toEqual(
        Option.some('the ask is closed: decided in chat'),
      );
    }),
  );
});
