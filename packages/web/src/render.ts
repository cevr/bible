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

export interface StudySection {
  readonly ordinal: number;
  readonly id: string;
  readonly title: string;
  readonly href: string;
  readonly words: number;
  readonly summaryHtml?: string;
  readonly html: string;
  readonly partOrdinal: number;
}

export interface StudyPart {
  readonly ordinal: number;
  readonly label: string;
  readonly title: string;
  readonly href: string;
  readonly words: number;
  readonly sections: readonly StudySection[];
}

export interface SymbolEntry {
  readonly id: string;
  readonly term: string;
  readonly normalizedTerm: string;
  readonly owner?: StudySection;
}

export interface StudyAppendix {
  readonly id: string;
  readonly title: string;
  readonly href: string;
  readonly html: string;
  readonly entries: readonly SymbolEntry[];
}

export interface StudyDocument {
  readonly introductionHtml: string;
  readonly parts: readonly StudyPart[];
  readonly sections: readonly StudySection[];
  readonly appendix?: StudyAppendix;
  readonly words: number;
}

/**
 * Give every h2/h3 a stable id (slug of its text, deduped with -2, -3…) and
 * return the h2 list for the sticky table of contents. The `¶` anchor link on
 * h2s mirrors the original comparison pages.
 */
const anchorHeadings = (html: string): { html: string; ids: readonly string[] } => {
  const ids: string[] = [];
  const issued = new Set<string>();
  const out = html.replace(/<(h[23])>([\s\S]*?)<\/\1>/g, (_m, tag: string, inner: string) => {
    const base = slugify(inner) || 'section';
    let id = base;
    for (let n = 2; issued.has(id); n += 1) id = `${base}-${n}`;
    issued.add(id);
    if (tag === 'h2') {
      ids.push(id);
      return `<${tag} id="${id}"><a class="anchor" href="#${id}" aria-label="Link to section">¶</a>${inner}</${tag}>`;
    }
    ids.push(id);
    return `<${tag} id="${id}">${inner}</${tag}>`;
  });
  return { html: out, ids };
};

/**
 * Prepare a rendered study body for the page shell:
 * - drop the document's own <h1> title (the masthead already carries it)
 * - drop an in-body "Table of Contents" section (the sticky aside replaces it,
 *   and its markdown-era anchor links don't match our heading ids)
 * - wrap tables so wide ones scroll without breaking table semantics
 * Remaining h1s are retained for the document parser to treat as Part
 * boundaries; they are not emitted inside a Part page's article body.
 */
export const prepareArticle = (html: string): string =>
  html
    .replace(/<h1>[\s\S]*?<\/h1>/, '')
    .replace(/<h2>\s*Table of Contents\s*<\/h2>[\s\S]*?(?=<h[12])/i, '')
    .replaceAll('<table>', '<div class="table-wrap"><table>')
    .replaceAll('</table>', '</table></div>');

