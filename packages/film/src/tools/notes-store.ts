// The lab's notes, on disk: `lab/<film>/notes.json` and the stills in
// `lab/<film>/stills/`. The file is the source of truth; the lab server and
// `film notes` both read and write it through this store, so either works
// without the other. Every write is atomic (a partial file renamed into
// place, via ContentStore), serialized in the process (a Semaphore) and across
// processes (a lock file created exclusively and removed around each change),
// so a note saved in the lab and a reply sent from the CLI at the same moment
// both land. The lock names its holder (pid, when taken, a token): a lock
// whose holder is gone, or that is older than any change takes (30 s), was
// left by a crash, and the next writer breaks it and says so.

import {
  Array as Arr,
  Clock,
  Config,
  Context,
  DateTime,
  Duration,
  Effect,
  FileSystem,
  Layer,
  Option,
  Path,
  Predicate,
  Random,
  Result,
  Schedule,
  Schema,
  Semaphore,
} from 'effect';
import type { PlatformError } from 'effect/PlatformError';
import {
  addNote,
  emptyNotes,
  eventsSince,
  noteById,
  replyStill,
  replyToNote,
  resolveNote,
} from '../core/notes.ts';
import {
  type Note,
  type NoteAuthor,
  type NoteDraft,
  type NotesFile,
  NotesFileJson,
  type NotesWait,
} from '../core/schema.ts';
import { ContentStore, type Manifest, type StoreError } from './content-store.ts';
import { NoteNotFound, NotesLocked } from './errors.ts';

/** Where one film's notes live. */
export interface NotesPaths {
  readonly dir: string;
  readonly stills: string;
  readonly lock: string;
  readonly notes: Manifest<NotesFile>;
}

/** A reply as a writer hands it in: its still, when it has one, as PNG bytes. */
export interface ReplyInput {
  readonly by: NoteAuthor;
  readonly text: string;
  readonly still: Option.Option<Uint8Array>;
}

export type NotesError = StoreError | NotesLocked;

export interface NotesStoreService {
  readonly paths: (film: string) => NotesPaths;
  /** Every note of the film; an empty log before the first. */
  readonly read: (film: string) => Effect.Effect<NotesFile, StoreError>;
  /** Save a new note and the still of its frame. */
  readonly add: (
    film: string,
    draft: NoteDraft,
    still: Uint8Array,
  ) => Effect.Effect<Note, NotesError>;
  readonly reply: (
    film: string,
    id: string,
    reply: ReplyInput,
  ) => Effect.Effect<Note, NotesError | NoteNotFound>;
  readonly resolve: (film: string, id: string) => Effect.Effect<Note, NotesError | NoteNotFound>;
  /**
   * The changes after `since`, as soon as there is one, or none once `timeout`
   * passes. Reads the file, so it sees every writer's changes.
   */
  readonly wait: (
    film: string,
    since: number,
    timeout: Duration.Input,
  ) => Effect.Effect<NotesWait, StoreError>;
  /** A still's file, when `name` is one of this film's stills. */
  readonly still: (film: string, name: string) => Effect.Effect<Option.Option<string>, StoreError>;
}

/** How often a wait reads the file for changes. */
const POLL = Duration.millis(200);
/** How long a writer waits for another process's lock before giving up. */
const LOCK_TRIES = 250;
const LOCK_SPACING = Duration.millis(20);

/** A still is a PNG named by the store (`n3.png`, `n3.r5.png`): never a path. */
const STILL_NAME = /^n\d+(\.r\d+)?\.png$/;

const isAlreadyExists = (error: PlatformError) => error.reason._tag === 'AlreadyExists';

/** Who holds a film's notes lock: its process, when it took it (epoch ms), and a token of its own. */
export const LockOwner = Schema.Struct({
  pid: Schema.Int,
  created: Schema.Finite,
  token: Schema.String,
});
export type LockOwner = typeof LockOwner.Type;
export const LockOwnerJson = Schema.fromJsonString(LockOwner);
const decodeOwner = Schema.decodeUnknownOption(LockOwnerJson);
const encodeOwner = Schema.encodeSync(LockOwnerJson);

/**
 * A lock older than this was left by a crash: a change holds it for
 * milliseconds (a read, a still and the notes file written), so no live
 * writer comes near it.
 */
export const LOCK_STALE = Duration.seconds(30);

/** Whether process `pid` is running: signal 0 checks without sending anything. */
const isAlive = (pid: number) =>
  Result.match(
    Result.try(() => process.kill(pid, 0)),
    {
      onSuccess: () => true,
      // EPERM: it runs, as another user. ESRCH: no such process.
      onFailure: (error) => Predicate.hasProperty(error, 'code') && error.code === 'EPERM',
    },
  );

