import { EGWApiClient, type Schemas as EGWSchemas } from '@bible/core/egw';
import { Reference } from '@bible/core/writings';
import { WritingsService } from '@bible/core/writings/service';
import { Console, Effect } from 'effect';
import { Argument, Command, Flag } from 'effect/unstable/cli';

import { encodeJson, formatLocalSearchResult, formatRemoteHit, searchHitJson } from './format.js';
import { FullLayer, ServiceLayer } from './layers.js';

export const localSearch = (query: string, bookCode?: string, limit = 20) =>
  Effect.gen(function* () {
    const service = yield* WritingsService;
    let publication;
    if (bookCode !== undefined) {
      publication = Reference.publication((yield* service.publicationByCode(bookCode)).id);
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
    if (bookCode !== undefined) {
      scope = ` in ${bookCode}`;
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

export const egwSearch = Command.make(
  'search',
  { query, book, limit, remote, json, lang },
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

      // Local path — only needs the WritingsService layer (no auth required).
      yield* Effect.gen(function* () {
        if (args.json) {
          const service = yield* WritingsService;
          let publication;
          if (args.book._tag === 'Some') {
            publication = Reference.publication(
              (yield* service.publicationByCode(args.book.value)).id,
            );
          }
          const results = yield* service.search(queryStr, {
            limit: args.limit,
            publication,
          });
          yield* Console.log(yield* encodeJson(results.map(searchHitJson)));
          return;
        }
        let bookCode;
        if (args.book._tag === 'Some') {
          bookCode = args.book.value;
        }
        yield* localSearch(queryStr, bookCode, args.limit);
      }).pipe(Effect.provide(ServiceLayer));
    }),
);
