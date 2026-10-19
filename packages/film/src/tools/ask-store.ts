// The asks on disk: one record each, `FILMS_LAB/asks/<id>.json` (a
// `ContentStore` manifest: written whole, one writer at a time across
// processes). An agent makes one (`make`: its machine checked and its board
// tries and its material found first, so nothing that may not render is
// kept; a choice it makes now recommends one option), the owner answers
// its page from any device (`answerPage`: each section's step in order, the
// run moved by its machine, `askMachine`, and every section kept or none),
// and the agent closes it. An ask made while an earlier one of the same
// asker (`by`) still asks joins that one's page (`page`, the opener's id),
// so asks made in sequence are answered on one page; `page` on the draft
// names an open page to join, or `new` opens one. A page is only the asks
// that name it (`pageIdOf`, `asksOnPage`): an ask with no `page` opened its
// own, as every ask kept before pages did. Makes are taken one at a time,
// so two made at once see each other. An answer is kept by its step, so the same
// answer sent again (a retry, a second tab) is answered as it was; a
// different one to a step already answered is refused, as is one to a step
// the ask has left, as its machine has it, and one past the deadline. An ask
// that names a production files its words on that production's timeline,
// each once by the ask's id (`withAskSaid`, under the ledger's lock): its
// question (when it names a set) as it is made, and once closed, its
// answers (answered to its end) or its withdrawal. A filing that failed is
// filed by the next close of the ask, and two closes at once file one word.
// A decision an ask filed with no picks of the owner's on it is given those
// its record files (`fillPicks`, an app's `bun run fill-picks`), so an
// override may cite them. The page, the MCP and the change feed all read and
// write through here.

import {
  Array as Arr,
  Clock,
  Config,
  Context,
  Data,
  DateTime,
  Effect,
  FileSystem,
  Layer,
  Match,
  Option,
  Order,
  Path,
  Random,
  Record,
  Result,
  Semaphore,
} from 'effect';
import { Machine } from 'effect-machine';
import {
  type Ask,
  type AskImage,
  type BoardTryRef,
  AskName,
  type AskRecord,
  AskEvent,
  type AsksPage,
  NEW_PAGE,
  AskRecordJson,
  type AskState,
  type StepValues,
  answerRefusal,
  answeredToEnd,
  answersLine,
  askMachine,
  askProblems,
  askStart,
  askStatus,
  asksOnPage,
  filled,
  givenAnswers,
  imagesIn,
  mapImages,
  pageIdOf,
  pageOpen,
  unrecommended,
} from '../core/ask.ts';
import { boardFileUrl } from '../core/api.ts';
import { panelById, tryOf } from '../core/board.ts';
import {
  type ProductionFile,
  type Said,
  aimedWord,
  setPathOf,
  withAskSaid,
} from '../core/production.ts';
import { AskInvalid, AskRefused, AskUnknown, type WordUnaimed } from '../core/refusals.ts';
import { AskMaterials } from './ask-materials.ts';
import { BoardStore } from './board-store.ts';
import { ContentStore, type Manifest, type StoreError } from './content-store.ts';
import { type FilmFolder, filmNamed } from './film-repo.ts';
import { ProductionStore } from './production-store.ts';

/** What an agent asks with: its title, why, who it is, by when, the film, and the machine. */
interface AskDraft {
  readonly title: string;
  readonly why: string;
  readonly by: string;
  readonly film?: string;
  readonly production?: string;
  readonly set?: string;
  readonly point?: string;
  /** The owner's own words, verbatim, that let a keep be asked without the set's review record. */
  readonly override?: { readonly quote: string };
  readonly deadline?: string;
  /** The page it goes on: an ask's id (the page that ask is on, which must still ask), or `new`; none: the asker's open page, else a new one. */
  readonly page?: string;
  readonly ask: Ask;
}

