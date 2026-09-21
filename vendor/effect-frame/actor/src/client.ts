/**
 * The browser-safe entry. Everything here may ship to a client: contracts,
 * vocabulary, local actors and behaviors, remote references, and the
 * transport service interface. Nothing here imports a store or a host.
 * `tests/boundary.test.ts` builds this file and checks that promise.
 */
export * as Behavior from "./behavior.js";
export { Value } from "./behavior.js";
export type { SetValue, Turn } from "./behavior.js";
export { modify, spawn, type LocalActorRef } from "./actor.js";
export * from "./vocabulary.js";
export {
  contract,
  resumeCodec,
  type ActorContract,
  type Address,
  type AnyContract,
  type ContractOptions,
  type KeyOf,
  type MessageOf,
  type Pure,
  type SnapshotOf,
} from "./contract.js";
export { ref, type RefOptions, type RemoteActorRef } from "./ref.js";
// The Query primitive's client half (#17, #28).
export {
  Failed,
  Loading,
  PolicyMissing,
  QueryFailed,
  QueryVersionMismatch,
  Ready,
  UnknownQuery,
  canonicalize,
  keyOf,
  markStale,
  query,
  type AnyQuery,
  type ArgsOf,
  type QueryContract,
  type QueryFailure,
  type QueryKey,
  type QueryOptions,
  type QueryState,
  type ResultOf,
} from "./query.js";
export {
  QueryCache,
  followQuery,
  useQuery,
  layer as queryCacheLayer,
  type FollowedQuery,
  type QueryCacheService,
  type QueryEntry,
} from "./query-client.js";
export {
  ActorTransport,
  type Projection,
  type ProjectionWithRefresh,
  type ReceiptWithRefresh,
  type Refreshed,
  type TransportCallError,
  type TransportQueryError,
  type TransportReadError,
  type TransportSendError,
  type TransportService,
} from "./transport.js";
export * as HttpTransport from "./http/client.js";
export * as Wire from "./http/wire.js";
export { select, type Source } from "./source.js";
