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
// lock names its holder: pid, host, when taken, a token no other taking in
// its process has, and when its process started. What the lock holds to:
//
// 1. One holder. A lock is created only where none is, and given back only
//    while it holds the very text its holder wrote (`give`).
// 2. A stale lock is broken by exactly one breaker. A writer judges and moves
//    a lock only while it holds the lock's breaker (`<file>.lock.break`,
//    taken and given back as a lock is), so of writers finding one stale
//    lock one breaks it and the rest judge afresh whatever lock is there next
//    (`breakStale`). A lock moved by a writer from before the breaker is
//    checked and put back where none has been taken since (`bury`).
// 3. A holder is named so that a reused pid does not keep it. A lock is stale
//    only when its holder is gone: a pid on this host that no longer runs, or
//    that now runs a process started since the lock was taken. A running
//    holder's lock is never broken, however long it is held, nor one held on
//    another host; a writer that waits its whole wait for one fails as
//    StoreLocked and logs who holds it.
// 4. Only proof loses a lock on give-back: no lock there, or another holder's
//    text. Any other failure (a busy disk, no file handle left) keeps the
//    lock's path and the text this store wrote there as its own leftover.
// 5. A leftover blocks other processes only while the disk refuses: it is
//    removed, only while it holds that text, in the background, tried again
//    until the disk lets it (RETIRE), or at this store's next change of the
//    file if that comes first.
// 6. A decision about a manifest is made while holding its lock: `transact`
//    and `holding` hand their change the manifest as read under the lock, and
//    neither takes a path and a bare effect. A change that takes the same
//    lock again dies naming it, rather than waiting on itself. A value read
//    before the lock and carried in stays the reviewer's to catch.
//
// A file is written whole (`writeWhole`): beside it under a name of the
// writer's own (`<file>.<pid>-<n>.<host tag>.partial`), then renamed over it
// (by the caller, under a lock, with `writeWholeWith`: the mix's track and
// its stamp), and the partial removed if the write fails. A reader never
// sees half a file, and two writers never share a partial. The name says
// whose a partial is, so a sweep of what a crash left (narrate's) removes
// only a partial whose writer is known to be gone, a pid on this host that
// no longer runs, and keeps every other (`partialAbandoned`).