interface AskStoreService {
  /** The folder the asks are kept in. */
  readonly dir: string;
  /** The record file of ask `id`. */
  readonly file: (id: string) => string;
  /**
   * A new ask, aimed (`aimedWord`: a `point` names its `set`), its machine
   * checked and its board tries found, or why it may not render; its question
   * filed. It goes on the page `draft.page` names, or the asker's open one,
   * or a page of its own: a page named that no longer asks is refused.
   */
  readonly make: (
    draft: AskDraft,
  ) => Effect.Effect<AskRecord, WordUnaimed | AskInvalid | AskUnknown | AskRefused | StoreError>;
  readonly read: (id: string) => Effect.Effect<AskRecord, AskUnknown | StoreError>;
  /** The page ask `id` is on (an opener's id is its page's): its asks, in the order made. */
  readonly page: (id: string) => Effect.Effect<AsksPage, AskUnknown | StoreError>;
  /** Every ask, the newest first. */
  readonly list: Effect.Effect<ReadonlyArray<AskRecord>, StoreError>;
  /**
   * The owner's answers to the ask's page, each section's in order, all
   * kept or none: a step answered already takes the same answer again and
   * refuses another; past the deadline, or not fitting its step, refused.
   * The ask as they leave it.
   */
  readonly answerPage: (
    id: string,
    sections: ReadonlyArray<{ readonly step: AskName; readonly values: StepValues }>,
  ) => Effect.Effect<AskRecord, AskUnknown | AskRefused | StoreError>;
  /** The ask closed, `why` (withdrawn, or filed once answered): what was answered is kept, and filed. */
  readonly close: (
    id: string,
    why: string,
  ) => Effect.Effect<AskRecord, AskUnknown | AskRefused | StoreError>;
}

/** The one step of `MISSING`'s ask: its end. */
const MISSING_END = AskName.make('done');
/** `MISSING`'s ask: it starts at its end. */
const MISSING_ASK: Ask = { start: MISSING_END, steps: { [MISSING_END]: { end: true } } };
/** No record: what a manifest read gives for an ask that is not on disk. */
const MISSING: AskRecord = {
  id: AskName.make('missing'),
  title: '-',
  why: '-',
  by: '-',
  created: '',
  ask: MISSING_ASK,
  state: askStart(MISSING_ASK),
  answered: [],
};

/** An ask's id: `a` and ten hex digits. */
const newId = Effect.map(
  Effect.all([Random.nextIntBetween(0, 0x100000), Random.nextIntBetween(0, 0x100000)]),
  (halves) => AskName.make(`a${halves.map((h) => h.toString(16).padStart(5, '0')).join('')}`),
);

const ASK_ID = /^a[0-9a-f]{10}$/;

/** The folder the asks are kept in: `FILMS_LAB/asks` (the app's `lab/` under `runFilmCli`, else `<cwd>/lab`). */
const asksDir = Effect.gen(function* () {
  const path = yield* Path.Path;
  const root = yield* Config.String('FILMS_LAB').pipe(Config.withDefault(path.resolve('lab')));
  return path.join(root, 'asks');
});

/** The record at `file`, as the store reads and writes it: `empty` when it is not there. */
const recordAt = (file: string, empty = MISSING): Manifest<AskRecord> => ({
  file,
  codec: AskRecordJson,
  empty,
});

