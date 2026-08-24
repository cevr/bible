/** The CLI side of the search daemon: probe, retire, spawn, and the
 *  `SearchService` facade that forwards queries over the socket.
 *
 *  Everything here degrades to "no daemon": the probe answers `None` for a
 *  missing socket, a dead one, a wedged one (bounded by a timeout), and a
 *  daemon compiled against a different embedding model. The caller's fallback
 *  is always the in-process search it would have run anyway, so no failure in
 *  this file may surface as an error — only as the slower path.
 */

import { MODEL_FINGERPRINT, SearchService, type SearchQuery } from '@bible/core/search';
import { BunSocket } from '@effect/platform-bun';
import { Effect, Layer, Option, Schema } from 'effect';
import { ChildProcess, ChildProcessSpawner } from 'effect/unstable/process';
import { RpcClient, RpcSerialization } from 'effect/unstable/rpc';

import { selfInvocation } from '../../lib/paths.js';
import { SearchDaemonGroup, type SearchDaemonStatus } from './search-daemon-protocol.js';

/** Client protocol stack for one socket path. Fresh per use — a probe and the
 *  long-lived facade must not share a connection, because the probe's scope
 *  closes when the probe answers. */
const clientProtocol = (socketPath: string) =>
  RpcClient.layerProtocolSocket().pipe(
    Layer.provide(BunSocket.layerNet({ path: socketPath })),
    Layer.provide(RpcSerialization.layerNdjson),
  );

/** How long the probe waits before declaring the daemon absent. Generous for
 *  a unix-socket round trip, tiny beside the ~10s in-process cold start it
 *  gates. */
const PROBE_TIMEOUT_MILLIS = 1500;

/** Asks a possibly-running daemon who it is. `None` means "behave as if no
 *  daemon exists": nothing listens on the socket, nothing answered in time,
 *  or the answer failed to decode. */
export const probeSearchDaemon = (
  socketPath: string,
): Effect.Effect<Option.Option<SearchDaemonStatus>> =>
  Effect.gen(function* () {
    const client = yield* RpcClient.make(SearchDaemonGroup);
    return yield* client['daemon.status']();
  }).pipe(
    Effect.scoped,
    Effect.provide(clientProtocol(socketPath)),
    Effect.timeout(PROBE_TIMEOUT_MILLIS),
    Effect.option,
  );

/** Asks a running daemon to exit. `true` when the daemon acknowledged;
 *  `false` when nothing (responsive) listens there. */
export const shutdownSearchDaemon = (socketPath: string): Effect.Effect<boolean> =>
  Effect.gen(function* () {
    const client = yield* RpcClient.make(SearchDaemonGroup);
    yield* client['daemon.shutdown']();
    return true;
  }).pipe(
    Effect.scoped,
    Effect.provide(clientProtocol(socketPath)),
    Effect.timeout(PROBE_TIMEOUT_MILLIS),
    Effect.orElseSucceed(() => false),
  );

/** The daemon-backed `SearchService`: §9's `query`, answered over the socket.
 *
 *  The connection lives as long as the surrounding scope — for the CLI that
 *  is the one command invocation, so "connect once, query, disconnect" is the
 *  shape this produces. Errors after a successful probe are defects rather
 *  than a silent re-degrade: the contract `SearchService.query` carries is
 *  "never fails", and a daemon that died between probe and query is a broken
 *  invariant worth seeing, not a state to paper over. */
export const searchDaemonClientLayer = (socketPath: string): Layer.Layer<SearchService> =>
  Layer.effect(
    SearchService,
    Effect.gen(function* () {
      const client = yield* RpcClient.make(SearchDaemonGroup);
      return SearchService.of({
        query: (input: SearchQuery) =>
          client['v1.search.query']({
            text: input.text,
            scope: Option.getOrUndefined(input.scope),
            bookCode: Option.getOrUndefined(input.bookCode),
            limit: Option.getOrUndefined(input.limit),
          }).pipe(Effect.orDie),
      });
    }),
  ).pipe(
    Layer.provide(clientProtocol(socketPath)),
    // The probe just answered on this socket; a connection that fails in the
    // instant between probe and use is a broken invariant, not a state.
    Layer.orDie,
  );

export class SearchDaemonSpawnError extends Schema.TaggedError<SearchDaemonSpawnError>()(
  'SearchDaemonSpawnError',
  { message: Schema.String },
) {}

/** Starts a daemon and lets go of it.
 *
 *  `detached` puts the child in its own process group and `unref` is what
 *  makes the spawner's scoped release *skip* the kill — an unrefed handle is
 *  released as-is, so the daemon outlives this CLI invocation. Stdio is
 *  discarded: the daemon's channel back to users is its socket, not a pipe
 *  into a parent that exits milliseconds later. */
export const spawnSearchDaemon: Effect.Effect<
  void,
  SearchDaemonSpawnError,
  ChildProcessSpawner.ChildProcessSpawner
> = Effect.gen(function* () {
  const spawner = yield* ChildProcessSpawner.ChildProcessSpawner;
  const self = selfInvocation();
  const handle = yield* spawner.spawn(
    ChildProcess.make(self.command, [...self.args, 'egw', 'daemon'], {
      detached: true,
      stdin: 'ignore',
      stdout: 'ignore',
      stderr: 'ignore',
    }),
  );
  const _reref = yield* handle.unref;
}).pipe(
  Effect.scoped,
  Effect.mapError(
    (cause) => new SearchDaemonSpawnError({ message: `daemon spawn failed: ${String(cause)}` }),
  ),
);

/** Re-exported so the one fingerprint the client gates on is visibly the one
 *  the daemon reports. */
export const CLIENT_FINGERPRINT = MODEL_FINGERPRINT;
