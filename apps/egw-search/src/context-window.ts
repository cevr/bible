/**
 * How much of a hit's surrounding context to show, and where to stop.
 *
 * Its own module rather than a helper inside `index.tsx` because it is the one
 * piece of the results page with a rule that can be wrong in a way the eye does
 * not catch: a window that runs one paragraph past a chapter boundary looks
 * exactly like a window that does not. `index.tsx` is JSX with no test harness,
 * so the logic worth asserting lives beside it in plain TypeScript — which is
 * what let this app gain a `test` script and a real gate rather than a
 * typecheck alone.
 */

import { Option } from 'effect';

/** The fields of a context paragraph this module needs.
 *
 * Structural rather than the wire type, so a test can build one without the
 * `url`/`refcode` fields the rule never reads, and so this module does not
 * depend on the server's schema module. */
export interface ContextLike {
  readonly isHeading: boolean;
}

/** One side of a hit's context, trimmed. */
export interface ContextSide<A> {
  readonly shown: readonly A[];
  /** How many more paragraphs the reader could reveal on this side. Zero means
   *  no control is offered — either nothing is hidden, or what is hidden sits
   *  past a chapter boundary and is deliberately unreachable. */
  readonly more: number;
}

/**
 * Trim one side's paragraphs to what should be rendered.
 *
 * `paragraphs` must be ordered **outward from the match** — nearest neighbour
 * first — which is not how the wire delivers them. The API returns `before` in
 * reading order (nearest neighbour *last*) and `after` in reading order
 * (nearest neighbour first), so the caller reverses `before` on the way in and
 * back again on the way out. Taking them pre-oriented keeps the rule here from
 * having to know which side it is looking at.
 *
 * **Expansion stops after a chapter heading.** The server's window is bounded
 * by `book_id`, so it can never cross into another book — but a book is many
 * chapters, and the paragraphs past a heading belong to a different subject
 * than the hit. Revealing them would hand the reader sentences that explain
 * something else, which is worse than showing nothing.
 *
 * The heading itself is kept: it names the chapter the hit sits under, which is
 * orientation rather than noise. The cut is *after* it, which is why this is
 * `stop + 1` rather than `stop`.
 *
 * A heading among the *hidden* paragraphs still truncates, so `more` counts
 * only what is actually reachable. Offering "show 2 more" and then revealing
 * one is a worse promise than offering nothing.
 */
export const contextSide = <A extends ContextLike>(
  paragraphs: readonly A[],
  expanded: boolean,
  shownWhenCollapsed: number,
): ContextSide<A> => {
  // `findIndex` reports absence as -1; `Option.filter` turns that back into the
  // absence it is, so the "no heading on this side" case reads as a `None`
  // rather than as a magic number compared inline.
  const stop = Option.filter(
    Option.some(paragraphs.findIndex((para) => para.isHeading)),
    (index) => index >= 0,
  );
  const upTo = Option.match(stop, {
    onNone: () => paragraphs.length,
    // Past the heading, not up to it: the heading names the chapter the hit
    // sits under and is worth showing. What lies beyond it is another subject.
    onSome: (index) => index + 1,
  });
  const available = paragraphs.slice(0, upTo);
  if (expanded) return { shown: available, more: 0 };
  const shown = available.slice(0, shownWhenCollapsed);
  return { shown, more: available.length - shown.length };
};
