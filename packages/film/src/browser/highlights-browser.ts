// The browser's own highlights (`highlights.ts`): the CSS Custom Highlight
// API, a `Highlight` of `Range`s over the text node under each name. A
// browser without `CSS.highlights` paints nothing.

import { Effect, Layer, Option } from 'effect';
import { Highlights } from './highlights.ts';

/** The page's highlight registry, when the browser has one. */
const registry = (): Option.Option<HighlightRegistry> =>
  Option.flatMap(
    Option.liftPredicate(globalThis, (g) => 'CSS' in g),
    (g) => Option.fromNullishOr(g.CSS.highlights),
  );

/** This page's highlights. */
export const highlightsLayer: Layer.Layer<Highlights> = Layer.succeed(
  Highlights,
  Highlights.of({
    paint: (name, node, ranges) =>
      Effect.sync(() => {
        Option.map(registry(), (highlights) => {
          const made = ranges.map(([start, end]) => {
            const range = new Range();
            range.setStart(node, Math.min(start, node.length));
            range.setEnd(node, Math.min(end, node.length));
            return range;
          });
          highlights.set(name, new Highlight(...made));
        });
      }),
    clear: (name) =>
      Effect.sync(() => {
        Option.map(registry(), (highlights) => highlights.delete(name));
      }),
  }),
);
