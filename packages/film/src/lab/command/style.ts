// The look of the pages' command surfaces (⌘K, the `?` sheet, the context
// menu, the inspector's fields and hint, and every primitive after them):
// one token set (`COMMAND_TOKENS`, CSS custom properties with today's
// values, read from the page's own palette where it has one: the lab's
// `player.css`, the review's `REVIEW_CSS`), and the rules, which read only
// those properties: no colour, face, size, radius or spacing is written in a
// rule or a component. Restyling the surfaces is changing the tokens. Put in
// the page by its root (`mountLab`, `mountReview`). Each surface fits a
// phone: no wider than the screen less its gutters, scrolling inside itself.
// An inspector field keeps the look of the lab's number fields (`.lab-num`).

/** The command surfaces' tokens: the one place their look is set. */
const COMMAND_TOKENS = `
body {
  --cmd-panel: var(--panel, var(--rv-panel, #1c1a18));
  --cmd-ink: var(--text, var(--rv-ink, #ece7de));
  --cmd-dim: var(--muted, var(--rv-dim, #9a9387));
  --cmd-line: var(--rv-line, rgba(255, 255, 255, 0.12));
  --cmd-accent: var(--accent, var(--rv-gold, #e0a93a));
  --cmd-hover: rgba(255, 255, 255, 0.08);
  --cmd-scrim: rgba(0, 0, 0, 0.45);
  --cmd-shadow: 0 18px 48px rgba(0, 0, 0, 0.5);
  --cmd-font: system-ui, sans-serif;
  --cmd-mono: ui-monospace, monospace;
  --cmd-text: 13px;
  --cmd-small: 12px;
  --cmd-query: 15px;
  --cmd-leading: 1.4;
  --cmd-radius: 10px;
  --cmd-radius-small: 6px;
  --cmd-radius-key: 4px;
  --cmd-gutter: 16px;
  --cmd-pad: 12px;
  --cmd-gap: 10px;
  --cmd-gap-small: 6px;
  --cmd-row-pad: 8px 10px;
  --cmd-key-pad: 1px 5px;
  --cmd-button-pad: 4px 8px;
  --cmd-row-height: 36px;
  --cmd-button-height: 30px;
  --cmd-width: 560px;
  --cmd-menu-width: 200px;
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
  margin: 0 0 var(--cmd-gap-small); font-size: var(--cmd-text); font-weight: 600; color: var(--cmd-dim);
  text-transform: uppercase; letter-spacing: 0.06em;
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
.lab-keys-group h3 { font-size: var(--cmd-small); margin: var(--cmd-pad) 0 var(--cmd-gap-small); color: var(--cmd-accent); font-weight: 600; }
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
`;

/** The command surfaces' stylesheet: the tokens, then the rules that read them. */
export const COMMAND_CSS = `${COMMAND_TOKENS}${COMMAND_RULES}`;
