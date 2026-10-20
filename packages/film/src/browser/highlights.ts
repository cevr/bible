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
 * word playing (`lab-live`), what is selected (`lab-picked`), in the studio's
 * code view what plays (`code-live`: a live row's span, a read of the clock
 * firing), what has played and holds (`code-held`) and what waits or is
 * released (`code-dim`), and on the Script the words a note is on (`lab-noted`) or
 * would cut or change (`lab-struck`). The words and the code are painted
 * under names of their own, so a pane that shows both lights each.
 */
export type HighlightName =
  | 'lab-live'
  | 'lab-picked'
  | 'code-live'
  | 'code-held'
  | 'code-dim'
  | 'lab-noted'
  | 'lab-struck';

interface HighlightsOps {
  /**
   * Paint `ranges` as `name`, in place of what `name` painted. A text node
   * `root` is painted by offsets into its text; any other node holds its
   * text in children that say where each starts (`data-from`, an offset into
   * the whole text), so a range may cross them: the blank text between two
   * of them (the space between words) is painted with them, so a span reads
   * as one, and any other markup between them (line numbers, a mark's chip)
   * never is.
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
