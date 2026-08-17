/** The select-to-lookup wire model (§7).
 *
 *  Every type here crosses `v1.wiki.lookup.resolve`, and the same classes are
 *  `bible wiki lookup --json`'s codec — one shared codec per payload, exactly as
 *  `study/model.ts` and the `WikiPageJson` alias do, so the RPC response and the
 *  CLI's JSON are the same value encoded by the same schema rather than two
 *  projections that drift.
 *
 *  The shape this module exists to enforce is §7's **five groups, always
 *  present, always in order**. A resolver that found nothing yields an empty
 *  group, never an absent one: the panel's shape is the result's shape, and a
 *  client that has to work out which groups exist this time is a client that
 *  will eventually render them in a different order than its two siblings —
 *  the same argument §6.1's fixed section lineup makes, applied to a surface
 *  that has one more reason to need it. Selection lookup is a reflex gesture,
 *  and a panel whose rows move between invocations cannot be used by reflex.
 */

import { Option, Schema } from 'effect';

import { VerseReference } from '../bible/model.js';
import { StrongsLexiconEntry } from '../study/model.js';
import { TopicSlug, TopicStatus } from './model.js';
import { isWhitespace } from './normalize.js';

// ---------------------------------------------------------------------------
// The portable lookup input (§7)
// ---------------------------------------------------------------------------

/** Where a selection came from, when the host knows.
 *
 *  Only a verse address, and deliberately only that. §7 gives `context` exactly
 *  one job — "when `context` locates the selection inside a verse" — which is
 *  the Strong's group's entry condition and nothing else. An EGW paragraph
 *  address would be a second shape that no resolver reads, so it is not here:
 *  the field a group does not consume is a field a host has to guess how to
 *  fill.
 *
 *  A `VerseReference` rather than three loose numbers, because this value is
 *  built by three different callers — the web DOM, the desktop DOM, and the
 *  CLI's `--context` argument — and the branded schema is what makes their
 *  agreement checkable rather than conventional. */
export const LookupContext = VerseReference;
export type LookupContext = typeof LookupContext.Type;

/** What a host asks about: the selected text, plus where it was selected.
 *
 *  **The portable input** §7 names. One schema, built identically from a DOM
 *  `Selection` on both visual hosts and from `bible wiki lookup`'s arguments,
 *  so "the same resolution everywhere" is a property of the type rather than a
 *  claim in a doc comment. The builder that turns a DOM selection into this
 *  value lives in `packages/app` — core cannot import a DOM — but the value it
 *  produces is this one, and the adapter test asserts the CLI builds an equal
 *  value from the equivalent argument.
 *
 *  `text` is `NonEmptyString`: an empty selection is not a lookup, and refusing
 *  it at the boundary is what keeps every resolver below from restating the
 *  check. The trim happens in the builder, so what arrives here has already
 *  been decided to be a selection. */
export class LookupInput extends Schema.Class<LookupInput>('Wiki/LookupInput')({
  text: Schema.NonEmptyString,
  context: Schema.Option(LookupContext),
}) {}

/** §4.3's whitespace rule, applied to the text before it becomes an input.
 *
 *  `isWhitespace` rather than a second regex: `normalize.ts` states what
 *  whitespace is for this layer, and a builder that folded a different set would
 *  make the same selection two `text` values depending on which surface it was
 *  made on. What is *not* folded is case and punctuation — `normalizeAlias`
 *  folds those at match time, inside the resolver, and `LookupResult.text` is
 *  echoed back to the panel heading, so an input builder that lowercased would
 *  make the panel disagree with the words the reader is looking at. */
const collapse = (raw: string): string => {
  let text = '';
  let pending = false;
  for (const codePoint of raw) {
    if (isWhitespace(codePoint)) {
      if (text.length > 0) pending = true;
      continue;
    }
    if (pending) {
      text += ' ';
      pending = false;
    }
    text += codePoint;
  }
  return text;
};

/** The one builder every adapter's text goes through (§7, §10's adapter check).
 *
 *  Three callers build a lookup — the DOM selection on web and desktop, and
 *  `bible wiki lookup`'s argument — and §10 requires them to produce one value.
 *  That is only checkable if there is one rule, so the rule is here, in core,
 *  beside the schema it satisfies. Milestone 7's review found the two halves had
 *  drifted already: the DOM builder collapsed the markup's whitespace and the
 *  CLI passed its argument through raw, so `  the   daily  ` and `the daily`
 *  were two selections on the wire and one phrase on the screen.
 *
 *  `None` rather than an error for text that collapses away. Every click in a
 *  reading surface leaves one, and a drag that ended in a margin leaves one; a
 *  host asks "is this a lookup?" far more often than it asks for a lookup, and
 *  the absent answer is what lets the caller mount a panel from this value
 *  directly. The CLI turns the same `None` into its own refusal, because there
 *  an empty argument really was a request. */
