// Generated assets are content-addressed: each manifest entry carries the hash
// of the request that made it, so a rerun does only stale work. The store
// reads and rewrites those manifests (timings.json, sound/manifest.json,
// sounds/library.lock.json, a film's render catalogue, the lab's notes)
// through their Schema codecs, one writer at a time across processes: the
// review, a `film project` child per request, `sfx make` and a terminal's
// `project render` all write the same files, and every write lands.
//
// One writer at a time: a change holds the manifest's lock, a file beside it
// (`<file>.lock`) created only if there is none, for its read, its change and
// its write; fibers of one process queue on a semaphore per file first. The
// lock names its holder (pid, when taken, a token): a lock whose holder is
// gone, or that is older than any change takes (30 s), was left by a crash,
// and the next writer breaks it and says so.
//
// A file is written whole (`writeWhole`): beside it under a name of the
// writer's own (`<file>.<pid>-<n>.partial`), then renamed over it, and the
// partial removed if the write fails. A reader never sees half a file, and
// two writers never share a partial.

import {
  Clock,
  Context,
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
import { FileInvalid, StoreLocked } from './errors.ts';

/** A manifest file, its codec, and what it holds before anything is generated. */
export interface Manifest<A> {
  readonly file: string;
  readonly codec: Schema.Codec<A, string>;
  readonly empty: A;
}

export type StoreError = FileInvalid | StoreLocked | PlatformError;

/**
 * `file` written whole by `write`, which writes the partial it is handed:
 * a name of this writer's own beside `file`, renamed over it once written,
 * and removed when the write fails or is interrupted.
 */
export const writeWhole = <E, R>(
  fs: FileSystem.FileSystem,
  file: string,
  write: (partial: string) => Effect.Effect<void, E, R>,
): Effect.Effect<void, E | PlatformError, R> =>
  Effect.gen(function* () {
    const partial = `${file}.${process.pid}-${yield* Random.nextIntBetween(0, 1e9)}.partial`;
    yield* Effect.gen(function* () {
      yield* write(partial);
      yield* fs.rename(partial, file);
    }).pipe(Effect.onError(() => Effect.ignore(fs.remove(partial, { force: true }))));
  });

/** One generated asset, requested by the hash of what makes it. */
export interface Ensure<M, A, E, R> {
  readonly manifest: Manifest<M>;
  /** The hash of the request. */
  readonly hash: string;
  /** Produce even when the stored hash matches. */
  readonly force: boolean;
  /** The hash stored for this asset, if any. */
  readonly stored: (manifest: M) => Option.Option<string>;
  readonly produce: Effect.Effect<A, E, R>;
  /** Record the new asset in the manifest. */
  readonly record: (manifest: M, made: A) => M;
}

/** Whether an asset must be (re)made. */
export const isStale = (stored: Option.Option<string>, hash: string, force: boolean): boolean =>
  force || !Option.contains(stored, hash);

/** How often, and how many times, a writer tries another process's lock before giving up. */
const LOCK_TRIES = 250;
const LOCK_SPACING = Duration.millis(20);

/** Who holds a manifest's lock: its process, when it took it (epoch ms), and a token of its own. */
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
 * milliseconds (a read, a still and the file written), so no live writer
 * comes near it.
 */
export const LOCK_STALE = Duration.seconds(30);

/** The lock of the manifest at `file`. */
export const lockFile = (file: string): string => `${file}.lock`;

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

const isAlreadyExists = (error: PlatformError) => error.reason._tag === 'AlreadyExists';

export interface ContentStoreService {
  /** The manifest as stored, or its empty value when there is no file yet. */
  readonly read: <A>(manifest: Manifest<A>) => Effect.Effect<A, StoreError>;
  /** Read, change and write the manifest back, one writer at a time across processes. */
  readonly update: <A>(
    manifest: Manifest<A>,
    change: (current: A) => A,
  ) => Effect.Effect<A, StoreError>;
  /**
   * Read, change and write the manifest back, one writer at a time across
   * processes; a change that fails writes nothing and fails the call. What the
   * change decides from (an entry by its hash, say) is read under the same
   * lock as the write, so no other update lands between them.
   */
  readonly modify: <A, E>(
    manifest: Manifest<A>,
    change: (current: A) => Result.Result<A, E>,
  ) => Effect.Effect<A, E | StoreError>;
  /**
   * `modify` with an effect for a change: it may write files of its own (a
   * note's still) under the manifest's lock, and answers `B` beside the
   * manifest it leaves.
   */
  readonly transact: <A, B, E, R>(
    manifest: Manifest<A>,
    change: (current: A) => Effect.Effect<readonly [B, A], E, R>,
  ) => Effect.Effect<B, E | StoreError, R>;
  /** Write a file whole: a reader never sees half of it. */
  readonly writeFile: (file: string, bytes: Uint8Array) => Effect.Effect<void, PlatformError>;
  /** Produce the asset unless its stored hash is current, then record it. `None` when skipped. */
  readonly ensure: <M, A, E, R>(
    request: Ensure<M, A, E, R>,
  ) => Effect.Effect<Option.Option<A>, E | StoreError, R>;
}

export class ContentStore extends Context.Service<ContentStore, ContentStoreService>()(
  '@bible/film/tools/ContentStore',
) {
  static readonly layer = Layer.effect(
    ContentStore,
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const path = yield* Path.Path;
      /** One writer at a time in this process, per manifest. */
      const writers = new Map<string, Semaphore.Semaphore>();
      const writerOf = (file: string) =>
        Option.getOrElse(Option.fromUndefinedOr(writers.get(file)), () => {
          const made = Semaphore.makeUnsafe(1);
          writers.set(file, made);
          return made;
        });

      const writeFile = Effect.fn('ContentStore.writeFile')(function* (
        file: string,
        bytes: Uint8Array,
      ) {
        yield* fs.makeDirectory(path.dirname(file), { recursive: true });
        yield* writeWhole(fs, file, (partial) => fs.writeFile(partial, bytes));
      });

      /**
       * Break the lock if it is stale. Moved aside first (a rename is atomic,
       * so of two writers breaking it at once only one moves it), then checked
       * to be the very lock judged stale; a live lock moved by mistake (taken
       * between the judging and the move) is put back, unless a third writer
       * has taken the lock since: its lock stays.
       */
      const breakStale = Effect.fn('ContentStore.breakStale')(function* (lock: string) {
        const held = yield* fs.readFileString(lock).pipe(Effect.option);
        const owner = Option.flatMap(held, decodeOwner);
        const now = yield* Clock.currentTimeMillis;
        // An owner that cannot be read (being written, or an old lock directory) ages from its mtime.
        const mtime = fs.stat(lock).pipe(
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
        const grave = `${lock}.stale-${process.pid}-${yield* Random.nextIntBetween(0, 1e9)}`;
        const moved = yield* fs.rename(lock, grave).pipe(Effect.option);
        if (Option.isNone(moved)) return;
        const buried = yield* fs.readFileString(grave).pipe(Effect.option);
        const text = (o: Option.Option<string>) => Option.getOrElse(o, () => '');
        if (text(buried) !== text(held)) {
          // Back only where no lock is: a link fails on one a third writer took meanwhile.
          yield* fs.link(grave, lock).pipe(Effect.ignore);
          yield* fs.remove(grave, { recursive: true }).pipe(Effect.ignore);
          return;
        }
        yield* fs.remove(grave, { recursive: true }).pipe(Effect.ignore);
        yield* Effect.logWarning(`store.lock.broken lock=${lock} reason="${verdict.value}"`);
      });

      /** Take `lock` (a file created only if there is none) for one change. */
      const take = (lock: string, owner: LockOwner) =>
        fs.writeFileString(lock, encodeOwner(owner), { flag: 'wx' }).pipe(
          Effect.tapError((error) =>
            Effect.when(breakStale(lock), Effect.succeed(isAlreadyExists(error))),
          ),
          Effect.retry({
            while: isAlreadyExists,
            times: LOCK_TRIES,
            schedule: Schedule.spaced(LOCK_SPACING),
          }),
          Effect.catchIf(isAlreadyExists, () => Effect.fail(StoreLocked.make({ lock }))),
        );

      /** Give `lock` back, if it is still this writer's (a lock broken as stale is someone else's now). */
      const give = (lock: string, owner: LockOwner) =>
        Effect.gen(function* () {
          const held = Option.flatMap(
            yield* fs.readFileString(lock).pipe(Effect.option),
            decodeOwner,
          );
          if (Option.exists(held, (o) => o.token === owner.token)) return yield* fs.remove(lock);
          yield* Effect.logWarning(
            `store.unlock.lost lock=${lock} reason="another writer holds it now"`,
          );
        }).pipe(
          Effect.catchTag('PlatformError', (error) =>
            Effect.logWarning(`store.unlock lock=${lock} reason=${error.message}`),
          ),
        );

      /** `change` holding `file`'s lock, in this process and across processes. */
      const locked = <A, E, R>(file: string, change: Effect.Effect<A, E, R>) =>
        Effect.gen(function* () {
          const lock = lockFile(file);
          const owner: LockOwner = {
            pid: process.pid,
            created: yield* Clock.currentTimeMillis,
            token: `${process.pid}-${yield* Random.nextIntBetween(0, 1e9)}`,
          };
          return yield* Effect.acquireUseRelease(
            fs
              .makeDirectory(path.dirname(file), { recursive: true })
              .pipe(Effect.andThen(take(lock, owner))),
            () => change,
            () => give(lock, owner),
          );
        }).pipe(writerOf(file).withPermits(1));

      const read = Effect.fn('ContentStore.read')(function* <A>(manifest: Manifest<A>) {
        if (!(yield* fs.exists(manifest.file))) return manifest.empty;
        const text = yield* fs.readFileString(manifest.file);
        return yield* Schema.decodeEffect(manifest.codec)(text).pipe(
          Effect.mapError((error) =>
            FileInvalid.make({ file: manifest.file, reason: error.message }),
          ),
        );
      });

      const transact = <A, B, E, R>(
        manifest: Manifest<A>,
        change: (current: A) => Effect.Effect<readonly [B, A], E, R>,
      ) =>
        locked(
          manifest.file,
          Effect.gen(function* () {
            const [answer, next] = yield* change(yield* read(manifest));
            const text = yield* Schema.encodeEffect(manifest.codec)(next).pipe(
              Effect.mapError((error) =>
                FileInvalid.make({ file: manifest.file, reason: error.message }),
              ),
            );
            yield* writeFile(manifest.file, new TextEncoder().encode(text));
            return answer;
          }),
        ).pipe(Effect.withSpan('ContentStore.transact'));

      const modify = <A, E>(manifest: Manifest<A>, change: (current: A) => Result.Result<A, E>) =>
        transact(manifest, (current: A) =>
          Effect.map(Effect.fromResult(change(current)), (next) => [next, next] as const),
        );

      const update = <A>(manifest: Manifest<A>, change: (current: A) => A) =>
        modify(manifest, (current: A) => Result.succeed(change(current)));

      const ensure = Effect.fn('ContentStore.ensure')(function* <M, A, E, R>(
        request: Ensure<M, A, E, R>,
      ) {
        const current = yield* read(request.manifest);
        if (!isStale(request.stored(current), request.hash, request.force)) return Option.none<A>();
        const made = yield* request.produce;
        yield* update(request.manifest, (m) => request.record(m, made));
        return Option.some(made);
      });

      return ContentStore.of({ read, update, modify, transact, writeFile, ensure });
    }),
  );
}
