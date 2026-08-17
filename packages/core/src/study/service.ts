/** The study-pane service (§8.1).
 *
 *  One portable service composing methods that already exist:
 *
 *  | Bundle field     | Backing call                                        |
 *  | ---------------- | --------------------------------------------------- |
 *  | words            | `BibleDatabase.getVerseWords`                       |
 *  | crossRefs        | `BibleDatabase.getCrossRefs`                        |
 *  | marginNotes      | `BibleDatabase.getMarginNotes`                      |
 *  | commentary       | `EGWCommentaryService.getCommentary`, BC volumes    |
 *  | parallelWritings | the same reverse lookup, everything else            |
 *
 *  and, for the word-tap path, `getStrongsEntry`, `getVersesWithStrongs` and
 *  `getStrongsCount`.
 *
 *  No new SQL. Every read is a call the three hosts already had and none of
 *  them exposed — §8's opening observation is that the data layer was finished
 *  and the seam was missing, and this module is only that seam.
 */

import { Context, Effect, Layer, Option, Schema } from 'effect';

import { getBibleBook } from '../bible/canon.js';
import { Reference, VerseReference, type BookNumber } from '../bible/model.js';
import {
  BibleDatabase,
  type BibleDatabaseError,
  type BibleDatabaseService,
  type ConcordanceHit,
  type CrossReference,
  type MarginNote,
  type StrongsEntry,
  type VerseWord,
} from '../bible-db/bible-database.js';
import { EGWCommentaryService, type EGWCommentaryServiceApi } from '../egw-commentary/service.js';
import type { CommentaryEntry } from '../egw-commentary/types.js';
import { EGW_SCOPE_AUTHORS } from '../writings/corpus-scope.js';
import {
  ConcordanceEntry,
  DEFAULT_CONCORDANCE_LIMIT,
  DEFAULT_PARALLEL_WRITINGS_LIMIT,
  StrongsLexiconEntry,
  StrongsNumber,
  StrongsStudy,
  StudyCommentaryEntry,
  StudyCrossReference,
  StudyMarginNote,
  StudyParallelWriting,
  StudyWord,
  VerseStudy,
} from './model.js';

/** A study lookup failed against a corpus that is present.
 *
 *  A closed error rather than the union of `BibleDatabaseError` and
 *  `CommentaryServiceError`, because this value is destined for the wire:
 *  `SqlError` carries a driver object with no stable encoding, and a client
 *  across an RPC boundary can only ever display the message. `source` says
 *  which corpus refused so an operator can tell a broken `bible.db` apart from
 *  a broken writings library without reading the message.
 *
 *  Note what is *not* an error here: an absent verse, an absent lexicon entry,
 *  and every empty list. §8.4's sparseness makes emptiness the common case, and
 *  a pane that failed whenever a verse had no margin notes would fail on most
 *  verses. */
export const StudySourceName = Schema.Literals(['bible', 'writings']);
export type StudySourceName = typeof StudySourceName.Type;

export class StudyUnavailableError extends Schema.TaggedError<StudyUnavailableError>()(
  'StudyUnavailableError',
  {
    operation: Schema.NonEmptyString,
    source: StudySourceName,
    message: Schema.String,
  },
) {}

/** A row the corpus holds that the wire model refuses.
 *
 *  The second member of the closed union, and a *different* category from
 *  `StudyUnavailableError`: that one says a corpus refused to answer, this one
 *  says a corpus answered with a row that is not the shape its own columns
 *  promise — a blank refcode where `NonEmptyString` is declared, a `note_type`
 *  outside `MarginNoteKind`.
 *
 *  It is a failure rather than a dropped row because the two are
 *  indistinguishable to a reader otherwise. §8.4 makes an *empty* section the
 *  common case, so a section quietly one item shorter than its own total reads
 *  exactly like sparseness and hides a corpus defect behind the very posture
 *  that legitimises emptiness. Sparse data still yields an empty list; only
 *  malformed data fails.
 *
 *  `row` names the offending row so an operator can find it: the section it
 *  came from and the row's own identity, which for every one of these sources
 *  is a refcode, a reference label, or an index. */
