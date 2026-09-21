import type { Duration } from "effect";
import {
  Context,
  Deferred,
  Effect,
  Hash,
  Option,
  PubSub,
  Queue,
  Ref,
  Schema,
  Scope,
  Stream,
  SubscriptionRef,
} from "effect";
import type { ActorRef, Applied, CommandId, DurableReceipt } from "./vocabulary.js";
import { ActorStopped, Uncertain } from "./vocabulary.js";
import type { Behavior } from "./behavior.js";
import type { PendingCommand, StoredReceipt } from "./mailbox-store.js";
import { MailboxStore } from "./mailbox-store.js";
import { fromSubscriptionRef, select } from "./source.js";

export interface DurableOptions<State, Message, R> {
  readonly behavior: Behavior<State, Message, R>;
  /** Encodes the state to the string the mailbox stores. */
  readonly state: Schema.Codec<State, string>;
  /** Encodes a message to the string the mailbox stores. */
  readonly message: Schema.Codec<Message, string>;
}

type Wake<State> =
  | { readonly _tag: "Admitted" }
  | { readonly _tag: "Autonomous"; readonly state: State };

export interface DurableHostSettings {
  /** How long `call` sleeps between receipt polls when no early wake arrives. */
  readonly pollInterval: Duration.Input;
}

/**
 * Host tuning for durable actors. A host adapter supplies it. Application
 * code does not see it. The default suits an in-process store.
 */
export const DurableHostConfig = Context.Reference<DurableHostSettings>(
  "effect-frame/src/actor/durable/DurableHostConfig",
  { defaultValue: () => ({ pollInterval: "100 millis" }) },
);

/**
 * Spawn a durable actor over the `MailboxStore` in context. On start it
 * restores the committed state, then drains every pending command in
 * admission order before it waits for new ones. Each command commits its
 * next state and receipt in one store step before anyone observes it.
 */
