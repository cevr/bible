/**
 * AppService — facade that wraps ManagedRuntime and exposes every Effect
 * service method as a plain Promise-returning function.
 *
 * Components never import Effect directly.
 */
import { Effect, type ManagedRuntime } from 'effect';
import type { ChapterResponse, SearchResult, Verse } from '@bible/api';

import { WebBibleService, type SearchWithCountResult } from './bible/effect-service';
import {
  AppStateService,
  type Bookmark,
  type HistoryEntry,
  type Position,
  type Preferences,
} from './state/effect-service';
import { WebStudyDataService } from './study/effect-service';
import { WebSyncService } from './sync/effect-service';
import { WebReadingPlanService } from './plans/effect-service';
import type { ReadingPlan, ReadingPlanItem, PlanItemInput } from './plans/types';
import { WebMemoryVerseService } from './practice/effect-service';
import type { MemoryVerse, PracticeRecord } from './practice/types';
import { WebTopicService } from './topics/effect-service';
import type { Topic, TopicVerse } from './topics/types';
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
} from './study/service';
import type { Reference } from './bible/types';
import {
  fetchEgwBooks,
  fetchEgwChapters,
  type EGWBookInfo,
  type EGWChapter,
  type EGWParagraph,
} from './egw/api';
import type { DbClient } from '@/workers/db-client';

export type EgwBooksResult =
  | { source: 'server'; books: readonly EGWBookInfo[] }
  | { source: 'local'; books: readonly EGWBookInfo[] }
  | { source: 'empty'; books: readonly [] };

export interface EgwChapterContent {
  book: EGWBookInfo;
  chapterIndex: number;
  totalChapters: number;
  title: string | null;
  paragraphs: EGWParagraph[];
}

type AppServices =
  | WebBibleService
  | AppStateService
  | WebStudyDataService
  | WebSyncService
  | WebReadingPlanService
  | WebMemoryVerseService
  | WebTopicService;
export type AppRuntime = ManagedRuntime.ManagedRuntime<AppServices, never>;

export class AppService {
  constructor(
    private runtime: AppRuntime,
    private db?: DbClient,
  ) {}

  // ---------------------------------------------------------------------------
  // Bible
  // ---------------------------------------------------------------------------

  fetchChapter(book: number, chapter: number): Promise<ChapterResponse> {
    return this.run(WebBibleService, (s) => s.fetchChapter(book, chapter));
  }

  fetchVerses(book: number, chapter: number): Promise<readonly Verse[]> {
    return this.run(WebBibleService, (s) => s.fetchVerses(book, chapter));
  }

  searchVerses(query: string, limit?: number): Promise<readonly SearchResult[]> {
    return this.run(WebBibleService, (s) => s.searchVerses(query, limit));
  }

  searchVersesWithCount(
    query: string,
    opts?: { bookFilter?: number[]; offset?: number; limit?: number },
  ): Promise<SearchWithCountResult> {
    return this.run(WebBibleService, (s) => s.searchVersesWithCount(query, opts));
  }

  // ---------------------------------------------------------------------------
  // State
  // ---------------------------------------------------------------------------

  getPosition(): Promise<Position> {
    return this.run(AppStateService, (s) => s.getPosition());
  }

  setPosition(pos: Position): Promise<void> {
    return this.run(AppStateService, (s) => s.setPosition(pos));
  }

  getBookmarks(): Promise<Bookmark[]> {
    return this.run(AppStateService, (s) => s.getBookmarks());
  }

  addBookmark(ref: Reference, note?: string): Promise<Bookmark> {
    return this.run(AppStateService, (s) => s.addBookmark(ref, note));
  }

  removeBookmark(id: string): Promise<void> {
    return this.run(AppStateService, (s) => s.removeBookmark(id));
  }

  getHistory(limit?: number): Promise<HistoryEntry[]> {
    return this.run(AppStateService, (s) => s.getHistory(limit));
  }

  addToHistory(ref: Reference): Promise<void> {
    return this.run(AppStateService, (s) => s.addToHistory(ref));
  }

  clearHistory(): Promise<void> {
    return this.run(AppStateService, (s) => s.clearHistory());
  }

  getPreferences(): Promise<Preferences> {
    return this.run(AppStateService, (s) => s.getPreferences());
  }

