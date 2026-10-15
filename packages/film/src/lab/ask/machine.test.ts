// An ask's page machine, with no DOM, over a fake lab: it reads the ask and
// opens on its one page, from where its run is; a draft that does not fit is
// said, not sent; a send carries every section the draft reaches, in order,
// and lands on the end; optional words left empty go unsent; a refusal (the
// phone answered first) reads the ask again and says why; an ask that cannot
// be read says so.

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

/** The ask once try 7 and its why, left empty, are answered: at its end. */
const ended: AskRecord = {
  ...picked,
  state: AskState.Answered({
    step: 'done',
    answers: { ...picked.state.answers, why: { kind: 'skipped' } },
  }),
  answered: [...picked.answered, { step: 'why', values: {}, at: '2026-10-14T00:02:00.000Z' }],
};

const unused = () => Effect.die('not called by an ask page');

/** The lab as the page calls it: `reads` answered in turn, each send told to `sent` and answered by `answer`. */
type Sent = ReadonlyArray<{ readonly step: string; readonly values: StepValues }>;

const fakeLab = (
  reads: Array<Effect.Effect<AskRecord, LabFailure>>,
  answer: () => Effect.Effect<AskRecord, LabFailure>,
  sent: Array<Sent>,
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
      answer: (_id, sections) => {
        sent.push(sections);
        return answer();
      },
      script: unused,
      filmVoice: unused,
      filmMarks: unused,
      attempts: unused,
      series: unused(),
      draft: unused,
      draftVoice: unused,
      draftMarks: unused,
    }),
  );

const opened = (record: AskRecord, said = '') => AskPageState.Open({ record, draft: {}, said });

describe("an ask's page", () => {
  it.effect(
    'opens on its page, says a draft that does not fit, and sends every section the draft reaches',
    () => {
      const sent: Array<Sent> = [];
      return Effect.gen(function* () {
        const actor = yield* spawnAskPage(asking.id);
        expect(yield* actor.waitFor(AskPageState.Open)).toEqual(opened(asking));
        yield* actor.send(AskPageEvent.Submit);
        const unfit = yield* actor.waitFor((s) => s._tag === 'Open' && s.said !== '');
        expect(unfit).toMatchObject({ _tag: 'Open', said: 'try is not answered' });
        // Try 7 asks why: its section is on the page now, its words optional.
        yield* actor.send(AskPageEvent.Set({ id: 'try', value: '7' }));
        yield* actor.send(AskPageEvent.Submit);
        yield* actor.waitFor((s) => s._tag === 'Open' && s.record.state._tag === 'Answered');
        expect(sent).toEqual([
          [
            { step: 'pick', values: { try: '7' } },
            { step: 'why', values: {} },
          ],
        ]);
      }).pipe(
        Effect.scoped,
        Effect.provide(fakeLab([Effect.succeed(asking)], () => Effect.succeed(ended), sent)),
      );
    },
  );

  it.effect('opens from where its run is, and sends optional words left empty as none', () => {
    const sent: Array<Sent> = [];
    return Effect.gen(function* () {
      const actor = yield* spawnAskPage(asking.id);
      yield* actor.waitFor(AskPageState.Open);
      yield* actor.send(AskPageEvent.Set({ id: 'why', value: '  ' }));
      yield* actor.send(AskPageEvent.Submit);
      yield* actor.waitFor((s) => s._tag === 'Open' && s.record.state._tag === 'Answered');
      expect(sent).toEqual([[{ step: 'why', values: {} }]]);
    }).pipe(
      Effect.scoped,
      Effect.provide(fakeLab([Effect.succeed(picked)], () => Effect.succeed(ended), sent)),
    );
  });

  it.effect('a refused send reads the ask again and says why; an unreadable ask says so', () => {
    const sent: Array<Sent> = [];
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
