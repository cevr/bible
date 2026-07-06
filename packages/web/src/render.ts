/**
 * Shared rendering helpers for The Sure Word static site. Pure functions only
 * — no services, no filesystem, no Node builtins (domain imports are
 * type-only, so this module stays runtime-dependency-free). `builder.ts`
 * imports from here so styling, markdown rendering, and page chrome live in
 * exactly one place (the korean-project pattern).
 *
 * Design system: "quiet chapel" — soft ivory paper, one deep spruce-green
 * accent, Fraunces display type, Literata for long-form body text (built for
 * sustained screen reading), IBM Plex Mono for the scholarly apparatus
 * (references, labels, meta). 65ch measure, fluid 17–18px body.
 */

import type { Comparison } from './comparison.js';
import type { Study } from './study.js';

/** Bun's built-in CommonMark renderer (Bun >= 1.3). Tables render natively. */
export const renderMarkdown = (md: string): string => Bun.markdown.html(md);

/** Strip YAML frontmatter and return { frontmatter-lines, body }. */
export const splitFrontmatter = (raw: string): { fm: string; body: string } => {
  const m = raw.match(/^﻿?---\r?\n([\s\S]*?)\r?\n---\r?\n/);
  if (m === null || m[1] === undefined) return { fm: '', body: raw };
  return { fm: m[1], body: raw.slice(m[0].length) };
};

/** Escape text for safe interpolation into HTML. */
export const esc = (s: string): string =>
  s
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');