export class StudyCorpusDataError extends Schema.TaggedError<StudyCorpusDataError>()(
  'StudyCorpusDataError',
  {
    operation: Schema.NonEmptyString,
    source: StudySourceName,
    /** The offending row's identity, as the corpus names it. */
    row: Schema.NonEmptyString,
    message: Schema.String,
  },
) {}

export type StudyError = StudyUnavailableError | StudyCorpusDataError;

export interface StudyVerseOptions {
  /** How many parallel writings to carry. Defaults to
   *  `DEFAULT_PARALLEL_WRITINGS_LIMIT`. */
  readonly parallelWritingsLimit?: number;
}

export interface StudyStrongsOptions {
  /** How many concordance occurrences to carry. Defaults to
   *  `DEFAULT_CONCORDANCE_LIMIT`. */
  readonly limit?: number;
}

export interface StudyServiceApi {
  /** The whole bundle for one verse, in one call (§8.2). Every section the pane
   *  draws comes back together because the pane always wants all of it — the
   *  hosts turn this into exactly one MessagePort round trip. */
  readonly verse: (
    reference: VerseReference,
    options?: StudyVerseOptions,
  ) => Effect.Effect<VerseStudy, StudyError>;
  /** The word-tap payload: lexicon entry plus reverse concordance. */
  readonly strongs: (
    number: StrongsNumber,
    options?: StudyStrongsOptions,
  ) => Effect.Effect<StrongsStudy, StudyError>;
}

// ---------------------------------------------------------------------------
// The commentary / parallel-writings partition (§8.1, §8.4)
// ---------------------------------------------------------------------------

/** The EGW Bible Commentary volumes, by their `books.book_code`.
 *
 *  Resolved from the corpus rather than guessed: in the 2026-08-14 snapshot
 *  these eight codes are exactly the books authored by `'Ellen Gould White'`
 *  whose title reads "EGW SDA Bible Commentary" — 1BC through 7BC plus the 7A
 *  supplement. `BCL` ("Battle Creek Letters") also matches a naive `%BC%`
 *  pattern and is *not* commentary, which is why this is an explicit set rather
 *  than a substring test.
 *
 *  The partition matters because `EGWCommentaryService.getCommentary` is
 *  unfiltered despite its name: it reads `paragraph_bible_refs` for every book
 *  in the library, so Dan 8:13 comes back with 46 books' worth of rows — Matthew
 *  Henry, Strong's concordance, the Review and Herald — of which zero are
 *  commentary volumes. §8.1 lists `commentary` and `parallelWritings` as two
 *  bundle fields, so the split has to happen somewhere, and doing it here keeps
 *  `EGWCommentaryService`'s existing callers (the §6.1 composer) untouched. */
const COMMENTARY_BOOK_CODES: ReadonlySet<string> = new Set([
  '1BC',
  '2BC',
  '3BC',
  '4BC',
  '5BC',
  '6BC',
  '7BC',
  '7ABC',
]);

const isCommentaryVolume = (entry: CommentaryEntry): boolean =>
  COMMENTARY_BOOK_CODES.has(entry.bookCode);

/** Whether a reverse-lookup row belongs to the parallel-**EGW** scope (§8.4).
 *
 *  The commentary/parallel split alone is not the partition the spec asks for.
 *  `getCommentary` reads `paragraph_bible_refs` across the whole library, so
 *  "everything that is not a BC volume" is not "the parallel EGW writings" —
 *  on the live corpus Dan 7:25 answers with 431 rows, 4 of them BC, and only 10
 *  of the remaining 427 are White-Estate published. The other 417 are Matthew
 *  Henry, Strong's concordance and modern secondary works: real citations of
 *  the verse, and not what a section headed "parallel EGW" means.
 *
 *  The scope is `EGW_SCOPE_AUTHORS` rather than a second list, because §6.4
 *  already resolved that exact question against this exact `books.book_author`
 *  column for the wiki's section 2. Two spellings of "the EGW half of the
 *  corpus" would be two things to keep in step; this is one. */
const isEgwScope = (entry: CommentaryEntry): boolean =>
  EGW_SCOPE_AUTHORS.includes(entry.bookAuthor);

// ---------------------------------------------------------------------------
// Failures
// ---------------------------------------------------------------------------

