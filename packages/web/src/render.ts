/**
 * Shared rendering helpers for The Sure Word static site. Pure functions only
 * — no services, no filesystem, no Node builtins (domain imports are
 * type-only, so this module stays runtime-dependency-free). `builder.ts`
 * imports from here so styling, markdown rendering, and page chrome live in
 * exactly one place (the korean-project pattern).
 *
 * The design system is lifted from the original Sure Word comparison pages
 * (studies/daniel-revelation/v3-the-sure-word/reference/_archive/index.html):
 * paper ground, Fraunces display type, IBM Plex Sans/Mono, oxblood + indigo
 * accents, 72ch measure.
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
      href="https://fonts.googleapis.com/css2?family=Fraunces:ital,opsz,wght@0,9..144,400;0,9..144,500;0,9..144,600;1,9..144,400;1,9..144,500&family=IBM+Plex+Sans:wght@400;500;600&family=IBM+Plex+Mono:wght@400;500&display=swap"
      rel="stylesheet"
    />`;

/**
 * Site-wide stylesheet, written once to <out>/styles.css and linked with a
 * root-absolute path from every generated page. Tokens and idiom are the Sure
 * Word design system; the long-form study typography extends it for handbook
 * pages (bold verse-group headers, ref → gloss bullets, DEFINITION blocks).
 */
