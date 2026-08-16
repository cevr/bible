import { Schema } from 'effect';

import { BookNumber, ChapterNumber, VerseNumber } from '../bible/model.js';
import { TOPICS_SCHEMA_MAJOR, TOPICS_SCHEMA_MINOR } from '../corpus-supply/file-artifact.js';
import { CorpusScope } from '../writings/corpus-scope.js';

export const TopicSlug = Schema.NonEmptyString.pipe(Schema.brand('Wiki/TopicSlug'));
export type TopicSlug = typeof TopicSlug.Type;

export const topicSlug = Schema.decodeSync(TopicSlug);

/** The artifact schema this build of the app compiles against, re-exported from
 *  the supply lifecycle that owns it. `schema_major` gates the runtime update
 *  path in §3.6: an app never installs an artifact whose major exceeds what it
 *  was built for. */
export { TOPICS_SCHEMA_MAJOR, TOPICS_SCHEMA_MINOR };

// ---------------------------------------------------------------------------
// Portable AST (§2.2)
//
// The wiki's own small block/inline set, deliberately not the EGW HTML AST in
// `egw/ast.ts` — that union describes EGW markup, this one describes authored
// markdown. Both `thesis_ast` and `body_ast` hold JSON of `readonly Block[]`,
// never HTML, so the CLI text-renders exactly what the Solid app renders as
// elements.
// ---------------------------------------------------------------------------

export class TextInline extends Schema.TaggedClass<TextInline>('Wiki/TextInline')('text', {
  text: Schema.String,
}) {}

export class EmphasisInline extends Schema.TaggedClass<EmphasisInline>('Wiki/EmphasisInline')(
  'emphasis',
  { text: Schema.String },
) {}

export class StrongInline extends Schema.TaggedClass<StrongInline>('Wiki/StrongInline')('strong', {
  text: Schema.String,
}) {}

/** A scripture reference the renderer links into the Bible reader. */
export class ScriptureInline extends Schema.TaggedClass<ScriptureInline>('Wiki/ScriptureInline')(
  'scripture',
  { text: Schema.String, reference: Schema.NonEmptyString },
) {}

/** A writings citation: a refcode plus the quoted text the compiler verified
 *  against that refcode's paragraph. Both halves are load-bearing — the
 *  compiler's §3.4 step 6 pass asserts the quote really appears there.
 *
 *  `text` is non-empty by construction: the verifier asserts the quote is a
 *  substring of the cited paragraph, and the empty string is a substring of
 *  every paragraph. A blank citation would therefore pass verification against
 *  any refcode at all, which is exactly the guarantee §3.4 step 6 exists to
 *  make. Enforcing it at the boundary means no decode path can reintroduce one. */
export class CitationInline extends Schema.TaggedClass<CitationInline>('Wiki/CitationInline')(
  'citation',
  { text: Schema.NonEmptyString, refcode: Schema.NonEmptyString },
) {}

export class LinkInline extends Schema.TaggedClass<LinkInline>('Wiki/LinkInline')('link', {
  text: Schema.String,
  href: Schema.NonEmptyString,
}) {}

export const Inline = Schema.Union([
  TextInline,
  EmphasisInline,
  StrongInline,
  ScriptureInline,
  CitationInline,
  LinkInline,
]);
export type Inline = typeof Inline.Type;

export class ParagraphBlock extends Schema.TaggedClass<ParagraphBlock>('Wiki/ParagraphBlock')(
  'paragraph',
  { content: Schema.Array(Inline) },
) {}

export class HeadingBlock extends Schema.TaggedClass<HeadingBlock>('Wiki/HeadingBlock')('heading', {
  level: Schema.Finite.pipe(
    Schema.check(Schema.isInt(), Schema.isBetween({ minimum: 2, maximum: 4 })),
  ),
  content: Schema.Array(Inline),
}) {}

export class BlockquoteBlock extends Schema.TaggedClass<BlockquoteBlock>('Wiki/BlockquoteBlock')(
  'blockquote',
  { content: Schema.Array(Inline) },
) {}

export class ListBlock extends Schema.TaggedClass<ListBlock>('Wiki/ListBlock')('list', {
  ordered: Schema.Boolean,
  items: Schema.Array(Schema.Array(Inline)),
}) {}