const unavailable =
  (operation: string, source: StudySourceName) =>
  (cause: { readonly message: string }): StudyUnavailableError =>
    StudyUnavailableError.make({ operation, source, message: cause.message });

// ---------------------------------------------------------------------------
// Row → wire
// ---------------------------------------------------------------------------

/** How a reference reads, from the canon rather than from a stored string.
 *  `getBibleBook` is total over the 66 book numbers `BookNumber` admits, and the
 *  branded type is what makes the fallback unreachable rather than a guess. */
const bookName = (book: BookNumber): string =>
  Option.match(getBibleBook(book), {
    onNone: () => String(book),
    onSome: (found) => found.name,
  });

const verseLabel = (reference: VerseReference): string =>
  `${bookName(reference.book)} ${String(reference.chapter)}:${String(reference.verse)}`;

/** A cross-reference target's label. Three shapes, because `cross_refs` stores
 *  three: a single verse, a verse range, and a whole chapter. */
const crossRefLabel = (row: CrossReference): string => {
  const base = `${bookName(Reference.verse(row.book, row.chapter, 1).book)} ${String(row.chapter)}`;
  return Option.match(row.verse, {
    onNone: () => base,
    onSome: (verse) =>
      Option.match(row.verseEnd, {
        onNone: () => `${base}:${String(verse)}`,
        onSome: (end) => `${base}:${String(verse)}-${String(end)}`,
      }),
  });
};

const decodeStrongs = Schema.decodeOption(StrongsNumber);

/** A verse word's Strong's numbers, keeping only the ones that are actually
 *  Strong's numbers. `verse_words.strongs_numbers` is a JSON array the corpus
 *  builder writes, and a handful of KJV+Strong's rows carry a lexeme-variant
 *  token (`H1234a`) the lexicon has no row for. Dropping those is right: the
 *  field's contract is "the tap targets", and a token with no lexicon entry is
 *  not one. */
const wordStrongs = (word: VerseWord): readonly StrongsNumber[] =>
  word.strongsNumbers.flatMap((raw) =>
    Option.match(decodeStrongs(raw), {
      onNone: (): readonly StrongsNumber[] => [],
      onSome: (number) => [number],
    }),
  );

const studyWord = (word: VerseWord): StudyWord =>
  StudyWord.make({ text: word.text, strongs: wordStrongs(word), italic: word.italic });

// ---------------------------------------------------------------------------
// Decoding corpus rows (§8.4)
// ---------------------------------------------------------------------------

/** Decodes one corpus row, failing with the row's identity when it will not.
 *
 *  The failure is the point. Every schema here narrows a column the corpus
 *  already types — a `NonEmptyString` refcode against a blank cell, a
 *  `MarginNoteKind` against an unexpected `note_type` — so a row that does not
 *  decode is a corpus defect, not a variation. Dropping it silently makes a
 *  section shorter than the total printed beside it, which under §8.4's
 *  sparseness posture is indistinguishable from the verse simply having fewer
 *  citations: the one signal that would tell an operator the artifact is broken
 *  is the one a drop removes.
 *
 *  `row` is the identity the corpus itself uses — a refcode, a reference label,
 *  an index — so the failure names something an operator can go look up. */
const decodeRow =
  <A, I>(schema: Schema.Codec<A, I>, operation: string, source: StudySourceName) =>
  (input: I, row: string): Effect.Effect<A, StudyCorpusDataError> =>
    Schema.decodeEffect(schema)(input).pipe(
      Effect.mapError((issue) =>
        StudyCorpusDataError.make({ operation, source, row, message: issue.message }),
      ),
    );

const decodeCrossReference = decodeRow(StudyCrossReference, 'verse.crossRefs', 'bible');
const decodeMarginNote = decodeRow(StudyMarginNote, 'verse.marginNotes', 'bible');
const decodeCommentary = decodeRow(StudyCommentaryEntry, 'verse.commentary', 'writings');
const decodeParallel = decodeRow(StudyParallelWriting, 'verse.parallelWritings', 'writings');
const decodeConcordance = decodeRow(ConcordanceEntry, 'strongs.occurrences', 'bible');
const decodeLexicon = decodeRow(StrongsLexiconEntry, 'strongs.entry', 'bible');

