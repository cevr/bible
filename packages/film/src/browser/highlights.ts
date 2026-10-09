// The page's text highlights: ranges of a text node painted without touching
// the markup, so a code view's text stays one node that stays selectable and
// copyable, and a lit span costs no element. The browser's CSS Custom
// Highlight API is the live adapter (`highlights-browser.ts`); a browser
// without it paints nothing, and the view's gutter still says which lines are
// lit. A test reads what was painted from `Highlights.memory`.

import { Context, Effect, Layer } from 'effect';
import type { CodeRange } from '../core/schema.ts';

/** The highlights a page paints, each styled by `::highlight(<name>)`. */
export type HighlightName = 'lab-live' | 'lab-read' | 'lab-line';

interface HighlightsOps {
  /** Paint `ranges` (offsets into `node`'s text) as `name`, in place of what `name` painted. */
  readonly paint: (
    name: HighlightName,
    node: Text,
    ranges: ReadonlyArray<CodeRange>,
  ) => Effect.Effect<void>;
  /** Paint nothing as `name`. */
  readonly clear: (name: HighlightName) => Effect.Effect<void>;
}

export class Highlights extends Context.Service<Highlights, HighlightsOps>()(
  '@bible/film/browser/Highlights',
) {
  /** Highlights in memory: what each name paints now is in `painted`. */
  static readonly memory = (
    painted: Map<HighlightName, ReadonlyArray<CodeRange>>,
  ): Layer.Layer<Highlights> =>
    Layer.succeed(
      Highlights,
      Highlights.of({
        paint: (name, _node, ranges) =>
          Effect.sync(() => {
            painted.set(name, ranges);
          }),
        clear: (name) =>
          Effect.sync(() => {
            painted.delete(name);
          }),
      }),
    );

  /** Highlights that paint nothing: a server render's. */
  static readonly none: Layer.Layer<Highlights> = Layer.succeed(
    Highlights,
    Highlights.of({ paint: () => Effect.void, clear: () => Effect.void }),
  );
}