const textFromHtml = (html: string): string =>
  html
    .replace(/<[^>]*>/g, ' ')
    .replace(/&[a-z#0-9]+;/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();

const normalizedText = (html: string): string => textFromHtml(html).toLowerCase();

export const countStudyWords = (html: string): number => {
  const text = textFromHtml(html);
  return text === '' ? 0 : text.split(' ').length;
};

export const estimateReadingMinutes = (words: number): number =>
  Math.max(1, Math.ceil(words / 200));

export const formatReadingTime = (minutes: number): string => {
  if (minutes < 60) return `≈${minutes}&nbsp;min`;
  const hours = Math.floor(minutes / 60);
  const remainder = minutes % 60;
  return remainder === 0 ? `≈${hours}&nbsp;hr` : `≈${hours}&nbsp;hr ${remainder}&nbsp;min`;
};

const withoutAnchor = (html: string): string => html.replace(/^<a class="anchor"[\s\S]*?<\/a>/, '');

const normalizedSectionTitle = (html: string): string =>
  normalizedText(html).replace(/^\d+\.\s*/, '');

const linkSectionReferences = (html: string, hrefByTitle: ReadonlyMap<string, string>): string => {
  const suppressed: string[] = [];
  return html
    .split(/(<[^>]+>)/g)
    .map((part) => {
      if (!part.startsWith('<')) {
        if (suppressed.length > 0) return part;
        return part.replace(
          /\b(see|defined in) &quot;([^&]+)&quot;/gi,
          (match, prefix: string, title: string) => {
            const href = hrefByTitle.get(normalizedSectionTitle(title));
            return href === undefined
              ? match
              : `<a class="section-cross-reference" href="${href}">${prefix} “${title}”</a>`;
          },
        );
      }
      const closing = part.match(/^<\/(a|code|pre|script|style)/i)?.[1]?.toLowerCase();
      if (closing !== undefined) suppressed.pop();
      const opening = part.match(/^<(a|code|pre|script|style)(?:\s|>)/i)?.[1]?.toLowerCase();
      if (opening !== undefined && !part.startsWith('</')) suppressed.push(opening);
      return part;
    })
    .join('');
};

const decodeEntities = (value: string): string =>
  value
    .replace(/&#(\d+);/g, (_match, code: string) => String.fromCodePoint(Number(code)))
    .replace(/&#x([\da-f]+);/gi, (_match, code: string) =>
      String.fromCodePoint(Number.parseInt(code, 16)),
    )
    .replaceAll('&quot;', '"')
    .replaceAll('&apos;', "'")
    .replaceAll('&#39;', "'")
    .replaceAll('&amp;', '&')
    .replaceAll('&nbsp;', ' ');

const normalizeDictionaryTerm = (html: string): string =>
  decodeEntities(html.replace(/<[^>]*>/g, ' '))
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();

const annotateAppendix = (
  bodyHtml: string,
  slug: string,
  sections: readonly StudySection[],
  issuedIds: readonly string[],
): {
  html: string;
  entries: readonly SymbolEntry[];
  symbols: ReadonlyMap<string, string>;
} => {
  const issued = new Set(issuedIds);
  const symbols = new Map<string, string>();
  const entries: SymbolEntry[] = [];
  const byTitle = new Map(
    sections.map((section) => [normalizedSectionTitle(section.title), section]),
  );
  const annotated = bodyHtml.replace(
    /<li><strong>([\s\S]*?)<\/strong>\s*=\s*([\s\S]*?)<\/li>/g,
    (whole, termHtml: string, trailing: string) => {
      const normalizedTerm = normalizeDictionaryTerm(termHtml);
      const base = `symbol-${slugify(termHtml) || 'entry'}`;
      let id = base;
      for (let n = 2; issued.has(id); n += 1) id = `${base}-${n}`;
      issued.add(id);
      if (!symbols.has(normalizedTerm)) symbols.set(normalizedTerm, id);
      let owner: StudySection | undefined;
      const linkedTrailing = trailing.replace(
        /— defined in &quot;([\s\S]*?)&quot;\./i,
        (sentence, titleHtml: string) => {
          owner = byTitle.get(normalizedSectionTitle(titleHtml));
          return owner === undefined
            ? sentence
            : `— defined in &quot;<a class="defined-in-link" href="${owner.href}#${owner.id}">${titleHtml}</a>&quot;.`;
        },
      );
      entries.push({
        id,
        term: textFromHtml(termHtml),
        normalizedTerm,
        ...(owner === undefined ? {} : { owner }),
      });
      return `<li class="symbol-entry" id="${id}"><strong>${termHtml}</strong> = ${linkedTrailing}</li>`;
    },
  );
  return { html: annotated, entries, symbols };
};

const linkSymbols = (html: string, slug: string, symbols: ReadonlyMap<string, string>): string =>
  html.replace(
    /<li><strong>([\s\S]*?)<\/strong>\s*=\s*([\s\S]*?)<\/li>/g,
    (whole, termHtml: string) => {
      const symbolId = symbols.get(normalizeDictionaryTerm(termHtml));
      const href = symbolId === undefined ? `/${slug}/appendix/` : `/${slug}/appendix/#${symbolId}`;
      return whole
        .replace(
          `<strong>${termHtml}</strong>`,
          symbolId === undefined
            ? `<strong>${termHtml}</strong>`
            : `<a class="symbol-link" href="${href}"><strong>${termHtml}</strong></a>`,
        )
        .replace(
          /Defined in full at the close\./g,
          `<a class="appendix-link" href="${href}">Defined in full in the Symbol Dictionary.</a>`,
        );
    },
  );

const annotateListItem = (opening: string, inner: string): string => {
  const leading = inner.match(/^(\s*)(<em>[\s\S]*?<\/em>)([\s\S]*)$/);
  if (leading === null) return `${opening}${inner}</li>`;
  const [, whitespace = '', reference = '', remainder = ''] = leading;
  const scripture = /biblegateway\.com/i.test(reference);
  const witness = /egwwritings\.org/i.test(reference) || /^\s*(?:White|Miller):/i.test(remainder);
  if (!scripture && !witness) return `${opening}${inner}</li>`;
  const register = scripture ? 'scripture' : 'witness';
  const quoteAndGloss = remainder.includes('<ul>')
    ? null
    : remainder.match(/^(\s*)(&quot;[\s\S]*?&quot;)(\s+—[\s\S]*)$/);
  const annotatedRemainder =
    quoteAndGloss === null
      ? remainder
      : `${quoteAndGloss[1]}<span class="source-quotation">${quoteAndGloss[2]}</span><span class="source-gloss">${quoteAndGloss[3]}</span>`;
  const label = witness ? '<span class="register-label">Witness</span>' : '';
  const annotatedOpening = opening.replace('<li', `<li data-register="${register}"`);
  return `${annotatedOpening}${whitespace}${label}<span class="source-ref">${reference}</span>${annotatedRemainder}</li>`;
};

export const annotateRegisters = (html: string): string => {
  let output = '';
  let cursor = 0;
  while (true) {
    const start = html.indexOf('<li', cursor);
    if (start < 0) return output + html.slice(cursor);
    const openingEnd = html.indexOf('>', start);
    if (openingEnd < 0) return output + html.slice(cursor);
    const tokens = /<li(?:\s[^>]*)?>|<\/li>/g;
    const tail = html.slice(openingEnd + 1);
    let depth = 1;
    let closingStart = -1;
    for (const token of tail.matchAll(tokens)) {
      if (token[0] === '</li>') {
        depth -= 1;
        if (depth === 0) {
          closingStart = openingEnd + 1 + token.index;
          break;
        }
      } else {
        depth += 1;
      }
    }
    if (closingStart < 0) return output + html.slice(cursor);
    const opening = html.slice(start, openingEnd + 1);
    const inner = annotateRegisters(html.slice(openingEnd + 1, closingStart));
    output += html.slice(cursor, start) + annotateListItem(opening, inner);
    cursor = closingStart + 5;
  }
};

export const annotateStudySection = (sectionId: string, linkedHtml: string): string => {
  let html = linkedHtml;
  html = html.replace(
    /^\s*<blockquote>([\s\S]*?)<\/blockquote>/,
    '<aside class="section-abstract" aria-label="In this section"><p class="apparatus-label">In This Section</p>$1</aside>',
  );
  html = html.replace(
    /<p><strong>DEFINITION —[\s\S]*?<\/p>/g,
    '<aside class="section-synthesis" aria-label="Section synthesis"><p class="apparatus-label">Synthesis</p>$&</aside>',
  );
  html = html.replace(
    /<p><strong>Symbols defined here:<\/strong><\/p>\s*(<ul>[\s\S]*?<\/ul>)/gi,
    '<aside class="concept-ledger concept-ledger-defined" aria-label="Symbols defined here"><p class="apparatus-label">Symbols Defined Here</p>$1</aside>',
  );
  html = html.replace(
    /<p><strong>Symbols carried:<\/strong>([\s\S]*?)<\/p>\s*(<ul>[\s\S]*?<\/ul>)?/gi,
    '<aside class="concept-ledger concept-ledger-carried" aria-label="Symbols carried"><p class="apparatus-label">Symbols Carried</p><p>$1</p>$2</aside>',
  );
  html = html.replace(
    /<p><strong>For discussion:<\/strong><\/p>\s*(<ol>[\s\S]*?<\/ol>)/gi,
    `<section class="section-review" aria-labelledby="review-${sectionId}"><h3 id="review-${sectionId}">For Discussion</h3>$1</section>`,
  );
  return annotateRegisters(html);
};

interface StructuralHeading {
  readonly tag: 'h1' | 'h2';
  readonly id: string;
  readonly inner: string;
  readonly titleHtml: string;
  readonly titleText: string;
  readonly start: number;
  readonly end: number;
}

export const parseStudyArticle = ({
  slug,
  html,
}: {
  readonly slug: string;
  readonly html: string;
}): StudyDocument => {
  const anchored = anchorHeadings(html);
  const structural: StructuralHeading[] = [];
  const pattern = /<(h1|h2)(?: id="([^"]+)")?>([\s\S]*?)<\/\1>/g;
  for (const match of anchored.html.matchAll(pattern)) {
    const tag = match[1];
    if (tag !== 'h1' && tag !== 'h2') continue;
    const inner = match[3] ?? '';
    const titleHtml = tag === 'h2' ? withoutAnchor(inner) : inner;
    structural.push({
      tag,
      id: match[2] ?? '',
      inner,
      titleHtml,
      titleText: textFromHtml(titleHtml),
      start: match.index,
      end: match.index + match[0].length,
    });
  }
  const appendixHeading = structural.find(
    (heading) => heading.tag === 'h2' && normalizedText(heading.titleHtml).startsWith('appendix'),
  );
  const contentEnd = appendixHeading?.start ?? anchored.html.length;
  const contentHeadings = structural.filter((heading) => heading.start < contentEnd);
  const partHeadings = contentHeadings.filter((heading) => heading.tag === 'h1');
  const sectionHeadings = contentHeadings.filter((heading) => heading.tag === 'h2');
  const firstBoundary = partHeadings[0]?.start ?? sectionHeadings[0]?.start ?? contentEnd;
  const introductionHtml = anchored.html.slice(0, firstBoundary).trim();
  const partDrafts = (
    partHeadings.length === 0
      ? [
          {
            label: 'Study',
            title: 'Study',
            start: firstBoundary,
            end: contentEnd,
          },
        ]
      : partHeadings.map((heading, index) => ({
          label: heading.titleHtml,
          title: heading.titleHtml.replace(/^Part\s+(?:[IVXLCDM]+|\d+)\s*[—-]\s*/i, ''),
          start: heading.end,
          end: partHeadings[index + 1]?.start ?? contentEnd,
        }))
  )
    .map((part) => ({
      ...part,
      headings: sectionHeadings.filter(
        (heading) => heading.start >= part.start && heading.start < part.end,
      ),
    }))
    .filter((part) => part.headings.length > 0);

  const sectionDrafts: Array<Omit<StudySection, 'ordinal' | 'href' | 'partOrdinal'>> = [];
  const sectionIndexesByPart: number[][] = [];
  partDrafts.forEach((part) => {
    const indexes: number[] = [];
    part.headings.forEach((heading, index) => {
      const nextHeading = part.headings[index + 1];
      const html = anchored.html.slice(heading.end, nextHeading?.start ?? part.end).trim();
      const summaryHtml = html.match(/^\s*<blockquote>([\s\S]*?)<\/blockquote>/)?.[1];
      indexes.push(sectionDrafts.length);
      sectionDrafts.push({
        id: heading.id,
        title: heading.titleHtml,
        words: countStudyWords(`${heading.titleHtml} ${html}`),
        ...(summaryHtml === undefined ? {} : { summaryHtml }),
        html,
      });
    });
    sectionIndexesByPart.push(indexes);
  });

  const bareSections: StudySection[] = sectionDrafts.map((section, index) => {
    const partIndex = sectionIndexesByPart.findIndex((indexes) => indexes.includes(index));
    const partOrdinal = partIndex + 1;
    return {
      ...section,
      ordinal: index + 1,
      partOrdinal,
      href: `/${slug}/${index + 1}/`,
    };
  });
  const appendixBody =
    appendixHeading === undefined ? undefined : anchored.html.slice(appendixHeading.end).trim();
  const annotatedAppendix =
    appendixBody === undefined
      ? undefined
      : annotateAppendix(appendixBody, slug, bareSections, anchored.ids);
  const hrefByTitle = new Map(
    bareSections.map((section) => [normalizedSectionTitle(section.title), section.href]),
  );
  const sections = bareSections.map((section) => ({
    ...section,
    html: annotateStudySection(
      section.id,
      linkSectionReferences(
        annotatedAppendix === undefined
          ? section.html
          : linkSymbols(section.html, slug, annotatedAppendix.symbols),
        hrefByTitle,
      ),
    ),
  }));
  const parts = partDrafts.map((part, index) => {
    const partSections =
      sectionIndexesByPart[index]?.flatMap((sectionIndex) => {
        const section = sections[sectionIndex];
        return section === undefined ? [] : [section];
      }) ?? [];
    return {
      ordinal: index + 1,
      label: part.label,
      title: part.title,
      href: partSections[0]?.href ?? `/${slug}/`,
      words: partSections.reduce((sum, section) => sum + section.words, 0),
      sections: partSections,
    };
  });
  const appendix =
    appendixHeading === undefined || annotatedAppendix === undefined
      ? undefined
      : {
          id: appendixHeading.id,
          title: appendixHeading.titleHtml,
          href: `/${slug}/appendix/`,
          html: annotatedAppendix.html,
          entries: annotatedAppendix.entries,
        };
  return {
    introductionHtml,
    parts,
    sections,
    ...(appendix === undefined ? {} : { appendix }),
    words:
      countStudyWords(introductionHtml) + sections.reduce((sum, section) => sum + section.words, 0),
  };
};

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
 * that collapses to a <details> box on mobile (the reading-page script
 * opens it on desktop viewports).
 */
export const STYLES = `:root {
  color-scheme: light dark;
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

@media (prefers-color-scheme: dark) {
  :root {
    --paper: #171b18;
    --paper-raise: #202621;
    --paper-tint: #242b25;
    --ink: #e9e6dc;
    --ink-soft: #c7c2b4;
    --ink-mute: #a6a092;
    --rule: #465047;
    --rule-soft: #323a33;
    --accent: #9bbfa9;
    --accent-soft: #739784;
    --accent-wash: #2c4034;
  }
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
.toc ol { list-style: none; padding: 0; margin: 0; }
.toc li {
  display: flex;
  gap: 0.7rem;
  align-items: baseline;
  border-bottom: 1px dashed var(--rule-soft);
}
.toc li:last-child { border-bottom: 0; }
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
.card-progress { display: block; color: var(--accent); }

/* ============ STUDY OVERVIEW ============ */
.study-actions { display: flex; flex-wrap: wrap; gap: 0.75rem; margin-top: 1.5rem; }
.start-reading, .resume-reading, .section-pagination a, .completion-control {
  min-height: 44px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border: 1px solid var(--accent-soft);
  border-radius: 6px;
  padding: 0.65rem 1rem;
  font-family: var(--mono);
  font-size: 0.72rem;
  font-weight: 500;
  color: var(--accent);
  background: var(--paper-raise);
  text-decoration: none;
}
.start-reading { background: var(--accent); color: var(--paper); border-color: var(--accent); }
.study-overview { max-width: 900px; padding-bottom: 6rem; }
.study-introduction { max-width: var(--measure); margin-bottom: 3rem; }
.study-introduction h2, .study-syllabus h2 {
  font-family: var(--display);
  font-weight: 500;
  text-wrap: balance;
}
.part-list { list-style: none; margin: 0; padding: 0; display: grid; gap: 1rem; }
.part-card { border: 1px solid var(--rule); border-radius: 8px; background: var(--paper-raise); padding: 1.25rem; }
.part-card h2 { margin: 0; font-family: var(--display); font-size: 1.25rem; line-height: 1.3; }
.part-label, .part-card-meta {
  font-family: var(--mono);
  font-size: 0.68rem;
  color: var(--ink-mute);
}
.section-list { margin: 1rem 0 0; padding-left: 1.5rem; }
.section-list li { padding: 0.35rem 0; }
.section-list a { min-height: 44px; color: var(--ink-soft); display: grid; grid-template-columns: 1fr auto; gap: 0.4rem 1rem; }
.section-summary { grid-column: 1 / -1; color: var(--ink-mute); font-size: 0.9em; line-height: 1.5; }
.breadcrumbs { display: flex; gap: 0.5rem; padding-top: 1rem; font-family: var(--mono); font-size: 0.68rem; }
.breadcrumbs span::before { content: '›'; margin-right: 0.5rem; color: var(--ink-mute); }

/* ============ STUDY NAVIGATION ============ */
.study-toc { position: sticky; top: var(--topnav-height, 3.25rem); align-self: start; }
.study-toc .toc-box summary { min-height: 44px; display: flex; justify-content: space-between; align-items: center; }
.study-toc .toc-box[open] { max-height: calc(100dvh - var(--topnav-height, 3.25rem) - 1rem); overflow-y: auto; }
.study-toc li { display: block; border-bottom: 0; }
.toc-part { border-bottom: 1px dashed var(--rule-soft) !important; padding: 0.35rem 0; }
.study-toc a { min-height: 44px; display: flex; align-items: center; gap: 0.35rem; padding: 0.45rem; }
.toc-part-label { color: var(--ink); min-height: 44px; display: flex; align-items: center; padding: 0.45rem; }
.toc-sections { padding-left: 0.75rem !important; }
.toc-sections a { justify-content: space-between; }
.toc-sections li[data-active] > a { background: var(--accent-wash); border-radius: 4px; color: var(--accent); }
.toc-status { white-space: nowrap; font-family: var(--mono); font-size: 0.58rem; color: var(--ink-mute); }
.toc-appendix[aria-current='page'] { background: var(--accent-wash); }

.reading-progress { --section-progress: 0; position: sticky; top: var(--topnav-height, 3.25rem); height: 3px; background: var(--rule-soft); overflow: hidden; }
.reading-progress span {
  display: block;
  width: 100%;
  height: 100%;
  background: var(--accent);
  transform: scaleX(var(--section-progress));
  transform-origin: left;
}

.study-section { margin-bottom: 4rem; }
.study-section h1, .study-section h2, .study-section h3, .symbol-entry { scroll-margin-top: calc(var(--topnav-height, 3.25rem) + 4rem); }
.section-header { margin-bottom: 2.5rem; }
main.content .section-header h1 {
  position: relative;
  font-family: var(--display);
  font-weight: 500;
  font-style: normal;
  font-size: clamp(2rem, 5vw, 3.2rem);
  line-height: 1.1;
  letter-spacing: -0.015em;
  color: var(--ink);
  text-wrap: balance;
  margin: 0;
  padding-top: 0;
  border-top: 0;
}
.section-header h1 .anchor { top: 0.15rem; }
.section-header h1:hover .anchor, .section-header h1 .anchor:focus-visible { opacity: 1; color: var(--accent); }
.section-header .section-meta { font-family: var(--mono); font-size: 0.68rem; color: var(--ink-mute); margin: 0.9rem 0 0; letter-spacing: 0.04em; }
.section-end { border-top: 1px solid var(--rule); margin-top: 2.5rem; padding-top: 1.25rem; display: grid; gap: 1rem; }
.completion-control { justify-self: start; gap: 0.65rem; cursor: pointer; }
.completion-control input { inline-size: 1.1rem; block-size: 1.1rem; }
.section-pagination { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 1rem; }
.section-pagination a:last-child { text-align: right; justify-content: flex-end; }

/* ============ LEARNING APPARATUS ============ */
.section-abstract, .section-synthesis, .concept-ledger, .section-review {
  padding: 1rem 1.15rem;
  margin: 1.6rem 0;
}
.section-abstract { border: 1px solid var(--rule); background: var(--paper-raise); }
.section-synthesis { background: var(--accent-wash); border: 1px solid var(--rule); }
.concept-ledger { font-size: 0.92em; line-height: 1.5; }
.section-review { border-top: 1px solid var(--rule); padding-top: 2rem; margin-top: 3rem; }
.apparatus-label, .register-label {
  font-family: var(--mono);
  font-size: 0.68rem;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  color: var(--ink-mute);
}
.study-section li[data-register='witness'] { list-style: none; border: 1px solid var(--rule); border-radius: 6px; background: var(--paper-tint); padding: 0.45rem 0.75rem; }
.register-label { display: block; }
.source-ref { font-family: var(--mono); color: var(--accent); }
.source-quotation { color: var(--ink); font-family: var(--body); }
.source-gloss { color: var(--ink-soft); }
.symbol-entry { padding-block: 0.4rem; }
.sr-only { position: absolute; inline-size: 1px; block-size: 1px; padding: 0; margin: -1px; overflow: hidden; clip: rect(0, 0, 0, 0); white-space: nowrap; border: 0; }

@media (min-width: 1024px) {
  .study-toc a, .study-toc .toc-box summary { min-height: 24px; }
}
@media (max-width: 600px) {
  .section-pagination { grid-template-columns: 1fr; }
  .section-pagination a:last-child { text-align: left; justify-content: flex-start; }
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
  nav.topnav, .toc, footer.site-footer, .study-rail, .completion-toggle, .part-pagination { display: none; }
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

export const footer = (explicitReference = false): string => `
    <footer class="site-footer">
      <div class="footer-inner">
        <span>The <em>Sure</em> Word — Bible handbook studies. Every line: reference → text → gloss.</span>
        <span>"We have also a more sure word of prophecy" — ${explicitReference ? '<a href="https://www.biblegateway.com/passage/?search=2%20Peter%201%3A19&amp;version=KJV" target="_blank" rel="noopener noreferrer">2 Peter 1:19</a>' : '2 Peter 1:19'}</span>
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
  explicitFooterReference?: boolean;
}): string => `<!doctype html>
<html lang="en" data-theme="paper">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width,initial-scale=1" />
    <title>${esc(opts.title)}</title>
    <meta name="description" content="${esc(opts.description)}" />
    <meta name="theme-color" content="#f7f5f0" media="(prefers-color-scheme: light)" />
    <meta name="theme-color" content="#171b18" media="(prefers-color-scheme: dark)" />
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
${footer(opts.explicitFooterReference)}
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
  color-scheme: light dark;
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
@media (prefers-color-scheme: dark) {
  :root {
    --paper: #171b18;
    --paper-raise: #202621;
    --paper-tint: #242b25;
    --ink: #e9e6dc;
    --ink-soft: #c7c2b4;
    --ink-mute: #a6a092;
    --rule: #465047;
    --rule-soft: #323a33;
    --accent: #9bbfa9;
    --accent-soft: #739784;
    --accent-wash: #2c4034;
    --indigo: #9bbfa9;
    --green: #8fbea0;
    --gold: #d1ad62;
    --oxblood: #d88470;
    --oxblood-soft: #e1a08e;
  }
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
  out = out.replace(
    /<meta name="theme-color" content="[^"]*"\s*\/?>/,
    '<meta name="theme-color" content="#f7f5f0" media="(prefers-color-scheme: light)" />\n    <meta name="theme-color" content="#171b18" media="(prefers-color-scheme: dark)" />',
  );
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

const masthead = (opts: {
  meta: Study.Meta;
  title?: string;
  eyebrow?: string;
  lede: string;
  values: readonly string[];
  actions?: string;
}): string => `
    <div class="shell">
      <header class="masthead">
        <p class="eyebrow">${opts.eyebrow ?? esc(opts.meta.eyebrow)}</p>
        <h1>${opts.title ?? opts.meta.title}</h1>
        <p class="lede">${opts.lede}</p>
        <div class="meta">${opts.values.map((value) => `<span>${value}</span>`).join('')}</div>
