import { contextBridge, ipcRenderer } from 'electron';

const api = {
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
