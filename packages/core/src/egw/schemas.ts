/**
 * EGW API Schemas using Effect Schema
 * Based on the EGW API client reference implementation
 */

import { Option, Schema, SchemaGetter } from 'effect';

import { Node, parseParagraphContent } from './ast.js';

/**
 * Schema helper for optional, nullable, possibly-empty strings.
 *
 * The EGW API returns "missing" fields as either a missing key, `null`,
 * `undefined`, or — semantically equivalent — an empty string. Modelling
 * those four shapes as `string | null | undefined` (the natural
 * `optional(NullOr(String))` type) forces every consumer to triple-check
 * (`r === null || r === undefined || r === ''`) and bakes the
 * empty-string-as-missing convention into N call sites.
 *
 * `OptionFromOptionalNullishOrEmpty` normalizes at the parse boundary:
 *
 * Decode (wire → canonical):
 *   - missing key → `Option.none()`
 *   - `null`      → `Option.none()`
 *   - `undefined` → `Option.none()`
 *   - `""`        → `Option.none()`
 *   - `"abc"`     → `Option.some("abc")`
 *
 * Encode (canonical → wire): `None` omits the key; `Some(s)` emits the
 * string. Pattern lifted from `Schema.OptionFromOptionalNullOr` (which
 * doesn't collapse the empty string).
 */
const OptionFromOptionalNullishOrEmpty: Schema.decodeTo<
  Schema.Option<Schema.String>,
  Schema.optional<Schema.NullOr<Schema.String>>
> = Schema.optional(Schema.NullOr(Schema.String)).pipe(
  Schema.decodeTo(Schema.Option(Schema.String), {
    decode: SchemaGetter.transformOptional((oe) =>
      // oe: Option<string | null>  (None = missing key OR undefined)
      // Flatten null/'' into None, lift the rest into Some(Some(s)).
      oe.pipe(
        Option.filter((v): v is string => v !== null && v !== ''),
        Option.some,
      ),
    ),
    encode: SchemaGetter.transformOptional((ot) =>
      // ot: Option<Option<string>>  — always `Some(inner)` because encode
      // sees the canonical field as present. `Option.flatten` drops the
      // outer wrapper so a canonical `None` becomes a missing key.
      Option.flatten(ot),
    ),
  }),
);

/**
 * Text Direction
 */
export const TextDirection = Schema.Literals(['ltr', 'rtl']);

export type TextDirection = Schema.Schema.Type<typeof TextDirection>;

/**
 * Book Type
 * Common types: "book", "devotional", "bibleCommentary", "bible", "manuscript", "periodical", "dictionary", "topicalindex"
 * The API may return other types, so we accept any string.
 */
export const BookType = Schema.String;

export type BookType = Schema.Schema.Type<typeof BookType>;

/**
 * Permission Required
 */
export const PermissionRequired = Schema.Literals([
  'hidden',
  'public',
  'authenticated',
  'purchased',
]);

export type PermissionRequired = Schema.Schema.Type<typeof PermissionRequired>;

/**
 * Language
 */
export const Language = Schema.Struct({
  code: Schema.String,
  name: Schema.String,
  direction: TextDirection,
});

export type Language = Schema.Schema.Type<typeof Language>;

/**
 * Folder - Base fields (non-recursive)
 */
const folderFields = {
  folder_id: Schema.Number,
  name: Schema.String,
  add_class: Schema.String,
  nbooks: Schema.Number,
  naudiobooks: Schema.Number,
  sort_order: Schema.optional(Schema.Number),
  parent_id: Schema.optional(Schema.Number),
} as const;

/**
 * Folder - Type interface for recursive schema
 */
export interface Folder extends Schema.Struct.Type<typeof folderFields> {
  readonly children?: ReadonlyArray<Folder> | undefined;
}