export const Block = Schema.Union([ParagraphBlock, HeadingBlock, BlockquoteBlock, ListBlock]);
export type Block = typeof Block.Type;

/** The on-disk encoding of `thesis_ast` and `body_ast`. */
export const BlocksJson = Schema.fromJsonString(Schema.Array(Block));

// ---------------------------------------------------------------------------
// Page model
// ---------------------------------------------------------------------------

/** How a topic page got its content. `flagship` has an authored core compiled
 *  into the artifact; `catalog` is a long-tail page assembled live. */
export const TopicStatus = Schema.Literals(['flagship', 'catalog']);
export type TopicStatus = typeof TopicStatus.Type;

export class TopicAlias extends Schema.Class<TopicAlias>('Wiki/TopicAlias')({
  /** The normalized form the phrase dictionary keys on. */
  alias: Schema.NonEmptyString,
  /** The authored surface form. */
  display: Schema.NonEmptyString,
  canonical: Schema.Boolean,
}) {}

export const TopicEdgeKind = Schema.Literals(['authored', 'backlink']);
export type TopicEdgeKind = typeof TopicEdgeKind.Type;

export class TopicEdge extends Schema.Class<TopicEdge>('Wiki/TopicEdge')({
  slug: TopicSlug,
  kind: TopicEdgeKind,
}) {}

export class WikiPageSummary extends Schema.Class<WikiPageSummary>('Wiki/PageSummary')({
  slug: TopicSlug,
  title: Schema.NonEmptyString,
  status: TopicStatus,
}) {}

/** Why authored cores are missing, as a value rather than a failure. §3.5:
 *  with no artifact every topic falls back to a catalog landing page, and the
 *  catalog tables ship inside the verified `bible.db`, so the fallback is
 *  always available. `schema-too-new` is the §3.6 gate: an artifact whose
 *  `schema_major` exceeds what this build compiled against is refused rather
 *  than read. */
export const TopicsUnavailableReason = Schema.Literals([
  'artifact-not-installed',
  'schema-too-new',
]);
export type TopicsUnavailableReason = typeof TopicsUnavailableReason.Type;

/** The authored core of a flagship page: the thesis block(s) and the authored
 *  `##` sections, both as portable AST. Milestone 3 appends the auto-mined
 *  section lineup around this value; Milestone 2 returns it alone. */
export class AuthoredCore extends Schema.Class<AuthoredCore>('Wiki/AuthoredCore')({
  thesis: Schema.Array(Block),
  body: Schema.Array(Block),
  aliases: Schema.Array(TopicAlias),
  edges: Schema.Array(TopicEdge),
}) {}

// ---------------------------------------------------------------------------
// Auto-mined sections (§6)
//
// Everything below is live-queried at view time by the one composer in
// `section-composer.ts`. Nothing here is stored in the artifact: precomputed
// section bodies break against partial libraries, and a live query is
// automatically honest about what is locally installed.
// ---------------------------------------------------------------------------

/** The six sections of §6.1, in lineup order. The kind is the identity a client
 *  keys its rendering on, so it is a literal rather than a positional index —
 *  a page that legitimately omits a section (no key verses, no edges) must not
 *  shift the ones after it. */
export const WikiSectionKind = Schema.Literals([
  'key-verses',
  'egw-statements',
  'commentary',
  'pioneer-witnesses',
  'cross-references',
  'related-topics',
]);
export type WikiSectionKind = typeof WikiSectionKind.Type;

/** A verse the page points at. `text` is `None` when the verse is cited but its
 *  text was not resolved — the catalog stores references, not verse text. */
export class WikiVerseRef extends Schema.Class<WikiVerseRef>('Wiki/VerseRef')({
  book: BookNumber,
  chapter: ChapterNumber,
  verse: VerseNumber,
  /** The reference as it reads: "Dan 8:14". */
  label: Schema.NonEmptyString,
  text: Schema.Option(Schema.String),
}) {}

/** A passage the page points at: one verse, or a range the catalog stored as
 *  one reference.
 *
 *  A range is its own entry rather than the verses it spans. The catalog's
 *  `topic_references` holds 11,464 range tokens (`Exod.6.16-Exod.6.20`) and 120
 *  topics whose references are *all* ranges, so dropping ranges empties those
 *  pages entirely. Expanding them instead would spend section 1's cap of 8 on
 *  the five verses of one reference — the reader asked for the passage, and the
 *  passage is what the entry names. `end` is `None` for a single verse, which is
 *  the shape the catalog's other 65,493 tokens have. */
