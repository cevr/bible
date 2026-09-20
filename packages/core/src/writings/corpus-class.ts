/** How the library classifies a book, as the EGW API classifies it.
 *
 *  These are not our categories. `type`, `subtype` and the folder tree are
 *  fields the content API returns per book, and the values below are the
 *  distinct values it actually carries for the English corpus — read off the
 *  1,504 book records under `/content/languages/en/folders`, not invented here.
 *  Keeping our spelling identical to theirs is what lets the backfill be a
 *  copy rather than a mapping table somebody has to maintain as the library
 *  grows.
 *
 *  A book the backfill has not reached has `NULL` for all of them. Every filter
 *  below treats that as unclassified and lets it through, so an unbackfilled
 *  corpus searches exactly as it did before these columns existed.
 */

import { Schema, SchemaGetter } from 'effect';

/** The four top-level libraries the corpus is made of.
 *
 *  Measured over the 2026-09-19 snapshot's 3,012,004 paragraphs:
 *  `bible` 1,220,532 · `pioneer` 667,488 · `reference` 612,329 ·
 *  `egw-writings` 510,294. The headline fact is that EGW's own writings are
 *  17% of the corpus — a search that does not say which library it answered
 *  from is hiding most of what it did. */
export const CorpusSection = Schema.Literals([
  'egw-writings',
  'pioneer-library',
  'reference',
  'bible',
]);
export type CorpusSection = typeof CorpusSection.Type;

/** The API's `type` field, verbatim. Seven values across the whole library. */
export const BookType = Schema.Literals([
  'book',
  'periodical',
  'manuscript',
  'dictionary',
  'bible',
  'topicalindex',
  'scriptindex',
]);
export type BookType = typeof BookType.Type;

/** The API's `subtype`, for the values that mean something to a reader.
 *
 *  The API also carries `''`, `' '` and `'no pagebreaks'`; the first two are
 *  absence spelled two ways and the third is a typesetting note, so none of
 *  them are modelled. `Subtype` is the axis that answers "devotionals, not
 *  treatises".
 *
 *  `ModernEnglish` is in the union but is never a *choice* — see
 *  `EXCLUDED_SUBTYPES` below. It is modelled so the exclusion can name it. */
export const BookSubtype = Schema.Literals(['devotional', 'commentary', 'LtMs', 'ModernEnglish']);
export type BookSubtype = typeof BookSubtype.Type;

/** The subtypes this corpus refuses to search, at every call site, always.
 *
 *  `ModernEnglish` is a *paraphrase*, not an edition. The ten books carrying it
 *  — `BOE` (Beginning of the End), `HH` (Humble Hero), `LF` (Love Under Fire),
 *  `MHH`, `AC`, and the five-volume `1TC`–`5TC` "The Conflict" set — are the
 *  Conflict of the Ages and health writings rewritten in contemporary wording
 *  by later editors. They total 19,855 paragraphs.
 *
 *  The problem is not that they are bad books; it is that a search result is a
 *  *citation*. A hit renders as a refcode, an author and a deep link, and a
 *  reader quoting one from `BOE` would be attributing an editor's sentence to
 *  Ellen White. The original is in the corpus under its own refcode, so
 *  excluding the paraphrase costs no content — it removes a second, differently
 *  worded copy that cannot be quoted safely.
 *
 *  A rule rather than a filter, deliberately. A filter the reader could switch
 *  off would still be off by default for the one person who did not know the
 *  distinction existed, which is exactly the person the misquote would catch.
 *  Applied in `searchFilters`, so every query through this corpus — CLI,
 *  desktop reader, the search app — inherits it without opting in. */
export const EXCLUDED_SUBTYPES: ReadonlySet<BookSubtype> = new Set<BookSubtype>(['ModernEnglish']);

/** The subtypes a reader may actually filter *by*, which is the union minus
 *  the ones the corpus excludes outright. The UI builds its controls from
 *  this, so an excluded subtype can never be offered as a choice. */