export class AskStore extends Context.Service<AskStore, AskStoreService>()(
  '@bible/film/tools/AskStore',
) {
  /** Asks under `FILMS_LAB/asks` (the app's `lab/` under `runFilmCli`, else `<cwd>/lab`). */
  static readonly layer = Layer.effect(
    AskStore,
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const path = yield* Path.Path;
      const store = yield* ContentStore;
      const boards = yield* BoardStore;
      const productions = yield* ProductionStore;
      const materials = yield* AskMaterials;
      const films = yield* Effect.context<FilmFolder>();
      const dir = yield* asksDir;

      const file = (id: string) => path.join(dir, `${id}.json`);
      const manifest = (id: string, empty = MISSING) => recordAt(file(id), empty);
      const now = Effect.map(DateTime.now, DateTime.formatIso);

      /** `image` with its `src`: a board try's file found on its film's board. */
      const found = (image: AskImage) =>
        Option.match(Option.fromUndefinedOr(image.board), {
          onNone: () => Effect.succeedSome(image),
          onSome: (ref) =>
            Effect.gen(function* () {
              const film = yield* filmNamed(ref.film).pipe(
                Effect.provideContext(films),
                Effect.option,
              );
              if (Option.isNone(film)) return Option.none<AskImage>();
              const board = yield* boards.read(film.value).pipe(Effect.option);
              return Option.map(
                Option.flatMap(
                  Option.flatMap(board, (b) => panelById(b, ref.panel)),
                  (p) => tryOf(p, ref.try),
                ),
                (t): AskImage => ({ ...image, src: boardFileUrl(film.value, t.file) }),
              );
            }),
        });

      /** A board try's key, as the images found are kept by. */
      const keyOf = (ref: BoardTryRef) => `${ref.film}\u0000${ref.panel}\u0000${ref.try}`;

      /** `ask` with every image's `src` found, or the board tries it names that are not on their boards. */
      const located = Effect.fn('AskStore.located')(function* (ask: Ask) {
        const refs = imagesIn(ask).flatMap((i) => Option.toArray(Option.fromUndefinedOr(i.board)));
        const srcs = new Map<string, string>();
        const missing: Array<string> = [];
        yield* Effect.forEach(refs, (ref) =>
          Effect.map(found({ board: ref }), (o) =>
            Option.match(
              Option.flatMap(o, (i) => Option.fromUndefinedOr(i.src)),
              {
                onNone: () => {
                  missing.push(
                    `board try ${ref.try} of ${ref.film} ${ref.panel} is not on its board`,
                  );
                },
                onSome: (src) => {
                  srcs.set(keyOf(ref), src);
                },
              },
            ),
          ),
        );
        const withSrc = mapImages(ask, (image) =>
          Option.match(
            Option.flatMap(Option.fromUndefinedOr(image.board), (ref) =>
              Option.fromUndefinedOr(srcs.get(keyOf(ref))),
            ),
            { onNone: () => image, onSome: (src) => ({ ...image, src }) },
          ),
        );
        return { ask: withSrc, missing: [...new Set(missing)] };
      });

      /**
       * The ask's words on its production's timeline, each filed once by the
       * ask's id: its question (when it names a set), and once closed, its
       * answers (answered to its end) or its withdrawal (closed before).
       */
      const filed = (record: AskRecord) =>
        Option.match(Option.fromUndefinedOr(record.production), {
          onNone: () => Effect.void,
          onSome: (production) =>
            Effect.gen(function* () {
              const words = askWords(record, yield* Clock.currentTimeMillis);
              if (words.length === 0) return;
              yield* productions.modify(production, (current) =>
                Result.succeed(words.reduce(withAskSaid, current)),
              );
            }),
        });

      // One make at a time: the page an ask joins is read and its record written under it.
      const making = yield* Semaphore.make(1);

      /**
       * The page a new ask by `by` goes on, by its opener's id: the one
       * `named` says (an ask's page, which must still ask; `new`, none),
       * else the newest ask of the asker's that still asks, else none (it
       * opens its own).
       */
      const pageFor = (by: string, named: Option.Option<string>) =>
        Effect.gen(function* () {
          if (Option.contains(named, NEW_PAGE)) return Option.none<AskName>();
          if (Option.isSome(named)) {
            const page = pageIdOf(yield* read(named.value));
            if (!pageOpen(asksOnPage(yield* list, page)))
              return yield* AskRefused.make({
                id: page,
                reason: `its page has nothing left asking, so it takes no new ask: leave \`page\` out, or say "${NEW_PAGE}"`,
              });
            return Option.some(page);
          }
          return Option.map(
            Arr.findFirst(yield* list, (r) => r.by === by && askStatus(r.state) === 'asking'),
            pageIdOf,
          );
        });

      /** The film production `production`'s ledger names, as the keep gate takes it: none when it names none or is not kept. */
      const productionFilmOf = (production: Option.Option<string>) =>
        Option.match(production, {
          onNone: () => Effect.succeed({}),
          onSome: (p) =>
            productions.read(p).pipe(
              Effect.map((file) =>
                Option.match(
                  Option.flatMap(file, (f) => f.film),
                  { onNone: () => ({}), onSome: (productionFilm) => ({ productionFilm }) },
                ),
              ),
              Effect.orElseSucceed(() => ({})),
            ),
        });

      const make = Effect.fn('AskStore.make')(function* (draft: AskDraft) {
        yield* Effect.fromResult(
          aimedWord({
            set: Option.fromUndefinedOr(draft.set),
            point: Option.fromUndefinedOr(draft.point),
            variant: Option.none(),
          }),
        );
        // A deadline kept as UTC ISO, so it compares with the time an answer comes in.
        const deadline = Option.map(Option.fromUndefinedOr(draft.deadline), (d) =>
          Option.map(DateTime.make(d), DateTime.formatIso),
        );
        const problems = [
          ...askProblems(draft.ask),
          ...unrecommended(draft.ask),
          ...Option.match(deadline, {
            onNone: () => [],
            onSome: (d) =>
              Option.match(d, {
                onNone: () => [
                  `deadline ${draft.deadline} is not a time (ISO, 2026-10-15T18:00:00Z)`,
                ],
                onSome: () => [],
              }),
          }),
        ];
        if (problems.length > 0) return yield* AskInvalid.make({ problems });
        // What it shows is found as its views find it: nothing kept may fail to render.
        const { ask, missing } = yield* located(draft.ask);
        const absent = [
          ...(yield* materials.problems(draft.ask)),
          ...missing,
          ...(yield* materials.evidence(
            { ...draft, ...(yield* productionFilmOf(Option.fromUndefinedOr(draft.production))) },
            draft.ask,
          )),
        ];
        if (absent.length > 0) return yield* AskInvalid.make({ problems: absent });
        return yield* making.withPermit(
          Effect.gen(function* () {
            const page = yield* pageFor(draft.by, Option.fromUndefinedOr(draft.page));
            return yield* kept(draft, ask, deadline, page);
          }),
        );
      });

      /** `draft` kept as a new ask, its machine `ask` (its images found), on `page` (none: its own). */
      const kept = (
        draft: AskDraft,
        ask: Ask,
        deadline: Option.Option<Option.Option<string>>,
        page: Option.Option<AskName>,
      ) =>
        Effect.gen(function* () {
          const id = yield* newId;
          const record: AskRecord = {
            id,
            title: draft.title,
            why: draft.why,
            by: draft.by,
            ...Option.match(Option.fromUndefinedOr(draft.film), {
              onNone: () => ({}),
              onSome: (film) => ({ film }),
            }),
            ...Option.match(Option.fromUndefinedOr(draft.production), {
              onNone: () => ({}),
              onSome: (production) => ({ production }),
            }),
            ...Option.match(Option.fromUndefinedOr(draft.set), {
              onNone: () => ({}),
              onSome: (set) => ({ set }),
            }),
            ...Option.match(Option.fromUndefinedOr(draft.point), {
              onNone: () => ({}),
              onSome: (point) => ({ point }),
            }),
            ...Option.match(Option.fromUndefinedOr(draft.override), {
              onNone: () => ({}),
              onSome: (override) => ({ override }),
            }),
            ...Option.match(page, { onNone: () => ({}), onSome: (p) => ({ page: p }) }),
            created: yield* now,
            ...Option.match(Option.flatten(deadline), {
              onNone: () => ({}),
              onSome: (at) => ({ deadline: at }),
            }),
            ask,
            state: askStart(ask),
            answered: [],
          };
          yield* store.update(manifest(id, record), () => record);
          yield* filed(record);
          yield* Effect.log(
            `asks.make id=${id} by=${draft.by} page=${pageIdOf(record)} steps=${Object.keys(ask.steps).length}`,
          );
          return record;
        });

      const known = (id: string) =>
        Effect.gen(function* () {
          if (!ASK_ID.test(id) || !(yield* fs.exists(file(id))))
            return yield* AskUnknown.make({ id });
          return manifest(id);
        });

      const read = Effect.fn('AskStore.read')(function* (id: string) {
        return yield* store.read(yield* known(id));
      });

      const list = Effect.gen(function* () {
        if (!(yield* fs.exists(dir))) return [];
        const names = (yield* fs.readDirectory(dir)).filter((n) =>
          ASK_ID.test(n.replace(/\.json$/, '')),
        );
        const records = yield* Effect.forEach(names, (n) =>
          store.read(manifest(n.replace(/\.json$/, ''))).pipe(Effect.option),
        );
        return Arr.sort(
          records.flatMap((r) => Option.toArray(Option.filter(r, (a) => a.id !== ''))),
          Order.flip(Order.mapInput(Order.String, (a: AskRecord) => a.created)),
        );
      });

      /** `state` moved by `event` through the ask's machine. */
      const moved = (ask: Ask, state: AskState, event: AskEvent) =>
        Machine.replay(askMachine(ask, state), [event], { from: state });

      /**
       * `current` moved by the owner's `values` for step `step`, sent at
       * `when`: the same answer to a step answered already is answered as it
       * was; a different one, one past the deadline, or one that does not
       * fit (`answerRefusal`) is refused.
       */
      const stepped = (current: AskRecord, step: AskName, values: StepValues, when: string) =>
        Effect.gen(function* () {
          const refuse = (reason: string) => AskRefused.make({ id: current.id, reason });
          const before = Arr.findFirst(current.answered, (a) => a.step === step);
          if (Option.isSome(before)) {
            if (sameValues(before.value.values, values)) return current;
            return yield* refuse(`step ${step} is answered already`);
          }
          const past = Option.filter(Option.fromUndefinedOr(current.deadline), (d) => d < when);
          if (Option.isSome(past)) return yield* refuse(`it was due by ${past.value}`);
          const why = answerRefusal(current.ask, current.state, step, values);
          if (Option.isSome(why)) return yield* refuse(why.value);
          const state = yield* moved(current.ask, current.state, AskEvent.Answer({ step, values }));
          return {
            ...current,
            state,
            answered: [...current.answered, { step, values, at: when }],
          } satisfies AskRecord;
        });

      const answerPage = Effect.fn('AskStore.answerPage')(function* (
        id: string,
        sections: ReadonlyArray<{ readonly step: AskName; readonly values: StepValues }>,
      ) {
        const at = yield* known(id);
        const when = yield* now;
        // A field left empty is kept as not sent, so a retry that sends it blank is the same answer.
        const record = yield* store.transact(at, (current) =>
          Effect.map(
            Effect.reduce(
              sections,
              () => current,
              (run: AskRecord, s) => stepped(run, s.step, filled(s.values), when),
            ),
            (next) => [next, next] as const,
          ),
        );
        yield* Effect.log(
          `asks.answer id=${id} steps=${sections.map((s) => s.step).join(',')} state=${record.state._tag}`,
        );
        return record;
      });

      const close = Effect.fn('AskStore.close')(function* (id: string, why: string) {
        const at = yield* known(id);
        const record = yield* store.transact(at, (current) =>
          Effect.gen(function* () {
            if (current.state._tag === 'Closed') {
              if (current.state.why === why) return [current, current] as const;
              return yield* AskRefused.make({
                id,
                reason: `it is closed already: ${current.state.why}`,
              });
            }
            const state = yield* moved(
              current.ask,
              current.state,
              AskEvent.Close({ why, at: yield* now }),
            );
            const next: AskRecord = { ...current, state };
            return [next, next] as const;
          }),
        );
        yield* filed(record);
        yield* Effect.log(`asks.close id=${id}`);
        return record;
      });

      const page = Effect.fn('AskStore.page')(function* (id: string) {
        const on = pageIdOf(yield* read(id));
        return { page: on, asks: asksOnPage(yield* list, on) } satisfies AsksPage;
      });

      return AskStore.of({ dir, file, make, read, page, list, answerPage, close });
    }),
  );
}

