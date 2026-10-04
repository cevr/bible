// The look of the pages' command surfaces (⌘K, the `?` sheet, the context
// menu, the inspector's fields and hint, the review's inspector sheet and
// comment dot, the receipts' toasts, a note's scope chip and the in and out
// points' band on the cue strip, and every primitive after them):
// one set of names (`COMMAND_TOKENS`), each the studio's token for its role
// (`player/tokens.css`, design language §3 and §5: menus and toasts on
// `--surface-2` with `--line-strong` and `--shadow-pop`, rows `--row-h`,
// keys in the Kbd part's look, the accent only for a selection or the one
// verb), and the rules, which read only those names: no colour, face, size,
// radius or spacing is written in a rule or a component. Restyling the
// surfaces is changing the tokens. Only the surfaces' own geometry (widths,
// heights, the layer) is set here. Put in the page by its root (`mountLab`,
// `mountPlay`, `mountReview`). Each surface fits a phone: no wider than the
// screen less its gutters, scrolling inside itself. An inspector field keeps
// the look of the lab's number fields (`.lab-num`); on the review, which has
// no `player.css`, the tokens give it that look.

/** The command surfaces' names, each the studio's token for its role, and their geometry. */
const COMMAND_TOKENS = `
body {
  --cmd-panel: var(--surface-2);
  --cmd-ink: var(--text-1);
  --cmd-dim: var(--text-2);
  --cmd-line: var(--line-strong);
  --cmd-accent: var(--accent);
  --cmd-refused: var(--state-findings);
  --cmd-hover: var(--surface-3);
  --cmd-scrim: var(--backdrop);
  --cmd-shadow: var(--shadow-pop);
  --cmd-range: var(--accent-wash);
  --cmd-font: var(--font);
  --cmd-mono: var(--font);
  --cmd-text: var(--body-fs);
  --cmd-small: var(--fs-2);
  --cmd-query: var(--fs-5);
  --cmd-leading: var(--body-lh);
  --cmd-weight: var(--w-3);
  --cmd-caps: var(--track-caps);
  --cmd-radius: var(--r-2);
  --cmd-radius-small: var(--r-2);
  --cmd-radius-key: var(--r-1);
  --cmd-gutter: var(--gutter);
  --cmd-pad: var(--s-3);
  --cmd-gap: var(--s-2);
  --cmd-gap-small: var(--s-1);
  --cmd-row-pad: var(--s-2) var(--s-3);
  --cmd-key-pad: 0 var(--s-1);
  --cmd-button-pad: 0 var(--s-2);
  --cmd-row-height: var(--row-h);
  --cmd-button-height: var(--control-h);
  --cmd-inspector-width: var(--inspector-w);
  --cmd-field-width: 72px;
  --cmd-width: 560px;
  --cmd-menu-width: 200px;
  --cmd-count-size: 18px;
  --cmd-toast-width: 420px;
  --cmd-height: 72vh;
  --cmd-top: 12vh;
  --cmd-layer: 40;
}
`;

