import { Effect, Function, Stream, SubscriptionRef } from "effect";

/**
 * A read-only reactive source. A view binds to it. A selector projects it.
 * A source never owns a mailbox.
 *
 * `changes` emits the current value first, then every later value, as
 * `SubscriptionRef.changes` does. A combinator that merges sources relies
 * on this: it knows each side's first element is a read, not a change.
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

/**
 * One source from two. It reads both when either changes, so a change to
 * one side is always seen beside the other's current value; the combined
 * source never holds a pair older than what either side would answer alone.
 * Each side's first element is its current value (see `Source`), so the
 * combined stream reads once up front and then follows only later changes.
 */
export const zip = <A, B, C>(
  left: Source<A>,
  right: Source<B>,
  combine: (left: A, right: B) => C,
): Source<C> => {
  const get = Effect.map(Effect.all([left.get, right.get]), ([a, b]) => combine(a, b));
  const later = <X>(source: Source<X>): Stream.Stream<void> =>
    Stream.map(Stream.drop(source.changes, 1), Function.constVoid);
  return {
    get,
    changes: Stream.concat(
      Stream.fromEffect(get),
      Stream.mapEffect(Stream.merge(later(left), later(right)), () => get),
    ),
  };
};
