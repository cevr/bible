import { Effect, Layer, Context } from 'effect';
import { BIBLE_BOOK_ALIASES, getBibleBook } from '@bible/core/bible-reader';
import { DbClientService } from '../db-client-service';
import type { DatabaseQueryError } from '../errors';
import type {
  ClassifiedCrossReference,
  CollectionVerse,
  ConcordanceResult,
  CrossRefType,
  EGWCommentaryEntry,
  EGWContextParagraph,
  EgwMarker,
  EgwNote,
  MarginNote,
  MarkerColor,
  StrongsEntry,
  StudyCollection,
  UserCrossRef,
  VerseMarker,
  VerseNote,
  VerseWord,
} from './service';

interface CrossRefRow {
  ref_book: number;
  ref_chapter: number;
  ref_verse: number | null;
  ref_verse_end: number | null;
  source: string;
  preview_text: string | null;
}

interface ClassificationRow {
  ref_book: number;
  ref_chapter: number;
  ref_verse: number | null;
  type: string;
  confidence: number | null;
}

interface UserCrossRefRow {
  id: string;
  ref_book: number;
  ref_chapter: number;
  ref_verse: number | null;
  ref_verse_end: number | null;
  type: string | null;
  note: string | null;
  created_at: number;
}

interface StrongsRow {
  number: string;
  language: string;
  lemma: string;
  transliteration: string | null;
  pronunciation: string | null;
  definition: string;
  kjv_definition: string | null;
}

interface VerseWordRow {
  word_index: number;
  word_text: string;
  strongs_numbers: string | null;
}

interface MarginNoteRow {
  verse?: number;
  note_index: number;
  note_type: string;
  phrase: string;
  note_text: string;
}

interface ConcordanceRow {
  book: number;
  chapter: number;
  verse: number;
  word_text: string | null;
}

interface CollectionRow {
  id: string;
  name: string;
  description: string | null;
  color: string | null;
  created_at: number;
}

interface CollectionVerseRow {
  collection_id: string;
  book: number;
  chapter: number;
  verse: number;
  added_at: number;
}

interface EGWCommentaryRow {
  refcode_short: string;
  book_code: string;
  book_title: string;
  content_text: string;
  puborder: number;
}

interface EGWContextRow {
  refcode_short: string;
  book_code: string;
  content_text: string;
  puborder: number;
}

interface VerseMarkerRow {
  id: string;
  book: number;
  chapter: number;
  verse: number;
  color: string;
  created_at: number;
}

interface VerseNoteRow {
  id: string;
  book: number;
  chapter: number;
  verse: number;
  content: string;
  created_at: number;
}

function classificationKey(book: number, chapter: number, verse: number | null): string {
  return `${book}:${chapter}:${verse ?? 0}`;
}

interface WebStudyDataServiceShape {
  readonly getCrossRefs: (
    book: number,
    chapter: number,
    verse: number,
  ) => Effect.Effect<ClassifiedCrossReference[], DatabaseQueryError>;

  readonly getStrongsEntry: (
    number: string,
  ) => Effect.Effect<StrongsEntry | null, DatabaseQueryError>;

  readonly getVerseWords: (
    book: number,
    chapter: number,
    verse: number,
  ) => Effect.Effect<VerseWord[], DatabaseQueryError>;

  readonly getMarginNotes: (
    book: number,
    chapter: number,
    verse: number,
  ) => Effect.Effect<MarginNote[], DatabaseQueryError>;

  readonly getChapterMarginNotes: (
    book: number,
    chapter: number,
  ) => Effect.Effect<Map<number, MarginNote[]>, DatabaseQueryError>;

  readonly searchByStrongs: (
    number: string,
  ) => Effect.Effect<ConcordanceResult[], DatabaseQueryError>;

  readonly setRefType: (
    source: { book: number; chapter: number; verse: number },
    target: { book: number; chapter: number; verse: number | null },
    type: CrossRefType,
  ) => Effect.Effect<void, DatabaseQueryError>;

  readonly addUserCrossRef: (
    source: { book: number; chapter: number; verse: number },
    target: { book: number; chapter: number; verse?: number; verseEnd?: number },
    opts?: { type?: CrossRefType; note?: string },
  ) => Effect.Effect<UserCrossRef, DatabaseQueryError>;

