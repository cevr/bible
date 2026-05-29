import { contextBridge, ipcRenderer } from 'electron';

const api = {
  diag: {
    // True once main has constructed mainRuntime in `app.whenReady` and the
    // database layers are initialized. The renderer polls this on mount so it
    // can show a "main process not ready" banner instead of misleading
    // "missing data" screens when an IPC returns empty because the runtime
    // never came up (typically: hot-reload churn left a stale Electron).
    runtimeReady: (): Promise<boolean> => ipcRenderer.invoke('__diag:runtimeReady'),
  },
  settings: {
    read: (): Promise<string | null> => ipcRenderer.invoke('settings:read'),
    write: (text: string): Promise<void> => ipcRenderer.invoke('settings:write', text),
  },
  egw: {
    // Live EGW API calls. The main process owns auth + HTTP; renderer gets
    // back a JSON string with the same shape the cache stores, so the
    // calling EGWData layer decodes hits and live fetches through one path.
    fetchBooks: (lang: string): Promise<string> => ipcRenderer.invoke('egw:fetchBooks', lang),
    fetchToc: (bookId: number): Promise<string> => ipcRenderer.invoke('egw:fetchToc', bookId),
    fetchChapter: (bookId: number, chapterId: string): Promise<string> =>
      ipcRenderer.invoke('egw:fetchChapter', bookId, chapterId),
    search: (query: string, limit?: number): Promise<string> =>
      ipcRenderer.invoke('egw:search', query, limit),
    fetchFolders: (lang: string): Promise<string> => ipcRenderer.invoke('egw:fetchFolders', lang),
    fetchBooksByFolder: (folderId: number, lang: string): Promise<string> =>
      ipcRenderer.invoke('egw:fetchBooksByFolder', folderId, lang),
  },
  cache: {
    // Each method returns the raw JSON string the EGW API responded with
    // (or null on miss); the renderer's CacheService re-parses it through
    // the same Schema it would use for a live response.
    getBooks: (lang: string): Promise<string | null> => ipcRenderer.invoke('cache:getBooks', lang),
    putBooks: (lang: string, json: string): Promise<void> =>
      ipcRenderer.invoke('cache:putBooks', lang, json),
    getToc: (bookId: number): Promise<string | null> => ipcRenderer.invoke('cache:getToc', bookId),
    putToc: (bookId: number, json: string): Promise<void> =>
      ipcRenderer.invoke('cache:putToc', bookId, json),
    getChapter: (bookId: number, paraId: string): Promise<string | null> =>
      ipcRenderer.invoke('cache:getChapter', bookId, paraId),
    putChapter: (bookId: number, paraId: string, json: string): Promise<void> =>
      ipcRenderer.invoke('cache:putChapter', bookId, paraId, json),
    chapterCount: (bookId: number): Promise<number> =>
      ipcRenderer.invoke('cache:chapterCount', bookId),
    getFolders: (lang: string): Promise<string | null> =>
      ipcRenderer.invoke('cache:getFolders', lang),
    putFolders: (lang: string, json: string): Promise<void> =>
      ipcRenderer.invoke('cache:putFolders', lang, json),
    getFolderBooks: (folderId: number, lang: string): Promise<string | null> =>
      ipcRenderer.invoke('cache:getFolderBooks', folderId, lang),
    putFolderBooks: (folderId: number, lang: string, json: string): Promise<void> =>
      ipcRenderer.invoke('cache:putFolderBooks', folderId, lang, json),
  },
  lastPosition: {
    read: (): Promise<{
      readonly book_id: number;
      readonly para_id: string | null;
      readonly paragraph_id: string | null;
    } | null> => ipcRenderer.invoke('lastPosition:read'),
    write: (
      bookId: number,
      paraId: string | null,
      paragraphId: string | null = null,
    ): Promise<void> => ipcRenderer.invoke('lastPosition:write', bookId, paraId, paragraphId),
    clear: (): Promise<void> => ipcRenderer.invoke('lastPosition:clear'),
  },
  bibleLastPosition: {
    // Sibling to lastPosition above — Bible mode's (book, chapter, verse) is
    // stored independently so switching modes on launch doesn't reset the
    // other mode's place. verse is nullable for the chapter-with-no-selection
    // case.
    read: (): Promise<{
      readonly book: number;
      readonly chapter: number;
      readonly verse: number | null;
    } | null> => ipcRenderer.invoke('bibleLastPosition:read'),
    write: (book: number, chapter: number, verse: number | null = null): Promise<void> =>
      ipcRenderer.invoke('bibleLastPosition:write', book, chapter, verse),
    clear: (): Promise<void> => ipcRenderer.invoke('bibleLastPosition:clear'),
  },
  search: {
    // Local search over the EGW paragraph index populated by cache:putChapter.
    // FTS5 full-text match across content + refcode_short, optionally scoped
    // to a single book by code.
    fts: (query: string, limit?: number, bookCode?: string): Promise<readonly SearchHit[]> =>
      ipcRenderer.invoke('search:fts', query, limit, bookCode),
    // Exact refcode lookup (case-insensitive). Returns multiple hits when the
    // same refcode appears in more than one book — caller picks.
    refcode: (refcode: string, limit?: number): Promise<readonly SearchHit[]> =>
      ipcRenderer.invoke('search:refcode', refcode, limit),
  },
  bible: {
    // KJV chapter lookup. Returns null for invalid book/chapter combos so the
    // drawer can show an inline "not found" without throwing.
    getChapter: (book: number, chapter: number): Promise<KjvChapterPayload | null> =>
      ipcRenderer.invoke('bible:getChapter', book, chapter),
    // Drop and re-import the bundled KJV verses + Strong's lexicon. Exposed
    // for the renderer's "Reimport KJV" recovery affordance — used when a
    // previous import left the tables partial/empty (e.g. crashed transaction)
    // and a chapter render came up empty. Resolves once the re-import
    // transaction commits.
    reimportKjv: (): Promise<void> => ipcRenderer.invoke('bible:reimportKjv'),
    // KJV with Strong's numbers — same lookup, word-tokenized payload with
    // optional H#### / G#### tags. Lazy-loaded on first call (~21 MB on disk).
    getChapterStrongs: (book: number, chapter: number): Promise<KjvStrongsChapterPayload | null> =>
      ipcRenderer.invoke('bible:getChapterStrongs', book, chapter),
    // Strong's lexicon entry for a single H#### / G#### code. Returns null
    // for codes not in the lexicon or malformed input. Used by the drawer's
    // Strong's tab when the user clicks a superscript.
    strongsLookup: (code: string): Promise<StrongsLexiconPayload | null> =>
      ipcRenderer.invoke('bible:strongsLookup', code),
    // Concordance lookup — every verse tagged with `code`, capped server-side
    // so high-frequency codes don't blow up the IPC payload. Pair with
    // `countStrongsHits` if the UI needs to show the true total alongside the
    // truncated list.
    searchVersesByStrongs: (code: string): Promise<readonly ConcordanceHitPayload[]> =>
      ipcRenderer.invoke('bible:searchVersesByStrongs', code),
    // Distinct-verse count for `code`, independent of the capped hit list.
    countStrongsHits: (code: string): Promise<number> =>
      ipcRenderer.invoke('bible:countStrongsHits', code),
    // Lexicon substring search across lemma / transliteration / definition.
    // Capped server-side; the UI uses this when the query isn't an H/G code.
    searchLexicon: (query: string): Promise<readonly StrongsLexiconPayload[]> =>
      ipcRenderer.invoke('bible:searchLexicon', query),
    // Cross references for a single verse, drawn from the bundled openbible /
    // TSKE catalogs. Returns [] when the verse has no entries in either
    // catalog (common — coverage is uneven, especially for narrative books).
    getCrossRefs: (
      book: number,
      chapter: number,
      verse: number,
    ): Promise<readonly CrossRefPayload[]> =>
      ipcRenderer.invoke('bible:getCrossRefs', book, chapter, verse),
    // Verses in (book, chapter) that have at least one cross-reference. Used
    // by the chapter renderer to paint an `x` superscript marker next to verse
    // numbers in one round-trip per chapter (mirrors `getVersesWithNotes`).
    getVersesWithCrossRefs: (book: number, chapter: number): Promise<readonly number[]> =>
      ipcRenderer.invoke('bible:getVersesWithCrossRefs', book, chapter),
    // Margin notes for a single verse, drawn from the bundled margin-notes
    // catalog. Returns [] for verses with no annotations.
    getMarginNotes: (
      book: number,
      chapter: number,
      verse: number,
    ): Promise<readonly MarginNotePayload[]> =>
      ipcRenderer.invoke('bible:getMarginNotes', book, chapter, verse),
    // Verses in a (book, chapter) that have at least one margin note. Used
    // by the chapter renderer to mark notable verses with a superscript
    // anchor in one round-trip per chapter.
    getVersesWithNotes: (book: number, chapter: number): Promise<readonly number[]> =>
      ipcRenderer.invoke('bible:getVersesWithNotes', book, chapter),
    // All margin notes in (book, chapter) grouped by verse. Used by the
    // inline-overlay path so anchors render next to the phrase they annotate.
    // Returns a serializable verse → notes array — renderer rebuilds a Map.
    getChapterMarginNotes: (
      book: number,
      chapter: number,
    ): Promise<
      readonly { readonly verse: number; readonly notes: readonly MarginNotePayload[] }[]
    > => ipcRenderer.invoke('bible:getChapterMarginNotes', book, chapter),
    // EGW paragraphs that reference the given Bible verse, drawn from the
    // local `paragraph_bible_refs` index (populated by the indexer + boot
    // backfill). Empty until the user has cached at least one EGW chapter
    // that mentions this verse.
    getEgwCommentary: (
      book: number,
      chapter: number,
      verse: number,
    ): Promise<readonly EgwCommentaryHitPayload[]> =>
      ipcRenderer.invoke('bible:getEgwCommentary', book, chapter, verse),
    // Verses in (book, chapter) that have at least one cached EGW paragraph
    // referencing them. Used by the chapter renderer to paint a footnote
    // marker next to verse numbers in one round-trip per chapter (mirrors
    // `getVersesWithNotes`).
    getBibleVersesWithCommentary: (book: number, chapter: number): Promise<readonly number[]> =>
      ipcRenderer.invoke('bible:getBibleVersesWithCommentary', book, chapter),
    // Subscribe to "new EGW commentary indexed" pulses from the indexer.
    // The handler receives the distinct `(book, chapter)` keys that just
    // got refs written, so the renderer can invalidate the matching cache
    // entry and re-query the hit set. Returns an unsubscribe function.
    onEgwCommentaryUpdated: (
      handler: (touched: readonly { book: number; chapter: number }[]) => void,
    ): (() => void) => {
      const listener = (
        _e: Electron.IpcRendererEvent,
        touched: readonly { book: number; chapter: number }[],
      ): void => {
        handler(touched);
      };
      ipcRenderer.on('bible:egwCommentaryUpdated', listener);
      return () => {
        ipcRenderer.removeListener('bible:egwCommentaryUpdated', listener);
      };
    },
  },
};

