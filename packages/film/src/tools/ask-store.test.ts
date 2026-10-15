// The asks on disk: an ask that may not render is never kept (its problems
// said, a board try not on its board named), a board try is found for its
// picture; the owner answers the proof (try 7, so why, then done), a retry
// of the same answer is answered as it was and a different one refused; an
// optional field left empty is answered skipped, and sent blank again is the
// same answer; an ask past its deadline takes no answer; a close keeps what
// was answered and is answered as it is when said again.

import { describe, expect, it } from 'effect-bun-test';
import { Effect, Exit, Schema } from 'effect';
import { TestClock } from 'effect/testing';
import { type Ask, AskState, oneQuestion } from '../core/ask.ts';
import { type BoardFile, BoardFileJson, BoardName } from '../core/board.ts';
import { Segment } from '../core/segment.ts';
import { AskStore } from './ask-store.ts';
import { labInMemory, text } from './testing.ts';

const tried = (n: number) => ({
  n,
  file: Segment.make(`word.church.${n}.png`),
  sha256: `s${n}`,
  made: 'import' as const,
  refs: [],
  at: '2026-10-14T00:00:00.000Z',
});

const board: BoardFile = {
  film: 'f',
  panels: [
    {
      id: 'word.church',
      beat: BoardName.make('word'),
      at: BoardName.make('church'),
      tries: [tried(1), tried(7)],
    },
  ],
  approvals: [],
};

const files = () =>
  new Map<string, Uint8Array>([
    ['/films/f/scenes/index.ts', text('export {};\n')],
    ['/films/f/board.json', text(Schema.encodeSync(BoardFileJson)(board))],
  ]);

/** The proof: choose a try of the panel; 7 asks why; done. */
const proof = (tries: ReadonlyArray<number>): Ask => ({
  start: 'pick',
  steps: {
    pick: {
      blocks: [
        {
          kind: 'choose',
          id: 'try',
          label: 'Which try do we keep?',
          options: tries.map((n) => ({
            value: String(n),
            label: `Try ${n}`,
            image: { board: { film: 'f', panel: 'word.church', try: n } },
          })),
        },
      ],
      next: [{ to: 'why', when: { answer: 'try', is: ['7'] } }, { to: 'done' }],
    },
    why: {
      blocks: [{ kind: 'free_text', id: 'why', label: 'Why that one?', required: true }],
      next: [{ to: 'done' }],
    },
    done: { end: true, text: 'Thank you.' },
  },
});

const draft = (ask: Ask) => ({ title: 'Keep a try', why: 'the beat waits', by: 'agent', ask });

const run = <A, E>(self: Effect.Effect<A, E, AskStore>) =>
  self.pipe(Effect.provide(labInMemory(files())));