  readonly removeUserCrossRef: (id: string) => Effect.Effect<void, DatabaseQueryError>;

  readonly getChapterMarkers: (
    book: number,
    chapter: number,
  ) => Effect.Effect<Map<number, VerseMarker[]>, DatabaseQueryError>;

  readonly addVerseMarker: (
    book: number,
    chapter: number,
    verse: number,
    color: MarkerColor,
  ) => Effect.Effect<VerseMarker, DatabaseQueryError>;

  readonly removeVerseMarker: (id: string) => Effect.Effect<void, DatabaseQueryError>;

  readonly getVerseNotes: (
    book: number,
    chapter: number,
    verse: number,
  ) => Effect.Effect<VerseNote[], DatabaseQueryError>;

  readonly addVerseNote: (
    book: number,
    chapter: number,
    verse: number,
    content: string,
  ) => Effect.Effect<VerseNote, DatabaseQueryError>;

  readonly removeVerseNote: (id: string) => Effect.Effect<void, DatabaseQueryError>;

  readonly getEgwCommentary: (
    book: number,
    chapter: number,
    verse: number,
  ) => Effect.Effect<EGWCommentaryEntry[], DatabaseQueryError>;

  readonly getEgwChapterIndex: (
    bookCode: string,
    puborder: number,
  ) => Effect.Effect<number, DatabaseQueryError>;

  readonly getEgwParagraphContext: (
    bookCode: string,
    puborder: number,
    radius: number,
  ) => Effect.Effect<EGWContextParagraph[], DatabaseQueryError>;

  readonly getCollections: () => Effect.Effect<StudyCollection[], DatabaseQueryError>;

  readonly createCollection: (
    name: string,
    opts?: { description?: string; color?: string },
  ) => Effect.Effect<StudyCollection, DatabaseQueryError>;

  readonly removeCollection: (id: string) => Effect.Effect<void, DatabaseQueryError>;

  readonly getVerseCollections: (
    book: number,
    chapter: number,
    verse: number,
  ) => Effect.Effect<StudyCollection[], DatabaseQueryError>;

  readonly addVerseToCollection: (
    collectionId: string,
    book: number,
    chapter: number,
    verse: number,
  ) => Effect.Effect<void, DatabaseQueryError>;

  readonly removeVerseFromCollection: (
    collectionId: string,
    book: number,
    chapter: number,
    verse: number,
  ) => Effect.Effect<void, DatabaseQueryError>;

  readonly getCollectionVerses: (
    collectionId: string,
  ) => Effect.Effect<CollectionVerse[], DatabaseQueryError>;

  // EGW Annotations
  readonly getEgwNotes: (
    bookCode: string,
    puborder: number,
  ) => Effect.Effect<EgwNote[], DatabaseQueryError>;

  readonly addEgwNote: (
    bookCode: string,
    puborder: number,
    content: string,
  ) => Effect.Effect<EgwNote, DatabaseQueryError>;

  readonly removeEgwNote: (id: string) => Effect.Effect<void, DatabaseQueryError>;

  readonly getEgwChapterMarkers: (
    bookCode: string,
    startPuborder: number,
    endPuborder: number,
  ) => Effect.Effect<Map<number, EgwMarker[]>, DatabaseQueryError>;

  readonly addEgwMarker: (
    bookCode: string,
    puborder: number,
    color: MarkerColor,
  ) => Effect.Effect<EgwMarker, DatabaseQueryError>;

  readonly removeEgwMarker: (id: string) => Effect.Effect<void, DatabaseQueryError>;

  readonly getEgwParagraphCollections: (
    bookCode: string,
    puborder: number,
  ) => Effect.Effect<StudyCollection[], DatabaseQueryError>;

  readonly addEgwToCollection: (
    collectionId: string,
    bookCode: string,
    puborder: number,
  ) => Effect.Effect<void, DatabaseQueryError>;

  readonly removeEgwFromCollection: (
    collectionId: string,
    bookCode: string,
    puborder: number,
  ) => Effect.Effect<void, DatabaseQueryError>;
}

export class WebStudyDataService extends Context.Service<
  WebStudyDataService,
  WebStudyDataServiceShape
