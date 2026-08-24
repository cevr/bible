/** `bible egw daemon` — the warm search process.
 *
 *  A cold `bible egw search` pays the whole §9 stack per invocation: open the
 *  writings database, load the ~1.2 GB embedding model, parse the 264 MB
 *  vector index — ~10 seconds before the first answer. The daemon pays that
 *  once and then answers `v1.search.query` over a unix socket in the time the
 *  query itself costs (~150 ms scan + embed).
 *
 *  **Lifecycle.** One daemon per user, keyed by the socket path. On start it
 *  probes its own socket: a live daemon there means this one is redundant and
 *  exits zero; a dead socket file is removed and the bind proceeds. Two
 *  racing starts are settled by the bind itself — the loser's listen fails
 *  and it exits. The daemon retires itself after `--idle-minutes` without a
 *  request, or immediately on `daemon.shutdown` (`bible egw daemon --stop`).
 *  Either way the socket file is removed on the way out.
 *
 *  **Warmth.** The expensive layers load lazily on first use, so binding the
 *  socket is instant and a warmup query is fired concurrently — the daemon is
 *  reachable immediately and hot within seconds. A query that arrives during
 *  warmup simply waits on the same in-flight loads.
 */

import { SearchQuery, SearchService } from '@bible/core/search';
import { BunServices, BunSocketServer } from '@effect/platform-bun';
import {
  Clock,
  Config,
  Console,
  Deferred,
  Duration,
  Effect,
  FileSystem,
  Layer,
  Option,
  Ref,
} from 'effect';
import { Command, Flag } from 'effect/unstable/cli';
import { RpcSerialization, RpcServer } from 'effect/unstable/rpc';

import { CliProcess } from '../../services/process.js';
import {
  CLIENT_FINGERPRINT,
  probeSearchDaemon,
  shutdownSearchDaemon,
} from './search-daemon-client.js';
import {
  SearchDaemonGroup,
  SearchDaemonStatus,
  searchDaemonSocketPath,
} from './search-daemon-protocol.js';
import { installedSearchLayer } from './search-layer.js';

/** A wordy query so the router draws the vector leg: it forces the embedder
 *  (model load) and the index (parse + first scan) while the daemon idles. */
const WARMUP_QUERY = SearchQuery.make({
  text: 'why does God permit trials to come upon his people',
  scope: Option.none(),
  bookCode: Option.none(),
  limit: Option.some(1),
});

/** How often the idle watcher looks at the clock, capped so short test
 *  timeouts are honored promptly. */
const idleCheckInterval = (idleMillis: number): Duration.Duration =>
  Duration.millis(Math.min(Math.max(idleMillis, 50), 60_000));

export type SearchDaemonOutcome = 'already-running' | 'idle' | 'retired';

/** The daemon's whole life, as one effect: preflight, bind, warm, serve,
 *  retire. Parameterised on nothing it can take from context — `SearchService`
 *  arrives from the caller so tests serve a stub through the real socket. */
