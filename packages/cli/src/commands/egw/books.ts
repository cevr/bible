import { WritingsService } from '@bible/core/writings/service';
import { Console, Effect, Option } from 'effect';
import { Command, Flag } from 'effect/unstable/cli';

import { encodeJson, publicationJson } from './format.js';
import { ServiceLayer } from './layers.js';

const author = Flag.string('author').pipe(
  Flag.withDescription('Filter by author (case-insensitive substring match)'),
  Flag.optional,
);
const json = Flag.boolean('json').pipe(
  Flag.withDescription('Output JSON instead of a table'),
  Flag.withDefault(false),
);

export const egwBooks = Command.make('books', { author, json }, (args) =>
  Effect.gen(function* () {
    const service = yield* WritingsService;
    const all = yield* service.catalog();

    const filtered = Option.match(args.author, {
      onNone: () => all,
      onSome: (authorFilter) =>
        all.filter((book) => book.author.toLowerCase().includes(authorFilter.toLowerCase())),
    });

    if (args.json) {
      yield* Console.log(yield* encodeJson(filtered.map(publicationJson)));
      return;
    }

    if (filtered.length === 0) {
      yield* Console.log(
        'No books found in local DB.' +
          Option.match(args.author, {
            onNone: () => '',
            onSome: (authorFilter) => ` (author filter: ${authorFilter})`,
          }),
      );
      return;
    }

    yield* Console.log(`${filtered.length} installed book(s):\n`);
    yield* Console.log('CODE       | AUTHOR                          | PARAS    | TITLE');
    yield* Console.log('-----------|---------------------------------|----------|------');
    for (const book of filtered) {
      const code = book.code.padEnd(10);
      let bookAuthor = book.author;
      if (bookAuthor.length > 31) {
        bookAuthor = `${bookAuthor.slice(0, 28)}…`;
      }
      bookAuthor = bookAuthor.padEnd(31);
      const paragraphs = String(Option.getOrElse(book.paragraphCount, () => '-')).padEnd(8);
      yield* Console.log(`${code} | ${bookAuthor} | ${paragraphs} | ${book.title}`);
    }
  }),
).pipe(Command.provide(() => ServiceLayer));
