/**
 * The approval binds the bytes the owner was shown. `approve` turns the
 * record approved only on an ask he answered with the approve choice, and
 * only when every pinned still's SHA-256 is that of a file an image block of
 * that ask showed (as the lab serves it); it stores the lab, his answer's
 * label and the shown files' hashes, and refuses every other case, leaving
 * the record as it was. Over a seed: random pinned stills, random shown
 * files, random answers, and a re-pin after his answer to bytes no block
 * showed. The record as committed is pinned on an ask whose saved record
 * showed every still. Each over a copy of the app, with a stand-in lab.
 */
import { BunServices } from '@effect/platform-bun';
import { describe, expect, it } from 'effect-bun-test';
import { Context, Effect, FileSystem, Layer, Match, Option, Ref, Schema } from 'effect';

import {
  APPROVE,
  RECORD,
  STILLS_QUESTION,
  type Approved,
  approve,
  imagesShown,
  pin,
  readRecord,
  stillsNotShown,
  StillsMoved,
  StillsNotShown,
} from './approval.ts';
import { sha256 } from './build-walk.ts';
import { AskAnswer, type AskAnswers, AskUnknown, LabAsk, LabAsks, LabUnread } from './lab-asks.ts';
import { scratchApp } from './scratch-app.ts';

const APP = `${import.meta.dir}/..`;
const ASK = 'a1b2c3d4e5f';
const OTHER = 'f5e4d3c2b1a';
const AT = '2026-10-22T09:00:00.000Z';
const LAB = 'http://lab.test/';

/**
 * The owner's real answers, as the lab records them (`GET /api/asks/<id>`),
 * each with the SHA-256 of every file its image blocks showed, by `src`, as
 * the lab served them, all kept as they were read. The tests read the files
 * and never the lab. Ask ab47076e90b showed the nine stills byte for byte
 * and prod's link cards; ask adf28c17753 showed screenshots of the page,
 * and its `ask wait` lines are kept too.
 */
const fixture = (ask: string) => ({
  record: `${import.meta.dir}/fixtures/ask-${ask}.json`,
  shown: `${import.meta.dir}/fixtures/ask-${ask}.shown.json`,
});
const SHOWED = 'ab47076e90b';
const SHOWED_AT = '2026-10-22T01:56:06.332Z';
const SCREENSHOTS = 'adf28c17753';
const SCREENSHOTS_WAIT = `${import.meta.dir}/fixtures/ask-${SCREENSHOTS}.txt`;

const Shown = Schema.fromJsonString(Schema.Record(Schema.String, Schema.String));

/** A saved ask: the lab's record of it, and the hash of each file it showed. */
const saved = Effect.fn('test/saved')(function* (ask: string) {
  const fs = yield* FileSystem.FileSystem;
  const { record, shown } = fixture(ask);
  return {
    ask: yield* Schema.decodeEffect(Schema.fromJsonString(LabAsk))(
      yield* fs.readFileString(record),
    ),
    shown: yield* Schema.decodeEffect(Shown)(yield* fs.readFileString(shown)),
  };
});

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

/** The `src` the stand-in lab serves a file at. */
const srcOf = (name: string) => `/api/review/files/test/${name}`;

/**
 * An ask the lab holds, at `tag`, with `answers` (each given on one step at
 * `AT`), showing an image block for each `src` of `shows`, a video and a
 * board panel (neither a file it shows as an image), and its choice.
 */
const held = (
  answers: AskAnswers,
  shows: ReadonlyArray<string>,
  tag: LabAsk['state']['_tag'] = 'Answered',
  id = ASK,
): LabAsk => {
  const values = Object.entries(answers).flatMap(([question, answer]) =>
    valueOf(answer).map((value) => [question, value] as const),
  );
  const steps = [{ step: 'approve', values: Object.fromEntries(values), at: AT }];
  const blocks = [
    { kind: 'video' },
    { kind: 'image', image: {} },
    ...shows.map((src) => ({ kind: 'image', image: { src } })),
    { kind: 'choose' },
  ];
  return {
    id,
    ask: { steps: { approve: { blocks }, end: {} } },
    state: { _tag: tag, answers },
    answered: steps.filter(() => Object.keys(answers).length > 0),
  };
};

/** What the stand-in lab holds: its asks, and the SHA-256 of each file it serves, by `src`. */
interface Holding {
  readonly asks: ReadonlyArray<LabAsk>;
  readonly files: Readonly<Record<string, string>>;
}

class Held extends Context.Service<Held, Ref.Ref<Holding>>()('test/HeldAsks') {}

