import { Deferred, Effect, Equal, Function, Queue, Ref, Stream, SubscriptionRef } from "effect";
import type { Behavior, SetValue } from "./behavior.js";
import { Value } from "./behavior.js";
import { fromSubscriptionRef, select } from "./source.js";
import type { ActorRef, Admitted, Applied } from "./vocabulary.js";
import { ActorStopped } from "./vocabulary.js";

// ---------------------------------------------------------------------------
// Local actor
// ---------------------------------------------------------------------------

interface MessageEnvelope<State, Message> {
  readonly _tag: "Message";
  /** Computes the message inside the turn, from the state the turn sees. */
  readonly derive: (state: State) => Message;
  readonly reply: Deferred.Deferred<Applied<State>>;
}

interface AutonomousEnvelope<State> {
  readonly _tag: "Autonomous";
  readonly state: State;
}

type Envelope<State, Message> = MessageEnvelope<State, Message> | AutonomousEnvelope<State>;

/**
 * A local reference adds `derive`: compute the message from the current state
 * inside the actor's turn, so read and send cannot interleave with another
 * message. The message still goes through the behavior. A durable reference
 * has no `derive`, because a function cannot cross the durable boundary.
 */
export interface LocalActorRef<State, Message> extends ActorRef<State, Message, "local"> {
  readonly derive: (
    derive: (state: State) => Message,
  ) => Effect.Effect<Applied<State>, ActorStopped>;
}

/**
 * Spawn a local actor in the current scope. Messages run in admission order.
 * Closing the scope stops the actor; every waiting `call` fails with
 * `ActorStopped`.
 */
export const spawn = Effect.fn("Actor.spawn")(function* <State, Message, R>(
  behavior: Behavior<State, Message, R>,
) {
  const turn = yield* behavior.open(behavior.initial);
  const applied = yield* SubscriptionRef.make<Applied<State>>({
    revision: 0,
    state: behavior.initial,
  });
  const admission = yield* Ref.make(0);
  const stopped = yield* Ref.make(false);
  const closed = yield* Deferred.make<never, ActorStopped>();
  const mailbox = yield* Queue.unbounded<Envelope<State, Message>>();

  const commitState = (next: State) =>
    SubscriptionRef.modify(applied, (current): readonly [Applied<State>, Applied<State>] => {
      const committed = { revision: current.revision + 1, state: next };
      return [committed, committed];
    });

  const step = Effect.gen(function* () {
    const envelope = yield* Queue.take(mailbox);
    const current = yield* SubscriptionRef.get(applied);
    if (envelope._tag === "Autonomous") {
      if (!Equal.equals(envelope.state, current.state)) {
        yield* commitState(envelope.state);
      }
      return;
    }
    const next = yield* turn.apply(current.state, envelope.derive(current.state));
    const committed = yield* commitState(next);
    yield* Deferred.succeed(envelope.reply, committed);
  });

  yield* Effect.addFinalizer(() =>
    Ref.set(stopped, true).pipe(Effect.andThen(Deferred.fail(closed, ActorStopped.make()))),
  );
  yield* Effect.forkScoped(Effect.forever(step));
  yield* Effect.forkScoped(
    Stream.runForEach(turn.changes, (changed) =>
      Queue.offer(mailbox, { _tag: "Autonomous", state: changed }),
    ),
  );

  const admit = Effect.fn("Actor.admit")(function* (derive: (state: State) => Message) {
    const isStopped = yield* Ref.get(stopped);
    if (isStopped) {
      return yield* ActorStopped.make();
    }
    const reply = yield* Deferred.make<Applied<State>>();
    const admitted = yield* Ref.updateAndGet(admission, (n) => n + 1);
    yield* Queue.offer(mailbox, { _tag: "Message", derive, reply });
    return { admitted, reply };
  });

  const awaitReply = (reply: Deferred.Deferred<Applied<State>>) =>
    Effect.raceFirst(Deferred.await(reply), Deferred.await(closed));

  const send = Effect.fn("Actor.send")(function* (message: Message) {
    const { admitted } = yield* admit(() => message);
    return { admitted } satisfies Admitted;
  });

  const call = Effect.fn("Actor.call")(function* (message: Message) {
    const { reply } = yield* admit(() => message);
    return yield* awaitReply(reply);
  });

  const derive = Effect.fn("Actor.derive")(function* (compute: (state: State) => Message) {
    const { reply } = yield* admit(compute);
    return yield* awaitReply(reply);
  });

  const appliedSource = fromSubscriptionRef(applied);
  const ref: LocalActorRef<State, Message> = {
    kind: "local",
    applied: appliedSource,
    state: select(appliedSource, (committed) => committed.state),
    send,
    call,
    derive,
  };
  return ref;
});

/**
 * Update simple state from its current value inside one turn. Only a local
 * reference to a `Behavior.value` actor has this. The message that reaches
 * the behavior is still a plain `Set`.
 */
export const modify: {
  <A>(
    update: (value: A) => A,
  ): (ref: LocalActorRef<A, SetValue<A>>) => Effect.Effect<Applied<A>, ActorStopped>;
  <A>(
    ref: LocalActorRef<A, SetValue<A>>,
    update: (value: A) => A,
  ): Effect.Effect<Applied<A>, ActorStopped>;
} = Function.dual(
  2,
  <A>(
    ref: LocalActorRef<A, SetValue<A>>,
    update: (value: A) => A,
  ): Effect.Effect<Applied<A>, ActorStopped> => ref.derive((value) => Value.Set(update(value))),
);
