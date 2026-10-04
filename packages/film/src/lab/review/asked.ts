// Answers shown in the order they were asked. A page asks the server for
// the same thing several ways (a read, a read again after a source write, a
// say that answers what it leaves), each in its own fresh process, so the
// answers can land in any order. Each ask takes the next number; an answer
// is shown only when nothing asked after it has been shown already, so an
// older read landing late never overwrites a newer say. An answer that was
// overtaken (something was asked after it) may not hold what was asked
// later, nor what was asked later hold it: the page reads again.
//
// This is the one way a review page applies an async answer to its state.
// A write's answer reaches a page only as `Landed` (`useWrite` in
// `loaded.tsx` hands nothing else): its value is reachable only through
// `show`, which runs when the ask taken as the write was sent is still the
// newest of that thing's asks. So a new control cannot set state from a
// write's answer out of order: it has no value to set it from.

import { Exit, Option, Record } from 'effect';

/** One ask: show its answer when it is still the newest, and whether it was overtaken. */
export interface Ask {
  /** Run `show` unless an answer asked after this one is shown: whether it ran. */
  readonly answer: (show: () => void) => boolean;
  /** Whether something was asked after this. */
  readonly overtaken: () => boolean;
  /** Whether `answer` would run now: no answer asked after this one is shown. */
  readonly newest: () => boolean;
}

/** A page's asks of one thing, numbered as they are made. */
export interface Asks {
  readonly ask: () => Ask;
}

/**
 * A write's answer as it landed, ordered against each thing (`K`) the page
 * shows from it: whether it succeeded and why not, and its value through
 * `show`; or as is (`value`), for what carries its own order.
 */
export interface Landed<A, E, K extends string> {
  readonly succeeded: boolean;
  /** Why it failed, when it failed with an error (none when it succeeded or was interrupted). */
  readonly failure: Option.Option<E>;
  /**
   * The answer, when it succeeded, whatever was asked after it: only for
   * what is ordered by its own stamp (a mix by its build), never by the asks.
   */
  readonly value: Option.Option<A>;
  /**
   * Show what the answer says of `order` (`said`, when it says anything)
   * unless an answer asked after it has been shown there: whether it ran.
   * An answer that says nothing of `order` leaves it to older ones.
   */
  readonly show: <B>(
    order: K,
    said: (value: A) => Option.Option<B>,
    show: (b: B) => void,
  ) => boolean;
  /** Whether something of `order` was asked after this write. */
  readonly overtaken: (order: K) => boolean;
}

/**
 * Ask each of `orders` now, as a write is sent; the function it answers
 * lands the write's exit as `Landed`, ordered by those asks.
 */
export const sending = <K extends string>(orders: Readonly<Record<K, Asks>>) => {
  const asked: Record<K, Ask> = Record.map(orders, (asks) => asks.ask());
  return <A, E>(exit: Exit.Exit<A, E>): Landed<A, E, K> => ({
    succeeded: Exit.isSuccess(exit),
    failure: Exit.findErrorOption(exit),
    value: Exit.getSuccess(exit),
    // Only the newest ask reads its answer: `said` never runs on an overtaken one.
    show: (order, said, show) =>
      asked[order].newest() &&
      Option.match(Option.flatMap(Exit.getSuccess(exit), said), {
        onNone: () => false,
        onSome: (b) => asked[order].answer(() => show(b)),
      }),
    overtaken: (order) => asked[order].overtaken(),
  });
};

/** A fresh count of asks: none asked, none shown. */
export const newestAsked = (): Asks => {
  let asked = 0;
  let shown = 0;
  return {
    ask: () => {
      asked += 1;
      const n = asked;
      return {
        answer: (show) => {
          if (n < shown) return false;
          shown = n;
          show();
          return true;
        },
        overtaken: () => asked > n,
        newest: () => n >= shown,
      };
    },
  };
};
