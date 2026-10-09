// The page's text highlights: ranges of a text painted without touching the
// markup, so a code view's text stays selectable and copyable, and a lit span
// costs no element. The browser's CSS Custom
// Highlight API is the live adapter (`highlights-browser.ts`); a browser
// without it paints nothing, and the view's gutter still says which lines are
// lit. A test reads what was painted from `Highlights.memory`.

import { Context, Effect, Layer } from 'effect';
import type { CodeRange } from '../core/schema.ts';

/** The highlights a page paints, each styled by `::highlight(<name>)`. */
export type HighlightName = 'lab-live' | 'lab-read' | 'lab-picked';

interface HighlightsOps {
  /**
   * Paint `ranges` as `name`, in place of what `name` painted. A text node
   * `root` is painted by offsets into its text; any other node holds its
   * text in children that say where each starts (`data-from`, an offset into
   * the whole text), so a range may cross them and the markup between them
   * (line numbers) is never painted.
   */
  readonly paint: (
    name: HighlightName,
    root: Node,
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
