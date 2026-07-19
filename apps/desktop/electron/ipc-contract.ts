/**
 * The serializable contract shared by Electron main, preload, and renderer.
 *
 * `IpcInvokeContract` is the source of truth for channel names, argument
 * tuples, and results. Main-process registrations and preload invocations
 * are both typed from this map, so changing one side without the other is a
 * compile error instead of a runtime-only mismatch.
 */

export type KjvChapterPayload = {
  readonly book: number;
  readonly bookName: string;
  readonly chapter: number;
  readonly verses: readonly { readonly verse: number; readonly text: string }[];
};

export type KjvStrongsWordPayload = {
  readonly text: string;
  readonly strongs?: readonly string[];
  readonly italic?: boolean;
};

export type KjvStrongsChapterPayload = {
  readonly book: number;
  readonly bookName: string;
  readonly chapter: number;
  readonly verses: readonly {
    readonly verse: number;
    readonly words: readonly KjvStrongsWordPayload[];
  }[];
};

export type StrongsLexiconPayload = {
  readonly code: string;
  readonly language: 'hebrew' | 'greek';
  readonly lemma: string;
  readonly transliteration: string;
  readonly definition: string;
};

export type ConcordanceHitPayload = {
  readonly book: number;
  readonly bookName: string;
  readonly chapter: number;
  readonly verse: number;
  readonly text: string;
  readonly word: string;
};

export type CrossRefPayload = {
  readonly source: 'openbible' | 'tske';
  readonly targetBook: number;
  readonly targetChapter: number;
  readonly targetVerse: number;
  readonly targetVerseEnd: number | null;
};

export type MarginNotePayload = {
  readonly idx: number;
  readonly type: 'hebrew' | 'alternate' | 'other' | 'greek' | 'name';
  readonly phrase: string;
  readonly text: string;
};

export type ChapterMarginNotesPayload = {
  readonly verse: number;
  readonly notes: readonly MarginNotePayload[];
};

export type EgwCommentaryHitPayload = {
  readonly bookId: number;
  readonly bookCode: string;
  readonly bookTitle: string;
  readonly refcodeShort: string | null;
  readonly snippet: string;
  readonly puborder: number;
};

export type SearchHitPayload = {
  readonly bookId: number;
  readonly bookCode: string;
  readonly bookTitle: string;
  readonly paraId: string | null;
  readonly refcodeShort: string | null;
  readonly snippet: string;
  readonly puborder: number;
};

export type LastPositionPayload = {
  readonly book_id: number;
  readonly para_id: string | null;
  readonly paragraph_id: string | null;
};

export type BibleLastPositionPayload = {
  readonly book: number;
  readonly chapter: number;
  readonly verse: number | null;
};

export type CommentaryChapter = { readonly book: number; readonly chapter: number };

type Invoke<Args extends readonly unknown[], Result> = {
  readonly args: Args;
  readonly result: Result;
};