describe('the asks on disk', () => {
  it.effect('keeps no ask that may not render, and finds a board try for its picture', () =>
    run(
      Effect.gen(function* () {
        const asks = yield* AskStore;
        const dangling: Ask = {
          start: 'a',
          steps: { a: { blocks: [{ kind: 'prose', text: 'a' }], next: [{ to: 'nowhere' }] } },
        };
        const invalid = yield* Effect.flip(asks.make(draft(dangling)));
        expect(invalid._tag).toBe('AskInvalid');
        expect(invalid.message).toContain('nowhere');
        const missing = yield* Effect.flip(asks.make(draft(proof([7, 9]))));
        expect(missing.message).toContain('board try 9 of f word.church is not on its board');
        const late = yield* Effect.flip(asks.make({ ...draft(proof([1, 7])), deadline: 'soon' }));
        expect(late.message).toContain('deadline soon is not a time');
        expect(yield* asks.list).toEqual([]);
        const made = yield* asks.make(draft(proof([1, 7])));
        expect(made.id).toMatch(/^a[0-9a-f]{10}$/);
        expect(made.ask.steps['pick']).toMatchObject({
          blocks: [
            {
              options: [
                { value: '1', image: { src: '/api/films/f/board/files/word.church.1.png' } },
                { value: '7', image: { src: '/api/films/f/board/files/word.church.7.png' } },
              ],
            },
          ],
        });
        expect(yield* asks.read(made.id)).toEqual(made);
        expect((yield* Effect.flip(asks.read('a9999999999')))._tag).toBe('AskUnknown');
      }),
    ),
  );

  it.effect('runs the proof: try 7, then why, then done; a retry is answered as it was', () =>
    run(
      Effect.gen(function* () {
        const asks = yield* AskStore;
        const { id } = yield* asks.make(draft(proof([1, 7])));
        const picked = yield* asks.answer(id, 'pick', { try: '7' });
        expect(picked.state).toMatchObject({ _tag: 'Asking', step: 'why' });
        // The phone sends the same pick again: the ask as it is.
        expect(yield* asks.answer(id, 'pick', { try: '7' })).toEqual(picked);
        const other = yield* Effect.flip(asks.answer(id, 'pick', { try: '1' }));
        expect(other.message).toContain('step pick is answered already');
        const empty = yield* Effect.flip(asks.answer(id, 'why', {}));
        expect(empty._tag).toBe('AskRefused');
        const done = yield* asks.answer(id, 'why', { why: 'the light falls on the pulpit' });
        expect(done.state).toEqual(
          AskState.Answered({
            step: 'done',
            answers: {
              try: { kind: 'choose', value: '7', label: 'Try 7' },
              why: { kind: 'free_text', text: 'the light falls on the pulpit' },
            },
          }),
        );
        expect(done.answered.map((a) => a.step)).toEqual(['pick', 'why']);
        const closed = yield* asks.close(id, 'kept try 7');
        expect(closed.state).toMatchObject({ _tag: 'Closed', why: 'kept try 7' });
        expect(closed.state.answers).toEqual(done.state.answers);
        expect(yield* asks.close(id, 'kept try 7')).toEqual(closed);
        expect((yield* Effect.flip(asks.close(id, 'another'))).message).toContain('closed already');
        const after = yield* Effect.flip(asks.answer(id, 'why', { why: 'again' }));
        expect(after._tag).toBe('AskRefused');
      }),
    ),
  );

  it.effect('an optional field left empty is answered skipped; sent blank again, the same', () =>
    run(
      Effect.gen(function* () {
        const asks = yield* AskStore;
        const { id } = yield* asks.make(
          draft(
            oneQuestion([
              {
                kind: 'choose',
                id: 'keep',
                label: 'Keep it?',
                options: [
                  { value: 'yes', label: 'Yes' },
                  { value: 'no', label: 'No' },
                ],
              },
              { kind: 'free_text', id: 'more', label: 'Anything else?' },
            ]),
          ),
        );
        const done = yield* asks.answer(id, 'ask', { keep: 'yes', more: '' });
        expect(done.state).toEqual(
          AskState.Answered({
            step: 'done',
            answers: {
              keep: { kind: 'choose', value: 'yes', label: 'Yes' },
              more: { kind: 'skipped' },
            },
          }),
        );
        expect(done.answered.map((a) => a.values)).toEqual([{ keep: 'yes' }]);
        expect(yield* asks.answer(id, 'ask', { keep: 'yes', more: '  ' })).toEqual(done);
      }),
    ),
  );

  it.effect('takes no answer past its deadline', () =>
    run(
      Effect.gen(function* () {
        const asks = yield* AskStore;
        yield* TestClock.setTime(Date.UTC(2026, 9, 14, 12));
        const { id, deadline } = yield* asks.make({
          ...draft(proof([1, 7])),
          deadline: '2026-10-14T13:00:00+02:00',
        });
        expect(deadline).toBe('2026-10-14T11:00:00.000Z');
        const exit = yield* Effect.exit(asks.answer(id, 'pick', { try: '1' }));
        expect(Exit.isFailure(exit)).toBe(true);
        expect(String(exit)).toContain('it was due by 2026-10-14T11:00:00.000Z');
      }),
    ),
  );
});
