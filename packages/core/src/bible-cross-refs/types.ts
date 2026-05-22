/**
 * Cross-reference classification taxonomy. Shared between web (study sheet,
 * effect-service enrichment, app-service IPC layer) and the desktop Bible
 * drawer's cross-refs tab. The list of allowed types and their human-readable
 * labels / 3-letter badge abbreviations live here so both clients render the
 * same shorthand and so the persistence layer has a single source of truth
 * for what's a valid `classification` value.
 *
 * Presentational concerns (badge color tokens, Tailwind utility classes,
 * icon glyphs) intentionally do NOT live here — those are renderer-specific
 * and stay alongside the JSX that uses them.
 */

export const CROSS_REF_TYPES = [
  'quotation',
  'allusion',
  'parallel',
  'typological',
  'prophecy',
  'sanctuary',
  'recapitulation',
  'thematic',
] as const;

export type CrossRefType = (typeof CROSS_REF_TYPES)[number];

/** 3-letter uppercase abbreviation, suitable for compact badges next to a
 *  reference. Keep in sync with how the study sheet renders these so the
 *  desktop drawer's cross-ref pane shows the same shorthand. */
export const CROSS_REF_ABBREVIATIONS: Record<CrossRefType, string> = {
  quotation: 'QUO',
  allusion: 'ALL',
  parallel: 'PAR',
  typological: 'TYP',
  prophecy: 'PRO',
  sanctuary: 'SAN',
  recapitulation: 'REC',
  thematic: 'THM',
};

/** Human-readable label used in section headings, dropdowns, and tooltips. */
export const CROSS_REF_LABELS: Record<CrossRefType, string> = {
  quotation: 'Quotation',
  allusion: 'Allusion',
  parallel: 'Parallel',
  typological: 'Typological',
  prophecy: 'Prophecy',
  sanctuary: 'Sanctuary',
  recapitulation: 'Recapitulation',
  thematic: 'Thematic',
};

/** Fields every cross reference carries regardless of source. `verse`/`verseEnd`
 *  are null for chapter-scope references (e.g. "see Genesis 12"); `previewText`
 *  is null until the target verse text has been hydrated; `classification` is
 *  null for raw catalog rows that haven't been categorized yet. */
interface CrossRefBase {
  readonly book: number;
  readonly chapter: number;
  readonly verse: number | null;
  readonly verseEnd: number | null;
  readonly previewText: string | null;
  readonly classification: CrossRefType | null;
  readonly confidence: number | null;
}

/** Cross reference sourced from a published catalog (OpenBible, TSK-extended).
 *  These are read-only — users can override the classification via their own
 *  user-cross-ref rows but the catalog row itself is treated as canonical. */
export interface CatalogCrossReference extends CrossRefBase {
  readonly source: 'openbible' | 'tske';
}

/** Cross reference authored by the user. Carries the row id so it can be
 *  edited / deleted, plus an optional free-text note for personal context. */
export interface UserCrossReference extends CrossRefBase {
  readonly source: 'user';
  readonly userRefId: string;
  readonly userNote: string | null;
}

/** Tagged union of every cross-ref shape the UI consumes. Discriminate on
 *  `source` — `'user'` is editable, the catalog values are not. */
export type ClassifiedCrossReference = CatalogCrossReference | UserCrossReference;
