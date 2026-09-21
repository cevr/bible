import type { Schema, Scope } from "effect";
import { Effect, Stream } from "effect";
import { Machine } from "effect-machine";

/**
 * One open behavior instance. `apply` runs one message against the current
 * state and returns the next state. The actor owns ordering; `apply` never
 * sees two messages at once.
 */
export interface Turn<State, Message> {
  readonly apply: (state: State, message: Message) => Effect.Effect<State>;
  /**
   * State changes the behavior makes on its own, with no message: a machine
   * task completing, an immediate transition. The actor commits each one as
   * a revision. A value or reducer never changes on its own.
   */
  readonly changes: Stream.Stream<State>;
}

/**
 * The rules that process an actor's messages and change its private state.
 * The actor owns identity, mailbox, and lifetime. The behavior defines what
 * messages mean. `open` receives the state the actor starts from: the initial
 * state on first spawn, or the committed state on recovery.
 */
export interface Behavior<State, Message, R = never> {
  readonly initial: State;
  readonly open: (state: State) => Effect.Effect<Turn<State, Message>, never, R | Scope.Scope>;
}

export interface SetValue<A> {
  readonly _tag: "Set";
  readonly value: A;
}

export const Value = {
  Set: <A>(value: A): SetValue<A> => ({ _tag: "Set", value }),
};

/**
 * Simple state. The only message is a serializable replacement. A `modify`
 * helper lives on the local reference, not here, because an updater function
 * cannot cross the durable boundary.
 */
export const value = <A>(initial: A): Behavior<A, SetValue<A>> => ({
  initial,
  open: () =>
    Effect.succeed({
      apply: (_state, message) => Effect.succeed(message.value),
      changes: Stream.empty,
    }),
});

export interface ReducerOptions<State, Message> {
  readonly initial: State;
  readonly reduce: (state: State, message: Message) => State;
}

/** Event-to-state transitions with no state chart. */
export const reducer = <State, Message>(
  options: ReducerOptions<State, Message>,
): Behavior<State, Message> => ({
  initial: options.initial,
  open: () =>
    Effect.succeed({
      apply: (state, message) => Effect.sync(() => options.reduce(state, message)),
      changes: Stream.empty,
    }),
});

interface Tagged {
  readonly _tag: string;
}

/**
 * An Effect Machine as behavior. The machine actor is an implementation
 * detail: it is spawned inside `open`, hydrated from the given state, and
 * stopped with the owning scope. Its `ActorRef` is not exposed.
 */
export const machine = <
  State extends Tagged,
  Event extends Tagged,
  R,
  StateDefinition extends Record<string, Schema.Struct.Fields>,
  EventDefinition extends Record<string, Schema.Struct.Fields>,
  Output,
>(
  definition: Machine.Machine<State, Event, R, StateDefinition, EventDefinition, void, Output>,
): Behavior<State, Event, R> => ({
  initial: definition.initial,
  open: Effect.fn("Behavior.machine.open")(function* (state: State) {
    const actor = yield* Machine.spawn(definition, { hydrate: state });
    yield* actor.start;
    yield* Effect.addFinalizer(() => actor.stop);
    return {
      apply: (_state, event) => Effect.map(actor.call(event), (result) => result.newState),
      changes: actor.changes,
    };
  }),
});
