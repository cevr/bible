// The asks on disk: an ask that may not render is never kept (its problems
// said, a board try not on its board named), a board try is found for its
// picture, and each image file it shows is copied as it is made and shown as
// the copy, kept by its SHA-256 (its receipt); the owner answers the proof (try 7, so why, then done), a retry
// of the same answer is answered as it was and a different one refused; an
// optional field left empty is answered skipped, and sent blank again is the
// same answer; an ask past its deadline takes no answer; a close keeps what
// was answered and is answered as it is when said again; an ask on a
// production files its question as it is made and its answers once closed,
// each once; an ask on disk with a step named by a key every object answers
// to is not read. A decision that names its ask and carries no picks is
// given those its record files, once (`fillPicks`); one whose record is not
// there or does not read, whose ask files on another production, still
// asks, is answered and not closed or was closed before its end, or that was
// answered by no choice, is left as it is; a run that fills nothing writes
// nothing; each decision is answered as the write found it, so one filed
// after the list read its ledger is left for the next run; and a ledger kept
// in a file not named for its production is not filled, nor any other file
// written for it.

import { describe, expect, it } from 'effect-bun-test';
import {
  Boolean as Bool,
  Effect,
  Exit,
  FileSystem,
  Layer,
  Match,
  Option,
  Path,
  Result,
  Schema,
} from 'effect';
import { TestClock } from 'effect/testing';
import {
  type Ask,
  AskBlock,
  AskName,
  Ask as AskSchema,
  AskState,
  imagesIn,
  nextAsking,
  oneQuestion,
  pageCount,
  pageCountText,
} from '../core/ask.ts';
import { askShownUrl } from '../core/api.ts';
import { type BoardFile, BoardFileJson, BoardName } from '../core/board.ts';
import { type OwnerWord, decisionsOf } from '../core/production.ts';
import { Segment } from '../core/segment.ts';
import { type Laid, whyUnbacked } from '../style/override.ts';
import { AskStore, type PicksFound, fillPicks } from './ask-store.ts';
import { sha256Hex } from './digest.ts';
import type { ContentStore } from './content-store.ts';
import { ProductionStore } from './production-store.ts';
import { labInMemory, NOTES_LAB, text } from './testing.ts';

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

/** The film's files: its Board, and each try's image, which an ask copies as it is made (the receipt rule). */
const files = () =>
  new Map<string, Uint8Array>([
    ['/films/f/scenes/index.ts', text('export {};\n')],
    ['/films/f/board.json', text(Schema.encodeSync(BoardFileJson)(board))],
    ['/films/f/board/word.church.1.png', text('try 1 as drawn')],
    ['/films/f/board/word.church.7.png', text('try 7 as drawn')],
  ]);

/** An ask, a page's blocks and a step's name as an agent writes them, decoded as the lab decodes them. */
const askOf = Schema.decodeSync(AskSchema);
const pageOf = Schema.decodeSync(Schema.Array(AskBlock));
const step = Schema.decodeSync(AskName);

