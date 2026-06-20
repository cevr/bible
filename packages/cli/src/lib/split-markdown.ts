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

/**
 * Split markdown (already free of YAML frontmatter) into a folder title and
 * ordered blocks. Throws nothing — a document with no "## " headings yields a
 * single preface block.
 */
export function splitMarkdownIntoSections(content: string): SplitMarkdown {
  const lines = content.split('\n');

  let folderTitle = 'Untitled';
  let currentPart: string | null = null;

  const blocks: MarkdownBlock[] = [];
  // Preface accumulates everything after the H1 until the first "## ".
  let prefaceLines: string[] = [];
  let started = false; // have we hit the first "## " yet?

  // Current open section block.
  let curTitle: string | null = null;
  let curLines: string[] = [];

  const flush = (): void => {
    if (curTitle === null) return;
    const body = curLines.join('\n').trim();
    blocks.push({
      slug: slugify(curTitle),
      title: curTitle,
      markdown: body,
    });
    curTitle = null;
    curLines = [];
  };

  for (const line of lines) {
    if (!started && isH1(line) && folderTitle === 'Untitled') {
      folderTitle = headingText(line);
      continue;
    }

    if (isSectionHeading(line)) {
      // Close out preface (only once, when the first section opens).
      if (!started) {
        const preface = prefaceLines.join('\n').trim();
        if (preface.length > 0) {
          blocks.push({
            slug: 'overview',
            title: 'Overview',
            markdown: preface,
          });
        }
        prefaceLines = [];
        started = true;
      } else {
        flush();
      }
      // Open a new block. Prefix the current Part onto numbered sections.
      // Use just the Part label (e.g. "Part I"), not its full descriptive
      // heading, so note titles stay readable: "Part I — 1. The Casket...".
      const text = headingText(line);
      const isNumbered = /^\d+\./.test(text);
      const partLabel = currentPart !== null ? partShortLabel(currentPart) : null;
      curTitle = partLabel !== null && isNumbered ? `${partLabel} — ${text}` : text;
      curLines = [line];
      continue;
    }

    if (isPartHeading(line)) {
      // A divider: remember it for the next numbered section; don't emit a block.
      currentPart = headingText(line);
      // If a section is open, the Part header belongs to the NEXT section, so
      // we simply don't append it to the current block.
      continue;
    }

    // Ordinary content line.
    if (!started) {
      prefaceLines.push(line);
    } else {
      curLines.push(line);
    }
  }

  flush();

  // Edge case: a document with no "## " headings at all — emit the preface.
  if (blocks.length === 0) {
    const preface = prefaceLines.join('\n').trim();
    blocks.push({
      slug: 'overview',
      title: folderTitle,
      markdown: preface.length > 0 ? preface : content.trim(),
    });
  }

  return { folderTitle, blocks };
}
