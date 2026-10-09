// The Source view's styles (`view.tsx`, design language §5 Source, §7 Lab):
// the scene's code in the studio's monospace on the panel's surface, the
// playing cues lit by `::highlight` and a meter on each playing literal's
// line, the held line the accent's wash. On a laptop it is a column between
// the picture and the inspector; on a phone it is a face of the selection's
// sheet, or a sheet of its own (`lab-inspector-sheet`, the command styles').
// Read only through the tokens (`player/tokens.css`); what no token holds is
// named in `SOURCE_TOKENS`. A cue lane the playhead is inside carries
// `data-live` (`editor/strip.tsx`), lit in the same state colour.

import { PHONE, WIDE } from '../viewport.ts';

/** What no studio token holds: the column's width, and the colour of what plays. */
const SOURCE_TOKENS = `
:root {
  --source-w: 480px;
  --state-live: var(--text-1); /* a cue playing at the frame: its lane, its literal, its meter */
}
`;

export const SOURCE_CSS = `${SOURCE_TOKENS}
.lab-source { display: flex; flex-direction: column; flex: 1; min-height: 0; min-width: 0; background: var(--surface-1); }
.lab-source-head { display: flex; align-items: center; gap: var(--s-2); min-height: var(--panel-head-h);
  padding: 0 var(--gutter); border-bottom: var(--border); font-size: var(--fs-2); line-height: var(--lh-2); color: var(--text-2); }
.lab-source-file { flex: 0 1 auto; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.lab-source-live { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; text-align: right; color: var(--state-live); }
.lab-source-live[data-empty='true'] { color: var(--text-3); }
.lab-source-head > .sh-btn { flex: none; min-height: var(--hit); }
.lab-source-note { margin: 0; padding: var(--s-3) var(--gutter); color: var(--text-2); font-size: var(--fs-3); }
.lab-source-follow { flex: none; }
.lab-source-follow[aria-pressed='true'] { color: var(--accent); }
.lab-source-scroll { flex: 1; min-height: 0; overflow-x: hidden; overflow-y: auto; overscroll-behavior: contain; }
.lab-source-page { --source-lh: var(--body-lh); position: relative; font-size: var(--body-fs); line-height: var(--source-lh);
  tab-size: 2; color: var(--text-1); }
.lab-source-page:focus-visible { outline: none; box-shadow: var(--focus-ring); }
/* A row to a line: the number beside the text, a long line wrapping under its own number (one layout, phone and laptop). */
.lab-source-line { position: relative; display: grid; min-height: var(--source-lh);
  grid-template-columns: calc(var(--digits) * 1ch + var(--gutter) + var(--s-2)) minmax(0, 1fr); cursor: pointer; }
.lab-source-n { padding: 0 var(--s-2) 0 var(--gutter); text-align: right; color: var(--text-3); user-select: none; }
.lab-source-t { padding: 0 var(--gutter) 0 var(--s-2); white-space: pre-wrap; overflow-wrap: anywhere; }
::highlight(lab-live) { background-color: color-mix(in srgb, var(--state-live) 26%, transparent); color: var(--text-1); }
::highlight(lab-read) { background-color: color-mix(in srgb, var(--state-live) 11%, transparent); }
::highlight(lab-picked) { background-color: var(--accent-wash); color: var(--text-1); text-decoration: underline var(--accent); }
.lab-source-held, .lab-source-meter { position: absolute; left: 0; pointer-events: none; }
.lab-source-held { right: 0; top: 0; bottom: 0; background: var(--accent-wash); box-shadow: inset 2px 0 var(--accent); }
.lab-source-meter { z-index: 2; bottom: 0; height: 2px; width: calc(var(--done) * 100%); background: var(--state-live); }
.lab-source-at { display: inline-flex; align-items: center; min-height: var(--hit); margin-left: var(--s-2); padding: 0;
  border: 0; background: none; font: inherit; color: var(--accent); cursor: pointer; }
.lab-source-at:hover { text-decoration: underline; }
.lab-source-tabs { display: flex; width: 100%; margin-bottom: var(--s-2); }
.lab-source-tabs > button[aria-pressed='true'], .lab-source-tabs > button[data-pressed] { color: var(--text-1); background: var(--surface-3); }
.lab-cue[data-live] { background: var(--state-live); }
.lab-cue.selected[data-live] { background: var(--accent); box-shadow: 0 0 0 1px var(--state-live); }
.lab-source-sheet .lab-source-scroll, .lab-selection-sheet .lab-source-scroll { max-height: 55dvh; }
@media ${WIDE} {
  body.lab:has(.lab-source-col) { grid-template-columns: minmax(0, 1fr) var(--source-w) var(--inspector-w); }
  body.lab:has(.lab-source-col) .lab-panel { grid-column: 3; }
  .lab-source-col { grid-column: 2; grid-row: 2 / span 2; display: flex; flex-direction: column; min-height: 0; min-width: 0;
    overflow: hidden; background: var(--surface-1); border-left: var(--border); }
}
@media ${PHONE} {
  .lab-source-col { display: none; }
}
`;