/**
 * Folder - Schema definition with recursive children.
 *
 * Annotated as `Schema.Codec<Folder>` (the v4 canonical pattern for
 * recursive schemas) so the DecodingServices/EncodingServices slots stay
 * `never` instead of widening to `unknown` through `Schema.suspend`.
 * Consumers calling `Schema.decodeUnknownEffect(Folder)` get a clean
 * `Effect<Folder, SchemaError, never>` requirement.
 */
export const Folder: Schema.Codec<Folder> = Schema.Struct({
  ...folderFields,
  children: Schema.optional(Schema.Array(Schema.suspend((): Schema.Codec<Folder> => Folder))),
});

/**
 * Book Cover (BookCoverDto)
 */
export const BookCover = Schema.Struct({
  small: Schema.optional(Schema.NullOr(Schema.String)),
  large: Schema.optional(Schema.NullOr(Schema.String)),
});

export type BookCover = Schema.Schema.Type<typeof BookCover>;

/**
 * Book Files (BookFilesDto)
 */
export const BookFiles = Schema.Struct({
  mp3: Schema.optional(Schema.NullOr(Schema.String)),
  pdf: Schema.optional(Schema.NullOr(Schema.String)),
  epub: Schema.optional(Schema.NullOr(Schema.String)),
  mobi: Schema.optional(Schema.NullOr(Schema.String)),
});

export type BookFiles = Schema.Schema.Type<typeof BookFiles>;

/**
 * Book (BookDto)
 */
export const Book = Schema.Struct({
  book_id: Schema.Number,
  code: Schema.String,
  lang: Schema.String,
  type: BookType,
  subtype: Schema.optional(Schema.NullOr(Schema.String)),
  title: Schema.String,
  first_para: Schema.optional(Schema.NullOr(Schema.String)),
  author: Schema.String,
  description: Schema.optional(Schema.NullOr(Schema.String)),
  npages: Schema.Number,
  isbn: Schema.optional(Schema.NullOr(Schema.String)),
  publisher: Schema.optional(Schema.NullOr(Schema.String)),
  pub_year: Schema.String,
  buy_link: Schema.optional(Schema.NullOr(Schema.String)),
  folder_id: Schema.Number,
  folder_color_group: Schema.optional(Schema.NullOr(Schema.String)),
  cover: BookCover,
  files: BookFiles,
  download: Schema.optional(Schema.NullOr(Schema.String)),
  last_modified: Schema.optional(Schema.NullOr(Schema.String)),
  permission_required: PermissionRequired,
  sort: Schema.Number,
  is_audiobook: Schema.Boolean,
  cite: Schema.optional(Schema.NullOr(Schema.String)),
  original_book: Schema.optional(Schema.NullOr(Schema.String)),
  translated_into: Schema.optional(Schema.NullOr(Schema.Array(Schema.String))),
  nelements: Schema.Number,
});

export type Book = Schema.Schema.Type<typeof Book>;

/**
 * Table of Contents Item (TocDto)
 */
export const TocItem = Schema.Struct({
  para_id: Schema.optional(Schema.NullOr(Schema.String)),
  level: Schema.Number,
  title: Schema.optional(Schema.NullOr(Schema.String)),
  refcode_short: Schema.optional(Schema.NullOr(Schema.String)),
  dup: Schema.optional(Schema.NullOr(Schema.String)),
  mp3: Schema.optional(Schema.NullOr(Schema.String)),
  puborder: Schema.Number,
});

export type TocItem = Schema.Schema.Type<typeof TocItem>;

/**
 * Paragraph (ParagraphDto)
 *
 * The canonical (decoded) form. `nodes` holds the parsed AST representation of
 * the paragraph's inline HTML; consumers operate on the AST exclusively. The
 * HTTP wire shape (where the same field is a raw HTML string named `content`)
 * is handled by `ParagraphFromHtml` below.
 */
