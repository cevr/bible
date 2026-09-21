import type { Duration, Effect, Stream } from "effect";
import { Context } from "effect";
import type { Address } from "./contract.js";
import type { QueryFailure, QueryKey } from "./query.js";
import type {
  ActorStopped,
  CommandConflict,
  CommandId,
  DurableReceipt,
  RemoteFailure,
  Uncertain,
} from "./vocabulary.js";

/** One committed revision with the encoded snapshot it produced. */
export interface Projection {
  readonly revision: number;
  readonly snapshot: string;
}

/**
 * One refreshed query value in a command reply (#17).
 * A refresh that failed carries its error: the command already committed,
 * so a bad read must not undo it.
 */
export type Refreshed =
  | { readonly _tag: "Refreshed"; readonly key: QueryKey; readonly result: string }
  | { readonly _tag: "RefreshFailed"; readonly key: QueryKey; readonly error: QueryFailure };

/** A receipt with the single-flight refreshes the command earned. */
export interface ReceiptWithRefresh {
  readonly receipt: DurableReceipt;
  readonly refreshed: ReadonlyArray<Refreshed>;
}

/** A projection with the single-flight refreshes the command earned. */
export interface ProjectionWithRefresh {
  readonly projection: Projection;
  readonly refreshed: ReadonlyArray<Refreshed>;
}

export type TransportSendError = ActorStopped | CommandConflict | RemoteFailure;
export type TransportCallError = TransportSendError | Uncertain;
export type TransportReadError = ActorStopped | RemoteFailure;
/**
 * A query has no address, so the address-shaped remote failures cannot
 * apply. `QueryFailure` already carries `Unauthorized` and `Unreachable`.
 */
export type TransportQueryError = QueryFailure;

/**
 * The wire between a remote reference and the process that hosts the actor.
 * Every payload is an encoded string; the contract owns the codecs. The
 * client side of this service is safe for a browser. A host provides it.
 */
export interface TransportService {
  /**
   * `active` is the caller's cache, read at command time: the query keys it
   * is showing. The reply refreshes the ones that depend on this actor's
   * contract. An empty array asks for no refresh and costs nothing.
   */
  readonly send: (
    address: Address,
    commandId: CommandId,
    payload: string,
    active: ReadonlyArray<QueryKey>,
  ) => Effect.Effect<ReceiptWithRefresh, TransportSendError>;
  readonly call: (
    address: Address,
    commandId: CommandId,
    payload: string,
    timeout: Duration.Input,
    active: ReadonlyArray<QueryKey>,
  ) => Effect.Effect<ProjectionWithRefresh, TransportCallError>;
  readonly snapshot: (address: Address) => Effect.Effect<Projection, TransportReadError>;
  /** Reads one query value. The host resolves the policy before the handler runs. */
  readonly query: (key: QueryKey) => Effect.Effect<string, TransportQueryError>;
  /**
   * Every revision after `after`, in order, starting with the latest one if
   * it is newer than `after`. A client resumes with the revision it holds.
   */
  readonly changes: (
    address: Address,
    after: number,
  ) => Stream.Stream<Projection, TransportReadError>;
}

export class ActorTransport extends Context.Service<ActorTransport, TransportService>()(
  "effect-frame/src/actor/transport/ActorTransport",
) {}