export const SELECTABLE_SUBTYPES: readonly BookSubtype[] = BookSubtype.literals.filter(
  (subtype) => !EXCLUDED_SUBTYPES.has(subtype),
);

/** Schema-derived guards, for the boundaries where a classification arrives as
 *  a bare `string` — a SQLite column, a query parameter — and has to be
 *  narrowed before it can be compared against the unions above. Derived from
 *  the schemas rather than written as `includes` checks over a second copy of
 *  the values. */
export const isCorpusSection = Schema.is(CorpusSection);
export const isBookType = Schema.is(BookType);
export const isBookSubtype = Schema.is(BookSubtype);

/** The `add_class` values that constitute each section, as the folder tree
 *  nests them. The backfill resolves a book's section by walking up to its
 *  top-level folder, so this is the decode of that walk rather than a second
 *  classification. */
export const SECTION_BY_ROOT_FOLDER = {
  'EGW Writings': 'egw-writings',
  'Adventist Pioneer Library': 'pioneer-library',
  Reference: 'reference',
  Bible: 'bible',
} satisfies Record<string, CorpusSection>;

/** The types that are lookup apparatus rather than something anyone reads
 *  through.
 *
 *  A dictionary entry, a concordance line and a scripture-index stub all rank
 *  well for exactly the topical queries this corpus is searched with, and all
 *  three are answers to "where is this word" rather than to "what does this
 *  say". Together they are 1,175,658 paragraphs — 39% of the corpus — which is
 *  why excluding them is a single toggle rather than three.
 *
 *  `main.ts`'s `INDEX_BOOKS` was the hand-maintained ten-code version of this
 *  set; this is the same intent expressed over the classification the library
 *  itself publishes, so a newly added dictionary is covered without anyone
 *  remembering to add its code. */
export const APPARATUS_TYPES: ReadonlySet<BookType> = new Set<BookType>([
  'dictionary',
  'topicalindex',
  'scriptindex',
]);

/**
 * One axis of the filter, signed.
 *
 * "Devotionals only" and "anything but devotionals" are the same axis with
 * opposite signs, not two different filters, so they are one record with two
 * lists rather than a `subtype` array beside an `excludeSubtype` array. The
 * chips in the UI are tri-state over exactly this: absent, in `include`, in
 * `exclude`.
 *
 * The two lists are applied with different rules, which is the whole reason
 * the distinction is worth modelling:
 *
 *   - `include` is a whitelist. A book with no classification is *not* in it,
 *     so it is dropped. Asking for `type=dictionary` and getting back the one
 *     book the backfill could not classify is a wrong answer.
 *   - `exclude` is a blacklist. A book with no classification is not in it
 *     either, so it survives. Asking for "no devotionals" should not also
 *     silently drop everything whose subtype is unknown.
 *
 * That asymmetry is not a special case for NULL; it is what "only these" and
 * "not these" each mean when the evidence is missing. An unbackfilled corpus
 * therefore answers every exclusion exactly as it did before these columns
 * existed, and answers every inclusion with nothing — which is honest.
 */
export const Signed = <A extends Schema.Top>(value: A) =>
  Schema.Struct({
    include: Schema.Array(value),
    exclude: Schema.Array(value),
  });

export const NO_SELECTION = {
  include: [],
  exclude: [],
} satisfies { readonly include: readonly never[]; readonly exclude: readonly never[] };

/**
 * The wire spelling of a signed selection: one repeated query key whose values
 * carry their own sign, `?subtype=commentary&subtype=-devotional`.
 *
 * One key rather than two (`subtype` beside `exclude_subtype`) because the two
 * signs are one axis: a reader toggling a chip changes the sign of a value,
 * not which parameter it lives under, and a link that spelled them separately
 * would let the same value appear in both.
 *
 * No value in these unions begins with `-`, so the prefix is unambiguous
 * without escaping. `signOf` is total: an unrecognised value — a hand-edited
 * link, a value from a newer corpus — is dropped rather than failing the page,
 * the same degradation rule `parseParams` applies everywhere else.
 */
