import { BunServices } from '@effect/platform-bun';
import { Argument, Command, Flag } from 'effect/unstable/cli';
import { BibleDatabase, type ConcordanceResult, type StrongsEntry } from '@bible/core/bible-db';
import { Console, Effect, Layer, Option } from 'effect';

import { BibleData, BibleDataLive } from '~/src/data/bible/data';
import { getVersesForQuery, parseVerseQuery } from '~/src/data/bible/parse';
import { getBook, type BibleDataSyncService, type Verse } from '~/src/data/bible/types';

// Variadic args to capture "john 3:16" or "john" "3:16" etc.
const query = Argument.string('query').pipe(Argument.variadic());

const jsonFlag = Flag.boolean('json').pipe(
  Flag.withDescription('Output JSON instead of formatted text'),
  Flag.withDefault(false),
);

const limitFlag = Flag.integer('limit').pipe(
  Flag.withDescription('Max results for search/list output'),
  Flag.optional,
);

// Format a single verse for output
function formatVerse(verse: Verse): string {
  const book = getBook(verse.book);
  const ref =
    book !== undefined
      ? `${book.name} ${verse.chapter}:${verse.verse}`
      : `${verse.book} ${verse.chapter}:${verse.verse}`;
  return `${ref}\n${verse.text}`;
}

// Print verses to stdout
function printVerses(verses: Verse[]): Effect.Effect<void> {
  if (verses.length === 0) {
    return Console.log('No verses found.');
  }
  const output = verses.map(formatVerse).join('\n\n');
  return Console.log(output);
}

// Print search results
function printSearchResults(query: string, verses: Verse[]): Effect.Effect<void> {
  if (verses.length === 0) {
    return Console.log(`No verses found matching "${query}".`);
  }
  const header = `Found ${verses.length} verse${verses.length === 1 ? '' : 's'} matching "${query}":\n`;
  const output = verses.map(formatVerse).join('\n\n');
  return Console.log(header + '\n' + output);
}

export const verse = Command.make('verse', { query, json: jsonFlag, limit: limitFlag }, (args) =>
  Effect.gen(function* () {
    const data = yield* BibleData;
    const queryStr = args.query.join(' ').trim();
    const limit = Option.getOrElse(args.limit, () => 10);
    const services = yield* Effect.context();
    const runSync = Effect.runSyncWith(services);

    if (queryStr.length === 0) {
      yield* Console.log('Usage: bible verse <reference or search query> [--json]');
      yield* Console.log('');
      yield* Console.log('Examples:');
      yield* Console.log('  bible verse john 3:16       # Single verse');
      yield* Console.log('  bible verse john 3          # Full chapter');
      yield* Console.log('  bible verse john 3:16-18    # Verse range');
      yield* Console.log('  bible verse john 3-5        # Chapter range');
      yield* Console.log('  bible verse ruth            # Full book');
      yield* Console.log('  bible verse "faith"         # Text search');
      return;
    }

    // Create sync wrapper for parse functions
    const syncData: BibleDataSyncService = {
      getBooks: () => runSync(data.getBooks()),
      getBook: (n) => runSync(data.getBook(n)),
      getChapter: (b, c) => runSync(data.getChapter(b, c)),
      getVerse: (b, c, v) => runSync(data.getVerse(b, c, v)),
      searchVerses: (q, l) => runSync(data.searchVerses(q, l)),
      parseReference: data.parseReference,
      getNextChapter: data.getNextChapter,
      getPrevChapter: data.getPrevChapter,
    };

    const parsed = parseVerseQuery(queryStr, syncData);

    if (parsed._tag === 'search') {
      const results = syncData.searchVerses(parsed.query, limit);
      const verses = results.map((r) => r.verse);
      if (args.json) {
        yield* Console.log(
          JSON.stringify({ mode: 'search', query: parsed.query, verses }, null, 2),
        );
        return;
      }
      yield* printSearchResults(parsed.query, verses);
    } else {
      const verses = getVersesForQuery(parsed, syncData);
      if (args.json) {
        yield* Console.log(JSON.stringify({ mode: 'reference', query: queryStr, verses }, null, 2));
        return;
      }
      yield* printVerses(verses);
    }
  }).pipe(Effect.provide(BibleDataLive)),
);

