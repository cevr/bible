import type { Duration, Effect, Option } from "effect";
import { Schema } from "effect";
import type { Source } from "./source.js";

// ---------------------------------------------------------------------------
// Vocabulary
// ---------------------------------------------------------------------------

export const CommandId = Schema.String.pipe(Schema.brand("CommandId"));
export type CommandId = Schema.Schema.Type<typeof CommandId>;

/** The actor stopped before it processed the message. */
export class ActorStopped extends Schema.TaggedError<ActorStopped>()("ActorStopped", {}) {}

/** The same command ID arrived with a different payload. */
export class CommandConflict extends Schema.TaggedError<CommandConflict>()("CommandConflict", {
  commandId: CommandId,
}) {}

/**
 * The wait ended before a receipt arrived. The command may still commit.
 * Retry with the same command ID.
 */
export class Uncertain extends Schema.TaggedError<Uncertain>()("Uncertain", {
  commandId: CommandId,
}) {}

/** The result of one processed message. `revision` is the actor's monotonic clock. */
export interface Applied<State> {
  readonly revision: number;
  readonly state: State;
}

/** Acceptance of a local message. `admitted` is the mailbox admission order. */
export interface Admitted {
  readonly admitted: number;
}

/**
 * Acceptance of a durable command. `committed` is present when the mailbox
 * already holds a receipt for this command ID.
 */
export interface DurableReceipt {
  readonly commandId: CommandId;
  readonly admitted: number;
  readonly committed: Option.Option<number>;
}

/** The caller may not act on this actor. Raised by the transport, never locally. */
export class Unauthorized extends Schema.TaggedError<Unauthorized>()("Unauthorized", {
  contract: Schema.String,
}) {}

/** No implementation is registered for this contract name. */
export class UnknownContract extends Schema.TaggedError<UnknownContract>()("UnknownContract", {
  contract: Schema.String,
}) {}

/** The client and server contracts differ in version. */
export class ContractMismatch extends Schema.TaggedError<ContractMismatch>()("ContractMismatch", {
  contract: Schema.String,
  expected: Schema.Finite,
  actual: Schema.Finite,
}) {}

/** The host could not be reached or answered outside the protocol. */
export class Unreachable extends Schema.TaggedError<Unreachable>()("Unreachable", {
  reason: Schema.String,
}) {}

/** Failures only a transport can raise. */
export type RemoteFailure = Unauthorized | ContractMismatch | UnknownContract | Unreachable;

/**
 * `local`: same process, no mailbox store. `durable`: this process over a
 * mailbox store. `remote`: another process reached through a transport.
 */
export type ActorKind = "local" | "durable" | "remote";

export interface DurableSendOptions {
  readonly commandId: CommandId;
}

export interface DurableCallOptions extends DurableSendOptions {
  readonly timeout: Duration.Input;
}

export interface SendOptions {
  readonly local: void;
  readonly durable: DurableSendOptions;
  readonly remote: DurableSendOptions;
}

export interface Receipt {
  readonly local: Admitted;
  readonly durable: DurableReceipt;
  readonly remote: DurableReceipt;
}

export interface SendError {
  readonly local: ActorStopped;
  readonly durable: ActorStopped | CommandConflict;
  readonly remote: ActorStopped | CommandConflict | RemoteFailure;
}

export interface CallOptions {
  readonly local: void;
  readonly durable: DurableCallOptions;
  readonly remote: DurableCallOptions;
}

export interface CallError {
  readonly local: ActorStopped;
  readonly durable: ActorStopped | CommandConflict | Uncertain;
  readonly remote: ActorStopped | CommandConflict | Uncertain | RemoteFailure;
}

/**
 * One reference type for local and durable actors. `Kind` selects the
 * receipt, option, and error types, so placement is visible in the type and
 * a durable reference cannot be called without a command ID and a timeout.
 */
export interface ActorRef<State, Message, Kind extends ActorKind> {
  readonly kind: Kind;
  /** Every committed revision with the state it produced. */
  readonly applied: Source<Applied<State>>;
  /** The latest observed state. A projection of `applied`. */
  readonly state: Source<State>;
  readonly send: (
    message: Message,
    options: SendOptions[Kind],
  ) => Effect.Effect<Receipt[Kind], SendError[Kind]>;
  readonly call: (
    message: Message,
    options: CallOptions[Kind],
  ) => Effect.Effect<Applied<State>, CallError[Kind]>;
}
