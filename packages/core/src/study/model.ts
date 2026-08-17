/** The study pane's wire model (§8).
 *
 *  Every type here crosses `v1.study.verse.get` and `v1.study.strongs.get`, and
 *  the same classes are the CLI's `--json` codec — one shared codec per payload,
 *  so the RPC response and `bible study verse --json` are the same value encoded
 *  by the same schema rather than two projections that drift.
 *
 *  The backing services (`BibleDatabase`, `EGWCommentaryService`,
 *  `EGWParagraphDatabase`) all speak plain interfaces with `Option` fields and
 *  no branded numbers. This module is where those become wire types: branded
 *  book/chapter/verse from `bible/model.ts`, closed literal unions instead of
 *  strings, and `Schema.Option` for genuinely-absent fields.
 */

import { Schema, SchemaGetter } from 'effect';

import { BookNumber, ChapterNumber, VerseNumber, VerseReference } from '../bible/model.js';

// ---------------------------------------------------------------------------
// Strong's
// ---------------------------------------------------------------------------

/** A Strong's number as `bible.db` stores it: `H` or `G` followed by digits,
 *  with no leading zero.
 *
 *  **The one decoder.** Both seams run this schema and nothing else — the RPC
 *  payload (`v1.study.strongs.get`) and the CLI argument — so what one accepts
 *  the other accepts. Before this, the CLI uppercased its argument before
 *  decoding and the RPC did not, which made `h8548` a valid CLI invocation and
 *  an invalid request over the wire: one input, two answers, and a divergence
 *  no test on either side could see alone.
 *
 *  Two rules, both read off the corpus rather than chosen:
 *
 *  - **Case is normalized, not rejected.** `bible.db`'s `strongs.number` column
 *    stores the uppercase form, so `h8548` names a row that exists and the only
 *    question is who spells it. Uppercasing here answers that once, on the
 *    decoding path — the direction a wire payload and a CLI argument both
 *    arrive on. Encoding is a passthrough: the branded value is already the
 *    stored spelling, so there is nothing to undo.
 *  - **A leading zero is rejected.** `H0001` is not a lexicon row: the corpus
 *    has no zero-padded numbers at all, so accepting the form would return an
 *    empty result for an input that *looks* answered. The pattern refuses it at
 *    the boundary instead, which is where a caller can still be told.
 *
 *  The brand rides on the normalized value, so a `StrongsNumber` in hand is
 *  always the corpus's own spelling and no call site re-normalizes. */
const StrongsNumberText = Schema.String.pipe(
  Schema.check(Schema.isPattern(/^[HG][1-9][0-9]*$/)),
  Schema.brand('Study/StrongsNumber'),
);

export const StrongsNumber = Schema.String.pipe(
  Schema.decodeTo(StrongsNumberText, {
    decode: SchemaGetter.toUpperCase(),
    encode: SchemaGetter.passthrough(),
  }),
);
export type StrongsNumber = typeof StrongsNumber.Type;

export const strongsNumber = Schema.decodeSync(StrongsNumber);

/** How many concordance occurrences a caller asks for.
 *
 *  **The one limit rule.** Three seams take this number — the
 *  `v1.study.strongs.get` payload, the `bible study strongs --limit` flag, and
 *  the `StrongsStudy.limit` field that reports which cap a result was built
 *  under — and each used to restate `Schema.Int.check(isGreaterThan(0))` in its
 *  own words. Three copies of one rule is three places for it to drift: a flag
 *  that accepted zero while the wire refused it is exactly the divergence that
 *  produced, and the caller met it as a schema error from inside an encode
 *  rather than as "that flag needs a positive number". */
export const StudyLimit = Schema.Int.check(Schema.isGreaterThan(0));

/** Which lexicon a Strong's entry belongs to. */
export const StrongsLanguage = Schema.Literals(['hebrew', 'greek']);
export type StrongsLanguage = typeof StrongsLanguage.Type;

/** One lexicon entry. The `Option` fields are the columns `bible.db` stores
 *  nullable — transliteration and pronunciation are missing for a minority of
 *  entries, and the KJV definition for more than that. */
