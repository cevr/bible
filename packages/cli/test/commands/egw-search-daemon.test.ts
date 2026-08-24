/** The search daemon, end to end over a real unix socket.
 *
 *  The daemon's one claim is transparency: a query answered over the socket is
 *  the same value the in-process service returns. So the fixture serves the
 *  golden corpus through `runSearchDaemon`, and the assertions compare the
 *  daemon's answers byte-for-byte (as the one wire encoding) against the same
 *  `SearchService` asked directly — plus the lifecycle facts the client leans
 *  on: the status handshake, `--stop`, idle retirement, and crash residue on
 *  the socket path.
 */

import { SearchQuery, SearchResultJson, SearchService } from '@bible/core/search';
import { goldenSearchLayer } from '@bible/core/search/testing';
import { BunServices } from '@effect/platform-bun';
import { expect, it } from 'effect-bun-test';
import {
  Context,
  Duration,
  Effect,
  Fiber,
  FileSystem,
  Layer,
  Option,
  Schedule,
  Schema,
} from 'effect';

import {
  CLIENT_FINGERPRINT,
  probeSearchDaemon,
  searchDaemonClientLayer,
  shutdownSearchDaemon,
} from '../../src/commands/egw/search-daemon-client.js';
import { runSearchDaemon } from '../../src/commands/egw/search-daemon.js';

const testLayer = Layer.mergeAll(goldenSearchLayer(), BunServices.layer);

const encodeResult = Schema.encodeEffect(SearchResultJson);

const QUERY = SearchQuery.make({
  text: 'what happens at the close of probation',
  scope: Option.none(),
  bookCode: Option.none(),
  limit: Option.some(20),
});

/** Polls the socket until the daemon answers — bounded, so a daemon that never
 *  comes up fails the test instead of hanging it. */
const awaitDaemon = (socketPath: string) =>
  probeSearchDaemon(socketPath).pipe(
    Effect.flatMap(
      Option.match({
        onNone: () => Effect.fail('daemon-not-up' as const),
        onSome: Effect.succeed,
      }),
    ),
    Effect.retry({ schedule: Schedule.spaced(Duration.millis(50)), times: 200 }),
  );

it.scopedLive('answers queries over the socket exactly as the in-process service does', () =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const dir = yield* fs.makeTempDirectoryScoped();
    const socketPath = `${dir}/daemon.sock`;

    const daemon = yield* Effect.forkChild(
      runSearchDaemon({ socketPath, idleMillis: 60_000, pid: 4242 }),
    );
    const status = yield* awaitDaemon(socketPath);
    expect(status.pid).toBe(4242);
    expect(status.fingerprint).toBe(CLIENT_FINGERPRINT);

    const services = yield* Layer.build(searchDaemonClientLayer(socketPath));
    const remote = Context.get(services, SearchService);
    const direct = yield* SearchService;

    const overSocket = yield* encodeResult(yield* remote.query(QUERY));
    const inProcess = yield* encodeResult(yield* direct.query(QUERY));
    expect(overSocket).toEqual(inProcess);

    // Retirement: acknowledged over the wire, observed as the fiber's outcome,
    // and the socket file is gone — no residue for the next preflight.
    expect(yield* shutdownSearchDaemon(socketPath)).toBe(true);
    expect(yield* Fiber.join(daemon)).toBe('retired');
    expect(yield* fs.exists(socketPath)).toBe(false);
  }).pipe(Effect.provide(testLayer)),
);

it.scopedLive('retires itself after the idle window and removes crash residue first', () =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const dir = yield* fs.makeTempDirectoryScoped();
    const socketPath = `${dir}/daemon.sock`;

    // Crash residue: a file nothing answers on. The preflight must clear it
    // rather than concluding a daemon lives here.
    yield* fs.writeFileString(socketPath, 'stale');

    const daemon = yield* Effect.forkChild(
      runSearchDaemon({ socketPath, idleMillis: 400, pid: 7 }),
    );
    const status = yield* awaitDaemon(socketPath);
    expect(status.pid).toBe(7);

    expect(yield* Fiber.join(daemon)).toBe('idle');
    expect(yield* fs.exists(socketPath)).toBe(false);
  }).pipe(Effect.provide(testLayer)),
);

it.scopedLive('a second daemon on the same socket stands down', () =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const dir = yield* fs.makeTempDirectoryScoped();
    const socketPath = `${dir}/daemon.sock`;

    const first = yield* Effect.forkChild(
      runSearchDaemon({ socketPath, idleMillis: 60_000, pid: 1 }),
    );
    yield* awaitDaemon(socketPath);

    // The second sees a live daemon and exits without serving — and without
    // tearing down the first's socket on its way out.
    expect(yield* runSearchDaemon({ socketPath, idleMillis: 60_000, pid: 2 })).toBe(
      'already-running',
    );
    const status = yield* awaitDaemon(socketPath);
    expect(status.pid).toBe(1);

    yield* shutdownSearchDaemon(socketPath);
    expect(yield* Fiber.join(first)).toBe('retired');
  }).pipe(Effect.provide(testLayer)),
);
