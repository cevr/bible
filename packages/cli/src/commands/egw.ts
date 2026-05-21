/**
 * EGW CLI Commands
 *
 * Provides CLI access to EGW writings:
 *   bible egw "PP 351.1"             - Local refcode lookup (single paragraph)
 *   bible egw "PP 351"               - Local refcode lookup (full page)
 *   bible egw "PP"                   - Local book info + TOC
 *   bible egw "great controversy"    - Local FTS search (fallback when not a refcode)
 *   bible egw books                  - List installed books in the local DB
 *   bible egw catalog --search smith - Browse remote API catalog
 *   bible egw download <code>        - Fetch any book from API into local DB
 *   bible egw search <query>         - Search (--remote hits the API directly)
 *   bible egw open "PP 351.1"        - Open the TUI at a refcode (handled in main.ts)
 */

import {
  formatEGWRef,
  isSearchQuery,
  nodesToText,
  parseEGWRef,
  EGWApiClient,
  EGWAuth,
  type EGWParsedRef,
  type EGWSearchQuery,
  type Schemas as EGWSchemas,
} from '@bible/core/egw';
import { EGWCommentaryService } from '@bible/core/egw-commentary';
import { EGWParagraphDatabase } from '@bible/core/egw-db';
import * as EGWDbBun from '@bible/core/egw-db/bun';
import { EGWService, type EGWSearchResult } from '@bible/core/egw-service';
import { downloadBookToLocal } from '@bible/core/sync';
import { Argument, Command, Flag } from 'effect/unstable/cli';
import { FetchHttpClient } from 'effect/unstable/http';
import { BunServices } from '@effect/platform-bun';
import { Console, Effect, Layer, Option, Stream } from 'effect';

import { parseVerseQuery } from '~/src/data/bible/parse';

// Variadic args to capture "PP 351.1" or "PP" "351.1" etc.
const query = Argument.string('query').pipe(Argument.variadic());

// ============================================================================
// Layers
// ============================================================================

const AuthLayer = EGWAuth.layerLiveFs().pipe(Layer.provide(FetchHttpClient.layer));

const ApiClientLayer = EGWApiClient.Live.pipe(
  Layer.provide(AuthLayer),
  Layer.provide(FetchHttpClient.layer),
);

/**
 * Layer providing EGWService (local DB) — used by lookup/local-search commands.
 */
const ServiceLayer = EGWService.Default.pipe(
  Layer.provide(EGWDbBun.Default),
  Layer.provide(BunServices.layer),
);

/**
 * Layer providing EGWCommentaryService (local DB) — used by `commentary`.
 */
const CommentaryLayer = EGWCommentaryService.Default.pipe(
  Layer.provide(EGWDbBun.Default),
  Layer.provide(BunServices.layer),
);

/**
 * Layer providing EGWApiClient + EGWParagraphDatabase + EGWService — used by
 * commands that mix remote API and local DB (catalog, download, --remote search).
 */
const FullLayer = Layer.mergeAll(
  ApiClientLayer,
  EGWDbBun.Default,
  EGWService.Default.pipe(Layer.provide(EGWDbBun.Default)),
).pipe(Layer.provide(BunServices.layer));

// ============================================================================
// Helpers
// ============================================================================

const stripHtml = (html: string): string => html.replace(/<[^>]*>/g, '');

function formatLocalSearchResult(r: EGWSearchResult, index: number): string {
  const ref = r.refcodeShort ?? `[${r.bookCode}]`;
  const title = r.bookTitle !== r.bookCode ? ` (${r.bookTitle})` : '';
  const text = nodesToText(r.nodes);
  const snippet =
    text.length > 0 ? text.slice(0, 200) + (text.length > 200 ? '…' : '') : '(no content)';
  return `  ${index + 1}. ${ref}${title}\n     ${snippet}`;
}

function formatRemoteHit(h: EGWSchemas.SearchHit, index: number): string {
  const ref = h.refcode_short ?? `[${h.pub_code}]`;
  const author = h.refcode_long?.match(/\(([^)]+)\)\s*$/)?.[1];
  const title = ` (${h.pub_name}${author !== undefined ? ` — ${author}` : ''})`;
  const snippet =
    h.snippet !== null && h.snippet !== undefined
      ? stripHtml(h.snippet).replace(/\s+/g, ' ').trim().slice(0, 240)
      : '';
  const gated = h.action_required !== undefined ? ` [${h.action_required}]` : '';
  return `  ${index + 1}. ${ref}${title}${gated}\n     ${snippet}`;
}

