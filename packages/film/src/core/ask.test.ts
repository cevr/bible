// An ask's machine, with no lab: the check that runs before it renders
// (bounded, every step reached, no loop, every guard on a choice of its own
// step), and the run: a pick of try 7 or 8 asks why, any other ends it; an
// answer that does not fit, or to a step the ask has left, moves nothing;
// closing keeps what was answered.

import { Effect, Option } from 'effect';
import { describe, expect, it, test } from 'effect-bun-test';
import { Machine } from 'effect-machine';
import {
  type Ask,
  AskEvent,
  AskState,
  answerRefusal,
  askMachine,
  askProblems,
  askStart,
  oneQuestion,
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