export interface IpcInvokeContract {
  readonly '__diag:runtimeReady': Invoke<[], boolean>;
  readonly 'settings:read': Invoke<[], string | null>;
  readonly 'settings:write': Invoke<[text: string], void>;
  readonly 'egw:fetchBooks': Invoke<[lang: string], string>;
  readonly 'egw:fetchToc': Invoke<[bookId: number], string>;
  readonly 'egw:fetchChapter': Invoke<[bookId: number, chapterId: string], string>;
  readonly 'egw:search': Invoke<[query: string, limit?: number], string>;
  readonly 'egw:fetchFolders': Invoke<[lang: string], string>;
  readonly 'egw:fetchBooksByFolder': Invoke<[folderId: number, lang: string], string>;
  readonly 'cache:getBooks': Invoke<[lang: string], string | null>;
  readonly 'cache:putBooks': Invoke<[lang: string, json: string], void>;
  readonly 'cache:getToc': Invoke<[bookId: number], string | null>;
  readonly 'cache:putToc': Invoke<[bookId: number, json: string], void>;
  readonly 'cache:getChapter': Invoke<[bookId: number, paraId: string], string | null>;
  readonly 'cache:putChapter': Invoke<[bookId: number, paraId: string, json: string], void>;
  readonly 'cache:chapterCount': Invoke<[bookId: number], number>;
  readonly 'cache:getFolders': Invoke<[lang: string], string | null>;
  readonly 'cache:putFolders': Invoke<[lang: string, json: string], void>;
  readonly 'cache:getFolderBooks': Invoke<[folderId: number, lang: string], string | null>;
  readonly 'cache:putFolderBooks': Invoke<[folderId: number, lang: string, json: string], void>;
  readonly 'lastPosition:read': Invoke<[], LastPositionPayload | null>;
  readonly 'lastPosition:write': Invoke<
    [bookId: number, paraId: string | null, paragraphId?: string | null],
    void
  >;
  readonly 'lastPosition:clear': Invoke<[], void>;
  readonly 'bibleLastPosition:read': Invoke<[], BibleLastPositionPayload | null>;
  readonly 'bibleLastPosition:write': Invoke<
    [book: number, chapter: number, verse?: number | null],
    void
  >;
  readonly 'bibleLastPosition:clear': Invoke<[], void>;
  readonly 'search:fts': Invoke<
    [query: string, limit?: number, bookCode?: string],
    readonly SearchHitPayload[]
  >;
  readonly 'search:refcode': Invoke<[refcode: string, limit?: number], readonly SearchHitPayload[]>;
  readonly 'bible:getChapter': Invoke<[book: number, chapter: number], KjvChapterPayload | null>;
  readonly 'bible:reimportKjv': Invoke<[], void>;
  readonly 'bible:getChapterStrongs': Invoke<
    [book: number, chapter: number],
    KjvStrongsChapterPayload | null
  >;
  readonly 'bible:strongsLookup': Invoke<[code: string], StrongsLexiconPayload | null>;
  readonly 'bible:searchVersesByStrongs': Invoke<[code: string], readonly ConcordanceHitPayload[]>;
  readonly 'bible:countStrongsHits': Invoke<[code: string], number>;
  readonly 'bible:searchLexicon': Invoke<[query: string], readonly StrongsLexiconPayload[]>;
  readonly 'bible:getCrossRefs': Invoke<
    [book: number, chapter: number, verse: number],
    readonly CrossRefPayload[]
  >;
  readonly 'bible:getVersesWithCrossRefs': Invoke<
    [book: number, chapter: number],
    readonly number[]
  >;
  readonly 'bible:getMarginNotes': Invoke<
    [book: number, chapter: number, verse: number],
    readonly MarginNotePayload[]
  >;
  readonly 'bible:getVersesWithNotes': Invoke<[book: number, chapter: number], readonly number[]>;
  readonly 'bible:getChapterMarginNotes': Invoke<
    [book: number, chapter: number],
    readonly ChapterMarginNotesPayload[]
  >;
  readonly 'bible:getEgwCommentary': Invoke<
    [book: number, chapter: number, verse: number],
    readonly EgwCommentaryHitPayload[]
  >;
  readonly 'bible:getBibleVersesWithCommentary': Invoke<
    [book: number, chapter: number],
    readonly number[]
  >;
}

export type IpcInvokeChannel = keyof IpcInvokeContract;
export type IpcInvokeArgs<Channel extends IpcInvokeChannel> = IpcInvokeContract[Channel]['args'];
export type IpcInvokeResult<Channel extends IpcInvokeChannel> =
  IpcInvokeContract[Channel]['result'];

