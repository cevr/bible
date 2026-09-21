import type { Layer as LayerType } from "effect";
import { Context, Effect, Layer, Option, Semaphore, Stream } from "effect";
import type { Address } from "./contract.js";
import type { AnyImplementation, HostedInstance } from "./implement.js";
import { MailboxStore } from "./mailbox-store.js";
import type { QueryKey } from "./query.js";
import { UnknownQuery } from "./query.js";
import type { AnyQueryImplementation, QueryServing } from "./query-host.js";
import { make as makeQueryServing } from "./query-host.js";
import type { Refreshed, TransportService } from "./transport.js";
import { ActorTransport } from "./transport.js";
import type { RemoteFailure, Unauthorized } from "./vocabulary.js";
import { ContractMismatch, UnknownContract } from "./vocabulary.js";

export type Action = "read" | "send";

/**
 * Decides whether the caller may read or send to one address. The key is
 * part of the address, so a tenant-scoped key is enough to scope access.
 * The default allows everything; a real host must replace it.
 */
export interface AuthorizerService {
  readonly authorize: (address: Address, action: Action) => Effect.Effect<void, Unauthorized>;
}

export const Authorizer = Context.Reference<AuthorizerService>(
  "@effect-frame/actor/src/host/Authorizer",
  { defaultValue: () => ({ authorize: () => Effect.void }) },
);

export interface HostOptions<R> {
  readonly implementations: ReadonlyArray<AnyImplementation<R>>;
  /** The mailbox store for one address. Defaults to a fresh in-memory store. */
  readonly store: (address: Address) => LayerType.Layer<MailboxStore>;
  /**
   * PROTOTYPE (ticket #17). The queries this host serves. They are built
   * here and not in a layer beside this one, because a query handler reads
   * actors through this host's own transport: a second host would open a
   * second set of instances. Omit it and the host serves actors alone.
   */
  readonly queries?: ReadonlyArray<AnyQueryImplementation<R>>;
}

const addressKey = (address: Address) => `${address.contract}@${address.version}/${address.key}`;

const make = <R>(options: HostOptions<R>) =>
  Effect.gen(function* () {
    const hostScope = yield* Effect.scope;
    const context = yield* Effect.context<R>();
    const authorizer = yield* Authorizer;
    const lock = yield* Semaphore.make(1);
    const byName = new Map(
      options.implementations.map((implementation) => [
        implementation.contract.name,
        implementation,
      ]),
    );
    const instances = new Map<string, HostedInstance>();

    const lookup = (address: Address) =>
      Option.match(Option.fromNullishOr(byName.get(address.contract)), {
        onNone: () => Effect.fail(UnknownContract.make({ contract: address.contract })),
        onSome: (implementation) => {
          if (implementation.contract.version !== address.version) {
            return Effect.fail(
              ContractMismatch.make({
                contract: address.contract,
                expected: implementation.contract.version,
                actual: address.version,
              }),
            );
          }
          return Effect.succeed(implementation);
        },
      });

    const open = (address: Address, implementation: AnyImplementation<R>) =>
      Semaphore.withPermits(
        lock,
        1,
      )(
        Effect.gen(function* () {
          const key = addressKey(address);
          const existing = Option.fromNullishOr(instances.get(key));
          if (Option.isSome(existing)) {
            return existing.value;
          }
          // The host is the boundary: each instance gets the host's context.
          // oxlint-disable-next-line effect/noInlineProvide
          const instance = yield* Effect.provide(
            implementation.open(options.store(address), hostScope),
            context,
          );
          instances.set(key, instance);
          return instance;
        }),
      );

    const resolve = (
      address: Address,
      action: Action,
    ): Effect.Effect<HostedInstance, RemoteFailure> =>
      Effect.gen(function* () {
        const implementation = yield* lookup(address);
        yield* authorizer.authorize(address, action);
        return yield* open(address, implementation);
      });

    /**
     * The query half, once it exists. It is set after the transport object
     * is made, because the handlers read actors through that same transport.
     * One host, one knot, tied in one place.
     */
    let serving: Option.Option<QueryServing> = Option.none();

    /**
     * Single flight. The command has committed; now, in the same reply, the
     * host reads the caller's active queries that declared a dependency on
     * this contract. The scope is one command: only keys the caller sent,
     * only queries that name this contract. A refresh that fails answers
     * with its error, never with a failed command.
     */
    const refreshFor = (
      contractName: string,
      active: ReadonlyArray<QueryKey>,
    ): Effect.Effect<ReadonlyArray<Refreshed>> => {
      if (active.length === 0 || Option.isNone(serving)) {
        return Effect.succeed([]);
      }
      const query = serving.value;
      const stale = query.dependents(contractName, active);
      if (stale.length === 0) {
        return Effect.succeed([]);
      }
      return Effect.forEach(
        stale,
        (key) =>
          query.get(key).pipe(
            Effect.map((result): Refreshed => ({ _tag: "Refreshed", key, result })),
            Effect.catch((error) =>
              Effect.succeed<Refreshed>({ _tag: "RefreshFailed", key, error }),
            ),
          ),
        { concurrency: stale.length },
      );
    };

    const transport: TransportService = {
      send: (address, commandId, payload, active) =>
        Effect.flatMap(resolve(address, "send"), (instance) =>
          Effect.flatMap(instance.send(commandId, payload), (receipt) =>
            Effect.map(refreshFor(address.contract, active), (refreshed) => ({
              receipt,
              refreshed,
            })),
          ),
        ),
      call: (address, commandId, payload, timeout, active) =>
        Effect.flatMap(resolve(address, "send"), (instance) =>
          Effect.flatMap(instance.call(commandId, payload, timeout), (projection) =>
            Effect.map(refreshFor(address.contract, active), (refreshed) => ({
              projection,
              refreshed,
            })),
          ),
        ),
      snapshot: (address) =>
        Effect.flatMap(resolve(address, "read"), (instance) => instance.snapshot),
      query: (key) =>
        Option.match(serving, {
          onNone: () => Effect.fail(UnknownQuery.make({ query: key.query })),
          onSome: (query) => query.get(key),
        }),
      changes: (address, after) =>
        Stream.unwrap(Effect.map(resolve(address, "read"), (instance) => instance.changes(after))),
    };

    // Tie the knot: the handlers read actors through the transport above.
    const queries = Option.getOrElse(
      Option.fromNullishOr(options.queries),
      (): ReadonlyArray<AnyQueryImplementation<R>> => [],
    );
    if (queries.length > 0) {
      serving = Option.some(yield* makeQueryServing({ queries }, transport));
    }
    return transport;
  });

/**
 * Hosts implementations in this process and serves them as the transport.
 * The same layer works for a server and for a test that keeps the client
 * and the server in one runtime.
 */
export const layer = <R>(options: HostOptions<R>): LayerType.Layer<ActorTransport, never, R> =>
  Layer.effect(ActorTransport, make(options));

export const layerMemory = <R>(
  implementations: ReadonlyArray<AnyImplementation<R>>,
  queries?: ReadonlyArray<AnyQueryImplementation<R>>,
): LayerType.Layer<ActorTransport, never, R> =>
  layer({ implementations, queries, store: () => MailboxStore.layerMemory });