export const runSearchDaemon = (options: {
  readonly socketPath: string;
  readonly idleMillis: number;
  readonly pid: number;
}): Effect.Effect<SearchDaemonOutcome, never, SearchService | FileSystem.FileSystem> =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;

    // Preflight: a live daemon on this socket makes this one redundant; a
    // socket file nothing answers on is a previous daemon's crash residue.
    const occupied = yield* fs.exists(options.socketPath).pipe(Effect.orElseSucceed(() => false));
    if (occupied) {
      const resident = yield* probeSearchDaemon(options.socketPath);
      if (Option.isSome(resident)) return 'already-running';
      yield* fs.remove(options.socketPath).pipe(Effect.ignore);
    }

    const lastActivity = yield* Ref.make(yield* Clock.currentTimeMillis);
    const retire = yield* Deferred.make<'retired'>();
    const touch = Clock.currentTimeMillis.pipe(Effect.flatMap((now) => Ref.set(lastActivity, now)));

    const handlers = SearchDaemonGroup.toLayer(
      Effect.gen(function* () {
        const search = yield* SearchService;
        return {
          'v1.search.query': (input) =>
            touch.pipe(
              Effect.andThen(
                search.query(
                  SearchQuery.make({
                    text: input.text,
                    scope: Option.fromNullishOr(input.scope),
                    bookCode: Option.fromNullishOr(input.bookCode),
                    limit: Option.fromNullishOr(input.limit),
                  }),
                ),
              ),
            ),
          'daemon.status': () =>
            touch.pipe(
              Effect.as(
                SearchDaemonStatus.make({ pid: options.pid, fingerprint: CLIENT_FINGERPRINT }),
              ),
            ),
          // Acknowledge first, retire a beat later: succeeding the deferred
          // interrupts the server, and an immediate interrupt can cut the
          // socket before the response flushes.
          'daemon.shutdown': () =>
            Deferred.succeed(retire, 'retired').pipe(
              Effect.delay(Duration.millis(150)),
              Effect.forkDetach,
              Effect.asVoid,
            ),
        };
      }),
    );

    const server = RpcServer.layer(SearchDaemonGroup).pipe(
      Layer.provide(handlers),
      Layer.provide(RpcServer.layerProtocolSocketServer),
      Layer.provide(RpcSerialization.layerNdjson),
      Layer.provide(BunSocketServer.layer({ path: options.socketPath })),
    );

    const warmup = Effect.flatMap(SearchService, (search) => search.query(WARMUP_QUERY)).pipe(
      Effect.ignore,
    );

    const idle = Effect.gen(function* () {
      for (;;) {
        yield* Effect.sleep(idleCheckInterval(options.idleMillis));
        const last = yield* Ref.get(lastActivity);
        const now = yield* Clock.currentTimeMillis;
        if (now - last >= options.idleMillis) return 'idle' as const;
      }
    });

    const outcome = yield* Effect.gen(function* () {
      yield* Effect.forkChild(warmup);
      return yield* Layer.launch(server).pipe(
        Effect.raceFirst(Deferred.await(retire)),
        Effect.raceFirst(idle),
      );
    }).pipe(Effect.orDie, Effect.scoped);

    // Node does not unlink a unix socket on close; the next daemon's
    // preflight would find residue where this exit can leave none.
    yield* fs.remove(options.socketPath).pipe(Effect.ignore);
    return outcome;
  });

const stop = Flag.boolean('stop').pipe(
  Flag.withDefault(false),
  Flag.withDescription('Ask the running daemon to exit'),
);

const idleMinutes = Flag.integer('idle-minutes').pipe(
  Flag.withDefault(15),
  Flag.withDescription('Exit after this long without a request (default: 15)'),
);

/** The serve operation, with the search stack provided at its own boundary —
 *  the `remoteSearch` pattern in `search.ts`. `CliProcess` stays a requirement
 *  and arrives from the root command's provision. */
const serveDaemon = (input: { readonly socketPath: string; readonly idleMillis: number }) =>
  Effect.gen(function* () {
    const cliProcess = yield* CliProcess;
    yield* Console.error(`search daemon listening on ${input.socketPath}`);
    const outcome = yield* runSearchDaemon({
      socketPath: input.socketPath,
      idleMillis: input.idleMillis,
      pid: cliProcess.pid,
    });
    yield* Console.error(`search daemon exiting (${outcome})`);
  }).pipe(Effect.provide(Layer.mergeAll(installedSearchLayer, BunServices.layer)));

export const egwDaemon = Command.make('daemon', { stop, idleMinutes }, (args) =>
  Effect.gen(function* () {
    const home = yield* Config.string('HOME');
    const socketPath = searchDaemonSocketPath(home);

    if (args.stop) {
      const resident = yield* probeSearchDaemon(socketPath);
      if (Option.isNone(resident)) {
        yield* Console.log('No search daemon is running.');
        return;
      }
      yield* shutdownSearchDaemon(socketPath);
      yield* Console.log(`Search daemon (pid ${String(resident.value.pid)}) asked to exit.`);
      return;
    }

    yield* serveDaemon({ socketPath, idleMillis: args.idleMinutes * 60_000 });
  }),
);