/** A lab at `LAB` that holds the asks and serves the files `Held` gives. */
const layerHeld = Layer.effect(
  LabAsks,
  Effect.gen(function* () {
    const holding = yield* Held;
    return LabAsks.of({
      url: LAB,
      read: (ask) =>
        Ref.get(holding).pipe(
          Effect.flatMap(({ asks }) =>
            Effect.fromOption(Option.fromUndefinedOr(asks.find(({ id }) => id === ask))),
          ),
          Effect.mapError(() => AskUnknown.make({ ask })),
        ),
      shownHash: (src) =>
        Ref.get(holding).pipe(
          Effect.flatMap(({ files }) => Effect.fromOption(Option.fromUndefinedOr(files[src]))),
          Effect.mapError(() => LabUnread.make({ url: LAB, reason: `${src}: status 404` })),
        ),
    });
  }),
).pipe(Layer.provideMerge(Layer.effect(Held, Ref.make<Holding>({ asks: [], files: {} }))));

/** The stand-in lab made to hold `asks` and serve `files`. */
const holding = (asks: ReadonlyArray<LabAsk>, files: Readonly<Record<string, string>> = {}) =>
  Effect.gen(function* () {
    yield* Ref.set(yield* Held, { asks, files });
  });

/** The files that show `stills` byte for byte, one per still, by `src`. */
const showing = (stills: Approved['stills']) =>
  Object.fromEntries(Object.entries(stills).map(([still, hash]) => [srcOf(still), hash]));

/** A copy of the app with its record pinned pending on `ask`; the stills as pinned. */
const pinnedOn = (ask: string) =>
  Effect.gen(function* () {
    const root = yield* scratchApp(APP);
    yield* holding([held({}, [], 'Asking', ask)]);
    const { stills } = yield* pin(root, ask);
    return { root, stills };
  });

/** What `approve` gives on ask `ask` over `root`: its refusal's tag, or `approved`; and whether the record stayed as it was. */
const approvedOn = (root: string, ask: string) =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const before = yield* fs.readFileString(`${root}/${RECORD}`);
    const result = yield* approve(root, ask).pipe(
      Effect.match({ onFailure: (error) => error._tag, onSuccess: () => 'approved' }),
    );
    const kept = (yield* fs.readFileString(`${root}/${RECORD}`)) === before;
    return [result, kept] as const;
  });

/** A seeded draw in [0, 1). */
const draws = (seed: number) => {
  let state = seed >>> 0;
  return () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 2 ** 32;
  };
};

const test = it.effect.layer(Layer.mergeAll(BunServices.layer, layerHeld));

