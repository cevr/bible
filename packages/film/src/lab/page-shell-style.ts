// The shell's styles (`page-shell.tsx`, design language §4), read only
// through the tokens (`player/tokens.css`): the header on `--surface-1`, the
// page bar's text tabs with the accent underline on the laptop, the tab bar
// of line icons along the bottom on the phone (`--tabbar-h` over the safe
// area), and the dock a page's transport takes above it (`.sh-dock`); and
// the kit (§5), each control styled once: the quiet and primary buttons
// (`.sh-btn`), the icon button (`.sh-tool`), the segmented control
// (`.sh-seg`), the field (`.lab-num`, a `select`) and the slider. Every page
// injects it with the commands' styles.

import { PHONE } from './viewport.ts';

export const SHELL_CSS = `
html, body { margin: 0; }
body { overflow-x: hidden; -webkit-font-smoothing: antialiased; }
.sh { min-height: 100dvh; display: flex; flex-direction: column; }
.sh-icon { width: 16px; height: 16px; flex: none; fill: none; stroke: currentColor; stroke-width: 1.6;
  stroke-linecap: round; stroke-linejoin: round; }
.sh-header { position: sticky; top: 0; z-index: 20; height: var(--header-h); flex: none; display: flex;
  align-items: center; gap: var(--s-1); padding: 0 calc(var(--gutter) - var(--s-1)); background: var(--surface-1);
  border-bottom: var(--border); min-width: 0; }
.sh-films { display: inline-grid; place-items: center; width: var(--hit); height: var(--hit); flex: none;
  color: var(--text-2); text-decoration: none; border-radius: var(--r-2); }
.sh-films > span { display: none; }
.sh-films[data-active="true"] { color: var(--accent); }
.sh-vsep { display: none; width: 1px; height: var(--s-4); background: var(--line); flex: none; margin: 0 var(--s-1); }
.sh-switcher { display: inline-flex; align-items: center; gap: var(--s-1); min-width: 0; height: var(--control-h);
  padding: 0 var(--s-2); border: 0; border-radius: var(--r-2); background: none; color: var(--text-1);
  font-size: var(--fs-3); font-weight: var(--w-2); cursor: pointer; }
.sh-switcher > span { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.sh-switcher .sh-icon { width: 12px; height: 12px; color: var(--text-3); }
.sh-switcher:hover, .sh-switcher[data-popup-open] { background: var(--surface-3); }
.sh-pagebar { display: flex; align-items: stretch; align-self: stretch; }
.sh-tab { position: relative; display: flex; align-items: center; gap: var(--s-1); padding: 0 var(--s-3);
  color: var(--text-2); text-decoration: none; font-size: var(--fs-2); line-height: var(--lh-2);
  font-weight: var(--w-2); white-space: nowrap; }
.sh-tab .sh-icon { display: none; }
.sh-tab[data-disabled] { color: var(--text-3); }
.sh-tab[data-active="true"] { color: var(--text-1); }
.sh-tab[data-active="true"]::after { content: ""; position: absolute; left: var(--s-3); right: var(--s-3);
  bottom: -1px; height: 2px; background: var(--accent); }
.sh-tab:hover:not([data-disabled]) { color: var(--text-1); }
.sh-crumb { display: inline-flex; align-items: center; gap: var(--s-2); min-width: 0; color: var(--text-2);
  font-size: var(--fs-2); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.sh-crumb i { font-style: normal; color: var(--text-3); }
.sh-spacer { flex: 1; min-width: 0; align-self: stretch; }
.sh-tc { display: none; border: 0; background: none; color: var(--text-1); cursor: pointer; padding: 0 var(--s-2);
  font-size: var(--fs-5); line-height: var(--lh-5); font-weight: var(--w-2); white-space: nowrap; border-radius: var(--r-2); }
.sh-tc:hover { background: var(--surface-3); }
.sh-timecode i { font-style: normal; color: var(--text-3); }
.sh-timecode .sh-ff { color: var(--text-2); }
.sh-goto { display: inline-grid; place-items: center; width: var(--hit); height: var(--hit); flex: none; padding: 0;
  border: 0; border-radius: var(--r-2); background: none; color: var(--text-2); cursor: pointer; }
.sh-goto > span, .sh-goto > kbd { display: none; }
.sh-goto:hover { background: var(--surface-3); color: var(--text-1); }
.sh-tools { display: contents; }
.sh-tool { display: inline-grid; place-items: center; width: var(--hit); height: var(--hit); flex: none; padding: 0;
  border: 0; border-radius: var(--r-2); background: none; color: var(--text-2); cursor: pointer; }
.sh-tool:hover:not(:disabled), .sh-tool[data-popup-open] { background: var(--surface-3); color: var(--text-1); }
.sh-tool:disabled { color: var(--text-3); cursor: default; }
.sh-tool .sh-dots { fill: currentColor; stroke: none; }
.sh-tool:is([aria-pressed="true"], .on) { color: var(--accent); }
.sh kbd { font-family: var(--font); font-size: var(--fs-1); line-height: var(--lh-1); padding: 0 var(--s-1);
  border: 1px solid var(--line-strong); border-radius: var(--r-1); color: var(--text-2); }
.sh-header :focus-visible { outline: none; box-shadow: var(--focus-ring); }
.sh-body { flex: 1; min-width: 0; }
/* A film's page before its film is staged (\`film-page.tsx\`): a quiet line where the picture lands. */
.sh-await { margin: 0; padding: var(--s-4) var(--gutter); color: var(--text-2); font-size: var(--fs-2); }
body.lab .sh-await { grid-column: 1; grid-row: 2; }

/* The phone: the five film tabs along the bottom, the transport docked above them. */
@media ${PHONE} {
  .sh[data-film="true"] { padding-bottom: calc(var(--tabbar-h) + env(safe-area-inset-bottom)); }
  .sh-pagebar { position: fixed; left: 0; right: 0; bottom: 0; z-index: 30;
    height: calc(var(--tabbar-h) + env(safe-area-inset-bottom)); padding-bottom: env(safe-area-inset-bottom);
    background: var(--surface-2); border-top: var(--border); }
  .sh[data-film="false"] .sh-pagebar { display: none; }
  .sh-tab { flex: 1; flex-direction: column; justify-content: center; padding: 0;
    font-size: var(--fs-1); line-height: var(--lh-1); }
  .sh-tab .sh-icon { display: block; width: 20px; height: 20px; }
  .sh-tab[data-active="true"] .sh-icon { color: var(--accent); }
  .sh-tab[data-active="true"]::after { display: none; }
  .sh-crumb { display: none; }
  .sh-dock { position: fixed; left: 0; right: 0; z-index: 25; height: var(--dock-h);
    bottom: calc(var(--tabbar-h) + env(safe-area-inset-bottom)); border-top: var(--border); }
  .sh[data-film="false"] .sh-dock { bottom: env(safe-area-inset-bottom); }
  .sh-body:has(.sh-dock) { padding-bottom: calc(var(--dock-h) + var(--s-3)); }
}
/* The dock: one line, the page's width, on the header's surface (on a laptop, held under the header). */
.sh-dock { display: flex; align-items: center; gap: var(--s-2); min-width: 0; box-sizing: border-box;
  padding: 0 var(--gutter); background: var(--surface-1); }
@media (min-width: 900px) {
  .sh-dock { position: sticky; top: var(--header-h); z-index: 15; min-height: var(--dock-h); border-bottom: var(--border); }
}

/* The laptop: Films as the page bar's first tab, the timecode and Go to… in full. */
@media (min-width: 900px) {
  .sh-films { display: flex; width: auto; height: auto; align-self: stretch; padding: 0 var(--s-3);
    font-size: var(--fs-2); font-weight: var(--w-2); position: relative; }
  .sh-films .sh-icon { display: none; }
  .sh-films > span { display: inline; }
  .sh-films[data-active="true"] { color: var(--text-1); }
  .sh-films[data-active="true"]::after { content: ""; position: absolute; left: var(--s-3); right: var(--s-3);
    bottom: -1px; height: 2px; background: var(--accent); }
  .sh-vsep { display: block; }
  .sh-tc { display: inline-flex; align-items: center; min-height: var(--hit); }
  .sh-goto { display: inline-flex; gap: var(--s-2); width: auto; height: var(--control-h); padding: 0 var(--s-2);
    border: var(--border); background: var(--surface-2); color: var(--text-3); font-size: var(--fs-2); }
  .sh-goto .sh-icon { width: 14px; height: 14px; }
  .sh-goto > span, .sh-goto > kbd { display: inline; }
}

/*
 * The kit (design language §5): the controls every page is made of, each
 * styled once here. Its rules weigh nothing (\`:where\`), so a page's own
 * rule for a control's place (its width, its height as a target) refines it
 * whichever sheet comes first. The icon button is \`.sh-tool\` above.
 */
/* Button, quiet: no fill, an edge; pressed, the raised surface and the accent edge. */
:where(.sh-btn) { display: inline-flex; align-items: center; justify-content: center; gap: var(--s-2);
  min-height: var(--control-h); padding: 0 var(--s-3); border: 1px solid var(--line-strong); border-radius: var(--r-2);
  background: none; color: var(--text-1); font: inherit; font-size: var(--fs-3); font-weight: var(--w-2);
  text-decoration: none; cursor: pointer; }
:where(.sh-btn:not([data-primary]):hover:not(:disabled)) { background: var(--surface-3); }
:where(.sh-btn:is([aria-pressed="true"], [data-pressed])) { background: var(--surface-3); border-color: var(--accent); }
:where(.sh-btn:is(:disabled, [aria-busy="true"])) { color: var(--text-3); cursor: default; }
/* Button, primary: the view's one verb, in the accent. */
:where(.sh-btn[data-primary]) { background: var(--accent); border-color: var(--accent); color: var(--accent-ink); }
:where(.sh-btn[data-primary]) kbd { border-color: currentColor; color: inherit; }
:where(.sh-btn[data-primary]:disabled) { background: var(--surface-3); border-color: var(--line); color: var(--text-3); }
/* A button in a state's colour (a check's findings, the recorder's verb): its words and its edge. */
:where(.sh-btn[data-state="findings"]) { color: var(--state-findings); border-color: var(--state-findings); }
:where(.sh-btn[data-state="warning"]) { color: var(--state-warning); border-color: var(--state-warning); }
:where(.sh-btn[data-state="recording"]) { color: var(--state-recording); border-color: var(--state-recording); }
/* Segmented: one box of choices, the pressed one raised. */
:where(.sh-seg) { display: inline-flex; max-width: 100%; border: var(--border); border-radius: var(--r-2); overflow: hidden; }
:where(.sh-seg > button) { flex: 1 0 auto; min-width: var(--hit); min-height: var(--hit); padding: 0 var(--s-2); border: 0; border-radius: 0;
  background: none; color: var(--text-2); font: inherit; font-size: var(--fs-2); font-weight: var(--w-2); cursor: pointer; }
:where(.sh-seg > button + button) { border-left: var(--border); }
:where(.sh-seg > button:hover) { color: var(--text-1); }
:where(.sh-seg > button:is([aria-pressed="true"], [data-pressed])) { background: var(--surface-3); color: var(--text-1); }
/* Field: a number (NumberField's input), and the platform's select, on the field's surface. */
:where(.lab-num, select) { min-height: var(--hit); padding: 0 var(--s-1); background: var(--surface-2); color: var(--text-1);
  border: 1px solid var(--line-strong); border-radius: var(--r-1); font: inherit; }
:where(.lab-num) { width: 80px; }
/* Slider: the platform's range, its track and thumb the scrubber's (the track's surface, the playhead's accent). */
:where(input[type="range"]) { appearance: none; min-height: var(--hit); margin: 0; background: none; cursor: pointer; }
:where(input[type="range"])::-webkit-slider-runnable-track { height: var(--s-1); border-radius: var(--r-1);
  background: var(--surface-3); }
:where(input[type="range"])::-moz-range-track { height: var(--s-1); border-radius: var(--r-1); background: var(--surface-3); }
:where(input[type="range"])::-moz-range-progress { height: var(--s-1); border-radius: var(--r-1); background: var(--accent); }
:where(input[type="range"])::-webkit-slider-thumb { appearance: none; width: var(--s-1); height: var(--s-4);
  margin-top: calc((var(--s-1) - var(--s-4)) / 2); border: 0; border-radius: var(--r-1); background: var(--accent); }
:where(input[type="range"])::-moz-range-thumb { width: var(--s-1); height: var(--s-4); border: 0; border-radius: var(--r-1);
  background: var(--accent); }
`;
