import { Schemas } from '@bible/core/egw';
import { Effect, Option, Schema } from 'effect';
import { defineProcedures, mutation, query } from './ipc-cache/procedure.js';
import { BibleMarginNotes, type MarginNote } from './services/bible-margin-notes.js';
import { BibleXrefs } from './services/bible-xrefs.js';
import { CacheService } from './services/cache-service.js';
import { EgwCommentary } from './services/egw-commentary.js';
import { EGWData } from './services/egw-data.js';
import { KjvBible } from './services/kjv-bible.js';
import { LastPositionStorage } from './services/last-position-storage.js';
import { SearchService } from './services/search-service.js';
import { SettingsStorage } from './services/settings-storage.js';

// Schemas describing the wire shape of each renderer service's outputs.
// These mirror the interfaces declared on each service — they're the
// boundary that lets us swap `Option`/`Map`/`Set` for nullable arrays the
// proxy can structurally validate.

const KjvVerseSchema = Schema.Struct({
  verse: Schema.Number,
  text: Schema.String,
});

const KjvChapterSchema = Schema.Struct({
  book: Schema.Number,
  bookName: Schema.String,
  chapter: Schema.Number,
  verses: Schema.Array(KjvVerseSchema),
});

const KjvStrongsWordSchema = Schema.Struct({
  text: Schema.String,
  strongs: Schema.optional(Schema.Array(Schema.String)),
});

const KjvStrongsVerseSchema = Schema.Struct({
  verse: Schema.Number,
  words: Schema.Array(KjvStrongsWordSchema),
});

const KjvStrongsChapterSchema = Schema.Struct({
  book: Schema.Number,
  bookName: Schema.String,
  chapter: Schema.Number,
  verses: Schema.Array(KjvStrongsVerseSchema),
});

const StrongsLexiconEntrySchema = Schema.Struct({
  code: Schema.String,
  language: Schema.Literals(['hebrew', 'greek']),
  lemma: Schema.String,
  transliteration: Schema.String,
  definition: Schema.String,
});

const ConcordanceHitSchema = Schema.Struct({
  book: Schema.Number,
  bookName: Schema.String,
  chapter: Schema.Number,
  verse: Schema.Number,
  text: Schema.String,
  word: Schema.String,
});

const CrossRefSchema = Schema.Struct({
  source: Schema.Literals(['openbible', 'tske']),
  targetBook: Schema.Number,
  targetChapter: Schema.Number,
  targetVerse: Schema.Number,
  targetVerseEnd: Schema.OptionFromNullOr(Schema.Number),
});

const MarginNoteSchema = Schema.Struct({
  idx: Schema.Number,
  type: Schema.Literals(['hebrew', 'alternate', 'other', 'greek', 'name']),
  phrase: Schema.String,
  text: Schema.String,
});

const EgwCommentaryHitSchema = Schema.Struct({
  bookId: Schema.Number,
  bookCode: Schema.String,
  bookTitle: Schema.String,
  refcodeShort: Schema.OptionFromNullOr(Schema.String),
  snippet: Schema.String,
  puborder: Schema.Number,
});

const SearchResultSchema = Schema.Union([
  Schema.Struct({
    source: Schema.Literal('local'),
    bookId: Schema.Number,
    bookCode: Schema.String,
    bookTitle: Schema.String,
    paraId: Schema.String,
    refcodeShort: Schema.OptionFromNullOr(Schema.String),
    snippet: Schema.OptionFromNullOr(Schema.String),
    puborder: Schema.Number,
  }),
  Schema.Struct({
    source: Schema.Literal('remote'),
    bookCode: Schema.String,
    bookTitle: Schema.String,
    paraId: Schema.OptionFromNullOr(Schema.String),
    refcodeShort: Schema.OptionFromNullOr(Schema.String),
    snippet: Schema.OptionFromNullOr(Schema.String),
  }),
]);

const LastPositionSchema = Schema.Struct({
  bookId: Schema.Number,
  paraId: Schema.NullOr(Schema.String),
  paragraphId: Schema.NullOr(Schema.String),
});

const BibleLastPositionSchema = Schema.Struct({
  book: Schema.Number,
  chapter: Schema.Number,
  verse: Schema.NullOr(Schema.Number),
});