export class WikiPassageRef extends Schema.Class<WikiPassageRef>('Wiki/PassageRef')({
  start: WikiVerseRef,
  /** `Some` only for a range, and never equal to `start` — a range collapsing to
   *  its own start is a single verse and encodes as one. */
  end: Schema.Option(WikiVerseRef),
  /** The passage as it reads: "Exod 6:16-20", or "Dan 8:14" for a single verse.
   *  Distinct from `start.label`, which always names one verse. */
  label: Schema.NonEmptyString,
  /** The passage's KJV text: one verse's text, or the spanned verses joined.
   *  `None` when the Bible corpus could not resolve it. */
  text: Schema.Option(Schema.String),
}) {}

/** Why a writings citation carries no snippet (§6.3). The only value in v1 is
 *  `not-installed`: the citation names a book this library does not hold, so
 *  the entry renders refcode + book title + a get-this-book affordance and no
 *  text. A closed literal rather than a boolean because the reason is what the
 *  UI acts on — `not-installed` is the one a download button resolves. */
export const WikiSnippetAbsence = Schema.Literals(['not-installed']);
export type WikiSnippetAbsence = typeof WikiSnippetAbsence.Type;

/** One writings paragraph on a topic page, from FTS (sections 2 and 4) or from
 *  a citation in the authored core (§6.3).
 *
 *  `snippet` and `absence` are the two halves of one fact and never both
 *  present: a hit whose book is installed carries text and no absence; a
 *  citation whose book is not carries an absence and no text. §6.3 forbids
 *  inventing a snippet for the second case — a precomputed excerpt would
 *  reintroduce exactly the staleness §4.1 rejected. */
export class WikiWritingsHit extends Schema.Class<WikiWritingsHit>('Wiki/WritingsHit')({
  refcode: Schema.NonEmptyString,
  bookCode: Schema.NonEmptyString,
  bookTitle: Schema.NonEmptyString,
  author: Schema.NonEmptyString,
  snippet: Schema.Option(Schema.String),
  /** `Some` exactly when the snippet is absent, saying why. The pair the UI's
   *  "get this book" affordance keys on. */
  absence: Schema.Option(WikiSnippetAbsence),
}) {}

/** One EGW Bible Commentary entry keyed to a verse in section 1 (§6.1 row 3). */
export class WikiCommentaryEntry extends Schema.Class<WikiCommentaryEntry>('Wiki/CommentaryEntry')({
  verse: WikiVerseRef,
  refcode: Schema.NonEmptyString,
  bookCode: Schema.NonEmptyString,
  bookTitle: Schema.NonEmptyString,
  content: Schema.String,
}) {}

/** One cross-reference reached from a key verse (§6.1 row 5). */
export class WikiCrossReference extends Schema.Class<WikiCrossReference>('Wiki/CrossReference')({
  from: WikiVerseRef,
  to: WikiVerseRef,
  source: Schema.Literals(['openbible', 'tske']),
  preview: Schema.Option(Schema.String),
}) {}

/** One neighbour in the topic graph (§6.1 row 6). */
export class WikiRelatedTopic extends Schema.Class<WikiRelatedTopic>('Wiki/RelatedTopic')({
  slug: TopicSlug,
  title: Schema.NonEmptyString,
  kind: TopicEdgeKind,
}) {}

/** The §6.2 handoff sections 2 and 4 each end in: the query to pre-fill the
 *  hybrid search UI with, and the corpus scope to run it under. Deliberately a
 *  descriptor rather than a longer result list — "everywhere this phrase
 *  appears" is not a section, it is a jump into search. */
export class WikiSearchHandoff extends Schema.Class<WikiSearchHandoff>('Wiki/SearchHandoff')({
  /** The topic's canonical phrase. */
  query: Schema.NonEmptyString,
  scope: CorpusScope,
}) {}

/** A book the authored core cites that this library does not hold (§6.3),
 *  carried as section metadata rather than as an item.
 *
 *  Not an item, deliberately: sections 2 and 4 are rank-ordered FTS results with
 *  a cap of 5, and a citation has no rank. Mixing one in would evict a ranked
 *  hit and leave a list that is no longer in rank order — which is exactly what
 *  §6.1's "FTS rank" column forbids. The get-this-book affordance renders from
 *  this field alongside the hits, consuming none of the cap. */