// ============================================================================
// Local lookup / search
// ============================================================================

const doLocalSearch = (query: string, bookCode?: string, limit = 20) =>
  Effect.gen(function* () {
    const service = yield* EGWService;
    const results = yield* service.search(query, limit, bookCode);

    if (results.length === 0) {
      yield* Console.log(`No local results found for "${query}".`);
      yield* Console.log('Try `bible egw search <query> --remote` to query the EGW API.');
      return;
    }

    const scope = bookCode !== undefined ? ` in ${bookCode}` : '';
    yield* Console.log(`Local search results for "${query}"${scope} (${results.length}):\n`);
    for (const [i, r] of results.entries()) {
      yield* Console.log(formatLocalSearchResult(r, i));
    }
  });

const doLookup = (parsed: Exclude<EGWParsedRef, EGWSearchQuery>) =>
  Effect.gen(function* () {
    const service = yield* EGWService;
    const refStr = formatEGWRef(parsed);

    const bookOpt = yield* service.getBook(parsed.bookCode);
    if (Option.isNone(bookOpt)) {
      yield* Console.log(`Book "${parsed.bookCode}" not found in local database.`);
      yield* Console.log(`Try \`bible egw download ${parsed.bookCode}\` to fetch it from the API.`);
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
          const text = nodesToText(p.nodes);
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
            const text = nodesToText(p.nodes);
            yield* Console.log(`  ${ref}`);
            yield* Console.log(`  ${text}\n`);
          }
        }
        break;
      }
      case 'book': {
        yield* Console.log(`${book.title} (${parsed.bookCode}) — ${book.author}`);
        yield* Console.log(`Paragraphs: ${book.paragraphCount ?? 'unknown'}`);

        const chapters = yield* service.getChapters(parsed.bookCode);
        if (chapters.length > 0) {
          yield* Console.log('\nTable of Contents:');
          for (const ch of chapters) {
            const title = ch.title ?? '';
            const ref = ch.refcodeShort ?? '';
            yield* Console.log(`  ${ref}  ${title}`);
          }
        }
        break;
      }
    }
  });

// ============================================================================
// books — list installed books in the local DB
// ============================================================================

const booksAuthor = Flag.string('author').pipe(
  Flag.withDescription('Filter by author (case-insensitive substring match)'),
  Flag.optional,
);
const booksJson = Flag.boolean('json').pipe(
  Flag.withDescription('Output JSON instead of a table'),
  Flag.withDefault(false),
);

export const egwBooks = Command.make('books', { author: booksAuthor, json: booksJson }, (args) =>
  Effect.gen(function* () {
    const service = yield* EGWService;
    const all = yield* service.getBooks();

    const filtered =
      args.author._tag === 'Some'
        ? all.filter((b) =>
            b.author
              .toLowerCase()
              .includes(args.author._tag === 'Some' ? args.author.value.toLowerCase() : ''),
          )
        : all;

    if (args.json) {
      yield* Console.log(JSON.stringify(filtered, null, 2));
      return;
    }

    if (filtered.length === 0) {
      yield* Console.log(
        'No books found in local DB.' +
          (args.author._tag === 'Some' ? ` (author filter: ${args.author.value})` : ''),
      );
      return;
    }

    yield* Console.log(`${filtered.length} installed book(s):\n`);
    yield* Console.log('CODE       | AUTHOR                          | PARAS    | TITLE');
    yield* Console.log('-----------|---------------------------------|----------|------');
    for (const b of filtered) {
      const code = b.bookCode.padEnd(10);
      const author = (b.author.length > 31 ? b.author.slice(0, 28) + '…' : b.author).padEnd(31);
      const paras = String(b.paragraphCount ?? '-').padEnd(8);
      yield* Console.log(`${code} | ${author} | ${paras} | ${b.title}`);
    }
  }),
).pipe(Command.provide(() => ServiceLayer));

// ============================================================================
// catalog — browse remote API catalog
// ============================================================================