/**
 * What an ask files on its production's timeline as it stands at `now`: its
 * question, when it names a set (at the time it was made); and once closed,
 * the owner's decision (its answers, answered to its end, at the time of his
 * last answer: his words as its quote, and each choice's value as his picks,
 * which an override may cite) or its withdrawal (a note, closed before, at
 * the time it was closed; `now` for a record with no close time).
 */
const askWords = (record: AskRecord, now: number): ReadonlyArray<Said> => {
  const set = Option.map(Option.fromUndefinedOr(record.set), setPathOf);
  const on = {
    set,
    point: Option.fromUndefinedOr(record.point),
    variant: Option.none<string>(),
    ask: Option.some(record.id),
    picks: Option.none<Readonly<Record<string, string>>>(),
    by: Option.some(record.by),
  };
  const named = `${record.title} (ask ${record.id})`;
  // A time the record keeps (ISO), as the ledger keeps it; `now` when it does not read.
  const timeOf = (iso: Option.Option<string>) =>
    Option.getOrElse(
      Option.map(Option.flatMap(iso, DateTime.make), DateTime.toEpochMillis),
      () => now,
    );
  const question = Arr.filter(
    [
      {
        _tag: 'Asked' as const,
        at: timeOf(Option.some(record.created)),
        text: named,
        quote: Option.none<string>(),
        ...on,
      },
    ],
    () => Option.isSome(set),
  );
  const closing = Match.value(record.state).pipe(
    Match.tag('Closed', (closed): ReadonlyArray<Said> => {
      if (!answeredToEnd(record))
        return [
          {
            _tag: 'Noted',
            at: timeOf(Option.fromUndefinedOr(closed.at)),
            text: `${named} withdrawn: ${closed.why}`,
            quote: Option.none(),
            ...on,
          },
        ];
      // The owner's decision: what they gave, an optional field left empty left out.
      const given = givenAnswers(closed.answers);
      const words = Object.values(given).flatMap((a) =>
        Match.value(a).pipe(
          Match.discriminatorsExhaustive('kind')({
            choose: (): ReadonlyArray<string> => [],
            free_text: (t) => [t.text],
            skipped: (): ReadonlyArray<string> => [],
          }),
        ),
      );
      // His picks: each question he answered by a choice, the value of the option he chose.
      const picks = Record.getSomes(
        Record.map(given, (a) =>
          Match.value(a).pipe(
            Match.discriminatorsExhaustive('kind')({
              choose: (c) => Option.some(c.value),
              free_text: () => Option.none<string>(),
              skipped: () => Option.none<string>(),
            }),
          ),
        ),
      );
      // Every answer skipped still reads as answered: the line then names them all.
      const line = answersLine(
        Option.getOrElse(
          Option.liftPredicate(given, (g) => !Record.isEmptyRecord(g)),
          () => closed.answers,
        ),
      );
      return [
        {
          _tag: 'Decided',
          // When he answered (his last step), not when the ask was closed: a decision he
          // made in between stays the newer one.
          at: timeOf(Option.map(Arr.last(record.answered), (a) => a.at)),
          text: `${named}: ${line}`,
          quote: Option.liftPredicate(words.join(' / '), (w) => w.length > 0),
          ...on,
          picks: Option.liftPredicate(picks, (p) => !Record.isEmptyRecord(p)),
        },
      ];
    }),
    Match.orElse((): ReadonlyArray<Said> => []),
  );
  return [...question, ...closing];
};