export const lookupInputOf = (input: {
  readonly text: string;
  readonly context: Option.Option<LookupContext>;
}): Option.Option<LookupInput> => {
  const text = collapse(input.text);
  if (text.length === 0) return Option.none();
  return Option.some(LookupInput.make({ text, context: input.context }));
};

// ---------------------------------------------------------------------------
// Group 1 — topic matches
// ---------------------------------------------------------------------------

/** How a topic match was found. §7's "phrase dictionary exact hit, then fuzzy",
 *  as a value on the hit rather than as two lists.
 *
 *  One list with a labelled kind, because the panel renders one section and the
 *  order within it — exact before fuzzy — is the ranking. Two arrays would make
 *  the caller concatenate them to draw one list, and a caller that concatenates
 *  is a caller that can concatenate in the wrong order. */
export const TopicMatchKind = Schema.Literals(['exact', 'fuzzy']);
export type TopicMatchKind = typeof TopicMatchKind.Type;

/** One topic the selection might mean.
 *
 *  `alias` is the dictionary key that matched and `display` is its authored
 *  surface form, both carried because they answer different questions: the
 *  panel shows `display`, and `alias` is what explains *why* this row is here
 *  when the reader selected something that only normalizes to it. */
export class LookupTopicMatch extends Schema.Class<LookupTopicMatch>('Wiki/LookupTopicMatch')({
  slug: TopicSlug,
  /** The page's own title, from the dictionary entry's authored display form. */
  display: Schema.NonEmptyString,
  /** The normalized alias key this match came through. */
  alias: Schema.NonEmptyString,
  kind: TopicMatchKind,
  /** Whether the matched alias is the topic's canonical name rather than a
   *  synonym — the same flag the dictionary carries, kept because a canonical
   *  hit is a stronger answer than a synonym hit and the panel may say so. */
  canonical: Schema.Boolean,
}) {}

// ---------------------------------------------------------------------------
// Group 2 — Strong's
// ---------------------------------------------------------------------------

/** One word of the context verse the selection covered, with its lexicon entry.
 *
 *  The entry is `Option` for the same reason `StrongsStudy.entry` is: a number
 *  the corpus's `verse_words` carries but the lexicon has no row for is a gap in
 *  the corpus, not a broken lookup, and the word is still worth showing. */
export class LookupStrongsHit extends Schema.Class<LookupStrongsHit>('Wiki/LookupStrongsHit')({
  /** The English word in the verse, as the KJV prints it. */
  word: Schema.NonEmptyString,
  entry: Schema.Option(StrongsLexiconEntry),
}) {}

// ---------------------------------------------------------------------------
// Group 3 — Bible FTS
// ---------------------------------------------------------------------------

/** One verse the selected text occurs in. */
export class LookupVerseHit extends Schema.Class<LookupVerseHit>('Wiki/LookupVerseHit')({
  reference: VerseReference,
  /** The reference as it reads: "Dan 8:13". */
  label: Schema.NonEmptyString,
  text: Schema.String,
}) {}

// ---------------------------------------------------------------------------
// Group 4 — EGW FTS
// ---------------------------------------------------------------------------

/** One writings paragraph the selected text occurs in.
 *
 *  The same four identity fields §6.1's `WikiWritingsHit` carries, minus its
 *  §6.3 absence pair: an FTS hit is by definition text the library holds, so
 *  there is no uninstalled book to report and no `Option` to make the snippet
 *  carry one. */
export class LookupWritingsHit extends Schema.Class<LookupWritingsHit>('Wiki/LookupWritingsHit')({
  refcode: Schema.NonEmptyString,
  bookCode: Schema.NonEmptyString,
  bookTitle: Schema.NonEmptyString,
  author: Schema.NonEmptyString,
  snippet: Schema.String,
}) {}

// ---------------------------------------------------------------------------
// Group 5 — catalog topical index
// ---------------------------------------------------------------------------

