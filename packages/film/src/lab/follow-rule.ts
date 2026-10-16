// Follow's rule, with no page (`follow.ts` applies it to a view's scroll
// box): where a box's top goes to keep the playhead's span in sight
// (`placeTo`), and to reveal what a press opened by the least scroll
// (`revealTo`), from the box's scroll and height alone.

import { Option } from 'effect';

/** A box as a placement reads it: where its top is scrolled to, and how tall it shows. */
interface BoxAt {
  readonly scrollTop: number;
  readonly clientHeight: number;
}

/** A span's top and bottom in its box's scroll coordinates. */
interface Extent {
  readonly top: number;
  readonly bottom: number;
}

/** How much of a box's top and bottom a row keeps clear of to count as in sight. */
interface Clear {
  readonly top: number;
  readonly bottom: number;
}

/**
 * Where the box's top goes to bring `span` into sight: none when it is in
 * sight already (its edges inside `clear`); else its first row a third of
 * the way down, its last brought up into sight when the span fits, its first
 * never pushed above the clear top, never above the box's start.
 */
export const placeTo = (box: BoxAt, span: Extent, clear: Clear): Option.Option<number> => {
  const inView =
    span.top >= box.scrollTop + clear.top &&
    span.bottom <= box.scrollTop + box.clientHeight - clear.bottom;
  if (inView) return Option.none();
  const third = span.top - box.clientHeight / 3;
  const toLast = span.bottom - box.clientHeight + clear.bottom;
  return Option.some(Math.max(0, Math.min(Math.max(third, toLast), span.top - clear.top)));
};

/**
 * Where the box's top goes to reveal what a press opened (`span`; its last
 * row's top read by `lastTop` only when the span does not fit), by the least
 * scroll: the whole span when it fits between the clear edges, else the box
 * it opened alone, its top never pushed above the clear top; the box stays
 * where it is when that shows it.
 */
export const revealTo = (box: BoxAt, span: Extent, lastTop: () => number, clear: Clear): number => {
  const room = box.clientHeight - clear.top - clear.bottom;
  const kept = Option.getOrElse(
    Option.liftPredicate(span.top, () => span.bottom - span.top <= room),
    lastTop,
  );
  const to = Math.min(
    Math.max(box.scrollTop, span.bottom - box.clientHeight + clear.bottom),
    kept - clear.top,
  );
  return Math.max(0, to);
};
