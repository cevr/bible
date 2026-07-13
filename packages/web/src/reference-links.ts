import { Database } from 'bun:sqlite';
import { BIBLE_BOOK_ALIASES } from '@bible/core/bible';

const escapeRegex = (value: string): string => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const BIBLE_BOOK_PATTERN = Object.keys(BIBLE_BOOK_ALIASES)
  .sort((left, right) => right.length - left.length)
  .map(escapeRegex)
  .join('|');

const BIBLE_REFERENCE = new RegExp(
  `\\b(?:${BIBLE_BOOK_PATTERN})\\.? \\d+:\\d+(?:[-–—]\\d+(?::\\d+)?)?(?:, ?\\d+(?:[-–—]\\d+)?)?`,
  'gi',
);

const EGW_REFERENCE = /\b([1-9]?[A-Z][A-Z0-9]{1,9}) (\d+\.\d+)(?:[-–—](?:\d+\.)?\d+)?\b/g;
const SUPPRESSED_TAGS = new Set(['a', 'code', 'pre', 'script', 'style']);

export type EgwPanelMap = ReadonlyMap<string, string>;

interface EgwPanelRow {
  readonly refcode: string;
  readonly panelId: string;
}

/** Read the canonical EGW paragraph IDs used by egwwritings.org deep links. */
export const loadEgwPanelMap = (databasePath: string): EgwPanelMap => {
  const database = new Database(databasePath, { readonly: true, strict: true });
  try {
    const rows = database
      .query<EgwPanelRow, []>(
        `select refcode_short as refcode, para_id as panelId
         from paragraphs
         where refcode_short is not null and para_id is not null`,
      )
      .all();
    return new Map(rows.map((row) => [row.refcode, row.panelId]));
  } finally {
    database.close();
  }
};

const externalLink = (href: string, label: string): string =>
  `<a href="${href}" target="_blank" rel="noopener noreferrer">${label}</a>`;

const linkTextReferences = (text: string, egwPanels: EgwPanelMap): string => {
  const withEgw = text.replace(EGW_REFERENCE, (reference, bookCode: string, paragraph: string) => {
    const panelId = egwPanels.get(`${bookCode} ${paragraph}`);
    if (panelId === undefined) return reference;
    const href = `https://egwwritings.org/read?panels=p${encodeURIComponent(panelId)}&index=0`;
    return externalLink(href, reference);
  });

  return withEgw.replace(BIBLE_REFERENCE, (reference) => {
    const href = `https://www.biblegateway.com/passage/?search=${encodeURIComponent(reference)}&version=KJV`;
    return externalLink(href, reference);
  });
};

/**
 * Link references in rendered prose while leaving tags, existing anchors,
 * inline/fenced code, scripts, and styles untouched.
 */
export const linkReferences = (html: string, egwPanels: EgwPanelMap): string => {
  const suppressed: string[] = [];
  return html
    .split(/(<[^>]+>)/g)
    .map((part) => {
      if (!part.startsWith('<')) {
        return suppressed.length === 0 ? linkTextReferences(part, egwPanels) : part;
      }

      const closing = part.match(/^<\/([a-z0-9]+)/i)?.[1]?.toLowerCase();
      if (closing !== undefined && SUPPRESSED_TAGS.has(closing)) {
        const index = suppressed.lastIndexOf(closing);
        if (index !== -1) suppressed.splice(index, 1);
        return part;
      }

      const opening = part.match(/^<([a-z0-9]+)/i)?.[1]?.toLowerCase();
      if (opening !== undefined && SUPPRESSED_TAGS.has(opening) && !part.endsWith('/>')) {
        suppressed.push(opening);
      }
      return part;
    })
    .join('');
};
