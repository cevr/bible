// The review's look, read only through the studio's tokens
// (`player/tokens.css`, design language §3 and §5): panels on `--surface-1`
// with no radius, the kit's buttons and segmented controls (the shell's
// sheet) placed in them, chips in their state's colour, one accent for the playhead, selection, focus and
// the one primary verb, and every grid folding to one column on a phone
// (the transport, one row in the shell's dock, stays in reach while the page
// scrolls: over the tab bar on a phone, under the header on a laptop). Put
// in the page by `mountReview`, so the page needs no
// stylesheet of its own.

import { PHONE, WIDE } from '../viewport.ts';

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
.rv-hint, .rv-meta { color: var(--text-2); font-size: var(--fs-2); line-height: var(--lh-2); }
.rv-row { display: flex; flex-wrap: wrap; gap: var(--s-2); align-items: center; }
.rv-pick { margin-bottom: var(--s-3); }
/* A set's modes, and in Compare its layouts beside them (wrapping under on a phone). */
.rv-set-tools { display: flex; flex-wrap: wrap; gap: var(--s-2); margin-bottom: var(--s-3); }
.rv-grid { display: grid; gap: var(--s-3); grid-template-columns: repeat(auto-fill, minmax(min(100%, 340px), 1fr)); }
.rv-grid.rv-wide { grid-template-columns: repeat(auto-fill, minmax(min(100%, 440px), 1fr)); }
.rv-grid.rv-two { grid-template-columns: repeat(auto-fit, minmax(min(100%, 640px), 1fr)); }
.rv-card { background: var(--surface-1); overflow: hidden; display: flex; flex-direction: column; min-width: 0; }
a.rv-card { text-decoration: none; }
a.rv-card:hover { background: var(--surface-2); }
.rv-card video, .rv-media { display: block; width: 100%; aspect-ratio: 16 / 9; background: var(--surface-0); object-fit: contain; }
.rv-card.rv-tall video { aspect-ratio: auto; max-height: 70vh; }
/*
 * On a laptop a Set's picture is no taller than its view's room on the
 * first screen (\`--rv-room\`: under the header, the set's tools row, the
 * docked transport and the gaps between them), less the rows its view shows
 * over it (\`--rv-pick-h\`: a row of chips and its gap). A version's picture
 * (one alone takes the page's width) is contained, so a shorter box
 * letterboxes the frame, and is less its caption too (\`--rv-cap-h\`: a hit
 * and its padding), which stays on the first screen. A wipe's frame and a
 * difference's are narrowed to the room at 16:9, so their pictures still
 * fill them and the divider splits the picture itself; their captions start
 * at the fold, as the at-rest budget (UR2-17) counts those views.
 */
@media ${WIDE} {
  .rv-main {
    --rv-room: calc(100dvh - var(--header-h) - var(--s-4) - var(--control-h) - 2 * var(--s-1)
      - 2 * var(--s-3) - var(--dock-h));
    --rv-cap-h: calc(var(--hit) + 2 * var(--s-2));
    --rv-pick-h: calc(var(--control-h) + var(--s-3));
  }
  .rv-grid > .rv-card[data-id] video { max-height: calc(var(--rv-room) - var(--rv-cap-h)); }
  .rv-wipe { max-width: calc((var(--rv-room) - var(--rv-pick-h)) * 16 / 9); margin-inline: auto; }
  /* A difference shows stills: no transport is docked over it, its room is the dock's too. */
  .rv-diff {
    max-width: calc((var(--rv-room) + var(--dock-h) + var(--s-3) - 2 * var(--rv-pick-h)) * 16 / 9);
    margin-inline: auto;
  }
}
/* A version's picture is its card's to press: a long-press opens the card's menu (its steps,
   SU-11), never the browser's own over a video, which takes the touch. */
.rv-card video:not([controls]) { pointer-events: none; }
/* A still that opens the lightbox: a bare button around its picture. */
.rv-zoom { display: block; width: 100%; padding: 0; border: 0; background: none; color: inherit; cursor: zoom-in; }
.rv-zoom:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }
/* The pair wiped (PA-8): both videos stacked full width, the other right of the divider. */
.rv-wipe { position: relative; background: var(--surface-0); overflow: hidden; touch-action: pan-y; }
.rv-wipe video, .rv-wipe canvas { display: block; width: 100%; aspect-ratio: 16 / 9; object-fit: contain; }
.rv-wipe .rv-wipe-other { position: absolute; inset: 0; }
.rv-wipe-line { position: absolute; top: 0; bottom: 0; width: 2px; margin-left: -1px; background: var(--on-picture); }
/* The grip's target is its whole --hit square (a round button is hit only
   inside its circle); the circle is drawn, the same size, by ::before. */