/** Slugify a heading into an anchor id. */
export const slugify = (s: string): string =>
  s
    .toLowerCase()
    .replace(/<[^>]*>/g, '')
    .replaceAll('&amp;', 'and')
    .replace(/&[a-z#0-9]+;/g, '')
    .replace(/[^a-z0-9\s-]/g, '')
    .trim()
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-');

// ============================================================================
// HTML post-processing (Bun.markdown emits bare headings — inject anchors)
// ============================================================================

export interface TocEntry {
  readonly id: string;
  readonly text: string;
}

/**
 * Give every h2/h3 a stable id (slug of its text, deduped with -2, -3…) and
 * return the h2 list for the sticky table of contents. The `¶` anchor link on
 * h2s mirrors the original comparison pages.
 */
export const anchorHeadings = (html: string): { html: string; toc: TocEntry[] } => {
  const toc: TocEntry[] = [];
  const issued = new Set<string>();
  const out = html.replace(/<(h[23])>([\s\S]*?)<\/\1>/g, (_m, tag: string, inner: string) => {
    const base = slugify(inner) || 'section';
    let id = base;
    for (let n = 2; issued.has(id); n += 1) id = `${base}-${n}`;
    issued.add(id);
    // inner is already entity-encoded by the markdown renderer — strip tags only
    const text = inner
      .replace(/<[^>]*>/g, '')
      .replace(/\s+/g, ' ')
      .trim();
    if (tag === 'h2') {
      toc.push({ id, text });
      return `<${tag} id="${id}"><a class="anchor" href="#${id}" aria-label="Link to section">¶</a>${inner}</${tag}>`;
    }
    return `<${tag} id="${id}">${inner}</${tag}>`;
  });
  return { html: out, toc };
};

/**
 * Prepare a rendered study body for the page shell:
 * - drop the document's own <h1> title (the masthead already carries it)
 * - drop an in-body "Table of Contents" section (the sticky aside replaces it,
 *   and its markdown-era anchor links don't match our heading ids)
 * - wrap tables so wide ones scroll without breaking table semantics
 * Remaining h1s (part dividers like "Part I — Daniel") are kept and styled.
 */
export const prepareArticle = (html: string): string =>
  html
    .replace(/<h1>[\s\S]*?<\/h1>/, '')
    .replace(/<h2>\s*Table of Contents\s*<\/h2>[\s\S]*?(?=<h[12])/i, '')
    .replaceAll('<table>', '<div class="table-wrap"><table>')
    .replaceAll('</table>', '</table></div>');

// ============================================================================
// Page chrome
// ============================================================================

const FONTS = `
    <link rel="preconnect" href="https://fonts.googleapis.com" />
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
    <link
      href="https://fonts.googleapis.com/css2?family=Fraunces:ital,opsz,wght@0,9..144,400;0,9..144,500;0,9..144,600;1,9..144,400;1,9..144,500&family=IBM+Plex+Mono:wght@400;500&family=Literata:ital,opsz,wght@0,7..72,400;0,7..72,500;0,7..72,600;1,7..72,400;1,7..72,500&display=swap"
      rel="stylesheet"
    />`;

/**
 * Site-wide stylesheet, written once to <out>/styles.css and linked with a
 * root-absolute path from every generated page. Calm reading is the brief:
 * one accent, generous whitespace, a 65ch measure, and a table of contents
 * that collapses to a <details> box on mobile (a script in studyPage opens it
 * on desktop viewports).
 */
export const STYLES = `:root {
  --paper: #f7f5f0;
  --paper-raise: #fdfcf8;
  --paper-tint: #eeebe1;
  --ink: #2a2924;
  --ink-soft: #514d42;
  --ink-mute: #6f6a5c;
  --rule: #dcd7c8;
  --rule-soft: #e8e4d8;
  --accent: #3d5a4c;
  --accent-soft: #74907f;
  --accent-wash: #e2e9e3;
  --pad: clamp(1rem, 3vw, 2rem);
  --measure: 65ch;
  --display: 'Fraunces', 'Times New Roman', Georgia, serif;
  --body: 'Literata', Georgia, 'Times New Roman', serif;
  --mono: 'IBM Plex Mono', ui-monospace, monospace;
}

* { box-sizing: border-box; }
html { -webkit-text-size-adjust: 100%; }
@media (prefers-reduced-motion: no-preference) {
  html { scroll-behavior: smooth; }
}
body {
  margin: 0;
  background: var(--paper);
  color: var(--ink);
  font-family: var(--body);
  font-size: 1rem;
  line-height: 1.6;
  font-feature-settings: 'kern', 'liga';
  -webkit-font-smoothing: antialiased;
  text-rendering: optimizeLegibility;
}
::selection { background: var(--accent-wash); color: var(--ink); }
a, summary { touch-action: manipulation; -webkit-tap-highlight-color: transparent; }
:focus-visible { outline: 2px solid var(--accent); outline-offset: 3px; }
img { max-width: 100%; height: auto; }

.skip-link {
  position: absolute;
  left: -9999px;
  top: 0;
  z-index: 40;
  background: var(--ink);
  color: var(--paper);
  padding: 0.6rem 1rem;
  font-family: var(--mono);
  font-size: 0.8rem;
}
.skip-link:focus { left: 0; }

@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after { transition: none !important; animation: none !important; }
}

/* ============ TOP NAV ============ */
nav.topnav {
  border-bottom: 1px solid var(--rule);
  background: var(--paper);
  position: sticky;
  top: 0;
  z-index: 20;
}
nav.topnav .nav-inner {
  max-width: 1320px;
  margin: 0 auto;
  padding: 0.7rem var(--pad);
  display: flex;
  gap: clamp(1rem, 3vw, 2.5rem);
  align-items: baseline;
  flex-wrap: wrap;
}
nav.topnav a.brand {
  font-family: var(--display);
  font-weight: 500;
  font-size: 1.05rem;
  letter-spacing: -0.01em;
  color: var(--ink);
  text-decoration: none;
  padding: 0.35rem 0;
}
nav.topnav a.brand em { font-style: italic; color: var(--accent); }
nav.topnav ul.nav-list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  gap: clamp(0.85rem, 2vw, 1.6rem);
  flex-wrap: wrap;
}
nav.topnav ul.nav-list a {
  font-family: var(--mono);
  font-size: 0.68rem;
  font-weight: 500;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  color: var(--ink-mute);
  text-decoration: none;
  padding: 0.6rem 0.1rem;
  border-bottom: 1px solid transparent;
  transition: color 0.15s, border-color 0.15s;
}
nav.topnav ul.nav-list a:hover,
nav.topnav ul.nav-list a:focus-visible {
  color: var(--accent);
  border-bottom-color: var(--accent-soft);
}
nav.topnav ul.nav-list a[aria-current] {
  color: var(--ink);
  border-bottom-color: var(--accent);
}

/* ============ LAYOUT ============ */
.shell {
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  max-width: 1320px;
  margin: 0 auto;
  padding: 0 var(--pad);
}
@media (min-width: 1024px) {
  .shell.with-toc {
    grid-template-columns: 260px minmax(0, 1fr);
    gap: 4rem;
    padding: 0 3rem;
  }
}

/* ============ MASTHEAD ============ */
header.masthead {
  border-bottom: 1px solid var(--rule);
  padding: clamp(2.25rem, 6vw, 3.5rem) 0 clamp(1.75rem, 5vw, 2.75rem);
  margin-bottom: clamp(1.75rem, 5vw, 3rem);
}
header.masthead .eyebrow {
  font-family: var(--mono);
  font-size: 0.68rem;
  font-weight: 500;
  letter-spacing: 0.14em;
  text-transform: uppercase;
  color: var(--ink-mute);
  margin: 0 0 1.4rem;
}
header.masthead h1 {
  font-family: var(--display);
  font-weight: 500;
  font-size: clamp(2rem, 5.5vw, 3.3rem);
  line-height: 1.08;
  letter-spacing: -0.02em;
  margin: 0 0 1.2rem;
  text-wrap: balance;
  max-width: 24ch;
}
header.masthead h1 em { font-style: italic; color: var(--accent); font-weight: 500; }
header.masthead .lede {
  font-size: clamp(1.02rem, 1.4vw, 1.15rem);
  line-height: 1.55;
  color: var(--ink-soft);
  max-width: 58ch;
  margin: 0;
  font-weight: 400;
  text-wrap: pretty;
}
header.masthead .meta {
  display: flex;
  gap: 1.6rem;
  margin-top: 1.8rem;
  font-family: var(--mono);
  font-size: 0.7rem;
  color: var(--ink-mute);
  letter-spacing: 0.04em;
  flex-wrap: wrap;
}
header.masthead .meta span strong { color: var(--ink); font-weight: 500; margin-right: 0.4em; }

/* ============ TOC ============ */
/* Mobile: a collapsed <details> box between masthead and article.
   Desktop (≥1024px): a quiet sticky sidebar, opened by the page script. */
.toc { font-size: 0.8rem; line-height: 1.5; margin-bottom: 2.5rem; }
.toc-box {
  border: 1px solid var(--rule);
  border-radius: 8px;
  background: var(--paper-raise);
  padding: 0.3rem 1.1rem;
}
.toc-box summary {
  list-style: none;
  cursor: pointer;
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 1rem;
  padding: 0.65rem 0;
  font-family: var(--mono);
  font-size: 0.65rem;
  font-weight: 500;
  letter-spacing: 0.16em;
  text-transform: uppercase;
  color: var(--ink-mute);
}
.toc-box summary::-webkit-details-marker { display: none; }
.toc-box summary::after {
  content: '+';
  font-size: 0.9rem;
  color: var(--accent-soft);
  line-height: 1;
}
.toc-box[open] summary::after { content: '\\2212'; }
.toc-box[open] summary {
  border-bottom: 1px solid var(--rule-soft);
  margin-bottom: 0.3rem;
}
.toc ol { list-style: none; padding: 0; margin: 0; counter-reset: toc; }
.toc li {
  counter-increment: toc;
  display: flex;
  gap: 0.7rem;
  align-items: baseline;
  border-bottom: 1px dashed var(--rule-soft);
}
.toc li:last-child { border-bottom: 0; }
.toc li::before {
  content: counter(toc, decimal-leading-zero);
  font-family: var(--mono);
  font-size: 0.62rem;
  color: var(--accent-soft);
  flex: 0 0 auto;
}
.toc a {
  color: var(--ink-soft);
  text-decoration: none;
  padding: 0.45rem 0;
  flex: 1;
  transition: color 0.15s;
}
.toc a:hover, .toc a:focus-visible { color: var(--accent); }
@media (min-width: 1024px) {
  .toc {
    position: sticky;
    top: 4.5rem;
    max-height: calc(100dvh - 6rem);
    overflow-y: auto;
    margin-bottom: 0;
    padding-right: 1.25rem;
    border-right: 1px solid var(--rule-soft);
  }
  .toc-box { border: 0; border-radius: 0; background: transparent; padding: 0; }
  .toc-box summary { padding-top: 0; }
  .toc-box[open] summary { border-bottom: 0; margin-bottom: 0.4rem; }
}

/* ============ LONG-FORM CONTENT ============ */
main.content {
  max-width: var(--measure);
  padding-bottom: 6rem;
  min-width: 0;
  font-size: clamp(1.0625rem, 1.02rem + 0.22vw, 1.15rem);
  line-height: 1.62;
  overflow-wrap: break-word;
}

/* part dividers (source h1s after the document title is stripped) */
main.content h1 {
  font-family: var(--display);
  font-weight: 500;
  font-size: clamp(1.3rem, 2.4vw, 1.7rem);
  font-style: italic;
  letter-spacing: 0.01em;
  color: var(--accent);
  margin: 5.5rem 0 0;
  padding-top: 2.5rem;
  border-top: 3px double var(--rule);
}

main.content h2 {
  font-family: var(--display);
  font-weight: 500;
  font-size: clamp(1.5rem, 3vw, 2rem);
  line-height: 1.18;
  letter-spacing: -0.015em;
  margin: 4.5rem 0 1.4rem;
  scroll-margin-top: 5.5rem;
  text-wrap: balance;
  position: relative;
  padding-top: 2rem;
  border-top: 1px solid var(--rule);
}
main.content h2:first-of-type { margin-top: 0; border-top: none; padding-top: 0; }

main.content h3 {
  font-family: var(--body);
  font-weight: 600;
  font-size: 1.05em;
  line-height: 1.35;
  margin: 2.6rem 0 0.9rem;
  scroll-margin-top: 5.5rem;
  color: var(--ink);
}
main.content h4 {
  font-family: var(--mono);
  font-size: 0.68rem;
  font-weight: 500;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  color: var(--ink-mute);
  margin: 2rem 0 0.6rem;
}

.anchor {
  position: absolute;
  left: -1.4em;
  top: 2.05rem;
  font-family: var(--display);
  font-size: 1.1rem;
  color: var(--rule);
  text-decoration: none;
  opacity: 0;
  transition: opacity 0.15s, color 0.15s;
}
main.content h2:first-of-type .anchor { top: 0.05rem; }
h2:hover .anchor, .anchor:focus-visible { opacity: 1; color: var(--accent); }
@media (max-width: 1023px) {
  .anchor { display: none; }
}

main.content p { margin: 0 0 1.1em; text-wrap: pretty; }
main.content strong { font-weight: 600; color: var(--ink); }

main.content blockquote {
  border-left: 2px solid var(--accent-soft);
  padding: 0.4rem 0 0.4rem 1.4rem;
  margin: 1.6rem 0;
  font-style: italic;
  font-size: 1.02em;
  line-height: 1.58;
  color: var(--ink-soft);
}
main.content blockquote p:last-child { margin-bottom: 0; }

main.content a {
  color: var(--accent);
  text-decoration: underline;
  text-decoration-thickness: 1px;
  text-underline-offset: 0.18em;
  text-decoration-color: var(--accent-soft);
  transition: text-decoration-color 0.15s;
}
main.content a:hover { text-decoration-color: var(--accent); }

/* h2s draw their own top rule — hr stays pure whitespace */
main.content hr { border: 0; margin: 2.5rem 0; height: 1px; background: transparent; }

main.content ul, main.content ol { padding-left: 1.3rem; margin: 0 0 1.1em; }
main.content li { margin: 0.45em 0; }
main.content li li { font-size: 0.95em; }

/* ref → gloss handbook bullets: the leading italic ref reads as a hanging tag */
main.content li > em:first-child {
  font-style: normal;
  font-family: var(--mono);
  font-size: 0.78em;
  letter-spacing: 0.02em;
  color: var(--accent);
}

main.content pre {
  font-family: var(--mono);
  font-size: 0.74rem;
  line-height: 1.45;
  background: var(--paper-tint);
  border: 1px solid var(--rule-soft);
  border-radius: 6px;
  padding: 1rem 1.25rem;
  overflow-x: auto;
  margin: 1.6rem 0;
  color: var(--ink);
}
main.content code {
  font-family: var(--mono);
  font-size: 0.82em;
  background: var(--paper-tint);
  padding: 0.1em 0.35em;
  border-radius: 3px;
}
main.content pre code { background: transparent; padding: 0; font-size: 1em; }

/* tables: a soft card that scrolls sideways when it must */
main.content .table-wrap {
  overflow-x: auto;
  margin: 1.8rem 0;
  border: 1px solid var(--rule);
  border-radius: 8px;
  background: var(--paper-raise);
}
main.content table {
  border-collapse: collapse;
  font-size: 0.8rem;
  line-height: 1.5;
  width: 100%;
  margin: 0;
}
main.content th, main.content td {
  padding: 0.55rem 0.9rem;
  text-align: left;
  vertical-align: top;
  border-bottom: 1px solid var(--rule-soft);
}
main.content th {
  font-family: var(--mono);
  font-size: 0.62rem;
  font-weight: 500;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  color: var(--ink-mute);
  border-bottom: 1px solid var(--rule);
}
main.content tbody tr:last-child td { border-bottom: 0; }
@media (hover: hover) {
  main.content tbody tr:hover td { background: var(--paper-tint); }
}

/* ============ INDEX: SECTIONS + CARDS ============ */
section.index-section { margin-bottom: 4.5rem; }
section.index-section > h2 {
  font-family: var(--mono);
  font-size: 0.68rem;
  font-weight: 500;
  letter-spacing: 0.14em;
  text-transform: uppercase;
  color: var(--ink-mute);
  border-bottom: 1px solid var(--rule);
  padding-bottom: 0.6rem;
  margin: 0 0 1.6rem;
}
.card-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(min(320px, 100%), 1fr));
  gap: 1rem;
}
a.card {
  display: flex;
  flex-direction: column;
  gap: 0.55rem;
  border: 1px solid var(--rule);
  border-radius: 8px;
  background: var(--paper-raise);
  padding: 1.5rem 1.5rem 1.35rem;
  text-decoration: none;
  color: var(--ink);
  transition: border-color 0.18s;
}
@media (hover: hover) {
  a.card:hover { border-color: var(--accent-soft); }
}
a.card:focus-visible { border-color: var(--accent); }
a.card .card-eyebrow {
  font-family: var(--mono);
  font-size: 0.62rem;
  font-weight: 500;
  letter-spacing: 0.14em;
  text-transform: uppercase;
  color: var(--accent);
}
a.card h3 {
  font-family: var(--display);
  font-weight: 500;
  font-size: 1.3rem;
  line-height: 1.18;
  letter-spacing: -0.01em;
  margin: 0;
  text-wrap: balance;
}
a.card h3 em { font-style: italic; color: var(--accent); }
a.card .card-sub {
  font-style: italic;
  font-size: 0.92rem;
  color: var(--ink-soft);
  line-height: 1.45;
}
a.card .card-desc {
  font-size: 0.875rem;
  color: var(--ink-mute);
  line-height: 1.6;
  flex: 1;
}
a.card .card-meta {
  font-family: var(--mono);
  font-size: 0.66rem;
  color: var(--ink-mute);
  letter-spacing: 0.04em;
  margin-top: 0.5rem;
  display: flex;
  gap: 1.2rem;
  flex-wrap: wrap;
}

/* the newest study reads as the lead story */
a.card.lead { grid-column: 1 / -1; padding: clamp(1.5rem, 4vw, 2.25rem); }
a.card.lead h3 { font-size: clamp(1.6rem, 3.5vw, 2.1rem); }
a.card.lead .card-sub { font-size: 1rem; }
a.card.lead .card-desc { max-width: 62ch; }

/* ============ FOOTER ============ */
footer.site-footer {
  border-top: 1px solid var(--rule);
  margin-top: 2rem;
}
footer.site-footer .footer-inner {
  max-width: 1320px;
  margin: 0 auto;
  padding: 2rem var(--pad) 3rem;
  display: flex;
  justify-content: space-between;
  gap: 1.5rem;
  flex-wrap: wrap;
  font-family: var(--mono);
  font-size: 0.68rem;
  line-height: 1.6;
  color: var(--ink-mute);
  letter-spacing: 0.04em;
}
footer.site-footer em { font-style: italic; color: var(--accent); }
footer.site-footer a { color: var(--ink-soft); text-decoration: none; }
footer.site-footer a:hover { color: var(--accent); }

@media print {
  nav.topnav, .toc, footer.site-footer { display: none; }
  main.content { max-width: none; }
}
`;

export interface NavPage {
  readonly href: string;
  readonly label: string;
}

export const NAV_PAGES: readonly NavPage[] = [
  { href: '/', label: 'Studies' },
  { href: '/comparisons/', label: 'Comparisons' },
];

/**
 * `path` is the page's actual URL (exact match → aria-current="page");
 * `section` is the nav entry to highlight as ancestor (aria-current="true").
 */
export const nav = (path: string, section: string): string => `
    <nav class="topnav">
      <div class="nav-inner">
        <a class="brand" href="/">The <em>Sure</em> Word</a>
        <ul class="nav-list">
${NAV_PAGES.map((p) => {
  const current =
    p.href === path ? ` aria-current="page"` : p.href === section ? ` aria-current="true"` : '';
  return `          <li><a href="${p.href}"${current}>${p.label}</a></li>`;
}).join('\n')}
        </ul>
      </div>
    </nav>`;

export const footer = (): string => `
    <footer class="site-footer">
      <div class="footer-inner">
        <span>The <em>Sure</em> Word — Bible handbook studies. Every line: reference → text → gloss.</span>
        <span>"We have also a more sure word of prophecy" — 2 Peter 1:19</span>
      </div>
    </footer>`;

export const shell = (opts: {
  title: string;
  description: string;
  /** Exact URL of this page (for aria-current="page"). */
  path: string;
  /** Nav section this page belongs to ('/' or '/comparisons/'). */
  section: string;
  body: string;
}): string => `<!doctype html>
<html lang="en" data-theme="paper">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width,initial-scale=1" />
    <title>${esc(opts.title)}</title>
    <meta name="description" content="${esc(opts.description)}" />
    <meta name="theme-color" content="#f7f5f0" />
    <meta property="og:title" content="${esc(opts.title)}" />
    <meta property="og:description" content="${esc(opts.description)}" />
    <meta property="og:type" content="article" />
${FONTS}
    <link rel="stylesheet" href="/styles.css" />
  </head>
  <body>
    <a class="skip-link" href="#content">Skip to content</a>
${nav(opts.path, opts.section)}
${opts.body}
${footer()}
  </body>
</html>
`;

// ============================================================================
// Comparison-page unification
// ============================================================================

/**
 * Bridge stylesheet injected into the prebuilt comparison pages (which carry
 * their own embedded CSS from the original Sure Word reference design). The
 * archive pages use the same token names the site design was lifted from, so
 * redefining tokens after their <style> re-skins them wholesale.
 *
 * Keep the token values in sync with STYLES above. Two deliberate departures:
 * --oxblood stays a (calmer) red and --gold stays amber because the audit
 * pages use them SEMANTICALLY — violation chips, partial-agreement marks,
 * heatmap cells — where red must keep reading as "fail". Chrome accents are
 * overridden to the spruce accent selector-by-selector instead.
 */
const COMPARISON_BRIDGE = `
/* ==== The Sure Word bridge — tokens in sync with styles.css ==== */
:root {
  --paper: #f7f5f0;
  --paper-raise: #fdfcf8;
  --paper-tint: #eeebe1;
  --ink: #2a2924;
  --ink-soft: #514d42;
  --ink-mute: #6f6a5c;
  --rule: #dcd7c8;
  --rule-soft: #e8e4d8;
  --accent: #3d5a4c;
  --accent-soft: #74907f;
  --accent-wash: #e2e9e3;
  --indigo: #3d5a4c;   /* legacy link token -> accent */
  --green: #3d5a4c;    /* pass/agreement marks -> spruce (still green) */
  --gold: #8a6d2f;     /* partial agreement — semantic, unchanged */
  --oxblood: #7d3b2d;  /* violation red — calmer, but must stay red */
  --oxblood-soft: #a4664f;
  --body: 'Literata', Georgia, 'Times New Roman', serif;
}
body { font-size: 1.0625rem; line-height: 1.6; }
::selection { background: var(--accent-wash); color: var(--ink); }
a, summary { touch-action: manipulation; -webkit-tap-highlight-color: transparent; }
:focus-visible { outline: 2px solid var(--accent); outline-offset: 3px; }

/* site topnav (markup injected by the builder) */
nav.topnav a.brand em { color: var(--accent); }
nav.topnav ul.nav-list a {
  font-family: var(--mono);
  font-size: 0.68rem;
  letter-spacing: 0.12em;
  padding: 0.6rem 0.1rem;
}
nav.topnav ul.nav-list a:hover,
nav.topnav ul.nav-list a:focus-visible { color: var(--accent); border-bottom-color: var(--accent-soft); }
nav.topnav ul.nav-list a[aria-current] { color: var(--ink); border-bottom-color: var(--accent); }

/* local comparison sub-nav (markup injected by the builder) */
nav.subnav { border-bottom: 1px solid var(--rule); background: var(--paper-tint); }
nav.subnav .subnav-inner {
  max-width: 1320px;
  margin: 0 auto;
  padding: 0.15rem var(--pad);
  display: flex;
  gap: clamp(1rem, 3vw, 2rem);
  align-items: baseline;
  flex-wrap: wrap;
}
nav.subnav a.subnav-label {
  font-family: var(--mono);
  font-size: 0.65rem;
  font-weight: 500;
  letter-spacing: 0.14em;
  text-transform: uppercase;
  color: var(--ink);
  text-decoration: none;
  padding: 0.55rem 0;
}
nav.subnav ul.nav-list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  gap: clamp(0.85rem, 2vw, 1.5rem);
  flex-wrap: wrap;
}
nav.subnav ul.nav-list a {
  font-family: var(--mono);
  font-size: 0.65rem;
  font-weight: 500;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  color: var(--ink-mute);
  text-decoration: none;
  display: inline-block;
  padding: 0.55rem 0.1rem;
  border-bottom: 1px solid transparent;
  transition: color 0.15s, border-color 0.15s;
}
nav.subnav ul.nav-list a:hover,
nav.subnav ul.nav-list a:focus-visible { color: var(--accent); border-bottom-color: var(--accent-soft); }
nav.subnav ul.nav-list a[aria-current] { color: var(--ink); border-bottom-color: var(--accent); }

/* chrome accents -> spruce (verdict colors stay semantic) */
header.masthead h1 em { color: var(--accent); }
main.content blockquote { border-left-color: var(--accent-soft); }
.toc a:hover, .toc a:focus-visible { color: var(--accent); }

/* shared footer (replaces the archive colophon) */
footer.site-footer { border-top: 1px solid var(--rule); margin-top: 2rem; }
footer.site-footer .footer-inner {
  max-width: 1320px;
  margin: 0 auto;
  padding: 2rem var(--pad) 3rem;
  display: flex;
  justify-content: space-between;
  gap: 1.5rem;
  flex-wrap: wrap;
  font-family: var(--mono);
  font-size: 0.68rem;
  line-height: 1.6;
  color: var(--ink-mute);
  letter-spacing: 0.04em;
}
footer.site-footer em { font-style: italic; color: var(--accent); }
@media print { nav.topnav, nav.subnav, footer.site-footer { display: none; } }
`;

/**
 * Re-skin a prebuilt comparison page so it reads as part of the site:
 * - swap its local topnav for the shared site nav plus a slim sub-nav that
 *   keeps the comparison's own pages (with their aria-current markers)
 * - replace the archive colophon with the shared footer
 * - inject the site font set (Literata + Fraunces italics) and the bridge
 *   stylesheet after the page's embedded CSS so the new tokens win
 * Every replacement is best-effort: a page that lacks the expected block is
 * passed through unchanged in that respect.
 */
export const unifyComparisonPage = (html: string, comp: Comparison.Source): string => {
  let out = html;
  const navMatch = out.match(/<nav class="topnav" aria-label="Site">[\s\S]*?<\/nav>/);
  const pageList = navMatch?.[0].match(/<ul class="nav-list">[\s\S]*?<\/ul>/);
  if (navMatch !== null && navMatch !== undefined && pageList !== null && pageList !== undefined) {
    out = out.replace(
      navMatch[0],
      `${nav('', '/comparisons/').trim()}
    <nav class="subnav" aria-label="${esc(comp.title)} pages">
      <div class="subnav-inner">
        <a class="subnav-label" href="index.html">${esc(comp.title)}</a>
        ${pageList[0]}
      </div>
    </nav>`,
    );
  }
  out = out.replace(/<footer class="colophon">[\s\S]*?<\/footer>/, footer().trim());
  out = out.replace(/(<meta name="theme-color" content=")[^"]*(")/, '$1#f7f5f0$2');
  out = out.replace('</head>', `${FONTS}\n    <style>${COMPARISON_BRIDGE}</style>\n  </head>`);
  return out;
};

// ============================================================================
// Page templates
// ============================================================================

const fmtDate = (iso: string): string => {
  const d = new Date(iso);
  // date-only strings parse as UTC midnight — format in UTC or the day shifts
  return Number.isNaN(d.getTime())
    ? iso
    : d.toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
        timeZone: 'UTC',
      });
};

const count = (n: number, singular: string, plural = `${singular}s`): string =>
  `<strong>${n}</strong> ${n === 1 ? singular : plural}`;

export const studyPage = (opts: {
  meta: Study.Meta;
  articleHtml: string;
  toc: TocEntry[];
  words: number;
}): string => {
  const hasToc = opts.toc.length > 1;
  const tocHtml = hasToc
    ? `
      <aside class="toc" aria-label="Table of contents">
        <details class="toc-box">
          <summary>Contents</summary>
          <ol>
${opts.toc.map((t) => `            <li><a href="#${t.id}">${t.text}</a></li>`).join('\n')}
          </ol>
        </details>
      </aside>`
    : '';
  // The <details> ships closed (mobile-first); on desktop viewports the
  // sidebar TOC should read as always-open, so a one-liner opens it.
  const tocScript = hasToc
    ? `
    <script>
      matchMedia('(min-width: 1024px)').matches &&
        document.querySelector('.toc-box').setAttribute('open', '');
    </script>`
    : '';
  const body = `
    <div class="shell">
      <header class="masthead">
        <p class="eyebrow">${esc(opts.meta.eyebrow)}</p>
        <h1>${opts.meta.title}</h1>
        <p class="lede">${esc(opts.meta.subtitle)}</p>
        <div class="meta">
          <span><strong>${fmtDate(opts.meta.date)}</strong></span>
          <span>${count(opts.toc.length, 'section')}</span>
          <span><strong>${Math.round(opts.words / 1000)}k</strong> words</span>
          <span><strong>KJV</strong> throughout</span>
        </div>
      </header>
    </div>
    <div class="shell with-toc">
${tocHtml}
      <main class="content" id="content">
${opts.articleHtml}
      </main>
    </div>${tocScript}`;
  return shell({
    title: `${opts.meta.title.replace(/<[^>]*>/g, '')} — The Sure Word`,
    description: opts.meta.description,
    path: `/${opts.meta.slug}/`,
    section: '/',
    body,
  });
};

export const indexPage = (opts: {
  studies: readonly (Study.Meta & { words: number; sections: number })[];
  comparisons: readonly Comparison.Card[];
}): string => {
  const studyCards = opts.studies
    .map(
      (s, i) => `        <a class="card${i === 0 ? ' lead' : ''}" href="/${s.slug}/">
          <span class="card-eyebrow">${esc(s.eyebrow)}</span>
          <h3>${s.title}</h3>
          <span class="card-sub">${esc(s.subtitle)}</span>
          <span class="card-desc">${esc(s.description)}</span>
          <span class="card-meta"><span>${fmtDate(s.date)}</span><span>${s.sections} sections</span><span>${Math.round(s.words / 1000)}k words</span></span>
        </a>`,
    )
    .join('\n');
  const comparisonCards = opts.comparisons
    .map(
      (c) => `        <a class="card" href="${c.href}">
          <span class="card-eyebrow">${esc(c.eyebrow)}</span>
          <h3>${esc(c.title)}</h3>
          <span class="card-sub">${esc(c.subtitle)}</span>
          <span class="card-desc">${esc(c.description)}</span>
        </a>`,
    )
    .join('\n');
  const body = `
    <div class="shell" id="content">
      <header class="masthead">
        <p class="eyebrow">Bible Handbook Studies · KJV</p>
        <h1>The <em>Sure</em> Word</h1>
        <p class="lede">
          Long-form Bible studies in the old handbook pattern — every line a reference, the verse
          itself, and a short explanation. No authority outside the Word: read the verses in your
          own Bible, and weigh them.
        </p>
        <div class="meta">
          <span>${count(opts.studies.length, 'study', 'studies')}</span>
          <span>${count(opts.comparisons.length, 'comparison')}</span>
          <span><strong>2 Peter 1:19</strong> "a more sure word"</span>
        </div>
      </header>
      <section class="index-section">
        <h2>Studies</h2>
        <div class="card-grid">
${studyCards}
        </div>
      </section>
      <section class="index-section" id="comparisons">
        <h2>Comparisons</h2>
        <div class="card-grid">
${comparisonCards}
        </div>
      </section>
    </div>`;
  return shell({
    title: 'The Sure Word — Bible Handbook Studies',
    description:
      'Long-form KJV Bible studies in the old handbook pattern: every line a reference, the verse itself, and a short explanation.',
    path: '/',
    section: '/',
    body,
  });
};

export const comparisonsIndexPage = (comparisons: readonly Comparison.Card[]): string => {
  const cards = comparisons
    .map(
      (c) => `        <a class="card" href="${c.href}">
          <span class="card-eyebrow">${esc(c.eyebrow)}</span>
          <h3>${esc(c.title)}</h3>
          <span class="card-sub">${esc(c.subtitle)}</span>
          <span class="card-desc">${esc(c.description)}</span>
        </a>`,
    )
    .join('\n');
  const body = `
    <div class="shell" id="content">
      <header class="masthead">
        <p class="eyebrow">Weighed in the Balances</p>
        <h1>Comparisons</h1>
        <p class="lede">
          Verse-by-verse audits: modern expositors weighed against the pioneer writings and
          William Miller's rules of interpretation.
        </p>
      </header>
      <section class="index-section">
        <div class="card-grid">
${cards}
        </div>
      </section>
    </div>`;
  return shell({
    title: 'Comparisons — The Sure Word',
    description: 'Verse-by-verse audits of modern expositors weighed against the pioneer writings.',
    path: '/comparisons/',
    section: '/comparisons/',
    body,
  });
};
