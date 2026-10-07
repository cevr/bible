// The look of the pages' command surfaces (⌘K, the `?` sheet, the context
// menu, the inspector's fields and hint, the review's inspector sheet and
// comment dot, the receipts' toasts, a note's scope chip and the in and out
// points' band on the cue strip, and every primitive after them). The rules
// read the studio's tokens (`player/tokens.css`, design language §3 and §5:
// menus and toasts on `--surface-2` with `--line-strong` and `--shadow-pop`,
// rows `--row-h`, keys in the Kbd part's look, the accent only for a
// selection or the one verb): no colour, face, size, radius or spacing is
// written in a rule or a component, so restyling the surfaces is changing
// the tokens. Only what no studio token holds is named here
// (`COMMAND_TOKENS`): the paddings and heights the surfaces compose, and
// their own geometry (widths, heights, the layer). Put in the page by its
// root (`mountLab`, `mountPlay`, `mountReview`). Each surface fits a phone:
// no wider than the screen less its gutters, scrolling inside itself. An
// inspector field is the kit's number field (`.lab-num`), styled where the
// kit is, never here.

/**
 * The command surfaces' own constants: the four paddings and heights they
 * compose from studio tokens, and the geometry no studio token holds.
 */
const COMMAND_TOKENS = `
body {
  --cmd-row-pad: var(--s-2) var(--s-3);
  --cmd-key-pad: 0 var(--s-1);
  --cmd-button-pad: 0 var(--s-2);
  --cmd-row-height: max(var(--row-h), var(--hit));
  --cmd-width: 560px;
  --cmd-menu-width: 200px;
  --cmd-count-size: 18px;
  --cmd-toast-width: 420px;
  --cmd-height: 72vh;
  --cmd-top: 12vh;
  --cmd-layer: 40;
  --cmd-sheet-height: 75dvh;
  /* What the phone's sheet stands on: the tab bar and the shell's dock (\`.sh .sh-dock\`), set below. */
  --cmd-sheet-floor: env(safe-area-inset-bottom);
  --cmd-grip-height: 4px;
}
`;

