// The runner's side of the kept answers (`store.ts` holds their shape and
// key): read whole, and written whole through a temporary file beside it,
// removed if the write fails, under a lock file that names the run holding
// it, so two runs that keep answers at once keep both and a reader sees the
// old store or the new one, never a part. A missing store is
// an empty one; a store that does not decode is an empty one, said on one
// line.

import {
  Clock,
  Console,
  Effect,
  FileSystem,
  Option,
  Path,
  Predicate,
  Random,
  Schedule,
  Schema,
} from 'effect';

import { type Answer, Store } from './store.js';

/**
 * A lock file older than this whose run is alive is a run hung holding it,
 * and is taken; a write under the lock takes milliseconds.
 */
const HUNG_MS = 600_000;

/** How often, and how many times, a run tries for a lock another run holds: 2 s in all. */
const LOCK_TRIES = { every: '25 millis', times: 80 } as const;

/** The lock another run took while this one held it: this run writes nothing. */
class LockLost extends Schema.TaggedError<LockLost>()('LockLost', { lock: Schema.String }) {
  override get message() {
    return `the lock ${this.lock} was taken by another run`;
  }
}

/** Whether the process `pid` runs: a signal 0 reaches it, or reaches it and is refused. */
const alive = (pid: number) =>
  Effect.try({
    try: () => process.kill(pid, 0),
    catch: (error) => ({ refused: Predicate.hasProperty(error, 'code') && error.code === 'EPERM' }),
  }).pipe(
    Effect.as(true),
    Effect.catch(({ refused }) => Effect.succeed(refused)),
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

/**
 * Takes the lock `lock` for this run, its token written in it (the run's
 * pid and a random number), waiting for another run's: a lock whose run is
 * gone, or that is older than `HUNG_MS`, is taken. Released when the scope
 * closes, and only while the lock is still this run's; answers whether it is.
 */
const locked = (lock: string) =>
  Effect.acquireRelease(
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const token = `${process.pid} ${yield* Random.nextInt}`;
      const take = fs.writeFileString(lock, `${token}\n`, { flag: 'wx' });
      const takeLeft = Effect.gen(function* () {
        const holder = Number.parseInt(yield* fs.readFileString(lock), 10);
        const info = yield* fs.stat(lock);
        const now = yield* Clock.currentTimeMillis;
        const age =
          now -
          Option.getOrElse(
            Option.map(info.mtime, (at) => at.getTime()),
            () => now,
          );
        const gone = Number.isNaN(holder) || !(yield* alive(holder));
        if (gone || age > HUNG_MS) yield* fs.remove(lock, { force: true });
        return yield* take;
      });
      yield* take.pipe(
        Effect.catch(() => takeLeft),
        Effect.retry({ schedule: Schedule.spaced(LOCK_TRIES.every), times: LOCK_TRIES.times }),
      );
      const ours = fs.readFileString(lock).pipe(
        Effect.map((text) => text.trim() === token),
        Effect.orElseSucceed(() => false),
      );
      return { fs, ours };
    }),
    ({ fs, ours }) =>
      Effect.ignore(
        Effect.flatMap(ours, (still) =>
          Effect.when(fs.remove(lock, { force: true }), Effect.succeed(still)),
        ),
      ),
  );

/**
 * Adds `fresh` to the answers in `file` and drops those of `stale`, under
 * its lock, written whole through a temporary file beside it: an answer
 * another run kept meanwhile is in neither, and stays.
 */
export const keepAnswers = Effect.fn('judged.keepAnswers')(function* (
  file: string,
  fresh: ReadonlyMap<string, Answer>,
  stale: ReadonlySet<string>,
) {
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  yield* fs.makeDirectory(path.dirname(file), { recursive: true });
  yield* Effect.scoped(
    Effect.gen(function* () {
      const lock = `${file}.lock`;
      const { ours } = yield* locked(lock);
      const kept = yield* readCache(file);
      for (const key of stale) kept.delete(key);
      for (const [key, answer] of fresh) kept.set(key, answer);
      const json = yield* Schema.encodeEffect(Store)({ answers: Object.fromEntries(kept) });
      const partial = `${file}.${process.pid}.partial`;
      yield* Effect.gen(function* () {
        yield* fs.writeFileString(partial, json);
        if (!(yield* ours)) return yield* LockLost.make({ lock });
        yield* fs.rename(partial, file);
      }).pipe(Effect.ensuring(Effect.ignore(fs.remove(partial, { force: true }))));
    }),
  );
});