>()('@bible-web/StudyData') {
  static Live = Layer.effect(
    WebStudyDataService,
    Effect.gen(function* () {
      const db = yield* DbClientService;

      const getCrossRefs = Effect.fn('WebStudyDataService.getCrossRefs')(function* (
        book: number,
        chapter: number,
        verse: number,
      ) {
        // Parallelize: rawRefs, classifications, and userRefs are independent
        const [rawRefs, classifications, userRefs] = yield* Effect.all(
          [
            db.query<CrossRefRow>(
              'bible',
              `SELECT ref_book, ref_chapter, ref_verse, ref_verse_end, source, preview_text
               FROM cross_refs
               WHERE book = ? AND chapter = ? AND verse = ?`,
              [book, chapter, verse],
            ),
            db.query<ClassificationRow>(
              'state',
              `SELECT ref_book, ref_chapter, ref_verse, type, confidence
               FROM cross_ref_classifications
               WHERE source_book = ? AND source_chapter = ? AND source_verse = ?`,
              [book, chapter, verse],
            ),
            db.query<UserCrossRefRow>(
              'state',
              `SELECT id, ref_book, ref_chapter, ref_verse, ref_verse_end, type, note, created_at
               FROM user_cross_refs
               WHERE source_book = ? AND source_chapter = ? AND source_verse = ?`,
              [book, chapter, verse],
            ),
          ],
          { concurrency: 'unbounded' },
        );

        const classMap = new Map<string, ClassificationRow>();
        for (const c of classifications) {
          classMap.set(classificationKey(c.ref_book, c.ref_chapter, c.ref_verse), c);
        }

        const enriched: ClassifiedCrossReference[] = rawRefs.map((r) => {
          const key = classificationKey(r.ref_book, r.ref_chapter, r.ref_verse);
          const cls = classMap.get(key);
          return {
            book: r.ref_book,
            chapter: r.ref_chapter,
            verse: r.ref_verse,
            verseEnd: r.ref_verse_end,
            source: r.source as 'openbible' | 'tske',
            previewText: r.preview_text,
            classification: (cls?.type as CrossRefType) ?? null,
            confidence: cls?.confidence ?? null,
          };
        });

        for (const u of userRefs) {
          enriched.push({
            book: u.ref_book,
            chapter: u.ref_chapter,
            verse: u.ref_verse,
            verseEnd: u.ref_verse_end,
            source: 'user',
            previewText: null,
            classification: (u.type as CrossRefType) ?? null,
            confidence: null,
            userRefId: u.id,
            userNote: u.note,
          });
        }

        return enriched;
      });

      const getStrongsEntry = Effect.fn('WebStudyDataService.getStrongsEntry')(function* (
        num: string,
      ) {
        const rows = yield* db.query<StrongsRow>(
          'bible',
          'SELECT number, language, lemma, transliteration, pronunciation, definition, kjv_definition FROM strongs WHERE number = ?',
          [num],
        );
        const r = rows[0];
        if (!r) return null;
        return {
          number: r.number,
          language: r.language as 'hebrew' | 'greek',
          lemma: r.lemma,
          transliteration: r.transliteration,
          pronunciation: r.pronunciation,
          definition: r.definition,
          kjvDefinition: r.kjv_definition,
        } satisfies StrongsEntry;
      });

      const getVerseWords = Effect.fn('WebStudyDataService.getVerseWords')(function* (
        book: number,
        chapter: number,
        verse: number,
      ) {
        const rows = yield* db.query<VerseWordRow>(
          'bible',
          'SELECT word_index, word_text, strongs_numbers FROM verse_words WHERE book = ? AND chapter = ? AND verse = ? ORDER BY word_index',
          [book, chapter, verse],
        );
        return rows.map((r): VerseWord => {
          let strongsNumbers: string[] | null = null;
          if (r.strongs_numbers) {
            try {
              strongsNumbers = JSON.parse(r.strongs_numbers);
            } catch {
              // Malformed JSON — skip rather than crash
              strongsNumbers = null;
            }
          }
          return {
            wordIndex: r.word_index,
            wordText: r.word_text,
            strongsNumbers,
          };
        });
      });

      const getMarginNotes = Effect.fn('WebStudyDataService.getMarginNotes')(function* (
        book: number,
        chapter: number,
        verse: number,
      ) {
        const rows = yield* db.query<MarginNoteRow>(
          'bible',
          'SELECT note_index, note_type, phrase, note_text FROM margin_notes WHERE book = ? AND chapter = ? AND verse = ? ORDER BY note_index',
          [book, chapter, verse],
        );
        return rows.map(
          (r): MarginNote => ({
            noteIndex: r.note_index,
            noteType: r.note_type,
            phrase: r.phrase,
            noteText: r.note_text,
          }),
        );
      });

      const getChapterMarginNotes = Effect.fn('WebStudyDataService.getChapterMarginNotes')(
        function* (book: number, chapter: number) {
          const rows = yield* db.query<MarginNoteRow>(
            'bible',
            'SELECT verse, note_index, note_type, phrase, note_text FROM margin_notes WHERE book = ? AND chapter = ? ORDER BY verse, note_index',
            [book, chapter],
          );
          const map = new Map<number, MarginNote[]>();
          for (const r of rows) {
            const v = r.verse ?? 0;
            let arr = map.get(v);
            if (!arr) {
              arr = [];
              map.set(v, arr);
            }
            arr.push({
              noteIndex: r.note_index,
              noteType: r.note_type,
              phrase: r.phrase,
              noteText: r.note_text,
            });
          }
          return map;
        },
      );

      const searchByStrongs = Effect.fn('WebStudyDataService.searchByStrongs')(function* (
        num: string,
      ) {
        const rows = yield* db.query<ConcordanceRow>(
          'bible',
          'SELECT book, chapter, verse, word_text FROM strongs_verses WHERE strongs_number = ? ORDER BY book, chapter, verse',
          [num],
        );
        return rows.map(
          (r): ConcordanceResult => ({
            book: r.book,
            chapter: r.chapter,
            verse: r.verse,
            wordText: r.word_text,
          }),
        );
      });

      const setRefType = Effect.fn('WebStudyDataService.setRefType')(function* (
        source: { book: number; chapter: number; verse: number },
        target: { book: number; chapter: number; verse: number | null },
        type: CrossRefType,
      ) {
        yield* db.exec(
          `INSERT INTO cross_ref_classifications
             (source_book, source_chapter, source_verse, ref_book, ref_chapter, ref_verse, type, confidence, classified_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, NULL, ?)
           ON CONFLICT(source_book, source_chapter, source_verse, ref_book, ref_chapter, ref_verse)
           DO UPDATE SET type = excluded.type, classified_at = excluded.classified_at`,
          [
            source.book,
            source.chapter,
            source.verse,
            target.book,
            target.chapter,
            target.verse ?? 0,
            type,
            Date.now(),
          ],
        );
      });

      const addUserCrossRef = Effect.fn('WebStudyDataService.addUserCrossRef')(function* (
        source: { book: number; chapter: number; verse: number },
        target: { book: number; chapter: number; verse?: number; verseEnd?: number },
        opts?: { type?: CrossRefType; note?: string },
      ) {
        const id = crypto.randomUUID();
        const createdAt = Date.now();
        yield* db.exec(
          `INSERT INTO user_cross_refs
             (id, source_book, source_chapter, source_verse, ref_book, ref_chapter, ref_verse, ref_verse_end, type, note, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            id,
            source.book,
            source.chapter,
            source.verse,
            target.book,
            target.chapter,
            target.verse ?? null,
            target.verseEnd ?? null,
            opts?.type ?? null,
            opts?.note ?? null,
            createdAt,
          ],
        );
        return {
          id,
          refBook: target.book,
          refChapter: target.chapter,
          refVerse: target.verse ?? null,
          refVerseEnd: target.verseEnd ?? null,
          type: opts?.type ?? null,
          note: opts?.note ?? null,
          createdAt,
        } satisfies UserCrossRef;
      });

      const removeUserCrossRef = Effect.fn('WebStudyDataService.removeUserCrossRef')(function* (
        id: string,
      ) {
        yield* db.exec('DELETE FROM user_cross_refs WHERE id = ?', [id]);
      });

      const getChapterMarkers = Effect.fn('WebStudyDataService.getChapterMarkers')(function* (
        book: number,
        chapter: number,
      ) {
        const rows = yield* db.query<VerseMarkerRow>(
          'state',
          'SELECT id, book, chapter, verse, color, created_at FROM verse_markers WHERE book = ? AND chapter = ? ORDER BY verse, created_at ASC',
          [book, chapter],
        );
        const map = new Map<number, VerseMarker[]>();
        for (const r of rows) {
          let arr = map.get(r.verse);
          if (!arr) {
            arr = [];
            map.set(r.verse, arr);
          }
          arr.push({
            id: r.id,
            book: r.book,
            chapter: r.chapter,
            verse: r.verse,
            color: r.color as MarkerColor,
            createdAt: r.created_at,
          });
        }
        return map;
      });

      const addVerseMarker = Effect.fn('WebStudyDataService.addVerseMarker')(function* (
        book: number,
        chapter: number,
        verse: number,
        color: MarkerColor,
      ) {
        const id = crypto.randomUUID();
        const createdAt = Date.now();
        yield* db.exec(
          'INSERT OR IGNORE INTO verse_markers (id, book, chapter, verse, color, created_at) VALUES (?, ?, ?, ?, ?, ?)',
          [id, book, chapter, verse, color, createdAt],
        );
        return { id, book, chapter, verse, color, createdAt } satisfies VerseMarker;
      });

      const removeVerseMarker = Effect.fn('WebStudyDataService.removeVerseMarker')(function* (
        id: string,
      ) {
        yield* db.exec('DELETE FROM verse_markers WHERE id = ?', [id]);
      });

      const getVerseNotes = Effect.fn('WebStudyDataService.getVerseNotes')(function* (
        book: number,
        chapter: number,
        verse: number,
      ) {
        const rows = yield* db.query<VerseNoteRow>(
          'state',
          'SELECT id, book, chapter, verse, content, created_at FROM verse_notes WHERE book = ? AND chapter = ? AND verse = ? ORDER BY created_at ASC',
          [book, chapter, verse],
        );
        return rows.map(
          (r): VerseNote => ({
            id: r.id,
            book: r.book,
            chapter: r.chapter,
            verse: r.verse,
            content: r.content,
            createdAt: r.created_at,
          }),
        );
      });

      const addVerseNote = Effect.fn('WebStudyDataService.addVerseNote')(function* (
        book: number,
        chapter: number,
        verse: number,
        content: string,
      ) {
        const id = crypto.randomUUID();
        const createdAt = Date.now();
        yield* db.exec(
          'INSERT INTO verse_notes (id, book, chapter, verse, content, created_at) VALUES (?, ?, ?, ?, ?, ?)',
          [id, book, chapter, verse, content, createdAt],
        );
        return { id, book, chapter, verse, content, createdAt } satisfies VerseNote;
      });

      const removeVerseNote = Effect.fn('WebStudyDataService.removeVerseNote')(function* (
        id: string,
      ) {
        yield* db.exec('DELETE FROM verse_notes WHERE id = ?', [id]);
      });

      const getCollections = Effect.fn('WebStudyDataService.getCollections')(function* () {
        const rows = yield* db.query<CollectionRow>(
          'state',
          'SELECT id, name, description, color, created_at FROM collections ORDER BY created_at DESC',
        );
        return rows.map(
          (r): StudyCollection => ({
            id: r.id,
            name: r.name,
            description: r.description,
            color: r.color,
            createdAt: r.created_at,
          }),
        );
      });

      const createCollection = Effect.fn('WebStudyDataService.createCollection')(function* (
        name: string,
        opts?: { description?: string; color?: string },
      ) {
        const id = crypto.randomUUID();
        const createdAt = Date.now();
        yield* db.exec(
          'INSERT INTO collections (id, name, description, color, created_at) VALUES (?, ?, ?, ?, ?)',
          [id, name, opts?.description ?? null, opts?.color ?? null, createdAt],
        );
        return {
          id,
          name,
          description: opts?.description ?? null,
          color: opts?.color ?? null,
          createdAt,
        } satisfies StudyCollection;
      });

      const removeCollection = Effect.fn('WebStudyDataService.removeCollection')(function* (
        id: string,
      ) {
        yield* db.exec('DELETE FROM collections WHERE id = ?', [id]);
      });

      const getVerseCollections = Effect.fn('WebStudyDataService.getVerseCollections')(function* (
        book: number,
        chapter: number,
        verse: number,
      ) {
        const rows = yield* db.query<CollectionRow>(
          'state',
          `SELECT c.id, c.name, c.description, c.color, c.created_at
           FROM collections c
           JOIN collection_verses cv ON c.id = cv.collection_id
           WHERE cv.book = ? AND cv.chapter = ? AND cv.verse = ?
           ORDER BY c.name`,
          [book, chapter, verse],
        );
        return rows.map(
          (r): StudyCollection => ({
            id: r.id,
            name: r.name,
            description: r.description,
            color: r.color,
            createdAt: r.created_at,
          }),
        );
      });

      const addVerseToCollection = Effect.fn('WebStudyDataService.addVerseToCollection')(function* (
        collectionId: string,
        book: number,
        chapter: number,
        verse: number,
      ) {
        yield* db.exec(
          'INSERT OR IGNORE INTO collection_verses (collection_id, book, chapter, verse, added_at) VALUES (?, ?, ?, ?, ?)',
          [collectionId, book, chapter, verse, Date.now()],
        );
      });

      const removeVerseFromCollection = Effect.fn('WebStudyDataService.removeVerseFromCollection')(
        function* (collectionId: string, book: number, chapter: number, verse: number) {
          yield* db.exec(
            'DELETE FROM collection_verses WHERE collection_id = ? AND book = ? AND chapter = ? AND verse = ?',
            [collectionId, book, chapter, verse],
          );
        },
      );

      const getCollectionVerses = Effect.fn('WebStudyDataService.getCollectionVerses')(function* (
        collectionId: string,
      ) {
        const rows = yield* db.query<CollectionVerseRow>(
          'state',
          'SELECT collection_id, book, chapter, verse, added_at FROM collection_verses WHERE collection_id = ? ORDER BY added_at DESC',
          [collectionId],
        );
        return rows.map(
          (r): CollectionVerse => ({
            collectionId: r.collection_id,
            book: r.book,
            chapter: r.chapter,
            verse: r.verse,
            addedAt: r.added_at,
          }),
        );
      });

      const getEgwCommentary = Effect.fn('WebStudyDataService.getEgwCommentary')(function* (
        book: number,
        chapter: number,
        verse: number,
      ) {
        // Phase 1: Indexed results from paragraph_bible_refs
        const indexedRows = yield* db.query<EGWCommentaryRow>(
          'egw',
          `SELECT p.refcode_short, p.content_text, p.puborder, b.book_code, b.book_title
           FROM paragraphs p
           JOIN paragraph_bible_refs pbr ON p.book_id = pbr.para_book_id AND p.ref_code = pbr.para_ref_code
           JOIN books b ON p.book_id = b.book_id
           WHERE pbr.bible_book = ? AND pbr.bible_chapter = ? AND pbr.bible_verse = ?
           ORDER BY b.book_code, p.puborder`,
          [book, chapter, verse],
        );

        const indexed: EGWCommentaryEntry[] = indexedRows.map((r) => ({
          refcode: r.refcode_short,
          bookCode: r.book_code,
          bookTitle: r.book_title,
          content: r.content_text,
          puborder: r.puborder,
          source: 'indexed' as const,
        }));

        // Phase 2: FTS5 search for verse mentions in paragraph text
        const bookInfo = getBibleBook(book);
        if (!bookInfo) return indexed;

        // Build FTS5 query from book aliases: "ephesians 4 15" OR "eph 4 15"
        const seen = new Set<string>();
        const ftsTerms: string[] = [];
        for (const [alias, num] of Object.entries(BIBLE_BOOK_ALIASES)) {
          if (num === book && !seen.has(alias)) {
            seen.add(alias);
            // FTS5 phrase: "bookname chapter verse"
            ftsTerms.push(`"${alias} ${chapter} ${verse}"`);
          }
        }
        // Always include canonical name
        const canonical = bookInfo.name.toLowerCase();
        if (!seen.has(canonical)) {
          ftsTerms.push(`"${canonical} ${chapter} ${verse}"`);
        }

        const ftsQuery = ftsTerms.join(' OR ');

        const searchRows = yield* db.query<EGWCommentaryRow>(
          'egw',
          `SELECT p.refcode_short, p.content_text, p.puborder, b.book_code, b.book_title
           FROM paragraphs p
           JOIN paragraphs_fts fts ON p.rowid = fts.rowid
           JOIN books b ON p.book_id = b.book_id
           WHERE paragraphs_fts MATCH ?
           ORDER BY b.book_code, p.puborder
           LIMIT 50`,
          [ftsQuery],
        );

        // Deduplicate: exclude results already in indexed set
        const indexedKeys = new Set(indexed.map((r) => `${r.bookCode}:${r.puborder}`));
        const searchResults: EGWCommentaryEntry[] = [];
        for (const r of searchRows) {
          const key = `${r.book_code}:${r.puborder}`;
          if (!indexedKeys.has(key)) {
            searchResults.push({
              refcode: r.refcode_short,
              bookCode: r.book_code,
              bookTitle: r.book_title,
              content: r.content_text,
              puborder: r.puborder,
              source: 'search' as const,
            });
          }
        }

        return [...indexed, ...searchResults];
      });

      const getEgwChapterIndex = Effect.fn('WebStudyDataService.getEgwChapterIndex')(function* (
        bookCode: string,
        puborder: number,
      ) {
        const rows = yield* db.query<{ chapter_index: number }>(
          'egw',
          `SELECT COUNT(*) - 1 as chapter_index
           FROM paragraphs p
           JOIN books b ON p.book_id = b.book_id
           WHERE b.book_code = ? AND p.is_chapter_heading = 1 AND p.puborder <= ?`,
          [bookCode, puborder],
        );
        return rows[0]?.chapter_index ?? 0;
      });

      const getEgwParagraphContext = Effect.fn('WebStudyDataService.getEgwParagraphContext')(
        function* (bookCode: string, puborder: number, radius: number) {
          const rows = yield* db.query<EGWContextRow>(
            'egw',
            `SELECT p.refcode_short, p.content_text, p.puborder, b.book_code
             FROM paragraphs p
             JOIN books b ON p.book_id = b.book_id
             WHERE b.book_code = ? AND p.puborder BETWEEN ? AND ?
             ORDER BY p.puborder`,
            [bookCode, puborder - radius, puborder + radius],
          );
          return rows.map(
            (r): EGWContextParagraph => ({
              refcode: r.refcode_short,
              bookCode: r.book_code,
              content: r.content_text,
              puborder: r.puborder,
            }),
          );
        },
      );

      // -----------------------------------------------------------------------
      // EGW Annotations
      // -----------------------------------------------------------------------

      const getEgwNotes = Effect.fn('WebStudyDataService.getEgwNotes')(function* (
        bookCode: string,
        puborder: number,
      ) {
        const rows = yield* db.query<{
          id: string;
          book_code: string;
          puborder: number;
          content: string;
          created_at: number;
        }>(
          'state',
          'SELECT id, book_code, puborder, content, created_at FROM egw_notes WHERE book_code = ? AND puborder = ? ORDER BY created_at DESC',
          [bookCode, puborder],
        );
        return rows.map(
          (r): EgwNote => ({
            id: r.id,
            bookCode: r.book_code,
            puborder: r.puborder,
            content: r.content,
            createdAt: r.created_at,
          }),
        );
      });

      const addEgwNote = Effect.fn('WebStudyDataService.addEgwNote')(function* (
        bookCode: string,
        puborder: number,
        content: string,
      ) {
        const id = crypto.randomUUID();
        const createdAt = Date.now();
        yield* db.exec(
          'INSERT INTO egw_notes (id, book_code, puborder, content, created_at) VALUES (?, ?, ?, ?, ?)',
          [id, bookCode, puborder, content, createdAt],
        );
        return { id, bookCode, puborder, content, createdAt } satisfies EgwNote;
      });

      const removeEgwNote = Effect.fn('WebStudyDataService.removeEgwNote')(function* (id: string) {
        yield* db.exec('DELETE FROM egw_notes WHERE id = ?', [id]);
      });

      const getEgwChapterMarkers = Effect.fn('WebStudyDataService.getEgwChapterMarkers')(function* (
        bookCode: string,
        startPuborder: number,
        endPuborder: number,
      ) {
        const rows = yield* db.query<{
          id: string;
          book_code: string;
          puborder: number;
          color: string;
          created_at: number;
        }>(
          'state',
          'SELECT id, book_code, puborder, color, created_at FROM egw_markers WHERE book_code = ? AND puborder >= ? AND puborder < ? ORDER BY puborder',
          [bookCode, startPuborder, endPuborder],
        );
        const map = new Map<number, EgwMarker[]>();
        for (const r of rows) {
          const marker: EgwMarker = {
            id: r.id,
            bookCode: r.book_code,
            puborder: r.puborder,
            color: r.color as MarkerColor,
            createdAt: r.created_at,
          };
          const existing = map.get(r.puborder);
          if (existing) existing.push(marker);
          else map.set(r.puborder, [marker]);
        }
        return map;
      });

      const addEgwMarker = Effect.fn('WebStudyDataService.addEgwMarker')(function* (
        bookCode: string,
        puborder: number,
        color: MarkerColor,
      ) {
        const id = crypto.randomUUID();
        const createdAt = Date.now();
        yield* db.exec(
          'INSERT OR IGNORE INTO egw_markers (id, book_code, puborder, color, created_at) VALUES (?, ?, ?, ?, ?)',
          [id, bookCode, puborder, color, createdAt],
        );
        return { id, bookCode, puborder, color, createdAt } satisfies EgwMarker;
      });

      const removeEgwMarker = Effect.fn('WebStudyDataService.removeEgwMarker')(function* (
        id: string,
      ) {
        yield* db.exec('DELETE FROM egw_markers WHERE id = ?', [id]);
      });

      const getEgwParagraphCollections = Effect.fn(
        'WebStudyDataService.getEgwParagraphCollections',
      )(function* (bookCode: string, puborder: number) {
        const rows = yield* db.query<{
          id: string;
          name: string;
          description: string | null;
          color: string | null;
          created_at: number;
        }>(
          'state',
          `SELECT c.id, c.name, c.description, c.color, c.created_at
           FROM collections c
           JOIN egw_collection_items eci ON eci.collection_id = c.id
           WHERE eci.book_code = ? AND eci.puborder = ?
           ORDER BY c.name`,
          [bookCode, puborder],
        );
        return rows.map(
          (r): StudyCollection => ({
            id: r.id,
            name: r.name,
            description: r.description,
            color: r.color,
            createdAt: r.created_at,
          }),
        );
      });

      const addEgwToCollection = Effect.fn('WebStudyDataService.addEgwToCollection')(function* (
        collectionId: string,
        bookCode: string,
        puborder: number,
      ) {
        yield* db.exec(
          'INSERT OR IGNORE INTO egw_collection_items (collection_id, book_code, puborder, added_at) VALUES (?, ?, ?, ?)',
          [collectionId, bookCode, puborder, Date.now()],
        );
      });

      const removeEgwFromCollection = Effect.fn('WebStudyDataService.removeEgwFromCollection')(
        function* (collectionId: string, bookCode: string, puborder: number) {
          yield* db.exec(
            'DELETE FROM egw_collection_items WHERE collection_id = ? AND book_code = ? AND puborder = ?',
            [collectionId, bookCode, puborder],
          );
        },
      );

      return WebStudyDataService.of({
        getCrossRefs,
        getStrongsEntry,
        getVerseWords,
        getMarginNotes,
        getChapterMarginNotes,
        searchByStrongs,
        setRefType,
        addUserCrossRef,
        removeUserCrossRef,
        getChapterMarkers,
        addVerseMarker,
        removeVerseMarker,
        getVerseNotes,
        addVerseNote,
        removeVerseNote,
        getEgwCommentary,
        getEgwChapterIndex,
        getEgwParagraphContext,
        getCollections,
        createCollection,
        removeCollection,
        getVerseCollections,
        addVerseToCollection,
        removeVerseFromCollection,
        getCollectionVerses,
        getEgwNotes,
        addEgwNote,
        removeEgwNote,
        getEgwChapterMarkers,
        addEgwMarker,
        removeEgwMarker,
        getEgwParagraphCollections,
        addEgwToCollection,
        removeEgwFromCollection,
      });
    }),
  );
}