/**
 * What a decision an ask filed with no picks of the owner's on it gets from
 * the ask's record (`fillPicks`): the picks its close files, or why none.
 */
export type PicksFound = Data.TaggedEnum<{
  /** The picks its close files (`askWords`): each choice's value, by its question's name. */
  Filled: { readonly ask: string; readonly picks: Readonly<Record<string, string>> };
  /** None, and why. */
  Left: { readonly ask: string; readonly why: string };
}>;
const PicksFound = Data.taggedEnum<PicksFound>();

/** An ask's record as read for its decision: the record, or why there is none to read. */
type Read = Result.Result<AskRecord, string>;

/** The asks of the decisions on `file` with no picks on them, each by its id, in the ledger's order. */
const unpicked = (file: ProductionFile): ReadonlyArray<string> =>
  file.said.flatMap((s) => Option.toArray(unpickedAsk(s)));

/** The ask a decision names when it carries no picks; none for any other word. */
const unpickedAsk = (said: Said): Option.Option<string> =>
  Option.filter(said.ask, () => said._tag === 'Decided' && Option.isNone(said.picks));

/**
 * What the record of `ask` (or why there is none to read) gives its decision
 * on `production`'s ledger: the picks its close files there (`askWords`;
 * the time it files them at plays no part), or why none: the ask files on
 * another production, it is not closed, it was closed before its end, or he
 * answered it by no choice.
 */