const COMMAND_RULES = `
.lab-sheet-backdrop { position: fixed; inset: 0; background: var(--backdrop); z-index: var(--cmd-layer); }
.lab-command-menu, .lab-keys-sheet {
  position: fixed; z-index: calc(var(--cmd-layer) + 1); left: 50%; top: var(--cmd-top); transform: translateX(-50%);
  width: min(var(--cmd-width), calc(100vw - 2 * var(--gutter))); max-height: var(--cmd-height); overflow: auto;
  background: var(--surface-2); color: var(--text-1); border: 1px solid var(--line-strong);
  border-radius: var(--r-2); padding: var(--s-3); box-shadow: var(--shadow-pop);
  font-family: var(--font); font-size: var(--body-fs); line-height: var(--body-lh);
}
.lab-sheet-title {
  margin: 0 0 var(--s-1); font-size: var(--fs-2); font-weight: var(--w-3); color: var(--text-2);
  text-transform: uppercase; letter-spacing: var(--track-caps);
}
.lab-sheet-about { margin: 0 0 var(--s-2); color: var(--text-2); }
.lab-command-query {
  width: 100%; font: inherit; font-size: var(--fs-5); padding: var(--cmd-row-pad);
  border-radius: var(--r-2); background: transparent; color: var(--text-1);
  border: 1px solid var(--line-strong); margin-bottom: var(--s-1);
}
.lab-command-rows { display: flex; flex-direction: column; }
.lab-command-row {
  display: grid; grid-template-columns: 1fr auto auto; gap: var(--s-2); align-items: baseline;
  padding: var(--cmd-row-pad); border-radius: var(--r-2); cursor: pointer; min-height: var(--cmd-row-height);
}
.lab-command-row[aria-selected="true"] { background: var(--surface-3); }
.lab-command-group, .lab-command-none, .lab-keys-touch, .lab-keys-none { color: var(--text-2); font-size: var(--fs-2); }
.lab-command-menu kbd, .lab-keys-sheet kbd {
  font-family: var(--font); font-size: var(--fs-2); color: var(--text-1); padding: var(--cmd-key-pad);
  border: 1px solid var(--line-strong); border-radius: var(--r-1);
}
.lab-command-row kbd:empty { display: none; }
.lab-keys-group h3 {
  font-size: var(--fs-2); margin: var(--s-3) 0 var(--s-1); color: var(--text-2); font-weight: var(--w-3);
  text-transform: uppercase; letter-spacing: var(--track-caps);
}
.lab-keys-row {
  display: grid; grid-template-columns: minmax(0, 1fr) auto; gap: 0 var(--s-2); align-items: center;
  padding: var(--s-1) 0; border-top: 1px solid var(--line-strong);
}
.lab-keys-touch { grid-column: 1; }
.lab-keys-actions { grid-column: 2; grid-row: 1 / span 2; display: flex; gap: var(--s-1); }
.lab-keys-actions button {
  font: inherit; font-size: var(--fs-2); background: none; color: var(--text-1); cursor: pointer;
  border: 1px solid var(--line-strong); border-radius: var(--r-2); padding: var(--cmd-button-pad);
  min-height: var(--control-h);
}
.lab-keys-actions button[data-act="press"] { border-color: var(--accent); color: var(--accent); }
.lab-context-positioner { z-index: calc(var(--cmd-layer) + 1); }
.lab-context-menu {
  min-width: var(--cmd-menu-width); max-width: calc(100vw - 2 * var(--gutter)); max-height: var(--cmd-height); overflow: auto;
  background: var(--surface-2); color: var(--text-1); border: 1px solid var(--line-strong);
  border-radius: var(--r-2); padding: var(--s-1); box-shadow: var(--shadow-pop);
  font-family: var(--font); font-size: var(--body-fs); line-height: var(--body-lh); outline: none;
}
.lab-context-label { padding: var(--s-1) var(--s-2) 0; color: var(--text-2); font-size: var(--fs-2); }
.lab-context-separator { height: 1px; margin: var(--s-1) 0; background: var(--line-strong); }
.lab-context-item {
  display: flex; justify-content: space-between; align-items: center; gap: var(--s-2);
  padding: var(--cmd-row-pad); border-radius: var(--r-2); cursor: pointer; min-height: var(--cmd-row-height);
  outline: none;
}
.lab-context-item[data-highlighted] { background: var(--surface-3); }
.lab-context-menu kbd {
  font-family: var(--font); font-size: var(--fs-2); color: var(--text-2); padding: var(--cmd-key-pad);
  border: 1px solid var(--line-strong); border-radius: var(--r-1);
}
.lab-context-menu kbd:empty { display: none; }
.lab-field { display: contents; }
.lab-field-scrub { cursor: ew-resize; }
.lab-inspector-hint {
  display: none; flex-wrap: wrap; gap: var(--s-1) var(--s-2); margin-top: var(--s-1);
  color: var(--text-2); font-family: var(--font); font-size: var(--fs-2); line-height: var(--body-lh);
}
.lab-inspector:hover .lab-inspector-hint, .lab-inspector:focus-within .lab-inspector-hint { display: flex; }
@media (pointer: coarse) {
  .lab-inspector:hover .lab-inspector-hint, .lab-inspector:focus-within .lab-inspector-hint { display: none; }
}
.lab-inspector-hint kbd {
  font-family: var(--font); font-size: var(--fs-2); color: var(--text-1); padding: var(--cmd-key-pad);
  border: 1px solid var(--line-strong); border-radius: var(--r-1);
}
.lab-inspector-viewport { position: fixed; inset: 0; z-index: var(--cmd-layer); pointer-events: none; }
.lab-inspector-sheet {
  position: fixed; top: 0; right: 0; bottom: 0; width: min(var(--inspector-w), 100vw); overflow: auto;
  pointer-events: auto; display: flex; flex-direction: column; gap: var(--s-2);
  background: var(--surface-2); color: var(--text-1); border-left: 1px solid var(--line-strong);
  padding: var(--s-3); box-shadow: var(--shadow-pop); outline: none;
  font-family: var(--font); font-size: var(--body-fs); line-height: var(--body-lh);
  transform: translateX(var(--drawer-swipe-movement-x, 0px));
}
.lab-inspector-head { display: flex; justify-content: space-between; align-items: baseline; gap: var(--s-2); }
.lab-inspector-body { display: flex; flex-direction: column; gap: var(--s-1); }
.lab-inspector-close, .lab-count {
  font: inherit; font-size: var(--fs-2); cursor: pointer; border-radius: var(--r-2);
}
.lab-inspector-close {
  background: none; color: var(--text-1); border: 1px solid var(--line-strong);
  padding: var(--cmd-button-pad); min-height: var(--control-h);
}
.lab-inspect {
  font: inherit; color: inherit; background: none; border: 0; padding: 0; margin: 0; cursor: pointer; text-align: inherit;
}
/*
 * A name reads as text, yet is a target of the pointer's size (\`--hit\`: a
 * finger's on the phone, the laptop's dense one): a hit-slop past it each
 * way, the row laid out as before. A comment count's dot sits in a box that
 * size, in the row's flow, held on the name's line, so a name and its count
 * never share a hit area: a short name with a count beside it is that wide
 * too. With no count, the hit-slop alone is its target, and it is as wide as
 * its words.
 */
.lab-named { display: inline-flex; align-items: center; gap: var(--s-1); min-width: 0; max-width: 100%; vertical-align: middle; }
.lab-named:has(> .lab-count-hit) > .lab-inspect { min-width: var(--hit); }
.lab-inspect { position: relative; }
.lab-inspect::before {
  content: ''; position: absolute; left: 50%; top: 50%; transform: translate(-50%, -50%);
  width: max(100%, var(--hit)); height: max(100%, var(--hit));
}
.lab-count-hit {
  display: inline-grid; place-items: center; flex: none; min-width: var(--hit); min-height: var(--hit);
  padding: 0; margin: 0; border: 0; background: none; color: inherit; font: inherit; cursor: pointer; vertical-align: middle;
}
.lab-count {
  min-width: var(--cmd-count-size); height: var(--cmd-count-size); padding: 0 var(--s-1);
  border: 1px solid var(--line-strong); border-radius: var(--r-1); background: none; color: var(--text-1);
  line-height: var(--cmd-count-size);
}
/* Beside the page, not over it: on a wide screen the page makes room while an inspector is open. */
@media (min-width: 900px) { body:has(.lab-inspector-sheet) { padding-right: var(--inspector-w); } }
.lab-inspector-grip { display: none; }
/*
 * On a phone (the shell's width) the sheet rises from the bottom (design
 * language §7): the screen's width, standing on the film's tab bar and the
 * transport docked over it, so both stay in reach; at most three quarters of
 * the screen tall. Its head is its grip (a bar drawn at its top): a tap lowers
 * it to a peek, its head alone, and raises it again; the head's Close stays
 * above the grip. While it stands whole the page makes room under it, so its
 * last row can be scrolled above it.
 */
@media (max-width: 899px) {
  body:has(.sh[data-film="true"]) { --cmd-sheet-floor: calc(var(--tabbar-h) + env(safe-area-inset-bottom)); }
  body:has(.sh[data-film="true"] .sh-dock) {
    --cmd-sheet-floor: calc(var(--tabbar-h) + var(--dock-h) + env(safe-area-inset-bottom));
  }
  body:has(.sh[data-film="false"] .sh-dock) { --cmd-sheet-floor: calc(var(--dock-h) + env(safe-area-inset-bottom)); }
  .lab-inspector-sheet {
    top: auto; left: 0; bottom: var(--cmd-sheet-floor); width: auto; max-height: var(--cmd-sheet-height);
    border-left: 0; border-top: 1px solid var(--line-strong);
    border-radius: var(--r-sheet) var(--r-sheet) 0 0;
    transform: translateY(var(--drawer-swipe-movement-y, 0px));
  }
  .lab-inspector-head { position: relative; align-items: center; min-height: var(--hit); }
  .lab-inspector-grip {
    display: block; position: absolute; inset: calc(-1 * var(--s-3)) calc(-1 * var(--s-3)) 0;
    padding: 0; border: 0; background: none; cursor: pointer;
  }
  .lab-inspector-grip::before {
    content: ''; position: absolute; top: var(--s-2); left: 50%; width: var(--s-8);
    height: var(--cmd-grip-height); margin-left: calc(var(--s-8) / -2);
    border-radius: var(--r-1); background: var(--line-strong);
  }
  .lab-inspector-head .lab-sheet-title { position: relative; pointer-events: none; }
  /* Close stands over the grip, a whole target of its own: the grip round it leaves it no spacing. */
  .lab-inspector-head .lab-inspector-close { position: relative; z-index: 1; min-height: var(--hit); }
  .lab-inspector-sheet[data-peek="true"] > :not(.lab-inspector-head) { display: none; }
  body:has(.lab-inspector-sheet:not([data-peek="true"])) .sh-body { padding-bottom: var(--cmd-sheet-height); }
}
.lab-clamp { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.lab-receipts {
  position: fixed; z-index: calc(var(--cmd-layer) + 2); left: 50%; bottom: var(--gutter); transform: translateX(-50%);
  width: min(var(--cmd-toast-width), calc(100vw - 2 * var(--gutter)));
  display: flex; flex-direction: column; gap: var(--s-1); outline: none;
}
.lab-receipt {
  background: var(--surface-2); color: var(--text-1); border: 1px solid var(--line-strong);
  border-radius: var(--r-2); padding: var(--cmd-row-pad); box-shadow: var(--shadow-pop);
  font-family: var(--font); font-size: var(--body-fs); line-height: var(--body-lh);
  transform: translate(var(--toast-swipe-movement-x, 0px), var(--toast-swipe-movement-y, 0px));
}
.lab-receipt[data-limited] { display: none; }
.lab-receipt[data-type="refused"] { border-left: 2px solid var(--state-findings); }
.lab-receipt[data-type="refused"] .lab-receipt-said { color: var(--state-findings); }
.lab-receipt[data-type="busy"] .lab-receipt-said { color: var(--text-2); }
.lab-receipt-content { display: flex; align-items: center; gap: var(--s-2); }
.lab-receipt-said { flex: 1; min-width: 0; margin: 0; font-size: var(--body-fs); font-weight: normal; overflow-wrap: anywhere; }
.lab-receipt-undo, .lab-receipt-close {
  font: inherit; font-size: var(--fs-2); cursor: pointer; background: none; color: var(--text-1);
  border-radius: var(--r-2); padding: var(--cmd-button-pad); min-height: var(--control-h);
}
.lab-receipt-undo { border: 1px solid var(--line-strong); color: var(--text-1); }
.lab-receipt-close { border: 0; color: var(--text-2); }
.lab-scope {
  display: inline-flex; align-items: center; gap: var(--s-1); max-width: 100%;
  padding: var(--cmd-key-pad); border: 1px solid var(--line-strong); border-radius: var(--r-2);
  color: var(--text-1); font: var(--fs-2)/var(--body-lh) var(--font);
}
.lab-scope-text { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
/*
 * The scope's × is drawn the count dot's size, its box its min-width (no
 * user agent padding), and reached as a target of the pointer's size
 * (\`--hit\`) through a hit-slop past it each way, as a name's is.
 */
.lab-scope button {
  position: relative; background: none; border: 0; color: var(--text-2); cursor: pointer; font: inherit;
  min-width: var(--cmd-count-size); min-height: var(--cmd-count-size); padding-inline: 0;
}
.lab-scope button::before {
  content: ''; position: absolute; left: 50%; top: 50%; transform: translate(-50%, -50%);
  width: max(100%, var(--hit)); height: max(100%, var(--hit));
}
.lab-scope button:hover { color: var(--text-1); }
.lab-strip-range { position: absolute; top: 0; bottom: 0; background: var(--accent-wash); pointer-events: none; }
`;

/** The command surfaces' stylesheet: the tokens, then the rules that read them. */
export const COMMAND_CSS = `${COMMAND_TOKENS}${COMMAND_RULES}`;
