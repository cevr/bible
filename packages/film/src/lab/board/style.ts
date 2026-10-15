// The Board page's styles (`view.tsx`, `../sketch/surface.tsx`): the film's
// beats on the panel's surface, each under a head line of its id, its start
// and its approval, its picture's brief in the secondary ink, its line at the
// reading size with a chip at each mark, and a row of its panels as thumbs at
// the film's aspect (the one picked edged in the accent); the panel picked
// opens under its beat in a raised box: how it is shown, its tries, the
// composer and its notes. The sketch's surface lies over the picture
// (`touch-action: none`: a finger draws, never scrolls), its toolbar in the
// box. On a laptop the column stands beside the picture and its track, as
// the Script's does (`--board-w`); on a phone the page is the screen's height,
// the picture over the column, which scrolls in a box of its own. Read only
// through the tokens (`player/tokens.css`); what no token holds is named in
// `BOARD_TOKENS`. The column puts these in the page's head while it is
// mounted: no page's first paint waits for them.

import { PHONE, WIDE } from '../viewport.ts';

/** What no studio token holds: the laptop column's width, and a thumb's at the film's aspect. */
const BOARD_TOKENS = `
:root {
  --board-w: clamp(420px, 40vw, 600px);
  --board-thumb-w: 160px;
}
`;

/**
 * A panel's thumb and the line under it (`PanelThumb`, `PanelSaid`): the
 * Board's, and an ask's Board, alike.
 */
export const PANEL_THUMB_CSS = `
.lab-board-thumb { display: flex; align-items: center; justify-content: center; width: 100%; height: auto;
  aspect-ratio: 16 / 9; object-fit: cover; border-radius: var(--r-1); background: var(--surface-3);
  outline: 1px solid var(--line); outline-offset: -1px; }
.lab-board-thumb-empty, .lab-board-thumb-card { padding: var(--s-2); color: var(--text-3); font-size: var(--fs-2);
  line-height: var(--lh-2); text-align: center; }
/* A card or a verse: the engine sets it in the film's card style, so its thumb is the words, not a picture. */
.lab-board-thumb-card { background: var(--surface-1); color: var(--text-1); font-weight: var(--w-2); }
.lab-board-panel-meta { display: flex; flex-wrap: wrap; gap: var(--s-1); font-size: var(--fs-1); line-height: var(--lh-1);
  color: var(--text-3); }
`;

