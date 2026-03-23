/**
 * Bible Data Tools for AI Tool Calling
 *
 * Defines tools that the AI can invoke during generation to look up
 * Strong's entries, verse words, cross-references, margin notes,
 * and EGW writings.
 * Uses BibleDatabase and EGW services from @bible/core via provided runtimes.
 */

import {
  BibleDatabase,
  type BibleDatabaseError,
  type StrongsEntry,
  type VerseWord,
} from '@bible/core/bible-db';
import { EGWParagraphDatabase } from '@bible/core/egw-db';
import { EGWCommentaryService } from '@bible/core/egw-commentary';
import { EGWService, createEGWTool } from '@bible/core/egw-service';
import { BunServices } from '@effect/platform-bun';
import { tool, jsonSchema } from 'ai';
import { Effect, Layer, ManagedRuntime, Option } from 'effect';

import { BibleState, BibleStateLive } from '../data/bible/state.js';
import { createCrossRefService } from '../data/study/cross-refs.js';

// Shared layer + runtime for tool execution (includes BibleState for cross-ref classifications)
const BibleToolsLayer = Layer.mergeAll(BibleStateLive).pipe(
  Layer.provideMerge(BibleDatabase.Default),
  Layer.provideMerge(BunServices.layer),
);
const runtime = ManagedRuntime.make(BibleToolsLayer);

// EGW layer + runtime for EGW tool execution
const EGWToolsLayer = Layer.mergeAll(EGWService.Live, EGWCommentaryService.Live).pipe(
  Layer.provide(EGWParagraphDatabase.Default),
  Layer.provideMerge(BunServices.layer),
);
const egwRuntime = ManagedRuntime.make(EGWToolsLayer);

function runEffect<A>(effect: Effect.Effect<A, BibleDatabaseError, BibleDatabase>): Promise<A> {
  return runtime.runPromise(effect);
}

// Lazy cross-ref service singleton
let _crossRefService: ReturnType<typeof createCrossRefService> | null = null;
function getCrossRefService(): ReturnType<typeof createCrossRefService> | null {
  if (_crossRefService !== null) return _crossRefService;
  try {
    const state = runtime.runSync(
      Effect.gen(function* () {
        return yield* BibleState;
      }),
    );
    _crossRefService = createCrossRefService(state);
    return _crossRefService;
  } catch {
    return null;
  }
}