.rv-wipe-grip {
  position: absolute; top: 50%; left: 50%; width: var(--hit); height: var(--hit); transform: translate(-50%, -50%);
  border: 0; background: none; cursor: ew-resize; touch-action: none; padding: 0;
}
.rv-wipe-grip::before {
  content: ''; position: absolute; inset: 0;
  border-radius: var(--r-dot); border: 2px solid var(--on-picture); background: var(--on-picture-shade);
}
.rv .rv-wipe-grip:focus-visible { box-shadow: none; }
.rv .rv-wipe-grip:focus-visible::before { box-shadow: var(--focus-ring); }
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
/* A hear button is the kit's icon button (a speaker, \`--accent\` once it is on), at its caption's end. */
.rv-cap > .rv-sound { margin-left: auto; }
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
.rv-badge:is([data-approval="stale"], [data-state="stale"]) { color: var(--state-stale); }
.rv-picked { display: inline-flex; align-items: center; gap: var(--s-1); color: var(--text-1); font-size: var(--fs-2); font-weight: var(--w-2); }
.rv-picked svg { width: 14px; height: 14px; flex: none; }
.rv-picked circle { fill: var(--text-1); }
.rv-picked path { fill: none; stroke: var(--surface-1); stroke-width: 2.2; stroke-linecap: round; stroke-linejoin: round; }
/*
 * The transport: one row in the page's dock (\`.sh-dock\`, the shell's), on
 * Choices, a Set and Project alike: play, the time, the scrub taking what is
 * left, then the rate. On a phone the time is where the clock is; the scrub
 * shows the end. On a laptop the header's timecode is the time, and the row
 * says only the length.
 */
.rv-transport { flex: 1; display: flex; flex-wrap: nowrap; align-items: center; gap: var(--s-3); min-width: 0; }
@media ${WIDE} {
  .rv-main .sh-dock:not(.pj-dock) { margin-bottom: var(--s-3); }
  /* One timecode on a laptop (SU-12): the header's; the row keeps the length. */
  .rv-time-at { display: none; }
}
/* Play: the kit's primary button, square. */
.rv-big { width: var(--control-h); padding: 0; font-size: var(--fs-4); flex: none; }
.rv-transport input[type="range"] { flex: 1 1 0; min-width: 0; }
.rv-transport > .sh-btn { flex: none; }
.rv-time { color: var(--text-1); font-size: var(--fs-5); line-height: var(--lh-5); font-weight: var(--w-2); white-space: nowrap; flex: none; }
@media ${PHONE} {
  .rv-transport { gap: var(--s-2); }
  .rv-time-rest { display: none; }
}
.rv-time[data-state="Buffering"] { color: var(--accent); }
/* A clock whose media cannot play: the row says so where the scrub was. */
.rv-transport > .rv-failed {
  flex: 1 1 0; min-width: 0; color: var(--state-warning);
  font-size: var(--fs-2); line-height: var(--lh-2); overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
}
/*
 * A lone video (a video in no set, a render in a sheet): its picture a press
 * that plays or pauses it, then, once it has moved, its row under it in its
 * card. Its clock is its own, so the row says its time on a laptop too.
 */
.rv-alone-picture { position: relative; display: block; width: 100%; padding: 0; border: 0; background: none; cursor: pointer; }
.rv-alone-picture:focus-visible { outline: none; box-shadow: var(--focus-ring); }
/* One whose media cannot play says so across the foot of its picture. */
.rv-alone-picture .rv-failed {
  position: absolute; left: 0; right: 0; bottom: 0; padding: var(--s-2) var(--s-3);
  background: var(--backdrop-deep); color: var(--state-warning);
  font-size: var(--fs-2); line-height: var(--lh-2); text-align: left;
}
.rv-alone-row { padding: var(--s-2) var(--s-3); }
@media ${WIDE} {
  .rv-alone-row .rv-time-at { display: inline; }
}
.rv-lightbox {
  position: fixed; inset: 0; background: var(--backdrop-deep); display: grid; place-items: center;
  z-index: 20; padding: var(--s-4); cursor: zoom-out;
}
.rv-lightbox { margin: 0; grid-template-rows: minmax(0, 1fr) auto; gap: var(--s-2); }
.rv-lightbox img { max-width: 100%; max-height: 100%; }
.rv-lightbox figcaption { color: var(--text-2); font-size: var(--fs-2); }
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
/* The row whose inspector is open (design language §5, List row; SU-13): its left edge in the
   accent, on Choices' variant rows and a Set's version cards alike (Project's tiles below). */
