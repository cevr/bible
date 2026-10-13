// The words of a narration on a page, as the Transcript view and the Script
// both show them (`transcript/view.tsx`, `script/view.tsx`): each word an
// element of its own inside its section's (`data-scene`), holding its index
// (`data-index`) and its offset in the one text (`data-from`, `lit.ts`), so
// the page's highlights (`browser/highlights.ts`) paint ranges of the text
// with no element for a word lit, and the text stays selectable and
// copyable. A press released on the words selects the words a text
// selection spans, in one section, or shows the one word tapped.

import { Effect, Option, Record as Rec } from 'effect';
import { createEffect, onCleanup } from 'solid-js';
import { Highlights, type HighlightName } from '../../browser/highlights.ts';
import type { Host } from '../../browser/host.ts';
import type { CodeRange } from '../../core/schema.ts';
import { type Row, type SectionRows, type WordAt, rowOf } from './lit.ts';

/** The word a node of the text is in: its section and its index. */
export const wordOfNode = (node: Option.Option<Node>): Option.Option<WordAt> =>
  Option.flatMap(
    Option.flatMap(
      Option.flatMap(node, (n) =>
        Option.orElse(
          Option.liftPredicate(n, (x): x is Element => x instanceof Element),
          () => Option.fromNullishOr(n.parentElement),
        ),
      ),
      (el) => Option.fromNullishOr(el.closest('[data-index]')),
    ),
    (el) =>
      Option.map(
        Option.fromNullishOr(el.closest('[data-scene]')?.getAttribute('data-scene')),
        (section) => ({ section, index: Number(el.getAttribute('data-index')) }),
      ),
  );

/** What a press released on the words acts on: the sections shown, and the view's two verbs on them. */
interface WordsPressed {
  readonly sections: () => ReadonlyArray<SectionRows>;
  /** Select words `from`–`to` of `section`. */
  readonly selectRange: (section: string, from: number, to: number) => void;
  /** Show word `row` of `section`, the selection extended to it with `extend`. */
  readonly tap: (section: string, row: Row, extend: boolean) => void;
}

/**
 * A press released on the words (a click's handler): one that ends a text
 * selection across words of one section selects them; a tap on one word
 * shows it, shift extending the selection to it.
 */
export const wordsReleased =
  (verbs: WordsPressed) =>
  (event: MouseEvent): void => {
    const selection = Option.filter(
      Option.fromNullishOr(window.getSelection()),
      (s) => !s.isCollapsed,
    );
    if (Option.isSome(selection)) {
      Option.map(
        Option.filter(
          Option.zipWith(
            wordOfNode(Option.fromNullishOr(selection.value.anchorNode)),
            wordOfNode(Option.fromNullishOr(selection.value.focusNode)),
            (a, b) => ({ a, b }),
          ),
          ({ a, b }) => a.section === b.section,
        ),
        ({ a, b }) =>
          verbs.selectRange(a.section, Math.min(a.index, b.index), Math.max(a.index, b.index)),
      );
      return;
    }
    const target = Option.filter(
      Option.fromNullishOr(event.target),
      (t): t is Node => t instanceof Node,
    );
    Option.map(wordOfNode(target), (at) =>
      Option.map(rowOf(verbs.sections(), at), (row) => verbs.tap(at.section, row, event.shiftKey)),
    );
  };

/** What a view paints over its words, by highlight: the ranges of the one text each covers. */
export type Painted<N extends HighlightName = HighlightName> = Readonly<
  Record<N, ReadonlyArray<CodeRange>>
>;

/**
 * Paint `painted()` over the words in `page()` (once it is laid out) each
 * time it changes, for as long as the caller is mounted; each highlight it
 * names is cleared as it goes.
 */
export const usePainted = <N extends HighlightName>(
  host: Host,
  page: () => Option.Option<HTMLElement>,
  painted: () => Painted<N>,
): void => {
  // The highlights painted so far, each cleared as the view goes.
  const names = new Set<N>();
  createEffect(painted, (now) => {
    Option.map(page(), (root) =>
      Effect.runSyncWith(host)(
        Highlights.use((h) =>
          Effect.forEach(
            Rec.toEntries(now),
            ([name, ranges]) => {
              names.add(name);
              return h.paint(name, root, ranges);
            },
            { discard: true },
          ),
        ),
      ),
    );
  });
  onCleanup(() =>
    Effect.runSyncWith(host)(
      Highlights.use((h) => Effect.forEach(names, (name) => h.clear(name), { discard: true })),
    ),
  );
};