export class WikiMissingBook extends Schema.Class<WikiMissingBook>('Wiki/MissingBook')({
  refcode: Schema.NonEmptyString,
  bookCode: Schema.NonEmptyString,
  bookTitle: Schema.NonEmptyString,
  author: Schema.NonEmptyString,
  /** Why there is no snippet. The value a download button resolves. */
  absence: WikiSnippetAbsence,
}) {}

/** §5's arrival rule as a type, not a runtime flag: key verses arrive open and
 *  every other section arrives collapsed. Literal rather than `Schema.Boolean`
 *  so a page that opens the wrong section does not decode — the arrival posture
 *  is part of the lineup's shape, and a boolean would let the three hosts
 *  disagree about it while still passing the schema. */
const OpenOnArrival = Schema.Literal(true);
const CollapsedOnArrival = Schema.Literal(false);

/** The fields every section carries. The section's `_tag` is its
 *  `WikiSectionKind`, so the discriminator and the lineup identity are one
 *  value rather than two that could disagree. */
const section = <Item extends Schema.Top, Open extends Schema.Top>(item: Item, open: Open) => ({
  /** Already capped and already ordered by the composer, so no client re-sorts
   *  or re-slices and the three of them cannot disagree. */
  items: Schema.Array(item),
  /** How many items the source produced before the cap. `total > items.length`
   *  is exactly the condition a "show all" affordance exists for. */
  total: Schema.Int.check(Schema.isGreaterThanOrEqualTo(0)),
  /** §5's arrival rule: key verses default open, everything else collapsed.
   *  Carried on the page model rather than hardcoded in each UI, so the CLI
   *  emits the same fact the two visual hosts render. */
  defaultOpen: open,
});

export class WikiKeyVersesSection extends Schema.TaggedClass<WikiKeyVersesSection>(
  'Wiki/KeyVersesSection',
)('key-verses', section(WikiPassageRef, OpenOnArrival)) {}

export class WikiEgwStatementsSection extends Schema.TaggedClass<WikiEgwStatementsSection>(
  'Wiki/EgwStatementsSection',
)('egw-statements', {
  ...section(WikiWritingsHit, CollapsedOnArrival),
  handoff: Schema.Option(WikiSearchHandoff),
  /** Cited books this scope's corpus does not hold. Renders with the hits and
   *  never inside `items`, so `total` and the cap stay rank-only. */
  missingBooks: Schema.Array(WikiMissingBook),
}) {}

export class WikiCommentarySection extends Schema.TaggedClass<WikiCommentarySection>(
  'Wiki/CommentarySection',
)('commentary', section(WikiCommentaryEntry, CollapsedOnArrival)) {}

export class WikiPioneerWitnessesSection extends Schema.TaggedClass<WikiPioneerWitnessesSection>(
  'Wiki/PioneerWitnessesSection',
)('pioneer-witnesses', {
  ...section(WikiWritingsHit, CollapsedOnArrival),
  handoff: Schema.Option(WikiSearchHandoff),
  missingBooks: Schema.Array(WikiMissingBook),
}) {}

export class WikiCrossReferencesSection extends Schema.TaggedClass<WikiCrossReferencesSection>(
  'Wiki/CrossReferencesSection',
)('cross-references', section(WikiCrossReference, CollapsedOnArrival)) {}

export class WikiRelatedTopicsSection extends Schema.TaggedClass<WikiRelatedTopicsSection>(
  'Wiki/RelatedTopicsSection',
)('related-topics', section(WikiRelatedTopic, CollapsedOnArrival)) {}

export const WikiSection = Schema.Union([
  WikiKeyVersesSection,
  WikiEgwStatementsSection,
  WikiCommentarySection,
  WikiPioneerWitnessesSection,
  WikiCrossReferencesSection,
  WikiRelatedTopicsSection,
]);
export type WikiSection = typeof WikiSection.Type;

/** The §6.1 lineup as an exact six-element tuple in lineup order.
 *
 *  A tuple rather than an array of the section union: the lineup is the page's
 *  shape, and an array lets a five-section page, a reordered page, or a page
 *  with two key-verses sections decode successfully — three states no client
 *  could render and none of the three hosts should ever produce. Positional
 *  typing makes the lineup a compile-time fact on every host at once. */
