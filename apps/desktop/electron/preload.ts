import { contextBridge, ipcRenderer } from 'electron';
import type {
  CommentaryChapter,
  DesktopApi,
  IpcInvokeArgs,
  IpcInvokeChannel,
  IpcInvokeResult,
} from './ipc-contract.js';

const invoke = <Channel extends IpcInvokeChannel>(
  channel: Channel,
  ...args: IpcInvokeArgs<Channel>
): Promise<IpcInvokeResult<Channel>> => ipcRenderer.invoke(channel, ...args);

const api: DesktopApi = {
  diag: {
    // True once main has constructed mainRuntime in `app.whenReady` and the
    // database layers are initialized. The renderer polls this on mount so it
    // can show a "main process not ready" banner instead of misleading
    // "missing data" screens when an IPC returns empty because the runtime
    // never came up (typically: hot-reload churn left a stale Electron).
    runtimeReady: () => invoke('__diag:runtimeReady'),
  },
  settings: {
    read: () => invoke('settings:read'),
    write: (text) => invoke('settings:write', text),
  },
  egw: {
    // Live EGW API calls. The main process owns auth + HTTP; renderer gets
    // back a JSON string with the same shape the cache stores, so the
    // calling EGWData layer decodes hits and live fetches through one path.
    fetchBooks: (lang) => invoke('egw:fetchBooks', lang),
    fetchToc: (bookId) => invoke('egw:fetchToc', bookId),
    fetchChapter: (bookId, chapterId) => invoke('egw:fetchChapter', bookId, chapterId),
    search: (query, limit) => invoke('egw:search', query, limit),
    fetchFolders: (lang) => invoke('egw:fetchFolders', lang),
    fetchBooksByFolder: (folderId, lang) => invoke('egw:fetchBooksByFolder', folderId, lang),
  },
  cache: {
    // Each method returns the raw JSON string the EGW API responded with
    // (or null on miss); the renderer's CacheService re-parses it through
    // the same Schema it would use for a live response.
    getBooks: (lang) => invoke('cache:getBooks', lang),
    putBooks: (lang, json) => invoke('cache:putBooks', lang, json),
    getToc: (bookId) => invoke('cache:getToc', bookId),
    putToc: (bookId, json) => invoke('cache:putToc', bookId, json),
    getChapter: (bookId, paraId) => invoke('cache:getChapter', bookId, paraId),
    putChapter: (bookId, paraId, json) => invoke('cache:putChapter', bookId, paraId, json),
    chapterCount: (bookId) => invoke('cache:chapterCount', bookId),
    getFolders: (lang) => invoke('cache:getFolders', lang),
    putFolders: (lang, json) => invoke('cache:putFolders', lang, json),
    getFolderBooks: (folderId, lang) => invoke('cache:getFolderBooks', folderId, lang),
    putFolderBooks: (folderId, lang, json) => invoke('cache:putFolderBooks', folderId, lang, json),
  },
  lastPosition: {
    read: () => invoke('lastPosition:read'),
    write: (bookId, paraId, paragraphId = null) =>
      invoke('lastPosition:write', bookId, paraId, paragraphId),
    clear: () => invoke('lastPosition:clear'),
  },
  bibleLastPosition: {
    // Sibling to lastPosition above — Bible mode's (book, chapter, verse) is
    // stored independently so switching modes on launch doesn't reset the
    // other mode's place. verse is nullable for the chapter-with-no-selection
    // case.
    read: () => invoke('bibleLastPosition:read'),
    write: (book, chapter, verse = null) => invoke('bibleLastPosition:write', book, chapter, verse),
    clear: () => invoke('bibleLastPosition:clear'),
  },
  search: {
    // Local search over the EGW paragraph index populated by cache:putChapter.
    // FTS5 full-text match across content + refcode_short, optionally scoped
    // to a single book by code.
    fts: (query, limit, bookCode) => invoke('search:fts', query, limit, bookCode),
    // Exact refcode lookup (case-insensitive). Returns multiple hits when the
    // same refcode appears in more than one book — caller picks.
    refcode: (refcode, limit) => invoke('search:refcode', refcode, limit),
  },
  bible: {
    // KJV chapter lookup. Returns null for invalid book/chapter combos so the
    // drawer can show an inline "not found" without throwing.
    getChapter: (book, chapter) => invoke('bible:getChapter', book, chapter),
    // Drop and re-import the bundled KJV verses + Strong's lexicon. Exposed
    // for the renderer's "Reimport KJV" recovery affordance — used when a
    // previous import left the tables partial/empty (e.g. crashed transaction)
    // and a chapter render came up empty. Resolves once the re-import
    // transaction commits.
    reimportKjv: () => invoke('bible:reimportKjv'),
    // KJV with Strong's numbers — same lookup, word-tokenized payload with
    // optional H#### / G#### tags. Lazy-loaded on first call (~21 MB on disk).
    getChapterStrongs: (book, chapter) => invoke('bible:getChapterStrongs', book, chapter),
    // Strong's lexicon entry for a single H#### / G#### code. Returns null
    // for codes not in the lexicon or malformed input. Used by the drawer's
    // Strong's tab when the user clicks a superscript.
    strongsLookup: (code) => invoke('bible:strongsLookup', code),
    // Concordance lookup — every verse tagged with `code`, capped server-side
    // so high-frequency codes don't blow up the IPC payload. Pair with
    // `countStrongsHits` if the UI needs to show the true total alongside the
    // truncated list.
    searchVersesByStrongs: (code) => invoke('bible:searchVersesByStrongs', code),
    // Distinct-verse count for `code`, independent of the capped hit list.
    countStrongsHits: (code) => invoke('bible:countStrongsHits', code),
    // Lexicon substring search across lemma / transliteration / definition.
    // Capped server-side; the UI uses this when the query isn't an H/G code.
    searchLexicon: (query) => invoke('bible:searchLexicon', query),
    // Cross references for a single verse, drawn from the bundled openbible /
    // TSKE catalogs. Returns [] when the verse has no entries in either
    // catalog (common — coverage is uneven, especially for narrative books).
    getCrossRefs: (book, chapter, verse) => invoke('bible:getCrossRefs', book, chapter, verse),
    // Verses in (book, chapter) that have at least one cross-reference. Used
    // by the chapter renderer to paint an `x` superscript marker next to verse
    // numbers in one round-trip per chapter (mirrors `getVersesWithNotes`).
    getVersesWithCrossRefs: (book, chapter) =>
      invoke('bible:getVersesWithCrossRefs', book, chapter),
    // Margin notes for a single verse, drawn from the bundled margin-notes
    // catalog. Returns [] for verses with no annotations.
    getMarginNotes: (book, chapter, verse) => invoke('bible:getMarginNotes', book, chapter, verse),
    // Verses in a (book, chapter) that have at least one margin note. Used
    // by the chapter renderer to mark notable verses with a superscript
    // anchor in one round-trip per chapter.
    getVersesWithNotes: (book, chapter) => invoke('bible:getVersesWithNotes', book, chapter),
    // All margin notes in (book, chapter) grouped by verse. Used by the
    // inline-overlay path so anchors render next to the phrase they annotate.
    // Returns a serializable verse → notes array — renderer rebuilds a Map.
    getChapterMarginNotes: (book, chapter) => invoke('bible:getChapterMarginNotes', book, chapter),
    // EGW paragraphs that reference the given Bible verse, drawn from the
    // local `paragraph_bible_refs` index (populated by the indexer + boot
    // backfill). Empty until the user has cached at least one EGW chapter
    // that mentions this verse.
    getEgwCommentary: (book, chapter, verse) =>
      invoke('bible:getEgwCommentary', book, chapter, verse),
    // Verses in (book, chapter) that have at least one cached EGW paragraph
    // referencing them. Used by the chapter renderer to paint a footnote
    // marker next to verse numbers in one round-trip per chapter (mirrors
    // `getVersesWithNotes`).
    getBibleVersesWithCommentary: (book, chapter) =>
      invoke('bible:getBibleVersesWithCommentary', book, chapter),
    // Subscribe to "new EGW commentary indexed" pulses from the indexer.
    // The handler receives the distinct `(book, chapter)` keys that just
    // got refs written, so the renderer can invalidate the matching cache
    // entry and re-query the hit set. Returns an unsubscribe function.
    onEgwCommentaryUpdated: (handler) => {
      const listener = (
        _e: Electron.IpcRendererEvent,
        touched: readonly CommentaryChapter[],
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

contextBridge.exposeInMainWorld('api', api);

export type { DesktopApi } from './ipc-contract.js';