:is(.rv-take, .rv-card)[data-selected="true"] { box-shadow: inset 2px 0 var(--accent); }
.rv-take { padding-left: var(--s-2); }
/* The choices as a list (design language §6, Choices): each point a group across the column, each variant one row, its name and line at the start and its hear buttons and verbs at the end (wrapping there, the name keeping at least 10rem or half the row). */
.rv-list { display: flex; flex-direction: column; gap: var(--s-3); }
.rv-list .rv-take { display: grid; grid-template-columns: minmax(min(10rem, 50%), 1fr) minmax(0, auto); column-gap: var(--s-3); row-gap: var(--s-1); align-items: center; }
.rv-list .rv-take > .rv-acts { grid-column: 2; grid-row: 1 / span 2; justify-content: flex-end; }
/* A long name wraps inside its column rather than running under the verbs. */
.rv-list .rv-take .lab-inspect { max-width: 100%; text-align: start; }
.rv-list .rv-take .rv-name { white-space: normal; overflow-wrap: anywhere; }
.rv-knob input[type="range"] { flex: 1; min-width: 0; max-width: 320px; }
/*
 * Project (design language §7): the transport docked (over the tab bar on a
 * phone, under the header across the page on a laptop) or the line that says
 * the film has no render; the film's panel, its state band a segment a scene
 * in its hue, its state's colour at its foot; each act a panel, its name in caps,
 * holding its scenes: one row of cards on a laptop (the act's arrangement,
 * scrolling sideways when it runs long), a row each on a phone, edge to edge.
 */