const COMMAND_RULES = `
.lab-sheet-backdrop { position: fixed; inset: 0; background: var(--cmd-scrim); z-index: var(--cmd-layer); }
.lab-command-menu, .lab-keys-sheet {
  position: fixed; z-index: calc(var(--cmd-layer) + 1); left: 50%; top: var(--cmd-top); transform: translateX(-50%);
  width: min(var(--cmd-width), calc(100vw - 2 * var(--cmd-gutter))); max-height: var(--cmd-height); overflow: auto;
  background: var(--cmd-panel); color: var(--cmd-ink); border: 1px solid var(--cmd-line);
  border-radius: var(--cmd-radius); padding: var(--cmd-pad); box-shadow: var(--cmd-shadow);
  font-family: var(--cmd-font); font-size: var(--cmd-text); line-height: var(--cmd-leading);
}
.lab-sheet-title {
  margin: 0 0 var(--cmd-gap-small); font-size: var(--cmd-small); font-weight: var(--cmd-weight); color: var(--cmd-dim);
  text-transform: uppercase; letter-spacing: var(--cmd-caps);
}
.lab-sheet-about { margin: 0 0 var(--cmd-gap); color: var(--cmd-dim); }
.lab-command-query {
  width: 100%; font: inherit; font-size: var(--cmd-query); padding: var(--cmd-row-pad);
  border-radius: var(--cmd-radius-small); background: transparent; color: var(--cmd-ink);
  border: 1px solid var(--cmd-line); margin-bottom: var(--cmd-gap-small);
}
.lab-command-rows { display: flex; flex-direction: column; }
.lab-command-row {
  display: grid; grid-template-columns: 1fr auto auto; gap: var(--cmd-gap); align-items: baseline;
  padding: var(--cmd-row-pad); border-radius: var(--cmd-radius-small); cursor: pointer; min-height: var(--cmd-row-height);
}
.lab-command-row[aria-selected="true"] { background: var(--cmd-hover); }
.lab-command-group, .lab-command-none, .lab-keys-touch, .lab-keys-none { color: var(--cmd-dim); font-size: var(--cmd-small); }
.lab-command-menu kbd, .lab-keys-sheet kbd {
  font-family: var(--cmd-mono); font-size: var(--cmd-small); color: var(--cmd-ink); padding: var(--cmd-key-pad);
  border: 1px solid var(--cmd-line); border-radius: var(--cmd-radius-key);
}
.lab-command-row kbd:empty { display: none; }
.lab-keys-group h3 {
  font-size: var(--cmd-small); margin: var(--cmd-pad) 0 var(--cmd-gap-small); color: var(--cmd-dim); font-weight: var(--cmd-weight);
  text-transform: uppercase; letter-spacing: var(--cmd-caps);
}
.lab-keys-row {
  display: grid; grid-template-columns: minmax(0, 1fr) auto; gap: 0 var(--cmd-gap); align-items: center;
  padding: var(--cmd-gap-small) 0; border-top: 1px solid var(--cmd-line);
}
.lab-keys-touch { grid-column: 1; }
.lab-keys-actions { grid-column: 2; grid-row: 1 / span 2; display: flex; gap: var(--cmd-gap-small); }
.lab-keys-actions button {
  font: inherit; font-size: var(--cmd-small); background: none; color: var(--cmd-ink); cursor: pointer;
  border: 1px solid var(--cmd-line); border-radius: var(--cmd-radius-small); padding: var(--cmd-button-pad);
  min-height: var(--cmd-button-height);
}
.lab-keys-actions button[data-act="press"] { border-color: var(--cmd-accent); color: var(--cmd-accent); }
.lab-context-positioner { z-index: calc(var(--cmd-layer) + 1); }
.lab-context-menu {
  min-width: var(--cmd-menu-width); max-width: calc(100vw - 2 * var(--cmd-gutter)); max-height: var(--cmd-height); overflow: auto;
  background: var(--cmd-panel); color: var(--cmd-ink); border: 1px solid var(--cmd-line);
  border-radius: var(--cmd-radius-small); padding: var(--cmd-gap-small); box-shadow: var(--cmd-shadow);
  font-family: var(--cmd-font); font-size: var(--cmd-text); line-height: var(--cmd-leading); outline: none;
}
.lab-context-label { padding: var(--cmd-gap-small) var(--cmd-gap) 0; color: var(--cmd-dim); font-size: var(--cmd-small); }
.lab-context-separator { height: 1px; margin: var(--cmd-gap-small) 0; background: var(--cmd-line); }
.lab-context-item {
  display: flex; justify-content: space-between; align-items: center; gap: var(--cmd-gap);
  padding: var(--cmd-row-pad); border-radius: var(--cmd-radius-small); cursor: pointer; min-height: var(--cmd-row-height);
  outline: none;
}
.lab-context-item[data-highlighted] { background: var(--cmd-hover); }
.lab-context-menu kbd {
  font-family: var(--cmd-mono); font-size: var(--cmd-small); color: var(--cmd-dim); padding: var(--cmd-key-pad);
  border: 1px solid var(--cmd-line); border-radius: var(--cmd-radius-key);
}
.lab-context-menu kbd:empty { display: none; }
.lab-field { display: contents; }
.lab-field-scrub { cursor: ew-resize; }
.lab-inspector-hint {
  display: none; flex-wrap: wrap; gap: var(--cmd-gap-small) var(--cmd-gap); margin-top: var(--cmd-gap-small);
  color: var(--cmd-dim); font-family: var(--cmd-font); font-size: var(--cmd-small); line-height: var(--cmd-leading);
}
.lab-inspector:hover .lab-inspector-hint, .lab-inspector:focus-within .lab-inspector-hint { display: flex; }
@media (pointer: coarse) {
  .lab-inspector:hover .lab-inspector-hint, .lab-inspector:focus-within .lab-inspector-hint { display: none; }
}
.lab-inspector-hint kbd {
  font-family: var(--cmd-mono); font-size: var(--cmd-small); color: var(--cmd-ink); padding: var(--cmd-key-pad);
  border: 1px solid var(--cmd-line); border-radius: var(--cmd-radius-key);
}
.lab-inspector-viewport { position: fixed; inset: 0; z-index: var(--cmd-layer); pointer-events: none; }
.lab-inspector-sheet {
  position: fixed; top: 0; right: 0; bottom: 0; width: min(var(--cmd-inspector-width), 100vw); overflow: auto;
  pointer-events: auto; display: flex; flex-direction: column; gap: var(--cmd-gap);
  background: var(--cmd-panel); color: var(--cmd-ink); border-left: 1px solid var(--cmd-line);
  padding: var(--cmd-pad); box-shadow: var(--cmd-shadow); outline: none;
  font-family: var(--cmd-font); font-size: var(--cmd-text); line-height: var(--cmd-leading);
  transform: translateX(var(--drawer-swipe-movement-x, 0px));
}
.lab-inspector-head { display: flex; justify-content: space-between; align-items: baseline; gap: var(--cmd-gap); }
.lab-inspector-body { display: flex; flex-direction: column; gap: var(--cmd-gap-small); }
.lab-inspector-close, .lab-count {
  font: inherit; font-size: var(--cmd-small); cursor: pointer; border-radius: var(--cmd-radius-small);
}
.lab-inspector-close {
  background: none; color: var(--cmd-ink); border: 1px solid var(--cmd-line);
  padding: var(--cmd-button-pad); min-height: var(--cmd-button-height);
}
.lab-inspect {
  font: inherit; color: inherit; background: none; border: 0; padding: 0; margin: 0; cursor: pointer; text-align: inherit;
}
.lab-count {
  min-width: var(--cmd-count-size); height: var(--cmd-count-size); padding: 0 var(--cmd-gap-small);
  border: 1px solid var(--cmd-line); border-radius: var(--cmd-radius-key); background: none; color: var(--cmd-ink);
  line-height: var(--cmd-count-size);
}
/* Beside the page, not over it: on a wide screen the page makes room while an inspector is open. */
@media (min-width: 901px) { body:has(.lab-inspector-sheet) { padding-right: var(--cmd-inspector-width); } }
.lab-clamp { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.lab-receipts {
  position: fixed; z-index: calc(var(--cmd-layer) + 2); left: 50%; bottom: var(--cmd-gutter); transform: translateX(-50%);
  width: min(var(--cmd-toast-width), calc(100vw - 2 * var(--cmd-gutter)));
  display: flex; flex-direction: column; gap: var(--cmd-gap-small); outline: none;
}
.lab-receipt {
  background: var(--cmd-panel); color: var(--cmd-ink); border: 1px solid var(--cmd-line);
  border-radius: var(--cmd-radius-small); padding: var(--cmd-row-pad); box-shadow: var(--cmd-shadow);
  font-family: var(--cmd-font); font-size: var(--cmd-text); line-height: var(--cmd-leading);
  transform: translate(var(--toast-swipe-movement-x, 0px), var(--toast-swipe-movement-y, 0px));
}
.lab-receipt[data-limited] { display: none; }
.lab-receipt[data-type="refused"] { border-left: 2px solid var(--cmd-refused); }
.lab-receipt[data-type="refused"] .lab-receipt-said { color: var(--cmd-refused); }
.lab-receipt[data-type="busy"] .lab-receipt-said { color: var(--cmd-dim); }
.lab-receipt-content { display: flex; align-items: center; gap: var(--cmd-gap); }
.lab-receipt-said { flex: 1; min-width: 0; margin: 0; font-size: var(--cmd-text); font-weight: normal; overflow-wrap: anywhere; }
.lab-receipt-undo, .lab-receipt-close {
  font: inherit; font-size: var(--cmd-small); cursor: pointer; background: none; color: var(--cmd-ink);
  border-radius: var(--cmd-radius-small); padding: var(--cmd-button-pad); min-height: var(--cmd-button-height);
}
.lab-receipt-undo { border: 1px solid var(--cmd-line); color: var(--cmd-ink); }
.lab-receipt-close { border: 0; color: var(--cmd-dim); }
.lab-scope {
  display: inline-flex; align-items: center; gap: var(--cmd-gap-small); max-width: 100%;
  padding: var(--cmd-key-pad); border: 1px solid var(--cmd-line); border-radius: var(--cmd-radius);
  color: var(--cmd-ink); font: var(--cmd-small)/var(--cmd-leading) var(--cmd-mono);
}
.lab-scope-text { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.lab-scope button {
  background: none; border: 0; color: var(--cmd-dim); cursor: pointer; font: inherit;
  min-width: var(--cmd-count-size); min-height: var(--cmd-count-size);
}
.lab-scope button:hover { color: var(--cmd-ink); }
.lab-strip-range { position: absolute; top: 0; bottom: 0; background: var(--cmd-range); pointer-events: none; }
body.rv .lab-num {
  width: var(--cmd-field-width); min-height: var(--cmd-button-height); padding: var(--cmd-button-pad);
  background: var(--cmd-panel); color: var(--cmd-ink); border: 1px solid var(--cmd-line);
  border-radius: var(--cmd-radius-small); font: inherit; font-variant-numeric: tabular-nums;
}
`;

/** The command surfaces' stylesheet: the tokens, then the rules that read them. */
export const COMMAND_CSS = `${COMMAND_TOKENS}${COMMAND_RULES}`;
