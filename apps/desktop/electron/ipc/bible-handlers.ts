import { getBibleBook } from '@bible/core/bible';
import {
  BibleCorpus,
  BibleDatabase,
  type BibleCorpusService,
  type CrossReferenceAsset,
  type KjvAssetFile,
  type MarginNotesAsset,
  type StrongsLexiconAsset,
  type StrongsVerseAsset,
} from '@bible/core/bible-db';
import { extractScriptureRefs, nodesToText } from '@bible/core/egw';
import { EGWParagraphDatabase } from '@bible/core/egw-db';
import { Effect, Option } from 'effect';
import type { SqlError } from 'effect/unstable/sql/SqlError';
import { readFileSync } from 'node:fs';
import path from 'node:path';

import type {
  ChapterMarginNotesPayload,
  ConcordanceHitPayload,
  CrossRefPayload,
  EgwCommentaryHitPayload,
  KjvChapterPayload,
  KjvStrongsChapterPayload,
  MarginNotePayload,
  StrongsLexiconPayload,
} from '../ipc-contract.js';
import type { MainRuntime } from '../runtime.js';
import { handleIpc } from './handle.js';
import type { MainRuntimeAccess } from './runtime-access.js';

export interface BibleIpc {
  readonly register: () => void;
  readonly ensureCommentaryBackfillDone: (runtime: MainRuntime) => Promise<void>;
}

