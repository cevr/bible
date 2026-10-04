// The review's look, read only through the studio's tokens
// (`player/tokens.css`, design language §3 and §5): panels on `--surface-1`
// with no radius, quiet buttons and segmented controls with no pills, chips
// in their state's colour, one accent for the playhead, selection, focus and
// the one primary verb, and every grid folding to one column on a phone
// (the transport stays in reach under the shell's header while the page
// scrolls). Put in the page by `mountReview`, so the page needs no
// stylesheet of its own.

export const REVIEW_CSS = `
body.rv {
  color-scheme: dark;
  margin: 0; background: var(--surface-0); color: var(--text-1);
  font-family: var(--font); font-size: var(--body-fs); line-height: var(--body-lh);
}
.rv *, .rv *::before, .rv *::after { box-sizing: border-box; }
.rv a { color: inherit; }
.rv-main { padding: var(--s-4) var(--gutter) var(--s-8); padding-bottom: max(var(--s-8), env(safe-area-inset-bottom)); max-width: 1900px; margin: 0 auto; }
.rv-h {
  font-size: var(--fs-2); line-height: var(--lh-2); text-transform: uppercase; letter-spacing: var(--track-caps);
  color: var(--text-2); margin: var(--s-6) 0 var(--s-2); font-weight: var(--w-2);
}
.rv-h small { text-transform: none; letter-spacing: 0; font-weight: var(--w-1); }
.rv-hint, .rv-meta { color: var(--text-2); font-size: var(--fs-2); line-height: var(--lh-2); }
.rv-row { display: flex; flex-wrap: wrap; gap: var(--s-2); align-items: center; }
.rv-pick { margin-bottom: var(--s-3); }
.rv-seg { display: inline-flex; border: var(--border); border-radius: var(--r-2); overflow: hidden; flex-wrap: wrap; }
.rv-seg button {
  background: none; border: 0; color: var(--text-2); padding: 0 var(--s-3); font: inherit; font-size: var(--fs-2);
  cursor: pointer; min-height: var(--control-h);
}
.rv-seg button[aria-pressed="true"] { background: var(--surface-3); color: var(--text-1); }
.rv-seg button:hover:not([aria-pressed="true"]) { color: var(--text-1); }
.rv-chip {
  display: inline-flex; align-items: center; border: 1px solid var(--line-strong); background: none; color: var(--text-1);
  border-radius: var(--r-2); padding: 0 var(--s-3); cursor: pointer; font: inherit; text-decoration: none;
  min-height: var(--control-h);
}
.rv-chip:hover { background: var(--surface-3); }
.rv-chip[aria-pressed="true"] { background: var(--surface-3); border-color: var(--accent); }
.rv-chip[aria-busy="true"] { color: var(--text-3); }
.rv-set-tools { margin-bottom: var(--s-3); }
.rv-grid { display: grid; gap: var(--s-3); grid-template-columns: repeat(auto-fill, minmax(min(100%, 340px), 1fr)); }
.rv-grid.rv-wide { grid-template-columns: repeat(auto-fill, minmax(min(100%, 440px), 1fr)); }
.rv-grid.rv-two { grid-template-columns: repeat(auto-fit, minmax(min(100%, 640px), 1fr)); }
.rv-grid.rv-scenes { grid-template-columns: repeat(auto-fill, minmax(min(100%, 200px), 1fr)); }
.rv-card { background: var(--surface-1); overflow: hidden; display: flex; flex-direction: column; min-width: 0; }
a.rv-card { text-decoration: none; }
a.rv-card:hover { background: var(--surface-2); }
.rv-card video, .rv-media { display: block; width: 100%; aspect-ratio: 16 / 9; background: var(--surface-0); object-fit: contain; }
.rv-card.rv-tall video { aspect-ratio: auto; max-height: 70vh; }
.rv-zoom { cursor: zoom-in; }
/* The pair wiped (PA-8): both videos stacked full width, the other right of the divider. */
.rv-wipe { position: relative; background: var(--surface-0); overflow: hidden; touch-action: pan-y; }
.rv-wipe video { display: block; width: 100%; aspect-ratio: 16 / 9; object-fit: contain; }
.rv-wipe .rv-wipe-other { position: absolute; inset: 0; }
.rv-wipe-line { position: absolute; top: 0; bottom: 0; width: 2px; margin-left: -1px; background: var(--on-picture); }
.rv-wipe-grip {
  position: absolute; top: 50%; left: 50%; width: var(--hit); height: var(--hit); transform: translate(-50%, -50%);
  border-radius: 50%; border: 2px solid var(--on-picture); background: var(--on-picture-shade);
  cursor: ew-resize; touch-action: none; padding: 0;
}
.rv-wipe-caps { margin-top: var(--s-2); }
/* The pair's difference at a moment: the other's still over the first's, in the difference blend. */
.rv-diff { position: relative; background: var(--surface-0); isolation: isolate; }
.rv-diff img { display: block; width: 100%; aspect-ratio: 16 / 9; object-fit: contain; }
.rv-diff .rv-diff-other { position: absolute; inset: 0; height: 100%; mix-blend-mode: difference; }
.rv-cap { display: flex; align-items: center; gap: var(--s-2); padding: var(--s-2) var(--s-3); min-width: 0; }
.rv-name { font-weight: var(--w-2); white-space: nowrap; }
.rv-tag {
  color: var(--text-2); font-size: var(--fs-2); line-height: var(--lh-2); flex: 1; min-width: 0;
  white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
}
.rv-sound {
  background: none; border: 0; color: var(--text-2); border-radius: var(--r-2); padding: 0 var(--s-2); cursor: pointer;
  font: inherit; min-width: var(--control-h); min-height: var(--control-h); filter: grayscale(1);
}
.rv-sound:hover { background: var(--surface-3); color: var(--text-1); }
.rv-sound.on { color: var(--accent); filter: none; }
.rv-letter {
  font-weight: var(--w-3); min-width: var(--s-6); height: var(--s-6); padding: 0 var(--s-1); border-radius: var(--r-1);
  display: grid; place-items: center; background: var(--surface-3); color: var(--text-1); flex: none; font-size: var(--fs-2);
}
.rv-body { padding: var(--s-2) var(--s-3); }
.rv-strip { display: grid; grid-auto-flow: column; grid-auto-columns: 1fr; gap: 1px; background: var(--surface-0); }
.rv-strip img { width: 100%; aspect-ratio: 16 / 9; object-fit: cover; display: block; }
.rv-badge {
  display: inline-block; font-size: var(--fs-1); line-height: var(--lh-1); font-weight: var(--w-2);
  border: 1px solid currentColor; color: var(--text-2); border-radius: var(--r-1); padding: 0 var(--s-1); margin-left: var(--s-1);
}
.rv-badge[data-approval="approved"] { color: var(--state-approved); }
.rv-badge[data-approval="stale"] { color: var(--state-stale); }
.rv-picked { display: inline-flex; align-items: center; gap: var(--s-1); color: var(--text-1); font-size: var(--fs-2); font-weight: var(--w-2); }
.rv-picked svg { width: 14px; height: 14px; flex: none; }
.rv-picked circle { fill: var(--text-1); }
.rv-picked path { fill: none; stroke: var(--surface-1); stroke-width: 2.2; stroke-linecap: round; stroke-linejoin: round; }
.rv-transport {
  position: sticky; top: var(--header-h); z-index: 4; display: flex; flex-wrap: wrap; align-items: center;
  gap: var(--s-2) var(--s-3); margin-bottom: var(--s-3); background: var(--surface-1); border-bottom: var(--border);
  padding: var(--s-2) var(--s-3);
}
.rv-big {
  width: var(--control-h); height: var(--control-h); border-radius: var(--r-2); border: 0; background: var(--accent);
  color: var(--accent-ink); font-size: var(--fs-4); cursor: pointer; flex: none;
}
.rv-transport input[type="range"] { flex: 1 1 220px; min-width: 0; accent-color: var(--accent); height: var(--control-h); }
.rv-time { color: var(--text-1); font-size: var(--fs-5); line-height: var(--lh-5); font-weight: var(--w-2); white-space: nowrap; }
.rv-time[data-state="Buffering"] { color: var(--accent); }
.rv-lightbox {
  position: fixed; inset: 0; background: var(--backdrop-deep); display: grid; place-items: center;
  z-index: 20; padding: var(--s-4); cursor: zoom-out;
}
.rv-lightbox img { max-width: 100%; max-height: 100%; }
.rv-note {
  background: var(--surface-1); padding: var(--s-3) var(--s-4); font-size: var(--fs-3); line-height: var(--lh-3);
  min-width: 0; overflow-wrap: anywhere;
}
.rv-note h1, .rv-note h2, .rv-note h3, .rv-note h4 {
  color: var(--text-1); margin: var(--s-3) 0 var(--s-1); font-size: var(--fs-4); line-height: var(--lh-4); font-weight: var(--w-3);
}
.rv-note h1 { font-size: var(--fs-5); line-height: var(--lh-5); }
.rv-note h3, .rv-note h4 { font-size: var(--fs-3); line-height: var(--lh-3); }
.rv-note ul { margin: var(--s-1) 0; padding-left: var(--s-4); }
.rv-note p { margin: var(--s-1) 0; }
.rv-note code { background: var(--surface-2); padding: 0 var(--s-1); border-radius: var(--r-1); font-size: var(--fs-2); }
.rv-note table { border-collapse: collapse; font-size: var(--fs-2); margin: var(--s-2) 0; display: block; overflow-x: auto; }
.rv-note td { border: var(--border); padding: var(--s-1) var(--s-2); vertical-align: top; }
.rv-verdict { border-left: 2px solid var(--line-strong); padding: var(--s-2) var(--s-3); margin: 0 0 var(--s-3); background: var(--surface-2); }
.rv-doc { background: var(--surface-1); margin-bottom: var(--s-2); }
.rv-doc summary { padding: var(--s-3) var(--s-4); cursor: pointer; }
.rv-doc .rv-note { border-top: var(--border); }
.rv .empty { color: var(--text-2); padding: var(--s-8) 0; text-align: center; }
.rv button:disabled { color: var(--text-3); cursor: default; }
.rv-picture { margin-bottom: var(--s-3); }
.rv-picture video { max-height: 62vh; }
.rv-pending .rv-row { padding: var(--s-2) var(--s-3); justify-content: space-between; }
.rv-option .rv-body { display: flex; flex-direction: column; gap: var(--s-2); }
.rv-take { border-top: var(--border); padding-top: var(--s-2); display: flex; flex-direction: column; gap: var(--s-2); }
/* The choices as a list (design language §6, Choices): each point a group across the column, each variant one row, its name and line at the start and its hear buttons and verbs at the end (wrapping there, the name keeping at least 10rem or half the row). */
.rv-list { display: flex; flex-direction: column; gap: var(--s-3); }
.rv-list .rv-take, .rv-layers .rv-take { display: grid; grid-template-columns: minmax(min(10rem, 50%), 1fr) minmax(0, auto); column-gap: var(--s-3); row-gap: var(--s-1); align-items: center; }
.rv-list .rv-take > .rv-acts, .rv-layers .rv-take > .rv-acts { grid-column: 2; grid-row: 1 / span 2; justify-content: flex-end; }
/* A long name wraps inside its column rather than running under the verbs. */
.rv-list .rv-take .lab-inspect, .rv-layers .rv-take .lab-inspect { max-width: 100%; text-align: start; }
.rv-list .rv-take .rv-name, .rv-layers .rv-take .rv-name { white-space: normal; overflow-wrap: anywhere; }
.rv-comments { margin: var(--s-1) 0; padding-left: var(--s-4); font-size: var(--fs-2); overflow-wrap: anywhere; }
.rv-say { flex-wrap: nowrap; }
.rv-say .rv-comment-input {
  flex: 1; min-width: 0; background: var(--surface-2); color: var(--text-1); min-height: var(--control-h);
  border: 1px solid var(--line-strong); border-radius: var(--r-1); padding: 0 var(--s-2); font: inherit;
}
.rv-say .rv-comment-input::placeholder { color: var(--text-3); }
.rv-knob input[type="range"] { flex: 1; min-width: 0; max-width: 320px; accent-color: var(--accent); }
.rv-film, .rv-act { margin-bottom: var(--s-4); }
.rv-scene .sc-card-picture video { max-height: none; }
.rv-tag[data-state="stale"] { color: var(--state-stale); }
.rv-writes { background: var(--surface-1); border: var(--border); border-radius: var(--r-2); padding: var(--s-2) var(--s-3); margin-bottom: var(--s-3); }
.rv-writes { display: flex; flex-wrap: wrap; gap: var(--s-2); align-items: center; }
.rv-check[data-state="findings"] { color: var(--state-findings); border-color: var(--state-findings); }
.rv-check[data-state="warning"] { color: var(--state-warning); border-color: var(--state-warning); }
.rv-group + .rv-group { margin-top: var(--s-4); }
.rv-group h3 { display: flex; gap: var(--s-2); align-items: baseline; margin: 0; font-size: var(--fs-2); font-weight: var(--w-2); color: var(--text-2); }
.rv-at { font: inherit; font-variant-numeric: tabular-nums; color: var(--accent); background: none; border: 0; padding: 0; cursor: pointer; }
.rv-at:disabled { color: var(--text-3); cursor: default; }
.rv-plays .rv-row { justify-content: space-between; margin-top: var(--s-2); }
.rv-inline-link { color: var(--text-1); text-decoration: none; }
.rv-inline-link:hover { color: var(--accent); }
.rv-findings { margin: var(--s-2) 0 0; padding-left: var(--s-4); font-size: var(--fs-2); overflow-wrap: anywhere; }
.rv-findings li[data-level="error"] b { color: var(--state-findings); }
.rv-findings li[data-level="warning"] b { color: var(--state-warning); }
.rv-films { margin-bottom: var(--s-1); }
.rv :focus-visible { outline: none; box-shadow: var(--focus-ring); }
@media (max-width: 600px) {
  .rv-main { padding: var(--s-3) var(--gutter) var(--s-8); }
  .rv-transport { padding: var(--s-2) var(--s-2); gap: var(--s-2); }
  .rv-cap { flex-wrap: wrap; }
  .rv-tag { white-space: normal; overflow-wrap: anywhere; }
  /* A row's state word moves whole to the next line, never broken in two. */
  .rv-take .rv-tag { overflow-wrap: normal; }
}
`;
