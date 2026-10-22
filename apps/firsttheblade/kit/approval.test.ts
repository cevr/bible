/**
 * The approval binds the bytes the owner was shown. `approve` turns the
 * record approved only on an ask he answered with the approve choice, and
 * only when every pinned still's SHA-256 is that of a file an image block of
 * that ask showed (as the lab serves it); it stores the lab, his answer's
 * label and the shown files' hashes, and refuses every other case, leaving
 * the record as it was. Over a seed: random pinned stills, random shown
 * files, random answers, and a re-pin after his answer to bytes no block
 * showed. An earlier approval stays true of the bytes it showed: a later ask
 * need show only what changed. `pin` and `approve` save the ask beside the
 * record, so the record as committed and each approval it keeps are of asks
 * whose saved records showed every still. A past real answer is checked
 * against the stills it showed, kept with its saved record, not the stills as
 * they stand. Each over a copy of the app, with a stand-in lab.
 */
import { BunServices } from '@effect/platform-bun';
import { describe, expect, it } from 'effect-bun-test';
import { Context, Effect, FileSystem, Layer, Match, Option, Ref, Schema } from 'effect';

import {
  APPROVE,
  RECORD,
  STILLS_QUESTION,
  Approved,
  approve,
  imagesShown,
  pin,
  readRecord,
  savedAsk,
  stillsNotShown,
  StillsMoved,
  StillsNotShown,
} from './approval.ts';
import { sha256 } from './build-walk.ts';
import {
  AskAnswer,
  type AskAnswers,
  type AskRead,
  AskUnknown,
  LabAsk,
  LabAsks,
  LabUnread,
} from './lab-asks.ts';
import { scratchApp } from './scratch-app.ts';

const APP = `${import.meta.dir}/..`;
const ASK = 'a1b2c3d4e5f';
const OTHER = 'f5e4d3c2b1a';
const AT = '2026-10-22T09:00:00.000Z';
const LAB = 'http://lab.test/';

/**
 * The owner's real answers, as the lab records them (`GET /api/asks/<id>`),
 * each with the SHA-256 of every file its image blocks showed, by `src`, as
 * the lab served them, all kept as they were read (`savedAsk`). The tests
 * read the files and never the lab. Ask ab47076e90b showed the nine stills
 * byte for byte and prod's link cards, and the bytes it showed of each still
 * are kept by the still's path (`ask-ab47076e90b.stills/`); ask adf28c17753
 * showed screenshots of the page, and its `ask wait` lines are kept too.
 */
const SHOWED = 'ab47076e90b';
const SHOWED_AT = '2026-10-22T01:56:06.332Z';
const SHOWED_STILLS = `${import.meta.dir}/fixtures/ask-${SHOWED}.stills`;
const SCREENSHOTS = 'adf28c17753';
const SCREENSHOTS_WAIT = `${import.meta.dir}/fixtures/ask-${SCREENSHOTS}.txt`;

const Shown = Schema.fromJsonString(Schema.Record(Schema.String, Schema.String));
const Body = Schema.fromJsonString(Schema.Unknown);

/** An ask saved at `app`: the lab's record of it as it gave it, read, and the hash of each file it showed. */
const savedAt = Effect.fn('test/savedAt')(function* (app: string, ask: string) {
  const fs = yield* FileSystem.FileSystem;
  const { record, shown } = savedAsk(ask);
  const body = yield* Schema.decodeEffect(Body)(yield* fs.readFileString(`${app}/${record}`));
  const read: AskRead = { record: yield* Schema.decodeUnknownEffect(LabAsk)(body), body };
  return {
    read,
    shown: yield* Schema.decodeEffect(Shown)(yield* fs.readFileString(`${app}/${shown}`)),
  };
});

/** An ask saved beside the committed record. */
const saved = (ask: string) => savedAt(APP, ask);

const RecordJson = Schema.fromJsonString(Approved, { space: 2 });

/** The record at `root` written as given. */
const recordAt = (root: string, record: Approved) =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    yield* fs.writeFileString(
      `${root}/${RECORD}`,
      `${yield* Schema.encodeEffect(RecordJson)(record)}\n`,
    );
  });

