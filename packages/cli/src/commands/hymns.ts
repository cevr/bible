/**
 * Hymns Command
 *
 * CLI commands for querying the SDA Hymnal.
 */

import { Argument, Command, Flag } from 'effect/unstable/cli';
import { BunServices } from '@effect/platform-bun';
import { HymnalDatabase, HymnalService, type CategoryId, type HymnId } from '@bible/core/hymnal';
import { Console, Effect, Layer, Option } from 'effect';

const jsonFlag = Flag.boolean('json').pipe(
  Flag.withDescription('Output JSON instead of formatted text'),
  Flag.withDefault(false),
);

const limitFlag = Flag.integer('limit').pipe(
  Flag.withDescription('Max results for search output'),
  Flag.optional,
);

// ============================================================================
// Layers
// ============================================================================

const HymnalLive = HymnalService.Live.pipe(
  Layer.provide(HymnalDatabase.Live),
  Layer.provideMerge(BunServices.layer),
);

// ============================================================================
// Formatting
// ============================================================================

function formatHymnFull(hymn: {
  id: number;
  name: string;
  category: string;
  verses: readonly { text: string }[];
}): string {
  const lines = [`#${hymn.id} — ${hymn.name}`, `Category: ${hymn.category}`, ''];

  hymn.verses.forEach((v, i) => {
    lines.push(`Verse ${i + 1}:`);
    lines.push(v.text);
    lines.push('');
  });

  return lines.join('\n');
}

function formatHymnSummary(hymn: {
  id: number;
  name: string;
  category: string;
  firstLine: string;
}): string {
  return `#${hymn.id} — ${hymn.name} (${hymn.category})\n  "${hymn.firstLine}"`;
}

// ============================================================================
// Subcommands
// ============================================================================

const hymnNumber = Argument.integer('number');

const getCommand = Command.make('get', { hymnNumber, json: jsonFlag }, (args) =>
  Effect.gen(function* () {
    const service = yield* HymnalService;
    const hymn = yield* service
      .getHymn(args.hymnNumber as HymnId)
      .pipe(Effect.catch(() => Effect.succeed(null)));

    if (hymn === null) {
      if (args.json) {
        yield* Console.log(JSON.stringify({ id: args.hymnNumber, hymn: null }, null, 2));
        return;
      }
      yield* Console.log(`Hymn #${args.hymnNumber} not found.`);
      yield* Console.log('Valid range: 1-920');
      return;
    }

    if (args.json) {
      yield* Console.log(JSON.stringify(hymn, null, 2));
      return;
    }

    yield* Console.log(formatHymnFull(hymn));
  }).pipe(Effect.scoped, Effect.provide(HymnalLive)),
);

const searchQuery = Argument.string('query').pipe(Argument.variadic());

const searchCommand = Command.make(
  'search',
  { searchQuery, json: jsonFlag, limit: limitFlag },
  (args) =>
    Effect.gen(function* () {
      const service = yield* HymnalService;
      const query = args.searchQuery.join(' ').trim();
      const limit = Option.getOrElse(args.limit, () => 20);

      if (query.length === 0) {
        yield* Console.log('Usage: bible hymns search <query> [--json]');
        yield* Console.log('');
        yield* Console.log('Examples:');
        yield* Console.log('  bible hymns search "amazing grace"');
        yield* Console.log('  bible hymns search faith');
        yield* Console.log('  bible hymns search "turn your eyes"');
        return;
      }

      const results = yield* service.searchHymns(query, limit);

      if (args.json) {
        yield* Console.log(JSON.stringify({ query, matches: results }, null, 2));
        return;
      }

      if (results.length === 0) {
        yield* Console.log(`No hymns found matching "${query}".`);
        return;
      }

      yield* Console.log(
        `Found ${results.length} hymn${results.length === 1 ? '' : 's'} matching "${query}":\n`,
      );
      for (const hymn of results) {
        yield* Console.log(formatHymnSummary(hymn));
        yield* Console.log('');
      }
    }).pipe(Effect.scoped, Effect.provide(HymnalLive)),
);

const categoriesCommand = Command.make('categories', {}, () =>
  Effect.gen(function* () {
    const service = yield* HymnalService;
    const categories = yield* service.getCategories();

    yield* Console.log('SDA Hymnal Categories:\n');
    for (const cat of categories) {
      yield* Console.log(`${cat.id}. ${cat.name}`);
    }
  }).pipe(Effect.scoped, Effect.provide(HymnalLive)),
);

const categoryIdArg = Argument.integer('id');

const categoryCommand = Command.make('category', { categoryIdArg }, (args) =>
  Effect.gen(function* () {
    const service = yield* HymnalService;
    const results = yield* service.getHymnsByCategory(args.categoryIdArg as CategoryId);

    if (results.length === 0) {
      yield* Console.log(`No hymns found in category ${args.categoryIdArg}.`);
      yield* Console.log('Use "bible hymns categories" to see available categories.');
      return;
    }

    // Get category name from first result
    const categoryName = results[0]?.category ?? `Category ${args.categoryIdArg}`;
    yield* Console.log(`Hymns in "${categoryName}":\n`);

    for (const hymn of results) {
      yield* Console.log(`#${hymn.id} — ${hymn.name}`);
    }
  }).pipe(Effect.scoped, Effect.provide(HymnalLive)),
);

// ============================================================================
// Main Command
// ============================================================================

export const hymns = Command.make('hymns').pipe(
  Command.withSubcommands([getCommand, searchCommand, categoriesCommand, categoryCommand]),
);
