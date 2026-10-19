// The runner's side of the kept answers (`store.ts` holds their shape and
// key): read whole, and written whole through a temporary file beside it,
// under a lock file, so two runs that keep answers at once keep both and a
// reader sees the old store or the new one, never a part. A missing store is
// an empty one; a store that does not decode is an empty one, said on one
// line.

import { Clock, Console, Effect, FileSystem, Option, Path, Schedule, Schema } from 'effect';

import { type Answer, Store } from './store.js';

/** A lock file older than this is a run that died holding it, and is taken. */
const STALE_MS = 10_000;

/** How often, and how many times, a run tries for a lock another run holds: 2 s in all. */
const LOCK_TRIES = { every: '25 millis', times: 80 } as const;

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

/** Takes the lock `lock`, waiting for another run's, and taking a stale one; released when the scope closes. */
const locked = (lock: string) =>
  Effect.acquireRelease(
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const take = fs.writeFileString(lock, `${process.pid}\n`, { flag: 'wx' });
      const takeStale = Effect.gen(function* () {
        const info = yield* fs.stat(lock);
        const now = yield* Clock.currentTimeMillis;
        const age =
          now -
          Option.getOrElse(
            Option.map(info.mtime, (at) => at.getTime()),
            () => now,
          );
        if (age > STALE_MS) yield* fs.remove(lock, { force: true });
        return yield* take;
      });
      yield* take.pipe(
        Effect.catch(() => takeStale),
        Effect.retry({ schedule: Schedule.spaced(LOCK_TRIES.every), times: LOCK_TRIES.times }),
      );
      return fs;
    }),
    (fs) => Effect.ignore(fs.remove(lock, { force: true })),
  );

/** Adds `fresh` to the answers in `file`, under its lock, written whole through a temporary file beside it. */
export const keepAnswers = Effect.fn('judged.keepAnswers')(function* (
  file: string,
  fresh: ReadonlyMap<string, Answer>,
) {
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  yield* fs.makeDirectory(path.dirname(file), { recursive: true });
  yield* Effect.scoped(
    Effect.gen(function* () {
      yield* locked(`${file}.lock`);
      const kept = yield* readCache(file);
      for (const [key, answer] of fresh) kept.set(key, answer);
      const json = yield* Schema.encodeEffect(Store)({ answers: Object.fromEntries(kept) });
      const partial = `${file}.${process.pid}.partial`;
      yield* fs.writeFileString(partial, json);
      yield* fs.rename(partial, file);
    }),
  );
});
