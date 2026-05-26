#!/usr/bin/env bun
// Convert bohr-vs-millers-rules.md → bohr-vs-millers-rules.html
// Editorial scholarly minimalist style. /ui-skill compliant.

const SRC = new URL('./bohr-vs-millers-rules.md', import.meta.url);
const OUT = new URL('./bohr-vs-millers-rules.html', import.meta.url);

const md = await Bun.file(SRC).text();
let html = Bun.markdown.html(md);

// --- Typography: smart quotes ---
// Bun already escapes " as &quot; — convert to curly quotes contextually.
// Simple heuristic: opening quote after whitespace/>/(, closing otherwise.
html = html
  .replace(/(^|[\s>([—–])&quot;/g, '$1“')
  .replace(/&quot;/g, '”')
  .replace(/(^|[\s>([—–])'/g, '$1‘')
  .replace(/'/g, '’');

// --- Semantic tagging of verse-row paragraphs ---
// Each verse row has paragraphs starting with: <strong>Bohr's reading:</strong>,
// <strong>Miller rules broken:</strong>, <strong>Symbols redefined:</strong>,
// <strong>Miller-rule status:</strong>. Add class hooks so we can style them.
const labelMap: Record<string, string> = {
  'Pioneer reading (DAR):': 'pioneer',
  'Pioneer reading:': 'pioneer',
  'Bohr’s reading:': 'reading',
  'Miller rules broken:': 'violations-label',
  'Miller-rule status:': 'status',
  'Symbols redefined:': 'symbols',
  'Miller rules broken by the broader use Bohr makes of this verse:': 'violations-label',
  'Miller-rule status (this verse itself):': 'status',
  'Miller-rule status (on this verse itself):': 'status',
  'Miller-rule status (the rest of the verse):': 'status',
  'Bohr’s methodological warrant — Louis Were’s principle:': 'warrant',
  'Why “human messenger” is the natural reading.': 'note',
};
for (const [label, cls] of Object.entries(labelMap)) {
  const escapedLabel = label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const re = new RegExp(`<p><strong>${escapedLabel}</strong>`, 'g');
  html = html.replace(re, `<p class="row-${cls}"><strong>${label}</strong>`);
}

// Style the violation lists (the <ul> immediately following a violations-label paragraph)
html = html.replace(
  /(<p class="row-violations-label">[^]*?<\/p>)\s*<ul>/g,
  '$1\n<ul class="violations">',
);

// --- Anchor IDs for headings ---
const slugify = (s: string) =>
  s
    .toLowerCase()
    .replace(/<[^>]+>/g, '')
    .replace(/[^\w\s-]/g, '')
    .trim()
    .replace(/\s+/g, '-');

const toc: { level: number; text: string; id: string }[] = [];
html = html.replace(/<h([23])>([\s\S]*?)<\/h\1>/g, (_m, level, text) => {
  const plain = text.replace(/<[^>]+>/g, '').trim();
  // For verse h3s (Rev 9:3 — “...”), use a short slug like "rev-9-3"
  let id: string;
  const verseMatch = plain.match(/^((?:Rev|Dan)) (\d+):(\d+)(?:-(\d+))?/);
  if (Number(level) === 3 && verseMatch) {
    const [, book, ch, v, vEnd] = verseMatch;
    id = `${book.toLowerCase()}-${ch}-${v}${vEnd ? `-${vEnd}` : ''}`;
  } else {
    id = slugify(plain);
  }
  if (Number(level) === 2) toc.push({ level: 2, text: plain, id });
  return `<h${level} id="${id}"><a href="#${id}" class="anchor" aria-hidden="true">§</a>${text}</h${level}>`;
});

// --- Tag verse-row h3s so we can decorate them ---
html = html.replace(/<h3 id="([^"]+)"><a[^>]+>§<\/a>((?:Rev|Dan) [^<]+)<\/h3>/g, (_m, id, text) => {
  const m = text.match(/^((?:Rev|Dan) \d+:\d+(?:-\d+)?)\s*[—–-]\s*(.+)$/);
  if (!m) return `<h3 id="${id}" class="verse-h">${text}</h3>`;
  return `<h3 id="${id}" class="verse-h"><a href="#${id}" class="verse-anchor" aria-label="Permalink to ${m[1]}"><span class="verse-ref">${m[1]}</span></a><span class="verse-text">${m[2]}</span></h3>`;
});

// --- Wrap rule-callouts inside violation list items ---
// e.g. <li><strong>Rule XII</strong> (trace the figure). ... </li>
html = html.replace(
  /<li><strong>(Rule [IVX]+(?:\/[IVX]+)?)<\/strong>/g,
  '<li><span class="rule-chip">$1</span>',
);

// --- Wrap tables for horizontal scroll on narrow screens ---
html = html.replace(/<table>/g, '<div class="table-wrap"><table>');
html = html.replace(/<\/table>/g, '</table></div>');

// --- Build TOC ---
const tocHtml =
  '<nav class="toc" aria-label="Table of contents"><h2 class="toc-h">Contents</h2><ol>' +
  toc.map((t) => `<li><a href="#${t.id}">${t.text.replace(/&/g, '&amp;')}</a></li>`).join('') +
  '</ol></nav>';

// --- Shell ---
const shell = `<!doctype html>
<html lang="en" data-theme="paper">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width,initial-scale=1" />
<title>Bohr vs. Miller’s Rules — Verse-by-Verse Audit</title>
<meta name="description" content="A verse-by-verse audit of Stephen Bohr’s interpretations of Daniel 11 and the contested chapters of Revelation against William Miller’s 14 Rules of Interpretation (1842)." />
<meta name="theme-color" content="#faf8f5" />
<link rel="preconnect" href="https://fonts.googleapis.com" />
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
<link href="https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,400;9..144,500;9..144,600&family=IBM+Plex+Sans:wght@400;500;600&family=IBM+Plex+Mono:wght@400;500&display=swap" rel="stylesheet" />
<style>
:root {
  --paper: #faf8f5;
  --ink: #1a1612;
  --ink-soft: #4a3f33;
  --ink-mute: #7a6f63;
  --rule: #d8d0c2;
  --rule-soft: #e8e2d4;
  --oxblood: #842817;
  --oxblood-soft: #b85842;
  --indigo: #2c4a5f;
  --gold: #8a6d2f;
  --green: #3d5a3a;
  --pad: clamp(1rem, 3vw, 2rem);
  --measure: 72ch;
  --display: "Fraunces", "Times New Roman", Georgia, serif;
  --body: "IBM Plex Sans", -apple-system, sans-serif;
  --mono: "IBM Plex Mono", ui-monospace, monospace;
}

* { box-sizing: border-box; }
html { -webkit-text-size-adjust: 100%; }
body {
  margin: 0;
  background: var(--paper);
  color: var(--ink);
  font-family: var(--body);
  font-size: 16px;
  line-height: 1.55;
  font-feature-settings: "kern", "liga", "ss01";
  -webkit-font-smoothing: antialiased;
  text-rendering: optimizeLegibility;
}
::selection { background: var(--ink); color: var(--paper); }

/* ============ LAYOUT ============ */
.shell {
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  max-width: 1320px;
  margin: 0 auto;
  padding: 0 var(--pad);
}
@media (min-width: 1024px) {
  .shell {
    grid-template-columns: 240px minmax(0, 1fr);
    gap: 4rem;
    padding: 0 3rem;
  }
}

/* ============ HEADER ============ */
header.masthead {
  border-bottom: 1px solid var(--rule);
  padding: 3rem 0 2.5rem;
  margin-bottom: 3rem;
}
header.masthead .eyebrow {
  font-family: var(--body);
  font-size: 0.7rem;
  font-weight: 500;
  letter-spacing: 0.14em;
  text-transform: uppercase;
  color: var(--ink-mute);
  margin: 0 0 1.5rem;
}
header.masthead h1 {
  font-family: var(--display);
  font-weight: 500;
  font-size: clamp(2rem, 5.5vw, 3.4rem);
  line-height: 1.05;
  letter-spacing: -0.02em;
  margin: 0 0 1.2rem;
  text-wrap: balance;
  max-width: 22ch;
}
header.masthead h1 em {
  font-style: italic;
  color: var(--oxblood);
  font-weight: 500;
}
header.masthead .lede {
  font-family: var(--display);
  font-size: clamp(1.05rem, 1.5vw, 1.2rem);
  line-height: 1.5;
  color: var(--ink-soft);
  max-width: 60ch;
  margin: 0;
  font-weight: 400;
}
header.masthead .meta {
  display: flex;
  gap: 2rem;
  margin-top: 2rem;
  font-family: var(--mono);
  font-size: 0.72rem;
  color: var(--ink-mute);
  letter-spacing: 0.04em;
}
header.masthead .meta span strong {
  color: var(--ink);
  font-weight: 500;
  margin-right: 0.4em;
}

/* ============ TOC ============ */
.toc {
  font-family: var(--body);
  font-size: 0.78rem;
  line-height: 1.5;
}
@media (min-width: 1024px) {
  .toc {
    position: sticky;
    top: 2rem;
    max-height: calc(100dvh - 4rem);
    overflow-y: auto;
    padding-right: 1rem;
    border-right: 1px solid var(--rule-soft);
  }
}
.toc-h {
  font-family: var(--body);
  font-size: 0.65rem;
  font-weight: 600;
  letter-spacing: 0.16em;
  text-transform: uppercase;
  color: var(--ink-mute);
  margin: 0 0 1rem;
}
.toc ol {
  list-style: none;
  padding: 0;
  margin: 0;
  counter-reset: toc;
}
.toc li {
  counter-increment: toc;
  padding: 0.45rem 0;
  border-bottom: 1px dashed var(--rule-soft);
  display: flex;
  gap: 0.6rem;
  align-items: baseline;
}
.toc li:last-child { border-bottom: 0; }
.toc li::before {
  content: counter(toc, decimal-leading-zero);
  font-family: var(--mono);
  font-size: 0.62rem;
  color: var(--ink-mute);
  letter-spacing: 0;
  flex: 0 0 auto;
}
.toc a {
  color: var(--ink-soft);
  text-decoration: none;
  transition: color 0.15s;
}
.toc a:hover,
.toc a:focus-visible {
  color: var(--oxblood);
  outline: none;
}

/* ============ MAIN ============ */
main.content {
  max-width: var(--measure);
  padding-bottom: 6rem;
  min-width: 0;
}

main.content h1 { display: none; } /* H1 lives in masthead */

main.content h2 {
  font-family: var(--display);
  font-weight: 500;
  font-size: clamp(1.6rem, 3.2vw, 2.2rem);
  line-height: 1.15;
  letter-spacing: -0.015em;
  margin: 5rem 0 1.5rem;
  scroll-margin-top: 1.5rem;
  text-wrap: balance;
  position: relative;
  padding-top: 2rem;
  border-top: 1px solid var(--rule);
}
main.content h2:first-of-type {
  margin-top: 0;
  border-top: none;
  padding-top: 0;
}

main.content h3 {
  font-family: var(--body);
  font-weight: 600;
  font-size: 0.95rem;
  line-height: 1.35;
  letter-spacing: -0.005em;
  margin: 2.5rem 0 1rem;
  scroll-margin-top: 1.5rem;
  color: var(--ink);
}

main.content h3.verse-h {
  display: grid;
  grid-template-columns: auto 1fr;
  gap: 0 1.25rem;
  align-items: baseline;
  border-top: 1px solid var(--rule-soft);
  padding-top: 1.5rem;
  margin-top: 3rem;
}
main.content h3.verse-h .verse-anchor {
  text-decoration: none;
  border: 0;
  display: inline-block;
}
main.content h3.verse-h .verse-anchor:hover .verse-ref {
  color: var(--ink);
  background: var(--rule-soft);
}
main.content h3.verse-h .verse-ref {
  font-family: var(--mono);
  font-weight: 500;
  font-size: 0.78rem;
  letter-spacing: 0.02em;
  color: var(--oxblood);
  text-transform: uppercase;
  white-space: nowrap;
  padding: 0.1rem 0.4rem;
  border-radius: 2px;
  transition: background 0.15s, color 0.15s;
}
main.content h3.verse-h .verse-text {
  font-family: var(--display);
  font-weight: 400;
  font-style: italic;
  font-size: 1.05rem;
  line-height: 1.4;
  color: var(--indigo);
  text-wrap: pretty;
}

main.content h4 {
  font-family: var(--body);
  font-size: 0.7rem;
  font-weight: 600;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  color: var(--ink-mute);
  margin: 2rem 0 0.6rem;
}

/* Anchor link on h2 */
.anchor {
  position: absolute;
  left: -1.4em;
  top: 2.05rem;
  font-family: var(--display);
  font-size: 1.2rem;
  color: var(--rule);
  text-decoration: none;
  opacity: 0;
  transition: opacity 0.15s, color 0.15s;
}
h2:hover .anchor,
.anchor:focus-visible {
  opacity: 1;
  color: var(--oxblood);
  outline: none;
}

main.content p {
  margin: 0 0 1rem;
  text-wrap: pretty;
}

main.content strong { font-weight: 600; color: var(--ink); }
main.content em { font-style: italic; }

main.content blockquote {
  border-left: 2px solid var(--oxblood);
  padding: 0.5rem 0 0.5rem 1.5rem;
  margin: 1.5rem 0;
  font-family: var(--display);
  font-style: italic;
  font-size: 1.05rem;
  line-height: 1.5;
  color: var(--ink-soft);
}

main.content a {
  color: var(--indigo);
  text-decoration: underline;
  text-decoration-thickness: 1px;
  text-underline-offset: 0.15em;
  text-decoration-color: var(--rule);
  transition: text-decoration-color 0.15s;
}
main.content a:hover { text-decoration-color: var(--indigo); }

main.content hr {
  border: 0;
  margin: 2.5rem 0;
  height: 1px;
  background: transparent;
}

/* ============ VERSE-ROW SEMANTICS ============ */
main.content p.row-pioneer {
  background: linear-gradient(to right, var(--indigo) 2px, transparent 2px);
  padding-left: 1.25rem;
  font-size: 0.95rem;
}
main.content p.row-pioneer strong:first-child {
  font-family: var(--body);
  font-weight: 600;
  font-size: 0.65rem;
  letter-spacing: 0.14em;
  text-transform: uppercase;
  color: var(--indigo);
  display: block;
  margin-bottom: 0.35rem;
}

main.content p.row-reading {
  background: linear-gradient(to right, var(--oxblood-soft) 2px, transparent 2px);
  padding-left: 1.25rem;
  font-size: 0.95rem;
}
main.content p.row-reading strong:first-child {
  font-family: var(--body);
  font-weight: 600;
  font-size: 0.65rem;
  letter-spacing: 0.14em;
  text-transform: uppercase;
  color: var(--oxblood-soft);
  display: block;
  margin-bottom: 0.35rem;
}

main.content p.row-note {
  font-size: 0.92rem;
  color: var(--ink-soft);
  padding-left: 1.25rem;
  border-left: 1px dashed var(--rule);
  margin-left: 0.1rem;
}

main.content p.row-status,
main.content p.row-warrant {
  background: linear-gradient(to right, var(--green) 2px, transparent 2px);
  padding-left: 1.25rem;
  font-size: 0.92rem;
}
main.content p.row-status strong:first-child,
main.content p.row-warrant strong:first-child {
  font-family: var(--body);
  font-weight: 600;
  font-size: 0.65rem;
  letter-spacing: 0.14em;
  text-transform: uppercase;
  color: var(--ink-mute);
  display: block;
  margin-bottom: 0.35rem;
}

main.content p.row-violations-label {
  background: linear-gradient(to right, var(--oxblood) 2px, transparent 2px);
  padding-left: 1.25rem;
  margin-bottom: 0.5rem;
}
main.content p.row-violations-label strong {
  font-family: var(--body);
  font-weight: 600;
  font-size: 0.65rem;
  letter-spacing: 0.14em;
  text-transform: uppercase;
  color: var(--oxblood);
}

main.content ul.violations {
  list-style: none;
  padding: 0;
  margin: 0 0 1rem;
  border-left: 2px solid var(--oxblood);
  padding-left: 1.25rem;
}
main.content ul.violations li {
  margin: 0 0 0.85rem;
  padding-left: 0;
  font-size: 0.92rem;
  line-height: 1.55;
}
main.content ul.violations li:last-child { margin-bottom: 0; }

.rule-chip {
  display: inline-block;
  font-family: var(--mono);
  font-weight: 500;
  font-size: 0.68rem;
  letter-spacing: 0.04em;
  background: var(--oxblood);
  color: var(--paper);
  padding: 0.15rem 0.5rem 0.18rem;
  border-radius: 2px;
  margin-right: 0.4rem;
  vertical-align: 0.1em;
  white-space: nowrap;
}

main.content p.row-symbols {
  background: linear-gradient(to right, var(--gold) 2px, transparent 2px);
  padding-left: 1.25rem;
  font-size: 0.88rem;
  color: var(--ink-soft);
}
main.content p.row-symbols strong:first-child {
  font-family: var(--body);
  font-weight: 600;
  font-size: 0.65rem;
  letter-spacing: 0.14em;
  text-transform: uppercase;
  color: var(--ink-mute);
  display: block;
  margin-bottom: 0.35rem;
}

/* Generic lists (not violations) */
main.content ul:not(.violations) {
  padding-left: 1.25rem;
  margin: 0 0 1rem;
}
main.content ul:not(.violations) li {
  margin-bottom: 0.4rem;
}
main.content ul:not(.violations) li::marker {
  color: var(--ink-mute);
}

/* ============ TABLES ============ */
.table-wrap {
  overflow-x: auto;
  margin: 1.5rem 0 2rem;
  border-top: 1px solid var(--ink);
  border-bottom: 1px solid var(--ink);
}
main.content table {
  width: 100%;
  border-collapse: collapse;
  font-size: 0.82rem;
  font-variant-numeric: tabular-nums;
  font-feature-settings: "tnum";
}
main.content thead th {
  font-family: var(--body);
  font-weight: 600;
  font-size: 0.62rem;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  text-align: left;
  padding: 0.85rem 1rem;
  border-bottom: 1px solid var(--ink);
  color: var(--ink);
  vertical-align: bottom;
  background: var(--paper);
}
main.content tbody td {
  padding: 0.85rem 1rem;
  vertical-align: top;
  border-bottom: 1px solid var(--rule-soft);
  line-height: 1.45;
  color: var(--ink-soft);
}
main.content tbody tr:last-child td { border-bottom: 0; }
main.content tbody tr:hover td { background: var(--rule-soft); }

/* First column emphasis */
main.content tbody td:first-child {
  color: var(--ink);
  font-weight: 500;
  white-space: normal;
}

/* Numeric / right-align last column on certain tables — applied via JS guess */
main.content td.num, main.content th.num {
  text-align: right;
  font-family: var(--mono);
  font-size: 0.78rem;
}

/* ============ FOOTNOTE-STYLE BLOCKQUOTE callouts ============ */
main.content blockquote p { margin: 0; }
main.content blockquote p + p { margin-top: 0.6rem; }

/* ============ FOOTER ============ */
footer.colophon {
  border-top: 1px solid var(--rule);
  margin-top: 4rem;
  padding: 2rem 0 4rem;
  font-family: var(--mono);
  font-size: 0.72rem;
  color: var(--ink-mute);
  letter-spacing: 0.02em;
  max-width: var(--measure);
}
footer.colophon p { margin: 0 0 0.5rem; }

/* ============ ACCESSIBILITY ============ */
:focus-visible {
  outline: 2px solid var(--oxblood);
  outline-offset: 2px;
  border-radius: 1px;
}

.skip-link {
  position: absolute;
  top: -100px;
  left: 1rem;
  background: var(--ink);
  color: var(--paper);
  padding: 0.5rem 1rem;
  text-decoration: none;
  font-family: var(--body);
  font-size: 0.85rem;
  z-index: 50;
}
.skip-link:focus { top: 1rem; }

/* ============ PRINT ============ */
@media print {
  .toc, .skip-link, .anchor { display: none; }
  body { background: white; }
  main.content { max-width: 100%; }
  h2, h3 { break-after: avoid; }
  p, li { orphans: 3; widows: 3; }
}

/* ============ REDUCED MOTION ============ */
@media (prefers-reduced-motion: reduce) {
  * { animation: none !important; transition: none !important; }
}
</style>
</head>
<body>
<a href="#content" class="skip-link">Skip to content</a>

<header class="masthead">
  <div style="max-width: 1320px; margin: 0 auto; padding: 0 var(--pad);">
    <p class="eyebrow">Reference · v3 The Sure Word</p>
    <h1>Bohr vs. Miller’s Rules<br/><em>a verse-by-verse audit</em></h1>
    <p class="lede">Stephen Bohr’s published interpretations of Daniel 11 and the contested chapters of Revelation, weighed verse-by-verse against William Miller’s <em>14 Rules of Interpretation</em> (1842).</p>
    <div class="meta">
      <span><strong>Scope</strong>Dan 11 · Rev 9, 11, 13, 16, 17, 18</span>
      <span><strong>Pioneer</strong>Smith (DAR) · EGW · Litch</span>
      <span><strong>Modern</strong>Bohr (≈ 1,000 pp)</span>
    </div>
  </div>
</header>

<div class="shell">
  ${tocHtml}
  <main class="content" id="content">
${html}
  </main>
</div>

<footer class="colophon" style="max-width: 1320px; margin: 4rem auto 0; padding: 2rem var(--pad) 4rem; border-top: 1px solid var(--rule);">
  <p>Set in Fraunces &amp; IBM Plex. Built from <code>bohr-vs-millers-rules.md</code> with Bun.</p>
  <p>v3 The Sure Word · reference series</p>
</footer>

</body>
</html>
`;

await Bun.write(OUT, shell);
console.log(`wrote ${OUT.pathname}`);
console.log(`  ${(shell.length / 1024).toFixed(1)} KB`);
console.log(`  ${toc.length} TOC entries`);