const catalogLang = Flag.string('lang').pipe(
  Flag.withDescription('Language code (default: en)'),
  Flag.withDefault('en'),
);
const catalogSearch = Flag.string('search').pipe(
  Flag.withAlias('q'),
  Flag.withDescription('Title search substring'),
  Flag.optional,
);
const catalogAuthor = Flag.string('author').pipe(
  Flag.withDescription('Filter results by author substring (client-side)'),
  Flag.optional,
);
const catalogLimit = Flag.integer('limit').pipe(
  Flag.withDescription('Max results to display (default: 50)'),
  Flag.withDefault(50),
);
const catalogJson = Flag.boolean('json').pipe(
  Flag.withDescription('Output raw JSON'),
  Flag.withDefault(false),
);

export const egwCatalog = Command.make(
  'catalog',
  {
    lang: catalogLang,
    search: catalogSearch,
    author: catalogAuthor,
    limit: catalogLimit,
    json: catalogJson,
  },
  (args) =>
    Effect.gen(function* () {
      const client = yield* EGWApiClient;

      const params: Partial<EGWSchemas.BooksQueryParams> = {
        lang: args.lang,
        limit: args.limit,
        ...(args.search._tag === 'Some' ? { search: args.search.value } : {}),
      };

      const stream = client.getBooks(params);
      const collected = yield* stream.pipe(Stream.take(args.limit), Stream.runCollect);

      const books = [...collected];
      const filtered =
        args.author._tag === 'Some'
          ? books.filter((b) =>
              b.author
                .toLowerCase()
                .includes(args.author._tag === 'Some' ? args.author.value.toLowerCase() : ''),
            )
          : books;

      if (args.json) {
        yield* Console.log(JSON.stringify(filtered, null, 2));
        return;
      }

      if (filtered.length === 0) {
        yield* Console.log('No catalog results.');
        return;
      }

      yield* Console.log(`${filtered.length} catalog result(s):\n`);
      yield* Console.log('CODE       | ID     | AUTHOR                          | TITLE');
      yield* Console.log('-----------|--------|---------------------------------|------');
      for (const b of filtered) {
        const code = b.code.padEnd(10);
        const id = String(b.book_id).padEnd(6);
        const author = (b.author.length > 31 ? b.author.slice(0, 28) + '…' : b.author).padEnd(31);
        yield* Console.log(`${code} | ${id} | ${author} | ${b.title}`);
      }
      yield* Console.log(
        '\nUse `bible egw download <CODE>` to fetch one of these into the local DB.',
      );
    }),
).pipe(Command.provide(() => FullLayer));

// ============================================================================
// download — fetch a book from the API into the local DB
// ============================================================================

const downloadCode = Argument.string('code').pipe(Argument.optional);
const downloadId = Flag.integer('id').pipe(
  Flag.withDescription('Book ID (skips the search step; use when a code is ambiguous or unknown)'),
  Flag.optional,
);
const downloadLang = Flag.string('lang').pipe(
  Flag.withDescription('Language code (default: en)'),
  Flag.withDefault('en'),
);
const downloadConcurrency = Flag.integer('concurrency').pipe(
  Flag.withDescription('Parallel chapter fetches (default: 5)'),
  Flag.withDefault(5),
);

