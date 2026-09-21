import { EGWApiClient, type Schemas as EGWSchemas } from '@bible/core/egw';
import { CorpusSupply, Target } from '@bible/core/corpus-supply';
import { publicationId } from '@bible/core/writings';
import { Console, Effect, Option, Stream } from 'effect';
import { Argument, Command, Flag } from 'effect/unstable/cli';

import { FullLayer } from './layers.js';

const downloadCode = Argument.String('code').pipe(Argument.optional);
const downloadId = Flag.Int('id').pipe(
  Flag.withDescription('Book ID (skips the search step; use when a code is ambiguous or unknown)'),
  Flag.optional,
);
const downloadLang = Flag.String('lang').pipe(
  Flag.withDescription('Language code (default: en)'),
  Flag.withDefault('en'),
);
export const egwDownload = Command.make(
  'download',
  {
    code: downloadCode,
    id: downloadId,
    lang: downloadLang,
  },
  (args) =>
    Effect.gen(function* () {
      const client = yield* EGWApiClient;
      const supply = yield* CorpusSupply;

      // Resolve the target Book (from API). Prefer --id, else search by code.
      let book: Option.Option<EGWSchemas.Book> = Option.none();

      if (args.id._tag === 'Some') {
        book = Option.some(yield* client.getBook(args.id.value));
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
        book = Option.fromNullishOr(exact[0]);
      } else {
        yield* Console.log('Usage: bible egw download <CODE>');
        yield* Console.log('       bible egw download --id <BOOK_ID>');
        yield* Console.log('');
        yield* Console.log(
          'Browse the remote catalog with `bible egw catalog --search <term>` to find codes/ids.',
        );
        return;
      }

      if (Option.isNone(book)) {
        yield* Console.log('Could not resolve book.');
        return;
      }
      const resolved = book.value;

      yield* Console.log(
        `Downloading "${resolved.title}" (${resolved.code}, id ${resolved.book_id}) by ${resolved.author}...`,
      );

      const receipt = yield* supply.ensure({
        target: Target.writings([publicationId(resolved.book_id)]),
        refresh: true,
      });
      const activation = Option.fromNullishOr(receipt.activated[0]);
      if (Option.isNone(activation)) {
        yield* Console.log('Already installed.');
        return;
      }
      yield* Console.log(`✓ Stored ${activation.value.installed} paragraphs.`);
    }),
).pipe(Command.provide(() => FullLayer));