export const durable = Effect.fn("Actor.durable")(function* <State, Message, R>(
  options: DurableOptions<State, Message, R>,
) {
  const store = yield* MailboxStore;
  const host = yield* DurableHostConfig;
  const encodeState = Schema.encodeEffect(options.state);
  const decodeState = Schema.decodeEffect(options.state);
  const encodeMessage = Schema.encodeEffect(options.message);
  const decodeMessage = Schema.decodeEffect(options.message);

  const restored = yield* Effect.flatMap(store.latest, (latest) =>
    Option.match(latest, {
      onNone: () =>
        Effect.succeed<Applied<State>>({ revision: 0, state: options.behavior.initial }),
      onSome: (committed) =>
        Effect.map(Effect.orDie(decodeState(committed.state)), (state): Applied<State> => ({
          revision: committed.revision,
          state,
        })),
    }),
  );

  const turn = yield* options.behavior.open(restored.state);
  const applied = yield* SubscriptionRef.make(restored);
  const closed = yield* Deferred.make<never, ActorStopped>();
  const signal = yield* Queue.unbounded<Wake<State>>();
  const wake = yield* PubSub.unbounded<StoredReceipt>();
  // The behavior may emit the state it opened with. That is not a change:
  // seed the dedupe with the encoded state the actor started from, so a
  // fresh machine does not spend a revision on its initial state and a
  // recovered one does not spend a revision on the state it restored.
  const lastEncoded = yield* Ref.make(
    Option.some(yield* Effect.orDie(encodeState(restored.state))),
  );

  const processCommand = Effect.fn("Actor.durable.processCommand")(function* (
    command: PendingCommand,
  ) {
    const message = yield* Effect.orDie(decodeMessage(command.payload));
    const current = yield* SubscriptionRef.get(applied);
    const next = yield* turn.apply(current.state, message);
    const encoded = yield* Effect.orDie(encodeState(next));
    const receipt = yield* store.commit(command.commandId, encoded);
    yield* Ref.set(lastEncoded, Option.some(encoded));
    yield* SubscriptionRef.set(applied, { revision: receipt.revision, state: next });
    yield* PubSub.publish(wake, receipt);
  });

  const processAutonomous = Effect.fn("Actor.durable.processAutonomous")(function* (
    changed: State,
  ) {
    const encoded = yield* Effect.orDie(encodeState(changed));
    const previous = yield* Ref.get(lastEncoded);
    if (Option.isSome(previous) && previous.value === encoded) {
      return;
    }
    const committed = yield* store.advance(encoded);
    yield* Ref.set(lastEncoded, Option.some(encoded));
    yield* SubscriptionRef.set(applied, { revision: committed.revision, state: changed });
  });

  /** Drain every pending command in admission order, then wait for a wake. */
  const processNext = Effect.fn("Actor.durable.process")(function* () {
    const pending = yield* store.next;
    if (Option.isSome(pending)) {
      yield* processCommand(pending.value);
      return;
    }
    const woken = yield* Queue.take(signal);
    if (woken._tag === "Autonomous") {
      yield* processAutonomous(woken.state);
    }
  });

  yield* Effect.addFinalizer(() => Deferred.fail(closed, ActorStopped.make()));
  yield* Effect.forkScoped(Effect.forever(processNext()));
  yield* Effect.forkScoped(
    Stream.runForEach(turn.changes, (changed) =>
      Queue.offer(signal, { _tag: "Autonomous", state: changed }),
    ),
  );

  const toApplied = Effect.fn("Actor.durable.toApplied")(function* (receipt: StoredReceipt) {
    const decoded = yield* Effect.orDie(decodeState(receipt.state));
    return { revision: receipt.revision, state: decoded } satisfies Applied<State>;
  });

  const send = Effect.fn("Actor.durable.send")(function* (
    message: Message,
    sendOptions: { readonly commandId: CommandId },
  ) {
    const isClosed = yield* Deferred.isDone(closed);
    if (isClosed) {
      return yield* ActorStopped.make();
    }
    const payload = yield* Effect.orDie(encodeMessage(message));
    const appended = yield* store.append({
      commandId: sendOptions.commandId,
      payload,
      payloadHash: Hash.string(payload),
    });
    if (appended._tag === "Admitted") {
      yield* Queue.offer(signal, { _tag: "Admitted" });
      return {
        commandId: sendOptions.commandId,
        admitted: appended.admitted,
        committed: Option.none(),
      } satisfies DurableReceipt;
    }
    return {
      commandId: sendOptions.commandId,
      admitted: appended.admitted,
      committed: Option.map(appended.receipt, (receipt) => receipt.revision),
    } satisfies DurableReceipt;
  });

  const awaitReceipt = Effect.fn("Actor.durable.awaitReceipt")(function* (
    commandId: CommandId,
    subscription: PubSub.Subscription<StoredReceipt>,
  ) {
    const poll = Effect.fn("Actor.durable.poll")(function* () {
      const stored = yield* store.receipt(commandId);
      if (Option.isSome(stored)) {
        return stored;
      }
      yield* Effect.raceFirst(PubSub.take(subscription), Effect.sleep(host.pollInterval));
      return Option.none<StoredReceipt>();
    });
    const found = yield* Effect.repeat(poll(), { until: Option.isSome });
    return yield* Option.match(found, {
      onNone: () => Effect.die("Actor.durable.awaitReceipt: repeat ended without a receipt"),
      onSome: Effect.succeed,
    });
  });

  const call = Effect.fn("Actor.durable.call")(function* (
    message: Message,
    callOptions: { readonly commandId: CommandId; readonly timeout: Duration.Input },
  ) {
    const wait = Effect.scopedWith((scope: Scope.Scope) =>
      Effect.gen(function* () {
        const subscription = yield* PubSub.subscribe(wake).pipe(Scope.provide(scope));
        yield* send(message, { commandId: callOptions.commandId });
        return yield* awaitReceipt(callOptions.commandId, subscription);
      }),
    );
    const outcome = yield* Effect.raceFirst(
      Effect.timeoutOption(wait, callOptions.timeout),
      Deferred.await(closed),
    );
    if (Option.isNone(outcome)) {
      return yield* Uncertain.make({ commandId: callOptions.commandId });
    }
    return yield* toApplied(outcome.value);
  });

  const appliedSource = fromSubscriptionRef(applied);
  const ref: ActorRef<State, Message, "durable"> = {
    kind: "durable",
    applied: appliedSource,
    state: select(appliedSource, (committed) => committed.state),
    send,
    call,
  };
  return ref;
});
