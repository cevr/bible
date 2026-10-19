// The lab's change feed: what changed in the files the lab keeps (each
// film's notes and board, each project folder's catalogue, each set's
// `review.json`, each agent's ask, each production's ledger), read off the
// files themselves every few seconds, numbered in the order the lab saw it,
// and kept (the newest `KEPT`) for a reader to ask past a cursor or to wait
// on, by the catalogue's names (`LAB_EVENTS`) and a film. The files are the
// record, so a change the page makes, one a terminal's `film lab` makes, and
// one an agent makes through the lab's MCP are all seen alike, and nothing
// writes twice: the feed only reads. A change to a film's source is read off
// the lab's writer, which tells each one that landed in order (the newest
// 200: a read every few seconds finds them all). A set or a render it sees
// drops the review's index (`Review.written`) before its event is told, so
// the page and an ask read what another process wrote. What a change is, said from
// two reads of a file, is `core/lab-events.ts`.
//
// The first read is the baseline: the feed tells only what changed after
// the lab started. A cursor is `<epoch>.<seq>`; the epoch is this run's, so
// a cursor from an earlier run is answered from the start of this one, said
// as a `reset`.

import {
  Array as Arr,
  Boolean as Bool,
  Context,
  DateTime,
  type Duration,
  Effect,
  FileSystem,
  Layer,
  Option,
  Path,
  Random,
  Ref,
  Stream,
  SubscriptionRef,
  Schedule,
  Schema,
  Semaphore,
} from 'effect';
import { CatalogueJson, emptyCatalogue, type Catalogue } from '../core/catalogue.ts';
import { type BoardFile, BoardFileJson, emptyBoard } from '../core/board.ts';
import {
  LabChange,
  type LabLinks,
  type LabChangeDraft,
  changeOf,
  type SetSeen,
  askChanges,
  boardChanges,
  catalogueChanges,
  namesMatch,
  noteChanges,
  noteWithdrawals,
  productionChanges,
  setChanges,
  sourceChanges,
} from '../core/lab-events.ts';
import type { ProductionFile } from '../core/production.ts';
import { eventsSince } from '../core/notes.ts';
import { ReviewManifestJson } from '../core/review.ts';
import type { AskRecord } from '../core/ask.ts';
import type { Note } from '../core/schema.ts';
import { AskStore } from './ask-store.ts';
import { BoardStore } from './board-store.ts';
import { CATALOGUE_FILE } from './catalogue.ts';
import { ContentStore } from './content-store.ts';
import { sha256Hex } from './digest.ts';
import { FilmFolder, filmNamed } from './film-repo.ts';
import { NotesStore } from './notes-store.ts';
import { ProductionStore } from './production-store.ts';
import { Review, recordsUnder } from './review.ts';
import { SourceWriter } from './source-writer.ts';

/** What a reader is answered: the changes past its cursor, in order, and the cursor to ask past next. */
export const LabChanges = Schema.Struct({
  cursor: Schema.String,
  changes: Schema.Array(LabChange),
  /**
   * The cursor was not this run's (the lab restarted) or older than the
   * oldest change kept: the changes are every one kept, and some may be lost.
   */
  reset: Schema.Boolean,
});
export type LabChanges = typeof LabChanges.Type;

/** A board as its file holds it. */
const boardText = Schema.encodeSync(BoardFileJson);

/** How many changes the feed keeps. */
const KEPT = 1000;

/** A set's manifest file in its folder. */
const MANIFEST_FILE = 'review.json';

/** A file's stamp: its mtime and size, when the file system says its mtime; none reads it every time. */
type Stamp = Option.Option<string>;