${opts.actions ?? ''}
      </header>
    </div>`;

const renderToc = (
  document: StudyDocument,
  current: { readonly section?: StudySection; readonly appendix?: boolean },
): string => `
      <aside class="toc study-toc" aria-label="Study contents">
        <details class="toc-box">
          <summary><span>Contents</span><span class="toc-current" data-current-section>${current.appendix === true ? 'Symbol Dictionary' : `Section ${current.section?.ordinal ?? 1} of ${document.sections.length}`}</span></summary>
          <ol class="toc-parts">
${document.parts
  .map(
    (part) => `              <li class="toc-part">
                <span class="toc-part-label">${part.label}</span>
                <ol class="toc-sections">
${part.sections
  .map(
    (
      section,
    ) => `                  <li data-toc-section="${section.id}" data-section-ordinal="${section.ordinal}" data-section-title="${esc(textFromHtml(section.title))}"${current.section?.id === section.id ? ' data-active' : ''}>
                    <a data-section-link="${section.id}" href="${section.href}"${current.section?.id === section.id ? ' aria-current="page"' : ''}><span class="toc-section-title">${section.title}</span><span class="toc-status" aria-hidden="true"></span></a>
                  </li>`,
  )
  .join('\n')}
                </ol>
              </li>`,
  )
  .join('\n')}
          </ol>
          ${document.appendix === undefined ? '' : `<a class="toc-appendix" href="${document.appendix.href}"${current.appendix === true ? ' aria-current="page"' : ''}>Symbol Dictionary</a>`}
        </details>
      </aside>`;

const OVERVIEW_SCRIPT = `
    <script>
      (() => {
        const routesNode = document.querySelector('#section-routes');
        let routes = {};
        try { routes = JSON.parse(routesNode?.textContent || '{}'); } catch {}
        if (location.hash) {
          try {
            const id = decodeURIComponent(location.hash.slice(1));
            if (typeof routes[id] === 'string') { location.replace(routes[id]); return; }
          } catch {}
        }
        const root = document.querySelector('[data-study-slug]');
        const slug = root?.dataset.studySlug;
        if (!slug) return;
        let progress = {};
        try { progress = JSON.parse(localStorage.getItem('sure-word:study-progress:v1:' + slug) || '{}'); } catch { return; }
        const sectionIds = new Set([...document.querySelectorAll('[data-syllabus-section]')].map((row) => row.dataset.syllabusSection));
        const completed = Array.isArray(progress.completed) ? [...new Set(progress.completed.filter((id) => typeof id === 'string' && sectionIds.has(id)))] : [];
        const total = Number(root.dataset.sectionCount);
        const resume = document.querySelector('[data-resume-reading]');
        if (completed.length === total && root.dataset.appendixHref) {
          resume.href = root.dataset.appendixHref;
          resume.textContent = 'Review the Symbol Dictionary';
          resume.hidden = false;
        } else if (typeof progress.current === 'string' && sectionIds.has(progress.current)) {
          const row = document.querySelector('[data-syllabus-section="' + CSS.escape(progress.current) + '"]');
          resume.href = routes[progress.current];
          resume.textContent = 'Resume With Section ' + row?.dataset.sectionOrdinal;
          resume.hidden = false;
        }
      })();
    </script>`;

const STUDY_SCRIPT = `
    <script>
      (() => {
        const details = document.querySelector('.toc-box');
        const desktop = matchMedia('(min-width: 1024px)');
        const syncDisclosure = () => { if (details) details.open = desktop.matches; };
        syncDisclosure();
        desktop.addEventListener('change', syncDisclosure);
        const section = document.querySelector('.study-section[data-section-id]');
        const topnav = document.querySelector('.topnav');
        const progress = document.querySelector('.reading-progress');
        const allRows = [...document.querySelectorAll('[data-toc-section]')];
        const slug = document.querySelector('[data-study-slug]')?.dataset.studySlug;
        const key = 'sure-word:study-progress:v1:' + slug;
        let frame = 0;
        const validIds = new Set(allRows.map((row) => row.dataset.tocSection));
        let state = { completed: [], current: '' };
        try { const parsed = JSON.parse(localStorage.getItem(key) || '{}'); state = { completed: Array.isArray(parsed.completed) ? [...new Set(parsed.completed.filter((id) => typeof id === 'string' && validIds.has(id)))] : [], current: typeof parsed.current === 'string' && validIds.has(parsed.current) ? parsed.current : '' }; } catch {}
        const save = () => {
          try { localStorage.setItem(key, JSON.stringify({ completed: state.completed, current: state.current })); } catch {}
        };
        const renderCompletion = () => {
          const completed = new Set(state.completed);
          for (const row of allRows) {
            const done = completed.has(row.dataset.tocSection);
            row.toggleAttribute('data-complete', done);
            const status = row.querySelector('.toc-status');
            if (status) status.textContent = row.dataset.tocSection === sectionId ? 'Current' : done ? '✓ Complete' : '';
          }
          const input = document.querySelector('[data-completion-toggle]');
          if (!input) return;
          const done = completed.has(sectionId);
          input.checked = done;
          section.toggleAttribute('data-complete', done);
          input.parentElement.querySelector('[data-completion-label]').textContent = done ? 'Section ' + input.dataset.sectionOrdinal + ' Complete' : 'Mark Section ' + input.dataset.sectionOrdinal + ' Complete';
        };
        if (!section) return;
        const sectionId = section.dataset.sectionId;
        const updateProgress = () => {
          const start = section.offsetTop;
          const end = start + section.offsetHeight - innerHeight;
          const value = Math.max(0, Math.min(1, (scrollY - start) / Math.max(1, end - start)));
          progress?.style.setProperty('--section-progress', String(value));
          progress?.setAttribute('aria-valuenow', String(Math.round(value * 100)));
        };
        const restore = () => {
          if (state.current !== sectionId) { state.current = sectionId; save(); }
          renderCompletion();
          updateProgress();
        };
        if (topnav) new ResizeObserver(() => document.documentElement.style.setProperty('--topnav-height', topnav.getBoundingClientRect().height + 'px')).observe(topnav);
        const input = document.querySelector('[data-completion-toggle]');
        if (input) {
          input.addEventListener('change', () => {
            const completed = new Set(state.completed);
            if (input.checked) completed.add(sectionId); else completed.delete(sectionId);
            state.completed = [...completed];
            save(); renderCompletion();
          });
        }
        restore();
        addEventListener('scroll', () => {
          if (frame) return;
          frame = requestAnimationFrame(() => { frame = 0; updateProgress(); });
        }, { passive: true });
        addEventListener('pageshow', restore);
      })();
    </script>`;

export const studyLandingPage = (opts: { meta: Study.Meta; document: StudyDocument }): string => {
  const first = opts.document.sections[0];
  const routeEntries = opts.document.sections.map((section) => [section.id, section.href]);
  if (opts.document.appendix !== undefined)
    routeEntries.push([opts.document.appendix.id, opts.document.appendix.href]);
  const routes = JSON.stringify(Object.fromEntries(routeEntries)).replaceAll('<', '\\u003c');
  const minutes = estimateReadingMinutes(opts.document.words);
  const body = `${masthead({
    meta: opts.meta,
    lede: esc(opts.meta.subtitle),
    values: [
      `<strong>${fmtDate(opts.meta.date)}</strong>`,
      count(opts.document.sections.length, 'section'),
      `<strong>${formatReadingTime(minutes)}</strong>`,
      '<strong>KJV</strong>',
    ],
  })}
    <div class="shell">
      <main class="study-overview" id="content" data-study-slug="${opts.meta.slug}" data-section-count="${opts.document.sections.length}"${opts.document.appendix === undefined ? '' : ` data-appendix-href="${opts.document.appendix.href}"`}>
        <section class="study-introduction" aria-labelledby="before-you-begin">
          <h2 id="before-you-begin">Before You Begin</h2>