const DownloadStateSchema = Schema.Struct({
  cached: Schema.Number,
  expected: Schema.Number,
});

// Procedure tree. Each `query` decodes its input, then yields the service
// the renderer already has wired up (no parallel implementation of the
// caching/parsing those services already do). Outputs that come back as
// `Option<T>` get converted to `T | null` at the procedure boundary so the
// wire shape stays plain JSON.
//
// The proxy validates outputs with `Schema.decodeUnknownEffect(output)` —
// i.e. it expects the handler to hand back the schema's *Encoded* (wire)
// shape, then reconstructs the Type shape for the renderer. For schemas
// whose Type === Encoded (plain structs, `NullOr`, `optional`) the handler's
// already-decoded domain value passes through decode untouched. But
// `TocItem`/`Paragraph` carry the non-idempotent `OptionFromOptionalNullishOrEmpty`
// transform on `para_id`/`refcode_short`: decoding an *already-decoded*
// `Option` throws "Expected string | null | undefined, got some(...)". So
// for those two we must re-encode the handler's Type-side output back to the
// wire form before it reaches the proxy's decode. (Plain `Option.getOrNull`
// on an outer Option — as in `getDownloadState` — only handles the outer
// Option, not these inner per-field transforms.)
const encodeTocItem = Schema.encodeEffect(Schemas.TocItem);
const encodeTocItems = Schema.encodeEffect(Schema.Array(Schemas.TocItem));
const encodeParagraphs = Schema.encodeEffect(Schema.Array(Schemas.Paragraph));
// Same wire-encode discipline for the other transform-bearing outputs: each
// of these schemas carries `OptionFromNullOr` fields (refcodeShort / snippet /
// targetVerseEnd), so the handler's decoded domain values must be re-encoded
// to the nullable wire form before the proxy decodes them back.
const encodeSearchResults = Schema.encodeEffect(Schema.Array(SearchResultSchema));
const encodeCrossRefs = Schema.encodeEffect(Schema.Array(CrossRefSchema));
const encodeCommentaryHits = Schema.encodeEffect(Schema.Array(EgwCommentaryHitSchema));

