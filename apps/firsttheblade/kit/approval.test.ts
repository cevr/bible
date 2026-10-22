/**
 * The approval's two ends. `approve` turns the record approved only on an
 * ask the owner answered with approval, and only for the stills that ask
 * showed (the ones the pending record pinned), storing the lab's words; it
 * refuses each other case and leaves the record as it was. `shippable`, run
 * first by the prod deploy, refuses a pending record and a still the record
 * does not hold. Each over a copy of the app, with a stand-in lab.
 */
import { BunServices } from '@effect/platform-bun';
import { describe, expect, it } from 'effect-bun-test';
import { Context, Effect, FileSystem, Layer, Match, Option, Ref, Schema } from 'effect';

import {
  APPROVE,
  RECORD,
  STILLS_QUESTION,
  approve,
  pin,
  readRecord,
  shippable,
  StillsMoved,
} from './approval.ts';
import { AskAnswer, type AskAnswers, AskUnknown, LabAsk, LabAsks } from './lab-asks.ts';
import { scratchApp } from './scratch-app.ts';

const APP = `${import.meta.dir}/..`;
const ASK = 'a1b2c3d4e5f';
const OTHER = 'f5e4d3c2b1a';
const AT = '2026-10-22T09:00:00.000Z';

/**
 * The owner's real answer to the ask that showed him these stills: the lab's
 * record of it (`GET /api/asks/adf28c17753`) and the lines `ask wait` printed
 * when he answered, both kept as he gave them. The tests read the files and
 * never the lab.
 */
const REAL = 'adf28c17753';
const REAL_RECORD = `${import.meta.dir}/fixtures/ask-${REAL}.json`;
const REAL_WAIT = `${import.meta.dir}/fixtures/ask-${REAL}.txt`;
const REAL_AT = '2026-10-22T01:18:28.478Z';

/**
 * An `ask wait` answer line (`answer <question> <kind> key=value…`, a value
 * in quotes when it has spaces) read as the question and the answer it
 * prints, decoded as the lab's answers are.
 */
const printedAnswer = Effect.fn('test/printedAnswer')(function* (line: string) {
  const [, question = '', kind = ''] = line.split(' ');
  const fields = Array.from(line.matchAll(/(\w+)=("[^"]*"|\S+)/g), ([, key = '', given = '']) => [
    key,
    given.replace(/^"|"$/g, ''),
  ]);
  const answer = yield* Schema.decodeUnknownEffect(AskAnswer)({
    kind,
    ...Object.fromEntries(fields),
  });
  return [question, answer] as const;
});

const SWAY: AskAnswers[string] = { kind: 'choose', value: 'keep', label: 'Keep the sway as it is' };
const YES: AskAnswers[string] = { kind: 'choose', value: APPROVE, label: 'Approve these stills' };
const NOTE: AskAnswers[string] = { kind: 'free_text', text: 'The light is right.' };

const APPROVED: AskAnswers = {
  sway: SWAY,
  [STILLS_QUESTION]: YES,
  stills_note: NOTE,
  trace: { kind: 'skipped' },
};

/** The words an answer gives, as the lab keeps them on the step that answered it: a choice's option, the words, nothing when skipped. */
const valueOf = (answer: AskAnswers[string]) =>
  Match.value(answer).pipe(
    Match.when({ kind: 'choose' }, ({ value }) => [value]),
    Match.when({ kind: 'free_text' }, ({ text }) => [text]),
    Match.when({ kind: 'skipped' }, () => []),
    Match.exhaustive,
  );

/** An ask the lab holds, at `tag`, with `answers`; each answer given on one step at `AT`. */
const held = (answers: AskAnswers, tag: LabAsk['state']['_tag'] = 'Answered', id = ASK): LabAsk => {
  const values = Object.entries(answers).flatMap(([question, answer]) =>
    valueOf(answer).map((value) => [question, value] as const),
  );
  const steps = [{ step: 'approve', values: Object.fromEntries(values), at: AT }];
  return {
    id,
    state: { _tag: tag, answers },
    answered: steps.filter(() => Object.keys(answers).length > 0),
  };
};

/** The asks the stand-in lab holds, set by each test before it reads. */
class Held extends Context.Service<Held, Ref.Ref<ReadonlyArray<LabAsk>>>()('test/HeldAsks') {}