export const Paragraph = Schema.Struct({
  para_id: Schema.optional(Schema.NullOr(Schema.String)),
  id_prev: Schema.optional(Schema.NullOr(Schema.String)),
  id_next: Schema.optional(Schema.NullOr(Schema.String)),
  refcode_1: Schema.optional(Schema.NullOr(Schema.String)),
  refcode_2: Schema.optional(Schema.NullOr(Schema.String)),
  refcode_3: Schema.optional(Schema.NullOr(Schema.String)),
  refcode_4: Schema.optional(Schema.NullOr(Schema.String)),
  refcode_short: OptionFromOptionalNullishOrEmpty,
  refcode_long: Schema.optional(Schema.NullOr(Schema.String)),
  element_type: Schema.optional(Schema.NullOr(Schema.String)),
  element_subtype: Schema.optional(Schema.NullOr(Schema.String)),
  nodes: Schema.Array(Node),
  puborder: Schema.Number,
});

export type Paragraph = Schema.Schema.Type<typeof Paragraph>;

/**
 * Wire-shape paragraph from the EGW HTTP API: `content` is raw HTML.
 *
 * `ParagraphFromHtml` decodes by parsing `content` into the AST and reshaping
 * the struct into `Paragraph` (with `nodes`). Encode is intentionally
 * forbidden — AST → HTML round-trip is not supported. Callers that need to
 * serialize paragraphs should encode the AST directly (e.g., to JSON via
 * `Schema.Array(Paragraph)`).
 */
const ParagraphWire = Schema.Struct({
  para_id: Schema.optional(Schema.NullOr(Schema.String)),
  id_prev: Schema.optional(Schema.NullOr(Schema.String)),
  id_next: Schema.optional(Schema.NullOr(Schema.String)),
  refcode_1: Schema.optional(Schema.NullOr(Schema.String)),
  refcode_2: Schema.optional(Schema.NullOr(Schema.String)),
  refcode_3: Schema.optional(Schema.NullOr(Schema.String)),
  refcode_4: Schema.optional(Schema.NullOr(Schema.String)),
  refcode_short: Schema.optional(Schema.NullOr(Schema.String)),
  refcode_long: Schema.optional(Schema.NullOr(Schema.String)),
  element_type: Schema.optional(Schema.NullOr(Schema.String)),
  element_subtype: Schema.optional(Schema.NullOr(Schema.String)),
  content: Schema.optional(Schema.NullOr(Schema.String)),
  puborder: Schema.Number,
});

/**
 * ParagraphFromHtml decodes by parsing `content` to AST and reshaping into the
 * canonical Paragraph. The intermediate object matches `Paragraph["Encoded"]`
 * (i.e. the schema's *input* shape) — `Schema.decodeTo` then runs Paragraph's
 * own field-level decoders, which normalize `refcode_short` through
 * `OptionFromOptionalNullishOrEmpty` (null/undefined/'' → `Option.none()`).
 */
export const ParagraphFromHtml = ParagraphWire.pipe(
  Schema.decodeTo(Paragraph, {
    decode: SchemaGetter.transform((wire) => {
      const html = wire.content ?? '';
      const nodes = html === '' ? [] : parseParagraphContent(html);
      return {
        para_id: wire.para_id,
        id_prev: wire.id_prev,
        id_next: wire.id_next,
        refcode_1: wire.refcode_1,
        refcode_2: wire.refcode_2,
        refcode_3: wire.refcode_3,
        refcode_4: wire.refcode_4,
        refcode_short: wire.refcode_short,
        refcode_long: wire.refcode_long,
        element_type: wire.element_type,
        element_subtype: wire.element_subtype,
        nodes,
        puborder: wire.puborder,
      };
    }),
    encode: SchemaGetter.forbidden(
      () => 'Paragraph → ParagraphWire encoding not supported (AST→HTML round-trip).',
    ),
  }),
);

/**
 * OAuth Token Response
 */
