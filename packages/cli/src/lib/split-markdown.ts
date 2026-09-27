/**
 * Split a handbook-style markdown document into per-section blocks for export
 * as individual Apple Notes (one note per section, the document title as the
 * containing folder).
 *
 * Document shape this understands (the Bible Handbook template):
 *
 *   # Document Title           ← becomes the Apple Notes FOLDER
 *   **Thesis.** ...            ← preface (between H1 and the first "## ")
 *   ## Table of Contents       ← a block
 *   # Part I — ...             ← a divider; prefixed onto the following section
 *   ## 1. First Section        ← a block (title: "Part I — 1. First Section")
 *   ...
 *   ## Appendix — ...          ← a block
 *
 * Every top-level "## " heading starts a new block. Any content after the H1
 * but before the first "## " becomes a leading preface block so nothing is
 * dropped. "# Part" headers are not blocks of their own; the most recent one
 * is prefixed onto the title of the numbered sections that follow it.
 */

import { Option } from 'effect';

export interface MarkdownBlock {
  /** Stable slug derived from the heading — used to track the note id across re-exports. */
  slug: string;
  /** Note title (Part-prefixed for numbered sections). */
  title: string;
  /** The block's markdown, including its own "## " heading. */
  markdown: string;
}

export interface SplitMarkdown {
  /** The H1 text — used as the Apple Notes folder name. */
  folderTitle: string;
  blocks: MarkdownBlock[];
}

const SLUG_MAX = 60;

/** kebab-case slug, ascii-only, collapsed dashes, capped length. */
export function slugify(input: string): string {
  return (
    input
      .toLowerCase()
      // strip markdown emphasis / heading markers
      .replace(/[*_`#>]/g, '')
      // anything not a-z0-9 becomes a dash
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, SLUG_MAX)
      .replace(/-+$/g, '') || 'section'
  );
}

/**
 * Reduce a full Part heading to its short label for note titles.
 * "Part I — The Method & the Time (1816–1840)" -> "Part I".
 * Falls back to the whole heading if it doesn't match the "Part X — ..." shape.
 */
const partShortLabel = (part: string): string => {
  const m = part.match(/^(Part\s+[A-Za-z0-9]+)\b/i);
  return m?.[1] ?? part;
};

/** Is this line a top-level section heading ("## ", but not "### ")? */
const isSectionHeading = (line: string): boolean => /^##\s+\S/.test(line);

/** Is this line a Part divider ("# Part ...")? Single-hash only. */
const isPartHeading = (line: string): boolean => /^#\s+Part\b/i.test(line);

/** Is this line the document H1 ("# Title", single hash, not a Part)? */
const isH1 = (line: string): boolean => /^#\s+\S/.test(line) && !line.startsWith('##');

/** Strip a leading "## " / "# " and trailing "#"s from a heading line. */
const headingText = (line: string): string =>
  line
    .replace(/^#{1,6}\s+/, '')
    .replace(/\s+#*\s*$/, '')
    .trim();

/** The section block currently being accumulated. */
interface OpenSection {
  title: string;
  lines: string[];
}

/** Everything the line-by-line split carries between lines. */
interface SplitState {
  folderTitle: string;
  /** The most recent "# Part" divider, prefixed onto numbered sections. */
  currentPart: Option.Option<string>;
  blocks: MarkdownBlock[];
  /** Preface accumulates everything after the H1 until the first "## ". */
  prefaceLines: string[];
  /** None until the first "## " opens a section; always Some after. */
  section: Option.Option<OpenSection>;
}

/**
 * Title for a section opened by `line`. Prefix the current Part onto numbered
 * sections. Use just the Part label (e.g. "Part I"), not its full descriptive
 * heading, so note titles stay readable: "Part I — 1. The Casket...".
 */
const sectionTitle = (line: string, currentPart: Option.Option<string>): string => {
  const text = headingText(line);
  const isNumbered = /^\d+\./.test(text);
  const partLabel = Option.map(currentPart, partShortLabel);
  if (Option.isSome(partLabel) && isNumbered) return `${partLabel.value} — ${text}`;
  return text;
};

/** Emit the preface as an "Overview" block (only once, when the first section opens). */
const closePreface = (state: SplitState): void => {
  const preface = state.prefaceLines.join('\n').trim();
  if (preface.length > 0) {
    state.blocks.push({
      slug: 'overview',
      title: 'Overview',
      markdown: preface,
    });
  }
  state.prefaceLines = [];
};

/** Emit the open section, if any, as a block. */
const closeSection = (state: SplitState): void => {
  if (Option.isNone(state.section)) return;
  const { title, lines } = state.section.value;
  state.blocks.push({
    slug: slugify(title),
    title,
    markdown: lines.join('\n').trim(),
  });
  state.section = Option.none();
};

/** A "## " heading closes whatever came before and opens a new block. */
const openSection = (state: SplitState, line: string): void => {
  if (Option.isNone(state.section)) {
    closePreface(state);
  } else {
    closeSection(state);
  }
  state.section = Option.some({ title: sectionTitle(line, state.currentPart), lines: [line] });
};

/** Ordinary content goes to the open section, or to the preface before the first one. */
const appendLine = (state: SplitState, line: string): void => {
  if (Option.isSome(state.section)) {
    state.section.value.lines.push(line);
  } else {
    state.prefaceLines.push(line);
  }
};

/**
 * Split markdown (already free of YAML frontmatter) into a folder title and
 * ordered blocks. Throws nothing — a document with no "## " headings yields a
 * single preface block.
 */
export function splitMarkdownIntoSections(content: string): SplitMarkdown {
  const state: SplitState = {
    folderTitle: 'Untitled',
    currentPart: Option.none(),
    blocks: [],
    prefaceLines: [],
    section: Option.none(),
  };

  for (const line of content.split('\n')) {
    if (Option.isNone(state.section) && isH1(line) && state.folderTitle === 'Untitled') {
      state.folderTitle = headingText(line);
      continue;
    }

    if (isSectionHeading(line)) {
      openSection(state, line);
      continue;
    }

    if (isPartHeading(line)) {
      // A divider: remember it for the next numbered section; don't emit a block.
      // If a section is open, the Part header belongs to the NEXT section, so
      // we simply don't append it to the current block.
      state.currentPart = Option.some(headingText(line));
      continue;
    }

    appendLine(state, line);
  }

  closeSection(state);

  const { folderTitle, blocks } = state;
  // Edge case: a document with no "## " headings at all — emit the preface.
  if (blocks.length === 0) {
    const preface = state.prefaceLines.join('\n').trim();
    let markdown = content.trim();
    if (preface.length > 0) markdown = preface;
    blocks.push({
      slug: 'overview',
      title: folderTitle,
      markdown,
    });
  }

  return { folderTitle, blocks };
}