export const WikiSectionLineup = Schema.Tuple([
  WikiKeyVersesSection,
  WikiEgwStatementsSection,
  WikiCommentarySection,
  WikiPioneerWitnessesSection,
  WikiCrossReferencesSection,
  WikiRelatedTopicsSection,
]);
export type WikiSectionLineup = typeof WikiSectionLineup.Type;

/** Why the auto-mined sections are empty as a lineup rather than per source.
 *  The only value is `sources-not-wired`: this host built `WikiService` on the
 *  explicit degraded `WikiSectionSources` layer, so nothing queried the corpora
 *  at all. Distinct from six sections that are empty because the corpora were
 *  read and had nothing — the first is a host configuration a operator can fix,
 *  the second is a partial library the reader can fill. */
export const WikiSectionsUnavailableReason = Schema.Literals(['sources-not-wired']);
export type WikiSectionsUnavailableReason = typeof WikiSectionsUnavailableReason.Type;

export class WikiPage extends Schema.Class<WikiPage>('Wiki/Page')({
  slug: TopicSlug,
  title: Schema.NonEmptyString,
  status: TopicStatus,
  /** `None` for a catalog page: it has no authored core by definition. */
  core: Schema.Option(AuthoredCore),
  /** The §6.1 lineup, always all six sections in order, each already capped.
   *  A section with nothing to show is present and empty rather than dropped:
   *  the lineup is the page's shape, and a client that has to reason about
   *  which sections exist this time is a client that will render them in a
   *  different order than its two siblings. */
  sections: WikiSectionLineup,
  /** Why the authored core is absent when it is. A page is never a failure
   *  just because the topics artifact is not installed — §3.5's degradation
   *  posture makes the absence a typed value the three clients agree on. */
  unavailable: Schema.Option(TopicsUnavailableReason),
  /** Why the lineup was not composed from live corpora, when it was not. `None`
   *  on every host that wired its section sources — which is all three — so a
   *  `Some` here is a visible, deliberate host configuration rather than six
   *  silently empty sections nobody can tell apart from an empty library. */
  sectionsUnavailable: Schema.Option(WikiSectionsUnavailableReason),
}) {}

/** The one wire encoding of a composed page, shared by every seam that has to
 *  serialize one.
 *
 *  `v1.wiki.topic.get` already encodes `WikiPage` through its schema; naming
 *  that encoding here means the CLI's `--json` is the *same* codec rather than a
 *  hand-written projection that drifts field by field as the model grows. Adding
 *  `missingBooks` to a section, or `sectionsUnavailable` to the page, now reaches
 *  both surfaces at once because neither surface enumerates fields.
 *
 *  `WikiPageJson.Encoded` is therefore the CLI's JSON contract and the RPC
 *  payload's shape, by construction. */
export const WikiPageJson = WikiPage;
export type WikiPageJson = typeof WikiPageJson.Encoded;

/** The listing's wire encoding, for the same reason. */
export const WikiPageSummaryJson = Schema.Array(WikiPageSummary);
export type WikiPageSummaryJson = typeof WikiPageSummaryJson.Encoded;

/** The compiled alias → slug table (§2.5). Shipped whole so a client builds its
 *  matcher once; the matcher itself lands in Milestone 4. */
export class PhraseDictionaryEntry extends Schema.Class<PhraseDictionaryEntry>(
  'Wiki/PhraseDictionaryEntry',
)({
  alias: Schema.NonEmptyString,
  display: Schema.NonEmptyString,
  slug: TopicSlug,
  canonical: Schema.Boolean,
}) {}

export class PhraseDictionary extends Schema.Class<PhraseDictionary>('Wiki/PhraseDictionary')({
  entries: Schema.Array(PhraseDictionaryEntry),
  /** Why the dictionary is empty when it is — the same §3.5 typed absence the
   *  page carries, so an empty dictionary and an absent artifact stay
   *  distinguishable. */
  unavailable: Schema.Option(TopicsUnavailableReason),
}) {}

export const WikiListInput = Schema.Struct({
  query: Schema.optional(Schema.String),
  letter: Schema.optional(Schema.String),
});
export type WikiListInput = typeof WikiListInput.Type;