/**
 * Why a lock held by `owner` (none: it cannot be read, and `now` is measured
 * from the file's mtime by the caller) is stale at `now`, or none while it
 * holds. Pure: `alive` says whether a pid runs.
 */
export const lockVerdict = (
  owner: Option.Option<LockOwner>,
  now: number,
  alive: (pid: number) => boolean,
  since: number = Option.match(owner, { onNone: () => now, onSome: (o) => o.created }),
): Option.Option<string> => {
  if (Option.isSome(owner) && !alive(owner.value.pid))
    return Option.some(`its holder, pid ${owner.value.pid}, is gone`);
  const age = now - since;
  if (age > Duration.toMillis(LOCK_STALE))
    return Option.some(`it was taken ${Math.round(age / 1000)} s ago`);
  return Option.none();
};

export class NotesStore extends Context.Service<NotesStore, NotesStoreService>()(
  '@bible/film/tools/NotesStore',
) {
  /** Notes under `FILMS_LAB` (default `<cwd>/lab`), one folder per film. */
  static readonly layer = Layer.effect(
    NotesStore,
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const path = yield* Path.Path;
      const store = yield* ContentStore;
      const root = yield* Config.String('FILMS_LAB').pipe(Config.withDefault(path.resolve('lab')));
      const writer = yield* Semaphore.make(1);

      const paths = (film: string): NotesPaths => {
        const dir = path.join(root, film);
        return {
          dir,
          stills: path.join(dir, 'stills'),
          lock: path.join(dir, 'notes.lock'),
          notes: {
            file: path.join(dir, 'notes.json'),
            codec: NotesFileJson,
            empty: emptyNotes(film),
          },
        };
      };

      /**
       * Break the film's lock if it is stale. Moved aside first (a rename is
       * atomic, so of two writers breaking it at once only one moves it), then
       * checked to be the very lock judged stale; a live lock moved by mistake
       * (taken between the judging and the move) is put back.
       */
      const breakStale = Effect.fn('NotesStore.breakStale')(function* (at: NotesPaths) {
        const held = yield* fs.readFileString(at.lock).pipe(Effect.option);
        const owner = Option.flatMap(held, decodeOwner);
        const now = yield* Clock.currentTimeMillis;
        // An owner that cannot be read (being written, or an old lock directory) ages from its mtime.
        const mtime = fs.stat(at.lock).pipe(
          Effect.map((info) =>
            Option.getOrElse(
              Option.map(info.mtime, (d) => d.getTime()),
              () => now,
            ),
          ),
          Effect.orElseSucceed(() => now),
        );
        const since = yield* Option.match(owner, {
          onSome: (o) => Effect.succeed(o.created),
          onNone: () => mtime,
        });
        const verdict = lockVerdict(owner, now, isAlive, since);
        if (Option.isNone(verdict)) return;
        const grave = `${at.lock}.stale-${process.pid}-${yield* Random.nextIntBetween(0, 1e9)}`;
        const moved = yield* fs.rename(at.lock, grave).pipe(Effect.option);
        if (Option.isNone(moved)) return;
        const buried = yield* fs.readFileString(grave).pipe(Effect.option);
        const text = (o: Option.Option<string>) => Option.getOrElse(o, () => '');
        if (text(buried) !== text(held)) {
          yield* fs.rename(grave, at.lock).pipe(Effect.ignore);
          return;
        }
        yield* fs.remove(grave, { recursive: true }).pipe(Effect.ignore);
        yield* Effect.logWarning(`notes.lock.broken lock=${at.lock} reason="${verdict.value}"`);
      });

      /** Take the film's lock (a file created only if there is none) for one change. */
      const take = (at: NotesPaths, owner: LockOwner) =>
        fs.writeFileString(at.lock, encodeOwner(owner), { flag: 'wx' }).pipe(
          Effect.tapError((error) =>
            Effect.when(breakStale(at), Effect.succeed(isAlreadyExists(error))),
          ),
          Effect.retry({
            while: isAlreadyExists,
            times: LOCK_TRIES,
            schedule: Schedule.spaced(LOCK_SPACING),
          }),
          Effect.catchIf(isAlreadyExists, () => Effect.fail(NotesLocked.make({ lock: at.lock }))),
        );

      /** Give the lock back, if it is still this writer's (a lock broken as stale is someone else's now). */
      const give = (at: NotesPaths, owner: LockOwner) =>
        Effect.gen(function* () {
          const held = Option.flatMap(
            yield* fs.readFileString(at.lock).pipe(Effect.option),
            decodeOwner,
          );
          if (Option.exists(held, (o) => o.token === owner.token)) return yield* fs.remove(at.lock);
          yield* Effect.logWarning(
            `notes.unlock.lost lock=${at.lock} reason="another writer holds it now"`,
          );
        }).pipe(
          Effect.catchTag('PlatformError', (error) =>
            Effect.logWarning(`notes.unlock lock=${at.lock} reason=${error.message}`),
          ),
        );

      /** Hold the film's lock for one change. */
      const locked = <A, E>(at: NotesPaths, change: Effect.Effect<A, E>) =>
        Effect.gen(function* () {
          const owner: LockOwner = {
            pid: process.pid,
            created: yield* Clock.currentTimeMillis,
            token: `${process.pid}-${yield* Random.nextIntBetween(0, 1e9)}`,
          };
          return yield* Effect.acquireUseRelease(
            fs.makeDirectory(at.dir, { recursive: true }).pipe(Effect.andThen(take(at, owner))),
            () => change,
            () => give(at, owner),
          );
        }).pipe(writer.withPermits(1));

      const read = (film: string) => store.read(paths(film).notes);

      const now = Effect.map(DateTime.now, DateTime.formatIso);

      /** The note `id` in `file`, or `NoteNotFound` listing the ones there are. */
      const find = (film: string, file: NotesFile, id: string) =>
        Option.match(noteById(file, id), {
          onNone: () =>
            Effect.fail(NoteNotFound.make({ film, id, known: file.notes.map((n) => n.id) })),
          onSome: Effect.succeed,
        });

      /** The note `id` as a change left it. */
      const after = (film: string, file: NotesFile, id: string) =>
        find(film, file, id).pipe(Effect.orDie);

      const add = Effect.fn('NotesStore.add')(function* (
        film: string,
        draft: NoteDraft,
        still: Uint8Array,
      ) {
        const at = paths(film);
        const note = yield* locked(
          at,
          Effect.gen(function* () {
            const current = yield* store.read(at.notes);
            const time = yield* now;
            const next = addNote(current, draft, time);
            const made = yield* Effect.fromOption(Arr.last(next.notes)).pipe(Effect.orDie);
            // The still first: a note never names a frame that is not on disk.
            yield* store.writeFile(path.join(at.stills, made.still), still);
            yield* store.update(at.notes, (file) => addNote(file, draft, time));
            return made;
          }),
        );
        yield* Effect.log(`notes.add film=${film} id=${note.id} scene=${note.scene} T=${note.T}`);
        return note;
      });

      const reply = Effect.fn('NotesStore.reply')(function* (
        film: string,
        id: string,
        input: ReplyInput,
      ) {
        const at = paths(film);
        const note = yield* locked(
          at,
          Effect.gen(function* () {
            const current = yield* store.read(at.notes);
            yield* find(film, current, id);
            // The reply's number is the next change: its still is named for it.
            const name = replyStill(id, current.seq + 1);
            yield* Effect.forEach(Option.toArray(input.still), (bytes) =>
              store.writeFile(path.join(at.stills, name), bytes),
            );
            const time = yield* now;
            const next = yield* store.update(at.notes, (file) =>
              replyToNote(
                file,
                id,
                { by: input.by, text: input.text, still: Option.as(input.still, name) },
                time,
              ),
            );
            return yield* after(film, next, id);
          }),
        );
        yield* Effect.log(`notes.reply film=${film} id=${id} by=${input.by} status=${note.status}`);
        return note;
      });

      const resolve = Effect.fn('NotesStore.resolve')(function* (film: string, id: string) {
        const at = paths(film);
        const note = yield* locked(
          at,
          Effect.gen(function* () {
            yield* find(film, yield* store.read(at.notes), id);
            const next = yield* store.update(at.notes, (file) => resolveNote(file, id));
            return yield* after(film, next, id);
          }),
        );
        yield* Effect.log(`notes.resolve film=${film} id=${id}`);
        return note;
      });

      const wait = Effect.fn('NotesStore.wait')(function* (
        film: string,
        since: number,
        timeout: Duration.Input,
      ) {
        const found = yield* read(film).pipe(
          Effect.map((file) => eventsSince(file, since)),
          Effect.repeat({ until: (w) => w.events.length > 0, schedule: Schedule.spaced(POLL) }),
          Effect.timeoutOption(timeout),
        );
        return Option.getOrElse(found, (): NotesWait => ({ cursor: since, events: [] }));
      });

      const still = Effect.fn('NotesStore.still')(function* (film: string, name: string) {
        if (!STILL_NAME.test(name)) return Option.none<string>();
        const file = path.join(paths(film).stills, name);
        if (!(yield* fs.exists(file))) return Option.none<string>();
        return Option.some(file);
      });

      return NotesStore.of({ paths, read, add, reply, resolve, wait, still });
    }),
  );
}
