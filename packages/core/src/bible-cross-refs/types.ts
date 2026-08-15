import { type Option, Schema } from 'effect';

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

export const CrossRefType = Schema.Literals([
  'quotation',
  'allusion',
  'parallel',
  'typological',
  'prophecy',
  'sanctuary',
  'recapitulation',
  'thematic',
]);
export type CrossRefType = typeof CrossRefType.Type;

export const CROSS_REF_TYPES = CrossRefType.literals;

export const CatalogCrossRefSource = Schema.Literals(['openbible', 'tske']);
export type CatalogCrossRefSource = typeof CatalogCrossRefSource.Type;

export const CATALOG_CROSS_REF_SOURCES = CatalogCrossRefSource.literals;

/** 3-letter uppercase abbreviation, suitable for compact badges next to a
 *  reference. Keep in sync with how the study sheet renders these so the
 *  desktop drawer's cross-ref pane shows the same shorthand. */
export const CROSS_REF_ABBREVIATIONS = {
  quotation: 'QUO',
  allusion: 'ALL',
  parallel: 'PAR',
  typological: 'TYP',
  prophecy: 'PRO',
  sanctuary: 'SAN',
  recapitulation: 'REC',
  thematic: 'THM',
} satisfies Record<CrossRefType, string>;

/** Human-readable label used in section headings, dropdowns, and tooltips. */
export const CROSS_REF_LABELS = {
  quotation: 'Quotation',
  allusion: 'Allusion',
  parallel: 'Parallel',
  typological: 'Typological',
  prophecy: 'Prophecy',
  sanctuary: 'Sanctuary',
  recapitulation: 'Recapitulation',
  thematic: 'Thematic',
} satisfies Record<CrossRefType, string>;

/** Fields every cross reference carries regardless of source. `verse`/`verseEnd`
 *  are absent for chapter-scope references (e.g. "see Genesis 12"); `previewText`
 *  is absent until the target verse text has been hydrated; `classification` is
 *  absent for raw catalog rows that haven't been categorized yet. */
interface CrossRefBase {
  readonly book: number;
  readonly chapter: number;
  readonly verse: Option.Option<number>;
  readonly verseEnd: Option.Option<number>;
  readonly previewText: Option.Option<string>;
  readonly classification: Option.Option<CrossRefType>;
  readonly confidence: Option.Option<number>;
}

/** Cross reference sourced from a published catalog (OpenBible, TSK-extended).
 *  These are read-only — users can override the classification via their own
 *  user-cross-ref rows but the catalog row itself is treated as canonical. */
export interface CatalogCrossReference extends CrossRefBase {
  readonly source: CatalogCrossRefSource;
}

/** Cross reference authored by the user. Carries the row id so it can be
 *  edited / deleted, plus an optional free-text note for personal context. */
export interface UserCrossReference extends CrossRefBase {
  readonly source: 'user';
  readonly userRefId: string;
  readonly userNote: Option.Option<string>;
}

/** Tagged union of every cross-ref shape the UI consumes. Discriminate on
 *  `source` — `'user'` is editable, the catalog values are not. */
export type ClassifiedCrossReference = CatalogCrossReference | UserCrossReference;
