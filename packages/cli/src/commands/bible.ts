import { BunServices } from '@effect/platform-bun';
import { Argument, Command, Flag } from 'effect/unstable/cli';
import { formatBibleReference, getBibleBook, parseBibleQuery, type Verse } from '@bible/core/bible';
import { BibleService } from '@bible/core/bible/service';
import { BibleDatabase, type ConcordanceHit, type StrongsEntry } from '@bible/core/bible-db';
import * as BibleDbBun from '@bible/core/bible-db/bun';
import { Console, Effect, Layer, Option, Schema, SchemaGetter } from 'effect';

import { versesForBibleQuery } from '~/src/lib/bible-query';

const JsonString = Schema.Unknown.pipe(
  Schema.encodeTo(Schema.String, {
    decode: SchemaGetter.parseJson(),
    encode: SchemaGetter.stringifyJson({ space: 2 }),
  }),
);
const encodeJson = Schema.encodeUnknownEffect(JsonString);

// Variadic args to capture "john 3:16" or "john" "3:16" etc.
const query = Argument.String('query').pipe(Argument.variadic());

const jsonFlag = Flag.Boolean('json').pipe(
  Flag.withDescription('Output JSON instead of formatted text'),
  Flag.withDefault(false),
);

const limitFlag = Flag.Int('limit').pipe(
  Flag.withDescription('Max results for search/list output'),
  Flag.optional,
);

// Format a single verse for output
function formatVerse(verse: Verse): string {
  return `${formatBibleReference(verse.reference)}\n${verse.text}`;
}

const verseJson = (verse: Verse) => ({
  book_name: getBibleBook(verse.reference.book).pipe(
    Option.map((book) => book.name),
    Option.getOrElse(() => `Book ${verse.reference.book}`),
  ),
  book: verse.reference.book,
  chapter: verse.reference.chapter,
  verse: verse.reference.verse,
  text: verse.text,
});

// Print verses to stdout
function printVerses(verses: readonly Verse[]): Effect.Effect<void> {
  if (verses.length === 0) {
    return Console.log('No verses found.');
  }
  const output = verses.map(formatVerse).join('\n\n');
  return Console.log(output);
}

// Print search results
function printSearchResults(query: string, verses: readonly Verse[]): Effect.Effect<void> {
  if (verses.length === 0) {
    return Console.log(`No verses found matching "${query}".`);
  }
  let plural = 's';
  if (verses.length === 1) {
    plural = '';
  }
  const header = `Found ${verses.length} verse${plural} matching "${query}":\n`;
  const output = verses.map(formatVerse).join('\n\n');
  return Console.log(header + '\n' + output);
}

const BibleCommandLive = BibleService.Live.pipe(
  Layer.provide(BibleDbBun.Default),
  Layer.provide(BunServices.layer),
);

export const verse = Command.make('verse', { query, json: jsonFlag, limit: limitFlag }, (args) =>
  Effect.gen(function* () {
    const bible = yield* BibleService;
    const queryStr = args.query.join(' ').trim();
    const limit = Option.getOrElse(args.limit, () => 10);
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

    const parsed = parseBibleQuery(queryStr);

    if (parsed._tag === 'search') {
      const results = yield* bible.search(parsed.query, limit);
      const verses = results.map((r) => r.verse);
      if (args.json) {
        yield* Console.log(
          yield* encodeJson({
            mode: 'search',
            query: parsed.query,
            verses: verses.map(verseJson),
          }),
        );
        return;
      }
      yield* printSearchResults(parsed.query, verses);
    } else {
      const verses = yield* versesForBibleQuery(parsed);
      if (args.json) {
        yield* Console.log(
          yield* encodeJson({
            mode: 'reference',
            query: queryStr,
            verses: verses.map(verseJson),
          }),
        );
        return;
      }
      yield* printVerses(verses);
    }
  }).pipe(Effect.provide(BibleCommandLive)),
);

// --- Concordance Command ---

// Detect if query is a Strong's number (H/G followed by digits)
export function isStrongsNumber(query: string): boolean {
  return /^[HhGg]\d+$/.test(query);
}