.rv-no-cut { margin: 0; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.pj-film { margin-bottom: var(--s-4); }
/* Its lines stand apart, so the chip's hit-slop never reaches the name's line. */
.pj-film-head { display: flex; flex-wrap: wrap; align-items: center; gap: var(--s-2) var(--s-3); min-height: var(--hit); }
.pj-film-head > .lab-named { font-size: var(--fs-4); font-weight: var(--w-3); }
/*
 * The findings chip is drawn small, as the mock has it; its target is the
 * line's height through a hit-slop (its neighbours are too near for spacing).
 */
.pj-film-head .sh-btn { position: relative; min-height: var(--control-h); }
.pj-film-head .sh-btn::before { content: ''; position: absolute; left: 0; right: 0;
  top: min(0px, calc((var(--control-h) - var(--hit)) / 2)); bottom: min(0px, calc((var(--control-h) - var(--hit)) / 2)); }
.pj-film-length, .pj-film-counts, .rv-film-counts { color: var(--text-2); font-size: var(--fs-2); font-variant-numeric: tabular-nums; }
/* A Films card's band sits between the film's name and its counts. */
.rv-film-card .pj-band { margin: var(--s-2) 0; }
/* A segment a scene in its hue, its state a foot of the state's colour, a dot when it has findings. */
.pj-band { display: flex; gap: 1px; height: calc(var(--s-2) + 2px); margin: var(--s-2) 0 var(--s-3); }
.pj-band span { position: relative; flex-basis: 0; min-width: 0; background: var(--hue); }
.pj-band span[data-state="stale"] { box-shadow: inset 0 -2px 0 var(--state-stale); }
.pj-band span[data-state="rendered"] { box-shadow: inset 0 -2px 0 var(--state-rendered); }
.pj-band span[data-state="approved"] { box-shadow: inset 0 -2px 0 var(--state-approved); }
.pj-band span:is([data-state="findings"], [data-state="warning"])::after { content: ''; position: absolute;
  right: 2px; top: 2px; width: var(--s-1); height: var(--s-1); border-radius: var(--r-dot); background: var(--state-findings); }
.pj-band span[data-state="warning"]::after { background: var(--state-warning); }
.pj-act, .pj-loose { margin: 0 calc(-1 * var(--gutter)); padding: 0 var(--gutter) var(--s-4); border-top: var(--border); }
.pj-act-head { display: flex; flex-wrap: wrap; align-items: center; gap: 0 var(--s-2); min-height: var(--hit);
  color: var(--text-2); font-size: var(--fs-2); line-height: var(--lh-2); }
.pj-act-head > .lab-named { color: var(--text-1); font-weight: var(--w-2); text-transform: uppercase;
  letter-spacing: var(--track-caps); }
/* A button sets its own case: the name's button takes the head's caps. */
.pj-act-head > .lab-named .lab-inspect { text-transform: inherit; letter-spacing: inherit; }
.pj-act-meta { font-variant-numeric: tabular-nums; }
.pj-loose { padding-top: var(--s-3); }
.pj-scenes { display: grid; gap: var(--s-3); }
.pj-still { width: 100%; height: 100%; }
.pj-still canvas { display: block; width: 100%; height: 100%; object-fit: cover; }
.rv-scene { min-width: 0; cursor: pointer; }
@media ${WIDE} {
  .pj-dock { margin: calc(-1 * var(--s-4)) calc(-1 * var(--gutter)) var(--s-4); }
  .pj-scenes { grid-auto-flow: column; grid-auto-columns: 13.5rem; justify-content: start;
    overflow-x: auto; padding-bottom: var(--s-1); }
}
@media ${PHONE} {
  .pj-act, .pj-loose { padding-bottom: 0; }
  .pj-scenes { gap: 0; margin: 0 calc(-1 * var(--gutter)); }
  .pj-scenes .sc-card[data-size="tile"] { padding: var(--s-2) var(--gutter); border-width: 0 0 1px; border-radius: 0;
    background: none; }
  .pj-scenes .sc-card[data-size="tile"][data-selected="true"] { box-shadow: inset 2px 0 var(--accent); }
}
.rv-tag[data-state="stale"] { color: var(--state-stale); }
.rv-choices { display: contents; }
/*
 * The kinds strip: one row of tabs (scrolling sideways on a phone), held
 * under the header as the page scrolls, as Scenes' tape bar is; on a laptop
 * under the dock held there too.
 */
.rv-kinds {
  display: flex; gap: var(--s-1); margin-top: var(--s-1); padding: var(--s-1) 0; overflow-x: auto;
  position: sticky; top: var(--header-h); z-index: 10; background: var(--surface-0);
}
@media ${WIDE} {
  .rv-kinds { top: calc(var(--header-h) + var(--dock-h)); }
}
.rv-kinds .sh-btn { flex: none; }
.rv-kinds .rv-count { color: var(--text-3); font-variant-numeric: tabular-nums; }
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
.rv .lab-count-hit:focus-visible { box-shadow: none; }
.rv .lab-count-hit:focus-visible > .lab-count { box-shadow: var(--focus-ring); }
/*
 * Every target is the pointer's size, --hit each way (design language §3: a
 * finger's 44 px on the phone, 28 px on the laptop), grown by padding, never
 * by bigger text. A slider, a segment and a sound button are the kit's
 * (the shell's sheet), --hit already; a loose video's file link --hit square; a
 * row or head that holds a name (the Project's film and act heads too), a
 * finding's time and a part's choice link full rows --hit tall (a name's own
 * hit-slop, in the commands' sheet, then stays inside its row).
 */
.rv-cap > a.rv-hint { display: inline-flex; align-items: center; justify-content: center; min-height: var(--hit); min-width: var(--hit); }
.rv-row:has(> .lab-named) { min-height: var(--hit); }
.rv-at, .rv-plays .rv-inline-link { display: inline-flex; align-items: center; min-height: var(--hit); vertical-align: middle; }
@media ${PHONE} {
  .rv-main { padding: var(--s-3) var(--gutter) var(--s-8); }
  .rv-cap { flex-wrap: wrap; }
  .rv-tag { white-space: normal; overflow-wrap: anywhere; }
  /* A row's state word moves whole to the next line, never broken in two. */
  .rv-take .rv-tag { overflow-wrap: normal; }
}
`;