export type KjvChapterPayload = {
  readonly book: number;
  readonly bookName: string;
  readonly chapter: number;
  readonly verses: readonly { readonly verse: number; readonly text: string }[];
};

export type KjvStrongsWord = {
  readonly text: string;
  readonly strongs?: readonly string[];
  // KJV translator-supplied (italic) word — see StrongsWord in @bible/core.
  readonly italic?: boolean;
};

export type KjvStrongsChapterPayload = {
  readonly book: number;
  readonly bookName: string;
  readonly chapter: number;
  readonly verses: readonly {
    readonly verse: number;
    readonly words: readonly KjvStrongsWord[];
  }[];
};

export type StrongsLexiconPayload = {
  readonly code: string;
  readonly language: 'hebrew' | 'greek';
  readonly lemma: string;
  readonly transliteration: string;
  readonly definition: string;
};

/** One concordance hit exposed by `api.bible.searchVersesByStrongs`. Shape
 * must match `RendererConcordanceHit` in electron/main.ts. */
export type ConcordanceHitPayload = {
  readonly book: number;
  readonly bookName: string;
  readonly chapter: number;
  readonly verse: number;
  readonly text: string;
  readonly word: string;
};

/** One cross-ref row as exposed by `api.bible.getCrossRefs`. Shape must match
 * `RendererCrossRef` in electron/main.ts. */
