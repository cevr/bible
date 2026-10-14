// An ask's page machine, with no DOM, over a fake lab: it reads the ask and
// opens on the step its run is on; a draft that does not fit is said, not
// sent; a send lands on the next step; a refusal (the phone answered first)
// reads the ask again and says why; an ask that cannot be read says so.

import { Effect, Layer, SubscriptionRef } from 'effect';
import { describe, expect, it } from 'effect-bun-test';
import { type AskRecord, AskState, type StepValues } from '../../core/ask.ts';
import { AskRefused, AskUnknown } from '../../core/refusals.ts';
import type { LabFailure } from '../api.ts';
import { ReviewApi } from '../review/api.ts';
import { AskPageEvent, AskPageState, spawnAskPage } from './machine.ts';

const asking: AskRecord = {
  id: 'a0123456789',
  title: 'Keep a try',
  why: 'the beat waits on it',
  by: 'agent',
  created: '2026-10-14T00:00:00.000Z',
  ask: {
    start: 'pick',
    steps: {
      pick: {
        blocks: [
          {
            kind: 'choose',
            id: 'try',
            label: 'Which?',
            options: [
              { value: '7', label: 'Try 7' },
              { value: '1', label: 'Try 1' },
            ],
          },
        ],
        next: [{ to: 'why', when: { answer: 'try', is: ['7'] } }, { to: 'done' }],
      },
      why: { blocks: [{ kind: 'free_text', id: 'why', label: 'Why?' }], next: [{ to: 'done' }] },
      done: { end: true },
    },
  },
  state: AskState.Asking({ step: 'pick', answers: {} }),
  answered: [],
};

const picked: AskRecord = {
  ...asking,
  state: AskState.Asking({
    step: 'why',
    answers: { try: { kind: 'choose', value: '7', label: 'Try 7' } },
  }),
  answered: [{ step: 'pick', values: { try: '7' }, at: '2026-10-14T00:01:00.000Z' }],
};

const unused = () => Effect.die('not called by an ask page');

/** The lab as the page calls it: `reads` answered in turn, each send told to `sent` and answered by `answer`. */
const fakeLab = (
  reads: Array<Effect.Effect<AskRecord, LabFailure>>,
  answer: (values: StepValues) => Effect.Effect<AskRecord, LabFailure>,
  sent: Array<StepValues>,
) =>
  Layer.succeed(
    ReviewApi,
    ReviewApi.of({
      index: unused,
      duration: unused,
      text: unused,
      say: unused,
      productions: unused(),
      board: unused,
      forward: unused,
      ask: () => reads.shift() ?? Effect.die('read once too often'),
      answer: (_id, _step, values) => {
        sent.push(values);
        return answer(values);
      },
    }),
  );

const opened = (record: AskRecord, said = '') => AskPageState.Open({ record, draft: {}, said });

describe("an ask's page", () => {
  it.effect(
    'opens on its step, says a draft that does not fit, and lands a send on the next step',
    () => {
      const sent: Array<StepValues> = [];
      return Effect.gen(function* () {
        const actor = yield* spawnAskPage(asking.id);
        expect(yield* actor.waitFor(AskPageState.Open)).toEqual(opened(asking));
        yield* actor.send(AskPageEvent.Submit);
        const unfit = yield* actor.waitFor((s) => s._tag === 'Open' && s.said !== '');
        expect(unfit).toMatchObject({ _tag: 'Open', said: 'try is not answered' });
        yield* actor.send(AskPageEvent.Set({ id: 'try', value: '7' }));
        yield* actor.send(AskPageEvent.Submit);
        yield* actor.waitFor((s) => s._tag === 'Open' && s.record.answered.length === 1);
        expect(yield* SubscriptionRef.get(actor.state)).toEqual(opened(picked));
        expect(sent).toEqual([{ try: '7' }]);
      }).pipe(
        Effect.scoped,
        Effect.provide(fakeLab([Effect.succeed(asking)], () => Effect.succeed(picked), sent)),
      );
    },
  );

  it.effect('a refused send reads the ask again and says why; an unreadable ask says so', () => {
    const sent: Array<StepValues> = [];
    const refused = AskRefused.make({ id: asking.id, reason: 'step pick is answered already' });
    return Effect.gen(function* () {
      const actor = yield* spawnAskPage(asking.id);
      yield* actor.waitFor(AskPageState.Open);
      yield* actor.send(AskPageEvent.Set({ id: 'try', value: '1' }));
      yield* actor.send(AskPageEvent.Submit);
      yield* actor.waitFor((s) => s._tag === 'Open' && s.record.answered.length === 1);
      expect(yield* SubscriptionRef.get(actor.state)).toEqual(
        opened(picked, 'ask "a0123456789": step pick is answered already'),
      );
      const lost = yield* spawnAskPage('a9999999999');
      expect(yield* lost.waitFor(AskPageState.Unreadable)).toEqual(
        AskPageState.Unreadable({ why: 'the lab has no ask "a9999999999"' }),
      );
    }).pipe(
      Effect.scoped,
      Effect.provide(
        fakeLab(
          [
            Effect.succeed(asking),
            Effect.succeed(picked),
            Effect.fail(AskUnknown.make({ id: 'a9999999999' })),
          ],
          () => Effect.fail(refused),
          sent,
        ),
      ),
    );
  });
});
