// The Transcript view's styles (`view.tsx`): a talk's words in the panel's
// face on its surface, a paragraph to a section under its scene's name, the
// word playing lit by `::highlight(lab-live)`, the word held by
// `lab-read`, the words selected by `lab-picked` (the Source view's own
// highlights, `source/style.ts`, which owns those rules), and the words the
// cut strikes hidden until "Show cuts", then struck through. On a laptop it
// is a column between the picture and the inspector, as wide as the Source
// view's (`--source-w`; one of the two is open at once); on a phone a sheet of
// its own. Read only through the tokens (`player/tokens.css`).

import { PHONE, WIDE } from '../viewport.ts';

export const TRANSCRIPT_CSS = `
.lab-transcript { display: flex; flex-direction: column; flex: 1; min-height: 0; min-width: 0; background: var(--surface-1); }
.lab-transcript-head { display: flex; align-items: center; gap: var(--s-2); min-height: var(--panel-head-h);
  padding: 0 var(--gutter); border-bottom: var(--border); font-size: var(--fs-2); line-height: var(--lh-2); color: var(--text-2); }
/* The file's name clips by the kit's one rule (\`lab-clamp\`). */
.lab-transcript-file { flex: 1; min-width: 0; }
.lab-transcript-head > .sh-btn, .lab-transcript-actions > .sh-btn { flex: none; min-height: var(--hit); min-width: var(--hit); }
.lab-transcript-note { margin: 0; padding: var(--s-3) var(--gutter); color: var(--text-2); font-size: var(--fs-3); }
.lab-transcript-scroll { flex: 1; min-height: 0; overflow-x: hidden; overflow-y: auto; overscroll-behavior: contain;
  overflow-anchor: none; /* the browser never moves the scroll by itself: the view places it, layout clamps it, a hand moves it */ }
.lab-transcript-page { display: flex; flex-direction: column; gap: var(--s-3); padding: var(--s-2) var(--gutter) var(--s-3);
  font-size: var(--body-fs); line-height: var(--body-lh); color: var(--text-1); overflow-wrap: anywhere; }
/* Its ring inside the box: the column clips what stands outside it. */
.lab-transcript-scroll:focus-visible { outline: none; box-shadow: inset 0 0 0 2px var(--accent); }
.lab-transcript-scene { margin: 0; font-size: var(--fs-2); line-height: var(--lh-2); font-weight: inherit; color: var(--text-3); }
.lab-transcript-words { margin: 0; }
.lab-transcript-w { cursor: pointer; }
.lab-transcript-page:not([data-cuts='true']) .lab-transcript-w[data-struck='true'] { display: none; }
.lab-transcript-w[data-struck='true'] { color: var(--text-3); text-decoration: line-through; }
.lab-transcript-actions { display: flex; flex-wrap: wrap; align-items: center; gap: var(--s-2); padding: var(--s-2) var(--gutter);
  border-top: var(--border); font-size: var(--fs-2); color: var(--text-2); }
/* The words' name wraps rather than clipping: a phone's row is the buttons' once it is full. */
.lab-transcript-picked { flex: 1 1 8em; min-width: 0; overflow-wrap: anywhere; }
.lab-transcript-sheet .lab-transcript-scroll { max-height: 55dvh; }
@media ${WIDE} {
  body.lab:has(.lab-transcript-col) { grid-template-columns: minmax(0, 1fr) var(--source-w) var(--inspector-w); }
  body.lab:has(.lab-transcript-col) .lab-panel { grid-column: 3; }
  .lab-transcript-col { grid-column: 2; grid-row: 2 / span 2; display: flex; flex-direction: column; min-height: 0; min-width: 0;
    overflow: hidden; background: var(--surface-1); border-left: var(--border); }
}
@media ${PHONE} {
  .lab-transcript-col { display: none; }
}
`;