const studyCrossReference = (
  row: CrossReference,
): Effect.Effect<StudyCrossReference, StudyCorpusDataError> => {
  const label = crossRefLabel(row);
  return decodeCrossReference(
    {
      book: row.book,
      chapter: row.chapter,
      verse: row.verse,
      verseEnd: row.verseEnd,
      label,
      source: row.source,
      preview: row.previewText,
    },
    label,
  );
};

const studyMarginNote = (note: MarginNote): Effect.Effect<StudyMarginNote, StudyCorpusDataError> =>
  decodeMarginNote(
    { index: note.index, kind: note.type, phrase: note.phrase, text: note.text },
    `note ${String(note.index)}`,
  );

const studyCommentary = (
  entry: CommentaryEntry,
): Effect.Effect<StudyCommentaryEntry, StudyCorpusDataError> =>
  decodeCommentary(
    {
      refcode: entry.refcode,
      bookCode: entry.bookCode,
      bookTitle: entry.bookTitle,
      content: entry.content,
    },
    // A blank refcode is itself one of the defects this catches, so the book
    // code backs it: an identity that is empty names nothing.
    `${entry.bookCode} ${entry.refcode}`,
  );

const studyParallel = (
  entry: CommentaryEntry,
): Effect.Effect<StudyParallelWriting, StudyCorpusDataError> =>
  decodeParallel(
    {
      refcode: entry.refcode,
      bookCode: entry.bookCode,
      bookTitle: entry.bookTitle,
      content: entry.content,
    },
    `${entry.bookCode} ${entry.refcode}`,
  );

const concordanceEntry = (
  hit: ConcordanceHit,
): Effect.Effect<ConcordanceEntry, StudyCorpusDataError> => {
  const row = `${hit.bookName} ${String(hit.chapter)}:${String(hit.verse)}`;
  return decodeRow(
    VerseReference,
    'strongs.occurrences',
    'bible',
  )({ _tag: 'verse', book: hit.book, chapter: hit.chapter, verse: hit.verse }, row).pipe(
    Effect.flatMap((decoded) =>
      decodeConcordance(
        { reference: decoded, label: verseLabel(decoded), text: hit.text, word: hit.word },
        row,
      ),
    ),
  );
};

const lexiconEntry = (
  entry: StrongsEntry,
): Effect.Effect<StrongsLexiconEntry, StudyCorpusDataError> =>
  decodeLexicon(
    {
      number: entry.number,
      language: entry.language,
      lemma: entry.lemma,
      transliteration: entry.transliteration,
      pronunciation: entry.pronunciation,
      definition: entry.definition,
      kjvDefinition: entry.kjvDefinition,
    },
    entry.number,
  );

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