/** What the feed last read of each file it watches. */
interface Seen {
  readonly notes: Map<
    string,
    { readonly stamp: Stamp; readonly seq: number; readonly notes: ReadonlyArray<Note> }
  >;
  readonly boards: Map<string, { readonly stamp: Stamp; readonly board: BoardFile }>;
  readonly catalogues: Map<string, { readonly stamp: Stamp; readonly catalogue: Catalogue }>;
  sets: ReadonlyMap<string, SetSeen>;
  readonly asks: Map<string, { readonly stamp: Stamp; readonly record: AskRecord }>;
  readonly productions: Map<string, ProductionFile>;
  /** The number of the writer's last landing read: 0 before the first. */
  landed: number;
}

interface Journal {
  /** The last change's number: 0 before the first. */
  readonly seq: number;
  readonly kept: ReadonlyArray<LabChange>;
}

interface LabEventsService {
  /** Read every watched file once and add what changed since the last read to the feed. */
  readonly look: Effect.Effect<void>;
  /** The changes past `cursor` that `of` keeps (none: no changes, the cursor now). */
  readonly since: (cursor: Option.Option<string>, of?: Of) => Effect.Effect<LabChanges>;
  /** `since`, as soon as there is a change past `cursor` that `of` keeps, or none once `timeout` passes. */
  readonly wait: (
    cursor: Option.Option<string>,
    timeout: Duration.Input,
    of?: Of,
  ) => Effect.Effect<LabChanges>;
}

/** Which changes a reader asks for: their names (globs over the catalogue's, `ask.*`; none is every one) and their film. */
interface Of {
  readonly names?: ReadonlyArray<string>;
  readonly film?: string;
}

/** Whether `change` is one `of` asks for. Pure. */
const kept =
  (of: Of = {}) =>
  (change: LabChange): boolean =>
    namesMatch(of.names ?? [], change.kind) &&
    Option.match(Option.fromUndefinedOr(of.film), {
      onNone: () => true,
      onSome: (film) => change.film === film,
    });

/** What the feed needs: where its links point (the lab's own links, local and the phone's). */
interface FeedOptions {
  readonly links: LabLinks;
}

/** `cursor` read: its epoch and number, when it is one. */
const cursorOf = (cursor: string): Option.Option<{ epoch: string; seq: number }> =>
  Option.map(Option.fromNullishOr(/^([0-9a-z]+)\.(\d+)$/.exec(cursor)), ([, epoch = '', seq]) => ({
    epoch,
    seq: Number(seq),
  }));

/**
 * The cursor right after `change`, in the run `cursor` (an answer's) is
 * from: where a reader that has heard it, and nothing past it, reads on. Pure.
 */
export const cursorAfter = (cursor: string, change: { readonly seq: number }): string =>
  Option.match(cursorOf(cursor), {
    onNone: () => cursor,
    onSome: ({ epoch }) => `${epoch}.${change.seq}`,
  });