  setPreferences(prefs: Partial<Preferences>): Promise<void> {
    return this.run(AppStateService, (s) => s.setPreferences(prefs));
  }

  // ---------------------------------------------------------------------------
  // Study
  // ---------------------------------------------------------------------------

  getCrossRefs(book: number, chapter: number, verse: number): Promise<ClassifiedCrossReference[]> {
    return this.run(WebStudyDataService, (s) => s.getCrossRefs(book, chapter, verse));
  }

  getStrongsEntry(number: string): Promise<StrongsEntry | null> {
    return this.run(WebStudyDataService, (s) => s.getStrongsEntry(number));
  }

  getVerseWords(book: number, chapter: number, verse: number): Promise<VerseWord[]> {
    return this.run(WebStudyDataService, (s) => s.getVerseWords(book, chapter, verse));
  }

  getMarginNotes(book: number, chapter: number, verse: number): Promise<MarginNote[]> {
    return this.run(WebStudyDataService, (s) => s.getMarginNotes(book, chapter, verse));
  }

  getChapterMarginNotes(book: number, chapter: number): Promise<Map<number, MarginNote[]>> {
    return this.run(WebStudyDataService, (s) => s.getChapterMarginNotes(book, chapter));
  }

  searchByStrongs(number: string): Promise<ConcordanceResult[]> {
    return this.run(WebStudyDataService, (s) => s.searchByStrongs(number));
  }

  setRefType(
    source: { book: number; chapter: number; verse: number },
    target: { book: number; chapter: number; verse: number | null },
    type: CrossRefType,
  ): Promise<void> {
    return this.run(WebStudyDataService, (s) => s.setRefType(source, target, type));
  }

  addUserCrossRef(
    source: { book: number; chapter: number; verse: number },
    target: { book: number; chapter: number; verse?: number; verseEnd?: number },
    opts?: { type?: CrossRefType; note?: string },
  ): Promise<UserCrossRef> {
    return this.run(WebStudyDataService, (s) => s.addUserCrossRef(source, target, opts));
  }

  removeUserCrossRef(id: string): Promise<void> {
    return this.run(WebStudyDataService, (s) => s.removeUserCrossRef(id));
  }

  getChapterMarkers(book: number, chapter: number): Promise<Map<number, VerseMarker[]>> {
    return this.run(WebStudyDataService, (s) => s.getChapterMarkers(book, chapter));
  }

  addVerseMarker(
    book: number,
    chapter: number,
    verse: number,
    color: MarkerColor,
  ): Promise<VerseMarker> {
    return this.run(WebStudyDataService, (s) => s.addVerseMarker(book, chapter, verse, color));
  }

  removeVerseMarker(id: string): Promise<void> {
    return this.run(WebStudyDataService, (s) => s.removeVerseMarker(id));
  }

  getVerseNotes(book: number, chapter: number, verse: number): Promise<VerseNote[]> {
    return this.run(WebStudyDataService, (s) => s.getVerseNotes(book, chapter, verse));
  }

  addVerseNote(book: number, chapter: number, verse: number, content: string): Promise<VerseNote> {
    return this.run(WebStudyDataService, (s) => s.addVerseNote(book, chapter, verse, content));
  }

  removeVerseNote(id: string): Promise<void> {
    return this.run(WebStudyDataService, (s) => s.removeVerseNote(id));
  }

  getEgwCommentary(book: number, chapter: number, verse: number): Promise<EGWCommentaryEntry[]> {
    return this.run(WebStudyDataService, (s) => s.getEgwCommentary(book, chapter, verse));
  }

  getEgwChapterIndex(bookCode: string, puborder: number): Promise<number> {
    return this.run(WebStudyDataService, (s) => s.getEgwChapterIndex(bookCode, puborder));
  }

  getEgwParagraphContext(
    bookCode: string,
    puborder: number,
    radius: number,
  ): Promise<EGWContextParagraph[]> {
    return this.run(WebStudyDataService, (s) =>
      s.getEgwParagraphContext(bookCode, puborder, radius),
    );
  }

  getCollections(): Promise<StudyCollection[]> {
    return this.run(WebStudyDataService, (s) => s.getCollections());
  }

