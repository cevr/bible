import { Effect, Option, Schema, Stream, SubscriptionRef } from "effect";
import type { Address, AnyContract, KeyOf, MessageOf, SnapshotOf } from "./contract.js";
import type { QueryKey } from "./query.js";
import { QueryCache } from "./query-client.js";
import { fromSubscriptionRef, select } from "./source.js";
import type { Projection, Refreshed, TransportReadError } from "./transport.js";
import { ActorTransport } from "./transport.js";
import type { ActorRef, Applied, DurableCallOptions, DurableSendOptions } from "./vocabulary.js";

export type RemoteActorRef<C extends AnyContract> = ActorRef<SnapshotOf<C>, MessageOf<C>, "remote">;

export interface RefOptions<C extends AnyContract> {
  /**
   * A snapshot the client already holds, for example one rendered into the
   * page by the server. The reference starts from it and subscribes to the
   * revisions after it. `None` fetches the latest snapshot first.
   */
  readonly resume: Option.Option<Applied<SnapshotOf<C>>>;
}

const fetchInitial = <C extends AnyContract>(
  contract: C,
  address: Address,
  options: RefOptions<C>,
): Effect.Effect<Applied<SnapshotOf<C>>, TransportReadError, ActorTransport> =>
  Option.match(options.resume, {
    onSome: (resumed) => Effect.succeed(resumed),
    onNone: () =>
      Effect.gen(function* () {
        const transport = yield* ActorTransport;
        const projection = yield* transport.snapshot(address);
        return yield* decodeProjection(contract, projection);
      }),
  });

const decodeProjection = <C extends AnyContract>(
  contract: C,
  projection: Projection,
): Effect.Effect<Applied<SnapshotOf<C>>> =>
  Effect.map(
    Effect.orDie(Schema.decodeEffect(contract.snapshot)(projection.snapshot)),
    (state): Applied<SnapshotOf<C>> => ({ revision: projection.revision, state }),
  );

/** Revisions arrive from two paths (subscription and call); keep the newest. */
const newest = <A>(current: Applied<A>, next: Applied<A>): Applied<A> => {
  if (next.revision > current.revision) {
    return next;
  }
  return current;
};

/**
 * A client-side reference to an actor hosted elsewhere. The client holds the
 * contract, the key, and a transport. It never holds the behavior. `state`
 * is the latest snapshot the transport delivered; `applied` carries its
 * revision so a later reference can resume without a gap.
 */
export const ref = Effect.fn("Actor.ref")(function* <C extends AnyContract>(
  contract: C,
  key: KeyOf<C>,
  options: RefOptions<C> = { resume: Option.none() },
) {
  const transport = yield* ActorTransport;
  const encodedKey = yield* Effect.orDie(Schema.encodeEffect(contract.key)(key));
  const address: Address = { contract: contract.name, version: contract.version, key: encodedKey };
  const encodeMessage = Schema.encodeEffect(contract.message);

  const initial = yield* fetchInitial(contract, address, options);
  const applied = yield* SubscriptionRef.make(initial);

  yield* Effect.forkScoped(
    Stream.runForEach(transport.changes(address, initial.revision), (projection) =>
      Effect.flatMap(decodeProjection(contract, projection), (next) =>
        SubscriptionRef.update(applied, (current) => newest(current, next)),
      ),
    ),
  );

  /**
   * The caller's active query keys, read from the cache at command time.
   * A client with no cache declares none and the reply refreshes nothing:
   * the single-flight field is additive, never required.
   */
  const declareActive: Effect.Effect<ReadonlyArray<QueryKey>> = Effect.flatMap(
    Effect.serviceOption(QueryCache),
    (cache) =>
      Option.match(cache, {
        onNone: () => Effect.succeed<ReadonlyArray<QueryKey>>([]),
        onSome: (service) => service.active,
      }),
  );

  /**
   * Marks dependent entries stale as the command leaves, then accepts the
   * refreshed values the reply carried. The view shows stale content for
   * the whole round trip instead of a gap.
   */
  const settle = (refreshed: ReadonlyArray<Refreshed>) =>
    Effect.flatMap(Effect.serviceOption(QueryCache), (cache) =>
      Option.match(cache, {
        onNone: () => Effect.void,
        onSome: (service) => service.apply(refreshed),
      }),
    );

  const markDependentsStale = Effect.flatMap(Effect.serviceOption(QueryCache), (cache) =>
    Option.match(cache, {
      onNone: () => Effect.void,
      onSome: (service) => service.invalidate(contract.name),
    }),
  );

  const send = (message: MessageOf<C>, sendOptions: DurableSendOptions) =>
    Effect.gen(function* () {
      const payload = yield* Effect.orDie(encodeMessage(message));
      const active = yield* declareActive;
      yield* markDependentsStale;
      const result = yield* transport.send(address, sendOptions.commandId, payload, active);
      yield* settle(result.refreshed);
      return result.receipt;
    });

  const call = (message: MessageOf<C>, callOptions: DurableCallOptions) =>
    Effect.gen(function* () {
      const payload = yield* Effect.orDie(encodeMessage(message));
      const active = yield* declareActive;
      yield* markDependentsStale;
      const result = yield* transport.call(
        address,
        callOptions.commandId,
        payload,
        callOptions.timeout,
        active,
      );
      const next = yield* decodeProjection(contract, result.projection);
      yield* SubscriptionRef.update(applied, (current) => newest(current, next));
      yield* settle(result.refreshed);
      return next;
    });

  const appliedSource = fromSubscriptionRef(applied);
  const reference: RemoteActorRef<C> = {
    kind: "remote",
    applied: appliedSource,
    state: select(appliedSource, (committed) => committed.state),
    send,
    call,
  };
  return reference;
});