import {
  Array as Arr,
  Clock,
  Context,
  Duration,
  Effect,
  FiberMap,
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

/** Who writes a partial: its pid, and its host's tag. */
interface PartialWriter {
  readonly pid: number;
  readonly host: string;
}

/**
 * The writer of a partial (`writeWholeWith`), read from its name; none for
 * a name that does not carry both (`<file>.partial`, or
 * `<file>.<pid>-<n>.partial` from before partials named their host).
 */
const partialWriter = (name: string): Option.Option<PartialWriter> =>
  Option.flatMap(
    Option.fromNullishOr(/\.(\d+)-\d+\.([0-9a-f]{12})\.partial$/.exec(name)),
    (named) =>
      Option.zipWith(Arr.get(named, 1), Arr.get(named, 2), (pid, host) => ({
        pid: Number(pid),
        host,
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
 * How a lock this store could not remove is tried again in the background:
 * soon, then less often, never more than 5 s apart, until the disk lets it.
 */
const RETIRE = Schedule.min([Schedule.exponential('50 millis'), Schedule.spaced('5 seconds')]);

/**
 * Who holds a manifest's lock: its process, the host it runs on, when it
 * took it (epoch ms), a token of its own (`<pid>-<n>`, the process's nth
 * taking), and when its process started (`Processes.startOf`), which no later
 * process given the same pid shares. A lock from before the host was written
 * names none, and is judged as this host's; one from before the start was
 * written (or from a host whose process table says none) names none, and is
 * judged by its pid alone. A store from before `started` reads a lock that
 * has it, the key being one it ignores.
 */
const LockOwner = Schema.Struct({
  pid: Schema.Int,
  host: Schema.optionalKey(Schema.String),
  created: Schema.Finite,
  token: Schema.String,
  started: Schema.optionalKey(Schema.String),
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

/** The locks this process has taken, every store's: each taking's token is its count. */
const takings = { count: 0 };

/** The lock of the manifest at `file`. */
export const lockFile = (file: string): string => `${file}.lock`;

/** The manifests whose locks the running change holds, in its fiber and those it forks. */
const Held = Context.Reference<ReadonlySet<string>>('@bible/film/tools/ContentStore/Held', {
  defaultValue: () => new Set(),
});

/** What a writer holds while it breaks `lock`: one breaker at a time. */
const breakerFile = (lock: string): string => `${lock}.break`;

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
 * When process `pid` started, as `<boot id>/<start>`: its start time in
 * clock ticks since boot (`/proc/<pid>/stat`, field 22) under this boot's id,
 * so no later process given the same pid, nor one after a reboot, shares it.
 * None where `/proc` does not say (another system, or no such process).
 */
const startOf = (pid: number) =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const proc = (file: string) => Effect.option(fs.readFileString(file));
    const stat = yield* proc(`/proc/${pid}/stat`);
    const boot = yield* proc('/proc/sys/kernel/random/boot_id');
    // The fields after the command's name, which may hold spaces, start at field 3.
    const ticks = Option.flatMap(stat, (s) =>
      Arr.get(s.slice(s.lastIndexOf(')') + 2).split(' '), 22 - 3),
    );
    return Option.zipWith(boot, ticks, (b, t) => `${b.trim()}/${t}`);
  });

/**
 * The processes a lock's holder is judged among: this host's name, whether a
 * pid on it runs, and when the process with that pid started (`startOf`, read
 * through the store's file system).
 */
interface ProcessesService {
  readonly host: string;
  readonly alive: (pid: number) => Effect.Effect<boolean>;
  readonly startOf: (
    pid: number,
  ) => Effect.Effect<Option.Option<string>, never, FileSystem.FileSystem>;
}

/**
 * This host's processes (`process.kill(pid, 0)`, `/proc`, `os.hostname()`):
 * what says whether a lock's holder is gone. Tests set it.
 */
export const Processes = Context.Reference<ProcessesService>('@bible/film/tools/Processes', {
  defaultValue: () => ({
    host: hostname(),
    alive: (pid) => Effect.sync(() => isAlive(pid)),
    startOf,
  }),
});

/** Whether `owner` runs on host `here`: one that names no host is taken to. */
const holdsOn = (owner: LockOwner, here: string): boolean =>
  Option.getOrElse(Option.fromUndefinedOr(owner.host), () => here) === here;

/**
 * Whether `owner`, a holder on this host, still runs: its pid runs and, when
 * both the lock and the host name a start, as the very process that took the
 * lock, not a later one given its pid.
 */
const holderRuns = (processes: ProcessesService, owner: LockOwner) =>
  Effect.gen(function* () {
    if (!(yield* processes.alive(owner.pid))) return false;
    const took = Option.fromUndefinedOr(owner.started);
    if (Option.isNone(took)) return true;
    return Option.match(yield* processes.startOf(owner.pid), {
      onNone: () => true,
      onSome: (now) => now === took.value,
    });
  });

/**
 * Whether the partial `name` was left by a writer that is gone: a pid on
 * this host that no longer runs. Every other partial is kept: one written on
 * another host (its pid means nothing here), and one that names no host
 * (`<file>.<pid>-<n>.partial`, a writer from before partials carried it, on
 * any host) or no writer at all (`<file>.partial`), whose writer cannot be
 * told. Unlike a lock, a stale partial blocks no writer and is git-ignored,
 * while removing a live one loses its write, so a partial is removed only
 * when its writer is known to be gone.
 */
export const partialAbandoned = (name: string): Effect.Effect<boolean> =>
  Effect.gen(function* () {
    const writer = partialWriter(name);
    if (Option.isNone(writer)) return false;
    const processes = yield* Processes;
    if (writer.value.host !== hostTag(processes.host)) return false;
    return !(yield* processes.alive(writer.value.pid));
  });

/**
 * Why a lock held by `owner` is stale, or none while it holds. A lock is
 * stale only when its holder is gone: a holder on this host (`here`) that no
 * longer runs (`runs`, asked of it alone: `holderRuns`). One held by a
 * running process holds however long it is held (a slow or suspended change
 * is still a change), and one held on another host is never judged, since
 * its pid means nothing here. A holder that cannot be read (none) ages from
 * `since`, its file's mtime, and is stale past UNREAD_LOCK_STALE. Pure.
 */
export const lockVerdict = (
  owner: Option.Option<LockOwner>,
  now: number,
  here: string,
  runs: (owner: LockOwner) => boolean,
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
      if (!holdsOn(o, here) || runs(o)) return Option.none<string>();
      return Option.some(`its holder, pid ${o.pid}, is gone`);
    },
  });

const isAlreadyExists = (error: PlatformError) => error.reason._tag === 'AlreadyExists';
const isNotFound = (error: PlatformError) => error.reason._tag === 'NotFound';

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
   * `use` of the manifest as it is, holding its lock (the one its
   * `transact` takes), in this process and across processes, without
   * rewriting it: for what changes the files a manifest names (a take put
   * away, or brought back with the text that names it) and must not
   * interleave with a change of the manifest. What `use` decides from is
   * read under that lock. A lock taken again inside itself (a `holding` or
   * `transact` of the same file within `use`) dies naming the file, rather
   * than waiting on itself.
   */
  readonly holding: <A, B, E, R>(
    manifest: Manifest<A>,
    use: (current: A) => Effect.Effect<B, E, R>,
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
      /** Each lock this store gave back but could not remove, by path: the text it wrote there. */
      const leftovers = new Map<string, string>();
      /** The leftovers being removed in the background, by path: one fiber each, gone with the store. */
      const retiring = yield* FiberMap.make<string>();

      const writeFile = Effect.fn('ContentStore.writeFile')(function* (
        file: string,
        bytes: Uint8Array,
      ) {
        yield* fs.makeDirectory(path.dirname(file), { recursive: true });
        yield* writeWhole(fs, file, (partial) => fs.writeFile(partial, bytes));
      });

      /**
       * Remove `lock` (the lock, or its breaker) if it is stale. Moved aside
       * first (a rename is atomic, so of two writers removing it at once only
       * one moves it), then checked to be the very lock judged stale; a live
       * lock moved by mistake (taken between the judging and the move, by a
       * writer that takes no breaker) is put back, unless a third writer has
       * taken the lock since: its lock stays.
       */
      const bury = Effect.fn('ContentStore.bury')(function* (lock: string) {
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
          {
            onNone: () => Effect.succeed(true),
            onSome: (o) =>
              holderRuns(processes, o).pipe(Effect.provideService(FileSystem.FileSystem, fs)),
          },
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

      /**
       * This store's leftover at `lock` settled: removed while the lock still
       * holds the very text this store wrote there, and forgotten once no
       * lock is there or another holder's is. It fails, kept, while the disk
       * still refuses. Run under the file's semaphore, so no change of this
       * process interleaves; no other process removes it, its holder running.
       */
      const retire = (lock: string) =>
        Effect.gen(function* () {
          const left = Option.fromUndefinedOr(leftovers.get(lock));
          if (Option.isNone(left)) return;
          const held = yield* fs.readFileString(lock).pipe(
            Effect.asSome,
            Effect.catchIf(isNotFound, () => Effect.succeed(Option.none<string>())),
          );
          const ours = Option.contains(held, left.value);
          if (ours) yield* fs.remove(lock).pipe(Effect.catchIf(isNotFound, () => Effect.void));
          leftovers.delete(lock);
          if (ours)
            yield* Effect.logWarning(
              `store.lock.broken lock=${lock} reason="this store gave it back, and its removal failed"`,
            );
        });

      /**
       * `lock`'s leftover removed in the background (`retire`) under `file`'s
       * semaphore, tried again on RETIRE until the disk lets it: so it blocks
       * other processes only as long as the disk refuses, not until this
       * store next changes `file`. One fiber per lock, in the store's scope.
       */
      const retireLater = (file: string, lock: string) =>
        FiberMap.run(
          retiring,
          lock,
          writerOf(file).withPermits(1)(retire(lock)).pipe(Effect.retry(RETIRE), Effect.ignore),
          { onlyIfMissing: true },
        );

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

      /**
       * Give `lock` back, if it still holds the very text this writer wrote.
       * It is lost only on proof: no lock there (NotFound), or another
       * holder's text. Any other failure, of the read or the removal, keeps
       * it as this store's leftover, its path and that text, removed in the
       * background (`retireLater`) or by its next change of `file`.
       */
      const give = (file: string, lock: string, owner: LockOwner) => {
        const written = encodeOwner(owner);
        const lost = (why: string) =>
          Effect.logWarning(`store.unlock.lost lock=${lock} reason="${why}"`);
        return Effect.gen(function* () {
          if ((yield* fs.readFileString(lock)) !== written)
            return yield* lost('another writer holds it now');
          yield* fs.remove(lock);
        }).pipe(
          Effect.catchTag('PlatformError', (error) => {
            if (isNotFound(error)) return lost('no lock is there');
            return Effect.sync(() => void leftovers.set(lock, written)).pipe(
              Effect.andThen(
                Effect.logWarning(`store.unlock lock=${lock} reason=${error.message}`),
              ),
              Effect.andThen(retireLater(file, lock)),
            );
          }),
        );
      };

      /**
       * Break `lock` if it is stale, one breaker at a time across processes:
       * it is judged and moved only while its breaker is held (`<lock>.break`,
       * a file created only if there is none, naming its holder as a lock
       * does, given back as a lock is), so of writers that find one stale lock
       * exactly one breaks it, and a lock taken since is judged afresh by the
       * next. A breaker left by a crash is removed once stale (`bury`), and
       * the writer tries again; so is this store's own leftover breaker.
       */
      const breakStale = (file: string, lock: string, owner: LockOwner) => {
        const breaker = breakerFile(lock);
        return Effect.ignore(retire(breaker)).pipe(
          Effect.andThen(
            Effect.acquireUseRelease(
              fs.writeFileString(breaker, encodeOwner(owner), { flag: 'wx' }),
              () => bury(lock),
              () => give(file, breaker, owner),
            ),
          ),
          Effect.catchIf(isAlreadyExists, () => bury(breaker)),
          Effect.ignore,
        );
      };

      /**
       * Take `file`'s lock (a file created only if there is none) for one
       * change: while another is there, this store's own leftover is settled
       * first (`retire`), then a stale lock broken (`breakStale`).
       */
      const take = (file: string, lock: string, owner: LockOwner) =>
        fs.writeFileString(lock, encodeOwner(owner), { flag: 'wx' }).pipe(
          Effect.tapError((error) =>
            Effect.when(
              Effect.andThen(Effect.ignore(retire(lock)), breakStale(file, lock, owner)),
              Effect.succeed(isAlreadyExists(error)),
            ),
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

      /**
       * `change` holding `file`'s lock, in this process and across processes.
       * Taken again inside `change`, it dies naming the file: it would wait on
       * itself, in this process's queue or on its own lock, forever.
       */
      const locked = <A, E, R>(file: string, change: Effect.Effect<A, E, R>) =>
        Effect.gen(function* () {
          const held = yield* Held;
          if (held.has(file))
            return yield* Effect.die(
              `ContentStore: ${lockFile(file)} is taken again by a change that holds it`,
            );
          const lock = lockFile(file);
          const processes = yield* Processes;
          const started = yield* processes
            .startOf(process.pid)
            .pipe(Effect.provideService(FileSystem.FileSystem, fs));
          const owner: LockOwner = {
            pid: process.pid,
            host: processes.host,
            created: yield* Clock.currentTimeMillis,
            token: `${process.pid}-${(takings.count += 1)}`,
            ...Option.match(started, { onNone: () => ({}), onSome: (s) => ({ started: s }) }),
          };
          return yield* Effect.acquireUseRelease(
            fs
              .makeDirectory(path.dirname(file), { recursive: true })
              .pipe(Effect.andThen(take(file, lock, owner))),
            () => Effect.provideService(change, Held, new Set([...held, file])),
            () => give(file, lock, owner),
          ).pipe(writerOf(file).withPermits(1));
        });

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

      const holding = <A, B, E, R>(
        manifest: Manifest<A>,
        use: (current: A) => Effect.Effect<B, E, R>,
      ) =>
        locked(manifest.file, Effect.flatMap(read(manifest), use)).pipe(
          Effect.withSpan('ContentStore.holding'),
        );

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
        holding,
        writeFile,
        ensure,
      });
    }),
  );
}
