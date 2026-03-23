/**
 * EGW CLI Commands
 *
 * Provides CLI access to EGW writings:
 * - `bible egw "PP 351.1"` - Lookup by refcode
 * - `bible egw "great controversy"` - Search
 * - `bible egw open "PP 351.1"` - Open TUI at refcode (handled by main.ts)
 */

import {
  formatEGWRef,
  isSearchQuery,
  parseEGWRef,
  type EGWParsedRef,
  type EGWSearchQuery,
} from '@bible/core/egw';
import { EGWParagraphDatabase } from '@bible/core/egw-db';
import { EGWService, type EGWSearchResult } from '@bible/core/egw-service';
import { Argument, Command } from 'effect/unstable/cli';
import { BunServices } from '@effect/platform-bun';
import { Console, Effect, Layer, Option } from 'effect';

// Variadic args to capture "PP 351.1" or "PP" "351.1" etc.
const query = Argument.string('query').pipe(Argument.variadic());

/**
 * EGW services layer for CLI commands
 */
const EGWLayer = EGWService.Default.pipe(
  Layer.provide(EGWParagraphDatabase.Default),
  Layer.provide(BunServices.layer),
);

/**
 * Format a search result for CLI display
 */
function formatSearchResult(r: EGWSearchResult, index: number): string {
  const ref = r.refcodeShort ?? `[${r.bookCode}]`;
  const title = r.bookTitle !== r.bookCode ? ` (${r.bookTitle})` : '';
  const snippet =
    r.content !== null
      ? r.content.replace(/<[^>]*>/g, '').slice(0, 120) + (r.content.length > 120 ? '...' : '')
      : '(no content)';
  return `  ${index + 1}. ${ref}${title}\n     ${snippet}`;
}

/**
 * Perform a search query against EGW service
 */
const doSearch = (parsed: EGWSearchQuery) =>
  Effect.gen(function* () {
    const service = yield* EGWService;
    const results = yield* service.search(parsed.query, 20);

    if (results.length === 0) {
      yield* Console.log(`No results found for "${parsed.query}"`);
      return;
    }

    yield* Console.log(`Search results for "${parsed.query}" (${results.length} found):\n`);
    for (const [i, result] of results.entries()) {
      yield* Console.log(formatSearchResult(result, i));
    }
  });

/**
 * Perform a reference lookup against EGW service
 */