const foundFor = (production: string, ask: string, record: Read): PicksFound =>
  Result.match(record, {
    onFailure: (why) => PicksFound.Left({ ask, why }),
    onSuccess: (r) => {
      if (r.production !== production)
        return PicksFound.Left({ ask, why: `its ask files on ${r.production ?? 'no production'}` });
      const decided = Arr.findFirst(askWords(r, 0), (w) => w._tag === 'Decided');
      return Option.match(decided, {
        onNone: () =>
          PicksFound.Left({
            ask,
            why: Match.value(r.state).pipe(
              Match.tagsExhaustive({
                Asking: () => 'its ask is not closed: it still asks',
                Answered: () => 'its ask is not closed: it is answered',
                Closed: () => 'its ask was closed before its end',
              }),
            ),
          }),
        onSome: (d) =>
          Option.match(d.picks, {
            onNone: () => PicksFound.Left({ ask, why: 'he answered it by no choice' }),
            onSome: (picks) => PicksFound.Filled({ ask, picks }),
          }),
      });
    },
  });

/**
 * `file` with each decision on it that names its ask and carries no picks
 * given the picks that ask's record files (`foundFor`, the record by
 * `recordOf`), and what each such decision found. Nothing else changes: the
 * decision keeps every other field and its place.
 */