  createCollection(
    name: string,
    opts?: { description?: string; color?: string },
  ): Promise<StudyCollection> {
    return this.run(WebStudyDataService, (s) => s.createCollection(name, opts));
  }

  removeCollection(id: string): Promise<void> {
    return this.run(WebStudyDataService, (s) => s.removeCollection(id));
  }

  getVerseCollections(book: number, chapter: number, verse: number): Promise<StudyCollection[]> {
    return this.run(WebStudyDataService, (s) => s.getVerseCollections(book, chapter, verse));
  }

  addVerseToCollection(
    collectionId: string,
    book: number,
    chapter: number,
    verse: number,
  ): Promise<void> {
    return this.run(WebStudyDataService, (s) =>
      s.addVerseToCollection(collectionId, book, chapter, verse),
    );
  }

  removeVerseFromCollection(
    collectionId: string,
    book: number,
    chapter: number,
    verse: number,
  ): Promise<void> {
    return this.run(WebStudyDataService, (s) =>
      s.removeVerseFromCollection(collectionId, book, chapter, verse),
    );
  }

  getCollectionVerses(collectionId: string): Promise<CollectionVerse[]> {
    return this.run(WebStudyDataService, (s) => s.getCollectionVerses(collectionId));
  }

  // ---------------------------------------------------------------------------
  // EGW Annotations
  // ---------------------------------------------------------------------------

  getEgwNotes(bookCode: string, puborder: number): Promise<EgwNote[]> {
    return this.run(WebStudyDataService, (s) => s.getEgwNotes(bookCode, puborder));
  }

  addEgwNote(bookCode: string, puborder: number, content: string): Promise<EgwNote> {
    return this.run(WebStudyDataService, (s) => s.addEgwNote(bookCode, puborder, content));
  }

  removeEgwNote(id: string): Promise<void> {
    return this.run(WebStudyDataService, (s) => s.removeEgwNote(id));
  }

  getEgwChapterMarkers(
    bookCode: string,
    startPuborder: number,
    endPuborder: number,
  ): Promise<Map<number, EgwMarker[]>> {
    return this.run(WebStudyDataService, (s) =>
      s.getEgwChapterMarkers(bookCode, startPuborder, endPuborder),
    );
  }

  addEgwMarker(bookCode: string, puborder: number, color: MarkerColor): Promise<EgwMarker> {
    return this.run(WebStudyDataService, (s) => s.addEgwMarker(bookCode, puborder, color));
  }

  removeEgwMarker(id: string): Promise<void> {
    return this.run(WebStudyDataService, (s) => s.removeEgwMarker(id));
  }

  getEgwParagraphCollections(bookCode: string, puborder: number): Promise<StudyCollection[]> {
    return this.run(WebStudyDataService, (s) => s.getEgwParagraphCollections(bookCode, puborder));
  }

  addEgwToCollection(collectionId: string, bookCode: string, puborder: number): Promise<void> {
    return this.run(WebStudyDataService, (s) =>
      s.addEgwToCollection(collectionId, bookCode, puborder),
    );
  }

  removeEgwFromCollection(collectionId: string, bookCode: string, puborder: number): Promise<void> {
    return this.run(WebStudyDataService, (s) =>
      s.removeEgwFromCollection(collectionId, bookCode, puborder),
    );
  }

  // ---------------------------------------------------------------------------
  // EGW (direct fetch, not Effect-routed)
  // ---------------------------------------------------------------------------

  async fetchEgwBooks(): Promise<EgwBooksResult> {
    // Local-first: try OPFS, fall back to server
    if (this.db) {
      const rows = await this.db
        .query<{
          book_id: number;
          book_code: string;
          book_title: string;
          book_author: string;
          paragraph_count: number;
        }>('egw', 'SELECT * FROM books ORDER BY book_code')
        .catch(() => []);
      if (rows.length > 0) {
        return {
          source: 'local',
          books: rows.map((r) => ({
            bookId: r.book_id,
            bookCode: r.book_code,
            title: r.book_title,
            author: r.book_author,
            paragraphCount: r.paragraph_count,
          })),
        };
      }
    }
    const serverBooks = await fetchEgwBooks().catch(() => [] as readonly EGWBookInfo[]);
    if (serverBooks.length > 0) return { source: 'server', books: serverBooks };
    return { source: 'empty', books: [] };
  }

