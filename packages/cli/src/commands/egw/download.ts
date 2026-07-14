import { EGWApiClient, type Schemas as EGWSchemas } from '@bible/core/egw';
import { EGWParagraphDatabase } from '@bible/core/egw-db';
import { downloadBookToLocal } from '@bible/core/sync';
import { Console, Effect, Stream } from 'effect';
import { Argument, Command, Flag } from 'effect/unstable/cli';

import { FullLayer } from './layers.js';

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