/** The proof: choose a try of the panel; 7 asks why; done. */
const proof = (tries: ReadonlyArray<number>): Ask =>
  askOf({
    start: 'pick',
    steps: {
      pick: {
        blocks: [
          {
            kind: 'choose',
            id: 'try',
            label: 'Which try do we keep?',
            options: tries.map((n, i) => ({
              value: String(n),
              label: `Try ${n}`,
              image: { board: { film: 'f', panel: 'word.church', try: n } },
              // A Board try kept: typed, and no scene, so the keep gate never asks a review of it.
              outcome: 'keep',
              keeps: { film: 'f', scenes: [] },
              ...Bool.match(i === 0, {
                onFalse: () => ({}),
                onTrue: () => ({ recommended: true }),
              }),
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

const run = <A, E>(
  self: Effect.Effect<
    A,
    E,
    AskStore | ContentStore | ProductionStore | FileSystem.FileSystem | Path.Path
  >,
) => self.pipe(Effect.provide(labInMemory(files())));

/** A decision filed by hand at `hour` on 2026-10-18 that names `ask` and carries no picks. */
const decidedOn = (ask: string, hour: number): OwnerWord => ({
  _tag: 'Decided',
  at: Date.UTC(2026, 9, 18, hour),
  text: `Kept (ask ${ask})`,
  quote: Option.none(),
  set: Option.none(),
  point: Option.none(),
  variant: Option.none(),
  ask: Option.some(ask),
  picks: Option.none(),
  by: Option.some('agent'),
});

/** What a fill found, a line each: the production, the ask, and the picks filled or why none. */
const told = (found: ReadonlyArray<{ production: string; found: PicksFound }>) =>
  found.map(({ production, found: f }) => [
    production,
    f.ask,
    Match.value(f).pipe(Match.tagsExhaustive({ Filled: (x) => x.picks, Left: (x) => x.why })),
  ]);

/** `f`'s ledger with no picks on its decisions, as a store that files none writes it. */
const unpickedF = (productions: ProductionStore['Service']) =>
  productions.modify('f', (file) =>
    Result.succeed({ ...file, said: file.said.map((s) => ({ ...s, picks: Option.none() })) }),
  );

/** The ask a decision filed between the fill's list and its write names (`racing`). */
const LATE = 'a0000000003';

/**
 * The production store with a decision on `LATE`, no picks on it, filed on a
 * ledger just before each `attempt` takes its lock: as if filed after the
 * fill's list read the ledger.
 */
const racing = Layer.effect(
  ProductionStore,
  Effect.gen(function* () {
    const real = yield* ProductionStore;
    return ProductionStore.of({
      ...real,
      attempt: (production, change) =>
        Effect.andThen(
          Effect.orDie(real.say(production, decidedOn(LATE, 13))),
          real.attempt(production, change),
        ),
    });
  }),
);

describe('the asks on disk', () => {
  it.effect('keeps no ask that may not render, and finds a board try for its picture', () =>
    run(
      Effect.gen(function* () {
        const asks = yield* AskStore;
        const dangling = askOf({
          start: 'a',
          steps: { a: { blocks: [{ kind: 'prose', text: 'a' }], next: [{ to: 'nowhere' }] } },
        });
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
        expect(made.ask.steps[step('pick')]).toMatchObject({
          blocks: [
            {
              options: [
                {
                  value: '1',
                  image: { src: askShownUrl(made.id, `${sha256Hex(text('try 1 as drawn'))}.png`) },
                },
                {
                  value: '7',
                  image: { src: askShownUrl(made.id, `${sha256Hex(text('try 7 as drawn'))}.png`) },
                },
              ],
            },
          ],
        });
        expect(yield* asks.read(made.id)).toEqual(made);
        expect((yield* Effect.flip(asks.read('a9999999999')))._tag).toBe('AskUnknown');
      }),
    ),
  );

  it.effect(
    "keeps the receipt of its images as it makes the ask: each try's file copied by its SHA-256 and shown as the copy; a try with no file refuses the make, naming its src",
    () => {
      const one = text('try 1 as drawn');
      const seven = text('try 7 as drawn');
      const lab = files();
      return Effect.gen(function* () {
        const asks = yield* AskStore;
        const made = yield* asks.make(draft(proof([1, 7])));
        const copies = [one, seven].map((bytes) => askShownUrl(made.id, `${sha256Hex(bytes)}.png`));
        expect(imagesIn(made.ask).map((image) => image.src)).toEqual(copies);
        const receipt = { [copies[0] ?? '']: sha256Hex(one), [copies[1] ?? '']: sha256Hex(seven) };
        expect(made.shown).toEqual(receipt);
        expect((yield* asks.read(made.id)).shown).toEqual(receipt);
        lab.delete('/films/f/board/word.church.1.png');
        const refused = yield* Effect.flip(asks.make(draft(proof([1, 7]))));
        expect(refused._tag).toBe('AskRefused');
        expect(refused.message).toContain('image /api/films/f/board/files/word.church.1.png');
        expect(yield* asks.list).toHaveLength(1);
      }).pipe(Effect.provide(labInMemory(lab)));
    },
  );

  it.effect('keeps no ask whose choice names no set, by the rule a word is aimed by', () =>
    run(
      Effect.gen(function* () {
        const asks = yield* AskStore;
        const unaimed = yield* Effect.flip(
          asks.make({ ...draft(proof([1, 7])), point: 'render:cold' }),
        );
        expect([unaimed._tag, unaimed.message]).toEqual([
          'WordUnaimed',
          '`point` is a choice in a set: name the `set`',
        ]);
        expect(yield* asks.list).toEqual([]);
      }),
    ),
  );

  it.effect('runs the proof: try 7, then why, then done; a retry is answered as it was', () =>
    run(
      Effect.gen(function* () {
        const asks = yield* AskStore;
        const { id } = yield* asks.make(draft(proof([1, 7])));
        const picked = yield* asks.answerPage(id, [{ step: step('pick'), values: { try: '7' } }]);
        expect(picked.state).toMatchObject({ _tag: 'Asking', step: 'why' });
        // The phone sends the same pick again: the ask as it is.
        expect(yield* asks.answerPage(id, [{ step: step('pick'), values: { try: '7' } }])).toEqual(
          picked,
        );
        const other = yield* Effect.flip(
          asks.answerPage(id, [{ step: step('pick'), values: { try: '1' } }]),
        );
        expect(other.message).toContain('step pick is answered already');
        const empty = yield* Effect.flip(asks.answerPage(id, [{ step: step('why'), values: {} }]));
        expect(empty._tag).toBe('AskRefused');
        const done = yield* asks.answerPage(id, [
          { step: step('why'), values: { why: 'the light falls on the pulpit' } },
        ]);
        expect(done.state).toEqual(
          AskState.Answered({
            step: step('done'),
            answers: {
              try: { kind: 'choose', value: '7', label: 'Try 7' },
              why: { kind: 'free_text', text: 'the light falls on the pulpit' },
            },
          }),
        );
        expect(done.answered.map((a): string => a.step)).toEqual(['pick', 'why']);
        const closed = yield* asks.close(id, 'kept try 7');
        expect(closed.state).toMatchObject({ _tag: 'Closed', why: 'kept try 7' });
        expect(closed.state.answers).toEqual(done.state.answers);
        expect(yield* asks.close(id, 'kept try 7')).toEqual(closed);
        expect((yield* Effect.flip(asks.close(id, 'another'))).message).toContain('closed already');
        const after = yield* Effect.flip(
          asks.answerPage(id, [{ step: step('why'), values: { why: 'again' } }]),
        );
        expect(after._tag).toBe('AskRefused');
      }),
    ),
  );

  it.effect(
    'files its question as it is made, and its answers once closed, each once, with his picks',
    () =>
      run(
        Effect.gen(function* () {
          const asks = yield* AskStore;
          const productions = yield* ProductionStore;
          yield* productions.start('f', {
            title: 'F',
            film: Option.none(),
            blurb: Option.none(),
            first: 'v1',
            at: 0,
          });
          const said = Effect.map(productions.read('f'), (file) =>
            Option.getOrThrow(file).said.map((s) => [s._tag, s.text, s.set, s.quote]),
          );
          const picks = Effect.map(productions.read('f'), (file) =>
            Option.getOrThrow(file).said.map((s) => s.picks),
          );
          const { id } = yield* asks.make({
            ...draft(proof([1, 7])),
            production: 'f',
            set: 'spare/judge-faces',
          });
          expect(yield* said).toEqual([
            ['Asked', `Keep a try (ask ${id})`, Option.some('judge-faces'), Option.none()],
          ]);
          yield* asks.answerPage(id, [{ step: step('pick'), values: { try: '7' } }]);
          yield* asks.answerPage(id, [{ step: step('why'), values: { why: 'the light' } }]);
          yield* asks.close(id, 'kept try 7');
          // Closed again with the same words: answered as it is, filed once.
          yield* asks.close(id, 'kept try 7');
          expect(yield* said).toEqual([
            ['Asked', `Keep a try (ask ${id})`, Option.some('judge-faces'), Option.none()],
            [
              'Decided',
              `Keep a try (ask ${id}): try: Try 7 · why: the light`,
              Option.some('judge-faces'),
              Option.some('the light'),
            ],
          ]);
          // His words are the decision's quote, and his choice its picks: the value of the option he chose.
          expect(yield* picks).toEqual([Option.none(), Option.some({ try: '7' })]);
          // An ask on no production files nothing.
          const loose = yield* asks.make(draft(proof([1, 7])));
          yield* asks.close(loose.id, 'not needed');
          expect(yield* said).toHaveLength(2);
        }),
      ),
  );

  it.effect('files its answers at the time they were given, before a later decision', () =>
    run(
      Effect.gen(function* () {
        const asks = yield* AskStore;
        const productions = yield* ProductionStore;
        yield* TestClock.setTime(Date.UTC(2026, 9, 14, 12));
        yield* productions.start('f', {
          title: 'F',
          film: Option.none(),
          blurb: Option.none(),
          first: 'v1',
          at: 0,
        });
        const { id } = yield* asks.make({ ...draft(proof([1, 7])), production: 'f' });
        yield* TestClock.adjust('1 minute');
        yield* asks.answerPage(id, [{ step: step('pick'), values: { try: '1' } }]);
        const answered = Date.UTC(2026, 9, 14, 12, 1);
        // The owner decides again in chat, after he answered and before the ask is closed.
        yield* TestClock.adjust('1 hour');
        yield* productions.say('f', {
          _tag: 'Decided',
          at: Date.UTC(2026, 9, 14, 13, 1),
          text: 'Try 7 after all',
          quote: Option.some('no, the seventh'),
          set: Option.none(),
          point: Option.none(),
          variant: Option.none(),
          ask: Option.none(),
          picks: Option.none(),
          by: Option.some('agent'),
        });
        yield* TestClock.adjust('1 hour');
        yield* asks.close(id, 'kept try 1');
        const said = Option.getOrThrow(yield* productions.read('f')).said;
        // The newest decision is the one he made last: the ask's answer sorts before it.
        expect(said.map((s) => [s._tag, s.at, s.text])).toEqual([
          ['Decided', answered, `Keep a try (ask ${id}): try: Try 1`],
          ['Decided', Date.UTC(2026, 9, 14, 13, 1), 'Try 7 after all'],
        ]);
      }),
    ),
  );

  it.effect('files a withdrawal its first filing missed at the time it was closed', () =>
    run(
      Effect.gen(function* () {
        const asks = yield* AskStore;
        const productions = yield* ProductionStore;
        const fs = yield* FileSystem.FileSystem;
        const path = yield* Path.Path;
        yield* TestClock.setTime(Date.UTC(2026, 9, 14, 12));
        yield* productions.start('f', {
          title: 'F',
          film: Option.none(),
          blurb: Option.none(),
          first: 'v1',
          at: 0,
        });
        const ledger = path.resolve('productions', 'f.json');
        const kept = yield* fs.readFileString(ledger);
        const { id } = yield* asks.make({ ...draft(proof([1, 7])), production: 'f' });
        // The ledger does not read when the ask is closed: the close stands, its filing fails.
        yield* fs.writeFileString(ledger, '{');
        yield* TestClock.adjust('1 minute');
        const closed = Date.UTC(2026, 9, 14, 12, 1);
        expect(Exit.isFailure(yield* Effect.exit(asks.close(id, 'not needed')))).toBe(true);
        expect((yield* asks.read(id)).state._tag).toBe('Closed');
        // Mended an hour on, the same close files it, at the time it was closed.
        yield* fs.writeFileString(ledger, kept);
        yield* TestClock.adjust('1 hour');
        yield* asks.close(id, 'not needed');
        const said = Option.getOrThrow(yield* productions.read('f')).said;
        expect(said.map((s) => [s._tag, s.at, s.text])).toEqual([
          ['Noted', closed, `Keep a try (ask ${id}) withdrawn: not needed`],
        ]);
      }),
    ),
  );

  it.effect('an optional field left empty is answered skipped; sent blank again, the same', () =>
    run(
      Effect.gen(function* () {
        const asks = yield* AskStore;
        const { id } = yield* asks.make(
          draft(
            oneQuestion(
              pageOf([
                {
                  kind: 'choose',
                  id: 'keep',
                  label: 'Keep it?',
                  options: [
                    { value: 'yes', label: 'Yes', recommended: true },
                    { value: 'no', label: 'No' },
                  ],
                },
                { kind: 'free_text', id: 'more', label: 'Anything else?' },
              ]),
            ),
          ),
        );
        const done = yield* asks.answerPage(id, [
          { step: step('ask'), values: { keep: 'yes', more: '' } },
        ]);
        expect(done.state).toEqual(
          AskState.Answered({
            step: step('done'),
            answers: {
              keep: { kind: 'choose', value: 'yes', label: 'Yes' },
              more: { kind: 'skipped' },
            },
          }),
        );
        expect(done.answered.map((a) => a.values)).toEqual([{ keep: 'yes' }]);
        expect(
          yield* asks.answerPage(id, [{ step: step('ask'), values: { keep: 'yes', more: '  ' } }]),
        ).toEqual(done);
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
        const exit = yield* Effect.exit(
          asks.answerPage(id, [{ step: step('pick'), values: { try: '1' } }]),
        );
        expect(Exit.isFailure(exit)).toBe(true);
        expect(String(exit)).toContain('it was due by 2026-10-14T11:00:00.000Z');
      }),
    ),
  );

  it.effect(
    'reads no ask on disk that holds a step named only by a key every object answers to',
    () =>
      run(
        Effect.gen(function* () {
          const asks = yield* AskStore;
          const fs = yield* FileSystem.FileSystem;
          const made = yield* asks.make(draft(proof([1, 7])));
          const file = `${NOTES_LAB}/asks/${made.id}.json`;
          const kept = yield* fs.readFileString(file);
          yield* fs.writeFileString(
            file,
            kept.replace('"steps": {', '"steps": {\n      "constructor": { "end": true },'),
          );
          const refused = yield* Effect.flip(asks.read(made.id));
          expect(String(refused)).toContain('every object answers to "constructor"');
          expect(yield* asks.list).toEqual([]);
        }),
      ),
  );

  it.effect(
    'fills the picks a decision that names its ask lacks, as its close files them, once',
    () =>
      run(
        Effect.gen(function* () {
          const asks = yield* AskStore;
          const productions = yield* ProductionStore;
          const fs = yield* FileSystem.FileSystem;
          const path = yield* Path.Path;
          yield* TestClock.setTime(Date.UTC(2026, 9, 18, 12));
          yield* productions.start('f', {
            title: 'F',
            film: Option.none(),
            blurb: Option.none(),
            first: 'v1',
            at: 0,
          });
          // His pick on the lead, and an ask he answered in words alone, each filed by its close.
          const chosen = yield* asks.make({
            ...draft(proof([1, 7])),
            production: 'f',
            set: 'spare/judge-faces',
            point: 'item:lead',
          });
          yield* asks.answerPage(chosen.id, [{ step: step('pick'), values: { try: '7' } }]);
          yield* asks.answerPage(chosen.id, [{ step: step('why'), values: { why: 'the light' } }]);
          yield* asks.close(chosen.id, 'kept try 7');
          const worded = yield* asks.make({
            ...draft(
              oneQuestion(
                pageOf([{ kind: 'free_text', id: 'more', label: 'Anything?', required: true }]),
              ),
            ),
            production: 'f',
          });
          yield* asks.answerPage(worded.id, [{ step: step('ask'), values: { more: 'as it is' } }]);
          yield* asks.close(worded.id, 'heard');
          // Asks whose records file no decision on f: one on another production, one answered
          // and not closed, one closed before its end, one that still asks.
          const elsewhere = yield* asks.make({ ...draft(proof([1, 7])), production: 'g' });
          yield* asks.answerPage(elsewhere.id, [{ step: step('pick'), values: { try: '1' } }]);
          yield* asks.close(elsewhere.id, 'kept try 1');
          const answered = yield* asks.make({ ...draft(proof([1, 7])), production: 'f' });
          yield* asks.answerPage(answered.id, [{ step: step('pick'), values: { try: '1' } }]);
          const withdrawn = yield* asks.make({ ...draft(proof([1, 7])), production: 'f' });
          yield* asks.close(withdrawn.id, 'not needed');
          const asking = yield* asks.make({ ...draft(proof([1, 7])), production: 'f' });
          // A decision on an ask the lab holds no record of, one on an ask whose record the
          // platform cannot read (a folder where its file would be), and one on each ask above.
          const lost = 'a0000000001';
          const unread = 'a0000000002';
          yield* fs.makeDirectory(`${NOTES_LAB}/asks/${unread}.json`, { recursive: true });
          yield* Effect.forEach(
            [lost, unread, elsewhere.id, answered.id, withdrawn.id, asking.id],
            (ask, i) => productions.say('f', decidedOn(ask, 13 + i)),
          );
          const ledger = path.resolve('productions', 'f.json');
          const filed = yield* fs.readFileString(ledger);
          yield* unpickedF(productions);
          expect(yield* fs.readFileString(ledger)).not.toEqual(filed);
          // An override that cites his pick: backed only once the decision carries it.
          const stride: Laid = {
            item: 'lead',
            override: {
              rule: 'FigureLock',
              place: 'lead',
              reason: 'his stride',
              answer: { ask: chosen.id, question: 'try', value: '7' },
            },
          };
          const unbacked = Effect.map(productions.read('f'), (file) =>
            whyUnbacked(stride, decisionsOf(Option.getOrThrow(file))),
          );
          expect(Option.isSome(yield* unbacked)).toBe(true);
          const left = [
            ['f', worded.id, 'he answered it by no choice'],
            ['f', lost, `no record of it at ${NOTES_LAB}/asks/${lost}.json`],
            ['f', unread, expect.stringMatching(/^its record does not read: /)],
            ['f', elsewhere.id, 'its ask files on g'],
            ['f', answered.id, 'its ask is not closed: it is answered'],
            ['f', withdrawn.id, 'its ask was closed before its end'],
            ['f', asking.id, 'its ask is not closed: it still asks'],
          ];
          expect(told(yield* fillPicks)).toEqual([['f', chosen.id, { try: '7' }], ...left]);
          // The ledger as the close filed it, byte for byte: the picks are all that came back.
          expect(yield* fs.readFileString(ledger)).toEqual(filed);
          expect(yield* unbacked).toEqual(Option.none());
          // A second run fills nothing and writes nothing: the ledger in other bytes that read
          // the same is left in them.
          const reflowed = filed.replaceAll('\n', '\n  ');
          yield* fs.writeFileString(ledger, reflowed);
          expect(told(yield* fillPicks)).toEqual(left);
          expect(yield* fs.readFileString(ledger)).toEqual(reflowed);
        }),
      ),
  );

  it.effect(
    'answers each decision as its write found it: one filed after the list read its ledger waits for the next run',
    () =>
      run(
        Effect.gen(function* () {
          const asks = yield* AskStore;
          const productions = yield* ProductionStore;
          yield* TestClock.setTime(Date.UTC(2026, 9, 18, 12));
          const chosen = yield* asks.make({ ...draft(proof([1, 7])), production: 'f' });
          yield* asks.answerPage(chosen.id, [{ step: step('pick'), values: { try: '1' } }]);
          yield* asks.close(chosen.id, 'kept try 1');
          yield* unpickedF(productions);
          expect(told(yield* fillPicks)).toEqual([
            ['f', chosen.id, { try: '1' }],
            ['f', LATE, 'filed after its ledger was read'],
          ]);
          const ledger = Option.getOrThrow(yield* productions.read('f'));
          expect(ledger.said.flatMap((s) => Option.toArray(s.ask))).toEqual([chosen.id, LATE]);
          expect(ledger.said.map((s) => Option.isSome(s.picks))).toEqual([true, false]);
        }).pipe(Effect.provide(racing)),
      ),
  );

  it.effect('fills no ledger kept in a file not named for its production, nor writes one', () =>
    run(
      Effect.gen(function* () {
        const asks = yield* AskStore;
        const productions = yield* ProductionStore;
        const fs = yield* FileSystem.FileSystem;
        const path = yield* Path.Path;
        yield* TestClock.setTime(Date.UTC(2026, 9, 18, 12));
        // His pick, filed on `renamed` by its close and taken off, and that ledger's file renamed.
        const chosen = yield* asks.make({ ...draft(proof([1, 7])), production: 'renamed' });
        yield* asks.answerPage(chosen.id, [{ step: step('pick'), values: { try: '1' } }]);
        yield* asks.close(chosen.id, 'kept try 1');
        yield* productions.modify('renamed', (file) =>
          Result.succeed({ ...file, said: file.said.map((s) => ({ ...s, picks: Option.none() })) }),
        );
        const named = path.resolve('productions', 'renamed.json');
        const kept = path.resolve('productions', 'old-name.json');
        yield* fs.rename(named, kept);
        const before = yield* fs.readFileString(kept);
        expect(yield* fillPicks).toEqual([]);
        expect(yield* fs.readFileString(kept)).toEqual(before);
        expect(yield* fs.exists(named)).toBe(false);
      }),
    ),
  );
});

/** A one-choice ask by `by`, as an agent makes it in sequence. */
const choice = (by: string, title: string) => ({
  title,
  why: 'the beat waits',
  by,
  ask: oneQuestion(
    pageOf([
      {
        kind: 'choose',
        id: 'pick',
        label: title,
        options: [
          { value: 'a', label: 'A', recommended: true },
          { value: 'b', label: 'B' },
        ],
      },
    ]),
  ),
});

/** `id`'s one step answered: its ask settled. */
const answerOne = (asks: AskStore['Service'], id: string) =>
  asks.answerPage(id, [{ step: step('ask'), values: { pick: 'a' } }]);

describe('the pages of asks', () => {
  it.effect(
    'an ask made while the same asker still asks joins its page; answered, or another asker, opens a new one',
    () =>
      run(
        Effect.gen(function* () {
          const asks = yield* AskStore;
          yield* TestClock.setTime(Date.UTC(2026, 9, 17, 12));
          const first = yield* asks.make(choice('canon', 'Which canon?'));
          expect(first.page).toBeUndefined();
          yield* TestClock.adjust('1 minute');
          const second = yield* asks.make(choice('canon', 'And the follow-up?'));
          expect(second.page).toBe(first.id);
          // Another asker's ask is a page of its own, and asks of its own join that one.
          const other = yield* asks.make(choice('look', 'Which look?'));
          expect(other.page).toBeUndefined();
          yield* TestClock.adjust('1 minute');
          const third = yield* asks.make(choice('canon', 'One more?'));
          expect(third.page).toBe(first.id);
          // By any of its asks, the page is its asks in the order made.
          const page = yield* asks.page(third.id);
          expect(page.page).toBe(first.id);
          expect(page.asks.map((a) => a.title)).toEqual([
            'Which canon?',
            'And the follow-up?',
            'One more?',
          ]);
          expect(pageCount(page.asks)).toEqual({ answered: 0, of: 3 });
          expect((yield* asks.page(other.id)).asks.map((a) => a.id)).toEqual([other.id]);
          // Each is answered and closed on its own; one withdrawn is no longer counted.
          yield* answerOne(asks, first.id);
          yield* asks.close(second.id, 'withdrawn: asked again');
          const counted = yield* asks.page(first.id);
          expect(pageCount(counted.asks)).toEqual({ answered: 1, of: 2 });
          expect(pageCountText(pageCount(counted.asks))).toBe('1 of 2 answered');
          expect(Option.map(nextAsking(counted.asks), (a) => a.id)).toEqual(Option.some(third.id));
          // Once nothing on it asks, the asker's next ask opens a new page.
          yield* answerOne(asks, third.id);
          const fresh = yield* asks.make(choice('canon', 'A new question'));
          expect(fresh.page).toBeUndefined();
        }),
      ),
  );

  it.effect(
    'an ask names a page to join (by any ask on it) or a new one; a page with nothing asking takes none',
    () =>
      run(
        Effect.gen(function* () {
          const asks = yield* AskStore;
          const opener = yield* asks.make(choice('canon', 'Which canon?'));
          const joined = yield* asks.make(choice('canon', 'Follow-up'));
          // Another asker joins the page by naming an ask on it, not the opener alone.
          const named = yield* asks.make({ ...choice('look', 'Which look?'), page: joined.id });
          expect(named.page).toBe(opener.id);
          // `new` opens a page though the asker's still asks.
          const apart = yield* asks.make({ ...choice('canon', 'Apart'), page: 'new' });
          expect(apart.page).toBeUndefined();
          const unknown = yield* Effect.flip(
            asks.make({ ...choice('canon', 'x'), page: 'a00000000ff' }),
          );
          expect(unknown._tag).toBe('AskUnknown');
          yield* answerOne(asks, apart.id);
          const shut = yield* Effect.flip(asks.make({ ...choice('canon', 'x'), page: apart.id }));
          expect(shut._tag).toBe('AskRefused');
          expect(shut.message).toContain('takes no new ask');
          expect(yield* asks.list).toHaveLength(4);
        }),
      ),
  );

  it.effect('an ask kept before pages reads as a page of one', () =>
    run(
      Effect.gen(function* () {
        const asks = yield* AskStore;
        const fs = yield* FileSystem.FileSystem;
        const kept = yield* asks.make(choice('old', 'Kept before pages'));
        const onDisk = yield* fs.readFileString(asks.file(kept.id));
        expect(onDisk).not.toContain('"page"');
        expect(yield* asks.page(kept.id)).toEqual({ page: kept.id, asks: [kept] });
      }),
    ),
  );
});