  async fetchEgwChapterContent(bookCode: string, chapterIndex: number): Promise<EgwChapterContent> {
    if (!this.db) throw new Error(`No local database available for ${bookCode}`);
    return this.localEgwChapterContent(bookCode, chapterIndex);
  }

  async fetchEgwChapters(bookCode: string): Promise<readonly EGWChapter[]> {
    // Local-first: try OPFS, fall back to server
    if (this.db) {
      const local = await this.localEgwChapters(bookCode);
      if (local.length > 0) return local;
    }
    return fetchEgwChapters(bookCode).catch(() => []);
  }

  private async localEgwChapterContent(
    bookCode: string,
    chapterIndex: number,
  ): Promise<EgwChapterContent> {
    const db = this.db;
    if (!db) throw new Error('No local database available');
    const [bookRow] = await db.query<{
      book_id: number;
      book_code: string;
      book_title: string;
      book_author: string;
      paragraph_count: number;
    }>('egw', 'SELECT * FROM books WHERE book_code = ? LIMIT 1', [bookCode]);
    if (!bookRow) throw new Error(`Book ${bookCode} not found locally`);

    // Get all chapter heading puborders to find boundaries
    const headings = await db.query<{ puborder: number; content: string | null }>(
      'egw',
      'SELECT puborder, content FROM paragraphs WHERE book_id = ? AND is_chapter_heading = 1 ORDER BY puborder',
      [bookRow.book_id],
    );
    if (headings.length === 0) throw new Error(`No chapters found in ${bookCode}`);
    if (chapterIndex < 0 || chapterIndex >= headings.length) {
      throw new Error(`Chapter ${chapterIndex} not found in ${bookCode}`);
    }

    const startHeading = headings[chapterIndex];
    if (!startHeading) {
      throw new Error(`Chapter ${chapterIndex} not found in ${bookCode}`);
    }
    const startPuborder = startHeading.puborder;
    const endPuborder =
      chapterIndex + 1 < headings.length ? (headings[chapterIndex + 1]?.puborder ?? null) : null;

    // Fetch all paragraphs from this chapter heading to the next
    const whereClause =
      endPuborder != null
        ? 'book_id = ? AND puborder >= ? AND puborder < ?'
        : 'book_id = ? AND puborder >= ?';
    const params =
      endPuborder != null
        ? [bookRow.book_id, startPuborder, endPuborder]
        : [bookRow.book_id, startPuborder];

    const rows = await db.query<{
      para_id: string | null;
      refcode_short: string | null;
      content: string | null;
      puborder: number;
      element_type: string | null;
    }>(
      'egw',
      `SELECT para_id, refcode_short, content, puborder, element_type FROM paragraphs WHERE ${whereClause} ORDER BY puborder`,
      params,
    );

    return {
      book: {
        bookId: bookRow.book_id,
        bookCode: bookRow.book_code,
        title: bookRow.book_title,
        author: bookRow.book_author,
        paragraphCount: bookRow.paragraph_count,
      },
      chapterIndex,
      totalChapters: headings.length,
      title: startHeading.content,
      paragraphs: rows.map((r) => ({
        paraId: r.para_id,
        refcodeShort: r.refcode_short,
        content: r.content,
        puborder: r.puborder,
        elementType: r.element_type,
      })),
    };
  }

  private async localEgwChapters(bookCode: string): Promise<readonly EGWChapter[]> {
    const db = this.db;
    if (!db) return [];
    const [bookRow] = await db.query<{ book_id: number }>(
      'egw',
      'SELECT book_id FROM books WHERE book_code = ? LIMIT 1',
      [bookCode],
    );
    if (!bookRow) return [];

    const rows = await db.query<{
      content: string | null;
      refcode_short: string | null;
      puborder: number;
      page_number: number | null;
    }>(
      'egw',
      'SELECT content, refcode_short, puborder, page_number FROM paragraphs WHERE book_id = ? AND is_chapter_heading = 1 ORDER BY puborder',
      [bookRow.book_id],
    );

    return rows.map((r) => ({
      title: r.content,
      refcodeShort: r.refcode_short,
      puborder: r.puborder,
      page: r.page_number,
    }));
  }

  // ---------------------------------------------------------------------------
  // Reading Plans
  // ---------------------------------------------------------------------------