const doLookup = (parsed: Exclude<EGWParsedRef, EGWSearchQuery>) =>
  Effect.gen(function* () {
    const service = yield* EGWService;
    const refStr = formatEGWRef(parsed);

    // Resolve book
    const bookOpt = yield* service.getBook(parsed.bookCode);
    if (Option.isNone(bookOpt)) {
      yield* Console.log(`Book "${parsed.bookCode}" not found in local database.`);
      yield* Console.log('Run "bible egw open" to browse available books in the TUI.');
      return;
    }

    const book = bookOpt.value;

    switch (parsed._tag) {
      case 'paragraph':
      case 'paragraph-range':
      case 'page': {
        const page = parsed._tag === 'page' ? parsed.page : parsed.page;
        const pageResponse = yield* service.getPage(parsed.bookCode, page);
        if (pageResponse === null) {
          yield* Console.log(`Page ${page} not found in ${book.title} (${parsed.bookCode}).`);
          return;
        }

        yield* Console.log(`${book.title} (${parsed.bookCode}) — Page ${page}\n`);

        if (pageResponse.chapterHeading !== null) {
          yield* Console.log(`  ${pageResponse.chapterHeading}\n`);
        }

        const paragraphs =
          parsed._tag === 'paragraph'
            ? pageResponse.paragraphs.filter((p) =>
                p.refcodeShort?.endsWith(`.${parsed.paragraph}`),
              )
            : parsed._tag === 'paragraph-range'
              ? pageResponse.paragraphs.filter((p) => {
                  const match = p.refcodeShort?.match(/\.(\d+)$/);
                  if (match?.[1] === undefined) return false;
                  const num = parseInt(match[1], 10);
                  return num >= parsed.paragraphStart && num <= parsed.paragraphEnd;
                })
              : pageResponse.paragraphs;

        if (paragraphs.length === 0) {
          yield* Console.log(`No paragraphs found for ${refStr}.`);
          return;
        }

        for (const p of paragraphs) {
          const ref = p.refcodeShort ?? '';
          const text = p.content?.replace(/<[^>]*>/g, '') ?? '';
          yield* Console.log(`  ${ref}`);
          yield* Console.log(`  ${text}\n`);
        }
        break;
      }
      case 'page-range': {
        yield* Console.log(
          `${book.title} (${parsed.bookCode}) — Pages ${parsed.pageStart}-${parsed.pageEnd}\n`,
        );
        for (let page = parsed.pageStart; page <= parsed.pageEnd; page++) {
          const pageResponse = yield* service.getPage(parsed.bookCode, page);
          if (pageResponse === null) continue;

          for (const p of pageResponse.paragraphs) {
            const ref = p.refcodeShort ?? '';
            const text = p.content?.replace(/<[^>]*>/g, '') ?? '';
            yield* Console.log(`  ${ref}`);
            yield* Console.log(`  ${text}\n`);
          }
        }
        break;
      }
      case 'book': {
        yield* Console.log(`${book.title} (${parsed.bookCode})`);
        yield* Console.log(`Paragraphs: ${book.paragraphCount ?? 'unknown'}`);

        // Show table of contents
        const chapters = yield* service.getChapters(parsed.bookCode);
        if (chapters.length > 0) {
          yield* Console.log('\nTable of Contents:');
          for (const ch of chapters) {
            const title = ch.title?.replace(/<[^>]*>/g, '') ?? '';
            const ref = ch.refcodeShort ?? '';
            yield* Console.log(`  ${ref}  ${title}`);
          }
        }
        break;
      }
    }
  });

/**
 * egw open subcommand - launches TUI at specified refcode
 * This is handled specially in main.ts, but we define it here for help text
 */
export const egwOpen = Command.make('open', { query }, (args) =>
  Effect.gen(function* () {
    const queryStr = args.query.join(' ').trim();

    if (queryStr.length === 0) {
      yield* Console.log('Usage: bible egw open <refcode>');
      yield* Console.log('');
      yield* Console.log('Opens the EGW reader TUI at the specified location.');
      yield* Console.log('');
      yield* Console.log('Examples:');
      yield* Console.log('  bible egw open "PP 351.1"');
      yield* Console.log('  bible egw open "DA 1"');
      return;
    }

    // This case is handled in main.ts before we get here
    // If we reach here, something went wrong
    yield* Console.log(`Opening: ${queryStr}`);
    yield* Console.log('(This should launch the TUI)');
  }),
);

/**
 * Combined egw command with subcommands
 */
export const egwWithSubcommands = Command.make('egw', { query }, (args) =>
  Effect.gen(function* () {
    const queryStr = args.query.join(' ').trim();

    if (queryStr.length === 0) {
      yield* Console.log('Usage: bible egw <refcode or search query>');
      yield* Console.log('       bible egw open <refcode>');
      yield* Console.log('');
      yield* Console.log('Examples:');
      yield* Console.log('  bible egw "PP 351.1"           # Single paragraph');
      yield* Console.log('  bible egw "PP 351.1-5"         # Paragraph range');
      yield* Console.log('  bible egw "PP 351"             # Full page');
      yield* Console.log('  bible egw "PP 351-355"         # Page range');
      yield* Console.log('  bible egw "PP"                 # Book info + TOC');
      yield* Console.log('  bible egw "great controversy"  # Search');
      yield* Console.log('  bible egw open "PP 351.1"      # Open in TUI');
      return;
    }

    const parsed = parseEGWRef(queryStr);

    if (isSearchQuery(parsed)) {
      yield* doSearch(parsed);
    } else {
      yield* doLookup(parsed);
    }
  }),
).pipe(
  Command.withSubcommands([egwOpen]),
  Command.provide(() => EGWLayer),
);