${opts.document.introductionHtml}
        </section>
        ${first === undefined ? '' : `<div class="study-actions"><a class="start-reading" href="${first.href}">Start With Section 1</a><a class="resume-reading" data-resume-reading hidden></a></div>`}
        <nav class="study-syllabus" aria-label="Study outline">
          <ol class="part-list">
${opts.document.parts
  .map(
    (part) => `            <li class="part-card">
              <p class="part-label">${part.label}</p>
              <h2>${part.title}</h2>
              <p class="part-card-meta">${count(part.sections.length, 'section')} · ${formatReadingTime(estimateReadingMinutes(part.words))}</p>
              <ol class="section-list">
${part.sections.map((section) => `                <li data-syllabus-section="${section.id}" data-section-ordinal="${section.ordinal}"><a href="${section.href}"><span>${section.title}</span><span>${formatReadingTime(estimateReadingMinutes(section.words))}</span>${section.summaryHtml === undefined ? '' : `<span class="section-summary">${section.summaryHtml}</span>`}</a></li>`).join('\n')}
              </ol>
            </li>`,
  )
  .join('\n')}
          </ol>
        </nav>
      </main>
    </div>
    <script type="application/json" id="section-routes">${routes}</script>${OVERVIEW_SCRIPT}`;
  return shell({
    title: `${opts.meta.title.replace(/<[^>]*>/g, '')} — The Sure Word`,
    description: opts.meta.description,
    path: `/${opts.meta.slug}/`,
    section: '/',
    body,
    explicitFooterReference: true,
  });
};

export const sectionPage = (opts: {
  meta: Study.Meta;
  document: StudyDocument;
  section: StudySection;
}): string => {
  const section = opts.section;
  const part = opts.document.parts[section.partOrdinal - 1];
  const previous = opts.document.sections[section.ordinal - 2];
  const next = opts.document.sections[section.ordinal];
  const previousHref = previous?.href ?? `/${opts.meta.slug}/`;
  const previousLabel = previous === undefined ? 'Study Overview' : `Previous: ${previous.title}`;
  const nextHref = next?.href ?? opts.document.appendix?.href ?? `/${opts.meta.slug}/`;
  const nextLabel =
    next === undefined
      ? opts.document.appendix === undefined
        ? 'Next: Study Overview'
        : 'Next: Symbol Dictionary'
      : `Next: ${next.title}`;
  const article = `        <section class="study-section" data-section-id="${section.id}" aria-labelledby="${section.id}">
          <header class="section-header">
            <h1 id="${section.id}"><a class="anchor" href="#${section.id}" aria-label="Link to section">¶</a>${section.title}</h1>
            <p class="section-meta">Section ${section.ordinal} of ${opts.document.sections.length} · ${formatReadingTime(estimateReadingMinutes(section.words))}</p>
          </header>