export const STYLES = `:root {
  --paper: #faf8f5;
  --paper-tint: #f3eee3;
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
  --display: 'Fraunces', 'Times New Roman', Georgia, serif;
  --body: 'IBM Plex Sans', -apple-system, sans-serif;
  --mono: 'IBM Plex Mono', ui-monospace, monospace;
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
  font-feature-settings: 'kern', 'liga';
  -webkit-font-smoothing: antialiased;
  text-rendering: optimizeLegibility;
}
::selection { background: var(--ink); color: var(--paper); }

.skip-link {
  position: absolute;
  left: -9999px;
  top: 0;
  z-index: 40;
  background: var(--ink);
  color: var(--paper);
  padding: 0.6rem 1rem;
  font-family: var(--body);
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
  padding: 0.85rem var(--pad);
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
}
nav.topnav a.brand em { font-style: italic; color: var(--oxblood); }
nav.topnav ul.nav-list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  gap: clamp(0.85rem, 2vw, 1.6rem);
  flex-wrap: wrap;
}
nav.topnav ul.nav-list a {
  font-family: var(--body);
  font-size: 0.72rem;
  font-weight: 500;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  color: var(--ink-mute);
  text-decoration: none;
  padding: 0.3rem 0;
  border-bottom: 1px solid transparent;
  transition: color 0.15s, border-color 0.15s;
}
nav.topnav ul.nav-list a:hover,
nav.topnav ul.nav-list a:focus-visible {
  color: var(--oxblood);
  outline: none;
  border-bottom-color: var(--oxblood);
}
nav.topnav ul.nav-list a[aria-current] {
  color: var(--ink);
  border-bottom-color: var(--oxblood);
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
  max-width: 24ch;
}
header.masthead h1 em { font-style: italic; color: var(--oxblood); font-weight: 500; }
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
  flex-wrap: wrap;
}
header.masthead .meta span strong { color: var(--ink); font-weight: 500; margin-right: 0.4em; }

/* ============ TOC ============ */
.toc { font-family: var(--body); font-size: 0.78rem; line-height: 1.5; }
@media (min-width: 1024px) {
  .toc {
    position: sticky;
    top: 4.5rem;
    max-height: calc(100dvh - 6rem);
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
.toc ol { list-style: none; padding: 0; margin: 0; counter-reset: toc; }
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
  flex: 0 0 auto;
}
.toc a { color: var(--ink-soft); text-decoration: none; transition: color 0.15s; }
.toc a:hover, .toc a:focus-visible { color: var(--oxblood); outline: none; }

/* ============ LONG-FORM CONTENT ============ */
main.content {
  max-width: var(--measure);
  padding-bottom: 6rem;
  min-width: 0;
}

/* part dividers (source h1s after the document title is stripped) */
main.content h1 {
  font-family: var(--display);
  font-weight: 500;
  font-size: clamp(1.3rem, 2.4vw, 1.7rem);
  font-style: italic;
  letter-spacing: 0.01em;
  color: var(--oxblood);
  margin: 6rem 0 0;
  padding-top: 2.5rem;
  border-top: 3px double var(--rule);
}

main.content h2 {
  font-family: var(--display);
  font-weight: 500;
  font-size: clamp(1.6rem, 3.2vw, 2.2rem);
  line-height: 1.15;
  letter-spacing: -0.015em;
  margin: 5rem 0 1.5rem;
  scroll-margin-top: 5rem;
  text-wrap: balance;
  position: relative;
  padding-top: 2rem;
  border-top: 1px solid var(--rule);
}
main.content h2:first-of-type { margin-top: 0; border-top: none; padding-top: 0; }

main.content h3 {
  font-family: var(--body);
  font-weight: 600;
  font-size: 0.95rem;
  line-height: 1.35;
  margin: 2.5rem 0 1rem;
  scroll-margin-top: 5rem;
  color: var(--ink);
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
main.content h2:first-of-type .anchor { top: 0.05rem; }
h2:hover .anchor, .anchor:focus-visible { opacity: 1; color: var(--oxblood); outline: none; }

main.content p { margin: 0 0 1rem; text-wrap: pretty; }
main.content strong { font-weight: 600; color: var(--ink); }

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
main.content blockquote p:last-child { margin-bottom: 0; }

main.content a {
  color: var(--indigo);
  text-decoration: underline;
  text-decoration-thickness: 1px;
  text-underline-offset: 0.15em;
  text-decoration-color: var(--rule);
  transition: text-decoration-color 0.15s;
}
main.content a:hover { text-decoration-color: var(--indigo); }

/* h2s draw their own top rule — hr stays pure whitespace, as in the reference */
main.content hr { border: 0; margin: 2.5rem 0; height: 1px; background: transparent; }

main.content ul, main.content ol { padding-left: 1.4rem; margin: 0 0 1rem; }
main.content li { margin: 0.4rem 0; }
main.content li li { font-size: 0.95em; }

/* ref → gloss handbook bullets: the leading italic ref reads as a hanging tag */
main.content li > em:first-child {
  font-style: normal;
  font-family: var(--mono);
  font-size: 0.82em;
  letter-spacing: 0.02em;
  color: var(--oxblood);
}

main.content pre {
  font-family: var(--mono);
  font-size: 0.72rem;
  line-height: 1.4;
  background: var(--paper-tint);
  border: 1px solid var(--rule-soft);
  border-radius: 3px;
  padding: 1rem 1.25rem;
  overflow-x: auto;
  margin: 1.5rem 0;
  color: var(--ink);
}
main.content code {
  font-family: var(--mono);
  font-size: 0.85em;
  background: var(--paper-tint);
  padding: 0.1em 0.35em;
  border-radius: 2px;
}
main.content pre code { background: transparent; padding: 0; font-size: 1em; }

/* editorial tables, as in the reference: top/bottom frame, row rules only */
main.content .table-wrap {
  overflow-x: auto;
  margin: 1.5rem 0;
  border-top: 1px solid var(--ink);
  border-bottom: 1px solid var(--ink);
}
main.content table {
  border-collapse: collapse;
  font-size: 0.82rem;
  width: 100%;
  margin: 0;
}
main.content th, main.content td {
  padding: 0.45rem 0.8rem 0.45rem 0;
  text-align: left;
  vertical-align: top;
  border-bottom: 1px solid var(--rule-soft);
}
main.content th {
  font-family: var(--body);
  font-size: 0.65rem;
  font-weight: 600;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  color: var(--ink-mute);
  border-bottom: 1px solid var(--rule);
}
main.content tbody tr:last-child td { border-bottom: 0; }
main.content tbody tr:hover td { background: var(--paper-tint); }

/* ============ INDEX: SECTIONS + CARDS ============ */
section.index-section { margin-bottom: 4.5rem; }
section.index-section > h2 {
  font-family: var(--body);
  font-size: 0.7rem;
  font-weight: 600;
  letter-spacing: 0.14em;
  text-transform: uppercase;
  color: var(--ink-mute);
  border-bottom: 1px solid var(--rule);
  padding-bottom: 0.6rem;
  margin: 0 0 1.8rem;
}
.card-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(min(300px, 100%), 1fr));
  gap: 1.25rem;
}
a.card {
  display: flex;
  flex-direction: column;
  gap: 0.55rem;
  border: 1px solid var(--rule);
  border-radius: 3px;
  background: var(--paper);
  padding: 1.4rem 1.5rem 1.25rem;
  text-decoration: none;
  color: var(--ink);
  transition: border-color 0.15s;
}
a.card:hover, a.card:focus-visible {
  border-color: var(--oxblood-soft);
  outline: none;
}
a.card .card-eyebrow {
  font-family: var(--body);
  font-size: 0.62rem;
  font-weight: 600;
  letter-spacing: 0.14em;
  text-transform: uppercase;
  color: var(--oxblood);
}
a.card h3 {
  font-family: var(--display);
  font-weight: 500;
  font-size: 1.35rem;
  line-height: 1.15;
  letter-spacing: -0.01em;
  margin: 0;
  text-wrap: balance;
}
a.card .card-sub {
  font-family: var(--display);
  font-style: italic;
  font-size: 0.92rem;
  color: var(--ink-soft);
  line-height: 1.4;
}
a.card .card-desc {
  font-size: 0.85rem;
  color: var(--ink-mute);
  line-height: 1.55;
  flex: 1;
}
a.card .card-meta {
  font-family: var(--mono);
  font-size: 0.68rem;
  color: var(--ink-mute);
  letter-spacing: 0.04em;
  margin-top: 0.4rem;
  display: flex;
  gap: 1.2rem;
  flex-wrap: wrap;
}

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
  font-size: 0.7rem;
  color: var(--ink-mute);
  letter-spacing: 0.04em;
}
footer.site-footer em { font-style: italic; color: var(--oxblood); }
footer.site-footer a { color: var(--ink-soft); text-decoration: none; }
footer.site-footer a:hover { color: var(--oxblood); }

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
    <meta name="theme-color" content="#faf8f5" />
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
  const tocHtml =
    opts.toc.length > 1
      ? `
      <aside class="toc" aria-label="Table of contents">
        <p class="toc-h">Contents</p>
        <ol>
${opts.toc.map((t) => `          <li><a href="#${t.id}">${t.text}</a></li>`).join('\n')}
        </ol>
      </aside>`
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
    </div>`;
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
      (s) => `        <a class="card" href="/${s.slug}/">
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
