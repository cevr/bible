// The studio page's styles (design §1, §6, §7): every colour, face and
// size read through the tokens (`player/tokens.css`), the rows' heights from
// `geometry.ts`, the phone's layout under `PHONE`. The inspector's place is
// the one grid template of `.st-studio` (layout C: beside the viewer), so
// moving it is a change to those rules alone; its sections' own rules
// (`INSPECTOR_CSS`) ride with the inspector, out of the page's head.

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
/* A bare button draws nothing of its own; the kit's button and segmented control keep their own look. */
.st-app button:where(:not(.sh-btn, .sh-seg > button)) { font: inherit; color: inherit; background: none; border: 0; padding: 0; cursor: pointer; }
.st-app :focus-visible { outline: none; box-shadow: var(--focus-ring); }
.st-icon { width: var(--s-4); height: var(--s-4); fill: none; stroke: currentColor; stroke-width: 2; stroke-linecap: round; stroke-linejoin: round; }
.st-await { margin: 0; padding: var(--s-4); color: var(--text-2); }

/* Header */
.st-home { display: inline-grid; place-items: center; width: var(--hit); height: var(--hit); flex: none; margin-left: calc(-1 * var(--s-3)); color: var(--text-2); text-decoration: none; border-radius: var(--r-2); }
.st-home:hover { color: var(--text-1); background: var(--surface-2); }
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
/* Every row starts at its number; the check, on the version shown, sits at the row's end. */
.lab-context-item.st-version { display: flex; justify-content: flex-start; align-items: center; gap: var(--s-3); }
.st-version .lab-context-check { margin-left: auto; }
/* A version replaced in place is listed, not offered. */
.st-version[aria-disabled="true"] { cursor: default; color: var(--text-2); }
.st-version-n { font-family: var(--font-mono); font-weight: var(--w-1); }
.st-version-text { display: grid; }
.st-version-note { font-size: var(--fs-1); line-height: var(--lh-1); color: var(--text-2); }

/* The one grid: the inspector's place is these rules alone (layout C, the owner's pick). */
.st-studio { min-height: 0; display: grid; grid-template-columns: minmax(0, 1fr) 0; grid-template-rows: minmax(0, 1fr) var(--st-transport-h) var(--st-tl-h, 0); grid-template-areas: "viewer insp" "transport transport" "timeline timeline"; }
.st-studio[data-open="true"] { grid-template-columns: minmax(0, 1fr) var(--st-insp-w); }

/* Viewer */
/* The frame is the film's 16:9 at the largest size the viewer holds: bound by its width or its height, whichever is less. */
.st-viewer { grid-area: viewer; min-height: 0; min-width: 0; display: grid; place-items: center; padding: var(--st-gutter) var(--st-gutter) var(--s-2); container-type: size; }
.st-frame { position: relative; width: min(100cqw, 100cqh * 16 / 9); aspect-ratio: 16 / 9; border-radius: var(--r-2); overflow: hidden; background: var(--surface-1); }
.st-scene, .st-scene .stage { position: absolute; inset: 0; padding: 0; display: grid; place-items: center; }
.st-scene canvas { width: 100%; height: 100%; display: block; }
.st-scene[hidden] { display: none; }
/* A Board panel is shown whole: never cropped to the frame. */
.st-pic { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: contain; display: block; }
.st-pic[hidden] { display: none; }
/* A Board card: the engine's set on its canvas, else its words on the card's paper, sized by the frame. */
.st-frame { container-type: inline-size; }
.st-card-canvas { position: absolute; inset: 0; width: 100%; height: 100%; display: block; }
.st-card-canvas[hidden] { display: none; }
.st-card { position: absolute; inset: 0; display: grid; place-content: center; gap: 2cqw; padding: 8cqw; background: var(--card-paper); color: var(--card-ink); text-align: center; font-family: var(--font); }
.st-card p { margin: 0; font-size: var(--fs-card); line-height: var(--lh-card); font-weight: var(--w-2); text-wrap: balance; }
.st-card b { font-size: var(--fs-card-payoff); line-height: var(--lh-card-payoff); font-weight: var(--w-3); }
.st-card mark { background: var(--k-board); color: var(--k-board-ink); border-radius: var(--r-0); padding: 0 0.15em; }
.st-card .st-card-ref { font-family: var(--font-mono); font-size: var(--fs-card-ref); line-height: var(--lh-card-ref); color: var(--card-ink); }
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
.st-app .st-key[data-look="play"]:focus-visible { box-shadow: var(--focus-ring); }
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
/* The beat selected: an inset ring on the clip itself, so an estimated clip keeps its hatch. */
.st-app .st-clip[data-linked="true"] { box-shadow: inset 0 0 0 2px var(--on-picture); }
.st-app .st-clip[data-linked="true"]:focus-visible { box-shadow: inset 0 0 0 2px var(--on-picture), var(--focus-ring-inset); }
/* An approved clip: a dot in the approved state's colour at its top right. */
.st-ok { position: absolute; top: 3px; right: 3px; width: 6px; height: 6px; border-radius: 50%; background: var(--state-approved); box-shadow: 0 0 0 1px var(--backdrop); z-index: 2; pointer-events: none; }
.st-marks { position: absolute; left: 0; right: 0; bottom: 1px; height: var(--s-2); z-index: 2; pointer-events: none; }
.st-marks-line { position: absolute; left: 0; right: 0; top: 3.5px; height: 1px; background: var(--k-script-ink); }
.st-marks i { position: absolute; top: 1px; width: 6px; height: 6px; translate: -50% 0; background: var(--mark); rotate: 45deg; border-radius: var(--r-0); box-shadow: 0 0 0 1px var(--k-script-ink); }
.st-playhead { position: absolute; top: var(--st-flags-h); bottom: 0; width: 0; z-index: 8; pointer-events: none; }
.st-playhead::before { content: ''; position: absolute; left: -1px; top: 0; bottom: 0; width: 2px; background: var(--playhead); }
.st-head { position: absolute; top: 0; left: calc(-1 * var(--s-2)); width: var(--s-4); height: var(--s-4); background: var(--playhead); clip-path: polygon(0 0, 100% 0, 100% 58%, 50% 100%, 0 58%); pointer-events: auto; cursor: grab; touch-action: none; }