/** One `bible.db` catalog topic whose name or alternative names match.
 *
 *  Distinct from group 1 and not merged into it. A dictionary hit names a wiki
 *  *page* the reader can open; a catalog hit names a topical-index entry that
 *  may have no authored page at all. §7 lists them as two rows of the table,
 *  and collapsing them would hide which of the two kinds of answer the reader
 *  is looking at. */
export class LookupCatalogMatch extends Schema.Class<LookupCatalogMatch>('Wiki/LookupCatalogMatch')(
  {
    /** The catalog id, which is also the slug a topic page is reached by. */
    slug: TopicSlug,
    name: Schema.NonEmptyString,
    /** Whether this topic has an authored page or is catalog-only, so the panel
     *  can say what opening it will show. */
    status: TopicStatus,
  },
) {}

// ---------------------------------------------------------------------------
// The result (§7)
// ---------------------------------------------------------------------------

/** The five resolver groups, in panel order, every one of them always present.
 *
 *  Field order in this class **is** §7's table order — topics, Strong's, bible,
 *  EGW, catalog — and it is the order the encoded JSON carries, the order the
 *  CLI prints, and the order the panel draws. One declaration, three surfaces,
 *  no place for a fourth opinion.
 *
 *  Every field is an array and no field is optional. §7's acceptance is explicit
 *  that "an empty group is present-and-empty, not absent", and the two states
 *  are only distinguishable if emptiness is representable — which an omitted key
 *  is not. The Strong's group without a `context` is the case that makes this
 *  concrete: it is empty because nothing located the selection in a verse, and
 *  it is *present* because the panel still has a row for it.
 *
 *  There is deliberately no `total` beside any group. §6.1's sections carry one
 *  because their caps hide a tail a "show all" affordance promises; a lookup
 *  panel offers no such affordance — §7 gives it no action menu and no
 *  pagination — so a count of what was withheld would be a number nothing acts
 *  on. */
export class LookupResult extends Schema.Class<LookupResult>('Wiki/LookupResult')({
  /** The text that was resolved, echoed back so a client rendering an async
   *  result can tell which selection it belongs to. */
  text: Schema.NonEmptyString,
  topics: Schema.Array(LookupTopicMatch),
  strongs: Schema.Array(LookupStrongsHit),
  verses: Schema.Array(LookupVerseHit),
  writings: Schema.Array(LookupWritingsHit),
  catalog: Schema.Array(LookupCatalogMatch),
  /** §7's "a lone topic hit gets the peek-card treatment instead of the full
   *  panel", decided in core rather than by each client.
   *
   *  A flag on the result rather than a rule the three hosts each re-derive
   *  from the group contents. The condition is not simply `topics.length === 1`
   *  — a single topic hit *alongside* forty verse hits is a full panel, because
   *  the other groups have things to say — and a predicate that subtle,
   *  restated per host, is a predicate that will be spelled three ways. Here it
   *  is computed once, beside the data it reads, and the parity test asserts one
   *  value rather than three renderings. */
  lonePeek: Schema.Boolean,
}) {}

/** The one wire encoding of a lookup result, shared by the RPC success schema
 *  and the CLI's `--json`, named for the same reason `WikiPageJson` and
 *  `VerseStudyJson` are: so neither surface enumerates fields, and a group added
 *  to `LookupResult` reaches both at once. */
export const LookupResultJson = LookupResult;
export type LookupResultJson = typeof LookupResultJson.Encoded;

/** The most hits any one FTS-backed group carries.
 *
 *  A panel cap, not a corpus cap. The two FTS groups run against indexes that
 *  answer in the thousands — "the daily" alone matches 104 verses and far more
 *  paragraphs — and §7's panel is a glance at what a selection could mean, not
 *  a search results page. Eight is what fits beside four other groups without
 *  the panel becoming the thing the reader has to scroll past to reach the
 *  groups below it.
 *
 *  One constant for both FTS groups rather than one each, because nothing
 *  distinguishes them here: §6.1's per-section caps differ because its sections
 *  differ in kind, while these two are the same question asked of two corpora.
 *  A caller cannot override it — the cap is the panel's, and a client that could
 *  pass its own would be a client whose panel differs from its siblings'. */
export const LOOKUP_HIT_LIMIT = 8;

/** The most topic or catalog matches carried, for the same reason.
 *
 *  Smaller than the FTS cap because these two groups are *identity* answers —
 *  "this selection names this topic" — and a list of twelve candidate identities
 *  is not an answer. Past a handful, a fuzzy alias scan is guessing, and the
 *  panel is better served showing its best few than its all. */
export const LOOKUP_TOPIC_LIMIT = 5;