export const bibleTools = {
  strongs_lookup: tool({
    description:
      "Look up a Strong's concordance entry by number (e.g., H157, G26). Returns the lemma, transliteration, and definition.",
    inputSchema: jsonSchema<{ number: string }>({
      type: 'object',
      properties: {
        number: {
          type: 'string',
          description: "Strong's number, e.g. H157 (Hebrew) or G26 (Greek)",
        },
      },
      required: ['number'],
    }),
    execute: async ({ number }) => {
      const entryOpt = await runEffect(
        Effect.gen(function* () {
          const db = yield* BibleDatabase;
          return yield* db.getStrongsEntry(number.toUpperCase());
        }),
      );
      if (Option.isNone(entryOpt)) {
        return { found: false, number };
      }
      const e: StrongsEntry = entryOpt.value;
      return {
        found: true,
        number: e.number,
        language: e.number.startsWith('H') ? 'Hebrew' : 'Greek',
        lemma: e.lemma,
        transliteration: e.transliteration ?? e.lemma,
        pronunciation: e.pronunciation ?? null,
        definition: e.definition,
        kjvDefinition: e.kjvDefinition ?? null,
      };
    },
  }),

  search_strongs: tool({
    description:
      "Search Strong's concordance by English definition (e.g., 'love', 'faith'). Returns matching entries.",
    inputSchema: jsonSchema<{ query: string; limit?: number }>({
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description: 'English word or phrase to search definitions for',
        },
        limit: {
          type: 'number',
          description: 'Max results to return (default 10)',
        },
      },
      required: ['query'],
    }),
    execute: async ({ query, limit }) => {
      const entries = await runEffect(
        Effect.gen(function* () {
          const db = yield* BibleDatabase;
          return yield* db.searchStrongs(query, limit ?? 10);
        }),
      );
      return entries.map((e: StrongsEntry) => ({
        number: e.number,
        language: e.number.startsWith('H') ? 'Hebrew' : 'Greek',
        lemma: e.lemma,
        transliteration: e.transliteration ?? e.lemma,
        definition: e.definition,
      }));
    },
  }),

  verse_words: tool({
    description:
      "Get the words of a Bible verse with their Strong's numbers. Useful for word studies and seeing the original language roots.",
    inputSchema: jsonSchema<{ book: number; chapter: number; verse: number }>({
      type: 'object',
      properties: {
        book: { type: 'number', description: 'Book number (1-66, e.g. 1=Genesis, 43=John)' },
        chapter: { type: 'number', description: 'Chapter number' },
        verse: { type: 'number', description: 'Verse number' },
      },
      required: ['book', 'chapter', 'verse'],
    }),
    execute: async ({ book, chapter, verse }) => {
      const words = await runEffect(
        Effect.gen(function* () {
          const db = yield* BibleDatabase;
          return yield* db.getVerseWords(book, chapter, verse);
        }),
      );
      return words.map((w: VerseWord) => ({
        text: w.text,
        strongs: w.strongsNumbers ?? [],
      }));
    },
  }),

  cross_refs: tool({
    description:
      'Get cross-references for a Bible verse. Returns related passages that illuminate the text.',
    inputSchema: jsonSchema<{ book: number; chapter: number; verse: number }>({
      type: 'object',
      properties: {
        book: { type: 'number', description: 'Book number (1-66)' },
        chapter: { type: 'number', description: 'Chapter number' },
        verse: { type: 'number', description: 'Verse number' },
      },
      required: ['book', 'chapter', 'verse'],
    }),
    execute: async ({ book, chapter, verse }) => {
      // Try enriched cross-refs first (includes cached classifications + user refs)
      const svc = getCrossRefService();
      if (svc !== null) {
        const refs = svc.getCrossRefs(book, chapter, verse);
        return refs.map((r) => ({
          book: r.book,
          chapter: r.chapter,
          verse: r.verse,
          verseEnd: r.verseEnd,
          source: r.source,
          type: r.classification,
          preview: r.previewText,
        }));
      }
      // Fallback: raw refs without classifications
      const refs = await runEffect(
        Effect.gen(function* () {
          const db = yield* BibleDatabase;
          return yield* db.getCrossRefs(book, chapter, verse);
        }),
      );
      return refs.map((r) => ({
        book: r.book,
        chapter: r.chapter,
        verse: r.verse,
        verseEnd: r.verseEnd,
        source: r.source,
        type: null,
        preview: r.previewText,
      }));
    },
  }),

  margin_notes: tool({
    description:
      'Get margin notes for a Bible verse. Includes Hebrew/Greek annotations, alternate readings, and name meanings.',
    inputSchema: jsonSchema<{ book: number; chapter: number; verse: number }>({
      type: 'object',
      properties: {
        book: { type: 'number', description: 'Book number (1-66)' },
        chapter: { type: 'number', description: 'Chapter number' },
        verse: { type: 'number', description: 'Verse number' },
      },
      required: ['book', 'chapter', 'verse'],
    }),
    execute: async ({ book, chapter, verse }) => {
      const notes = await runEffect(
        Effect.gen(function* () {
          const db = yield* BibleDatabase;
          return yield* db.getMarginNotes(book, chapter, verse);
        }),
      );
      return notes.map((n) => ({
        type: n.type,
        phrase: n.phrase,
        text: n.text,
      }));
    },
  }),

  strongs_occurrences: tool({
    description:
      "Count how many times a Strong's number appears in the Bible and list the verses. Useful for seeing how a word is used across Scripture.",
    inputSchema: jsonSchema<{ strongsNumber: string; limit?: number }>({
      type: 'object',
      properties: {
        strongsNumber: {
          type: 'string',
          description: "Strong's number, e.g. H157 or G26",
        },
        limit: {
          type: 'number',
          description: 'Max verse results to return (default 20)',
        },
      },
      required: ['strongsNumber'],
    }),
    execute: async ({ strongsNumber, limit }) => {
      const number = strongsNumber.toUpperCase();
      const [count, verses] = await runEffect(
        Effect.gen(function* () {
          const db = yield* BibleDatabase;
          const c = yield* db.getStrongsCount(number);
          const v = yield* db.getVersesWithStrongs(number);
          return [c, v] as const;
        }),
      );
      return {
        strongsNumber: number,
        totalOccurrences: count,
        verses: verses.slice(0, limit ?? 20).map((v) => ({
          book: v.book,
          chapter: v.chapter,
          verse: v.verse,
          word: v.word,
        })),
      };
    },
  }),

  egw_writings: createEGWTool(egwRuntime),
};
