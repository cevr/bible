// The review's look: dark, warm, one gold accent, made for a phone first
// (every grid folds to one column, the transport stays in reach while the
// page scrolls). Put in the page by `mountReview`, so the page needs no
// stylesheet of its own.

export const REVIEW_CSS = `
body.rv {
  --rv-bg: #121110; --rv-panel: #1c1a18; --rv-line: #2e2b27; --rv-ink: #ece7de;
  --rv-dim: #9a9387; --rv-gold: #e0a93a; --rv-radius: 10px;
  color-scheme: dark;
  margin: 0; background: var(--rv-bg); color: var(--rv-ink);
  font: 14px/1.45 ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif;
}
.rv *, .rv *::before, .rv *::after { box-sizing: border-box; }
.rv a { color: inherit; }
.rv-main { padding: 16px 18px 60px; padding-bottom: max(60px, env(safe-area-inset-bottom)); max-width: 1900px; margin: 0 auto; }
.rv-h { font-size: 13px; text-transform: uppercase; letter-spacing: 0.08em; color: var(--rv-dim); margin: 26px 0 10px; font-weight: 600; }
.rv-h small { text-transform: none; letter-spacing: 0; font-weight: 400; }
.rv-hint, .rv-meta { color: var(--rv-dim); font-size: 12px; }
.rv-row { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; }
.rv-pick { margin-bottom: 12px; }
.rv-seg { display: inline-flex; border: 1px solid var(--rv-line); border-radius: 999px; overflow: hidden; flex-wrap: wrap; }
.rv-seg button { background: none; border: 0; color: var(--rv-dim); padding: 6px 13px; font: inherit; cursor: pointer; min-height: 34px; }
.rv-seg button[aria-pressed="true"] { background: var(--rv-ink); color: var(--rv-bg); }
.rv-seg button:hover:not([aria-pressed="true"]) { color: var(--rv-ink); }
.rv-chip {
  border: 1px solid var(--rv-line); background: none; color: var(--rv-dim); border-radius: 999px;
  padding: 5px 12px; cursor: pointer; font: inherit; text-decoration: none; min-height: 32px;
}
.rv-chip[aria-pressed="true"] { border-color: var(--rv-gold); color: var(--rv-gold); }
.rv-chip[aria-busy="true"] { opacity: 0.6; }
.rv-set-tools { margin-bottom: 12px; }
.rv-grid { display: grid; gap: 12px; grid-template-columns: repeat(auto-fill, minmax(min(100%, 340px), 1fr)); }
.rv-grid.rv-wide { grid-template-columns: repeat(auto-fill, minmax(min(100%, 440px), 1fr)); }
.rv-grid.rv-two { grid-template-columns: repeat(auto-fit, minmax(min(100%, 640px), 1fr)); }
.rv-card {
  background: var(--rv-panel); border: 1px solid var(--rv-line); border-radius: var(--rv-radius);
  overflow: hidden; display: flex; flex-direction: column; min-width: 0;
}
a.rv-card { text-decoration: none; }
a.rv-card:hover { border-color: var(--rv-dim); }
.rv-card.rv-audible { border-color: var(--rv-gold); box-shadow: 0 0 0 1px var(--rv-gold); }
.rv-card video, .rv-media { display: block; width: 100%; aspect-ratio: 16 / 9; background: #000; object-fit: contain; }
.rv-card.rv-tall video { aspect-ratio: auto; max-height: 70vh; }
.rv-zoom { cursor: zoom-in; }
.rv-cap { display: flex; align-items: center; gap: 8px; padding: 8px 10px; min-width: 0; }
.rv-name { font-weight: 600; white-space: nowrap; }
.rv-tag { color: var(--rv-dim); font-size: 12px; flex: 1; min-width: 0; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.rv-sound {
  background: none; border: 1px solid var(--rv-line); color: var(--rv-dim); border-radius: 6px;
  padding: 3px 8px; cursor: pointer; font: inherit; font-size: 13px; min-width: 38px; min-height: 30px; filter: grayscale(1);
}
.rv-sound:hover { color: var(--rv-ink); border-color: var(--rv-dim); }
.rv-sound.on { color: var(--rv-gold); border-color: var(--rv-gold); filter: none; }
.rv-letter {
  font-weight: 700; min-width: 26px; height: 26px; padding: 0 6px; border-radius: 6px;
  display: grid; place-items: center; background: var(--rv-ink); color: var(--rv-bg); flex: none; font-size: 12px;
}
.rv-body { padding: 10px 12px; }
.rv-strip { display: grid; grid-auto-flow: column; grid-auto-columns: 1fr; gap: 2px; background: #000; }
.rv-strip img { width: 100%; aspect-ratio: 16 / 9; object-fit: cover; display: block; }
.rv-badge { display: inline-block; font-size: 11px; border: 1px solid var(--rv-gold); color: var(--rv-gold); border-radius: 999px; padding: 0 7px; margin-left: 6px; }
.rv-transport {
  position: sticky; top: 53px; z-index: 4; display: flex; flex-wrap: wrap; align-items: center;
  gap: 10px 12px; margin-bottom: 14px; background: var(--rv-panel); border: 1px solid var(--rv-line);
  border-radius: var(--rv-radius); padding: 10px 14px;
}
.rv-big {
  width: 44px; height: 44px; border-radius: 50%; border: 0; background: var(--rv-gold);
  color: #1a1408; font-size: 17px; cursor: pointer; flex: none;
}
.rv-transport input[type="range"] { flex: 1 1 220px; min-width: 0; accent-color: var(--rv-gold); height: 28px; }
.rv-time { font-variant-numeric: tabular-nums; color: var(--rv-dim); min-width: 110px; }
.rv-time[data-state="Buffering"] { color: var(--rv-gold); }
.rv-lightbox {
  position: fixed; inset: 0; background: rgba(0, 0, 0, 0.94); display: grid; place-items: center;
  z-index: 20; padding: 16px; cursor: zoom-out;
}
.rv-lightbox img { max-width: 100%; max-height: 100%; }
.rv-note {
  background: var(--rv-panel); border: 1px solid var(--rv-line); border-radius: var(--rv-radius);
  padding: 14px 16px; font-size: 13px; min-width: 0; overflow-wrap: anywhere;
}
.rv-note h1, .rv-note h2, .rv-note h3, .rv-note h4 { color: var(--rv-ink); margin: 12px 0 4px; font-size: 14px; }
.rv-note h1 { font-size: 16px; }
.rv-note h3, .rv-note h4 { color: var(--rv-gold); font-size: 13px; }
.rv-note ul { margin: 4px 0; padding-left: 18px; }
.rv-note p { margin: 5px 0; }
.rv-note code { background: #0006; padding: 0 4px; border-radius: 4px; font-size: 12px; }
.rv-note table { border-collapse: collapse; font-size: 12px; margin: 6px 0; display: block; overflow-x: auto; }
.rv-note td { border: 1px solid var(--rv-line); padding: 4px 6px; vertical-align: top; }
.rv-verdict { border-left: 3px solid var(--rv-gold); padding: 6px 10px; margin: 0 0 10px; background: #0003; }
.rv-doc { background: var(--rv-panel); border: 1px solid var(--rv-line); border-radius: var(--rv-radius); margin-bottom: 8px; }
.rv-doc summary { padding: 10px 14px; cursor: pointer; }
.rv-doc .rv-note { border: 0; border-top: 1px solid var(--rv-line); border-radius: 0; }
.rv .empty { color: var(--rv-dim); padding: 40px 0; text-align: center; }
.rv button:disabled { opacity: 0.45; cursor: default; }
.rv-picture { margin-bottom: 14px; }
.rv-picture video { max-height: 62vh; }
.rv-pending .rv-row { padding: 8px 10px; justify-content: space-between; }
.rv-option .rv-body { display: flex; flex-direction: column; gap: 8px; }
.rv-option audio, .rv-take audio { width: 100%; max-width: 320px; height: 36px; }
.rv-take { border-top: 1px solid var(--rv-line); padding-top: 8px; display: flex; flex-direction: column; gap: 6px; }
.rv-take[data-picked="true"] > .rv-row .rv-name { color: var(--rv-gold); }
.rv-comments { margin: 4px 0; padding-left: 18px; font-size: 12px; overflow-wrap: anywhere; }
.rv-say { flex-wrap: nowrap; }
.rv-say .rv-comment-input {
  flex: 1; min-width: 0; background: #0004; color: var(--rv-ink);
  border: 1px solid var(--rv-line); border-radius: 6px; padding: 6px 8px; font: inherit;
}
.rv-knob input[type="range"] { flex: 1; min-width: 0; max-width: 320px; }
.rv-film, .rv-act { margin-bottom: 18px; }
.rv-scene video { max-height: 40vh; }
.rv-tag[data-state="stale"] { color: var(--rv-gold); }
.rv-writes {
  background: var(--rv-panel); border: 1px solid var(--rv-line); border-radius: var(--rv-radius);
  padding: 8px 12px; margin-bottom: 14px;
}
.rv-check summary { cursor: pointer; margin-top: 6px; }
.rv-findings { margin: 8px 0 0; padding-left: 18px; font-size: 12px; overflow-wrap: anywhere; }
.rv-findings li[data-level="error"] b { color: #e0705a; }
.rv-findings li[data-level="warning"] b { color: var(--rv-gold); }
.rv-films { margin-bottom: 4px; }
@media (max-width: 600px) {
  .rv-header { padding: 8px 12px; padding-top: max(8px, env(safe-area-inset-top)); }
  .rv-main { padding: 12px 10px 60px; }
  .rv-transport { top: 49px; padding: 8px 10px; gap: 8px; }
  .rv-cap { flex-wrap: wrap; }
  .rv-tag { white-space: normal; overflow-wrap: anywhere; }
}
`;
