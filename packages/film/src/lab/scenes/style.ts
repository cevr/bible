// A film's Scenes' styles (`view.tsx`, design language §6) and the scene card's
// (`card.tsx`, on the Scenes and the Project alike), read only through the
// tokens (`player/tokens.css`): the tape bar sticky under the header (the
// acts ruler, the preview's track as its scene bands, the legend and
// Follow), the wrapped tape (a line's timecode, its cuts and their names,
// its stills, its state band and the playhead), and the selected scene's card
// in the focus panel at the side, a sheet peeking over the tab bar on a
// phone. The player page and the review page each inject it with the
// shell's styles.

export const SCENES_CSS = `
body.scenes { display: block; height: auto; }
.sc { display: grid; grid-template-columns: minmax(0, 1fr); }
.sc-main { min-width: 0; }
.sc-tapebar { position: sticky; top: var(--header-h); z-index: 10; display: grid; gap: var(--s-1);
  padding: var(--s-2) var(--gutter) 0; background: var(--surface-1); border-bottom: var(--border); }
.sc-acts { position: relative; height: var(--lh-1); font-size: var(--fs-1); line-height: var(--lh-1); color: var(--text-2); }
.sc-act { position: absolute; top: 0; padding-left: var(--s-1); border-left: 1px solid var(--line-strong);
  overflow: hidden; white-space: nowrap; text-overflow: ellipsis; }
.sc-track .bar { padding: 0; gap: 0; background: none; }
.sc-track .bar > .row, .sc-track .bar > .keys { display: none; }
.sc-track .track { height: 24px; }
.sc-track .track .seg span { top: 5px; }
.sc-legend { display: flex; flex-wrap: wrap; align-items: center; gap: 0 var(--s-3); min-height: var(--hit);
  font-size: var(--fs-1); line-height: var(--lh-1); color: var(--text-2); }
.sc-legend-item { display: inline-flex; align-items: center; gap: var(--s-1); }
.sc-spacer { flex: 1; }
.sc-dot { display: inline-block; flex: none; width: 6px; height: 6px; border-radius: 50%; background: var(--text-3); }
.sc-dot[data-state="stale"] { background: var(--state-stale); }
.sc-dot[data-state="rendered"] { background: var(--state-rendered); }
.sc-dot[data-state="approved"] { background: var(--state-approved); }
.sc-dot[data-state="findings"] { background: var(--state-findings); }
.sc-dot[data-state="warning"] { background: var(--state-warning); }
.sc-follow { display: inline-flex; align-items: center; gap: var(--s-2); min-height: var(--hit); padding: 0 var(--s-3);
  border: 1px solid var(--line-strong); border-radius: var(--r-2); background: var(--surface-2); color: var(--text-1);
  font: inherit; cursor: pointer; }
.sc-follow[aria-pressed="true"] .sc-dot { background: var(--accent); }
.sc-tape { display: grid; gap: var(--s-1); padding: var(--s-2) var(--gutter) var(--s-8); }
.sc-line { display: grid; grid-template-columns: var(--s-8) minmax(0, 1fr); gap: var(--s-2); }
.sc-line-tc { align-self: center; padding-top: var(--lh-1); font-size: var(--fs-1); line-height: var(--lh-1);
  color: var(--text-3); font-variant-numeric: tabular-nums; }
/* A vertical swipe scrolls the tape; a sideways one scrubs the line. */
.sc-line-body { position: relative; padding-top: var(--lh-1); cursor: pointer; user-select: none; touch-action: pan-y; }
.sc-cuts { position: absolute; inset: 0 0 4px; pointer-events: none; }
.sc-cut { position: absolute; top: 0; bottom: 0; z-index: 1; border-left: 1px solid var(--text-2); }
.sc-cut > .sc-dot { position: absolute; top: 4px; left: 3px; }
.sc-cut-name { position: absolute; top: 0; left: 12px; font-size: var(--fs-1); line-height: var(--lh-1);
  color: var(--text-1); white-space: nowrap; }
.sc-cut[data-flip="true"] > .sc-dot { left: -9px; }
.sc-cut[data-flip="true"] .sc-cut-name { left: auto; right: 12px; }
.sc-cut[data-named="false"] .sc-cut-name { display: none; }
.sc-stills { display: grid; grid-template-columns: repeat(var(--per-row), minmax(0, 1fr)); gap: 1px; }
.sc-still { aspect-ratio: 16 / 9; overflow: hidden; background: var(--surface-2); border-radius: var(--r-1); }
.sc-still canvas { display: block; width: 100%; height: 100%; }
.sc-still[data-picked="true"] { outline: 1px solid var(--accent); outline-offset: -1px; }
.sc-still[data-picked="true"] canvas { opacity: 0.85; }
.sc-band { position: relative; height: 2px; margin-top: 2px; }
.sc-band span { position: absolute; top: 0; bottom: 0; background: var(--hue); }
.sc-band span[data-state="stale"] { background: var(--state-stale); }
.sc-band span[data-state="rendered"] { background: var(--state-rendered); }
.sc-band span[data-state="approved"] { background: var(--state-approved); }
.sc-band span[data-state="findings"] { background: var(--state-findings); }
.sc-band span[data-state="warning"] { background: var(--state-warning); }
.sc-playhead { position: absolute; top: var(--lh-1); bottom: 0; z-index: 2; width: 2px; margin-left: -1px;
  background: var(--accent); pointer-events: none; }

.sc-focus { position: sticky; top: var(--header-h); height: calc(100dvh - var(--header-h)); overflow-y: auto;
  background: var(--surface-1); border-left: var(--border); }
.sc-focus-head { display: flex; align-items: center; gap: var(--s-2); min-height: var(--panel-head-h); padding: 0 var(--gutter); }
.sc-grip { display: none; }
.sc-panel-title { font-size: var(--fs-2); font-weight: var(--w-3); letter-spacing: var(--track-caps);
  text-transform: uppercase; color: var(--text-1); }
.sc-panel-title span { font-weight: var(--w-1); letter-spacing: normal; text-transform: none; color: var(--text-3); }
.sc-picked { margin-left: auto; font-size: var(--fs-1); color: var(--accent); }

.sc-card { display: grid; align-content: start; gap: var(--s-2); padding: 0 var(--gutter) var(--s-4); }
.sc-card[data-size="tile"] { gap: var(--s-1); padding: 0 0 var(--s-2); overflow: hidden; background: var(--surface-2);
  border: var(--border); border-radius: var(--r-2); }
.sc-card[data-size="tile"][data-selected="true"] { border-color: var(--accent); }
.sc-card[data-size="tile"] > :not(.sc-card-picture) { padding: 0 var(--s-2); }
.sc-card-picture { position: relative; aspect-ratio: 16 / 9; overflow: hidden; background: var(--surface-0); border-radius: var(--r-1); }
.sc-card-picture img, .sc-card-picture video, .sc-card-picture > canvas { display: block; width: 100%; height: 100%; object-fit: cover; }
.sc-live, .sc-live .stage { width: 100%; height: 100%; padding: 0; }
.sc-card-length { position: absolute; right: var(--s-1); bottom: var(--s-1); padding: 0 var(--s-1); border-radius: var(--r-1);
  background: var(--on-picture-shade); color: var(--on-picture); font-size: var(--fs-1); line-height: var(--lh-1); }
.sc-card-head { display: flex; align-items: center; gap: var(--s-2); min-width: 0; font-size: var(--fs-4); font-weight: var(--w-3); }
.sc-card-name { overflow: hidden; white-space: nowrap; text-overflow: ellipsis; }
.sc-card-name .lab-inspect { max-width: 100%; overflow: hidden; text-overflow: ellipsis; font: inherit; color: inherit; }
.sc-card-blank { display: grid; place-items: center; height: 100%; padding: var(--s-2); text-align: center; overflow-wrap: anywhere; }
.sc-card-verb > .rv-chip { flex: 1; justify-content: center; min-height: var(--hit); }
.sc-card .rv-layers { margin: 0 var(--s-2); }
.sc-hue { flex: none; width: 8px; height: 8px; border-radius: var(--r-1); }
.sc-card-facts { display: grid; grid-template-columns: auto minmax(0, 1fr); gap: var(--s-1) var(--s-3); margin: 0;
  font-size: var(--fs-2); line-height: var(--lh-2); }
.sc-card-facts dt { color: var(--text-2); }
.sc-card-facts dd { margin: 0; color: var(--text-1); font-variant-numeric: tabular-nums; }
.sc-chips { display: flex; flex-wrap: wrap; gap: var(--s-1); }
.sc-chips:empty { display: none; }
.sc-chip { padding: 0 var(--s-1); border: 1px solid currentColor; border-radius: var(--r-1); font-size: var(--fs-1); line-height: var(--lh-1); }
.sc-chip[data-state="stale"] { color: var(--state-stale); }
.sc-chip[data-state="rendered"] { color: var(--state-rendered); }
.sc-chip[data-state="approved"] { color: var(--state-approved); }
.sc-chip[data-state="findings"] { color: var(--state-findings); }
.sc-chip[data-state="warning"] { color: var(--state-warning); }
.sc-card-verb { display: flex; flex-wrap: wrap; gap: var(--s-2); }
.sc-verb { display: inline-flex; flex: 1; align-items: center; justify-content: center; gap: var(--s-2); min-height: var(--hit);
  padding: 0 var(--s-3); border: 1px solid var(--line-strong); border-radius: var(--r-2); background: var(--surface-2);
  color: var(--text-1); font: inherit; white-space: nowrap; cursor: pointer; text-decoration: none; }
.sc-verb:hover:not(:disabled) { background: var(--surface-3); }
.sc-verb[data-primary] { background: var(--accent); border-color: var(--accent); color: var(--accent-ink); font-weight: var(--w-2); }
.sc-verb[data-primary] kbd { border-color: currentColor; color: inherit; }
.sc-verb:disabled { color: var(--text-3); cursor: default; }
.sc-section { display: grid; gap: var(--s-2); padding-top: var(--s-3); border-top: var(--border); }
.sc-section h3 { display: flex; justify-content: space-between; margin: 0; font-size: var(--fs-2); font-weight: var(--w-2); color: var(--text-1); }
.sc-section h3 span { color: var(--text-3); }
.sc-finding, .sc-comment { margin: 0; font-size: var(--fs-2); line-height: var(--lh-2); color: var(--text-2); overflow-wrap: anywhere; }
.sc-finding b { font-weight: var(--w-2); color: var(--state-findings); }
.sc-finding[data-level="warning"] b { color: var(--state-warning); }
.sc-say { width: 100%; min-height: var(--hit); padding: var(--s-2); resize: vertical; background: var(--surface-2);
  border: 1px solid var(--line-strong); border-radius: var(--r-1); color: var(--text-1); font: inherit; }
.sc-swatches { display: grid; grid-template-columns: repeat(auto-fill, minmax(7rem, 1fr)); gap: var(--s-3); }
.sc-swatch { display: grid; gap: var(--s-1); font-size: var(--fs-2); line-height: var(--lh-2); color: var(--text-2); }
.sc-swatch b { font-weight: var(--w-2); color: var(--text-1); }
.sc-swatch-chip { height: var(--s-8); border: var(--border); border-radius: var(--r-1); }

/* The laptop: the selected scene's card at the side. */
@media (min-width: 900px) {
  .sc[data-selected="true"] { grid-template-columns: minmax(0, 1fr) var(--inspector-w); }
}

/* The phone: the card peeks over the tab bar (picture, name, marks, Open in Lab) and opens to the whole card. */
@media (max-width: 899px) {
  .sc-focus { position: fixed; top: auto; left: 0; right: 0; bottom: calc(var(--tabbar-h) + env(safe-area-inset-bottom));
    z-index: 26; height: auto; max-height: 75dvh; border-left: 0; border-top: var(--border);
    border-radius: var(--r-sheet) var(--r-sheet) 0 0; box-shadow: var(--shadow-pop); }
  .sc-focus-head { position: relative; min-height: var(--hit); }
  .sc-grip { display: block; position: absolute; inset: 0; border: 0; background: none; cursor: pointer; }
  .sc-grip::before { content: ""; position: absolute; top: var(--s-2); left: 50%; width: var(--s-8); height: 4px;
    margin-left: calc(var(--s-8) / -2); border-radius: 2px; background: var(--line-strong); }
  .sc-focus[data-expanded="false"] .sc-card { grid-template-columns: 7rem minmax(0, 1fr); column-gap: var(--s-3); align-items: center; }
  .sc-focus[data-expanded="false"] .sc-card-picture { grid-row: span 2; }
  .sc-focus[data-expanded="false"] .sc-card-facts,
  .sc-focus[data-expanded="false"] .sc-section,
  .sc-focus[data-expanded="false"] .sc-verb:not([data-primary]) { display: none; }
  .sc-focus[data-expanded="false"] .sc-card-verb { grid-column: 1 / -1; }
  .sc[data-selected="true"] .sc-tape { padding-bottom: 40dvh; }
}
`;
