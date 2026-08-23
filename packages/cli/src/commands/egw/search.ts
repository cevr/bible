import { EGWApiClient, type Schemas as EGWSchemas } from '@bible/core/egw';
import { SearchQuery, SearchResultJson, SearchService } from '@bible/core/search';
import { Reference } from '@bible/core/writings';
import { WritingsService } from '@bible/core/writings/service';
import { Console, Effect, Option, Schema } from 'effect';
import { Argument, Command, Flag } from 'effect/unstable/cli';

import {
  encodeJson,
  formatLocalSearchResult,
  formatRemoteHit,
  formatSearchResult,
} from './format.js';
import { FullLayer } from './layers.js';
import { searchService } from './search-layer.js';

/** The one wire codec §9 defines, encoded rather than re-projected.
 *
 *  M5-M7's host-parity rule: the CLI and the RPC handler must emit the *same*
 *  bytes for the same result, which is only true if they share the encoder.
 *  The hand-written projection this replaces was a second wire model — it could
 *  drift from `SearchResult` without anything failing.
 *
 *  One composed codec rather than encode-then-stringify: `SearchResultJson`'s
 *  own encoder already produces the JSON shape, so passing its output through
 *  the generic `encodeJson` would ask the schema to encode an
 *  already-encoded value — `Option` fields arrive as plain JSON and fail. */
const encodeSearchResult = Schema.encodeEffect(
  Schema.fromJsonString(SearchResultJson, { space: 2 }),
);

export const localSearch = (query: string, bookCode: Option.Option<string>, limit = 20) =>
  Effect.gen(function* () {
    const service = yield* WritingsService;
    let publication;
    if (Option.isSome(bookCode)) {
      publication = Reference.publication((yield* service.publicationByCode(bookCode.value)).id);
    }
    const results = yield* service.search(query, {
      limit,
      publication,
    });

    if (results.length === 0) {
      yield* Console.log(`No local results found for "${query}".`);
      yield* Console.log('Try `bible egw search <query> --remote` to query the EGW API.');
      return;
    }

    let scope = '';
    if (Option.isSome(bookCode)) {
      scope = ` in ${bookCode.value}`;
    }
    yield* Console.log(`Local search results for "${query}"${scope} (${results.length}):\n`);
    for (const [i, r] of results.entries()) {
      yield* Console.log(formatLocalSearchResult(r, i));
    }
  });

const query = Argument.string('query').pipe(Argument.variadic());
const book = Flag.string('book').pipe(
  Flag.withDescription('Scope to a single book code (local search only)'),
  Flag.optional,
);
const limit = Flag.integer('limit').pipe(
  Flag.withDescription('Max results (default: 20)'),
  Flag.withDefault(20),
);
const remote = Flag.boolean('remote').pipe(
  Flag.withDescription('Hit the EGW API instead of the local FTS index'),
  Flag.withDefault(false),
);
const json = Flag.boolean('json').pipe(
  Flag.withDescription('Output raw JSON (especially useful with --remote)'),
  Flag.withDefault(false),
);
const lang = Flag.string('lang').pipe(
  Flag.withDescription('Language code for --remote (default: en)'),
  Flag.withDefault('en'),
);
/** §9.1's corpus scope.
 *
 *  `Flag.choice` rather than a validated string: the parser rejects an unknown
 *  scope with the CLI's own error, so the command never holds a value the
 *  `CorpusScope` schema would refuse. Left optional rather than defaulted here,
 *  because `SEARCH_DEFAULT_SCOPE` is where the default belongs — a second one
 *  spelled in the flag is a second place for it to change. */
const scope = Flag.choice('scope', ['egw', 'pioneer', 'all']).pipe(
  Flag.withDescription('Corpus scope: egw, pioneer, or all (default: egw)'),
  Flag.optional,
);
export const egwSearch = Command.make(
  'search',
  { query, book, limit, remote, json, lang, scope },
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
          const params: EGWSchemas.SearchParams = {
            query: queryStr,
            lang: args.lang,
            limit: args.limit,
          };
          const response = yield* client.search(params);

          if (args.json) {
            yield* Console.log(yield* encodeJson(response));
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

      // Local path — §9's hybrid search. The scope, book and limit narrowings
      // travel as one `SearchQuery` so the CLI, the RPC handler and the UI ask
      // the same question in the same terms.
      const result = yield* searchService(
        Effect.flatMap(SearchService, (service) =>
          service.query(
            SearchQuery.make({
              text: queryStr,
              scope: args.scope,
              bookCode: args.book,
              limit: Option.some(args.limit),
            }),
          ),
        ),
      );

      if (args.json) {
        yield* Console.log(yield* encodeSearchResult(result));
        return;
      }
      for (const line of formatSearchResult(result)) {
        yield* Console.log(line);
      }
    }),
);