export interface DesktopApi {
  readonly procedure: {
    readonly ready: () => void;
  };
  readonly diag: {
    readonly runtimeReady: () => Promise<boolean>;
  };
  readonly settings: {
    readonly read: () => Promise<string | null>;
    readonly write: (text: string) => Promise<void>;
  };
  readonly egw: {
    readonly fetchBooks: (lang: string) => Promise<string>;
    readonly fetchToc: (bookId: number) => Promise<string>;
    readonly fetchChapter: (bookId: number, chapterId: string) => Promise<string>;
    readonly search: (query: string, limit?: number) => Promise<string>;
    readonly fetchFolders: (lang: string) => Promise<string>;
    readonly fetchBooksByFolder: (folderId: number, lang: string) => Promise<string>;
  };
  readonly cache: {
    readonly getBooks: (lang: string) => Promise<string | null>;
    readonly putBooks: (lang: string, json: string) => Promise<void>;
    readonly getToc: (bookId: number) => Promise<string | null>;
    readonly putToc: (bookId: number, json: string) => Promise<void>;
    readonly getChapter: (bookId: number, paraId: string) => Promise<string | null>;
    readonly putChapter: (bookId: number, paraId: string, json: string) => Promise<void>;
    readonly chapterCount: (bookId: number) => Promise<number>;
    readonly getFolders: (lang: string) => Promise<string | null>;
    readonly putFolders: (lang: string, json: string) => Promise<void>;
    readonly getFolderBooks: (folderId: number, lang: string) => Promise<string | null>;
    readonly putFolderBooks: (folderId: number, lang: string, json: string) => Promise<void>;
  };
  readonly lastPosition: {
    readonly read: () => Promise<LastPositionPayload | null>;
    readonly write: (
      bookId: number,
      paraId: string | null,
      paragraphId?: string | null,
    ) => Promise<void>;
    readonly clear: () => Promise<void>;
  };
  readonly bibleLastPosition: {
    readonly read: () => Promise<BibleLastPositionPayload | null>;
    readonly write: (book: number, chapter: number, verse?: number | null) => Promise<void>;
    readonly clear: () => Promise<void>;
  };
  readonly search: {
    readonly fts: (
      query: string,
      limit?: number,
      bookCode?: string,
    ) => Promise<readonly SearchHitPayload[]>;
    readonly refcode: (refcode: string, limit?: number) => Promise<readonly SearchHitPayload[]>;
  };
  readonly bible: {
    readonly getChapter: (book: number, chapter: number) => Promise<KjvChapterPayload | null>;
    readonly reimportKjv: () => Promise<void>;
    readonly getChapterStrongs: (
      book: number,
      chapter: number,
    ) => Promise<KjvStrongsChapterPayload | null>;
    readonly strongsLookup: (code: string) => Promise<StrongsLexiconPayload | null>;
    readonly searchVersesByStrongs: (code: string) => Promise<readonly ConcordanceHitPayload[]>;
    readonly countStrongsHits: (code: string) => Promise<number>;
    readonly searchLexicon: (query: string) => Promise<readonly StrongsLexiconPayload[]>;
    readonly getCrossRefs: (
      book: number,
      chapter: number,
      verse: number,
    ) => Promise<readonly CrossRefPayload[]>;
    readonly getVersesWithCrossRefs: (book: number, chapter: number) => Promise<readonly number[]>;
    readonly getMarginNotes: (
      book: number,
      chapter: number,
      verse: number,
    ) => Promise<readonly MarginNotePayload[]>;
    readonly getVersesWithNotes: (book: number, chapter: number) => Promise<readonly number[]>;
    readonly getChapterMarginNotes: (
      book: number,
      chapter: number,
    ) => Promise<readonly ChapterMarginNotesPayload[]>;
    readonly getEgwCommentary: (
      book: number,
      chapter: number,
      verse: number,
    ) => Promise<readonly EgwCommentaryHitPayload[]>;
    readonly getBibleVersesWithCommentary: (
      book: number,
      chapter: number,
    ) => Promise<readonly number[]>;
    readonly onEgwCommentaryUpdated: (
      handler: (touched: readonly CommentaryChapter[]) => void,
    ) => () => void;
  };
}