const makeVerse =
  (bible: BibleDatabaseService, commentary: EGWCommentaryServiceApi) =>
  (
    reference: VerseReference,
    options?: StudyVerseOptions,
  ): Effect.Effect<VerseStudy, StudyError> => {
    const parallelLimit = options?.parallelWritingsLimit ?? DEFAULT_PARALLEL_WRITINGS_LIMIT;
    const fromBible = <A>(
      operation: string,
      effect: Effect.Effect<A, BibleDatabaseError>,
    ): Effect.Effect<A, StudyError> =>
      effect.pipe(Effect.mapError(unavailable(operation, 'bible')));

    return Effect.gen(function* () {
      // Every source at once. The pane wants all five, and the four Bible reads
      // hit one already-open SQLite connection while the fifth hits another —
      // so concurrency here is the difference between five sequential awaits
      // and one, inside the single round trip §8.2 promises.
      const [verse, words, crossRefs, marginNotes, refs] = yield* Effect.all(
        [
          fromBible(
            'verse.text',
            bible.getVerse(reference.book, reference.chapter, reference.verse),
          ),
          fromBible(
            'verse.words',
            bible.getVerseWords(reference.book, reference.chapter, reference.verse),
          ),
          fromBible(
            'verse.crossRefs',
            bible.getCrossRefs(reference.book, reference.chapter, reference.verse),
          ),
          fromBible(
            'verse.marginNotes',
            bible.getMarginNotes(reference.book, reference.chapter, reference.verse),
          ),
          // The one reverse lookup that backs both `commentary` and
          // `parallelWritings`: they are two views of one `paragraph_bible_refs`
          // read, split below by book code, rather than two queries.
          commentary
            .getCommentary(reference)
            .pipe(Effect.mapError(unavailable('verse.commentary', 'writings'))),
        ],
        { concurrency: 'unbounded' },
      );

      const commentaryEntries = refs.entries.filter(isCommentaryVolume);
      // Two filters, in this order, because they answer different questions:
      // the first removes the volumes `commentary` already carries, the second
      // keeps only the White-Estate half of what remains (§8.4). The order does
      // not matter to the result — no BC volume is outside the EGW scope — but
      // stating the exclusion first keeps this readable as "the parallel
      // writings are the EGW rows that are not already above".
      const parallelEntries = refs.entries
        .filter((entry) => !isCommentaryVolume(entry))
        .filter(isEgwScope);

      // Decoded before the cap for `commentary` and after it for
      // `parallelWritings`, matching where each list is truncated: a malformed
      // row the pane never renders is not a failure the reader should see, and
      // `parallelWritingsTotal` counts rows, not decodes.
      const [crossReferences, notes, commentaryDecoded, parallelDecoded] = yield* Effect.all([
        Effect.forEach(crossRefs, studyCrossReference),
        Effect.forEach(marginNotes, studyMarginNote),
        Effect.forEach(commentaryEntries, studyCommentary),
        Effect.forEach(parallelEntries.slice(0, parallelLimit), studyParallel),
      ]);

      return VerseStudy.make({
        reference,
        label: verseLabel(reference),
        text: Option.map(verse, (found) => found.text),
        words: words.map(studyWord),
        crossRefs: crossReferences,
        marginNotes: notes,
        commentary: commentaryDecoded,
        parallelWritings: parallelDecoded,
        // The post-scope, pre-cap count: the number a "show all" affordance
        // must promise, and the number of rows the pane *could* show.
        parallelWritingsTotal: parallelEntries.length,
      });
    });
  };

const makeStrongs =
  (bible: BibleDatabaseService) =>
  (
    number: StrongsNumber,
    options?: StudyStrongsOptions,
  ): Effect.Effect<StrongsStudy, StudyError> => {
    const limit = options?.limit ?? DEFAULT_CONCORDANCE_LIMIT;
    return Effect.gen(function* () {
      const [entry, hits, total] = yield* Effect.all(
        [
          bible.getStrongsEntry(number),
          // The limit reaches the query rather than being applied after: a
          // number like H430 has 2,500+ occurrences and materializing them to
          // throw all but 50 away is work no caller asked for.
          bible.getVersesWithStrongs(number, limit),
          bible.getStrongsCount(number),
        ],
        { concurrency: 'unbounded' },
      ).pipe(Effect.mapError(unavailable('strongs', 'bible')));

      const [decodedEntry, occurrences] = yield* Effect.all([
        Option.match(entry, {
          onNone: () => Effect.succeedNone,
          onSome: (found) => Effect.asSome(lexiconEntry(found)),
        }),
        Effect.forEach(hits, concordanceEntry),
      ]);

      return StrongsStudy.make({ number, entry: decodedEntry, occurrences, total, limit });
    });
  };

export class StudyService extends Context.Service<StudyService, StudyServiceApi>()(
  '@bible/core/study/StudyService',
) {
  /** Backed by the two corpora that already hold this data: `bible.db` through
   *  `BibleDatabase`, and the writings library through `EGWCommentaryService`.
   *
   *  Both are required. A host with no writings library has a legitimate answer
   *  — `EGWCommentaryService.Test({})`, which reports no entries — but it has to
   *  say so at the composition site rather than silently omit two of the five
   *  sections. */
  static Live: Layer.Layer<StudyService, never, BibleDatabase | EGWCommentaryService> =
    Layer.effect(
      StudyService,
      Effect.gen(function* () {
        const bible = yield* BibleDatabase;
        const commentary = yield* EGWCommentaryService;
        return StudyService.of({
          verse: Effect.fn('StudyService.verse')(makeVerse(bible, commentary)),
          strongs: Effect.fn('StudyService.strongs')(makeStrongs(bible)),
        });
      }),
    );
}