describe('kit:approve', () => {
  test("approves the pinned stills an image block showed byte for byte, on the approve choice, storing the lab, the answer's label and the shown files' hashes", () =>
    Effect.gen(function* () {
      const { root, stills } = yield* pinnedOn(ASK);
      const files = { ...showing(stills), [srcOf('crop.png')]: sha256(new Uint8Array([1])) };
      yield* holding([held(APPROVED, Object.keys(files))], files);
      expect(yield* approvedOn(root, ASK)).toEqual(['approved', false]);
      expect(yield* readRecord(root)).toEqual({
        approval: {
          status: 'approved',
          ask: ASK,
          lab: LAB,
          answered: AT,
          answer: 'Approve these stills',
          answers: { sway: SWAY, [STILLS_QUESTION]: YES, stills_note: NOTE },
          shown: files,
        },
        stills,
      });
    }).pipe(Effect.scoped));

  test("approves on the owner's real answer to ask ab47076e90b, which showed each still byte for byte", () =>
    Effect.gen(function* () {
      const real = yield* saved(SHOWED);
      expect(imagesShown(real.ask).toSorted()).toEqual(Object.keys(real.shown).toSorted());
      const { root, stills } = yield* pinnedOn(SHOWED);
      yield* holding([real.ask], real.shown);
      expect(yield* approvedOn(root, SHOWED)).toEqual(['approved', false]);
      expect(yield* readRecord(root)).toEqual({
        approval: {
          status: 'approved',
          ask: SHOWED,
          lab: LAB,
          answered: SHOWED_AT,
          answer: 'Approve them',
          answers: { [STILLS_QUESTION]: { kind: 'choose', value: APPROVE, label: 'Approve them' } },
          shown: real.shown,
        },
        stills,
      });
    }).pipe(Effect.scoped));

  test("refuses the owner's real answer to ask adf28c17753, whose image blocks showed screenshots of the page, not the stills, naming each still", () =>
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const real = yield* saved(SCREENSHOTS);
      const lines = (yield* fs.readFileString(SCREENSHOTS_WAIT))
        .split('\n')
        .filter((line) => line.startsWith('answer '));
      expect(Object.fromEntries(yield* Effect.forEach(lines, printedAnswer))).toEqual(
        real.ask.state.answers,
      );
      const { root, stills } = yield* pinnedOn(SCREENSHOTS);
      yield* holding([real.ask], real.shown);
      const refusal = yield* approve(root, SCREENSHOTS).pipe(
        Effect.flip,
        Effect.map((error) => Option.liftPredicate(error, Schema.is(StillsNotShown))),
      );
      expect(Option.map(refusal, (found) => found.stills)).toEqual(
        Option.some(Object.keys(stills).toSorted()),
      );
      expect((yield* readRecord(root)).approval.status).toBe('pending');
    }).pipe(Effect.scoped));

  test('the committed record is pinned on an ask whose saved record showed every still byte for byte', () =>
    Effect.gen(function* () {
      const { approval, stills } = yield* readRecord(APP);
      const real = yield* saved(approval.ask);
      expect(real.ask.id).toBe(approval.ask);
      expect(stillsNotShown(stills, real.shown)).toEqual([]);
      if (approval.status === 'approved') expect(approval.shown).toEqual(real.shown);
    }));

  test('refuses each pinned still no image block showed byte for byte, naming each', () =>
    Effect.gen(function* () {
      const { root, stills } = yield* pinnedOn(ASK);
      const [first = '', second = '', ...rest] = Object.keys(stills).toSorted();
      const files = {
        ...showing(Object.fromEntries(rest.map((still) => [still, stills[still] ?? '']))),
        [srcOf(`crop-of-${first}`)]: sha256(new TextEncoder().encode(first)),
      };
      yield* holding([held(APPROVED, Object.keys(files))], files);
      const refusal = yield* approve(root, ASK).pipe(
        Effect.flip,
        Effect.map((error) => Option.liftPredicate(error, Schema.is(StillsNotShown))),
      );
      expect(Option.map(refusal, (found) => found.stills)).toEqual(Option.some([first, second]));
      expect((yield* readRecord(root)).approval.status).toBe('pending');
    }).pipe(Effect.scoped));

  test('refuses an ask the lab does not hold, and a shown file the lab does not serve', () =>
    Effect.gen(function* () {
      const { root, stills } = yield* pinnedOn(ASK);
      yield* holding([], showing(stills));
      expect(yield* approvedOn(root, ASK)).toEqual(['AskUnknown', true]);
      yield* holding([held(APPROVED, Object.keys(showing(stills)))], {});
      expect(yield* approvedOn(root, ASK)).toEqual(['LabUnread', true]);
    }).pipe(Effect.scoped));

  test('refuses a record not pending on the ask, and an approval already given', () =>
    Effect.gen(function* () {
      const { root, stills } = yield* pinnedOn(OTHER);
      yield* holding([held(APPROVED, Object.keys(showing(stills)))], showing(stills));
      expect(yield* approvedOn(root, ASK)).toEqual(['RecordNotPending', true]);
      const once = yield* pinnedOn(ASK);
      yield* holding([held(APPROVED, Object.keys(showing(once.stills)))], showing(once.stills));
      expect(yield* approvedOn(once.root, ASK)).toEqual(['approved', false]);
      expect(yield* approvedOn(once.root, ASK)).toEqual(['RecordNotPending', true]);
    }).pipe(Effect.scoped));

  test('refuses stills other than the ones the record pinned, naming each', () =>
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const { root, stills } = yield* pinnedOn(ASK);
      const card = yield* fs.readFile(`${root}/public/og/home.jpg`);
      yield* fs.writeFile(`${root}/public/og/land.jpg`, card);
      yield* fs.writeFile(`${root}/public/og/about.jpg`, card);
      yield* holding([held(APPROVED, Object.keys(showing(stills)))], showing(stills));
      const refusal = yield* approve(root, ASK).pipe(
        Effect.flip,
        Effect.map((error) => Option.liftPredicate(error, Schema.is(StillsMoved))),
      );
      expect(Option.map(refusal, (found) => found.stills)).toEqual(
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

  test('over random pinned stills, shown files and answers, approves only stills shown byte for byte on the approve choice, and refuses a re-pin after it to bytes not shown', () =>
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const root = yield* scratchApp(APP);
      const next = draws(53);
      const real = yield* saved(SHOWED);
      const ANSWERS: ReadonlyArray<readonly [string, (answers: AskAnswers) => LabAsk['state']]> = [
        ['approve', (answers) => ({ _tag: 'Answered', answers })],
        ['approve, closed', (answers) => ({ _tag: 'Closed', answers })],
        ['approve, still asking', (answers) => ({ _tag: 'Asking', answers })],
        [
          'revise',
          (answers) => ({
            _tag: 'Answered',
            answers: {
              ...answers,
              [STILLS_QUESTION]: { kind: 'choose', value: 'revise', label: 'Revise' },
            },
          }),
        ],
        [
          'keep prod cards',
          (answers) => ({
            _tag: 'Answered',
            answers: {
              ...answers,
              [STILLS_QUESTION]: { kind: 'choose', value: 'keep_prod_cards', label: 'Keep' },
            },
          }),
        ],
        [
          'words',
          (answers) => ({
            _tag: 'Answered',
            answers: { ...answers, [STILLS_QUESTION]: { kind: 'free_text', text: APPROVE } },
          }),
        ],
        [
          'skipped',
          (answers) => ({
            _tag: 'Answered',
            answers: { ...answers, [STILLS_QUESTION]: { kind: 'skipped' } },
          }),
        ],
        ['unanswered', ({ [STILLS_QUESTION]: _, ...answers }) => ({ _tag: 'Answered', answers })],
      ];
      const expectedOf = (answer: string, notShown: ReadonlyArray<string>) => {
        if (answer === 'approve, still asking' || answer === 'unanswered') return 'AskUnanswered';
        if (!answer.startsWith('approve')) return 'AskNotApproval';
        if (notShown.length > 0) return 'StillsNotShown';
        return 'approved';
      };
      const seen = new Set<string>();
      for (let i = 0; i < 40; i += 1) {
        const ask = `c${i.toString(16).padStart(10, '0')}`;
        const { stills: before } = yield* readRecord(root);
        for (const still of Object.keys(before).filter(() => next() < 0.3))
          yield* fs.writeFile(
            `${root}/${still}`,
            Uint8Array.from({ length: 64 }, () => Math.floor(next() * 256)),
          );
        yield* holding([held({}, [], 'Asking', ask)]);
        const { stills } = yield* pin(root, ask);
        const shownStills = Object.keys(stills).filter(() => next() < 0.85);
        const files = {
          ...showing(Object.fromEntries(shownStills.map((still) => [still, stills[still] ?? '']))),
          ...Object.fromEntries(
            Object.entries(before).map(([still, hash]) => [srcOf(`old/${still}`), hash]),
          ),
          [srcOf('decoy.png')]: sha256(Uint8Array.from([i])),
        };
        const drawn = Option.fromUndefinedOr(ANSWERS[Math.floor(next() * ANSWERS.length)]);
        if (Option.isNone(drawn)) return yield* Effect.die(new Error('no answer drawn'));
        const [answer, stateOf] = drawn.value;
        const ofAsk = {
          ...held(APPROVED, Object.keys(files), 'Answered', ask),
          state: stateOf(APPROVED),
        };
        yield* holding([ofAsk, real.ask], { ...files, ...real.shown });
        const hashes = new Set(Object.values(files));
        const notShown = Object.keys(stills)
          .filter((still) => !hashes.has(stills[still] ?? ''))
          .toSorted();
        const expected = expectedOf(answer, notShown);
        seen.add(expected);
        expect([i, answer, yield* approvedOn(root, SHOWED)]).toEqual([
          i,
          answer,
          ['RecordNotPending', true],
        ]);
        expect([i, answer, yield* approvedOn(root, ask)]).toEqual([
          i,
          answer,
          [expected, expected !== 'approved'],
        ]);
        if (expected === 'StillsNotShown') {
          const refusal = yield* approve(root, ask).pipe(
            Effect.flip,
            Effect.map((error) => Option.liftPredicate(error, Schema.is(StillsNotShown))),
          );
          expect(Option.map(refusal, (found) => found.stills)).toEqual(Option.some(notShown));
        }
        if (expected !== 'approved') continue;
        const moved = Object.keys(stills)[Math.floor(next() * Object.keys(stills).length)] ?? '';
        yield* fs.writeFile(
          `${root}/${moved}`,
          Uint8Array.from({ length: 64 }, () => Math.floor(next() * 256)),
        );
        yield* pin(root, ask);
        expect([i, 'a re-pin after the answer', yield* approvedOn(root, ask)]).toEqual([
          i,
          'a re-pin after the answer',
          ['StillsNotShown', true],
        ]);
        seen.add('re-pin refused');
      }
      expect([...seen].toSorted()).toEqual([
        'AskNotApproval',
        'AskUnanswered',
        'StillsNotShown',
        'approved',
        're-pin refused',
      ]);
    }).pipe(Effect.scoped));
});
