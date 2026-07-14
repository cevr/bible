import { parseBibleQuery, Reference as BibleReference } from '@bible/core/bible';
import { EGWCommentaryService } from '@bible/core/egw-commentary';
import { Console, Effect } from 'effect';
import { Argument, Command, Flag } from 'effect/unstable/cli';

import { CommentaryLayer } from './layers.js';

const verse = Argument.string('verse').pipe(Argument.variadic());
const json = Flag.boolean('json').pipe(
  Flag.withDescription('Output JSON instead of formatted text'),
  Flag.withDefault(false),
);

export const egwCommentary = Command.make('commentary', { verse, json }, (args) =>
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