export type CrossRefPayload = {
  readonly source: 'openbible' | 'tske';
  readonly targetBook: number;
  readonly targetChapter: number;
  readonly targetVerse: number;
  readonly targetVerseEnd: number | null;
};

/** One margin-note row as exposed by `api.bible.getMarginNotes`. Shape must
 * match `RendererMarginNote` in electron/main.ts. */
export type MarginNotePayload = {
  readonly idx: number;
  readonly type: 'hebrew' | 'alternate' | 'other' | 'greek' | 'name';
  readonly phrase: string;
  readonly text: string;
};

/** One commentary hit as exposed by `api.bible.getEgwCommentary`. Shape must
 * match `EgwCommentaryHit` in electron/main.ts. */
export type EgwCommentaryHitPayload = {
  readonly bookId: number;
  readonly bookCode: string;
  readonly bookTitle: string;
  readonly refcodeShort: string | null;
  readonly snippet: string;
  readonly puborder: number;
};

/** Search result row exposed by `api.search.*`. Shape must match
 * `SearchHitPayload` in electron/main.ts. */
export type SearchHit = {
  readonly bookId: number;
  readonly bookCode: string;
  readonly bookTitle: string;
  readonly paraId: string | null;
  readonly refcodeShort: string | null;
  readonly snippet: string;
  readonly puborder: number;
};

contextBridge.exposeInMainWorld('api', api);

export type DesktopApi = typeof api;