const picksFiled = (file: ProductionFile, recordOf: (ask: string) => Read) => {
  const found = unpicked(file).map((ask) => foundFor(file.production, ask, recordOf(ask)));
  const filled = new Map(
    Arr.filter(found, PicksFound.$is('Filled')).map((f) => [f.ask, f.picks] as const),
  );
  const said = file.said.map((s) =>
    Option.match(
      Option.flatMap(unpickedAsk(s), (ask) => Option.fromUndefinedOr(filled.get(ask))),
      { onNone: () => s, onSome: (picks) => ({ ...s, picks: Option.some(picks) }) },
    ),
  );
  return { file: { ...file, said }, found };
};

/** A ledger's fill that files no pick: nothing is written, and each decision's find is answered. */
class NothingFiled extends Data.TaggedError('NothingFiled')<{
  readonly found: ReadonlyArray<PicksFound>;
}> {}

/**
 * The owner's picks filed onto each decision on a production's ledger (the
 * ledgers `ProductionStore` lists) that names its ask and carries none: the
 * picks the ask's record in the lab's asks (`FILMS_LAB/asks/<id>.json`)
 * files at its close (`askWords`), each a choice's value by its question's
 * name, so an override may cite them (`style/override.ts`). A decision is
 * left as it is when its ask's record is not there or does not read (it
 * does not decode, or the platform cannot read it), files on another
 * production, is not closed or was closed before its end, or was answered by
 * no choice: no pick is made up. Nothing else on a ledger changes, and a
 * ledger with nothing to fill is not written, so a second run writes nothing.
 * Each ledger is filled as read under the lock its write takes, so what each
 * such decision found, filled or left and why, in the ledger's order, is
 * what the write did.
 */
export const fillPicks = Effect.gen(function* () {
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const store = yield* ContentStore;
  const productions = yield* ProductionStore;
  const dir = yield* asksDir;
  /** The record of `ask`, or why there is none to read. */
  const recordOf = (ask: string): Effect.Effect<Read> =>
    Effect.gen(function* () {
      const file = path.join(dir, `${ask}.json`);
      if (!ASK_ID.test(ask) || !(yield* fs.exists(file)))
        return Result.fail(`no record of it at ${file}`);
      return Result.succeed(yield* store.read(recordAt(file)));
    }).pipe(
      Effect.catch((error) =>
        Effect.succeed(Result.fail(`its record does not read: ${error.message}`)),
      ),
    );
  const ledgers = yield* productions.list;
  const found = yield* Effect.forEach(ledgers, (ledger) =>
    Effect.gen(function* () {
      const asks = Arr.dedupe(unpicked(ledger));
      if (asks.length === 0) return [];
      const records = new Map(
        yield* Effect.forEach(asks, (ask) => Effect.map(recordOf(ask), (r) => [ask, r] as const)),
      );
      // A decision filed after the list read the ledger finds no record here: the next run fills it.
      const recordIn = (ask: string): Read =>
        records.get(ask) ?? Result.fail('filed after its ledger was read');
      const filed = yield* productions
        .attempt(
          ledger.production,
          (
            current,
          ): Result.Result<readonly [ReadonlyArray<PicksFound>, ProductionFile], NothingFiled> => {
            const next = picksFiled(current, recordIn);
            if (next.found.some(PicksFound.$is('Filled')))
              return Result.succeed([next.found, next.file] as const);
            return Result.fail(new NothingFiled({ found: next.found }));
          },
        )
        .pipe(Effect.catchTag('NothingFiled', (nothing) => Effect.succeed(nothing.found)));
      return filed.map((f) => ({ production: ledger.production, found: f }));
    }),
  );
  return found.flat();
});

/** Whether two steps' answers are the same: the same names, each the same value. */
const sameValues = (a: StepValues, b: StepValues): boolean => {
  const keys = Object.keys(a);
  return keys.length === Object.keys(b).length && keys.every((k) => a[k] === b[k]);
};