// --- Concordance Command ---

// Detect if query is a Strong's number (H/G followed by digits)
export function isStrongsNumber(query: string): boolean {
  return /^[HhGg]\d+$/.test(query);
}

// Format a Strong's entry for output
function formatStrongsEntry(entry: StrongsEntry): string {
  const prefix = entry.number.startsWith('H') ? 'Hebrew' : 'Greek';
  const xlit = entry.transliteration ?? entry.lemma;
  return `${entry.number} - ${entry.lemma} (${xlit}) [${prefix}]\n${entry.definition}`;
}

// Format concordance results with verse reference
function formatConcordanceResult(result: ConcordanceResult): string {
  const book = getBook(result.book);
  const bookName = book?.name ?? String(result.book);
  return `${bookName} ${result.chapter}:${result.verse} - "${result.word ?? ''}"`;
}

// Layer for concordance command
const ConcordanceLive = BibleDatabase.Default.pipe(Layer.provideMerge(BunServices.layer));

export const concordance = Command.make(
  'concordance',
  { query, json: jsonFlag, limit: limitFlag },
  (args) =>
    Effect.gen(function* () {
      const db = yield* BibleDatabase;
      const queryStr = args.query.join(' ').trim();
      const limit = Option.getOrElse(args.limit, () => 50);

      if (queryStr.length === 0) {
        yield* Console.log("Usage: bible concordance <Strong's number or English word> [--json]");
        yield* Console.log('');
        yield* Console.log('Examples:');
        yield* Console.log("  bible concordance H157      # Hebrew word by Strong's number");
        yield* Console.log("  bible concordance G26       # Greek word by Strong's number");
        yield* Console.log('  bible concordance love      # Search definitions for "love"');
        return;
      }

      if (isStrongsNumber(queryStr)) {
        const number = queryStr.toUpperCase();
        const entryOpt = yield* db.getStrongsEntry(number);

        if (Option.isNone(entryOpt)) {
          if (args.json) {
            yield* Console.log(JSON.stringify({ mode: 'strongs', number, entry: null }, null, 2));
            return;
          }
          yield* Console.log(`Strong's number ${number} not found.`);
          return;
        }

        const entry = entryOpt.value;
        const results = yield* db.getVersesWithStrongs(number);

        const limitedResults = results.slice(0, limit);

        if (args.json) {
          yield* Console.log(
            JSON.stringify({ mode: 'strongs', number, entry, verses: limitedResults }, null, 2),
          );
          return;
        }

        yield* Console.log(formatStrongsEntry(entry));
        yield* Console.log('');

        if (results.length === 0) {
          yield* Console.log('No verses found with this word.');
        } else {
          yield* Console.log(`Found in ${results.length} verse${results.length === 1 ? '' : 's'}:`);
          yield* Console.log('');
          for (const result of limitedResults) {
            yield* Console.log(formatConcordanceResult(result));
          }
          if (results.length > limit) {
            yield* Console.log(`... and ${results.length - limit} more`);
          }
        }
      } else {
        const entries = yield* db.searchStrongs(queryStr, limit);

        if (args.json) {
          yield* Console.log(JSON.stringify({ mode: 'search', query: queryStr, entries }, null, 2));
          return;
        }

        if (entries.length === 0) {
          yield* Console.log(`No Strong's entries found matching "${queryStr}".`);
          return;
        }

        yield* Console.log(
          `Found ${entries.length} Strong's entr${entries.length === 1 ? 'y' : 'ies'} matching "${queryStr}":`,
        );
        yield* Console.log('');
        for (const entry of entries) {
          yield* Console.log(formatStrongsEntry(entry));
          yield* Console.log('');
        }
      }
    }).pipe(Effect.scoped, Effect.provide(ConcordanceLive)),
);

export const bible = Command.make('bible').pipe(Command.withSubcommands([verse, concordance]));
