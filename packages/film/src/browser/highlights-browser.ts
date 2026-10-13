// The browser's own highlights (`highlights.ts`): the CSS Custom Highlight
// API, a `Highlight` of `Range`s over the text under each name. A browser
// without `CSS.highlights` paints nothing.

import { Effect, Layer, Option } from 'effect';
import { Highlights } from './highlights.ts';

/** The page's highlight registry, when the browser has one. */
const registry = (): Option.Option<HighlightRegistry> =>
  Option.flatMap(
    Option.liftPredicate(globalThis, (g) => 'CSS' in g),
    (g) => Option.fromNullishOr(g.CSS.highlights),
  );

/** A text node and the offset of its first character in the whole text. */
interface Piece {
  readonly node: Text;
  readonly from: number;
}

/** The text `root` holds: itself, or the text of each child that says where it starts (`data-from`). */
const piecesOf = (root: Node): ReadonlyArray<Piece> => {
  if (root instanceof Text) return [{ node: root, from: 0 }];
  if (!(root instanceof Element)) return [];
  return [...root.querySelectorAll('[data-from]')].flatMap((el) => {
    const node = el.firstChild;
    if (!(node instanceof Text)) return [];
    return [{ node, from: Number(el.getAttribute('data-from')) }];
  });
};

/** Whether `range` ends where its text does, and nothing but blank text lies from there to the start of `node`. */
const blankTo = (range: Range, node: Text): boolean => {
  const end = range.endContainer;
  if (!(end instanceof Text) || range.endOffset !== end.length) return false;
  const between = new Range();
  between.setStart(end, range.endOffset);
  between.setEnd(node, 0);
  return between.toString().trim() === '';
};

/**
 * `ranges` cut at the pieces: one `Range` for each run of pieces a range
 * reaches into. A run goes on from one piece to the next only across blank
 * text (the spaces between a line's words), so a span of words is painted
 * whole, and is cut wherever anything else stands between them (a mark's
 * chip, a note's marker, a line number).
 */
const rangesIn = (
  pieces: ReadonlyArray<Piece>,
  ranges: ReadonlyArray<readonly [number, number]>,
): ReadonlyArray<Range> =>
  ranges.flatMap(([start, end]) => {
    const runs: Array<Range> = [];
    for (const { node, from } of pieces) {
      const a = Math.max(start, from);
      const b = Math.min(end, from + node.length);
      if (a >= b) continue;
      const goesOn = Option.filter(
        Option.fromUndefinedOr(runs.at(-1)),
        (last) => a === from && blankTo(last, node),
      );
      if (Option.isSome(goesOn)) {
        goesOn.value.setEnd(node, b - from);
        continue;
      }
      const range = new Range();
      range.setStart(node, a - from);
      range.setEnd(node, b - from);
      runs.push(range);
    }
    return runs;
  });

/** This page's highlights. */
export const highlightsLayer: Layer.Layer<Highlights> = Layer.succeed(
  Highlights,
  Highlights.of({
    paint: (name, root, ranges) =>
      Effect.sync(() => {
        Option.map(registry(), (highlights) => {
          highlights.set(name, new Highlight(...rangesIn(piecesOf(root), ranges)));
        });
      }),
    clear: (name) =>
      Effect.sync(() => {
        Option.map(registry(), (highlights) => highlights.delete(name));
      }),
  }),
);
