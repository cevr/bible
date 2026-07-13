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
 *   bible egw study <subject>        - Rank books by remote hits, download top-N, show local hits
 *   bible egw search <query>         - Search (--remote hits the API directly)
 *   bible egw open "PP 351.1"        - Open the TUI at a refcode
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
import { parseBibleQuery, Reference as BibleReference } from '@bible/core/bible';
import { EGWCommentaryService } from '@bible/core/egw-commentary';
import { EGWParagraphDatabase } from '@bible/core/egw-db';
import * as EGWDbBun from '@bible/core/egw-db/bun';
import { downloadBookToLocal } from '@bible/core/sync';
import { Reference, type Paragraph, type Publication, type SearchHit } from '@bible/core/writings';
import { WritingsService } from '@bible/core/writings/service';
import { Argument, Command, Flag } from 'effect/unstable/cli';
import { FetchHttpClient } from 'effect/unstable/http';
import { BunServices } from '@effect/platform-bun';
import { Console, Effect, FileSystem, Layer, Option, Stream } from 'effect';

import { parseEgwLocation } from '../lib/parse-egw-location.js';
import { InteractiveReader, InvalidReaderReference } from '../services/interactive-reader.js';

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
 * Layer providing WritingsService (local DB) — used by lookup/local-search commands.
 */
