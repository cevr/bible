import { Effect, Function, Stream, SubscriptionRef } from "effect";

/**
 * A read-only reactive source. A view binds to it. A selector projects it.
 * A source never owns a mailbox.
 */
export interface Source<A> {
  readonly get: Effect.Effect<A>;
  readonly changes: Stream.Stream<A>;
}

export const fromSubscriptionRef = <A>(ref: SubscriptionRef.SubscriptionRef<A>): Source<A> => ({
  get: SubscriptionRef.get(ref),
  changes: SubscriptionRef.changes(ref),
});

export const select: {
  <A, B>(project: (value: A) => B): (source: Source<A>) => Source<B>;
  <A, B>(source: Source<A>, project: (value: A) => B): Source<B>;
} = Function.dual(2, <A, B>(source: Source<A>, project: (value: A) => B): Source<B> => ({
  get: Effect.map(source.get, project),
  changes: Stream.map(source.changes, project),
}));
