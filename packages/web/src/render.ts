/**
 * Shared, dependency-free rendering helpers for The Sure Word static site.
 * Pure functions only — no Effect services, no Node builtins. `build.ts`
 * imports from here so styling, markdown rendering, and page chrome live in
 * exactly one place (the korean-project pattern).
 *
 * The design system is lifted from the original Sure Word comparison pages
 * (studies/daniel-revelation/v3-the-sure-word/reference/_archive/index.html):
 * paper ground, Fraunces display type, IBM Plex Sans/Mono, oxblood + indigo
 * accents, 72ch measure.
 */

/** Bun's built-in CommonMark renderer (Bun >= 1.3). Tables render natively. */
export const renderMarkdown = (md: string): string => Bun.markdown.html(md);

// ============================================================================
// Metadata
// ============================================================================

export interface StudyMeta {
  /** Source markdown, relative to the repo root. */
  readonly file: string;
  /** URL slug: the study is served at /studies/<slug>/. */
  readonly slug: string;
  /** Display title (may contain <em> for the oxblood italic accent). */
  readonly title: string;
  /** One-line subtitle shown under the title and on the index card. */
  readonly subtitle: string;
  /** 1-2 sentence description for the index card and <meta description>. */
  readonly description: string;
  /** Small uppercase label over the card/masthead, e.g. "Bible Handbook Study". */
  readonly eyebrow: string;
  /** ISO date the study was created (from frontmatter). */
  readonly date: string;
}

/** Strip YAML frontmatter and return { frontmatter-lines, body }. */
export const splitFrontmatter = (raw: string): { fm: string; body: string } => {
  const m = raw.match(/^---\n([\s\S]*?)\n---\n/);
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
  const seen = new Map<string, number>();
  const out = html.replace(
    /<(h[23])>([\s\S]*?)<\/\1>/g,
    (_m, tag: string, inner: string) => {
      const base = slugify(inner) || 'section';
      const n = seen.get(base) ?? 0;
      seen.set(base, n + 1);
      const id = n === 0 ? base : `${base}-${n + 1}`;
      const text = inner
        .replace(/<[^>]*>/g, '')
        .replace(/\s+/g, ' ')
        .trim();
      if (tag === 'h2') {
        toc.push({ id, text });
        return `<${tag} id="${id}"><a class="anchor" href="#${id}" aria-label="Link to section">¶</a>${inner}</${tag}>`;
      }
      return `<${tag} id="${id}">${inner}</${tag}>`;
    },
  );
  return { html: out, toc };
};

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
nav.topnav ul.nav-list a[aria-current='page'] {
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
main.content > h1:first-child { display: none; }

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

main.content hr { border: 0; margin: 2.5rem 0; height: 1px; background: var(--rule-soft); }

main.content ul, main.content ol { padding-left: 1.4rem; margin: 0 0 1rem; }
main.content li { margin: 0.4rem 0; }
main.content li li { font-size: 0.95em; }

/* ref → gloss handbook bullets: the leading italic ref reads as a hanging tag */
main.content li > em:first-child,
main.content p > em:first-child {
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

main.content table {
  border-collapse: collapse;
  font-size: 0.82rem;
  margin: 1.5rem 0;
  width: 100%;
  display: block;
  overflow-x: auto;
}
main.content th, main.content td {
  border: 1px solid var(--rule);
  padding: 0.35rem 0.7rem;
  text-align: left;
  vertical-align: top;
}
main.content th {
  font-family: var(--body);
  font-size: 0.65rem;
  font-weight: 600;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  color: var(--ink-mute);
  background: var(--paper-tint);
}

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
  grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
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
  transition: border-color 0.15s, background 0.15s, transform 0.15s;
}
a.card:hover, a.card:focus-visible {
  border-color: var(--oxblood-soft);
  background: #fffdf9;
  outline: none;
  transform: translateY(-1px);
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

export const nav = (current: string): string => `
    <nav class="topnav">
      <div class="nav-inner">
        <a class="brand" href="/">The <em>Sure</em> Word</a>
        <ul class="nav-list">
${NAV_PAGES.map(
  (p) =>
    `          <li><a href="${p.href}"${p.href === current ? ` aria-current="page"` : ''}>${p.label}</a></li>`,
).join('\n')}
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
  current: string;
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
${nav(opts.current)}
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
  return Number.isNaN(d.getTime())
    ? iso
    : d.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
};

export const studyPage = (opts: {
  meta: StudyMeta;
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
${opts.toc.map((t) => `          <li><a href="#${t.id}">${esc(t.text)}</a></li>`).join('\n')}
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
          <span><strong>${opts.toc.length}</strong> sections</span>
          <span><strong>${Math.round(opts.words / 1000)}k</strong> words</span>
          <span><strong>KJV</strong> throughout</span>
        </div>
      </header>
    </div>
    <div class="shell with-toc">
${tocHtml}
      <main class="content">
${opts.articleHtml}
      </main>
    </div>`;
  return shell({
    title: `${opts.meta.title.replace(/<[^>]*>/g, '')} — The Sure Word`,
    description: opts.meta.description,
    current: '/',
    body,
  });
};

export interface ComparisonCard {
  readonly href: string;
  readonly title: string;
  readonly subtitle: string;
  readonly description: string;
  readonly eyebrow: string;
}

export const indexPage = (opts: {
  studies: readonly (StudyMeta & { words: number; sections: number })[];
  comparisons: readonly ComparisonCard[];
}): string => {
  const studyCards = opts.studies
    .map(
      (s) => `        <a class="card" href="/studies/${s.slug}/">
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
    <div class="shell">
      <header class="masthead">
        <p class="eyebrow">Bible Handbook Studies · KJV</p>
        <h1>The <em>Sure</em> Word</h1>
        <p class="lede">
          Long-form Bible studies in the old handbook pattern — every line a reference, the verse
          itself, and a short explanation. No authority outside the Word: read the verses in your
          own Bible, and weigh them.
        </p>
        <div class="meta">
          <span><strong>${opts.studies.length}</strong> studies</span>
          <span><strong>${opts.comparisons.length}</strong> comparisons</span>
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
    current: '/',
    body,
  });
};

export const comparisonsIndexPage = (comparisons: readonly ComparisonCard[]): string => {
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
    <div class="shell">
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
    description:
      'Verse-by-verse audits of modern expositors weighed against the pioneer writings.',
    current: '/comparisons/',
    body,
  });
};
