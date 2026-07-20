import { EGWApiClient, type Schemas as EGWSchemas } from '@bible/core/egw';
import { Console, Effect, Stream } from 'effect';
import { Command, Flag } from 'effect/unstable/cli';

import { encodeJson } from './format.js';
import { FullLayer } from './layers.js';

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

      let params: Partial<EGWSchemas.BooksQueryParams> = {
        lang: args.lang,
        limit: args.limit,
      };
      if (args.search._tag === 'Some') {
        params = { ...params, search: args.search.value };
      }

      const stream = client.getBooks(params);
      const collected = yield* stream.pipe(Stream.take(args.limit), Stream.runCollect);

      const books = [...collected];
      let filtered = books;
      if (args.author._tag === 'Some') {
        const authorFilter = args.author.value.toLowerCase();
        filtered = books.filter((book) => book.author.toLowerCase().includes(authorFilter));
      }

      if (args.json) {
        yield* Console.log(yield* encodeJson(filtered));
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
        let author = b.author;
        if (author.length > 31) {
          author = `${author.slice(0, 28)}…`;
        }
        author = author.padEnd(31);
        yield* Console.log(`${code} | ${id} | ${author} | ${b.title}`);
      }
      yield* Console.log(
        '\nUse `bible egw download <CODE>` to fetch one of these into the local DB.',
      );
    }),
).pipe(Command.provide(() => FullLayer));