/** A lab that holds the asks `Held` gives, by id. */
const layerHeld = Layer.effect(
  LabAsks,
  Effect.gen(function* () {
    const asks = yield* Held;
    return LabAsks.of({
      read: (ask) =>
        Ref.get(asks).pipe(
          Effect.flatMap((holding) =>
            Effect.fromOption(Option.fromUndefinedOr(holding.find(({ id }) => id === ask))),
          ),
          Effect.mapError(() => AskUnknown.make({ ask })),
        ),
    });
  }),
).pipe(Layer.provideMerge(Layer.effect(Held, Ref.make<ReadonlyArray<LabAsk>>([]))));

/** The stand-in lab made to hold `asks`. */
const holding = (asks: ReadonlyArray<LabAsk>) =>
  Effect.gen(function* () {
    yield* Ref.set(yield* Held, asks);
  });

/** A copy of the app with its record pinned pending on `ask`, the lab holding `asks`. */
const pinnedOn = (ask: string, asks: ReadonlyArray<LabAsk>) =>
  Effect.gen(function* () {
    const root = yield* scratchApp(APP);
    yield* holding([held({}, 'Asking', ask), ...asks]);
    yield* pin(root, ask);
    return root;
  });

/** What `approve` gives on ask `ask` over `root` with the lab holding `asks`: its refusal's tag, or `approved`; and whether the record stayed as it was. */
const approvedOn = (root: string, ask: string, asks: ReadonlyArray<LabAsk>) =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const before = yield* fs.readFileString(`${root}/${RECORD}`);
    yield* holding(asks);
    const result = yield* approve(root, ask).pipe(
      Effect.match({ onFailure: (error) => error._tag, onSuccess: () => 'approved' }),
    );
    const kept = (yield* fs.readFileString(`${root}/${RECORD}`)) === before;
    return [result, kept] as const;
  });

/** The scripts of the app's `package.json`. */
const Scripts = Schema.fromJsonString(
  Schema.Struct({ scripts: Schema.Record(Schema.String, Schema.String) }),
);

const test = it.effect.layer(Layer.mergeAll(BunServices.layer, layerHeld));