/** A copy of the app whose record keeps no approval: pending on `OTHER`, over the stills as they stand. */
const freshApp = Effect.gen(function* () {
  const root = yield* scratchApp(APP);
  const { stills } = yield* readRecord(root);
  yield* recordAt(root, { approval: { status: 'pending', ask: OTHER }, earlier: [], stills });
  return root;
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
 * `AT`), showing an image block for each `src` of `shows` over two steps, a
 * video, an image block with no file, a block of another kind for each `src`
 * of `others` (none a file it shows as an image), and its choice.
 */
const held = (
  answers: AskAnswers,
  shows: ReadonlyArray<string>,
  tag: LabAsk['state']['_tag'] = 'Answered',
  id = ASK,
  others: ReadonlyArray<string> = [],
): LabAsk => {
  const values = Object.entries(answers).flatMap(([question, answer]) =>
    valueOf(answer).map((value) => [question, value] as const),
  );
  const steps = [{ step: 'approve', values: Object.fromEntries(values), at: AT }];
  const images = shows.map((src) => ({ kind: 'image', image: { src } }));
  const half = Math.ceil(images.length / 2);
  const look = [{ kind: 'video' }, { kind: 'image', image: {} }, ...images.slice(0, half)];
  const approve = [
    ...others.map((src) => ({ kind: 'board', image: { src } })),
    ...images.slice(half),
    { kind: 'choose' },
  ];
  return {
    id,
    ask: { steps: { look: { blocks: look }, approve: { blocks: approve }, end: {} } },
    state: { _tag: tag, answers },
    answered: steps.filter(() => Object.keys(answers).length > 0),
  };
};

/** What the stand-in lab holds: its asks, each read and as it gives it, and the SHA-256 of each file it serves, by `src`. */
interface Holding {
  readonly asks: ReadonlyArray<AskRead>;
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
            Effect.fromOption(Option.fromUndefinedOr(asks.find(({ record }) => record.id === ask))),
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

/** The stand-in lab made to hold `asks`, each read and as it gives it, and serve `files`. */
const holdingReads = (asks: ReadonlyArray<AskRead>, files: Readonly<Record<string, string>> = {}) =>
  Effect.gen(function* () {
    yield* Ref.set(yield* Held, { asks, files });
  });

/** An ask the lab gives as it reads it. */
const asRead = (record: LabAsk): AskRead => ({ record, body: record });

/** The stand-in lab made to hold `asks`, each given as it is read, and serve `files`. */
const holding = (asks: ReadonlyArray<LabAsk>, files: Readonly<Record<string, string>> = {}) =>
  holdingReads(asks.map(asRead), files);

/** The files that show `stills` byte for byte, one per still, by `src`. */
const showing = (stills: Approved['stills']) =>
  Object.fromEntries(Object.entries(stills).map(([still, hash]) => [srcOf(still), hash]));

/** The stills of `stills` named, with their hashes. */
const only = (stills: Approved['stills'], named: ReadonlyArray<string>) =>
  Object.fromEntries(named.map((still) => [still, stills[still] ?? '']));

/** `still` at `root` written with bytes drawn from `next`. */
const scramble = (root: string, still: string, next: () => number) =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    yield* fs.writeFile(
      `${root}/${still}`,
      Uint8Array.from({ length: 64 }, () => Math.floor(next() * 256)),
    );
  });

/** The record at `root` pinned pending on `ask`, the lab holding it unanswered; the record as pinned. */
const pinOn = (root: string, ask: string) =>
  Effect.gen(function* () {
    yield* holding([held({}, [], 'Asking', ask)]);
    return yield* pin(root, ask);
  });

/** A copy of the app keeping no approval, its record pinned pending on `ask`; the stills as pinned. */
const pinnedOn = (ask: string) =>
  Effect.gen(function* () {
    const root = yield* freshApp;
    const { stills } = yield* pinOn(root, ask);
    return { root, stills };
  });