export class StrongsLexiconEntry extends Schema.Class<StrongsLexiconEntry>(
  'Study/StrongsLexiconEntry',
)({
  number: StrongsNumber,
  language: StrongsLanguage,
  lemma: Schema.String,
  transliteration: Schema.Option(Schema.String),
  pronunciation: Schema.Option(Schema.String),
  definition: Schema.String,
  kjvDefinition: Schema.Option(Schema.String),
}) {}

/** One verse in which a Strong's number occurs, with the English word that
 *  carries it. */
export class ConcordanceEntry extends Schema.Class<ConcordanceEntry>('Study/ConcordanceEntry')({
  reference: VerseReference,
  /** The reference as it reads: "Dan 8:13". */
  label: Schema.NonEmptyString,
  text: Schema.String,
  /** The English word in this verse the number is behind. */
  word: Schema.String,
}) {}

/** The word-tap payload: the lexicon entry plus the reverse concordance.
 *
 *  `occurrences` is capped and `total` is the uncapped count, the same
 *  `items`/`total` pairing §6.1's sections use — `total > occurrences.length`
 *  is exactly the condition a "show all" affordance exists for, and computing it
 *  client-side from a truncated list is impossible.
 *
 *  `entry` is `Option` rather than a failure: a Strong's number with no lexicon
 *  row is a gap in the corpus, not a broken request, and the concordance half
 *  can still answer. */
export class StrongsStudy extends Schema.Class<StrongsStudy>('Study/StrongsStudy')({
  number: StrongsNumber,
  entry: Schema.Option(StrongsLexiconEntry),
  /** Capped at `limit`, in the order `bible.db` returns them (canonical). */
  occurrences: Schema.Array(ConcordanceEntry),
  /** Every occurrence in the corpus, before the cap. */
  total: Schema.Int.check(Schema.isGreaterThanOrEqualTo(0)),
  /** The cap this result was built under, so a client can tell "fewer than the
   *  cap" apart from "exactly the cap, and there may be more" without
   *  re-deriving the default. */
  limit: StudyLimit,
}) {}

// ---------------------------------------------------------------------------
// The verse bundle (§8.1)
// ---------------------------------------------------------------------------

/** One word of the verse, with the Strong's numbers behind it.
 *
 *  `italic` is the KJV's supplied-word italicization, carried because the pane
 *  renders the verse's own words as the tap targets for the Strong's path and
 *  dropping it would render a KJV verse that is typographically wrong. */
export class StudyWord extends Schema.Class<StudyWord>('Study/Word')({
  text: Schema.String,
  /** Empty for a word with no lexicon backing — punctuation, and the supplied
   *  words the KJV italicizes. A word with numbers is a tap target; a word
   *  without one is not. */
  strongs: Schema.Array(StrongsNumber),
  italic: Schema.Boolean,
}) {}

export const CrossReferenceSource = Schema.Literals(['openbible', 'tske']);
export type CrossReferenceSource = typeof CrossReferenceSource.Type;

/** A cross-reference target. Stored rows may name a verse, a verse range, or a
 *  whole chapter, so `verse` and `verseEnd` are both optional — a chapter-level
 *  reference is a real row in `cross_refs`, not a malformed one. */
export class StudyCrossReference extends Schema.Class<StudyCrossReference>('Study/CrossReference')({
  book: BookNumber,
  chapter: ChapterNumber,
  verse: Schema.Option(VerseNumber),
  verseEnd: Schema.Option(VerseNumber),
  /** The target as it reads: "Rev 12:6" or "Rev 12" or "Rev 12:6-9". */
  label: Schema.NonEmptyString,
  source: CrossReferenceSource,
  /** The target verse's text, when the row carries a preview. */
  preview: Schema.Option(Schema.String),
}) {}

export const MarginNoteKind = Schema.Literals(['hebrew', 'greek', 'alternate', 'name', 'other']);
export type MarginNoteKind = typeof MarginNoteKind.Type;