export const TokenResponse = Schema.Struct({
  access_token: Schema.String,
  refresh_token: Schema.optional(Schema.String),
  token_type: Schema.String,
  expires_in: Schema.Number,
  scope: Schema.String,
});

export type TokenResponse = Schema.Schema.Type<typeof TokenResponse>;

/**
 * Token Info
 */
export const TokenInfo = Schema.Struct({
  accessToken: Schema.String,
  refreshToken: Schema.optional(Schema.String),
  expiresAt: Schema.Number,
  scope: Schema.String,
});

export type TokenInfo = Schema.Schema.Type<typeof TokenInfo>;

/**
 * Search Parameters
 */
export const SearchParams = Schema.Struct({
  query: Schema.String,
  lang: Schema.optional(Schema.String),
  folder: Schema.optional(Schema.Number),
  book: Schema.optional(Schema.Number),
  highlight: Schema.optional(Schema.Boolean),
  limit: Schema.optional(Schema.Number),
  offset: Schema.optional(Schema.Number),
});

export type SearchParams = Schema.Schema.Type<typeof SearchParams>;

/**
 * Books Query Parameters
 */
export const BooksQueryParams = Schema.Struct({
  pubnr: Schema.optional(Schema.Array(Schema.Number)),
  since: Schema.optional(Schema.String), // date-time format
  type: Schema.optional(Schema.Array(BookType)),
  lang: Schema.optional(Schema.String),
  can_read: Schema.optional(Schema.String),
  has_mp3: Schema.optional(Schema.String),
  has_pdf: Schema.optional(Schema.String),
  has_epub: Schema.optional(Schema.String),
  has_mobi: Schema.optional(Schema.String),
  has_book: Schema.optional(Schema.String),
  page: Schema.optional(Schema.Number),
  search: Schema.optional(Schema.String),
  folder: Schema.optional(Schema.Number),
  trans: Schema.optional(Schema.Union([Schema.Literal('all'), Schema.String])),
  limit: Schema.optional(Schema.Number),
  offset: Schema.optional(Schema.Number),
});

export type BooksQueryParams = Schema.Schema.Type<typeof BooksQueryParams>;

/**
 * Chapter Content Parameters
 */
export const ChapterContentParams = Schema.Struct({
  highlight: Schema.optional(Schema.String),
  trans: Schema.optional(
    Schema.Union([Schema.Literal('all'), Schema.Array(Schema.String), Schema.String]),
  ),
});

export type ChapterContentParams = Schema.Schema.Type<typeof ChapterContentParams>;

/**
 * Remote search hit (single result row from /search endpoint)
 *
 * Captures the fields we observed in real responses. Unknown fields are
 * permitted — `Schema.Struct` is non-strict by default for forwards
 * compatibility with the API.
 */
export const SearchHit = Schema.Struct({
  index: Schema.optional(Schema.Number),
  lang: Schema.String,
  para_id: Schema.optional(Schema.NullOr(Schema.String)),
  pub_code: Schema.String,
  pub_name: Schema.String,
  refcode_long: Schema.optional(Schema.NullOr(Schema.String)),
  refcode_short: Schema.optional(Schema.NullOr(Schema.String)),
  pub_year: Schema.optional(Schema.NullOr(Schema.String)),
  snippet: Schema.optional(Schema.NullOr(Schema.String)),
  weight: Schema.optional(Schema.Number),
  group: Schema.optional(Schema.String),
  action_required: Schema.optional(Schema.String),
});

export type SearchHit = Schema.Schema.Type<typeof SearchHit>;

/**
 * Paginated remote search response.
 */
export const SearchResponse = Schema.Struct({
  next: Schema.NullOr(Schema.String),
  previous: Schema.NullOr(Schema.String),
  total: Schema.Number,
  count: Schema.Number,
  results: Schema.Array(SearchHit),
});

export type SearchResponse = Schema.Schema.Type<typeof SearchResponse>;