export const BOARD_CSS = `${BOARD_TOKENS}
.lab-board { display: flex; flex-direction: column; min-height: 0; min-width: 0; background: var(--surface-1); }
.lab-board-head { display: flex; align-items: center; gap: var(--s-2); min-height: var(--panel-head-h);
  padding: 0 var(--gutter); border-bottom: var(--border); font-size: var(--fs-2); line-height: var(--lh-2); color: var(--text-2); }
.lab-board-count { flex: 1; min-width: 0; }
.lab-board-status { display: flex; align-items: center; gap: var(--s-2); padding: var(--s-1) var(--gutter); border-bottom: var(--border); }
.lab-board-status > .sh-btn { flex: none; min-height: var(--hit); }
.lab-board-note { flex: 1; min-width: 0; color: var(--text-2); font-size: var(--fs-3); line-height: var(--lh-3); }
.lab-board-scroll { flex: 1; min-height: 0; overflow-x: hidden; overflow-y: auto; overscroll-behavior: contain;
  padding-bottom: var(--s-8); font-size: var(--body-fs); line-height: var(--body-lh); overflow-wrap: anywhere; }
.lab-board-scroll:focus-visible { outline: none; box-shadow: var(--focus-ring-inset); }
.lab-board-beat { display: flex; flex-direction: column; gap: var(--s-2); padding: var(--s-3) var(--gutter) var(--s-4);
  border-bottom: var(--border); }
/* The beat under the frame: its edge in the playing ink, as the Script's. */
.lab-board-beat[data-live='true'] { box-shadow: inset 2px 0 var(--state-live); }
.lab-board-beat-head { position: sticky; top: 0; z-index: 1; display: flex; align-items: center; flex-wrap: wrap;
  gap: 0 var(--s-2); background: var(--surface-1); font-size: var(--fs-2); line-height: var(--lh-2); color: var(--text-3); }
.lab-board-id { display: inline-flex; align-items: center; gap: var(--s-2); min-height: var(--hit); padding: 0; border: 0;
  background: none; font: inherit; font-size: var(--fs-3); line-height: var(--lh-3); font-weight: var(--w-3);
  color: var(--text-2); cursor: pointer; }
.lab-board-beat[data-live='true'] .lab-board-id { color: var(--text-1); }
@media (hover: hover) { .lab-board-id:hover { color: var(--text-1); } }
.lab-board-at { color: var(--text-3); }
.sh-timecode.lab-board-at .sh-ff { color: inherit; }
.lab-board-approve { margin-inline-start: auto; min-height: var(--hit); }
/* The brief and the line: two lines of the brief at rest, the rest and the line behind More (the panels carry the words). */
.lab-board-brief { margin: 0; color: var(--text-2); font-size: var(--fs-2); line-height: var(--lh-2); }
.lab-board-beat:not([data-more='true']) .lab-board-brief { display: -webkit-box; -webkit-box-orient: vertical;
  -webkit-line-clamp: 2; overflow: clip; }
.lab-board-beat:not([data-more='true']) .lab-board-line { display: none; }
.lab-board-more { align-self: flex-start; min-height: var(--hit); }
/* A mark named inside a sentence (a brief, the compare caption) sits on its line, flush with the words around it. */
.lab-board-brief .lab-board-mark, .lab-board-beside .lab-board-mark { margin-inline-end: 0; padding: 0;
  vertical-align: baseline; }
.lab-board-line { margin: 0; font-size: var(--fs-read); line-height: var(--lh-read); color: var(--text-1); }
/* A mark: a chip before the word it is said at, as the Script's (its panel is held from there). */
.lab-board-mark { margin-inline-end: var(--s-1); padding: 0 var(--s-1); border-radius: var(--r-1);
  color: var(--text-3); font-size: var(--fs-1); line-height: var(--lh-1); font-weight: var(--w-2);
  vertical-align: text-top; user-select: none; -webkit-user-select: none; }
.lab-board-none { margin: 0; color: var(--text-3); font-size: var(--fs-2); line-height: var(--lh-2); }
/* The panels, in the order said: thumbs at the film's aspect, a row that wraps. */
.lab-board-panels { display: grid; grid-template-columns: repeat(auto-fill, minmax(min(var(--board-thumb-w), 100%), 1fr));
  gap: var(--s-2); }
.lab-board-panel { display: flex; flex-direction: column; gap: var(--s-1); min-width: 0; padding: var(--s-1);
  border: var(--border); border-radius: var(--r-2); background: var(--surface-2); font: inherit; color: var(--text-2);
  text-align: start; cursor: pointer; touch-action: manipulation; }
.lab-board-panel[aria-current='true'] { border-color: var(--accent); box-shadow: 0 0 0 1px var(--accent); }
/* The panel under the frame: its edge in the playing ink, as its beat's. */
.lab-board-panel[data-live='true']:not([aria-current='true']) { box-shadow: inset 0 0 0 2px var(--state-live); }
/* A panel's words: what the narrator says while it holds, from its mark to the next panel's. */
.lab-board-panel-words { display: -webkit-box; -webkit-box-orient: vertical; -webkit-line-clamp: 3; overflow: clip;
  color: var(--text-1); font-size: var(--fs-2); line-height: var(--lh-2); }
@media (hover: hover) { .lab-board-panel:not([aria-current='true']):hover { background: var(--surface-3); } }
${PANEL_THUMB_CSS}
.lab-board-panel-label { display: flex; align-items: center; justify-content: space-between; gap: var(--s-2);
  font-size: var(--fs-1); line-height: var(--lh-1); }
.lab-board-panel-at { color: var(--text-1); font-weight: var(--w-2); }
.lab-board-panel-time { color: var(--text-3); }
/* The panel picked, open under its beat: a raised box, as the Script's ties. */
.lab-board-open { display: flex; flex-direction: column; gap: var(--s-3); padding: var(--s-2) var(--s-3) var(--s-3);
  border: var(--border); border-radius: var(--r-2); background: var(--surface-2); }
.lab-board-open-head { display: grid; grid-template-columns: minmax(0, 1fr) auto; align-items: center; gap: var(--s-2); }
.lab-board-open-id { min-width: 0; color: var(--text-1); font-weight: var(--w-2); }
.lab-board-views { grid-column: 1 / -1; }
.lab-board-follow { flex: none; min-height: var(--hit); }
.lab-board-close { grid-column: 2; grid-row: 1; min-height: var(--hit); }
.lab-board-beside, .lab-board-why, .lab-board-set, .lab-board-drawn, .lab-board-asked {
  margin: 0; color: var(--text-2); font-size: var(--fs-2); line-height: var(--lh-2); }
.lab-board-asked:empty { display: none; }
.lab-board-asked code { white-space: nowrap; font: inherit; color: var(--text-1); }
/* The line is the column's: the transport does not repeat it, as on the Script. */
body.lab:has(.lab-board) .bar > .row .say { visibility: hidden; }
.lab-board-tries { display: flex; flex-direction: column; gap: var(--s-2); }
.lab-board-tries-row { display: grid; grid-template-columns: repeat(auto-fill, minmax(min(var(--board-thumb-w), 100%), 1fr));
  gap: var(--s-2); }
.lab-board-try { display: flex; flex-direction: column; gap: var(--s-1); min-width: 0; padding: var(--s-1);
  border: var(--border); border-radius: var(--r-2); background: var(--surface-1); font: inherit; color: var(--text-2);
  cursor: pointer; touch-action: manipulation; }
.lab-board-try[aria-pressed='true'] { border-color: var(--accent); box-shadow: 0 0 0 1px var(--accent); }
.lab-board-try img { width: 100%; height: auto; aspect-ratio: 16 / 9; object-fit: cover; border-radius: var(--r-1); }
.lab-board-try-label { display: flex; align-items: center; gap: var(--s-1); font-size: var(--fs-1); line-height: var(--lh-1); }
.lab-board-keep { display: flex; gap: var(--s-2); }
.lab-board-text, .lab-board-why-input { width: 100%; padding: var(--s-1) var(--s-2); border: 1px solid var(--line-strong);
  border-radius: var(--r-1); background: var(--surface-1); color: var(--text-1); font: inherit; }
.lab-board-why-input { flex: 1; min-width: 0; min-height: var(--hit); }
.lab-board-keep > .sh-btn { flex: none; min-height: var(--hit); }
.lab-board-compose { display: flex; flex-direction: column; gap: var(--s-2); }
.lab-board-text { min-height: calc(3 * var(--hit)); resize: vertical; }
.lab-board-actions { display: flex; flex-wrap: wrap; gap: var(--s-2); }
.lab-board-actions > .sh-btn { min-height: var(--hit); }
.lab-board-notes-list { display: flex; flex-direction: column; gap: var(--s-2); margin: 0; padding: 0; list-style: none; }
.lab-board-noted { display: flex; flex-direction: column; gap: var(--s-2); }
.lab-board-noted-head { display: flex; align-items: baseline; flex-wrap: wrap; gap: var(--s-2); min-height: var(--hit); padding: 0; border: 0;
  background: none; font: inherit; color: var(--text-2); text-align: start; cursor: pointer; }
.lab-board-noted[aria-current='true'] .lab-board-noted-head { color: var(--text-1); }
.lab-board-noted-text { flex: 1; min-width: 0; }
.lab-board-noted-still { width: 100%; height: auto; border-radius: var(--r-1); }
/* The sketch's toolbar: its groups in a row that wraps; each press the size of a finger. */
.lab-sketch-bar { display: flex; flex-wrap: wrap; gap: var(--s-2); }
.lab-sketch-group { display: flex; gap: var(--s-1); }
.lab-sketch-group > .sh-btn { min-height: var(--hit); min-width: var(--hit); }
.lab-sketch-tool, .lab-sketch-ink { display: inline-flex; align-items: center; justify-content: center; padding: 0; }
.lab-sketch-glyph { width: 18px; height: 18px; fill: none; stroke: currentColor; stroke-width: 1.8; stroke-linecap: round;
  stroke-linejoin: round; }
.lab-sketch-swatch { width: 14px; height: 14px; border-radius: 50%; background: var(--ink);
  box-shadow: 0 0 0 1px var(--surface-0), 0 0 0 2px var(--text-2); }
/* The surface over the picture: its catch takes every pointer, a finger draws and never scrolls or zooms. */
.lab-overlay:has(.lab-sketch) { touch-action: none; }
.lab-overlay .lab-sketch-catch { fill: transparent; stroke: none; pointer-events: all; touch-action: none; }
.lab-sketch[data-tool='select'] .lab-sketch-catch { cursor: default; }
.lab-sketch[data-tool='text'] .lab-sketch-catch { cursor: text; }
.lab-overlay .lab-sketch-items { pointer-events: none; filter: drop-shadow(0 0 1px var(--on-picture-shade)); }
.lab-overlay .lab-sketch-item { stroke-linecap: round; stroke-linejoin: round; vector-effect: none; }
.lab-overlay .lab-sketch-item[data-selected='true'], .lab-overlay .lab-sketch-text[data-selected='true'] {
  filter: drop-shadow(0 0 3px var(--accent)); }
.lab-overlay .lab-sketch-item[data-marked='true'], .lab-overlay .lab-sketch-text[data-marked='true'] { opacity: 0.35; }
/* Set from its top (the font's ascent at the shape's y), as canvas/sketch.ts paints it and core/sketch.ts boxes it. */
.lab-overlay .lab-sketch-text { font-family: var(--font); font-weight: var(--w-2); stroke: none;
  dominant-baseline: text-before-edge; }
.lab-overlay .lab-sketch-brush { fill: var(--accent-wash); stroke: var(--accent); stroke-width: 1.5; stroke-dasharray: 6 4;
  vector-effect: non-scaling-stroke; }
.lab-sketch-typing { margin: 0; }
.lab-sketch-input { width: 100%; padding: 0 var(--s-1); border: 1px dashed var(--accent); background: transparent;
  font-family: var(--font); font-size: var(--sketch-size); color: var(--sketch-ink); font-weight: var(--w-2); }
/* The picture's canvas: the board's own image of the frame, pinned over the film under the overlay, as the onion is. */
.lab-board-picture { position: absolute; z-index: 2; pointer-events: none; }
@media ${WIDE} {
  body.lab:has(.lab-board) { grid-template-columns: minmax(0, 1fr) var(--board-w); }
  .lab-board { grid-column: 2; grid-row: 2 / span 2; overflow: hidden; border-left: var(--border); }
  /* In the panel's box the toolbar stays at the column's foot while the box scrolls to the composer. On a phone the
     column is too short to give its foot to three rows of tools, so the toolbar keeps its place under the views. */
  .lab-board-open .lab-sketch-bar { position: sticky; bottom: 0; z-index: 1; padding-block: var(--s-1);
    background: var(--surface-2); }
}
@media ${PHONE} {
  body.lab:has(.lab-board) { height: 100dvh; min-height: 0; grid-template-rows: auto auto auto minmax(0, 1fr); }
  .lab-board { grid-column: 1; grid-row: 4; border-top: var(--border); }
  .lab-board-text, .lab-board-why-input, .lab-sketch-input { font-size: var(--fs-5); line-height: var(--lh-5); }
}
`;