  getPlans(): Promise<ReadingPlan[]> {
    return this.run(WebReadingPlanService, (s) => s.getPlans());
  }

  getPlanItems(planId: string): Promise<ReadingPlanItem[]> {
    return this.run(WebReadingPlanService, (s) => s.getPlanItems(planId));
  }

  getPlanProgress(planId: string): Promise<Set<number>> {
    return this.run(WebReadingPlanService, (s) => s.getPlanProgress(planId));
  }

  createPlan(
    name: string,
    description: string | null,
    type: 'builtin' | 'custom',
    sourceId: string | null,
    items: PlanItemInput[],
  ): Promise<ReadingPlan> {
    return this.run(WebReadingPlanService, (s) =>
      s.createPlan(name, description, type, sourceId, items),
    );
  }

  removePlan(id: string): Promise<void> {
    return this.run(WebReadingPlanService, (s) => s.removePlan(id));
  }

  markItemComplete(planId: string, itemId: number): Promise<void> {
    return this.run(WebReadingPlanService, (s) => s.markItemComplete(planId, itemId));
  }

  markItemIncomplete(planId: string, itemId: number): Promise<void> {
    return this.run(WebReadingPlanService, (s) => s.markItemIncomplete(planId, itemId));
  }

  setPlanStartDate(planId: string, startDate: number): Promise<void> {
    return this.run(WebReadingPlanService, (s) => s.setPlanStartDate(planId, startDate));
  }

  // ---------------------------------------------------------------------------
  // Memory Verse Practice
  // ---------------------------------------------------------------------------

  getMemoryVerses(): Promise<MemoryVerse[]> {
    return this.run(WebMemoryVerseService, (s) => s.getMemoryVerses());
  }

  addMemoryVerse(
    book: number,
    chapter: number,
    verseStart: number,
    verseEnd?: number,
  ): Promise<MemoryVerse> {
    return this.run(WebMemoryVerseService, (s) =>
      s.addMemoryVerse(book, chapter, verseStart, verseEnd),
    );
  }

  removeMemoryVerse(id: string): Promise<void> {
    return this.run(WebMemoryVerseService, (s) => s.removeMemoryVerse(id));
  }

  recordPractice(verseId: string, mode: 'reveal' | 'type', score: number): Promise<void> {
    return this.run(WebMemoryVerseService, (s) => s.recordPractice(verseId, mode, score));
  }

  getPracticeHistory(verseId: string, limit?: number): Promise<PracticeRecord[]> {
    return this.run(WebMemoryVerseService, (s) => s.getPracticeHistory(verseId, limit));
  }

  // ---------------------------------------------------------------------------
  // Topics
  // ---------------------------------------------------------------------------

  searchTopics(query: string): Promise<Topic[]> {
    return this.run(WebTopicService, (s) => s.searchTopics(query));
  }

  getTopic(id: number): Promise<Topic | null> {
    return this.run(WebTopicService, (s) => s.getTopic(id));
  }

  getTopicVerses(id: number): Promise<TopicVerse[]> {
    return this.run(WebTopicService, (s) => s.getTopicVerses(id));
  }

  getVerseTopics(book: number, chapter: number, verse: number): Promise<Topic[]> {
    return this.run(WebTopicService, (s) => s.getVerseTopics(book, chapter, verse));
  }

  getTopicChildren(parentId: number): Promise<Topic[]> {
    return this.run(WebTopicService, (s) => s.getTopicChildren(parentId));
  }

  getRootTopics(): Promise<Topic[]> {
    return this.run(WebTopicService, (s) => s.getRootTopics());
  }

  getTopicsByLetter(letter: string): Promise<Topic[]> {
    return this.run(WebTopicService, (s) => s.getTopicsByLetter(letter));
  }

  // ---------------------------------------------------------------------------
  // Sync
  // ---------------------------------------------------------------------------

  syncNow(): Promise<void> {
    return this.run(WebSyncService, (s) => s.syncNow());
  }

  // ---------------------------------------------------------------------------
  // Internal
  // ---------------------------------------------------------------------------

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private run<A>(tag: any, fn: (s: any) => Effect.Effect<A, any, any>): Promise<A> {
    return this.runtime.runPromise(Effect.flatMap(tag, fn));
  }
}