${section.html}
          <footer class="section-end">
            <label class="completion-control"><input type="checkbox" data-completion-toggle="${section.id}" data-section-ordinal="${section.ordinal}" /><span data-completion-label>Mark Section ${section.ordinal} Complete</span></label>
            <nav class="section-pagination" aria-label="Section navigation"><a rel="prev" href="${previousHref}">${previousLabel}</a><a rel="next" href="${nextHref}">${nextLabel}</a></nav>
          </footer>
        </section>`;
  const body = `<div class="shell"><nav class="breadcrumbs" aria-label="Breadcrumb"><a href="/${opts.meta.slug}/">${opts.meta.title}</a><span>${part?.label ?? 'Study'}</span><span aria-current="page">${section.title}</span></nav></div>
    <div class="reading-progress" role="progressbar" aria-label="Current section progress" aria-valuemin="0" aria-valuemax="100" aria-valuenow="0"><span></span></div>
    <div class="shell with-toc" data-study-slug="${opts.meta.slug}">
${renderToc(opts.document, { section })}
      <main class="content section-content" id="content">
${article}
      </main>
    </div>${STUDY_SCRIPT}`;
  return shell({
    title: `${textFromHtml(section.title)} — ${opts.meta.title.replace(/<[^>]*>/g, '')} — The Sure Word`,
    description: opts.meta.description,
    path: section.href,
    section: '/',
    body,
    explicitFooterReference: true,
  });
};

export const appendixPage = (opts: {
  meta: Study.Meta;
  document: StudyDocument;
  appendix: StudyAppendix;
}): string => {
  const finalSection = opts.document.sections.at(-1);
  const body = `<div class="shell"><nav class="breadcrumbs" aria-label="Breadcrumb"><a href="/${opts.meta.slug}/">${opts.meta.title}</a><span aria-current="page">Symbol Dictionary</span></nav></div>${masthead(
    {
      meta: opts.meta,
      eyebrow: esc(opts.meta.title.replace(/<[^>]*>/g, '')),
      title: 'Symbol Dictionary',
      lede: `Definitions for <a href="/${opts.meta.slug}/">${opts.meta.title}</a>.`,
      values: ['<strong>Study Appendix</strong>'],
    },
  )}
    <div class="shell with-toc" data-study-slug="${opts.meta.slug}">