export const egwDownload = Command.make(
  'download',
  {
    code: downloadCode,
    id: downloadId,
    lang: downloadLang,
    concurrency: downloadConcurrency,
  },
  (args) =>
    Effect.gen(function* () {
      const client = yield* EGWApiClient;
      const db = yield* EGWParagraphDatabase;

      // Resolve the target Book (from API). Prefer --id, else search by code.
      let book: EGWSchemas.Book | null = null;

      if (args.id._tag === 'Some') {
        book = yield* client.getBook(args.id.value);
      } else if (args.code._tag === 'Some') {
        const code = args.code.value;
        // The remote /content/books?search= endpoint matches against TITLE,
        // not against the book code, so single-token codes like "DAR" don't
        // round-trip. We pull title-search candidates and pick exact code
        // matches. If that fails, the user should use --id (look up via
        // `bible egw catalog --search <title>`).
        const candidates = yield* client
          .getBooks({ lang: args.lang, search: code, limit: 50 })
          .pipe(Stream.take(50), Stream.runCollect);
        const exact = [...candidates].filter((b) => b.code.toUpperCase() === code.toUpperCase());

        if (exact.length === 0) {
          yield* Console.log(
            `No book with code "${code}" matched a title-search in lang=${args.lang}.`,
          );
          yield* Console.log('');
          yield* Console.log('Find the book ID with the catalog command, then download by --id:');
          yield* Console.log(`  bible egw catalog --search "<title>"`);
          yield* Console.log(`  bible egw download --id <BOOK_ID>`);
          return;
        }
        if (exact.length > 1) {
          yield* Console.log(`Multiple books match code "${code}":`);
          for (const c of exact) {
            yield* Console.log(`  id=${c.book_id} ${c.author} — ${c.title}`);
          }
          yield* Console.log('Use `bible egw download --id <ID>` to disambiguate.');
          return;
        }
        book = exact[0] ?? null;
      } else {
        yield* Console.log('Usage: bible egw download <CODE>');
        yield* Console.log('       bible egw download --id <BOOK_ID>');
        yield* Console.log('');
        yield* Console.log(
          'Browse the remote catalog with `bible egw catalog --search <term>` to find codes/ids.',
        );
        return;
      }

      if (book === null) {
        yield* Console.log('Could not resolve book.');
        return;
      }

      yield* Console.log(
        `Downloading "${book.title}" (${book.code}, id ${book.book_id}) by ${book.author}...`,
      );

      const result = yield* downloadBookToLocal(book, {
        chapterConcurrency: args.concurrency,
      });

      switch (result._tag) {
        case 'success':
          yield* Console.log(
            `✓ Stored ${result.storedParagraphs} paragraphs (${result.storedBibleRefs} bible refs).`,
          );
          if (result.chapterErrors.length > 0) {
            yield* Console.log(
              `  ${result.chapterErrors.length} chapter(s) failed; book marked as 'failed' in sync_status.`,
            );
            for (const err of result.chapterErrors.slice(0, 5)) {
              yield* Console.log(`    - ${err}`);
            }
          }
          break;
        case 'skipped':
          yield* Console.log(`Skipped: ${result.reason}`);
          break;
        case 'failed':
          yield* Console.log(`✗ Failed: ${result.reason}`);
          if (result.chapterErrors.length > 0) {
            for (const err of result.chapterErrors.slice(0, 5)) {
              yield* Console.log(`    - ${err}`);
            }
          }
          break;
      }

      yield* Console.log('Rebuilding FTS5 index...');
      yield* db.rebuildFtsIndex();
      yield* Console.log('Done.');
    }),
).pipe(Command.provide(() => FullLayer));

// ============================================================================
// search — local FTS by default, --remote to hit the API
// ============================================================================

const searchQuery = Argument.string('query').pipe(Argument.variadic());
const searchBook = Flag.string('book').pipe(
  Flag.withDescription('Scope to a single book code (local search only)'),
  Flag.optional,
);
const searchLimit = Flag.integer('limit').pipe(
  Flag.withDescription('Max results (default: 20)'),
  Flag.withDefault(20),
);
const searchRemote = Flag.boolean('remote').pipe(
  Flag.withDescription('Hit the EGW API instead of the local FTS index'),
  Flag.withDefault(false),
);
const searchJson = Flag.boolean('json').pipe(
  Flag.withDescription('Output raw JSON (especially useful with --remote)'),
  Flag.withDefault(false),
);
const searchLang = Flag.string('lang').pipe(
  Flag.withDescription('Language code for --remote (default: en)'),
  Flag.withDefault('en'),
);

export const egwSearch = Command.make(
  'search',
  {
    query: searchQuery,
    book: searchBook,
    limit: searchLimit,
    remote: searchRemote,
    json: searchJson,
    lang: searchLang,
  },
  (args) =>
    Effect.gen(function* () {
      const queryStr = args.query.join(' ').trim();
      if (queryStr.length === 0) {
        yield* Console.log('Usage: bible egw search <query> [--book CODE] [--remote] [--limit N]');
        return;
      }

      if (args.remote) {
        const client = yield* EGWApiClient;
        const response = yield* client.search({
          query: queryStr,
          lang: args.lang,
          limit: args.limit,
        });

        if (args.json) {
          yield* Console.log(JSON.stringify(response, null, 2));
          return;
        }

        if (response.results.length === 0) {
          yield* Console.log(`No remote results for "${queryStr}".`);
          return;
        }

        yield* Console.log(
          `Remote search "${queryStr}" — ${response.total} total, showing ${response.results.length}:\n`,
        );
        for (const [i, hit] of response.results.entries()) {
          yield* Console.log(formatRemoteHit(hit, i));
        }
      } else {
        if (args.json) {
          const service = yield* EGWService;
          const results = yield* service.search(
            queryStr,
            args.limit,
            args.book._tag === 'Some' ? args.book.value : undefined,
          );
          yield* Console.log(JSON.stringify(results, null, 2));
          return;
        }
        yield* doLocalSearch(
          queryStr,
          args.book._tag === 'Some' ? args.book.value : undefined,
          args.limit,
        );
      }
    }),
).pipe(Command.provide(() => FullLayer));