// Format a Strong's entry for output
function formatStrongsEntry(entry: StrongsEntry): string {
  let prefix = 'Greek';
  if (entry.number.startsWith('H')) {
    prefix = 'Hebrew';
  }
  const xlit = Option.getOrElse(entry.transliteration, () => entry.lemma);
  return `${entry.number} - ${entry.lemma} (${xlit}) [${prefix}]\n${entry.definition}`;
}

// Format concordance results with verse reference
function formatConcordanceHit(result: ConcordanceHit): string {
  const bookName = getBibleBook(result.book).pipe(
    Option.map((book) => book.name),
    Option.getOrElse(() => String(result.book)),
  );
  return `${bookName} ${result.chapter}:${result.verse} - "${result.word}"`;
}

// Wire shape: Option fields flatten back to `string | null` for JSON consumers.
const strongsEntryJson = (entry: StrongsEntry) => ({
  ...entry,
  transliteration: Option.getOrNull(entry.transliteration),
  pronunciation: Option.getOrNull(entry.pronunciation),
  kjvDefinition: Option.getOrNull(entry.kjvDefinition),
});

// Print the verses a Strong's number occurs in, capped at `limit`
function printStrongsVerses(results: readonly ConcordanceHit[], limit: number) {
  return Effect.gen(function* () {
    if (results.length === 0) {
      yield* Console.log('No verses found with this word.');
      return;
    }
    let plural = 's';
    if (results.length === 1) {
      plural = '';
    }
    yield* Console.log(`Found in ${results.length} verse${plural}:`);
    yield* Console.log('');
    for (const result of results.slice(0, limit)) {
      yield* Console.log(formatConcordanceHit(result));
    }
    if (results.length > limit) {
      yield* Console.log(`... and ${results.length - limit} more`);
    }
  });
}

// Look up one Strong's number and the verses it occurs in
function lookupStrongs(queryStr: string, json: boolean, limit: number) {
  return Effect.gen(function* () {
    const db = yield* BibleDatabase;
    const number = queryStr.toUpperCase();
    const entryOpt = yield* db.getStrongsEntry(number);

    if (Option.isNone(entryOpt)) {
      if (json) {
        yield* Console.log(
          yield* encodeJson({ mode: 'strongs', number, entry: Option.getOrNull(entryOpt) }),
        );
        return;
      }
      yield* Console.log(`Strong's number ${number} not found.`);
      return;
    }

    const entry = entryOpt.value;
    const results = yield* db.getVersesWithStrongs(number);

    if (json) {
      yield* Console.log(
        yield* encodeJson({
          mode: 'strongs',
          number,
          entry: strongsEntryJson(entry),
          verses: results.slice(0, limit),
        }),
      );
      return;
    }

    yield* Console.log(formatStrongsEntry(entry));
    yield* Console.log('');
    yield* printStrongsVerses(results, limit);
  });
}

// Search Strong's definitions for an English word
function searchStrongs(queryStr: string, json: boolean, limit: number) {
  return Effect.gen(function* () {
    const db = yield* BibleDatabase;
    const entries = yield* db.searchStrongs(queryStr, limit);

    if (json) {
      yield* Console.log(
        yield* encodeJson({
          mode: 'search',
          query: queryStr,
          entries: entries.map(strongsEntryJson),
        }),
      );
      return;
    }

    if (entries.length === 0) {
      yield* Console.log(`No Strong's entries found matching "${queryStr}".`);
      return;
    }

    let entrySuffix = 'ies';
    if (entries.length === 1) {
      entrySuffix = 'y';
    }
    yield* Console.log(
      `Found ${entries.length} Strong's entr${entrySuffix} matching "${queryStr}":`,
    );
    yield* Console.log('');
    for (const entry of entries) {
      yield* Console.log(formatStrongsEntry(entry));
      yield* Console.log('');
    }
  });
}

// Layer for concordance command
const ConcordanceLive = BibleDbBun.Default.pipe(Layer.provideMerge(BunServices.layer));

export const concordance = Command.make(
  'concordance',
  { query, json: jsonFlag, limit: limitFlag },
  (args) =>
    Effect.gen(function* () {
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
        yield* lookupStrongs(queryStr, args.json, limit);
      } else {
        yield* searchStrongs(queryStr, args.json, limit);
      }
    }).pipe(Effect.scoped, Effect.provide(ConcordanceLive)),
);

export const bible = Command.make('bible').pipe(Command.withSubcommands([verse, concordance]));
