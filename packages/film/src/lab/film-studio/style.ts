// The studio page's styles (design §1, §6, §7): every colour, face and
// size read through the tokens (`player/tokens.css`), the rows' heights from
// `geometry.ts`, the phone's layout under `PHONE`. The inspector's place is
// the one grid template of `.st-studio` (layout C: beside the viewer), so
// moving it is a change to those rules alone.

import { PHONE } from '../viewport.ts';
import {
  BAND_H,
  FLAGS_H,
  HEADER_H,
  HEAD_W,
  INSPECTOR_W,
  NEXT_H,
  PICTURE_LANE_H,
  RULER_H,
  TEXT_LANE_H,
  TRANSPORT_H,
} from './geometry.ts';

const px = (n: number) => `${n}px`;

export const STUDIO_CSS = `
body.film-studio { display: block; overflow: hidden; background: var(--surface-0); }
.studio-root {
  --st-header-h: ${px(HEADER_H)};
  --st-transport-h: ${px(TRANSPORT_H.wide)};
  --st-flags-h: ${px(FLAGS_H.wide)};
  --st-ruler-h: ${px(RULER_H)};
  --st-band-h: ${px(BAND_H)};
  --st-text-h: ${px(TEXT_LANE_H.wide)};
  --st-picture-h: ${px(PICTURE_LANE_H.wide)};
  --st-next-h: ${px(NEXT_H)};
  --st-head-w: ${px(HEAD_W)};
  --st-insp-w: ${px(INSPECTOR_W)};
  --st-gutter: var(--s-4);
}
.st-app { height: 100dvh; display: grid; grid-template-rows: var(--st-header-h) minmax(0, 1fr); color: var(--text-1); font-family: var(--font); font-size: var(--fs-3); line-height: var(--lh-3); }
.st-app button { font: inherit; color: inherit; background: none; border: 0; padding: 0; cursor: pointer; }
.st-app :focus-visible { outline: none; box-shadow: var(--focus-ring); }
.st-icon { width: var(--s-4); height: var(--s-4); fill: none; stroke: currentColor; stroke-width: 2; stroke-linecap: round; stroke-linejoin: round; }
.st-await { margin: 0; padding: var(--s-4); color: var(--text-2); }

/* Header */
.st-header { display: flex; align-items: center; gap: var(--s-3); padding: 0 var(--st-gutter); border-bottom: var(--border); min-width: 0; }
.st-film { font-weight: var(--w-3); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; min-width: 0; }
.st-app .st-ver { display: inline-flex; align-items: center; gap: var(--s-1); height: var(--s-6); padding: 0 var(--s-2); border-radius: var(--r-1); background: var(--surface-2); border: 1px solid var(--line-strong); font-family: var(--font-mono); font-size: var(--fs-2); line-height: var(--lh-2); font-weight: var(--w-1); flex: none; }
.st-ver .st-icon { width: var(--s-3); height: var(--s-3); color: var(--text-2); }
.st-stage { font-size: var(--fs-2); line-height: var(--lh-2); color: var(--text-2); white-space: nowrap; }
.st-spacer { flex: 1; }
.st-status { display: flex; align-items: center; gap: var(--s-3); min-width: 0; font-size: var(--fs-2); line-height: var(--lh-2); color: var(--text-2); }
.st-doing { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 40ch; }
.st-doing::before { content: ''; display: inline-block; width: var(--s-2); height: var(--s-2); border-radius: var(--r-dot); background: var(--k-sound); margin-right: var(--s-2); }
.st-app .st-waits { color: var(--text-1); white-space: nowrap; padding: 0 var(--s-2); height: var(--s-6); border-radius: var(--r-1); }
.st-app .st-waits:hover { background: var(--surface-2); }
.st-version { display: flex; align-items: center; gap: var(--s-3); }
.st-version-n { font-family: var(--font-mono); font-weight: var(--w-1); }
.st-version-text { display: grid; }
.st-version-note { font-size: var(--fs-1); line-height: var(--lh-1); color: var(--text-2); }

/* The one grid: the inspector's place is these rules alone (layout C, provisional). */
.st-studio { min-height: 0; display: grid; grid-template-columns: minmax(0, 1fr) 0; grid-template-rows: minmax(0, 1fr) var(--st-transport-h) var(--st-tl-h, 0); grid-template-areas: "viewer insp" "transport transport" "timeline timeline"; }
.st-studio[data-open="true"] { grid-template-columns: minmax(0, 1fr) var(--st-insp-w); }

/* Viewer */
.st-viewer { grid-area: viewer; min-height: 0; min-width: 0; display: grid; place-items: center; padding: var(--st-gutter) var(--st-gutter) var(--s-2); }
.st-frame { position: relative; height: 100%; max-width: 100%; aspect-ratio: 16 / 9; border-radius: var(--r-2); overflow: hidden; background: var(--surface-1); }
.st-scene, .st-scene .stage { position: absolute; inset: 0; padding: 0; display: grid; place-items: center; }
.st-scene canvas { width: 100%; height: 100%; display: block; }
.st-scene[hidden] { display: none; }
.st-pic { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover; display: block; }
.st-empty { position: absolute; inset: 0; display: grid; place-content: center; gap: var(--s-2); text-align: center; color: var(--text-2); padding: var(--s-8); }
.st-empty b { color: var(--text-1); font-weight: var(--w-2); font-size: var(--fs-4); line-height: var(--lh-4); }
.st-empty p { margin: 0; font-size: var(--fs-2); line-height: var(--lh-2); }
.st-tag { position: absolute; left: var(--s-3); bottom: var(--s-3); display: flex; gap: var(--s-2); align-items: center; padding: var(--s-1) var(--s-2); border-radius: var(--r-1); background: var(--backdrop); font-size: var(--fs-1); line-height: var(--lh-1); color: var(--text-1); }
.st-tag i { width: var(--s-2); height: var(--s-2); border-radius: var(--r-0); background: var(--k-script); }
.st-tag[data-kind="board"] i { background: var(--k-board); }
.st-tag[data-kind="scene"] i { background: var(--k-scene); }

/* Transport */
.st-transport { grid-area: transport; display: flex; align-items: center; gap: var(--st-gutter); padding: 0 var(--st-gutter); min-width: 0; }
.st-tc { font-family: var(--font-mono); font-size: var(--fs-tc); line-height: var(--lh-tc); font-weight: var(--w-1); font-variant-numeric: tabular-nums slashed-zero; white-space: nowrap; min-width: 7.4ch; }
.st-tc small { font-size: var(--fs-2); line-height: var(--lh-2); color: var(--text-3); margin-left: var(--s-2); }
.st-keys { display: flex; align-items: center; gap: 2px; padding: 3px; border-radius: var(--r-pill); background: var(--surface-1); border: var(--border); flex: none; }
.st-app .st-key { width: 38px; height: 34px; display: grid; place-items: center; border-radius: var(--r-2); color: var(--text-1); }
.st-app .st-key:hover { background: var(--surface-3); }
/* Play: a raised neutral key at rest; the blue gradient, with a halo, only while it plays. */
.st-app .st-key[data-look="play"] { position: relative; width: 52px; background: var(--surface-3); box-shadow: inset 0 0 0 1px var(--line-strong); transition: background var(--t-base) var(--ease); }
.st-app .st-key[data-look="play"][aria-pressed="true"] { background: linear-gradient(165deg, var(--accent-a), var(--accent-b)); color: var(--accent-ink); }
.st-key[data-look="play"][aria-pressed="true"]::after { content: ''; position: absolute; inset: 0; border-radius: inherit; box-shadow: 0 0 0 0 var(--accent); animation: st-halo var(--t-sheet) var(--ease) forwards; pointer-events: none; }
@keyframes st-halo { from { box-shadow: 0 0 0 0 var(--accent-wash-strong); } to { box-shadow: 0 0 0 var(--s-3) transparent; } }
.st-caption { flex: 1; min-width: 0; margin: 0; color: var(--text-1); display: -webkit-box; -webkit-line-clamp: 1; -webkit-box-orient: vertical; overflow: hidden; }
.st-app .st-tbtn { height: var(--hit); min-width: var(--hit); padding: 0 var(--s-2); border-radius: var(--r-1); color: var(--text-2); font-family: var(--font-mono); font-size: var(--fs-1); line-height: var(--lh-1); }
.st-app .st-tbtn:hover, .st-app .st-tbtn[aria-pressed="true"] { color: var(--text-1); background: var(--surface-2); }

/* Timeline */
.st-timeline { grid-area: timeline; min-height: 0; margin: 0 var(--st-gutter) var(--st-gutter); border-radius: var(--r-panel); background: var(--surface-1); border: var(--border); box-shadow: 0 -1px 0 0 var(--rim); display: grid; grid-template-columns: var(--st-head-w) minmax(0, 1fr); grid-template-rows: auto minmax(0, 1fr); overflow: hidden; position: relative; }
.st-corner { grid-column: 1; grid-row: 1; border-right: var(--border); border-bottom: var(--border); display: flex; align-items: flex-end; gap: 2px; padding: 0 var(--s-1) var(--s-1) var(--s-2); height: calc(var(--st-flags-h) + var(--st-ruler-h) + var(--st-band-h)); }
.st-heads { grid-column: 1; grid-row: 2; border-right: var(--border); overflow: hidden; }
.st-lane-head { display: flex; align-items: center; gap: var(--s-2); padding: 0 var(--s-2) 0 var(--s-3); border-bottom: var(--border); font-size: var(--fs-2); line-height: var(--lh-2); white-space: nowrap; }
.st-next-head { color: var(--text-3); font-size: var(--fs-1); line-height: var(--lh-1); border-bottom: 0; }
.st-sw { width: var(--s-2); height: var(--s-2); border-radius: var(--r-0); flex: none; background: var(--k-script); }
[data-track="board"] > .st-sw, .st-sw[data-kind="board"] { background: var(--k-board); }
[data-track="voice"] > .st-sw, .st-sw[data-kind="voice"] { background: var(--k-voice); }
[data-track="scenes"] > .st-sw, .st-sw[data-kind="scenes"] { background: var(--k-scene); }
[data-track="sound"] > .st-sw { background: var(--k-sound); }
[data-track="render"] > .st-sw { background: var(--k-render); }
.st-sw[data-kind="concept"] { background: var(--k-concept); }
.st-sw[data-kind="note"] { background: var(--k-note); }
.st-scroller { grid-column: 2; grid-row: 1 / span 2; overflow-x: auto; overflow-y: hidden; position: relative; scrollbar-width: thin; scrollbar-color: var(--surface-3) transparent; }
.st-canvas { position: relative; height: 100%; }
.st-flags { position: absolute; left: 0; right: 0; top: 0; height: var(--st-flags-h); }
.st-flag { position: absolute; top: 0; z-index: 6; display: flex; align-items: center; height: var(--lh-1); text-decoration: none; color: var(--fc); --fc: var(--k-ask); }
.st-flag[data-kind="note"] { --fc: var(--k-note); }
/* A flag is a finger's target: its slop runs down over the ruler (no control), never up out of the timeline. */
.st-flag::before { content: ''; position: absolute; left: 0; top: 0; width: max(100%, var(--hit)); height: var(--hit); }
.st-pin { width: var(--s-2); height: var(--lh-1); margin-left: calc(-1 * var(--s-1)); background: var(--fc); clip-path: polygon(0 0, 100% 0, 100% 64%, 50% 100%, 0 64%); }
.st-flag-word { margin-left: var(--s-1); padding: 0 var(--s-1); border-radius: var(--r-0); background: var(--fc); color: var(--surface-1); font-size: var(--fs-1); line-height: var(--lh-1); font-weight: var(--w-3); }
.st-ruler { position: absolute; left: 0; right: 0; top: var(--st-flags-h); height: var(--st-ruler-h); border-bottom: var(--border); cursor: ew-resize; touch-action: none; }
.st-tick { position: absolute; top: 0; height: 100%; border-left: var(--border); }
.st-tick span { position: absolute; left: var(--s-2); top: 3px; font-family: var(--font-mono); font-size: var(--fs-1); line-height: var(--lh-1); color: var(--text-2); font-variant-numeric: tabular-nums slashed-zero; }
.st-bands { position: absolute; left: 0; right: 0; top: calc(var(--st-flags-h) + var(--st-ruler-h)); height: var(--st-band-h); border-bottom: var(--border); }
.st-band { position: absolute; top: 3px; bottom: 3px; border-radius: var(--r-1); padding: 0 var(--s-2) 0 var(--s-5); display: flex; align-items: center; font-size: var(--fs-1); line-height: var(--lh-1); font-weight: var(--w-3); white-space: nowrap; overflow: hidden; background: var(--band-1); color: var(--band-1-ink); }
.st-band[data-band="2"] { background: var(--band-2); color: var(--band-2-ink); }
.st-band[data-band="3"] { background: var(--band-3); color: var(--band-3-ink); }
.st-band:first-child { padding-left: var(--s-2); }
.st-tr { position: absolute; top: 3px; width: 22px; height: 16px; translate: -50% 0; border-radius: var(--r-1); background: var(--surface-2); box-shadow: 0 0 0 1px var(--line-strong); display: grid; place-items: center; color: var(--text-1); z-index: 2; }
.st-tr .st-icon { width: var(--s-3); height: 9px; fill: currentColor; stroke: none; }
.st-lanes { position: absolute; left: 0; right: 0; top: calc(var(--st-flags-h) + var(--st-ruler-h) + var(--st-band-h)); }
.st-lane { position: relative; height: var(--st-text-h); border-bottom: var(--border); }
.st-lane[data-picture="true"] { height: var(--st-picture-h); }
.st-next { display: flex; align-items: center; gap: var(--s-3); padding-left: var(--s-3); height: var(--st-next-h); border-bottom: 0; font-size: var(--fs-2); line-height: var(--lh-2); color: var(--text-2); white-space: nowrap; }
.st-next-words { position: sticky; left: var(--s-3); display: flex; gap: var(--s-3); }
.st-next em { font-style: normal; color: var(--text-3); }
.st-app .st-clip { position: absolute; top: 5px; bottom: 5px; border-radius: var(--r-1); overflow: hidden; display: flex; align-items: center; padding: 0 var(--s-2); font-size: var(--fs-2); line-height: var(--lh-2); font-weight: var(--w-clip); white-space: nowrap; touch-action: pan-x; background: var(--k-script); color: var(--k-script-ink); }
.st-app .st-clip[data-fit="block"], .st-app .st-clip[data-fit="tick"] { padding: 0; }
.st-clip[data-fit="tick"] { border-radius: var(--r-0); }
.st-app .st-clip:focus-visible { box-shadow: var(--focus-ring-inset); }
.st-lbl { overflow: hidden; text-overflow: ellipsis; position: relative; z-index: 1; }
.st-app .st-clip[data-kind="board"] { background-color: var(--surface-2); background-repeat: no-repeat; background-size: cover; background-position: center; color: var(--text-1); }
.st-clip[data-kind="board"]::before { content: ''; position: absolute; left: 0; right: 0; top: 0; height: 3px; background: var(--k-board); z-index: 1; }
.st-clip[data-picture="true"] > .st-lbl { display: none; }
.st-clip[data-kind="board"] > .st-lbl { position: absolute; left: var(--s-1); bottom: 3px; padding: 0 var(--s-1); border-radius: var(--r-0); background: var(--backdrop); font-size: var(--fs-1); line-height: var(--lh-1); font-weight: var(--w-2); max-width: calc(100% - var(--s-2)); }
.st-app .st-clip[data-kind="voice"] { background: var(--voice-bed); color: var(--k-voice); }
.st-app .st-clip[data-kind="scenes"] { background: var(--k-scene); color: var(--k-scene-ink); }
.st-app .st-clip[data-kind="sound"] { background: var(--k-sound); color: var(--k-sound-ink); }
.st-app .st-clip[data-kind="render"] { background: var(--k-render); color: var(--k-render-ink); }
.st-clip[data-est="true"]::after { content: ''; position: absolute; inset: 0; background: repeating-linear-gradient(-45deg, var(--hatch) 0 5px, transparent 5px 10px); pointer-events: none; }
/* The selected beat: a white outline on every one of its clips, in every lane. */
.st-clip[data-linked="true"]::after { content: ''; position: absolute; inset: 0; border-radius: inherit; box-shadow: inset 0 0 0 2px var(--on-picture); z-index: 3; pointer-events: none; }
.st-marks { position: absolute; left: 0; right: 0; bottom: 1px; height: var(--s-2); z-index: 2; pointer-events: none; }
.st-marks-line { position: absolute; left: 0; right: 0; top: 3.5px; height: 1px; background: var(--k-script-ink); }
.st-marks i { position: absolute; top: 1px; width: 6px; height: 6px; translate: -50% 0; background: var(--mark); rotate: 45deg; border-radius: var(--r-0); box-shadow: 0 0 0 1px var(--k-script-ink); }
.st-playhead { position: absolute; top: var(--st-flags-h); bottom: 0; width: 0; z-index: 8; pointer-events: none; }
.st-playhead::before { content: ''; position: absolute; left: -1px; top: 0; bottom: 0; width: 2px; background: var(--playhead); }
.st-head { position: absolute; top: 0; left: calc(-1 * var(--s-2)); width: var(--s-4); height: var(--s-4); background: var(--playhead); clip-path: polygon(0 0, 100% 0, 100% 58%, 50% 100%, 0 58%); pointer-events: auto; cursor: grab; touch-action: none; }

/* Inspector (a shell: its sections' bodies come with the inspector's own unit) */
.st-insp { grid-area: insp; min-width: 0; min-height: 0; overflow: hidden; padding: var(--st-gutter) var(--st-gutter) var(--s-2) 0; }
.st-studio[data-open="false"] .st-insp { padding: 0; }
.st-pane { height: 100%; overflow-y: auto; border-radius: var(--r-panel); border: var(--border); background: var(--surface-1); min-width: 0; }
.st-pane-head { position: sticky; top: 0; z-index: 2; background: var(--surface-1); display: flex; align-items: center; gap: var(--s-3); padding: var(--s-3) var(--s-2) var(--s-3) var(--s-4); border-bottom: var(--border); }
.st-ttl { min-width: 0; flex: 1; }
.st-ttl h2 { margin: 0; font-size: var(--fs-4); line-height: var(--lh-4); font-weight: var(--w-3); }
.st-sub { font-family: var(--font-mono); font-size: var(--fs-1); line-height: var(--lh-1); color: var(--text-2); font-variant-numeric: tabular-nums slashed-zero; }
.st-app .st-btn { height: var(--s-8); padding: 0 var(--s-3); border-radius: var(--r-1); border: 1px solid var(--line-strong); background: var(--surface-2); font-size: var(--fs-2); line-height: var(--lh-2); white-space: nowrap; }
.st-app .st-btn.primary { border-color: var(--text-1); background: var(--text-1); color: var(--surface-1); font-weight: var(--w-3); }
.st-app .st-btn:disabled { cursor: default; border-color: var(--line-strong); background: var(--surface-2); color: var(--text-3); }
.st-app .st-close { width: var(--s-8); height: var(--s-8); border-radius: var(--r-1); display: grid; place-items: center; color: var(--text-2); flex: none; }
.st-app .st-close:hover { background: var(--surface-3); color: var(--text-1); }
.st-row { display: flex; align-items: center; gap: var(--s-3); height: 40px; padding: 0 var(--s-4); border-bottom: var(--border); font-size: var(--fs-2); line-height: var(--lh-2); color: var(--text-2); }
.st-n { margin-left: auto; font-family: var(--font-mono); font-size: var(--fs-1); line-height: var(--lh-1); color: var(--text-3); }
.st-status-line { grid-area: timeline; display: flex; align-items: center; gap: var(--s-3); padding: 0 var(--st-gutter); color: var(--text-2); }
.st-status-line p { margin: 0; }
.st-reading { display: none; }

/* Phone: the viewer full width, the transport's three keys, three lanes, the words below. */
@media ${PHONE} {
  .studio-root {
    --st-transport-h: ${px(TRANSPORT_H.phone)};
    --st-flags-h: ${px(FLAGS_H.phone)};
    --st-text-h: ${px(TEXT_LANE_H.phone)};
    --st-picture-h: ${px(PICTURE_LANE_H.phone)};
    --st-head-w: 0px;
  }
  .st-header { gap: var(--s-2); }
  .st-spacer, .st-status { display: none; }
  .st-studio, .st-studio[data-open="true"] { grid-template-columns: minmax(0, 1fr); grid-template-rows: auto var(--st-transport-h) var(--st-tl-h, 0) minmax(0, 1fr); grid-template-areas: "viewer" "transport" "timeline" "reading"; }
  .st-viewer { padding: 0; }
  .st-frame { width: 100%; height: auto; border-radius: 0; }
  .st-transport { gap: var(--s-2); }
  .st-caption, .st-key[data-look="edge"] { display: none; }
  .st-keys { margin-left: auto; }
  .st-app .st-key { width: var(--hit); height: var(--hit); }
  .st-app .st-key[data-look="play"] { width: 56px; }
  /* The chip stays its size; a finger's area is its hit-slop, centred on it. */
  .st-app .st-ver { position: relative; }
  .st-app .st-ver::before { content: ''; position: absolute; top: calc(50% - var(--hit) / 2); bottom: calc(50% - var(--hit) / 2); left: min(0px, calc(50% - var(--hit) / 2)); right: min(0px, calc(50% - var(--hit) / 2)); }
  .st-timeline { margin: 0; border-radius: 0; border-width: 1px 0 0; grid-template-columns: 0 minmax(0, 1fr); box-shadow: none; }
  /* A phone keeps its lanes and gives the rest to the words: no lane heads, no zoom corner, no Next row. */
  .st-corner, .st-heads, .st-next { display: none; }
  .st-scroller { grid-column: 1 / span 2; }
  .st-reading { grid-area: reading; display: block; overflow-y: auto; padding: var(--s-3) var(--st-gutter) var(--s-6); border-top: var(--border); }
  .st-studio[data-open="true"] .st-reading { display: none; }
  .st-r-head { display: flex; justify-content: space-between; align-items: baseline; margin-bottom: var(--s-2); font-size: var(--fs-2); line-height: var(--lh-2); }
  .st-r-head b { font-weight: var(--w-3); color: var(--k-script); }
  .st-r-head span { font-family: var(--font-mono); color: var(--text-2); }
  .st-reading p { margin: 0 0 var(--s-2); font-size: var(--fs-4); line-height: var(--lh-4); text-wrap: pretty; }
  .st-reading .st-r-cite { font-family: var(--font-mono); font-size: var(--fs-1); line-height: var(--lh-1); color: var(--text-2); }
  .st-reading .st-reading-waits { display: flex; align-items: center; min-height: var(--hit); margin: 0; color: var(--text-1); font-size: var(--fs-3); line-height: var(--lh-3); }
  .st-insp { grid-area: reading; padding: 0; display: none; }
  .st-studio[data-open="true"] .st-insp { display: block; }
  .st-pane { border-radius: 0; border-width: 1px 0 0; border-color: var(--line-strong); }
  .st-pane-head { padding: var(--s-2) var(--s-2) var(--s-2) var(--s-4); }
  .st-app .st-btn, .st-app .st-close { height: var(--hit); min-width: var(--hit); }
  .st-row { height: 48px; }
  .st-version { min-height: var(--hit); }
}
@media (prefers-reduced-motion: reduce) {
  .st-key[data-look="play"][aria-pressed="true"]::after { animation: none; }
}
`;