// ============================================================================
// lookup — explicit refcode lookup (no FTS fallback) with --json
// ============================================================================

const lookupRef = Argument.string('ref').pipe(Argument.variadic());
const lookupJson = Flag.boolean('json').pipe(
  Flag.withDescription('Output JSON instead of formatted text'),
  Flag.withDefault(false),
);

const collectLookupData = (parsed: Exclude<EGWParsedRef, EGWSearchQuery>) =>
  Effect.gen(function* () {
    const service = yield* EGWService;
    const refStr = formatEGWRef(parsed);

    const bookOpt = yield* service.getBook(parsed.bookCode);
    if (Option.isNone(bookOpt)) {
      return { ref: refStr, found: false as const, bookCode: parsed.bookCode };
    }

    const book = bookOpt.value;

    switch (parsed._tag) {
      case 'paragraph':
      case 'paragraph-range':
      case 'page': {
        const page = parsed.page;
        const pageResponse = yield* service.getPage(parsed.bookCode, page);
        if (pageResponse === null) {
          return { ref: refStr, found: false as const, book, page };
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

        return {
          ref: refStr,
          found: true as const,
          kind: 'page' as const,
          book,
          page,
          chapterHeading: pageResponse.chapterHeading,
          paragraphs: paragraphs.map((p) => ({
            refcode: p.refcodeShort ?? '',
            text: nodesToText(p.nodes),
          })),
        };
      }
      case 'page-range': {
        const pages: Array<{
          page: number;
          chapterHeading: string | null;
          paragraphs: Array<{ refcode: string; text: string }>;
        }> = [];
        for (let page = parsed.pageStart; page <= parsed.pageEnd; page++) {
          const pageResponse = yield* service.getPage(parsed.bookCode, page);
          if (pageResponse === null) continue;
          pages.push({
            page,
            chapterHeading: pageResponse.chapterHeading,
            paragraphs: pageResponse.paragraphs.map((p) => ({
              refcode: p.refcodeShort ?? '',
              text: nodesToText(p.nodes),
            })),
          });
        }
        return {
          ref: refStr,
          found: true as const,
          kind: 'page-range' as const,
          book,
          pageStart: parsed.pageStart,
          pageEnd: parsed.pageEnd,
          pages,
        };
      }
      case 'book': {
        const chapters = yield* service.getChapters(parsed.bookCode);
        return {
          ref: refStr,
          found: true as const,
          kind: 'book' as const,
          book,
          chapters: chapters.map((ch) => ({
            refcode: ch.refcodeShort ?? '',
            title: ch.title ?? '',
          })),
        };
      }
    }
  });

export const egwLookup = Command.make('lookup', { ref: lookupRef, json: lookupJson }, (args) =>
  Effect.gen(function* () {
    const refStr = args.ref.join(' ').trim();
    if (refStr.length === 0) {
      yield* Console.log('Usage: bible egw lookup <refcode> [--json]');
      yield* Console.log('');
      yield* Console.log('Examples:');
      yield* Console.log('  bible egw lookup "PP 351.1"     # Single paragraph');
      yield* Console.log('  bible egw lookup "PP 351"       # Full page');
      yield* Console.log('  bible egw lookup "PP 351-355"   # Page range');
      yield* Console.log('  bible egw lookup "PP"           # Book info + TOC');
      return;
    }

    const parsed = parseEGWRef(refStr);
    if (isSearchQuery(parsed)) {
      yield* Console.error(`Not a valid EGW refcode: "${refStr}"`);
      yield* Console.error('Use `bible egw search <query>` for FTS instead.');
      return yield* Effect.sync(() => process.exit(1));
    }

    if (args.json) {
      const data = yield* collectLookupData(parsed);
      yield* Console.log(JSON.stringify(data, null, 2));
      return;
    }

    yield* doLookup(parsed);
  }),
).pipe(Command.provide(() => ServiceLayer));

// ============================================================================
// commentary — EGW Bible Commentary lookup by Bible verse
// ============================================================================

const commentaryRef = Argument.string('verse').pipe(Argument.variadic());
const commentaryJson = Flag.boolean('json').pipe(
  Flag.withDescription('Output JSON instead of formatted text'),
  Flag.withDefault(false),
);

export const egwCommentary = Command.make(
  'commentary',
  { verse: commentaryRef, json: commentaryJson },
  (args) =>
    Effect.gen(function* () {
      const verseStr = args.verse.join(' ').trim();
      if (verseStr.length === 0) {
        yield* Console.log('Usage: bible egw commentary <book chapter:verse> [--json]');
        yield* Console.log('');
        yield* Console.log('Examples:');
        yield* Console.log('  bible egw commentary "john 3:16"');
        yield* Console.log('  bible egw commentary "daniel 9:24" --json');
        return;
      }

      const parsed = parseVerseQuery(verseStr);
      if (parsed._tag !== 'single') {
        yield* Console.error(
          `Commentary requires a single verse reference (e.g. "john 3:16"); got ${parsed._tag}.`,
        );
        return yield* Effect.sync(() => process.exit(1));
      }

      const verseRef = {
        book: parsed.ref.book,
        chapter: parsed.ref.chapter,
        verse: parsed.ref.verse ?? 1,
      };

      const service = yield* EGWCommentaryService;
      const result = yield* service.getCommentary(verseRef);

      if (args.json) {
        yield* Console.log(JSON.stringify(result, null, 2));
        return;
      }

      if (result.entries.length === 0) {
        yield* Console.log(`No EGW commentary found for ${verseStr}.`);
        return;
      }

      yield* Console.log(
        `${result.entries.length} commentary entr${result.entries.length === 1 ? 'y' : 'ies'} for ${verseStr}:\n`,
      );
      for (const entry of result.entries) {
        yield* Console.log(`  ${entry.refcode} (${entry.bookTitle})`);
        yield* Console.log(`  ${entry.content}\n`);
      }
    }),
).pipe(Command.provide(() => CommentaryLayer));

// ============================================================================
// open — placeholder (intercepted in main.ts before reaching this)
// ============================================================================

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

    yield* Console.log(`Opening: ${queryStr}`);
    yield* Console.log('(This should launch the TUI)');
  }),
);