/* Inspector (design §5): the pane's head over its sections, each a disclosure row and its body */
.st-insp { grid-area: insp; min-width: 0; min-height: 0; overflow: hidden; padding: var(--st-gutter) var(--st-gutter) var(--s-2) 0; }
.st-studio[data-open="false"] .st-insp { padding: 0; }
.st-pane { height: 100%; overflow-y: auto; border-radius: var(--r-panel); border: var(--border); background: var(--surface-1); min-width: 0; }
/* In the Script pane the code takes the column's height under the pane's head, and scrolls in it. */
.st-script { display: flex; flex-direction: column; overflow: hidden; }
.st-script .st-code { flex: 1; padding: var(--s-2) var(--s-3) var(--s-3); }
.st-script .st-code-scroll { flex: 1; max-height: none; }
.st-pane-head { position: sticky; top: 0; z-index: 2; background: var(--surface-1); display: flex; align-items: center; gap: var(--s-3); padding: var(--s-3) var(--s-2) var(--s-3) var(--s-4); border-bottom: var(--border); }
.st-ttl { min-width: 0; flex: 1; }
.st-ttl h2 { margin: 0; font-size: var(--fs-4); line-height: var(--lh-4); font-weight: var(--w-3); }
.st-sub { font-family: var(--font-mono); font-size: var(--fs-1); line-height: var(--lh-1); color: var(--text-2); font-variant-numeric: tabular-nums slashed-zero; }
.st-app .st-btn { height: var(--s-8); padding: 0 var(--s-3); border-radius: var(--r-1); border: 1px solid var(--line-strong); background: var(--surface-2); font-size: var(--fs-2); line-height: var(--lh-2); white-space: nowrap; }
.st-app .st-btn.primary { border-color: var(--text-1); background: var(--text-1); color: var(--surface-1); font-weight: var(--w-3); }
.st-app .st-btn:disabled { cursor: default; border-color: var(--line-strong); background: var(--surface-2); color: var(--text-3); }
.st-record .st-close { font: inherit; background: none; border: 0; padding: 0; cursor: pointer; }
:is(.st-app, .st-record) .st-close { width: var(--s-8); height: var(--s-8); border-radius: var(--r-1); display: grid; place-items: center; color: var(--text-2); flex: none; }
:is(.st-app, .st-record) .st-close:hover { background: var(--surface-3); color: var(--text-1); }
.st-row { display: flex; align-items: center; gap: var(--s-3); height: 40px; padding: 0 var(--s-4); border-bottom: var(--border); font-size: var(--fs-2); line-height: var(--lh-2); color: var(--text-2); }
a.st-row { color: var(--text-2); text-decoration: none; }
a.st-row:hover { background: var(--surface-3); color: var(--text-1); }
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
  /* A phone's frame is the window's width, its row as tall as the frame. */
  .st-viewer { padding: 0; container-type: normal; }
  .st-frame { width: 100%; height: auto; border-radius: 0; }
  .st-transport { gap: var(--s-2); }
  /* The Script key too: a phone opens the pane from the reading block's head, and the timecode keeps its room. */
  .st-caption, .st-key[data-look="edge"], .st-key[data-look="pane"] { display: none; }
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
  .st-app .st-r-head { display: flex; gap: var(--s-2); align-items: center; width: 100%; min-height: var(--hit); margin-bottom: var(--s-2); padding: 0; border: 0; background: none; color: inherit; font: inherit; font-size: var(--fs-2); line-height: var(--lh-2); text-align: start; cursor: pointer; }
  .st-r-head b { font-weight: var(--w-3); color: var(--k-script); }
  .st-r-head span { margin-left: auto; font-family: var(--font-mono); color: var(--text-2); }
  /* The Script pane's glyph at the head's end: the head opens it. */
  .st-r-head .st-icon { flex: none; color: var(--text-2); }
  .st-reading p { margin: 0 0 var(--s-2); font-size: var(--fs-4); line-height: var(--lh-4); text-wrap: pretty; }
  .st-reading .st-r-cite { font-family: var(--font-mono); font-size: var(--fs-1); line-height: var(--lh-1); color: var(--text-2); }
  /* What waits, a tap from its list: the header's menu, a full line here. */
  .st-app .st-reading .st-waits { display: flex; align-items: center; width: 100%; height: auto; min-height: var(--hit); margin: 0 0 var(--s-2); padding: 0; white-space: normal; text-align: start; font-size: var(--fs-3); line-height: var(--lh-3); }
  .st-insp { grid-area: reading; padding: 0; display: none; }
  .st-studio[data-open="true"] .st-insp { display: block; }
  .st-pane { border-radius: 0; border-width: 1px 0 0; border-color: var(--line-strong); }
  .st-pane-head { padding: var(--s-2) var(--s-2) var(--s-2) var(--s-4); }
  .st-app .st-btn, :is(.st-app, .st-record) .st-close { height: var(--hit); min-width: var(--hit); }
  .st-row { height: 48px; }
  .st-version { min-height: var(--hit); }
}
@media (prefers-reduced-motion: reduce) {
  .st-key[data-look="play"][aria-pressed="true"]::after { animation: none; }
}
`;

/**
 * The inspector's sections (design §5), which the inspector puts in the page's
 * head while it is mounted: the studio is the browser's alone, so no first
 * paint waits for them. The rows, the Board's tries, the Voice's facts, the
 * Code's lines, the notes and asks, and the recorder over the page.
 */
export const INSPECTOR_CSS = `
.st-sec > summary { list-style: none; cursor: pointer; }
.st-sec > summary::-webkit-details-marker { display: none; }
.st-sec > summary:hover { background: var(--surface-3); color: var(--text-1); }
.st-sec[open] > summary { color: var(--text-1); }
.st-chev { width: 7px; height: 7px; flex: none; border-right: 1.5px solid var(--text-3); border-bottom: 1.5px solid var(--text-3); rotate: -45deg; margin: 0 var(--s-1) 0 var(--s-1); }
.st-sec[open] > summary .st-chev, .st-note[open] > summary .st-chev { rotate: 45deg; }
.st-row[data-empty="true"] { color: var(--text-3); }
.st-sec-body { display: flex; flex-direction: column; gap: var(--s-3); padding: var(--s-3) var(--s-4) var(--s-4); border-bottom: var(--border); }
.st-line { margin: 0; font-size: var(--fs-2); line-height: var(--lh-2); color: var(--text-2); }
.st-line[role="alert"] { color: var(--state-warning); }
.st-pane > .st-line { padding: var(--s-2) var(--s-4); border-bottom: var(--border); }
/* Words: the reader in the section, its beats flush with the section's edge. */
.st-sec[data-section="Words"] .st-sec-body { padding: 0 0 var(--s-3); gap: var(--s-2); --gutter: var(--s-4); }
.st-sec[data-section="Words"] .st-more { align-self: flex-start; margin: 0 var(--s-4); }
/* Board: each panel at its mark, its tries a strip of 64px thumbs, the kept one ringed in the Board's ink. */
.st-panel { display: flex; flex-direction: column; gap: var(--s-2); scroll-margin-top: calc(var(--hit) + 2 * var(--s-3)); }
.st-panel + .st-panel { padding-top: var(--s-3); border-top: var(--border); }
.st-app .st-panel-head { display: flex; align-items: center; gap: var(--s-2); min-height: var(--s-8); text-align: start; border-radius: var(--r-1); font-size: var(--fs-2); line-height: var(--lh-2); }
.st-panel-head[aria-pressed="true"] .st-panel-mark { color: var(--k-board); }
.st-panel-mark { font-weight: var(--w-3); }
.st-panel-at { font-family: var(--font-mono); font-size: var(--fs-1); color: var(--text-2); font-variant-numeric: tabular-nums slashed-zero; }
.st-panel-state { margin-left: auto; font-size: var(--fs-1); line-height: var(--lh-1); color: var(--text-3); }
.st-tries { display: flex; flex-wrap: wrap; gap: var(--s-2); padding: 2px; }
.st-app .st-try-btn { position: relative; flex: none; border-radius: var(--r-1); line-height: 0; }
.st-try-n { position: absolute; right: 3px; bottom: 3px; min-width: 16px; padding: 0 3px; border-radius: var(--r-1); background: var(--surface-1); color: var(--text-1); font-family: var(--font-mono); font-size: var(--fs-1); line-height: 16px; text-align: center; }
.st-try { height: 48px; width: auto; aspect-ratio: 16 / 9; object-fit: cover; border-radius: var(--r-1); background: var(--surface-2); display: block; }
.st-try-btn[data-kept="true"] .st-try, .st-panel > .st-try[data-kept="true"] { box-shadow: 0 0 0 2px var(--k-board); }
.st-try-btn[aria-pressed="true"] .st-try { outline: 2px solid var(--text-1); outline-offset: 2px; }
.st-why { margin: 0; font-size: var(--fs-2); line-height: var(--lh-2); color: var(--text-2); display: -webkit-box; -webkit-box-orient: vertical; -webkit-line-clamp: 2; line-clamp: 2; overflow: hidden; }
.st-try-shown { display: flex; flex-wrap: wrap; gap: var(--s-2) var(--s-3); align-items: center; }
.st-try-said { font-size: var(--fs-2); line-height: var(--lh-2); color: var(--text-2); }
/* A panel's notes still open, each a press that opens it in Notes and asks. */
.st-panel-notes { display: flex; flex-direction: column; gap: var(--s-1); margin: 0; padding: 0; list-style: none; }
.st-app .st-panel-note { display: flex; align-items: center; gap: var(--s-2); width: 100%; min-height: var(--s-8); text-align: start; font-size: var(--fs-2); line-height: var(--lh-2); color: var(--text-2); }
.st-app .st-panel-note:hover { color: var(--text-1); }
.st-panel-note-text { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
/* Mark up: the try shown with the sketch surface over it, the tools under it, the words, Tweak or Note, Save. */
.st-markup-open { align-self: flex-start; }
/* Brought into view as it opens: its top clears the pane's sticky head, as a selected panel's does. */
.st-markup { display: flex; flex-direction: column; gap: var(--s-2); scroll-margin-top: calc(var(--hit) + 2 * var(--s-3)); }
.st-markup-frame { position: relative; width: 100%; aspect-ratio: 16 / 9; border-radius: var(--r-1); overflow: hidden; background: var(--surface-2); }
.st-markup-pic { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover; display: block; }
.st-markup-over { position: absolute; inset: 0; width: 100%; height: 100%; touch-action: none; }
.st-markup-text { min-height: calc(3 * var(--hit)); padding: var(--s-1) var(--s-2); resize: vertical; line-height: var(--lh-2); }
.st-markup-acts { display: flex; flex-wrap: wrap; align-items: center; gap: var(--s-2); }
.st-markup-said { margin: 0; font-size: var(--fs-2); line-height: var(--lh-2); color: var(--text-2); }
/* Inside the words' box, under their delivery: inset as the delivery is, a rule between them. */
.st-words-note { display: flex; flex-direction: column; gap: var(--s-2); padding: var(--s-2) var(--s-3) var(--s-3); border-top: var(--border); }
.st-words-instead { display: flex; flex-direction: column; gap: var(--s-1); font-size: var(--fs-2); color: var(--text-2); }
.st-words-text { min-height: calc(2 * var(--hit)); padding: var(--s-1) var(--s-2); resize: vertical; line-height: var(--lh-2); }
.st-words-acts { display: flex; flex-wrap: wrap; align-items: center; gap: var(--s-2); }
.st-words-said { margin: 0; font-size: var(--fs-2); line-height: var(--lh-2); color: var(--text-2); }
/* The sketch's toolbar: its groups in a row that wraps; each press the size of a finger. */
.lab-sketch-bar { display: flex; flex-wrap: wrap; gap: var(--s-2); }
.lab-sketch-group { display: flex; gap: var(--s-1); }
.lab-sketch-group > .sh-btn { min-height: var(--hit); min-width: var(--hit); }
.lab-sketch-tool, .lab-sketch-ink { display: inline-flex; align-items: center; justify-content: center; padding: 0; }
.lab-sketch-glyph { width: 18px; height: 18px; fill: none; stroke: currentColor; stroke-width: 1.8; stroke-linecap: round; stroke-linejoin: round; }
.lab-sketch-swatch { width: 14px; height: 14px; border-radius: 50%; background: var(--ink); box-shadow: 0 0 0 1px var(--surface-0), 0 0 0 2px var(--text-2); }
/* The surface over the try: its catch takes every pointer, a finger draws and never scrolls or zooms. */
.lab-overlay .lab-sketch-catch { fill: transparent; stroke: none; pointer-events: all; touch-action: none; cursor: crosshair; }
.lab-sketch[data-tool='select'] .lab-sketch-catch { cursor: default; }
.lab-sketch[data-tool='text'] .lab-sketch-catch { cursor: text; }
.lab-overlay .lab-sketch-items { pointer-events: none; filter: drop-shadow(0 0 1px var(--on-picture-shade)); }
.lab-overlay .lab-sketch-item { stroke-linecap: round; stroke-linejoin: round; vector-effect: none; }
.lab-overlay .lab-sketch-item[data-selected='true'], .lab-overlay .lab-sketch-text[data-selected='true'] { filter: drop-shadow(0 0 3px var(--accent)); }
.lab-overlay .lab-sketch-item[data-marked='true'], .lab-overlay .lab-sketch-text[data-marked='true'] { opacity: 0.35; }
/* Set from its top (the font's ascent at the shape's y), as canvas/sketch.ts paints it and core/sketch.ts boxes it. */
.lab-overlay .lab-sketch-text { font-family: var(--font); font-weight: var(--w-2); stroke: none; dominant-baseline: text-before-edge; }
.lab-overlay .lab-sketch-brush { fill: var(--accent-wash); stroke: var(--accent); stroke-width: 1.5; stroke-dasharray: 6 4; vector-effect: non-scaling-stroke; }
.lab-sketch-typing { margin: 0; }
.lab-sketch-input { width: 100%; padding: 0 var(--s-1); border: 1px dashed var(--accent); background: transparent; font-family: var(--font); font-size: var(--sketch-size); color: var(--sketch-ink); font-weight: var(--w-2); }
/* Voice: the take's facts, Hear and Record. */
.st-facts { display: grid; grid-template-columns: auto 1fr; gap: var(--s-1) var(--s-3); margin: 0; font-size: var(--fs-2); line-height: var(--lh-2); }
.st-facts dt { color: var(--text-3); }
.st-facts dd { margin: 0; font-variant-numeric: tabular-nums slashed-zero; }
.st-sec-body > .st-btn { align-self: flex-start; }
.st-heard { margin: 0; font-size: var(--fs-2); line-height: var(--lh-2); color: var(--text-2); }
/* Notes and asks: each open note a disclosure with its thread, each ask a link to its page. */
.st-note > summary { list-style: none; display: flex; align-items: center; gap: var(--s-2); min-height: var(--s-8); cursor: pointer; font-size: var(--fs-2); line-height: var(--lh-2); }
.st-note > summary::-webkit-details-marker { display: none; }
.st-note-label { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.st-note-body { display: flex; flex-direction: column; gap: var(--s-2); padding: var(--s-1) 0 var(--s-2); }
.st-sep { height: 1px; background: var(--line); }
.st-ask { display: flex; align-items: baseline; gap: var(--s-2); min-height: var(--s-8); color: var(--text-1); text-decoration: none; font-size: var(--fs-2); line-height: var(--lh-2); }
.st-ask:hover { color: var(--k-ask); }
.st-ask-at { font-family: var(--font-mono); font-size: var(--fs-1); color: var(--k-ask); font-variant-numeric: tabular-nums slashed-zero; }
/* The recorder over the page: a dialog on a laptop, a sheet from the bottom on a phone. */
/* Edits (laptop): a Script clip carried lifts to 60%, a white line marks the gap it lands in; each edge
   is a grip that shows on hover or selection, and a trim's readout floats over its beat. */
.st-app .st-clip[data-lifted="true"] { opacity: 0.6; cursor: grabbing; }
.st-grip { position: absolute; top: 0; bottom: 0; width: 9px; cursor: ew-resize; z-index: 4; touch-action: none; }
.st-grip[data-edge="lead"] { left: 0; }
.st-grip[data-edge="tail"] { right: 0; }
.st-grip::after { content: ''; position: absolute; top: 28%; bottom: 28%; width: 2px; border-radius: var(--r-0); background: var(--k-script-ink); opacity: 0; transition: opacity var(--t-fast) var(--ease); }
.st-grip[data-edge="lead"]::after { left: 2px; }
.st-grip[data-edge="tail"]::after { right: 2px; }
.st-clip:hover > .st-grip::after, .st-clip[data-linked="true"] > .st-grip::after { opacity: 1; }
/* While a clip is carried the playhead steps aside, so the drop line is the one line over the lanes. */
.st-canvas[data-carrying="true"] .st-playhead { visibility: hidden; }
/* The drop line runs through every lane in the accent, so the gap a carried clip lands in reads at once; its tag, over it on the band, says what lands where. */
.st-drop { position: absolute; top: 0; bottom: 0; width: 4px; margin-left: -2px; border-radius: var(--r-0); background: var(--accent); box-shadow: 0 0 0 1px var(--surface-0), 0 0 12px var(--accent); z-index: 9; pointer-events: none; }
/* A clip carried shows no grips: it moves, it is not trimmed. */
.st-clip[data-lifted="true"] > .st-grip { display: none; }
/* While an edit is on its way no edge is pulled: the grip says so, and takes the edge once the version is read again. */
.st-grip[data-waiting="true"] { cursor: progress; }
.st-grip[data-waiting="true"]::after { opacity: 0.3; }
/* The readout stands over the edge in the hand (or the drop line): a lead's at its left, a tail's at its right. */
.st-readout { position: absolute; top: -26px; padding: 3px 7px; border-radius: var(--r-1); background: var(--surface-2); border: 1px solid var(--line-strong); font-family: var(--font-mono); font-size: var(--fs-1); line-height: var(--lh-1); font-variant-numeric: tabular-nums; color: var(--text-1); white-space: nowrap; z-index: 10; pointer-events: none; }
.st-readout[data-edge="lead"] { translate: 0 0; }
.st-readout[data-edge="tail"] { translate: -100% 0; }
.st-readout[data-role="drop-tag"] { border-color: var(--accent); color: var(--accent); }
.st-app .st-key[data-look="note"] { flex: none; width: auto; padding: 0 var(--s-3); gap: var(--s-1); display: inline-flex; border: var(--border); border-radius: var(--r-pill); }
/* The Script key: apart at the row's right end, raised while its pane is open. */
.st-app .st-key[data-look="pane"] { flex: none; border: var(--border); border-radius: var(--r-pill); }
.st-app .st-key[data-look="pane"][aria-pressed="true"] { background: var(--surface-3); box-shadow: inset 0 0 0 1px var(--line-strong); }
/* Drawing on the frame: the red ink over the viewer; the note bar in the transport's row. */
.st-draw-over { position: absolute; inset: 0; width: 100%; height: 100%; touch-action: none; z-index: 3; }
/* While the frame is drawn on: a crosshair and a ring in the note's colour say it takes a drawing; the tag says so over it. */
.st-draw-over { cursor: crosshair; box-shadow: inset 0 0 0 2px var(--state-note); }
.st-frame:has(.st-draw-over) .st-tag { z-index: 4; pointer-events: none; }
.st-frame:has(.st-draw-over) .st-tag i { background: var(--state-note); }
.st-notebar { grid-area: transport; display: flex; align-items: center; gap: var(--s-2); padding: 0 var(--st-gutter); min-width: 0; }
.st-notebar-text { flex: 1; min-width: 0; height: var(--s-8); padding: 0 var(--s-2); }
/* Move…: the beats to pick, a finger's height each. */
.st-picker { position: fixed; z-index: 41; top: 50%; left: 50%; translate: -50% -50%; width: min(400px, calc(100vw - 2 * var(--st-gutter))); max-height: calc(100dvh - 2 * var(--st-gutter)); overflow-y: auto; display: flex; flex-direction: column; gap: var(--s-2); padding: var(--s-3); border-radius: var(--r-panel); border: var(--border); background: var(--surface-1); box-shadow: var(--shadow-pop); color: var(--text-1); }
.st-picker-list { display: flex; flex-direction: column; }
.st-app .st-picker-row, .st-picker .st-picker-row { min-height: 44px; padding: 0 var(--s-3); border-radius: var(--r-1); text-align: start; font: inherit; background: none; border: 0; color: var(--text-1); cursor: pointer; }
.st-picker .st-picker-row:hover { background: var(--surface-3); }
.st-picker .st-picker-close { align-self: flex-end; }
.st-record-backdrop { position: fixed; inset: 0; z-index: 40; background: var(--backdrop); pointer-events: auto; }
.st-record { position: fixed; z-index: 41; top: 50%; left: 50%; translate: -50% -50%; width: min(560px, calc(100vw - 2 * var(--st-gutter))); max-height: calc(100dvh - 2 * var(--st-gutter)); overflow-y: auto; border-radius: var(--r-panel); border: var(--border); background: var(--surface-1); box-shadow: var(--shadow-pop); color: var(--text-1); }
.st-record-head { position: sticky; top: 0; z-index: 1; display: flex; align-items: center; gap: var(--s-3); padding: var(--s-2) var(--s-2) var(--s-2) var(--s-4); background: var(--surface-1); border-bottom: var(--border); }
.st-record-title { flex: 1; margin: 0; font-size: var(--fs-3); line-height: var(--lh-3); font-weight: var(--w-3); }
/* The question a close asks before it drops a take only this page has: Discard, or Keep. */
.st-discard { display: flex; flex-direction: column; gap: var(--s-2); margin: var(--s-3) var(--s-4) 0; padding: var(--s-3); border: 1px solid var(--state-warning); border-radius: var(--r-1); background: var(--surface-2); }
.st-discard-q { margin: 0; font-size: var(--fs-3); line-height: var(--lh-3); font-weight: var(--w-3); color: var(--text-1); }
.st-discard-why { margin: 0; font-size: var(--fs-2); line-height: var(--lh-2); color: var(--text-2); }
.st-discard-acts { display: flex; flex-wrap: wrap; gap: var(--s-2); }
.st-discard-acts > .sh-btn { min-height: var(--hit); }
.st-record-sheet-backdrop { background: var(--backdrop); pointer-events: auto; }
.st-record-portal { position: fixed; inset: 0; z-index: 41; pointer-events: none; }
.st-record-panel { position: relative; align-self: flex-start; width: var(--visual-viewport-width, 100%); height: auto; }
.st-record.st-record-sheet { position: static; top: auto; left: auto; translate: none; width: 100%; max-height: 85dvh; border-radius: var(--r-panel) var(--r-panel) 0 0; border-width: 1px 0 0; pointer-events: auto; padding-bottom: env(safe-area-inset-bottom); }
@media ${PHONE} {
  .st-app .st-panel-head, .st-app .st-panel-note, .st-note > summary, .st-ask { min-height: var(--hit); }
  .st-markup-text, .st-words-text, .lab-sketch-input { font-size: var(--fs-5); line-height: var(--lh-5); }
}
`;

/**
 * The studio's code view (`code.tsx`): the scene's file in the mono face on
 * the panel's surface, a row to a line, a long line wrapping under its
 * number, a status at its right; lit, its rows by their state: live on
 * `::highlight(code-live)` with a meter under its line, held brighter than
 * the code around it (`code-held`), waiting or released dim (`code-dim`); a
 * line a read fires on glowing (`--glow`, 1 to 0), and the band held over
 * the code. It rides with the view, out of the page's head.
 */
export const CODE_CSS = `
.st-code { margin: 0; display: flex; flex-direction: column; gap: var(--s-1); min-width: 0; min-height: 0; }
.st-code-head { display: flex; align-items: center; gap: var(--s-2); min-width: 0; }
.st-code-where { flex: 1; min-width: 0; margin: 0; font-family: var(--font-mono); font-size: var(--fs-1); line-height: var(--lh-1); color: var(--text-2); overflow-wrap: anywhere; font-variant-numeric: tabular-nums slashed-zero; }
.st-code-follow { flex: none; }
.st-code-scroll { max-height: 360px; min-height: 0; overflow-x: hidden; overflow-y: auto; overscroll-behavior: contain; overflow-anchor: none; border-radius: var(--r-1); background: var(--surface-2); }
.st-code-page { --code-lh: var(--lh-2); --code-gutter: calc(var(--digits) * 1ch + var(--s-3) + var(--s-2)); --code-st: calc(9ch + var(--s-3)); position: relative; padding-bottom: var(--s-2); font-family: var(--font-mono); font-size: var(--fs-1); line-height: var(--code-lh); tab-size: 2; color: var(--text-1); }
.st-code-band { position: sticky; top: 0; z-index: 3; display: flex; flex-direction: column; gap: var(--s-1); min-height: var(--code-lh); padding: var(--s-1) var(--s-3); background: var(--surface-2); border-bottom: var(--border); color: var(--text-2); user-select: none; -webkit-user-select: none; }
.st-code-band-top { display: flex; gap: var(--s-2); min-width: 0; }
.st-code-band-top > span { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
/* The beat's line in the reading face, a chip at each mark: the live one in the live ink. */
/* Three rows of it at a time, the live chip's row on top (\`Band\`); the rest scrolls under a hand. A row is as
   tall as a chip (its line and its border), and a chip stands centred in its row, so three rows fit the box whole. */
.st-code-said { --chip-h: calc(var(--lh-1) + 2px); --said-row: max(var(--lh-2), var(--chip-h)); position: relative; margin: 0; max-height: calc(3 * var(--said-row)); overflow-y: auto; overscroll-behavior: contain; scrollbar-width: none; font-family: var(--font); font-size: var(--fs-2); line-height: var(--said-row); color: var(--text-1); text-wrap: pretty; }
.st-code-chip { display: inline-block; box-sizing: border-box; height: var(--chip-h); margin: calc((var(--said-row) - var(--chip-h)) / 2) 0.3em; padding: 0 var(--s-1); border-radius: var(--r-1); border: 1px solid var(--line-strong); font-family: var(--font-mono); font-size: var(--fs-1); line-height: var(--lh-1); color: var(--text-2); vertical-align: top; overflow: clip; }
.st-app button.st-code-chip { border: 1px solid var(--line-strong); padding: 0 var(--s-1); }
.st-app button.st-code-chip:hover { color: var(--text-1); border-color: var(--text-2); }
.st-app button.st-code-chip[data-live="true"] { color: var(--state-live); border-color: var(--state-live); }
.st-code-live { flex: 1 1 auto; text-align: right; color: var(--state-live); }
.st-code-live[data-empty="true"] { color: var(--text-3); }
/* Lit, the code stands a step back, so a held row reads brighter than the code around it. Unlit, the status
   column is a gutter. */
.st-code[data-lit="true"] .st-code-page { color: var(--text-2); }
.st-code[data-lit="false"] .st-code-page { --code-st: var(--s-1); }
.st-code-line { position: relative; display: grid; grid-template-columns: var(--code-gutter) minmax(0, 1fr) var(--code-st); min-height: var(--code-lh); background: color-mix(in srgb, var(--state-live) calc(var(--glow, 0) * 12%), transparent); }
.st-code-line::before { content: ''; position: absolute; inset: 0 auto 0 0; width: 2px; background: var(--state-live); opacity: var(--glow, 0); pointer-events: none; }
/* A hand only where a tap seeks: a line that reads or writes what the clock plays. */
.st-code-line[data-seeks="true"] { cursor: pointer; }
/* A wrapped line's number stays on its first row, a button's as a plain one's. */
.st-code-n { align-self: start; padding: 0 var(--s-2) 0 var(--s-3); text-align: right; user-select: none; -webkit-user-select: none; color: color-mix(in srgb, var(--state-live) calc(var(--glow, 0) * 100%), var(--text-3)); }
.st-app button.st-code-n { width: auto; height: auto; min-height: 0; padding: 0 var(--s-2) 0 var(--s-3); border: 0; border-radius: 0; background: none; font: inherit; cursor: pointer; }
.st-app button.st-code-n:hover { color: var(--text-1); text-decoration: underline; }
.st-code-t { padding: 0 var(--s-2); white-space: pre-wrap; overflow-wrap: anywhere; }
/* A live row's percent, or when the next row starts, at the right of its line's first row. */
.st-code-st { align-self: start; overflow: hidden; padding-right: var(--s-3); text-align: right; white-space: nowrap; color: var(--text-2); font-variant-numeric: tabular-nums; user-select: none; -webkit-user-select: none; }
.st-code-meter { position: absolute; pointer-events: none; --meter-from: calc(var(--code-gutter) + var(--s-2)); z-index: 2; bottom: 0; left: var(--meter-from); height: 2px; width: calc(var(--done) * (100% - var(--meter-from) - var(--code-st) - var(--s-2))); background: var(--state-live); }
::highlight(code-live) { background-color: color-mix(in srgb, var(--state-live) 26%, transparent); color: var(--text-1); }
::highlight(code-held) { color: var(--text-1); }
::highlight(code-dim) { color: var(--text-3); }
`;