${renderToc(opts.document, { appendix: true })}
      <main class="content appendix-content" id="content">
${opts.appendix.html}
        <nav class="section-pagination" aria-label="Appendix navigation"><a rel="prev" href="${finalSection?.href ?? `/${opts.meta.slug}/`}">Previous: ${finalSection?.title ?? 'Study Overview'}</a><a rel="next" href="/${opts.meta.slug}/">Back to Study Overview</a></nav>
      </main>
    </div>`;
  return shell({
    title: `Symbol Dictionary — ${opts.meta.title.replace(/<[^>]*>/g, '')} — The Sure Word`,
    description: opts.meta.description,
    path: opts.appendix.href,
    section: '/',
    body,
    explicitFooterReference: true,
  });
};

export const indexPage = (opts: {
  studies: readonly (Study.Meta & {
    words: number;
    minutes: number;
    parts: number;
    sections: number;
  })[];
  comparisons: readonly Comparison.Card[];
}): string => {
  const studyCards = opts.studies
    .map(
      (
        s,
        i,
      ) => `        <a class="card${i === 0 ? ' lead' : ''}" href="/${s.slug}/" data-study-slug="${s.slug}" data-section-count="${s.sections}">
          <span class="card-eyebrow">${esc(s.eyebrow)}</span>
          <h3>${s.title}</h3>
          <span class="card-sub">${esc(s.subtitle)}</span>
          <span class="card-desc">${esc(s.description)}</span>
          <span class="card-meta"><span>${s.parts} ${s.parts === 1 ? 'part' : 'parts'} · ${s.sections} ${s.sections === 1 ? 'section' : 'sections'} · ${formatReadingTime(s.minutes)}</span></span>
          <span class="card-progress" data-progress-for="${s.slug}" hidden></span>
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
    </div>
    <script>
      (() => {
        for (const card of document.querySelectorAll('[data-study-slug]')) {
          try {
            const progress = JSON.parse(localStorage.getItem('sure-word:study-progress:v1:' + card.dataset.studySlug) || '{}');
            const completed = Array.isArray(progress.completed) ? new Set(progress.completed.filter((id) => typeof id === 'string')).size : 0;
            if (Array.isArray(progress.completed) || typeof progress.current === 'string') {
              const label = card.querySelector('.card-progress');
              label.textContent = completed === Number(card.dataset.sectionCount) ? 'Complete' : completed + ' of ' + card.dataset.sectionCount + ' sections complete';
              label.hidden = false;
            }
          } catch {}
        }
      })();
    </script>`;
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