/** One KJV marginal note: the phrase it annotates and the note itself. */
export class StudyMarginNote extends Schema.Class<StudyMarginNote>('Study/MarginNote')({
  index: Schema.Int.check(Schema.isGreaterThanOrEqualTo(0)),
  kind: MarginNoteKind,
  phrase: Schema.String,
  text: Schema.String,
}) {}

/** One EGW Bible Commentary paragraph on this verse. */
export class StudyCommentaryEntry extends Schema.Class<StudyCommentaryEntry>(
  'Study/CommentaryEntry',
)({
  refcode: Schema.NonEmptyString,
  bookCode: Schema.NonEmptyString,
  bookTitle: Schema.NonEmptyString,
  content: Schema.String,
}) {}

/** One writings paragraph that cites this verse, from outside the Bible
 *  Commentary volumes (§8.4). */
export class StudyParallelWriting extends Schema.Class<StudyParallelWriting>(
  'Study/ParallelWriting',
)({
  refcode: Schema.NonEmptyString,
  bookCode: Schema.NonEmptyString,
  bookTitle: Schema.NonEmptyString,
  content: Schema.String,
}) {}

/** The whole study bundle for one verse — every section the pane draws, in one
 *  value (§8.2).
 *
 *  All five lists are always present and empty when their source had nothing.
 *  §8.4's sparseness is the reason: `paragraph_bible_refs` covers a minority of
 *  the library, so an empty `parallelWritings` is the *common* case and must be
 *  a value rather than an error. The same holds for the other four — a verse
 *  with no margin notes is most verses. */
export class VerseStudy extends Schema.Class<VerseStudy>('Study/VerseStudy')({
  reference: VerseReference,
  /** The reference as it reads: "Dan 8:13". */
  label: Schema.NonEmptyString,
  /** The verse's KJV text, `None` when the corpus does not hold the verse. The
   *  bundle still carries whatever the other four sources found — a study pane
   *  for a verse the Bible corpus is missing is degraded, not failed. */
  text: Schema.Option(Schema.String),
  /** The verse's words with their Strong's numbers: the tap targets for the
   *  `v1.study.strongs.get` path. */
  words: Schema.Array(StudyWord),
  crossRefs: Schema.Array(StudyCrossReference),
  marginNotes: Schema.Array(StudyMarginNote),
  commentary: Schema.Array(StudyCommentaryEntry),
  /** EGW and pioneer paragraphs citing this verse, minus the Bible Commentary
   *  volumes that `commentary` already carries. Capped — a well-covered verse
   *  reaches into the hundreds and the pane shows a list, not a corpus. */
  parallelWritings: Schema.Array(StudyParallelWriting),
  /** Every parallel writing before the cap, so the pane can offer "show all"
   *  without a second round trip to find out whether there is more. */
  parallelWritingsTotal: Schema.Int.check(Schema.isGreaterThanOrEqualTo(0)),
}) {}

/** The one wire encoding of a verse bundle, shared by the RPC success schema
 *  and the CLI's `--json`. Named for the same reason `WikiPageJson` is: so
 *  neither surface enumerates fields, and a field added to `VerseStudy` reaches
 *  both at once. */
export const VerseStudyJson = VerseStudy;
export type VerseStudyJson = typeof VerseStudyJson.Encoded;

/** The one wire encoding of a Strong's study, for the same reason. */
export const StrongsStudyJson = StrongsStudy;
export type StrongsStudyJson = typeof StrongsStudyJson.Encoded;

/** The default reverse-concordance cap.
 *
 *  A Strong's number like H8548 (*tamid*, "the daily") occurs 104 times and
 *  H430 (*elohim*) over 2,500; the pane shows a scannable list with a count and
 *  a handoff, not a concordance dump. 50 is the largest list that still renders
 *  in one pass on a narrow viewport, and `StrongsStudy.total` carries the real
 *  number so nothing is hidden. */
export const DEFAULT_CONCORDANCE_LIMIT = 50;

/** The default parallel-writings cap, for the same reason: Dan 7:25 alone has
 *  431 rows in `paragraph_bible_refs`. */
export const DEFAULT_PARALLEL_WRITINGS_LIMIT = 25;
