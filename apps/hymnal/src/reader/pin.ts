/**
 * Where the phones' list pins its topic row, from the scroll offset alone.
 *
 * Every row has a fixed height, so each topic row's place in the list's
 * content is known before the list draws (`topicStarts`). The pinned row
 * then follows the scroll offset on the UI thread (`pinnedAt`, a worklet):
 * no state of the JS thread is read in the frame, so a fast drag cannot
 * show the row at a place the list has not caught up with.
 */

import type { Row } from './rows';

/** Each topic row's top in the list's content: `top` (the list's header) plus every row above it. */
export const topicStarts = <Hymn>(
  rows: ReadonlyArray<Row<Hymn>>,
  top: number,
  heightOf: (kind: Row<Hymn>['kind']) => number,
): ReadonlyArray<number> => {
  const starts: Array<number> = [];
  let at = top;
  for (const row of rows) {
    if (row.kind === 'topic') starts.push(at);
    at += heightOf(row.kind);
  }
  return starts;
};

/** The pinned topic at a scroll offset: which one, and how far the next topic pushes it up. */
export interface Pinned {
  /** The topic's place among the topics; -1 while the first topic is still below the list's top. */
  readonly index: number;
  /** How far above the list's top the pinned row sits: 0 at rest, down to -`height` as the next pushes it. */
  readonly y: number;
}

/** The topic pinned at scroll offset `scroll`, its rows `height` tall, over the topics' `starts` (ascending). */
export const pinnedAt = (starts: ReadonlyArray<number>, scroll: number, height: number): Pinned => {
  'worklet';
  // The last topic whose top has reached the list's top.
  let low = 0;
  let high = starts.length;
  while (low < high) {
    const middle = Math.floor((low + high) / 2);
    if ((starts[middle] ?? Infinity) <= scroll) low = middle + 1;
    else high = middle;
  }
  const index = low - 1;
  // The last topic has no next to push it.
  const next = starts[index + 1] ?? Infinity;
  if (index < 0) return { index, y: 0 };
  return { index, y: Math.min(0, next - scroll - height) };
};