export const procedures = defineProcedures({
  settings: {
    read: query({
      input: Schema.Void,
      output: Schema.NullOr(Schema.String),
      handle: () =>
        SettingsStorage.pipe(
          Effect.flatMap((s) => s.read),
          Effect.map(Option.getOrNull),
        ),
    }),
    write: mutation({
      input: Schema.Struct({ text: Schema.String }),
      output: Schema.Void,
      handle: ({ text }) => SettingsStorage.pipe(Effect.flatMap((s) => s.write(text))),
    }),
  },

  egw: {
    listBooks: query({
      input: Schema.Struct({ lang: Schema.String }),
      output: Schema.Array(Schemas.Book),
      handle: ({ lang }) => EGWData.pipe(Effect.flatMap((d) => d.listBooks(lang))),
    }),
    getToc: query({
      input: Schema.Struct({ bookId: Schema.Number }),
      output: Schema.Array(Schemas.TocItem),
      handle: ({ bookId }) =>
        EGWData.pipe(
          Effect.flatMap((d) => d.getToc(bookId)),
          Effect.flatMap(encodeTocItems),
        ),
    }),
    getChapterByParaId: query({
      input: Schema.Struct({ bookId: Schema.Number, paraId: Schema.String }),
      output: Schema.Array(Schemas.Paragraph),
      handle: ({ bookId, paraId }) =>
        EGWData.pipe(
          Effect.flatMap((d) => d.getChapterByParaId(bookId, paraId)),
          Effect.flatMap(encodeParagraphs),
        ),
    }),
    getDownloadState: query({
      input: Schema.Struct({ bookId: Schema.Number }),
      output: Schema.NullOr(DownloadStateSchema),
      handle: ({ bookId }) =>
        EGWData.pipe(
          Effect.flatMap((d) => d.getDownloadState(bookId)),
          Effect.map(Option.getOrNull),
        ),
    }),
    findContainingChapter: query({
      input: Schema.Struct({ bookId: Schema.Number, paragraphPuborder: Schema.Number }),
      output: Schema.NullOr(Schemas.TocItem),
      // Encode the matched TocItem's inner Option fields back to the wire form
      // when present; `None` → `null`. Encoding only the outer Option (plain
      // `Option.getOrNull`) would leave `para_id`/`refcode_short` as decoded
      // Options and the proxy's output decode would reject them.
      handle: ({ bookId, paragraphPuborder }) =>
        EGWData.pipe(
          Effect.flatMap((d) => d.findContainingChapter(bookId, paragraphPuborder)),
          Effect.flatMap(
            Option.match({
              onNone: () => Effect.succeed(null),
              onSome: encodeTocItem,
            }),
          ),
        ),
    }),
    listFolders: query({
      input: Schema.Struct({ lang: Schema.String }),
      output: Schema.Array(Schemas.Folder),
      handle: ({ lang }) => EGWData.pipe(Effect.flatMap((d) => d.listFolders(lang))),
    }),
    listBooksByFolder: query({
      input: Schema.Struct({ folderId: Schema.Number, lang: Schema.String }),
      output: Schema.Array(Schemas.Book),
      handle: ({ folderId, lang }) =>
        EGWData.pipe(Effect.flatMap((d) => d.listBooksByFolder(folderId, lang))),
    }),
  },

  cache: {
    // Direct cache mutations — bypasses EGWData's read-through and writes
    // straight to sqlite. Used by the indexer's "warm cache from preload"
    // flows that already have the JSON string in hand.
    putBooks: mutation({
      input: Schema.Struct({ lang: Schema.String, json: Schema.String }),
      output: Schema.Void,
      handle: ({ lang, json }) => CacheService.pipe(Effect.flatMap((c) => c.putBooks(lang, json))),
    }),
    putToc: mutation({
      input: Schema.Struct({ bookId: Schema.Number, json: Schema.String }),
      output: Schema.Void,
      handle: ({ bookId, json }) =>
        CacheService.pipe(Effect.flatMap((c) => c.putToc(bookId, json))),
    }),
    putChapter: mutation({
      input: Schema.Struct({
        bookId: Schema.Number,
        paraId: Schema.String,
        json: Schema.String,
      }),
      output: Schema.Void,
      handle: ({ bookId, paraId, json }) =>
        CacheService.pipe(Effect.flatMap((c) => c.putChapter(bookId, paraId, json))),
    }),
    putFolders: mutation({
      input: Schema.Struct({ lang: Schema.String, json: Schema.String }),
      output: Schema.Void,
      handle: ({ lang, json }) =>
        CacheService.pipe(Effect.flatMap((c) => c.putFolders(lang, json))),
    }),
    putFolderBooks: mutation({
      input: Schema.Struct({ folderId: Schema.Number, lang: Schema.String, json: Schema.String }),
      output: Schema.Void,
      handle: ({ folderId, lang, json }) =>
        CacheService.pipe(Effect.flatMap((c) => c.putFolderBooks(folderId, lang, json))),
    }),
    chapterCount: query({
      input: Schema.Struct({ bookId: Schema.Number }),
      output: Schema.Number,
      handle: ({ bookId }) => CacheService.pipe(Effect.flatMap((c) => c.chapterCount(bookId))),
    }),
  },

  lastPosition: {
    read: query({
      input: Schema.Void,
      output: Schema.NullOr(LastPositionSchema),
      handle: () =>
        LastPositionStorage.pipe(
          Effect.flatMap((s) => s.read),
          Effect.map((opt) =>
            Option.match(opt, {
              onNone: () => null,
              onSome: (p) => ({
                bookId: p.bookId,
                paraId: p._tag === 'book' ? null : p.paraId,
                paragraphId: p._tag === 'paragraph' ? p.paragraphId : null,
              }),
            }),
          ),
        ),
    }),
    write: mutation({
      input: LastPositionSchema,
      output: Schema.Void,
      handle: (pos) =>
        LastPositionStorage.pipe(
          Effect.flatMap((s) =>
            s.write(
              pos.paraId === null || pos.paraId === undefined
                ? { _tag: 'book', bookId: pos.bookId }
                : pos.paragraphId === null || pos.paragraphId === undefined
                  ? { _tag: 'chapter', bookId: pos.bookId, paraId: pos.paraId }
                  : {
                      _tag: 'paragraph',
                      bookId: pos.bookId,
                      paraId: pos.paraId,
                      paragraphId: pos.paragraphId,
                    },
            ),
          ),
        ),
    }),
    clear: mutation({
      input: Schema.Void,
      output: Schema.Void,
      handle: () => LastPositionStorage.pipe(Effect.flatMap((s) => s.clear)),
    }),
  },

  bibleLastPosition: {
    read: query({
      input: Schema.Void,
      output: Schema.NullOr(BibleLastPositionSchema),
      handle: () =>
        LastPositionStorage.pipe(
          Effect.flatMap((s) => s.readBible),
          Effect.map((opt) =>
            Option.match(opt, {
              onNone: () => null,
              onSome: (p) => ({
                book: p.book,
                chapter: p.chapter,
                verse: p._tag === 'verse' ? p.verse : null,
              }),
            }),
          ),
        ),
    }),
    write: mutation({
      input: BibleLastPositionSchema,
      output: Schema.Void,
      handle: (pos) =>
        LastPositionStorage.pipe(
          Effect.flatMap((s) =>
            s.writeBible(
              pos.verse === null || pos.verse === undefined
                ? { _tag: 'chapter', book: pos.book, chapter: pos.chapter }
                : { _tag: 'verse', book: pos.book, chapter: pos.chapter, verse: pos.verse },
            ),
          ),
        ),
    }),
    clear: mutation({
      input: Schema.Void,
      output: Schema.Void,
      handle: () => LastPositionStorage.pipe(Effect.flatMap((s) => s.clearBible)),
    }),
  },

  search: {
    byRefcode: query({
      input: Schema.Struct({
        refcode: Schema.String,
        limit: Schema.optional(Schema.Number),
      }),
      output: Schema.Array(SearchResultSchema),
      handle: ({ refcode, limit }) =>
        SearchService.pipe(
          Effect.flatMap((s) => s.byRefcode(refcode, limit)),
          Effect.flatMap(encodeSearchResults),
        ),
    }),
    byText: query({
      input: Schema.Struct({
        query: Schema.String,
        limit: Schema.optional(Schema.Number),
        bookCode: Schema.optional(Schema.String),
        online: Schema.optional(Schema.Boolean),
      }),
      output: Schema.Array(SearchResultSchema),
      handle: ({ query: q, limit, bookCode, online }) =>
        SearchService.pipe(
          Effect.flatMap((s) => s.byText(q, { limit, bookCode, online })),
          Effect.flatMap(encodeSearchResults),
        ),
    }),
  },

  bible: {
    getChapter: query({
      input: Schema.Struct({ book: Schema.Number, chapter: Schema.Number }),
      output: Schema.NullOr(KjvChapterSchema),
      handle: ({ book, chapter }) =>
        KjvBible.pipe(
          Effect.flatMap((k) => k.getChapter(book, chapter)),
          Effect.map(Option.getOrNull),
        ),
    }),
    getChapterStrongs: query({
      input: Schema.Struct({ book: Schema.Number, chapter: Schema.Number }),
      output: Schema.NullOr(KjvStrongsChapterSchema),
      handle: ({ book, chapter }) =>
        KjvBible.pipe(
          Effect.flatMap((k) => k.getChapterStrongs(book, chapter)),
          Effect.map(Option.getOrNull),
        ),
    }),
    strongsLookup: query({
      input: Schema.Struct({ code: Schema.String }),
      output: Schema.NullOr(StrongsLexiconEntrySchema),
      handle: ({ code }) =>
        KjvBible.pipe(
          Effect.flatMap((k) => k.strongsLookup(code)),
          Effect.map(Option.getOrNull),
        ),
    }),
    searchVersesByStrongs: query({
      input: Schema.Struct({ code: Schema.String }),
      output: Schema.Array(ConcordanceHitSchema),
      handle: ({ code }) => KjvBible.pipe(Effect.flatMap((k) => k.searchVersesByStrongs(code))),
    }),
    countStrongsHits: query({
      input: Schema.Struct({ code: Schema.String }),
      output: Schema.Number,
      handle: ({ code }) => KjvBible.pipe(Effect.flatMap((k) => k.countStrongsHits(code))),
    }),
    searchLexicon: query({
      input: Schema.Struct({ query: Schema.String }),
      output: Schema.Array(StrongsLexiconEntrySchema),
      handle: ({ query: q }) => KjvBible.pipe(Effect.flatMap((k) => k.searchLexicon(q))),
    }),
    reimportKjv: mutation({
      input: Schema.Void,
      output: Schema.Void,
      handle: () => KjvBible.pipe(Effect.flatMap((k) => k.reimport())),
    }),
    getCrossRefs: query({
      input: Schema.Struct({
        book: Schema.Number,
        chapter: Schema.Number,
        verse: Schema.Number,
      }),
      output: Schema.Array(CrossRefSchema),
      handle: ({ book, chapter, verse }) =>
        BibleXrefs.pipe(
          Effect.flatMap((x) => x.getCrossRefs(book, chapter, verse)),
          Effect.flatMap(encodeCrossRefs),
        ),
    }),
    getMarginNotes: query({
      input: Schema.Struct({
        book: Schema.Number,
        chapter: Schema.Number,
        verse: Schema.Number,
      }),
      output: Schema.Array(MarginNoteSchema),
      handle: ({ book, chapter, verse }) =>
        BibleMarginNotes.pipe(Effect.flatMap((m) => m.getMarginNotes(book, chapter, verse))),
    }),
    // Chapter-wide notes grouped by verse. Powers the inline-overlay path:
    // the canvas mounts a loader when the margin-notes toggle is on, fetches
    // once per chapter, and threads notes into VerseRenderer so anchors render
    // next to the matched phrase rather than as a leading verse marker.
    getChapterMarginNotes: query({
      input: Schema.Struct({ book: Schema.Number, chapter: Schema.Number }),
      output: Schema.Array(
        Schema.Struct({ verse: Schema.Number, notes: Schema.Array(MarginNoteSchema) }),
      ),
      handle: ({ book, chapter }) =>
        BibleMarginNotes.pipe(
          Effect.flatMap((m) => m.chapterMarginNotes(book, chapter)),
          // The service returns a Map for callers that want O(1) verse
          // lookup; the IPC schema is an ordered array, so serialize here.
          Effect.map((byVerse) => {
            const out: { verse: number; notes: readonly MarginNote[] }[] = [];
            for (const [verse, notes] of byVerse) out.push({ verse, notes });
            out.sort((a, b) => a.verse - b.verse);
            return out;
          }),
        ),
    }),
    getCommentary: query({
      input: Schema.Struct({
        book: Schema.Number,
        chapter: Schema.Number,
        verse: Schema.Number,
      }),
      output: Schema.Array(EgwCommentaryHitSchema),
      handle: ({ book, chapter, verse }) =>
        EgwCommentary.pipe(
          Effect.flatMap((c) => c.getCommentary(book, chapter, verse)),
          Effect.flatMap(encodeCommentaryHits),
        ),
    }),
    // Unified per-chapter inline-overlay markers. One round-trip returns the
    // three lightweight verse-marker sets the canvas needs to render the
    // commentary/notes/xrefs superscripts. Strong's stays on its own
    // procedure (`getChapterStrongs`) — it's heavy (~21 MB lexicon-lookup
    // surface) and structurally different (verse → words[] with per-word
    // codes), so bundling it forces every overlay flip to pay for it.
    getChapterMarkers: query({
      input: Schema.Struct({ book: Schema.Number, chapter: Schema.Number }),
      output: Schema.Struct({
        commentaryVerses: Schema.Array(Schema.Number),
        notedVerses: Schema.Array(Schema.Number),
        xrefVerses: Schema.Array(Schema.Number),
      }),
      handle: ({ book, chapter }) =>
        Effect.gen(function* () {
          const commentary = yield* EgwCommentary;
          const notes = yield* BibleMarginNotes;
          const xrefs = yield* BibleXrefs;
          // Fan out concurrently — each underlying service hits a different
          // SQLite table, so there's no shared-connection serialization to
          // worry about.
          const [commentarySet, notesSet, xrefSet] = yield* Effect.all(
            [
              commentary.versesWithCommentary(book, chapter),
              notes.versesWithNotes(book, chapter),
              xrefs.versesWithCrossRefs(book, chapter),
            ],
            { concurrency: 'unbounded' },
          );
          return {
            commentaryVerses: Array.from(commentarySet).sort((a, b) => a - b),
            notedVerses: Array.from(notesSet).sort((a, b) => a - b),
            xrefVerses: Array.from(xrefSet).sort((a, b) => a - b),
          };
        }),
    }),
  },
});