/** The pending record at `root` approved on `ask`, the lab showing `files` on the approve choice; the record as approved. */
const approvedShowing = (root: string, ask: string, files: Readonly<Record<string, string>>) =>
  Effect.gen(function* () {
    yield* holding([held(APPROVED, Object.keys(files), 'Answered', ask)], files);
    return yield* approve(root, ask);
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
        earlier: [],
        stills,
      });
    }).pipe(Effect.scoped));

  test("approves on the owner's real answer to ask ab47076e90b over the stills it showed byte for byte, as kept with its saved record", () =>
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const real = yield* saved(SHOWED);
      expect(imagesShown(real.read.record).toSorted()).toEqual(Object.keys(real.shown).toSorted());
      const root = yield* freshApp;
      const kept = (yield* fs.readDirectory(SHOWED_STILLS, { recursive: true })).filter((entry) =>
        /\.(jpg|png|webp)$/.test(entry),
      );
      yield* Effect.forEach(kept, (still) =>
        Effect.flatMap(fs.readFile(`${SHOWED_STILLS}/${still}`), (bytes) =>
          fs.writeFile(`${root}/${still}`, bytes),
        ),
      );
      const { stills } = yield* pinOn(root, SHOWED);
      expect(Object.keys(stills).toSorted()).toEqual(kept.toSorted());
      yield* holdingReads([real.read], real.shown);
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
        earlier: [],
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
        real.read.record.state.answers,
      );
      const { root, stills } = yield* pinnedOn(SCREENSHOTS);
      yield* holdingReads([real.read], real.shown);
      const refusal = yield* approve(root, SCREENSHOTS).pipe(
        Effect.flip,
        Effect.map((error) => Option.liftPredicate(error, Schema.is(StillsNotShown))),
      );
      expect(Option.map(refusal, (found) => found.stills)).toEqual(
        Option.some(Object.keys(stills).toSorted()),
      );
      expect((yield* readRecord(root)).approval.status).toBe('pending');
    }).pipe(Effect.scoped));

  test('the committed record is pinned on an ask saved beside it, and with the approved asks it keeps, each saved and answered approve, every still was shown byte for byte', () =>
    Effect.gen(function* () {
      const { approval, earlier, stills } = yield* readRecord(APP);
      const asks = [approval, ...earlier];
      const reads = yield* Effect.forEach(asks, (given) =>
        Effect.map(saved(given.ask), (real) => ({ given, real })),
      );
      for (const { given, real } of reads) {
        expect(real.read.record.id).toBe(given.ask);
        expect(imagesShown(real.read.record).toSorted()).toEqual(
          Object.keys(real.shown).toSorted(),
        );
        if (given.status === 'pending') continue;
        expect(given.shown).toEqual(real.shown);
        expect(real.read.record.state._tag).not.toBe('Asking');
        expect(real.read.record.state.answers[STILLS_QUESTION]).toMatchObject({ value: APPROVE });
      }
      expect(earlier.every(({ status }) => status === 'approved')).toBe(true);
      expect(stillsNotShown(stills, ...reads.map(({ real }) => real.shown))).toEqual([]);
    }));

  test('pin saves the ask as the lab gives it with the hash of each file it shows, and approve saves it again as answered', () =>
    Effect.gen(function* () {
      const root = yield* freshApp;
      const { stills } = yield* readRecord(root);
      const files = showing(stills);
      const asking = held({}, Object.keys(files), 'Asking');
      const answered = held(APPROVED, Object.keys(files));
      const asked = { ...asking, served: 'as the lab gave it' };
      yield* holdingReads([{ record: asking, body: asked }], files);
      yield* pin(root, ASK);
      expect(yield* savedAt(root, ASK)).toEqual({
        read: { record: asking, body: asked },
        shown: files,
      });
      const given = { ...answered, served: 'answered' };
      yield* holdingReads([{ record: answered, body: given }], files);
      expect(yield* approvedOn(root, ASK)).toEqual(['approved', false]);
      expect(yield* savedAt(root, ASK)).toEqual({
        read: { record: answered, body: given },
        shown: files,
      });
    }).pipe(Effect.scoped));

  test('an earlier approval keeps the stills unchanged since: a later ask need show only the changed still, and a still changed since no ask showed is refused', () =>
    Effect.gen(function* () {
      const next = draws(7);
      const { root, stills } = yield* pinnedOn(ASK);
      const [changed = '', after = '', ...rest] = Object.keys(stills).toSorted();
      const first = yield* approvedShowing(root, ASK, showing(stills));
      yield* scramble(root, changed, next);
      const repinned = yield* pinOn(root, OTHER);
      expect(repinned.earlier).toEqual([first.approval]);
      yield* holding([held(APPROVED, [srcOf('decoy.png')], 'Answered', OTHER)], {
        [srcOf('decoy.png')]: sha256(Uint8Array.from([7])),
      });
      const refusal = yield* approve(root, OTHER).pipe(
        Effect.flip,
        Effect.map((error) => Option.liftPredicate(error, Schema.is(StillsNotShown))),
      );
      expect(Option.map(refusal, (found) => found.stills)).toEqual(Option.some([changed]));
      const second = yield* approvedShowing(root, OTHER, showing(only(repinned.stills, [changed])));
      expect(second.earlier).toEqual([first.approval]);
      const THIRD = 'e1e2e3e4e5e';
      yield* scramble(root, after, next);
      const third = yield* pinOn(root, THIRD);
      expect(third.earlier).toEqual([second.approval, first.approval]);
      yield* holding(
        [held(APPROVED, Object.keys(showing(only(third.stills, rest))), 'Answered', THIRD)],
        showing(only(third.stills, rest)),
      );
      const unshown = yield* approve(root, THIRD).pipe(
        Effect.flip,
        Effect.map((error) => Option.liftPredicate(error, Schema.is(StillsNotShown))),
      );
      expect(Option.map(unshown, (found) => found.stills)).toEqual(Option.some([after]));
      expect((yield* readRecord(root)).approval).toEqual({ status: 'pending', ask: THIRD });
    }).pipe(Effect.scoped));

  test('pin drops each approval that shows no pinned still, and approve drops each earlier one whose stills its ask showed', () =>
    Effect.gen(function* () {
      const next = draws(11);
      const { root, stills } = yield* pinnedOn(ASK);
      const first = yield* approvedShowing(root, ASK, showing(stills));
      const again = yield* pinOn(root, OTHER);
      expect(again.earlier).toEqual([first.approval]);
      const second = yield* approvedShowing(root, OTHER, showing(again.stills));
      expect(second.earlier).toEqual([]);
      const THIRD = 'e1e2e3e4e5e';
      yield* Effect.forEach(Object.keys(stills), (still) => scramble(root, still, next));
      expect((yield* pinOn(root, THIRD)).earlier).toEqual([]);
    }).pipe(Effect.scoped));

  test('refuses each pinned still no image block showed byte for byte, naming each: one shown as a crop, one in a block of another kind', () =>
    Effect.gen(function* () {
      const { root, stills } = yield* pinnedOn(ASK);
      const [first = '', second = '', ...rest] = Object.keys(stills).toSorted();
      const files = {
        ...showing(Object.fromEntries(rest.map((still) => [still, stills[still] ?? '']))),
        [srcOf(`crop-of-${first}`)]: sha256(new TextEncoder().encode(first)),
      };
      const board = srcOf(`board-of-${second}`);
      yield* holding([held(APPROVED, Object.keys(files), 'Answered', ASK, [board])], {
        ...files,
        [board]: stills[second] ?? '',
      });
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

  test('refuses an ask the owner has not answered, and an answer to the stills question that is not the approve choice', () =>
    Effect.gen(function* () {
      const { root, stills } = yield* pinnedOn(ASK);
      const shows = Object.keys(showing(stills));
      yield* holding([held({}, shows, 'Asking')], showing(stills));
      expect(yield* approvedOn(root, ASK)).toEqual(['AskUnanswered', true]);
      yield* holding([held({ sway: SWAY }, shows)], showing(stills));
      expect(yield* approvedOn(root, ASK)).toEqual(['AskUnanswered', true]);
      const REVISE: AskAnswers[string] = { kind: 'choose', value: 'revise', label: 'Revise them' };
      for (const answer of [REVISE, NOTE, { kind: 'skipped' } as const]) {
        yield* holding([held({ [STILLS_QUESTION]: answer }, shows)], showing(stills));
        expect(yield* approvedOn(root, ASK)).toEqual(['AskNotApproval', true]);
      }
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

  test('over random pinned stills, shown files and answers, approves only stills shown byte for byte on the approve choice or by an approval it gave, and refuses a re-pin after it to bytes not shown', () =>
    Effect.gen(function* () {
      const root = yield* freshApp;
      const next = draws(54);
      const given: Array<Approved['earlier'][number]> = [];
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
        const scrambled = Object.keys(before).filter(() => next() < 0.3);
        for (const still of scrambled) yield* scramble(root, still, next);
        const { stills, earlier } = yield* pinOn(root, ask);
        const pinned = new Set(Object.values(stills));
        for (const kept of earlier) {
          expect(given).toContainEqual(kept);
          expect(Object.values(kept.shown).some((hash) => pinned.has(hash))).toBe(true);
        }
        const shownStills = Object.keys(stills).filter(() => next() < 0.85);
        const files = {
          ...showing(Object.fromEntries(shownStills.map((still) => [still, stills[still] ?? '']))),
          ...Object.fromEntries(
            scrambled.map((still) => [srcOf(`old/${still}`), before[still] ?? '']),
          ),
          [srcOf('decoy.png')]: sha256(Uint8Array.from([i])),
        };
        // Half the draws approve, so earlier approvals build up across asks.
        const drawn = Option.fromUndefinedOr(
          ANSWERS[Math.max(0, Math.floor(next() * ANSWERS.length * 2) - ANSWERS.length)],
        );
        if (Option.isNone(drawn)) return yield* Effect.die(new Error('no answer drawn'));
        const [answer, stateOf] = drawn.value;
        const ofAsk = {
          ...held(APPROVED, Object.keys(files), 'Answered', ask),
          state: stateOf(APPROVED),
        };
        yield* holdingReads([asRead(ofAsk), real.read], { ...files, ...real.shown });
        const hashes = new Set(Object.values(files));
        const notShown = stillsNotShown(stills, files, ...earlier.map(({ shown }) => shown));
        const expected = expectedOf(answer, notShown);
        seen.add(expected);
        if (expected === 'approved' && Object.values(stills).some((hash) => !hashes.has(hash)))
          seen.add('approved by an earlier approval');
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
        const { approval } = yield* readRecord(root);
        if (approval.status === 'approved') given.push(approval);
        if (next() < 0.5) continue;
        const moved = Object.keys(stills)[Math.floor(next() * Object.keys(stills).length)] ?? '';
        yield* scramble(root, moved, next);
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
        'approved by an earlier approval',
        're-pin refused',
      ]);
    }).pipe(Effect.scoped));
});
