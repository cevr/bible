import { Schema } from 'effect';

import { TOPICS_SCHEMA_MAJOR, TOPICS_SCHEMA_MINOR } from '../corpus-supply/file-artifact.js';

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

export class WikiPage extends Schema.Class<WikiPage>('Wiki/Page')({
  slug: TopicSlug,
  title: Schema.NonEmptyString,
  status: TopicStatus,
  /** `None` for a catalog page: it has no authored core by definition. */
  core: Schema.Option(AuthoredCore),
  /** Why the authored core is absent when it is. A page is never a failure
   *  just because the topics artifact is not installed — §3.5's degradation
   *  posture makes the absence a typed value the three clients agree on. */
  unavailable: Schema.Option(TopicsUnavailableReason),
}) {}

export const WikiListInput = Schema.Struct({
  query: Schema.optional(Schema.String),
  letter: Schema.optional(Schema.String),
});
export type WikiListInput = typeof WikiListInput.Type;
