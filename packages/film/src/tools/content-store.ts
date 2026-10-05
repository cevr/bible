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
// lock names its holder (pid, host, when taken, a token): a lock whose holder
// is gone (a pid on this host that no longer runs) was left by a crash, and
// the next writer breaks it and says so. A running holder's lock is never
// broken, however long it is held, nor one held on another host; a writer
// that waits its whole wait for one fails as StoreLocked and logs who holds it.
//
// A file is written whole (`writeWhole`): beside it under a name of the
// writer's own (`<file>.<pid>-<n>.partial`), then renamed over it (by the
// caller, under a lock, with `writeWholeWith`: the mix's track and its
// stamp), and the partial removed if the write fails. A reader never sees
// half a file, and two writers never share a partial. The name says whose a
// partial is, its pid and its host (`<file>.<pid>-<n>.<host tag>.partial`),
// so a sweep of what a crash left (narrate's) removes only a partial whose
// writer is gone (`partialAbandoned`), judged as a lock's holder is.

import {
  Array as Arr,
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
import { hostname } from 'node:os';
import { sha256Hex } from './digest.ts';
import { FileInvalid, StoreLocked } from './errors.ts';

/** A manifest file, its codec, and what it holds before anything is generated. */
export interface Manifest<A> {
  readonly file: string;
  readonly codec: Schema.Codec<A, string>;
  readonly empty: A;
}

export type StoreError = FileInvalid | StoreLocked | PlatformError;

/** A host as a partial's name carries it: twelve hex digits of its name's SHA-256, free of dots. */
const hostTag = (host: string): string => sha256Hex(host).slice(0, 12);

/**
 * The partial process `pid` on `host` writes `file` through
 * (`writeWholeWith`): `<file>.<pid>-<n>.<host tag>.partial`.
 */
const partialOf = (file: string, pid: number, n: number, host: string): string =>
  `${file}.${pid}-${n}.${hostTag(host)}.partial`;

/** Who writes a partial: its pid, and its host's tag (none in a name from before partials carried it). */
interface PartialWriter {
  readonly pid: number;
  readonly host: Option.Option<string>;
}

/**
 * The writer of a partial (`writeWholeWith`), read from its name: none for
 * a name that carries no writer (`<file>.partial`), and no host for one
 * from before partials named theirs (`<file>.<pid>-<n>.partial`).
 */
const partialWriter = (name: string): Option.Option<PartialWriter> =>
  Option.flatMap(
    Option.fromNullishOr(/\.(\d+)-\d+(?:\.([0-9a-f]{12}))?\.partial$/.exec(name)),
    (named) =>
      Option.map(Arr.get(named, 1), (pid) => ({
        pid: Number(pid),
        host: Option.fromNullishOr(named[2]),
      })),
  );

/**
 * `file` written whole by `write`, which writes the partial it is handed:
 * a name of this writer's own beside `file`, landed by `land` once written
 * (a rename over `file`, made under a lock or beside another file's write),
 * and removed when the write or the landing fails or is interrupted.
 */
export const writeWholeWith = <E, R, L, LR>(
  fs: FileSystem.FileSystem,
  file: string,
  write: (partial: string) => Effect.Effect<void, E, R>,
  land: (partial: string) => Effect.Effect<void, L, LR>,
): Effect.Effect<void, E | L | PlatformError, R | LR> =>
  Effect.gen(function* () {
    const { host } = yield* Processes;
    const partial = partialOf(file, process.pid, yield* Random.nextIntBetween(0, 1e9), host);
    yield* Effect.gen(function* () {
      yield* write(partial);
      yield* land(partial);
    }).pipe(Effect.onError(() => Effect.ignore(fs.remove(partial, { force: true }))));
  });

/** `file` written whole by `write` (`writeWholeWith`), its partial renamed over it once written. */
export const writeWhole = <E, R>(
  fs: FileSystem.FileSystem,
  file: string,
  write: (partial: string) => Effect.Effect<void, E, R>,
): Effect.Effect<void, E | PlatformError, R> =>
  writeWholeWith(fs, file, write, (partial) => fs.rename(partial, file));

/** One generated asset, requested by the hash of what makes it. */
interface Ensure<M, A, E, R> {
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
const isStale = (stored: Option.Option<string>, hash: string, force: boolean): boolean =>
  force || !Option.contains(stored, hash);

/** How often, and how many times, a writer tries another process's lock before giving up. */
const LOCK_TRIES = 250;
const LOCK_SPACING = Duration.millis(20);

/**
 * Who holds a manifest's lock: its process, the host it runs on, when it
 * took it (epoch ms), and a token of its own. A lock from before the host was
 * written names none, and is judged as this host's.
 */
const LockOwner = Schema.Struct({
  pid: Schema.Int,
  host: Schema.optionalKey(Schema.String),
  created: Schema.Finite,
  token: Schema.String,
});
type LockOwner = typeof LockOwner.Type;
export const LockOwnerJson = Schema.fromJsonString(LockOwner);
const decodeOwner = Schema.decodeUnknownOption(LockOwnerJson);
const encodeOwner = Schema.encodeSync(LockOwnerJson);

/**
 * A lock whose holder cannot be read (a lock directory of an older store,
 * or a file left empty by a crash mid-write) and that is older than this was
 * left by a crash: a holder writes itself into the lock as it creates it.
 */
const UNREAD_LOCK_STALE = Duration.seconds(30);

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

/** The processes a lock's holder is judged among: this host's name, and whether a pid on it runs. */
interface ProcessesService {
  readonly host: string;
  readonly alive: (pid: number) => Effect.Effect<boolean>;
}

/**
 * This host's processes (`process.kill(pid, 0)`, `os.hostname()`): what
 * says whether a lock's holder is gone. Tests set it.
 */
export const Processes = Context.Reference<ProcessesService>('@bible/film/tools/Processes', {
  defaultValue: () => ({ host: hostname(), alive: (pid) => Effect.sync(() => isAlive(pid)) }),
});

/** Whether `owner` runs on host `here`: one that names no host is taken to. */
const holdsOn = (owner: LockOwner, here: string): boolean =>
  Option.getOrElse(Option.fromUndefinedOr(owner.host), () => here) === here;

/**
 * Whether the partial `name` was left by a writer that is gone, as a lock's
 * holder is judged: a pid on this host that no longer runs. A partial
 * written on another host is never judged, since its pid means nothing here;
 * one that names no host (from before partials carried it) is taken as this
 * host's, as a lock that names none is. A name that carries no writer at
 * all (`<file>.partial`) is one no writer of this store has made since
 * partials were named by their writer, so a crash left it.
 */
export const partialAbandoned = (name: string): Effect.Effect<boolean> =>
  Effect.gen(function* () {
    const writer = partialWriter(name);
    if (Option.isNone(writer)) return true;
    const processes = yield* Processes;
    const here = hostTag(processes.host);
    if (Option.getOrElse(writer.value.host, () => here) !== here) return false;
    return !(yield* processes.alive(writer.value.pid));
  });

/**
 * Why a lock held by `owner` is stale, or none while it holds. A lock is
 * stale only when its holder is gone: a holder on this host (`here`) whose
 * pid no longer runs (`alive`, asked of it alone). One held by a running
 * process holds however long it is held (a slow or suspended change is
 * still a change), and one held on another host is never judged, since its
 * pid means nothing here. A holder that cannot be read (none) ages from
 * `since`, its file's mtime, and is stale past UNREAD_LOCK_STALE. Pure.
 */
export const lockVerdict = (
  owner: Option.Option<LockOwner>,
  now: number,
  here: string,
  alive: (pid: number) => boolean,
  since: number = now,
): Option.Option<string> =>
  Option.match(owner, {
    onNone: () => {
      const age = now - since;
      if (age <= Duration.toMillis(UNREAD_LOCK_STALE)) return Option.none<string>();
      return Option.some(
        `its holder cannot be read, and it was made ${Math.round(age / 1000)} s ago`,
      );
    },
    onSome: (o) => {
      if (!holdsOn(o, here) || alive(o.pid)) return Option.none<string>();
      return Option.some(`its holder, pid ${o.pid}, is gone`);
    },
  });

const isAlreadyExists = (error: PlatformError) => error.reason._tag === 'AlreadyExists';

interface ContentStoreService {
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
  /**
   * `effect` holding `file`'s lock (the one its `transact` takes), in this
   * process and across processes, without rewriting `file`: for what changes
   * the files a manifest names (a take put away, or brought back with the
   * text that names it) and must not interleave with a change of the
   * manifest. Not reentrant: `effect` must not take the same lock again.
   */
  readonly holding: <A, E, R>(
    file: string,
    effect: Effect.Effect<A, E, R>,
  ) => Effect.Effect<A, E | StoreLocked | PlatformError, R>;
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
        const processes = yield* Processes;
        // Only a holder on this host is asked after: another's pid means nothing here.
        const running = yield* Option.match(
          Option.filter(owner, (o) => holdsOn(o, processes.host)),
          { onNone: () => Effect.succeed(true), onSome: (o) => processes.alive(o.pid) },
        );
        const verdict = lockVerdict(owner, now, processes.host, () => running, since);
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

      /** Who holds `lock`, as the log names them once a writer has waited its whole wait. */
      const heldBy = (lock: string) =>
        Effect.gen(function* () {
          const owner = Option.flatMap(
            yield* fs.readFileString(lock).pipe(Effect.option),
            decodeOwner,
          );
          const now = yield* Clock.currentTimeMillis;
          const holder = Option.match(owner, {
            onNone: () => 'holder=unreadable',
            onSome: (o) =>
              `pid=${o.pid} host=${Option.getOrElse(Option.fromUndefinedOr(o.host), () => 'unnamed')} held=${Math.round((now - o.created) / 1000)}s`,
          });
          yield* Effect.logWarning(
            `store.lock.held lock=${lock} ${holder} reason="a running writer holds it; it is broken only once that writer is gone"`,
          );
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
          Effect.catchIf(isAlreadyExists, () =>
            Effect.andThen(heldBy(lock), Effect.fail(StoreLocked.make({ lock }))),
          ),
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
            host: (yield* Processes).host,
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

      return ContentStore.of({
        read,
        update,
        modify,
        transact,
        holding: locked,
        writeFile,
        ensure,
      });
    }),
  );
}
