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

/** `ranges` cut at the pieces: one `Range` for each piece a range reaches into. */
const rangesIn = (
  pieces: ReadonlyArray<Piece>,
  ranges: ReadonlyArray<readonly [number, number]>,
): ReadonlyArray<Range> =>
  ranges.flatMap(([start, end]) =>
    pieces.flatMap(({ node, from }) => {
      const a = Math.max(start, from);
      const b = Math.min(end, from + node.length);
      if (a >= b) return [];
      const range = new Range();
      range.setStart(node, a - from);
      range.setEnd(node, b - from);
      return [range];
    }),
  );

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
