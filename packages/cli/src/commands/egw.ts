/**
 * EGW CLI command graph.
 *
 * Each subcommand owns its arguments, behavior, and runtime dependencies under
 * ./egw/. This module preserves the backwards-compatible top-level lookup and
 * search routes and assembles the public command tree.
 */

import { isSearchQuery, parseEGWRef } from '@bible/core/egw';
import { Console, Effect } from 'effect';
import { Argument, Command } from 'effect/unstable/cli';

import { egwBooks } from './egw/books.js';
import { egwCatalog } from './egw/catalog.js';
import { egwCommentary } from './egw/commentary.js';
import { egwDownload } from './egw/download.js';
import { ServiceLayer } from './egw/layers.js';
import { egwLookup, lookupReference } from './egw/lookup.js';
import { egwOpen } from './egw/open.js';
import { egwSearch, localSearch } from './egw/search.js';
import { egwStudy } from './egw/study.js';

export {
  egwBooks,
  egwCatalog,
  egwCommentary,
  egwDownload,
  egwLookup,
  egwOpen,
  egwSearch,
  egwStudy,
};

const query = Argument.string('query').pipe(Argument.variadic());

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
      yield* localSearch(parsed.query, undefined, 20);
    } else {
      yield* lookupReference(parsed);
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
