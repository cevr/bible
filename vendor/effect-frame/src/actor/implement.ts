import type { Duration } from "effect";
import { Effect, Layer, Schema, Scope, Stream } from "effect";
import type { Behavior } from "./behavior.js";
import type { AnyContract, MessageOf, SnapshotOf } from "./contract.js";
import { durable } from "./durable.js";
import type { MailboxStore } from "./mailbox-store.js";
import type { Projection } from "./transport.js";
import type {
  ActorStopped,
  CommandConflict,
  CommandId,
  DurableReceipt,
  Uncertain,
} from "./vocabulary.js";

/** Marker for the import-boundary test: this string must never reach a client bundle. */
export const serverOnly = "effect-frame/actor:server-only";

/**
 * The server half of a contract: the behavior that gives its messages
 * meaning, the codec that persists its private state, and the projection
 * from private state to the public snapshot.
 */
export interface ActorImplementation<C extends AnyContract, State, R> {
  readonly contract: C;
  readonly behavior: Behavior<State, MessageOf<C>, R>;
  readonly state: Schema.Codec<State, string>;
  readonly snapshot: (state: State) => SnapshotOf<C>;
  /** Opens one instance over the given store, owned by the given scope. Type-erased for hosts. */
  readonly open: OpenInstance<R>;
}

export type OpenInstance<R> = (
  store: Layer.Layer<MailboxStore>,
  scope: Scope.Scope,
) => Effect.Effect<HostedInstance, never, R>;

/**
 * One running instance as a host sees it: encoded strings in, encoded
 * strings out. The implementation owns every codec.
 */
export interface HostedInstance {
  readonly send: (
    commandId: CommandId,
    payload: string,
  ) => Effect.Effect<DurableReceipt, ActorStopped | CommandConflict>;
  readonly call: (
    commandId: CommandId,
    payload: string,
    timeout: Duration.Input,
  ) => Effect.Effect<Projection, ActorStopped | CommandConflict | Uncertain>;
  readonly snapshot: Effect.Effect<Projection>;
  readonly changes: (after: number) => Stream.Stream<Projection>;
}

/** Any implementation whose requirements are `R`. Hosts accept this. */
export interface AnyImplementation<R> {
  readonly contract: AnyContract;
  readonly open: OpenInstance<R>;
}

const openInstance =
  <C extends AnyContract, State, R>(
    options: ImplementOptions<C, State, R>,
    contract: C,
  ): OpenInstance<R> =>
  (store, scope) =>
    // The store's resources must live exactly as long as the instance, so the
    // layer is built into the owning scope instead of a scope of its own.
    Effect.flatMap(Layer.buildWithScope(store, scope), (services) =>
      openWith(options, contract, scope).pipe(Effect.provideContext(services)),
    );

const openWith = <C extends AnyContract, State, R>(
  options: ImplementOptions<C, State, R>,
  contract: C,
  scope: Scope.Scope,
): Effect.Effect<HostedInstance, never, R | MailboxStore> =>
  Effect.gen(function* () {
    const actor = yield* durable({
      behavior: options.behavior,
      state: options.state,
      message: contract.message,
    });
    const encodeSnapshot = Schema.encodeEffect(contract.snapshot);
    const project = (committed: { readonly revision: number; readonly state: State }) =>
      Effect.map(
        Effect.orDie(encodeSnapshot(options.snapshot(committed.state))),
        (snapshot): Projection => ({ revision: committed.revision, snapshot }),
      );
    const decodeMessage = Schema.decodeEffect(contract.message);
    const instance: HostedInstance = {
      send: (commandId, payload) =>
        Effect.flatMap(Effect.orDie(decodeMessage(payload)), (message) =>
          actor.send(message, { commandId }),
        ),
      call: (commandId, payload, timeout) =>
        Effect.flatMap(Effect.orDie(decodeMessage(payload)), (message) =>
          Effect.flatMap(actor.call(message, { commandId, timeout }), project),
        ),
      snapshot: Effect.flatMap(actor.applied.get, project),
      changes: (after) =>
        Stream.mapEffect(
          Stream.filter(actor.applied.changes, (committed) => committed.revision > after),
          project,
        ),
    };
    return instance;
  }).pipe(Effect.provideService(Scope.Scope, scope));

export interface ImplementOptions<C extends AnyContract, State, R> {
  readonly behavior: Behavior<State, MessageOf<C>, R>;
  readonly state: Schema.Codec<State, string>;
  readonly snapshot: (state: State) => SnapshotOf<C>;
}

export const implement = <C extends AnyContract, State, R = never>(
  contract: C,
  options: ImplementOptions<C, State, R>,
): ActorImplementation<C, State, R> => ({
  contract,
  behavior: options.behavior,
  state: options.state,
  snapshot: options.snapshot,
  open: openInstance(options, contract),
});

/**
 * The common case: the snapshot is the state and both share one schema.
 */
export const implementTransparent = <C extends AnyContract, R = never>(
  contract: C,
  behavior: Behavior<SnapshotOf<C>, MessageOf<C>, R>,
): ActorImplementation<C, SnapshotOf<C>, R> =>
  implement(contract, { behavior, state: contract.snapshot, snapshot: (state) => state });