export class LabEvents extends Context.Service<LabEvents, LabEventsService>()(
  '@bible/film/tools/LabEvents',
) {
  /** The feed over the lab's stores, its baseline not yet read: `look` reads it. */
  static readonly make = Effect.fn('LabEvents.make')(function* (options: FeedOptions) {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const notes = yield* NotesStore;
    const boards = yield* BoardStore;
    const folder = yield* FilmFolder;
    const review = yield* Review;
    const store = yield* ContentStore;
    const asks = yield* AskStore;
    const productions = yield* ProductionStore;
    const writer = yield* SourceWriter;
    const films = yield* Effect.context<FilmFolder>();
    const platform = yield* Effect.context<FileSystem.FileSystem | Path.Path>();
    const epoch = (yield* Random.nextIntBetween(0, 2 ** 31)).toString(36);
    // A wait wakes on each change of it (`wait`), never on a timer.
    const journal = yield* SubscriptionRef.make<Journal>({ seq: 0, kept: [] });
    const seen: Seen = {
      notes: new Map(),
      boards: new Map(),
      catalogues: new Map(),
      sets: new Map(),
      asks: new Map(),
      productions: new Map(),
      landed: 0,
    };
    /** Whether the next read is the first: the baseline, which tells nothing. */
    const first = yield* Ref.make(true);
    const one = yield* Semaphore.make(1);

    /** A file's stamp, or none when it is not there (`absent`). */
    const stampOf = (file: string) =>
      fs.stat(file).pipe(
        Effect.map((info) => ({
          there: info.type === 'File',
          stamp: Option.map(info.mtime, (m) => `${m.getTime()}:${info.size}`),
        })),
        Effect.orElseSucceed(() => ({ there: false, stamp: Option.none<string>() })),
      );

    /** Whether a read of a file stamped `now` would tell nothing new after one stamped `was`. */
    const same = (was: Stamp, now: Stamp) =>
      Option.isSome(was) && Option.isSome(now) && was.value === now.value;

    /** Warn of a file that could not be read; the feed keeps what it last read of it. */
    const unread = (file: string) => (error: { readonly message: string }) =>
      Effect.as(
        Effect.logWarning(`lab.events.unread file=${file} reason="${error.message}"`),
        Arr.empty<LabChangeDraft>(),
      );

    const lookNotes = (name: string, baseline: boolean) =>
      Effect.gen(function* () {
        const film = yield* filmNamed(name).pipe(Effect.provideContext(films));
        const file = notes.paths(film).notes.file;
        const { stamp } = yield* stampOf(file);
        const was = Option.fromUndefinedOr(seen.notes.get(name));
        if (Option.exists(was, (w) => same(w.stamp, stamp))) return [];
        const log = yield* notes.read(film);
        // A film first seen after the baseline (made since) tells its whole log.
        const since = Option.match(was, {
          onNone: () => Bool.match(baseline, { onTrue: () => log.seq, onFalse: () => 0 }),
          onSome: (w) => w.seq,
        });
        seen.notes.set(name, { stamp, seq: log.seq, notes: log.notes });
        // A log reset below what was seen (restored, trashed) is a new baseline, not news.
        if (log.seq < since) return [];
        // A note gone while the log went on was withdrawn: no change in the log names it.
        const withdrawn = Option.match(was, {
          onNone: () => [],
          onSome: (w) => noteWithdrawals(w, log),
        });
        return [...noteChanges(eventsSince(log, since).events), ...withdrawn];
      }).pipe(Effect.catch(unread(`notes of ${name}`)));

    const lookBoard = (name: string, baseline: boolean) =>
      Effect.gen(function* () {
        const film = yield* filmNamed(name).pipe(Effect.provideContext(films));
        const file = boards.paths(film).record.file;
        const { stamp } = yield* stampOf(file);
        const was = Option.fromUndefinedOr(seen.boards.get(name));
        if (Option.exists(was, (w) => same(w.stamp, stamp))) return [];
        const board = yield* boards.read(film);
        seen.boards.set(name, { stamp, board });
        // The read's name, the same in every lab that reads this file: its stamp, else its bytes' digest.
        const read = Option.getOrElse(stamp, () => sha256Hex(boardText(board)));
        return Option.match(was, {
          onNone: () =>
            Bool.match(baseline, {
              onTrue: () => [],
              onFalse: () => boardChanges(emptyBoard(board.film), board, read),
            }),
          onSome: (w) => boardChanges(w.board, board, read),
        });
      }).pipe(Effect.catch(unread(`board of ${name}`)));

    const lookCatalogue = (ref: string, dir: string, baseline: boolean) =>
      Effect.gen(function* () {
        const file = path.join(dir, CATALOGUE_FILE);
        const { there, stamp } = yield* stampOf(file);
        const was = Option.fromUndefinedOr(seen.catalogues.get(ref));
        if (!there) return [];
        if (Option.exists(was, (w) => same(w.stamp, stamp))) return [];
        const catalogue = yield* store.read({
          file,
          codec: CatalogueJson,
          empty: emptyCatalogue(path.basename(dir)),
        });
        seen.catalogues.set(ref, { stamp, catalogue });
        return Option.match(was, {
          onNone: () =>
            Bool.match(baseline, {
              onTrue: () => [],
              onFalse: () => catalogueChanges(ref, emptyCatalogue(catalogue.film), catalogue),
            }),
          onSome: (w) => catalogueChanges(ref, w.catalogue, catalogue),
        });
      }).pipe(Effect.catch(unread(path.join(dir, CATALOGUE_FILE))));

    /** Every ask's record, each read again only when its file changed. */
    const lookAsks = (baseline: boolean) =>
      Effect.gen(function* () {
        const names = yield* fs.readDirectory(asks.dir).pipe(Effect.orElseSucceed(() => []));
        const ids = names.flatMap((n) =>
          Option.toArray(Option.fromNullishOr(/^(a[0-9a-f]{10})\.json$/.exec(n)?.[1])),
        );
        const told = yield* Effect.forEach(
          ids,
          (id) =>
            Effect.gen(function* () {
              const { stamp } = yield* stampOf(asks.file(id));
              const was = Option.fromUndefinedOr(seen.asks.get(id));
              if (Option.exists(was, (w) => same(w.stamp, stamp))) return [];
              const record = yield* asks.read(id);
              seen.asks.set(id, { stamp, record });
              if (baseline) return [];
              return askChanges(
                Option.map(was, (w) => w.record),
                record,
              );
            }).pipe(Effect.catch(unread(asks.file(id)))),
          { concurrency: 8 },
        );
        return Arr.flatten(told);
      });

    /** Every production's ledger, read whole each look (a ledger is small): each word filed and version opened since. */
    const lookProductions = (baseline: boolean) =>
      Effect.gen(function* () {
        const ledgers = yield* productions.list;
        return ledgers.flatMap((ledger) => {
          const was = Option.fromUndefinedOr(seen.productions.get(ledger.production));
          seen.productions.set(ledger.production, ledger);
          if (baseline) return [];
          return productionChanges(was, ledger);
        });
      }).pipe(Effect.catch(unread('productions')));

    /** Each change to a film's source that landed since the last read. */
    const lookSource = (baseline: boolean) =>
      Effect.map(writer.landings, (landings) => {
        const fresh = landings.filter((l) => l.n > seen.landed);
        seen.landed = Option.match(Arr.last(landings), {
          onNone: () => seen.landed,
          onSome: (l) => l.n,
        });
        if (baseline) return [];
        return sourceChanges(fresh);
      });

    /** The set a folder's manifest makes, when it has one: its title and its bytes' digest. */
    const setAt = (dir: string) =>
      Effect.gen(function* () {
        const file = path.join(dir, MANIFEST_FILE);
        const { there } = yield* stampOf(file);
        if (!there) return Option.none<SetSeen>();
        const text = yield* fs.readFileString(file);
        const title = Option.flatMap(Schema.decodeOption(ReviewManifestJson)(text), (m) => m.title);
        return Option.some<SetSeen>({ title, stamp: sha256Hex(text) });
      }).pipe(Effect.orElseSucceed(() => Option.none<SetSeen>()));

    const read = Effect.gen(function* () {
      const baseline = yield* Ref.getAndSet(first, false);
      const names = yield* folder.names;
      const filmChanges = yield* Effect.forEach(
        names,
        (name) =>
          Effect.map(
            Effect.all([lookNotes(name, baseline), lookBoard(name, baseline)]),
            Arr.flatten,
          ),
        { concurrency: 4 },
      );
      // The folders the review walks, every level: a project's catalogue, a montage's manifest.
      const listed = yield* recordsUnder(review.roots).pipe(Effect.provideContext(platform));
      const catalogued = yield* Effect.forEach(
        listed.filter((f) => f.kind === 'project'),
        (f) => lookCatalogue(f.ref, f.dir, baseline),
        {
          concurrency: 8,
        },
      );
      const sets = new Map<string, SetSeen>();
      yield* Effect.forEach(
        listed.filter((f) => f.kind === 'montage'),
        (f) =>
          Effect.map(setAt(f.dir), (set) => {
            if (Option.isSome(set)) sets.set(f.ref, set.value);
          }),
        { concurrency: 8, discard: true },
      );
      const published = Bool.match(baseline, {
        onTrue: () => [],
        onFalse: () => setChanges(seen.sets, sets),
      });
      seen.sets = sets;
      const asked = yield* lookAsks(baseline);
      const filed = yield* lookProductions(baseline);
      const edited = yield* lookSource(baseline);
      return [
        ...Arr.flatten(filmChanges),
        ...Arr.flatten(catalogued),
        ...published,
        ...asked,
        ...filed,
        ...edited,
      ];
    });

    const look = one.withPermits(1)(
      Effect.gen(function* () {
        const drafts = yield* read;
        if (drafts.length === 0) return;
        // A set or a render another process wrote: the review's index drops
        // what it read before, so a reader that hears the event and reads
        // the review (an ask about the set, the page) finds it.
        if (drafts.some((d) => d.kind.startsWith('set.') || d.kind.startsWith('render.')))
          yield* review.written;
        const at = DateTime.formatIso(yield* DateTime.now);
        yield* SubscriptionRef.update(journal, (j) => {
          const made = drafts.map((draft, i) => changeOf(draft, j.seq + i + 1, at, options.links));
          return { seq: j.seq + made.length, kept: [...j.kept, ...made].slice(-KEPT) };
        });
        yield* Effect.log(`lab.events.seen count=${drafts.length}`);
      }),
    );

    /** What a reader past `cursor` is answered from journal `j`. Pure. */
    const answerOf =
      (cursor: Option.Option<string>, of?: Of) =>
      (j: Journal): LabChanges => {
        const now = `${epoch}.${j.seq}`;
        if (Option.isNone(cursor)) return { cursor: now, changes: [], reset: false };
        const asked = Option.filter(
          cursorOf(cursor.value),
          (c) => c.epoch === epoch && c.seq <= j.seq,
        );
        const oldest = Option.match(Arr.head(j.kept), {
          onNone: () => j.seq + 1,
          onSome: (c) => c.seq,
        });
        return Option.match(asked, {
          onNone: () => ({ cursor: now, changes: j.kept.filter(kept(of)), reset: true }),
          onSome: (c) => ({
            cursor: now,
            changes: j.kept.filter((change) => change.seq > c.seq && kept(of)(change)),
            reset: c.seq + 1 < oldest,
          }),
        });
      };

    const since = (cursor: Option.Option<string>, of?: Of) =>
      Effect.map(SubscriptionRef.get(journal), answerOf(cursor, of));

    // The journal as it stands, then each change to it: the first answer with news ends the wait.
    const wait = (cursor: Option.Option<string>, timeout: Duration.Input, of?: Of) =>
      SubscriptionRef.changes(journal).pipe(
        Stream.map(answerOf(cursor, of)),
        Stream.filter(
          (answer) => answer.changes.length > 0 || answer.reset || Option.isNone(cursor),
        ),
        Stream.runHead,
        Effect.timeoutOption(timeout),
        Effect.flatMap((heard) =>
          Option.match(Option.flatten(heard), {
            onNone: () => since(cursor, of),
            onSome: Effect.succeed,
          }),
        ),
      );

    return LabEvents.of({ look, since, wait });
  });

  /**
   * The feed, its baseline read when it is made, then a read every `every`
   * for as long as the scope is open.
   */
  static readonly layer = (options: FeedOptions & { readonly every: Duration.Input }) =>
    Layer.effect(
      LabEvents,
      Effect.gen(function* () {
        const events = yield* LabEvents.make(options);
        yield* events.look;
        yield* Effect.forkScoped(Effect.repeat(events.look, Schedule.spaced(options.every)));
        return events;
      }),
    );
}