export const EXCLUDE_PREFIX = '-';

/**
 * The codec between the two: `readonly string[]` on the wire, `{ include,
 * exclude }` in the domain.
 *
 * A `decodeTo` rather than a pair of helper functions, so the sign encoding is
 * a property of the schema the endpoint declares. The API's query parameter
 * *is* `SignedFromStrings(BookSubtype)`, which means the handler receives the
 * split selection already — there is no parse step a handler could forget, and
 * no second place that knows what `-` means. Encoding back to a link is the
 * same schema run the other way, so a link this app produces is a link this
 * app decodes, by construction rather than by two functions kept in step.
 *
 * Decoding is *lenient*: a value the union does not contain is dropped rather
 * than failing the request. A search link is pasted, truncated and
 * hand-edited, and the useful answer to `?subtype=devotionl` is the reader's
 * results with one filter missing, not an error page. The guard is what makes
 * the drop possible without `Schema.Union` parsing every literal twice.
 */
export const SignedFromStrings = <const L extends readonly string[]>(
  literals: Schema.Literals<L>,
) => {
  const is = Schema.is(literals);
  type Value = L[number];

  return Schema.Array(Schema.String).pipe(
    Schema.decodeTo(Signed(literals), {
      decode: SchemaGetter.transform((values: readonly string[]) => {
        // Typed as the narrowed union, not `string[]`, so the guard's
        // narrowing is what builds the result and no assertion is needed to
        // hand it back as a selection.
        const include: Value[] = [];
        const exclude: Value[] = [];
        for (const raw of values) {
          if (raw.startsWith(EXCLUDE_PREFIX)) {
            const bare = raw.slice(EXCLUDE_PREFIX.length);
            if (is(bare)) exclude.push(bare);
          } else if (is(raw)) {
            include.push(raw);
          }
        }
        return { include, exclude };
      }),
      encode: SchemaGetter.transform(
        (selection: {
          readonly include: readonly Value[];
          readonly exclude: readonly Value[];
        }): readonly string[] => [
          ...selection.include,
          ...selection.exclude.map((value) => `${EXCLUDE_PREFIX}${value}`),
        ],
      ),
    }),
  );
};

/** Every filter a search may carry, beyond the query text itself.
 *
 *  One record rather than four parameters threaded through the legs: the
 *  filters are applied together in one `WHERE`, and a caller that adds a fifth
 *  axis should not have to touch every signature between here and the SQL.
 *
 *  A schema rather than a bare interface, because it travels — it is a field of
 *  `SearchQuery`, which is a `Schema.Class`, and it arrives over HTTP from the
 *  search app's URL. The type is derived from it so the two cannot disagree. */
export const CorpusFilterSchema = Schema.Struct({
  section: Signed(CorpusSection),
  type: Signed(BookType),
  subtype: Signed(BookSubtype),
  /** Drop the dictionaries, concordances and indexes (`APPARATUS_TYPES`).
   *
   *  Still its own boolean rather than three entries in `type.exclude`: it is
   *  one intent ("don't search the lookup apparatus") that happens to span
   *  three types, and collapsing it into the type axis would make the chip
   *  that sets it impossible to render as one control. */
  excludeApparatus: Schema.Boolean,
});

export type CorpusFilter = typeof CorpusFilterSchema.Type;

export const NO_FILTER: CorpusFilter = {
  section: NO_SELECTION,
  type: NO_SELECTION,
  subtype: NO_SELECTION,
  excludeApparatus: false,
};

const empty = (selection: {
  readonly include: readonly unknown[];
  readonly exclude: readonly unknown[];
}): boolean => selection.include.length === 0 && selection.exclude.length === 0;

/** True when the filter would narrow nothing, so the caller can skip the join
 *  entirely rather than emitting a `WHERE` that is always true. */
export const isUnfiltered = (filter: CorpusFilter): boolean =>
  empty(filter.section) && empty(filter.type) && empty(filter.subtype) && !filter.excludeApparatus;