describe('kit:approve', () => {
  test("approves the stills the ask showed, in the lab's words", () =>
    Effect.gen(function* () {
      const root = yield* pinnedOn(ASK, []);
      const pinned = yield* readRecord(root);
      expect(pinned.approval).toEqual({ status: 'pending', ask: ASK });
      expect(yield* approvedOn(root, ASK, [held(APPROVED)])).toEqual(['approved', false]);
      expect(yield* readRecord(root)).toEqual({
        approval: {
          status: 'approved',
          ask: ASK,
          answered: AT,
          answers: { sway: SWAY, [STILLS_QUESTION]: YES, stills_note: NOTE },
        },
        stills: pinned.stills,
      });
    }).pipe(Effect.scoped));

  test("approves on the owner's real answer, as the lab records it and ask wait prints it", () =>
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const real = yield* Schema.decodeEffect(Schema.fromJsonString(LabAsk))(
        yield* fs.readFileString(REAL_RECORD),
      );
      const lines = (yield* fs.readFileString(REAL_WAIT))
        .split('\n')
        .filter((line) => line.startsWith('answer '));
      const printed = Object.fromEntries(yield* Effect.forEach(lines, printedAnswer));
      expect(lines.length).toBe(5);
      expect(printed).toEqual(real.state.answers);
      const root = yield* pinnedOn(REAL, []);
      const pinned = yield* readRecord(root);
      expect(yield* approvedOn(root, REAL, [real])).toEqual(['approved', false]);
      expect(yield* readRecord(root)).toEqual({
        approval: {
          status: 'approved',
          ask: REAL,
          answered: REAL_AT,
          answers: {
            sway: { kind: 'choose', value: 'more', label: 'A bit more' },
            e2: { kind: 'choose', value: 'accept', label: 'Accept it' },
            [STILLS_QUESTION]: { kind: 'choose', value: APPROVE, label: 'Approve them' },
          },
        },
        stills: pinned.stills,
      });
    }).pipe(Effect.scoped));

  test('refuses an ask the lab does not hold', () =>
    Effect.gen(function* () {
      const root = yield* pinnedOn(ASK, []);
      expect(yield* approvedOn(root, ASK, [])).toEqual(['AskUnknown', true]);
    }).pipe(Effect.scoped));

  test('refuses an ask the owner has not answered', () =>
    Effect.gen(function* () {
      const root = yield* pinnedOn(ASK, []);
      expect(yield* approvedOn(root, ASK, [held({}, 'Asking')])).toEqual(['AskUnanswered', true]);
      expect(yield* approvedOn(root, ASK, [held(APPROVED, 'Asking')])).toEqual([
        'AskUnanswered',
        true,
      ]);
      expect(yield* approvedOn(root, ASK, [held({ sway: SWAY }, 'Answered')])).toEqual([
        'AskUnanswered',
        true,
      ]);
    }).pipe(Effect.scoped));

  test('refuses an answer to the stills question that is not the approve choice', () =>
    Effect.gen(function* () {
      const root = yield* pinnedOn(ASK, []);
      const answered = (answer: AskAnswers[string]) =>
        approvedOn(root, ASK, [held({ ...APPROVED, [STILLS_QUESTION]: answer })]);
      expect(yield* answered({ kind: 'choose', value: 'revise', label: 'Revise them' })).toEqual([
        'AskNotApproval',
        true,
      ]);
      expect(yield* answered({ kind: 'free_text', text: 'approve' })).toEqual([
        'AskNotApproval',
        true,
      ]);
      expect(yield* answered({ kind: 'skipped' })).toEqual(['AskNotApproval', true]);
    }).pipe(Effect.scoped));

  test('refuses a record not pending on the ask', () =>
    Effect.gen(function* () {
      const root = yield* pinnedOn(OTHER, []);
      expect(yield* approvedOn(root, ASK, [held(APPROVED)])).toEqual(['RecordNotPending', true]);
      const approvedOnce = yield* pinnedOn(ASK, []);
      expect(yield* approvedOn(approvedOnce, ASK, [held(APPROVED)])).toEqual(['approved', false]);
      expect(yield* approvedOn(approvedOnce, ASK, [held(APPROVED)])).toEqual([
        'RecordNotPending',
        true,
      ]);
    }).pipe(Effect.scoped));

  test('refuses stills other than the ones the record pinned, naming each', () =>
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const root = yield* pinnedOn(ASK, []);
      const card = yield* fs.readFile(`${root}/public/og/home.jpg`);
      yield* fs.writeFile(`${root}/public/og/land.jpg`, card);
      yield* fs.writeFile(`${root}/public/og/about.jpg`, card);
      yield* holding([held(APPROVED)]);
      const refusal = yield* approve(root, ASK).pipe(
        Effect.flip,
        Effect.map((error) => Option.liftPredicate(error, Schema.is(StillsMoved))),
      );
      expect(Option.map(refusal, ({ stills }) => stills)).toEqual(
        Option.some([
          { still: 'public/og/about.jpg', why: 'not in the record' },
          { still: 'public/og/land.jpg', why: 'changed' },
        ]),
      );
      expect((yield* readRecord(root)).approval.status).toBe('pending');
    }).pipe(Effect.scoped));

  test('pins only on an ask the lab holds', () =>
    Effect.gen(function* () {
      const root = yield* scratchApp(APP);
      yield* holding([]);
      const refusal = yield* pin(root, ASK).pipe(Effect.flip);
      expect(refusal._tag).toBe('AskUnknown');
    }).pipe(Effect.scoped));
});

describe('kit:shippable', () => {
  test('refuses a pending record, and stills the approved record does not hold', () =>
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const root = yield* pinnedOn(ASK, []);
      const shipped = () =>
        shippable(root).pipe(
          Effect.match({ onFailure: (error) => error._tag, onSuccess: (a) => a.status }),
        );
      expect(yield* shipped()).toBe('ShipPending');
      yield* approvedOn(root, ASK, [held(APPROVED)]);
      expect(yield* shipped()).toBe('approved');
      yield* fs.writeFile(
        `${root}/public/og/sky.webp`,
        yield* fs.readFile(`${root}/public/og/home.jpg`),
      );
      expect(yield* shipped()).toBe('ShipUnapproved');
    }).pipe(Effect.scoped));

  test('runs first in the prod deploy, and not in the stage deploy', () =>
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const { scripts } = yield* Schema.decodeEffect(Scripts)(
        yield* fs.readFileString(`${APP}/package.json`),
      );
      expect(scripts['kit:shippable']).toBe('bun kit/shippable.ts');
      expect(scripts['deploy']?.split(' && ')[0]).toBe('bun kit/shippable.ts');
      expect(scripts['deploy']).toContain('alchemy deploy alchemy.run.ts --stage prod');
      expect(scripts['verify:stage']).not.toContain('shippable');
    }));
});
