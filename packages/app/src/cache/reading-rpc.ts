/**
 * The reading cache: `AtomRpc` over `BibleProcedureGroup`.
 *
 * `AtomRpc.Service` derives one query-atom family and one mutation-atom family
 * per procedure straight from the RPC group, so per-input memoisation,
 * in-flight deduplication, idle eviction and refresh-on-invalidate are the
 * platform's, not this app's. What the app still owns is *which* keys a query
 * covers and a mutation touches; that derivation lives in `./reactivity-keys`.
 *
 * The RPC client is not built here. Each host starts its own transport and
 * negotiates the runtime handshake through `ProcedureHost` before the Solid
 * root mounts, so the finished client is handed to the atom runtime through
 * {@link procedureClientAtom}, seeded once per registry by the provider. That
 * keeps the host contract — start a transport, hand back a live client —
 * exactly as it was.
 */

import { BibleProcedureGroup } from '@bible/core/procedure';
import { Context, Effect, Layer } from 'effect';
import * as Atom from 'effect/unstable/reactivity/Atom';
import * as AtomRpc from 'effect/unstable/reactivity/AtomRpc';
import type * as RpcClient from 'effect/unstable/rpc/RpcClient';
import type { RpcClientError } from 'effect/unstable/rpc/RpcClientError';
import type { RpcGroup } from 'effect/unstable/rpc';

type ReadingRpcs = RpcGroup.Rpcs<typeof BibleProcedureGroup>;

/**
 * The flattened client `AtomRpc` calls: one function taking a procedure tag
 * and its payload. `AtomRpc` builds this shape itself when it owns the
 * transport; here the host owns it, so the type is named to hand one over.
 */
export type ProcedureClient = RpcClient.RpcClient.Flat<ReadingRpcs, RpcClientError>;

/**
 * The seam between the host's started transport and the atom runtime. The
 * runtime resolves it as an ordinary service, so nothing downstream knows the
 * client arrived from outside.
 */
export class ProcedureClientService extends Context.Service<
  ProcedureClientService,
  ProcedureClient
>()('@bible/app/cache/ProcedureClient') {}

/**
 * Holds the host's client for one registry. The provider seeds it with
 * `useAtomInitialValues` before any query atom is read; a registry that is
 * used without seeding has no transport at all, which is a wiring defect
 * rather than a runtime state to handle.
 */
export const procedureClientAtom = Atom.make<ProcedureClient>(() =>
  Effect.runSync(Effect.die('the reading cache was read before its procedure client was provided')),
);

/**
 * The query and mutation atom families for every procedure in the group.
 *
 * The four type arguments are written out because `AtomRpc.Service` infers
 * its client-requirement parameter from the protocol layer it builds, and this
 * service supplies the client instead of building one.
 */
export class ReadingRpc extends AtomRpc.Service<ReadingRpc>()<
  '@bible/app/cache/ReadingRpc',
  ReadingRpcs,
  never,
  ProcedureClientService
>('@bible/app/cache/ReadingRpc', {
  group: BibleProcedureGroup,
  makeEffect: Effect.map(ProcedureClientService, (client) => client),
  protocol: (get) => Layer.succeed(ProcedureClientService, get(procedureClientAtom)),
}) {}