export const makeBibleIpc = (options: {
  readonly getRuntime: MainRuntimeAccess;
  readonly isDev: boolean;
}): BibleIpc => {
  let bibleImportsPromise: Promise<void> | null = null;
  let xrefsImportsPromise: Promise<void> | null = null;
  let marginNotesImportsPromise: Promise<void> | null = null;
  let commentaryBackfillPromise: Promise<void> | null = null;
  let registered = false;

  const traceBibleIpc = <Args extends readonly unknown[], R>(
    channel: string,
    handler: (...args: Args) => Promise<R>,
    summarize: (result: R) => string,
  ): ((...args: Args) => Promise<R>) => {
    if (!options.isDev) return handler;
    return async (...args: Args): Promise<R> => {
      const t0 = Date.now();
      const payload = args
        .slice(1)
        .map((arg) => (typeof arg === 'string' ? `"${arg}"` : String(arg)))
        .join(', ');
      console.error(`[main] ${channel}(${payload})`);
      try {
        const result = await handler(...args);
        console.error(`[main] ${channel} → ${summarize(result)} (${String(Date.now() - t0)}ms)`);
        return result;
      } catch (error) {
        console.error(
          `[main] ${channel} ✗ ${error instanceof Error ? error.message : String(error)} (${String(Date.now() - t0)}ms)`,
        );
        throw error;
      }
    };
  };

  const coreAssetPath = (name: string): string =>
    path.join(__dirname, '..', '..', 'node_modules', '@bible', 'core', 'assets', name);

  const readCoreAssetText = (name: string): string => readFileSync(coreAssetPath(name), 'utf-8');

  const runBundledKjvImport = (corpus: BibleCorpusService): Effect.Effect<void, SqlError> => {
    const kjv = JSON.parse(readCoreAssetText('kjv.json')) as KjvAssetFile;
    const strongs = JSON.parse(
      readCoreAssetText('kjv-strongs.json'),
    ) as readonly StrongsVerseAsset[];
    const lex = JSON.parse(readCoreAssetText('strongs.json')) as Record<
      string,
      StrongsLexiconAsset
    >;
    return corpus
      .importKjv(kjv, strongs)
      .pipe(Effect.andThen(corpus.importStrongsLexicon(lex)), Effect.asVoid);
  };

  const ensureBibleImportsDone = (runtime: MainRuntime): Promise<void> => {
    const cached = bibleImportsPromise;
    if (cached !== null) return cached;
    const fresh = runtime
      .runPromise(
        BibleCorpus.pipe(
          Effect.flatMap((corpus) =>
            corpus.status().pipe(
              Effect.flatMap((status) => {
                if (status.kjv) return Effect.asVoid(Effect.void);
                return runBundledKjvImport(corpus);
              }),
            ),
          ),
        ),
      )
      .catch((error: unknown) => {
        bibleImportsPromise = null;
        throw error;
      });
    bibleImportsPromise = fresh;
    return fresh;
  };

  const ensureXrefsImportsDone = (runtime: MainRuntime): Promise<void> => {
    const cached = xrefsImportsPromise;
    if (cached !== null) return cached;
    const fresh = runtime.runPromise(
      BibleCorpus.pipe(
        Effect.flatMap((corpus) =>
          corpus.status().pipe(
            Effect.flatMap((status) => {
              if (status.crossReferences) return Effect.asVoid(Effect.void);
              const openbible = JSON.parse(
                readCoreAssetText('cross-refs.json'),
              ) as CrossReferenceAsset;
              const tske = JSON.parse(
                readCoreAssetText('cross-refs-tske.json'),
              ) as CrossReferenceAsset;
              return corpus
                .importCrossReferences('openbible', openbible)
                .pipe(Effect.andThen(corpus.importCrossReferences('tske', tske)), Effect.asVoid);
            }),
          ),
        ),
      ),
    );
    xrefsImportsPromise = fresh;
    return fresh;
  };

  const ensureMarginNotesImportsDone = (runtime: MainRuntime): Promise<void> => {
    const cached = marginNotesImportsPromise;
    if (cached !== null) return cached;
    const fresh = runtime.runPromise(
      BibleCorpus.pipe(
        Effect.flatMap((corpus) =>
          corpus.status().pipe(
            Effect.flatMap((status) => {
              if (status.marginNotes) return Effect.asVoid(Effect.void);
              const notes = JSON.parse(readCoreAssetText('margin-notes.json')) as MarginNotesAsset;
              return corpus.importMarginNotes(notes).pipe(Effect.asVoid);
            }),
          ),
        ),
      ),
    );
    marginNotesImportsPromise = fresh;
    return fresh;
  };

  const ensureCommentaryBackfillDone = (runtime: MainRuntime): Promise<void> => {
    const cached = commentaryBackfillPromise;
    if (cached !== null) return cached;
    const fresh = runtime
      .runPromise(
        EGWParagraphDatabase.pipe(
          Effect.flatMap((database) => database.backfillBibleRefs(extractScriptureRefs)),
        ),
      )
      .then((result) => {
        if (result.scanned > 0) {
          console.error(
            `[main] EGW bible-ref backfill: scanned ${String(result.scanned)} paragraphs, inserted ${String(result.inserted)} refs`,
          );
        }
      })
      .catch((error: unknown) => {
        console.warn('[main] EGW bible-ref backfill failed:', error);
      });
    commentaryBackfillPromise = fresh;
    return fresh;
  };

  const CONCORDANCE_HIT_CAP = 200;
  const LEXICON_RESULT_CAP = 50;

  const register = (): void => {
    if (registered) return;
    registered = true;

    handleIpc(
      'bible:getChapter',
      traceBibleIpc(
        'bible:getChapter',
        async (_event, book, chapter): Promise<KjvChapterPayload | null> => {
          const runtime = options.getRuntime();
          if (runtime === null) return null;
          await ensureBibleImportsDone(runtime);
          const verses = await runtime.runPromise(
            BibleDatabase.pipe(Effect.flatMap((database) => database.getChapter(book, chapter))),
          );
          if (verses.length === 0) return null;
          return {
            book,
            bookName: getBibleBook(book)?.name ?? `Book ${String(book)}`,
            chapter,
            verses: verses.map((verse) => ({ verse: verse.verse, text: verse.text })),
          };
        },
        (result) =>
          result === null
            ? 'null'
            : `${result.bookName} ${String(result.chapter)} (${String(result.verses.length)}v)`,
      ),
    );

    handleIpc(
      'bible:reimportKjv',
      traceBibleIpc(
        'bible:reimportKjv',
        async (): Promise<void> => {
          const runtime = options.getRuntime();
          if (runtime === null) return;
          bibleImportsPromise = null;
          await runtime.runPromise(
            BibleCorpus.pipe(
              Effect.flatMap((corpus) =>
                corpus.resetKjv().pipe(Effect.andThen(runBundledKjvImport(corpus)), Effect.asVoid),
              ),
            ),
          );
        },
        () => 'reimported',
      ),
    );

    handleIpc(
      'bible:getChapterStrongs',
      traceBibleIpc(
        'bible:getChapterStrongs',
        async (_event, book, chapter): Promise<KjvStrongsChapterPayload | null> => {
          const runtime = options.getRuntime();
          if (runtime === null) return null;
          await ensureBibleImportsDone(runtime);
          const result = await runtime.runPromise(
            BibleDatabase.pipe(
              Effect.flatMap((database) => database.getChapterStrongs(book, chapter)),
            ),
          );
          return Option.match(result, {
            onNone: () => null,
            onSome: (strongsChapter): KjvStrongsChapterPayload => ({
              book: strongsChapter.book,
              bookName: strongsChapter.bookName,
              chapter: strongsChapter.chapter,
              verses: strongsChapter.verses.map((verse) => ({
                verse: verse.verse,
                words: verse.words.map((word) => ({
                  text: word.text,
                  ...(word.strongsNumbers.length === 0 ? {} : { strongs: word.strongsNumbers }),
                  ...(word.italic ? { italic: true } : {}),
                })),
              })),
            }),
          });
        },
        (result) =>
          result === null
            ? 'null'
            : `${result.bookName} ${String(result.chapter)} (${String(result.verses.length)}v strongs)`,
      ),
    );

    handleIpc(
      'bible:strongsLookup',
      traceBibleIpc(
        'bible:strongsLookup',
        async (_event, code): Promise<StrongsLexiconPayload | null> => {
          const runtime = options.getRuntime();
          if (runtime === null) return null;
          await ensureBibleImportsDone(runtime);
          const result = await runtime.runPromise(
            BibleDatabase.pipe(Effect.flatMap((database) => database.getStrongsEntry(code))),
          );
          return Option.match(result, {
            onNone: () => null,
            onSome: (entry): StrongsLexiconPayload => ({
              code: entry.number,
              language: entry.language,
              lemma: entry.lemma,
              transliteration: entry.transliteration ?? '',
              definition: entry.definition,
            }),
          });
        },
        (result) => (result === null ? 'null' : `${result.code} ${result.lemma}`),
      ),
    );

    handleIpc(
      'bible:searchVersesByStrongs',
      traceBibleIpc(
        'bible:searchVersesByStrongs',
        async (_event, code): Promise<readonly ConcordanceHitPayload[]> => {
          const runtime = options.getRuntime();
          if (runtime === null) return [];
          await ensureBibleImportsDone(runtime);
          const hits = await runtime.runPromise(
            BibleDatabase.pipe(
              Effect.flatMap((database) =>
                database.getVersesWithStrongs(code, CONCORDANCE_HIT_CAP),
              ),
            ),
          );
          return hits.map(
            (hit): ConcordanceHitPayload => ({
              book: hit.book,
              bookName: hit.bookName,
              chapter: hit.chapter,
              verse: hit.verse,
              text: hit.text,
              word: hit.word,
            }),
          );
        },
        (result) => `${String(result.length)} hit(s)`,
      ),
    );

    handleIpc(
      'bible:countStrongsHits',
      traceBibleIpc(
        'bible:countStrongsHits',
        async (_event, code): Promise<number> => {
          const runtime = options.getRuntime();
          if (runtime === null) return 0;
          await ensureBibleImportsDone(runtime);
          return runtime.runPromise(
            BibleDatabase.pipe(Effect.flatMap((database) => database.getStrongsCount(code))),
          );
        },
        (count) => `${String(count)} total`,
      ),
    );

    handleIpc(
      'bible:searchLexicon',
      traceBibleIpc(
        'bible:searchLexicon',
        async (_event, query): Promise<readonly StrongsLexiconPayload[]> => {
          const runtime = options.getRuntime();
          if (runtime === null) return [];
          await ensureBibleImportsDone(runtime);
          const entries = await runtime.runPromise(
            BibleDatabase.pipe(
              Effect.flatMap((database) => database.searchStrongs(query, LEXICON_RESULT_CAP)),
            ),
          );
          return entries.map((entry) => ({
            code: entry.number,
            language: entry.language,
            lemma: entry.lemma,
            transliteration: entry.transliteration ?? '',
            definition: entry.definition,
          }));
        },
        (result) => `${String(result.length)} entr(y/ies)`,
      ),
    );

    handleIpc(
      'bible:getCrossRefs',
      traceBibleIpc(
        'bible:getCrossRefs',
        async (_event, book, chapter, verse): Promise<readonly CrossRefPayload[]> => {
          const runtime = options.getRuntime();
          if (runtime === null) return [];
          await ensureXrefsImportsDone(runtime);
          const rows = await runtime.runPromise(
            BibleDatabase.pipe(
              Effect.flatMap((database) => database.getCrossRefs(book, chapter, verse)),
            ),
          );
          return rows.flatMap((row): readonly CrossRefPayload[] =>
            row.verse === null
              ? []
              : [
                  {
                    source: row.source,
                    targetBook: row.book,
                    targetChapter: row.chapter,
                    targetVerse: row.verse,
                    targetVerseEnd: row.verseEnd,
                  },
                ],
          );
        },
        (result) => `${String(result.length)} xref(s)`,
      ),
    );

    handleIpc(
      'bible:getVersesWithCrossRefs',
      traceBibleIpc(
        'bible:getVersesWithCrossRefs',
        async (_event, book, chapter): Promise<readonly number[]> => {
          const runtime = options.getRuntime();
          if (runtime === null) return [];
          await ensureXrefsImportsDone(runtime);
          const verses = await runtime.runPromise(
            BibleDatabase.pipe(
              Effect.flatMap((database) => database.versesWithCrossRefs(book, chapter)),
            ),
          );
          return Array.from(verses).sort((a, b) => a - b);
        },
        (result) => `${String(result.length)} verse(s) w/ xrefs`,
      ),
    );

    handleIpc(
      'bible:getMarginNotes',
      traceBibleIpc(
        'bible:getMarginNotes',
        async (_event, book, chapter, verse): Promise<readonly MarginNotePayload[]> => {
          const runtime = options.getRuntime();
          if (runtime === null) return [];
          await ensureMarginNotesImportsDone(runtime);
          const rows = await runtime.runPromise(
            BibleDatabase.pipe(
              Effect.flatMap((database) => database.getMarginNotes(book, chapter, verse)),
            ),
          );
          return rows.map(
            (row): MarginNotePayload => ({
              idx: row.index,
              type: row.type,
              phrase: row.phrase,
              text: row.text,
            }),
          );
        },
        (result) => `${String(result.length)} note(s)`,
      ),
    );

    handleIpc(
      'bible:getVersesWithNotes',
      traceBibleIpc(
        'bible:getVersesWithNotes',
        async (_event, book, chapter): Promise<readonly number[]> => {
          const runtime = options.getRuntime();
          if (runtime === null) return [];
          await ensureMarginNotesImportsDone(runtime);
          const verses = await runtime.runPromise(
            BibleDatabase.pipe(
              Effect.flatMap((database) => database.versesWithNotes(book, chapter)),
            ),
          );
          return Array.from(verses).sort((a, b) => a - b);
        },
        (result) => `${String(result.length)} verse(s) with notes`,
      ),
    );

    handleIpc(
      'bible:getChapterMarginNotes',
      traceBibleIpc(
        'bible:getChapterMarginNotes',
        async (_event, book, chapter): Promise<readonly ChapterMarginNotesPayload[]> => {
          const runtime = options.getRuntime();
          if (runtime === null) return [];
          await ensureMarginNotesImportsDone(runtime);
          const byVerse = await runtime.runPromise(
            BibleDatabase.pipe(
              Effect.flatMap((database) => database.chapterMarginNotes(book, chapter)),
            ),
          );
          const result: ChapterMarginNotesPayload[] = [];
          for (const [verse, notes] of byVerse) {
            result.push({
              verse,
              notes: notes.map((note) => ({
                idx: note.index,
                type: note.type,
                phrase: note.phrase,
                text: note.text,
              })),
            });
          }
          result.sort((left, right) => left.verse - right.verse);
          return result;
        },
        (result) => `${String(result.length)} verse(s) with notes`,
      ),
    );

    handleIpc(
      'bible:getEgwCommentary',
      traceBibleIpc(
        'bible:getEgwCommentary',
        async (_event, book, chapter, verse): Promise<readonly EgwCommentaryHitPayload[]> => {
          const runtime = options.getRuntime();
          if (runtime === null) return [];
          await ensureCommentaryBackfillDone(runtime);
          const rows = await runtime.runPromise(
            EGWParagraphDatabase.pipe(
              Effect.flatMap((database) => database.getParagraphsByBibleRef(book, chapter, verse)),
            ),
          );
          return rows.map(
            (row): EgwCommentaryHitPayload => ({
              bookId: row.bookId,
              bookCode: row.bookCode,
              bookTitle: row.bookTitle,
              refcodeShort: Option.getOrNull(row.refcode_short),
              snippet: nodesToText(row.nodes),
              puborder: row.puborder,
            }),
          );
        },
        (result) => `${String(result.length)} commentary hit(s)`,
      ),
    );

    handleIpc(
      'bible:getBibleVersesWithCommentary',
      traceBibleIpc(
        'bible:getBibleVersesWithCommentary',
        async (_event, book, chapter): Promise<readonly number[]> => {
          const runtime = options.getRuntime();
          if (runtime === null) return [];
          await ensureCommentaryBackfillDone(runtime);
          return runtime.runPromise(
            EGWParagraphDatabase.pipe(
              Effect.flatMap((database) => database.getBibleVersesWithCommentary(book, chapter)),
            ),
          );
        },
        (result) => `${String(result.length)} verse(s) w/ commentary`,
      ),
    );
  };

  return { register, ensureCommentaryBackfillDone };
};
