// The runner's side of the kept answers (`store.ts` holds their shape and
// key): read whole, and written whole through a temporary file beside it,
// removed if the write fails, under the store's lock, so two runs that keep
// answers at once keep both and a reader sees the old store or the new one,
// never a part. The lock is SQLite's write lock (`BEGIN IMMEDIATE`) on an
// empty database file of its own beside the store (`.<name>.lock`), held
// from the read to the rename: SQLite takes it with the operating system's
// advisory file locks, which the kernel drops when the holding process ends,
// so a run that dies leaves no lock to take, and no run ever takes one from
// another. The file is never removed: removing a lock file another run holds
// would let a third take a new one beside it. A missing store is an empty
// one; a store that does not decode is an empty one, said on one line.
// Every checkout shares the store (`store.ts`), so a write drops the answers
// by their age alone, under the lock: an answer another checkout's tree reads
// is kept however this tree has changed.

import { Database } from 'bun:sqlite';
import { Console, Effect, FileSystem, Option, Path, Result, Schedule, Schema } from 'effect';

import { type Answer, MAX_AGE_DAYS, Store, type Verdict } from './store.js';

/** How often, and how many times, a run tries for the lock another run holds: 2 s in all. */
const LOCK_TRIES = { every: '25 millis', times: 80 } as const;

/** Another run holds the store's lock. */
class StoreLocked extends Schema.TaggedError<StoreLocked>()('StoreLocked', {
  lock: Schema.String,
}) {}

/** The store's lock file could not be opened or locked: its path and SQLite's words. */
class StoreLockFailed extends Schema.TaggedError<StoreLockFailed>()('StoreLockFailed', {
  lock: Schema.String,
  cause: Schema.String,
}) {}

/** Whether SQLite refused because another connection holds the lock. */
const isBusy = Schema.is(Schema.Struct({ code: Schema.Literal('SQLITE_BUSY') }));

/** Tries once for SQLite's write lock on `lock`: the open connection that holds it. */
const tryLock = (lock: string) =>
  Effect.gen(function* () {
    const db = yield* Effect.try({
      try: () => new Database(lock, { create: true }),
      catch: (cause) => StoreLockFailed.make({ lock, cause: String(cause) }),
    });
    const taken = Result.try(() => {
      db.exec('PRAGMA busy_timeout = 0');
      db.exec('PRAGMA journal_mode = MEMORY');
      db.exec('BEGIN IMMEDIATE');
    });
    if (Result.isSuccess(taken)) return db;
    db.close();
    if (isBusy(taken.failure)) return yield* StoreLocked.make({ lock });
    return yield* StoreLockFailed.make({ lock, cause: String(taken.failure) });
  });

/** Holds the store's lock `lock` for the scope, waiting for another run's; closing the connection lets it go. */
const locked = (lock: string) =>
  Effect.acquireRelease(
    tryLock(lock).pipe(
      Effect.retry({
        schedule: Schedule.spaced(LOCK_TRIES.every),
        times: LOCK_TRIES.times,
        while: (error) => error._tag === 'StoreLocked',
      }),
    ),
    (db) => Effect.sync(() => db.close()),
  );

/** The answers kept in `file`: none when it is missing, or when it does not decode (said on one line). */
export const readCache = Effect.fn('judged.readCache')(function* (file: string) {
  const fs = yield* FileSystem.FileSystem;
  const text = yield* fs.readFileString(file).pipe(Effect.option);
  const store = yield* Option.match(text, {
    onNone: () => Effect.succeed<Store>({ answers: {} }),
    onSome: (json) =>
      Schema.decodeEffect(Store)(json).pipe(
        Effect.catch(() =>
          Console.log(`[judged] store unread file=${file} reason=decode`).pipe(
            Effect.as<Store>({ answers: {} }),
          ),
        ),
      ),
  });
  return new Map(Object.entries(store.answers));
});

/** What a run keeps: its new answers, the kept keys it read, and its day (`store.ts`'s `dayOf`). */
interface Keeping {
  readonly fresh: ReadonlyMap<string, Verdict>;
  readonly read: ReadonlySet<string>;
  readonly day: number;
}

/**
 * The answers `kept` hold once a run keeps `keeping`: `fresh` added and each
 * key of `read` marked seen on `day`, and every answer last seen more than
 * `MAX_AGE_DAYS` before it dropped.
 */
const keptAfter = (kept: ReadonlyMap<string, Answer>, keeping: Keeping) => {
  const after = new Map(kept);
  for (const key of keeping.read)
    Option.map(Option.fromUndefinedOr(after.get(key)), (answer) =>
      after.set(key, { ...answer, seen: keeping.day }),
    );
  for (const [key, answer] of keeping.fresh) after.set(key, { ...answer, seen: keeping.day });
  for (const [key, answer] of after)
    if (keeping.day - answer.seen > MAX_AGE_DAYS) after.delete(key);
  return after;
};

/**
 * Whether keeping `keeping` changes `kept`: a fresh answer, a read answer
 * not yet seen on its day, or an answer past its age. A run that changes
 * nothing writes nothing.
 */
export const changes = (kept: ReadonlyMap<string, Answer>, keeping: Keeping) =>
  keeping.fresh.size > 0 ||
  [...keeping.read].some((key) =>
    Option.exists(Option.fromUndefinedOr(kept.get(key)), (answer) => answer.seen !== keeping.day),
  ) ||
  [...kept.values()].some((answer) => keeping.day - answer.seen > MAX_AGE_DAYS);

/**
 * Keeps `keeping` in the store at `file` (`keptAfter`), under its lock,
 * written whole through a temporary file beside it: an answer another run
 * kept meanwhile is read under the lock, and stays.
 */
export const keepAnswers = Effect.fn('judged.keepAnswers')(function* (
  file: string,
  keeping: Keeping,
) {
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  yield* fs.makeDirectory(path.dirname(file), { recursive: true });
  yield* Effect.scoped(
    Effect.gen(function* () {
      yield* locked(path.join(path.dirname(file), `.${path.basename(file)}.lock`));
      const kept = keptAfter(yield* readCache(file), keeping);
      const json = yield* Schema.encodeEffect(Store)({ answers: Object.fromEntries(kept) });
      const partial = `${file}.${process.pid}.partial`;
      yield* Effect.gen(function* () {
        yield* fs.writeFileString(partial, json);
        yield* fs.rename(partial, file);
      }).pipe(Effect.ensuring(Effect.ignore(fs.remove(partial, { force: true }))));
    }),
  );
});
