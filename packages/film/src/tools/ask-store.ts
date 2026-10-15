// The asks on disk: one record each, `FILMS_LAB/asks/<id>.json` (a
// `ContentStore` manifest: written whole, one writer at a time across
// processes). An agent makes one (`make`: its machine checked and its board
// tries found first, so nothing that may not render is kept), the owner
// answers it a step at a time from any device (`answer`: the run moved by
// its machine, `askMachine`, and the step kept), and the agent closes it.
// An answer is kept by its step, so the same answer sent again (a retry, a
// second tab) is answered as it was, and a different one to a step already
// answered is refused, as is one to a step the ask has left, as gent's
// machine answers are. The page, the MCP and the change feed all read and
// write through here.

import {
  Array as Arr,
  Config,
  Context,
  DateTime,
  Effect,
  FileSystem,
  Layer,
  Option,
  Order,
  Path,
  Random,
} from 'effect';
import { Machine } from 'effect-machine';
import {
  type Ask,
  type AskImage,
  type BoardTryRef,
  type AskRecord,
  AskEvent,
  AskRecordJson,
  type AskState,
  type StepValues,
  answerRefusal,
  askMachine,
  askProblems,
  askStart,
  filled,
  imagesIn,
  mapImages,
} from '../core/ask.ts';
import { boardFileUrl } from '../core/api.ts';
import { panelById, tryOf } from '../core/board.ts';
import { AskInvalid, AskRefused, AskUnknown } from '../core/refusals.ts';
import { BoardStore } from './board-store.ts';
import { ContentStore, type Manifest, type StoreError } from './content-store.ts';
import { type FilmFolder, filmNamed } from './film-repo.ts';

/** What an agent asks with: its title, why, who it is, by when, the film, and the machine. */
interface AskDraft {
  readonly title: string;
  readonly why: string;
  readonly by: string;
  readonly film?: string;
  readonly production?: string;
  readonly set?: string;
  readonly deadline?: string;
  readonly ask: Ask;
}

interface AskStoreService {
  /** The folder the asks are kept in. */
  readonly dir: string;
  /** The record file of ask `id`. */
  readonly file: (id: string) => string;
  /** A new ask, its machine checked and its board tries found, or why it may not render. */
  readonly make: (draft: AskDraft) => Effect.Effect<AskRecord, AskInvalid | StoreError>;
  readonly read: (id: string) => Effect.Effect<AskRecord, AskUnknown | StoreError>;
  /** Every ask, the newest first. */
  readonly list: Effect.Effect<ReadonlyArray<AskRecord>, StoreError>;
  /** The owner's answers to step `step`: the ask as it leaves it. */
  readonly answer: (
    id: string,
    step: string,
    values: StepValues,
  ) => Effect.Effect<AskRecord, AskUnknown | AskRefused | StoreError>;
  /** The ask closed, `why` (withdrawn, or filed once answered): what was answered is kept. */
  readonly close: (
    id: string,
    why: string,
  ) => Effect.Effect<AskRecord, AskUnknown | AskRefused | StoreError>;
}

/** No record: what a manifest read gives for an ask that is not on disk. */
const MISSING: AskRecord = {
  id: '',
  title: '-',
  why: '-',
  by: '-',
  created: '',
  ask: { start: 'done', steps: { done: { end: true } } },
  state: askStart({ start: 'done', steps: { done: { end: true } } }),
  answered: [],
};

/** An ask's id: `a` and ten hex digits. */
const newId = Effect.map(
  Effect.all([Random.nextIntBetween(0, 0x100000), Random.nextIntBetween(0, 0x100000)]),
  (halves) => `a${halves.map((h) => h.toString(16).padStart(5, '0')).join('')}`,
);

const ASK_ID = /^a[0-9a-f]{10}$/;

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
      const films = yield* Effect.context<FilmFolder>();
      const root = yield* Config.String('FILMS_LAB').pipe(Config.withDefault(path.resolve('lab')));
      const dir = path.join(root, 'asks');

      const file = (id: string) => path.join(dir, `${id}.json`);
      const manifest = (id: string, empty = MISSING): Manifest<AskRecord> => ({
        file: file(id),
        codec: AskRecordJson,
        empty,
      });
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

      const make = Effect.fn('AskStore.make')(function* (draft: AskDraft) {
        // A deadline kept as UTC ISO, so it compares with the time an answer comes in.
        const deadline = Option.map(Option.fromUndefinedOr(draft.deadline), (d) =>
          Option.map(DateTime.make(d), DateTime.formatIso),
        );
        const problems = [
          ...askProblems(draft.ask),
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
        const { ask, missing } = yield* located(draft.ask);
        if (missing.length > 0) return yield* AskInvalid.make({ problems: missing });
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
        yield* Effect.log(
          `asks.make id=${id} by=${draft.by} steps=${Object.keys(ask.steps).length}`,
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

      const answer = Effect.fn('AskStore.answer')(function* (
        id: string,
        step: string,
        sent: StepValues,
      ) {
        const at = yield* known(id);
        const when = yield* now;
        // A field left empty is kept as not sent, so a retry that sends it blank is the same answer.
        const values = filled(sent);
        const record = yield* store.transact(at, (current) =>
          Effect.gen(function* () {
            const refuse = (reason: string) => AskRefused.make({ id, reason });
            const before = Arr.findFirst(current.answered, (a) => a.step === step);
            if (Option.isSome(before)) {
              if (sameValues(before.value.values, values)) return [current, current] as const;
              return yield* refuse(`step ${step} is answered already`);
            }
            const past = Option.filter(Option.fromUndefinedOr(current.deadline), (d) => d < when);
            if (Option.isSome(past)) return yield* refuse(`it was due by ${past.value}`);
            const why = answerRefusal(current.ask, current.state, step, values);
            if (Option.isSome(why)) return yield* refuse(why.value);
            const state = yield* moved(
              current.ask,
              current.state,
              AskEvent.Answer({ step, values }),
            );
            const next: AskRecord = {
              ...current,
              state,
              answered: [...current.answered, { step, values, at: when }],
            };
            return [next, next] as const;
          }),
        );
        yield* Effect.log(`asks.answer id=${id} step=${step} state=${record.state._tag}`);
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
            const state = yield* moved(current.ask, current.state, AskEvent.Close({ why }));
            const next: AskRecord = { ...current, state };
            return [next, next] as const;
          }),
        );
        yield* Effect.log(`asks.close id=${id}`);
        return record;
      });

      return AskStore.of({ dir, file, make, read, list, answer, close });
    }),
  );
}

/** Whether two steps' answers are the same: the same names, each the same value. */
const sameValues = (a: StepValues, b: StepValues): boolean => {
  const keys = Object.keys(a);
  return keys.length === Object.keys(b).length && keys.every((k) => a[k] === b[k]);
};