// ============================================================================
// Root egw command — variadic ref/query for backwards compat
// ============================================================================

export const egwWithSubcommands = Command.make('egw', { query }, (args) =>
  Effect.gen(function* () {
    const queryStr = args.query.join(' ').trim();

    if (queryStr.length === 0) {
      yield* Console.log('Usage: bible egw <refcode>');
      yield* Console.log('       bible egw books');
      yield* Console.log('       bible egw catalog --search <term>');
      yield* Console.log('       bible egw download <code>');
      yield* Console.log('       bible egw search <query> [--remote]');
      yield* Console.log('       bible egw open <refcode>');
      yield* Console.log('');
      yield* Console.log('Examples:');
      yield* Console.log('  bible egw "PP 351.1"          # Single paragraph');
      yield* Console.log('  bible egw "PP 351.1-5"        # Paragraph range');
      yield* Console.log('  bible egw "PP 351"            # Full page');
      yield* Console.log('  bible egw "PP 351-355"        # Page range');
      yield* Console.log('  bible egw "PP"                # Book info + TOC');
      yield* Console.log('  bible egw search "great controversy"');
      yield* Console.log('  bible egw search "daniel" --remote');
      yield* Console.log('  bible egw catalog --search "uriah smith"');
      yield* Console.log('  bible egw download DAR');
      return;
    }

    const parsed = parseEGWRef(queryStr);

    if (isSearchQuery(parsed)) {
      // Top-level fallback: when input isn't a refcode, run a local FTS search.
      // Use `bible egw search <query> --remote` for explicit remote search.
      yield* doLocalSearch(parsed.query, undefined, 20);
    } else {
      yield* doLookup(parsed);
    }
  }),
).pipe(
  Command.withSubcommands([
    egwOpen,
    egwBooks,
    egwCatalog,
    egwDownload,
    egwSearch,
    egwLookup,
    egwCommentary,
  ]),
  Command.provide(() => ServiceLayer),
);
