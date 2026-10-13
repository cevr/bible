// The page's text highlights: ranges of a text painted without touching the
// markup, so a code view's text stays selectable and copyable, and a lit span
// costs no element. The browser's CSS Custom
// Highlight API is the live adapter (`highlights-browser.ts`); a browser
// without it paints nothing, and the view's gutter still says which lines are
// lit. A server render paints nothing (`Highlights.none`); a test reads what
// was painted where it is painted, in the browser (`CSS.highlights`).

import { Context, Effect, Layer } from 'effect';
import type { CodeRange } from '../core/schema.ts';

/**
 * The highlights a page paints, each styled by `::highlight(<name>)`: the
 * word or line playing, what a selection reads, what is selected, and on the
 * Script the words a note is on (`lab-noted`) or would cut or change
 * (`lab-struck`).
 */
export type HighlightName = 'lab-live' | 'lab-read' | 'lab-picked' | 'lab-noted' | 'lab-struck';

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
  /** Highlights that paint nothing: a server render's. */
  static readonly none: Layer.Layer<Highlights> = Layer.succeed(
    Highlights,
    Highlights.of({ paint: () => Effect.void, clear: () => Effect.void }),
  );
}
