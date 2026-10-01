// Answers shown in the order they were asked. A page asks the server for
// the same thing several ways (a read, a read again after a source write, a
// say that answers what it leaves), each in its own fresh process, so the
// answers can land in any order. Each ask takes the next number; an answer
// is shown only when nothing asked after it has been shown already, so an
// older read landing late never overwrites a newer say. An answer that was
// overtaken (something was asked after it) may not hold what was asked
// later, nor what was asked later hold it: the page reads again.

/** One ask: show its answer when it is still the newest, and whether it was overtaken. */
export interface Ask {
  /** Run `show` unless an answer asked after this one is shown: whether it ran. */
  readonly answer: (show: () => void) => boolean;
  /** Whether something was asked after this. */
  readonly overtaken: () => boolean;
}

/** A page's asks of one thing, numbered as they are made. */
interface Asks {
  readonly ask: () => Ask;
}

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
      };
    },
  };
};