const ServiceLayer = WritingsService.Live.pipe(
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
 * Layer providing EGWApiClient + EGWParagraphDatabase + WritingsService — used by
 * commands that mix remote API and local DB (catalog, download, --remote search).
 */
const FullLayer = Layer.mergeAll(
  ApiClientLayer,
  EGWDbBun.Default,
  WritingsService.Live.pipe(Layer.provide(EGWDbBun.Default)),
).pipe(Layer.provide(BunServices.layer));

// ============================================================================
// Helpers
// ============================================================================

const stripHtml = (html: string): string => html.replace(/<[^>]*>/g, '');

const paragraphRefcode = (paragraph: Paragraph): string =>
  Option.getOrElse(paragraph.reference.refcode, () => `[${paragraph.reference.publication}]`);

const publicationJson = (publication: Publication) => ({
  id: publication.id,
  code: publication.code,
  title: publication.title,
  author: publication.author,
  paragraphCount: Option.getOrNull(publication.paragraphCount),
});

const paragraphJson = (paragraph: Paragraph) => ({
  reference: {
    publication: paragraph.reference.publication,
    order: paragraph.reference.order,
    page: Option.getOrNull(paragraph.reference.page),
    number: Option.getOrNull(paragraph.reference.number),
    refcode: Option.getOrNull(paragraph.reference.refcode),
  },
  paragraphId: Option.getOrNull(paragraph.paragraphId),
  nodes: paragraph.nodes,
  elementType: Option.getOrNull(paragraph.elementType),
  elementSubtype: Option.getOrNull(paragraph.elementSubtype),
});

const searchHitJson = (hit: SearchHit) => ({
  publication: publicationJson(hit.publication),
  paragraph: paragraphJson(hit.paragraph),
});

function formatLocalSearchResult(r: SearchHit, index: number): string {
  const ref = paragraphRefcode(r.paragraph);
  const title = r.publication.title !== r.publication.code ? ` (${r.publication.title})` : '';
  const text = nodesToText(r.paragraph.nodes);
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
    const service = yield* WritingsService;
    const results = yield* service.search(query, {
      limit,
      publication: bookCode === undefined ? undefined : Reference.publication(bookCode),
    });

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
    const service = yield* WritingsService;
    const refStr = formatEGWRef(parsed);

    const bookOpt = yield* service.publication(Reference.publication(parsed.bookCode)).pipe(
      Effect.map(Option.some),
      Effect.catchTag('WritingsPublicationNotFoundError', () => Effect.succeed(Option.none())),
    );
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
        const pageResponse = yield* service
          .page(Reference.page(parsed.bookCode, page))
          .pipe(Effect.catchTag('WritingsPageNotFoundError', () => Effect.succeed(null)));
        if (pageResponse === null) {
          yield* Console.log(`Page ${page} not found in ${book.title} (${parsed.bookCode}).`);
          return;
        }

        yield* Console.log(`${book.title} (${parsed.bookCode}) — Page ${page}\n`);

        if (Option.isSome(pageResponse.heading)) {
          yield* Console.log(`  ${pageResponse.heading.value}\n`);
        }

        const paragraphs =
          parsed._tag === 'paragraph'
            ? pageResponse.paragraphs.filter(
                (p) => Option.getOrUndefined(p.reference.number) === parsed.paragraph,
              )
            : parsed._tag === 'paragraph-range'
              ? pageResponse.paragraphs.filter((p) =>
                  Option.exists(
                    p.reference.number,
                    (number) => number >= parsed.paragraphStart && number <= parsed.paragraphEnd,
                  ),
                )
              : pageResponse.paragraphs;

        if (paragraphs.length === 0) {
          yield* Console.log(`No paragraphs found for ${refStr}.`);
          return;
        }

        for (const p of paragraphs) {
          const ref = Option.getOrElse(p.reference.refcode, () => '');
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
          const pageResponse = yield* service
            .page(Reference.page(parsed.bookCode, page))
            .pipe(Effect.catchTag('WritingsPageNotFoundError', () => Effect.succeed(null)));
          if (pageResponse === null) continue;

          for (const p of pageResponse.paragraphs) {
            const ref = Option.getOrElse(p.reference.refcode, () => '');
            const text = nodesToText(p.nodes);
            yield* Console.log(`  ${ref}`);
            yield* Console.log(`  ${text}\n`);
          }
        }
        break;
      }
      case 'book': {
        yield* Console.log(`${book.title} (${parsed.bookCode}) — ${book.author}`);
        yield* Console.log(
          `Paragraphs: ${Option.getOrElse(book.paragraphCount, () => 'unknown' as const)}`,
        );

        const chapters = yield* service.headings(Reference.publication(parsed.bookCode));
        if (chapters.length > 0) {
          yield* Console.log('\nTable of Contents:');
          for (const ch of chapters) {
            const title = ch.title;
            const ref = Option.getOrElse(ch.reference.refcode, () => '');
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
    const service = yield* WritingsService;
    const all = yield* service.catalog();

    const filtered =
      args.author._tag === 'Some'
        ? all.filter((b) =>
            b.author
              .toLowerCase()
              .includes(args.author._tag === 'Some' ? args.author.value.toLowerCase() : ''),
          )
        : all;

    if (args.json) {
      yield* Console.log(JSON.stringify(filtered.map(publicationJson), null, 2));
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
      const code = b.code.padEnd(10);
      const author = (b.author.length > 31 ? b.author.slice(0, 28) + '…' : b.author).padEnd(31);
      const paras = String(Option.getOrElse(b.paragraphCount, () => '-')).padEnd(8);
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
// study — subject-driven corpus builder: remote-search a subject, download the
// books that cover it best, then surface the local hits across everything.
// ============================================================================

const studySubject = Argument.string('subject').pipe(Argument.variadic());
const studyLimit = Flag.integer('limit').pipe(
  Flag.withDescription('Max books to download, ranked by hit count (default: 15)'),
  Flag.withDefault(15),
);
const studyMinHits = Flag.integer('min-hits').pipe(
  Flag.withDescription('Only download books with at least this many remote hits (default: 2)'),
  Flag.withDefault(2),
);
const studyScan = Flag.integer('scan').pipe(
  Flag.withDescription('Remote hits to scan when ranking (paged in 100s; default: 200)'),
  Flag.withDefault(200),
);
const studyAuthor = Flag.string('author').pipe(
  Flag.withDescription(
    'Only rank/download books whose author matches (case-insensitive substring). Repeatable.',
  ),
  Flag.atLeast(0),
);
const studyPioneers = Flag.boolean('pioneers').pipe(
  Flag.withDescription('Preset --author filter for the nine SDA pioneers'),
  Flag.withDefault(false),
);
const studyLang = Flag.string('lang').pipe(
  Flag.withDescription('Language code (default: en)'),
  Flag.withDefault('en'),
);
const studyConcurrency = Flag.integer('concurrency').pipe(
  Flag.withDescription('Parallel chapter fetches per book (default: 5)'),
  Flag.withDefault(5),
);
const studyDryRun = Flag.boolean('dry-run').pipe(
  Flag.withDescription('Rank and list the books that WOULD be downloaded; download nothing'),
  Flag.withDefault(false),
);
const studyResults = Flag.integer('results').pipe(
  Flag.withDescription('Local result snippets to print after downloading (default: 30)'),
  Flag.withDefault(30),
);
const studyExport = Flag.string('export').pipe(
  Flag.withDescription('Write the local hits to a refcode-tagged markdown corpus at this path'),
  Flag.optional,
);
const studyFull = Flag.boolean('full').pipe(
  Flag.withDescription('In --export, write the full paragraph text (not the console snippet)'),
  Flag.withDefault(false),
);

/** The nine historic SDA pioneers, for the --pioneers preset. */
const PIONEER_AUTHORS = [
  'James Springer White',
  'Uriah Smith',
  'Josiah Litch',
  'John Nevins Andrews',
  'Stephen Nelson Haskell',
  'William Miller',
  'Sylvester Bliss',
  'Apollos Hale',
  'Charles Fitch',
];

/** A book ranked by how many remote hits it had for the subject. */
interface RankedBook {
  pubCode: string;
  pubName: string;
  hits: number;
}

const REMOTE_PAGE_SIZE = 100; // the EGW /search endpoint caps results at 100 per call

/** Does a book author match any of the requested author filters (substring, case-insensitive)? */
const authorMatches = (author: string, filters: string[]): boolean =>
  filters.length === 0 || filters.some((f) => author.toLowerCase().includes(f.toLowerCase()));

export const egwStudy = Command.make(
  'study',
  {
    subject: studySubject,
    limit: studyLimit,
    minHits: studyMinHits,
    scan: studyScan,
    author: studyAuthor,
    pioneers: studyPioneers,
    lang: studyLang,
    concurrency: studyConcurrency,
    dryRun: studyDryRun,
    results: studyResults,
    export: studyExport,
    full: studyFull,
  },
  (args) =>
    Effect.gen(function* () {
      const subject = args.subject.join(' ').trim();
      if (subject.length === 0) {
        yield* Console.log('Usage: bible egw study <subject> [flags]');
        yield* Console.log('');
        yield* Console.log(
          'Remote-searches a subject, downloads the books that cover it best into the',
        );
        yield* Console.log('local DB, then prints (and optionally exports) the local hits.');
        yield* Console.log('');
        yield* Console.log('Examples:');
        yield* Console.log('  bible egw study "seven last plagues"');
        yield* Console.log('  bible egw study "the day of the Lord" --pioneers --limit 8');
        yield* Console.log(
          '  bible egw study "wrath" --scan 500 --author "Smith" --author "Litch"',
        );
        yield* Console.log('  bible egw study "armageddon" --dry-run');
        yield* Console.log('  bible egw study "loud cry" --export corpus/loud-cry.md');
        return;
      }

      const client = yield* EGWApiClient;
      const db = yield* EGWParagraphDatabase;
      const service = yield* WritingsService;
      const fs = yield* FileSystem.FileSystem;

      const authorFilters = args.pioneers ? PIONEER_AUTHORS : [...args.author];
      const scoped = authorFilters.length > 0;

      // --- Phase 1: remote-search the subject (paged) and rank books by hits --
      yield* Console.log(`Searching the EGW catalog for "${subject}"...`);
      const hits: EGWSchemas.SearchHit[] = [];
      let scanOffset = 0;
      while (hits.length < args.scan) {
        const page = yield* client.search({
          query: subject,
          lang: args.lang,
          limit: Math.min(REMOTE_PAGE_SIZE, args.scan - hits.length),
          offset: scanOffset,
        });
        if (page.results.length === 0) break;
        hits.push(...page.results);
        scanOffset += page.results.length;
        // Stop when the server has no more (short page, or we've seen the lot).
        if (page.results.length < REMOTE_PAGE_SIZE || scanOffset >= page.total) break;
      }

      if (hits.length === 0) {
        yield* Console.log(`No remote results for "${subject}".`);
        return;
      }

      const rankMap = new Map<string, RankedBook>();
      for (const hit of hits) {
        const existing = rankMap.get(hit.pub_code);
        if (existing) {
          existing.hits += 1;
        } else {
          rankMap.set(hit.pub_code, {
            pubCode: hit.pub_code,
            pubName: hit.pub_name,
            hits: 1,
          });
        }
      }

      // Rank by hits, threshold, take a generous slice (author filtering happens
      // at resolve time below, since hits don't reliably carry the author).
      const candidatePool = [...rankMap.values()]
        .filter((b) => b.hits >= args.minHits)
        .sort((a, b) => b.hits - a.hits);

      const installed = yield* service.catalog();
      const installedCodes = new Set(installed.map((b) => b.code.toUpperCase()));

      yield* Console.log(
        `Scanned ${hits.length} hit(s) across ${rankMap.size} book(s); ` +
          `${candidatePool.length} clear --min-hits ${args.minHits}` +
          (scoped ? `; author filter: ${authorFilters.join(', ')}` : '') +
          '.\n',
      );

      // --- Phase 2: resolve pub_code -> Book, apply author filter, download ----
      // We resolve in rank order and keep going until --limit books are selected
      // (a selected book = passes author filter; installed ones count toward the
      // limit but aren't re-downloaded).
      let selected = 0;
      let downloaded = 0;
      let failed = 0;
      let skippedByAuthor = 0;
      const selectedBooks: Array<{
        code: string;
        title: string;
        author: string;
        hits: number;
      }> = [];

      for (const b of candidatePool) {
        if (selected >= args.limit) break;

        // Resolve pub_code -> Book (carries book_id + author) via title-search,
        // matching exactly on code. Mirrors `bible egw download <code>`.
        const candidates = yield* client
          .getBooks({ lang: args.lang, search: b.pubName, limit: 50 })
          .pipe(Stream.take(50), Stream.runCollect);
        const exact = [...candidates].find((c) => c.code.toUpperCase() === b.pubCode.toUpperCase());

        if (!exact) {
          // Unresolvable (e.g. compound pub_code). Only note it when unscoped, to
          // avoid noise; it can't be author-checked anyway.
          if (!scoped) {
            yield* Console.log(`  ✗ ${b.pubCode}: could not resolve to a catalog book; skipping.`);
            failed += 1;
          }
          continue;
        }

        if (!authorMatches(exact.author, authorFilters)) {
          skippedByAuthor += 1;
          continue;
        }

        selected += 1;
        selectedBooks.push({
          code: exact.code,
          title: exact.title,
          author: exact.author,
          hits: b.hits,
        });

        if (installedCodes.has(exact.code.toUpperCase())) {
          yield* Console.log(
            `  ${String(selected).padStart(2)}. ${exact.code.padEnd(10)} ${String(b.hits).padStart(4)} hits [installed]  ${exact.title}`,
          );
          continue;
        }

        if (args.dryRun) {
          yield* Console.log(
            `  ${String(selected).padStart(2)}. ${exact.code.padEnd(10)} ${String(b.hits).padStart(4)} hits [would download]  ${exact.title} (${exact.author})`,
          );
          continue;
        }

        yield* Console.log(
          `  ${String(selected).padStart(2)}. ↓ ${exact.code} — ${exact.title} (${exact.author})...`,
        );
        const result = yield* downloadBookToLocal(exact, {
          chapterConcurrency: args.concurrency,
        });
        switch (result._tag) {
          case 'success':
            yield* Console.log(`      ✓ ${result.storedParagraphs} paragraphs.`);
            downloaded += 1;
            break;
          case 'skipped':
            yield* Console.log(`      – skipped: ${result.reason}`);
            break;
          case 'failed':
            yield* Console.log(`      ✗ failed: ${result.reason}`);
            failed += 1;
            break;
        }
      }

      yield* Console.log('');
      if (args.dryRun) {
        yield* Console.log('--dry-run: nothing downloaded. Re-run without --dry-run to fetch.');
        return;
      }

      if (downloaded > 0) {
        yield* Console.log('Rebuilding FTS5 index...');
        yield* db.rebuildFtsIndex();
      }
      yield* Console.log(
        `Downloaded ${downloaded} book(s)` +
          (failed > 0 ? `, ${failed} failed/unresolved` : '') +
          (skippedByAuthor > 0 ? `, ${skippedByAuthor} skipped by author filter` : '') +
          '.\n',
      );

      // --- Phase 3: local FTS across everything now installed -----------------
      const allBooks = yield* service.catalog();
      const authorByCode = new Map(allBooks.map((b) => [b.code.toUpperCase(), b.author]));
      const rawResults = yield* service.search(subject, {
        limit: args.results * (scoped ? 4 : 1),
      });

      // When author-scoped, keep only hits whose book author matches.
      const localResults = (
        scoped
          ? rawResults.filter((r) =>
              authorMatches(
                authorByCode.get(r.publication.code.toUpperCase()) ?? '',
                authorFilters,
              ),
            )
          : rawResults
      ).slice(0, args.results);

      if (localResults.length === 0) {
        yield* Console.log(
          `No local hits for "${subject}"` +
            (scoped ? ' under the author filter' : '') +
            `. Try \`bible egw search <subject>\` with simpler terms.`,
        );
        return;
      }

      yield* Console.log(
        `Local hits for "${subject}" (${localResults.length}` +
          (scoped ? ', author-scoped' : '') +
          ', across the installed corpus):\n',
      );
      for (const r of localResults) {
        const ref = paragraphRefcode(r.paragraph);
        const author = authorByCode.get(r.publication.code.toUpperCase()) ?? r.publication.title;
        const text = nodesToText(r.paragraph.nodes).replace(/\s+/g, ' ').trim();
        const snippet = text.length > 220 ? `${text.slice(0, 220)}…` : text;
        yield* Console.log(`  ${ref} — ${author}`);
        yield* Console.log(`    ${snippet}\n`);
      }

      // --- Optional: export the local hits as a refcode-tagged markdown corpus -
      if (Option.isSome(args.export)) {
        const path = args.export.value;
        const lines: string[] = [];
        lines.push(`# EGW study corpus — "${subject}"`);
        lines.push('');
        lines.push(
          `_Generated by \`bible egw study\`${scoped ? ` (author filter: ${authorFilters.join(', ')})` : ''}. ` +
            `${localResults.length} local hit(s) across the installed corpus. ` +
            (args.full
              ? 'Full paragraph text — verify the refcode before quoting.'
              : 'Leading-text snippets (run with --full for whole paragraphs) — verify against the refcode.') +
            '_',
        );
        lines.push('');
        let lastAuthor = '';
        for (const r of localResults) {
          const ref = paragraphRefcode(r.paragraph);
          const author = authorByCode.get(r.publication.code.toUpperCase()) ?? r.publication.title;
          if (author !== lastAuthor) {
            lines.push(`\n## ${author}\n`);
            lastAuthor = author;
          }
          const text = nodesToText(r.paragraph.nodes).replace(/\s+/g, ' ').trim();
          const body = args.full || text.length <= 220 ? text : `${text.slice(0, 220)}…`;
          lines.push(`> ${body}`);
          lines.push(`> — **${ref}** (${r.publication.title})`);
          lines.push('');
        }
        yield* fs.writeFileString(path, `${lines.join('\n')}\n`);
        yield* Console.log(
          `\nExported ${localResults.length} hit(s)${args.full ? ' (full text)' : ''} → ${path}`,
        );
      }
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
        // Remote path requires the API client + auth layer.
        yield* Effect.gen(function* () {
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
        }).pipe(Effect.provide(FullLayer));
        return;
      }

      // Local path — only needs the WritingsService layer (no auth required).
      yield* Effect.gen(function* () {
        if (args.json) {
          const service = yield* WritingsService;
          const results = yield* service.search(queryStr, {
            limit: args.limit,
            publication:
              args.book._tag === 'Some' ? Reference.publication(args.book.value) : undefined,
          });
          yield* Console.log(JSON.stringify(results.map(searchHitJson), null, 2));
          return;
        }
        yield* doLocalSearch(
          queryStr,
          args.book._tag === 'Some' ? args.book.value : undefined,
          args.limit,
        );
      }).pipe(Effect.provide(ServiceLayer));
    }),
);

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
    const service = yield* WritingsService;
    const refStr = formatEGWRef(parsed);

    const bookOpt = yield* service.publication(Reference.publication(parsed.bookCode)).pipe(
      Effect.map(Option.some),
      Effect.catchTag('WritingsPublicationNotFoundError', () => Effect.succeed(Option.none())),
    );
    if (Option.isNone(bookOpt)) {
      return { ref: refStr, found: false as const, bookCode: parsed.bookCode };
    }

    const book = bookOpt.value;

    switch (parsed._tag) {
      case 'paragraph':
      case 'paragraph-range':
      case 'page': {
        const page = parsed.page;
        const pageResponse = yield* service
          .page(Reference.page(parsed.bookCode, page))
          .pipe(Effect.catchTag('WritingsPageNotFoundError', () => Effect.succeed(null)));
        if (pageResponse === null) {
          return {
            ref: refStr,
            found: false as const,
            book: publicationJson(book),
            page,
          };
        }

        const paragraphs =
          parsed._tag === 'paragraph'
            ? pageResponse.paragraphs.filter(
                (p) => Option.getOrUndefined(p.reference.number) === parsed.paragraph,
              )
            : parsed._tag === 'paragraph-range'
              ? pageResponse.paragraphs.filter((p) =>
                  Option.exists(
                    p.reference.number,
                    (number) => number >= parsed.paragraphStart && number <= parsed.paragraphEnd,
                  ),
                )
              : pageResponse.paragraphs;

        return {
          ref: refStr,
          found: true as const,
          kind: 'page' as const,
          book: publicationJson(book),
          page,
          chapterHeading: Option.getOrNull(pageResponse.heading),
          paragraphs: paragraphs.map((p) => ({
            refcode: Option.getOrElse(p.reference.refcode, () => ''),
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
          const pageResponse = yield* service
            .page(Reference.page(parsed.bookCode, page))
            .pipe(Effect.catchTag('WritingsPageNotFoundError', () => Effect.succeed(null)));
          if (pageResponse === null) continue;
          pages.push({
            page,
            chapterHeading: Option.getOrNull(pageResponse.heading),
            paragraphs: pageResponse.paragraphs.map((p) => ({
              refcode: Option.getOrElse(p.reference.refcode, () => ''),
              text: nodesToText(p.nodes),
            })),
          });
        }
        return {
          ref: refStr,
          found: true as const,
          kind: 'page-range' as const,
          book: publicationJson(book),
          pageStart: parsed.pageStart,
          pageEnd: parsed.pageEnd,
          pages,
        };
      }
      case 'book': {
        const chapters = yield* service.headings(Reference.publication(parsed.bookCode));
        return {
          ref: refStr,
          found: true as const,
          kind: 'book' as const,
          book: publicationJson(book),
          chapters: chapters.map((ch) => ({
            refcode: Option.getOrElse(ch.reference.refcode, () => ''),
            title: ch.title,
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

      const parsed = parseBibleQuery(verseStr);
      if (parsed._tag !== 'single') {
        yield* Console.error(
          `Commentary requires a single verse reference (e.g. "john 3:16"); got ${parsed._tag}.`,
        );
        return yield* Effect.sync(() => process.exit(1));
      }

      const verseRef = BibleReference.verse(
        parsed.ref.book,
        parsed.ref.chapter,
        parsed.ref.verse ?? 1,
      );

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
// open — interactive reader route
// ============================================================================

export const egwOpen = Command.make('open', { query }, (args) =>
  Effect.gen(function* () {
    const reader = yield* InteractiveReader;
    const queryStr = args.query.join(' ').trim();

    if (queryStr.length === 0) {
      return yield* reader.open({ _tag: 'egw' });
    }

    const location = parseEgwLocation(queryStr);
    if (location === undefined) {
      yield* Console.error(`Could not parse EGW reference: "${queryStr}"`);
      yield* Console.error('Examples: PP 351.1, DA 1, GC 100');
      return yield* new InvalidReaderReference({ reader: 'egw', input: queryStr });
    }

    yield* reader.open({ _tag: 'egw', location });
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
      yield* Console.log('       bible egw study <subject>');
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
      yield* Console.log('  bible egw study "seven last plagues"');
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
    egwStudy,
    egwSearch,
    egwLookup,
    egwCommentary,
  ]),
  Command.provide(() => ServiceLayer),
);
