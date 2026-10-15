// An ask's page machine, with no DOM, over a fake lab: it reads the ask and
// opens on its one page, from where its run is; a draft that does not fit is
// said, not sent; a send carries every section the draft reaches, in order,
// and lands on the end; optional words left empty go unsent; a refusal (the
// phone answered first) reads the ask again and says why; an ask that cannot
// be read says so.

import { Deferred, Effect, Layer, SubscriptionRef } from 'effect';
import { describe, expect, it } from 'effect-bun-test';
import { type AskRecord, AskState, type StepValues } from '../../core/ask.ts';
import { AskRefused, AskUnknown } from '../../core/refusals.ts';
import { type LabFailure, LabUnreachable } from '../api.ts';
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

const opened = (record: AskRecord, said = '') =>
  AskPageState.Open({ record, draft: {}, said, missing: '' });

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
        expect(unfit).toMatchObject({
          _tag: 'Open',
          said: 'Which? needs a choice',
          missing: 'try',
        });
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

  it.effect('a send that does not reach the lab keeps the page as drafted, to send again', () => {
    const sent: Array<Sent> = [];
    const answers: Array<Effect.Effect<AskRecord, LabFailure>> = [
      Effect.fail(LabUnreachable.make({ message: 'the lab did not answer' })),
      Effect.succeed(ended),
    ];
    return Effect.gen(function* () {
      const actor = yield* spawnAskPage(asking.id);
      yield* actor.waitFor(AskPageState.Open);
      yield* actor.send(AskPageEvent.Set({ id: 'try', value: '7' }));
      yield* actor.send(AskPageEvent.Set({ id: 'why', value: 'the steadier voice' }));
      yield* actor.send(AskPageEvent.Submit);
      const kept = yield* actor.waitFor((s) => s._tag === 'Open' && s.said !== '');
      expect(kept).toEqual(
        AskPageState.Open({
          record: asking,
          draft: { try: '7', why: 'the steadier voice' },
          said: 'Not sent: the lab did not answer. Your answers are kept: send again.',
          missing: '',
        }),
      );
      yield* actor.send(AskPageEvent.Submit);
      yield* actor.waitFor((s) => s._tag === 'Open' && s.record.state._tag === 'Answered');
      expect(sent).toHaveLength(2);
      expect(sent[1]).toEqual(sent[0]);
    }).pipe(
      Effect.scoped,
      Effect.provide(
        fakeLab(
          [Effect.succeed(asking)],
          () => answers.shift() ?? Effect.die('sent too often'),
          sent,
        ),
      ),
    );
  });

  it.effect(
    'a refusal reads the ask again with the page still showing, and keeps the words for steps still open',
    () => {
      const sent: Array<Sent> = [];
      const refused = AskRefused.make({ id: asking.id, reason: 'step pick is answered already' });
      const reread = Deferred.makeUnsafe<boolean>();
      return Effect.gen(function* () {
        const actor = yield* spawnAskPage(asking.id);
        yield* actor.waitFor(AskPageState.Open);
        yield* actor.send(AskPageEvent.Set({ id: 'try', value: '7' }));
        yield* actor.send(AskPageEvent.Set({ id: 'why', value: 'the steadier voice' }));
        yield* actor.send(AskPageEvent.Submit);
        // While the ask is read again, the page keeps its record and draft: its sections stay.
        expect(yield* actor.waitFor(AskPageState.Rereading)).toEqual(
          AskPageState.Rereading({
            record: asking,
            draft: { try: '7', why: 'the steadier voice' },
            said: 'ask "a0123456789": step pick is answered already',
          }),
        );
        yield* actor.send(AskPageEvent.Set({ id: 'why', value: 'lost' }));
        yield* Deferred.succeed(reread, true);
        // The phone picked try 7: the why step is still open, its words kept.
        expect(yield* actor.waitFor(AskPageState.Open)).toEqual(
          AskPageState.Open({
            record: picked,
            draft: { why: 'the steadier voice' },
            said: 'ask "a0123456789": step pick is answered already',
            missing: '',
          }),
        );
      }).pipe(
        Effect.scoped,
        Effect.provide(
          fakeLab(
            [Effect.succeed(asking), Deferred.await(reread).pipe(Effect.as(picked))],
            () => Effect.fail(refused),
            sent,
          ),
        ),
      );
    },
  );

  it.effect('an ask that could not be read is read again on Retry', () =>
    Effect.gen(function* () {
      const actor = yield* spawnAskPage(asking.id);
      expect(yield* actor.waitFor(AskPageState.Unreadable)).toEqual(
        AskPageState.Unreadable({ why: 'the lab did not answer' }),
      );
      yield* actor.send(AskPageEvent.Retry);
      expect(yield* actor.waitFor(AskPageState.Open)).toEqual(opened(asking));
    }).pipe(
      Effect.scoped,
      Effect.provide(
        fakeLab(
          [
            Effect.fail(LabUnreachable.make({ message: 'the lab did not answer' })),
            Effect.succeed(asking),
          ],
          () => Effect.die('not sent'),
          [],
        ),
      ),
    ),
  );
});
