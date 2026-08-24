/** The search daemon's wire surface: §9's query procedure plus daemon control.
 *
 *  A cold `bible egw search` pays ~10 seconds of model load before the first
 *  vector-leg answer. The daemon is that cost paid once: a detached process
 *  holds the loaded embedder and the parsed index, and every subsequent CLI
 *  invocation asks it over a unix socket instead of loading its own copy.
 *
 *  **`v1.search.query` is the same procedure the desktop MessagePort serves.**
 *  The daemon is a fourth host of §9's one wire codec, not a new protocol —
 *  reusing `SearchQueryProcedure` is what keeps "the daemon's answer" and
 *  "`bible egw search --json`" one value crossing two seams (§9.7).
 *
 *  The two daemon-control procedures are CLI-private vocabulary — no other
 *  host spawns or retires a daemon — which is why they live here rather than
 *  in `@bible/core/procedure`:
 *
 *  - `daemon.status` is the client's handshake: the fingerprint names the
 *    embedding model compiled into the daemon, and a client whose own
 *    `MODEL_FINGERPRINT` differs must not use the answers (§9.4's fingerprint
 *    gate, applied to a process boundary instead of a file).
 *  - `daemon.shutdown` retires a daemon deliberately — a stale-fingerprint
 *    survivor after an upgrade, or `bible egw daemon stop`.
 */

import { Schema } from 'effect';
import { Rpc, RpcGroup } from 'effect/unstable/rpc';

import { SearchQueryProcedure } from '@bible/core/procedure';

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

export const SearchDaemonGroup = RpcGroup.make(
  SearchQueryProcedure,
  SearchDaemonStatusRpc,
  SearchDaemonShutdownRpc,
);

/** Where the daemon listens. Beside the corpora in `~/.bible` because the
 *  socket is per-user state exactly as they are — and the path stays well
 *  under the 104-byte `sun_path` limit macOS imposes. */
export const searchDaemonSocketPath = (home: string): string => `${home}/.bible/search-daemon.sock`;
