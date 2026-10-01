/** The search daemon's wire surface: the one search query plus daemon control.
 *
 *  A cold `bible egw search` pays ~10 seconds of model load before the first
 *  vector-leg answer. The daemon is that cost paid once: a detached process
 *  holds the loaded embedder and the parsed index, and every subsequent CLI
 *  invocation asks it over a unix socket instead of loading its own copy.
 *
 *  **`search.query` carries `SearchQuery` itself and answers `SearchResult`.**
 *  The daemon is a transport for the same `SearchService` the CLI calls
 *  in-process, so the request is the service's own input rather than a second,
 *  hand-projected payload: every narrowing the caller sets — scope, book,
 *  limit, the whole classification filter — crosses the socket because the
 *  value does, and "the daemon's answer" and "the in-process answer" stay one
 *  value.
 *
 *  - `daemon.status` is the client's handshake: the fingerprint names the
 *    embedding model compiled into the daemon *and* this wire's version, and a
 *    client whose own fingerprint differs must not use the answers (§9.4's
 *    fingerprint gate, applied to a process boundary instead of a file). A
 *    daemon left running by a build that spoke an older wire is therefore
 *    retired and respawned rather than asked a question it cannot decode.
 *  - `daemon.shutdown` retires a daemon deliberately — a stale-fingerprint
 *    survivor after an upgrade, or `bible egw daemon stop`.
 */

import { MODEL_FINGERPRINT, SearchQuery, SearchResult } from '@bible/core/search';
import { Schema } from 'effect';
import { Rpc, RpcGroup } from 'effect/rpc';

/** Bumped whenever a request or response shape on this socket changes.
 *
 *  2: `search.query` carries `SearchQuery` (it was `v1.search.query`, the
 *  deleted reader RPC's flattened payload). */
const SEARCH_DAEMON_WIRE = 2;

/** What the client gates on and the daemon reports: the embedding model and
 *  the wire, so either changing retires a running daemon. */
export const DAEMON_FINGERPRINT = `${MODEL_FINGERPRINT}+wire.${String(SEARCH_DAEMON_WIRE)}`;

export class SearchDaemonStatus extends Schema.Class<SearchDaemonStatus>(
  'cli/egw/SearchDaemonStatus',
)({
  /** The daemon process id — what `bible egw daemon stop` reports. */
  pid: Schema.Int,
  /** The embedding-model fingerprint compiled into the daemon. A client with a
   *  different fingerprint treats the daemon as absent and retires it. */
  fingerprint: Schema.NonEmptyString,
}) {}

export const SearchDaemonStatusRpc = Rpc.make('daemon.status', {
  success: SearchDaemonStatus,
});

/** Fire-and-forget retirement: the daemon acknowledges, then exits. */
export const SearchDaemonShutdownRpc = Rpc.make('daemon.shutdown', {});

/** The query, answered by the daemon's `SearchService`. It does not fail:
 *  every leg degrades, and the vector leg's degradation is a typed field on
 *  the result rather than an error. */
export const SearchQueryRpc = Rpc.make('search.query', {
  payload: SearchQuery,
  success: SearchResult,
});

export const SearchDaemonGroup = RpcGroup.make(
  SearchQueryRpc,
  SearchDaemonStatusRpc,
  SearchDaemonShutdownRpc,
);

/** Where the daemon listens. Beside the corpora in `~/.bible` because the
 *  socket is per-user state exactly as they are — and the path stays well
 *  under the 104-byte `sun_path` limit macOS imposes. */
export const searchDaemonSocketPath = (home: string): string => `${home}/.bible/search-daemon.sock`;
