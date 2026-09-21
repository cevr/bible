import { EGWApiClient, type Schemas as EGWSchemas } from '@bible/core/egw';
import {
  SearchQuery,
  SearchResultJson,
  SearchService,
  SearchTopicHit,
  SEARCH_TOPIC_LIMIT,
} from '@bible/core/search';
import { WikiService } from '@bible/core/wiki';
import { NO_FILTER, Reference } from '@bible/core/writings';
import { WritingsService } from '@bible/core/writings/service';
import { Cause, Console, Effect, Option, Schema } from 'effect';
import { Argument, Command, Flag } from 'effect/unstable/cli';

import {
  encodeJson,
  formatLocalSearchResult,
  formatRemoteHit,
  formatSearchResult,
} from './format.js';
import { FullLayer } from './layers.js';
import { searchService } from './search-layer.js';
import { WikiLayer } from '../wiki.js';

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

/** The topic group the results page shows above the ranking, fetched beside the
 *  search rather than through it.
 *
 *  §9 ranks the writings; a topic page is a different kind of answer and comes
 *  from a different artifact, so `SearchService` no longer reads a wiki. The
 *  cost of that was one lookup on every query, paid even by the machines that
 *  have no `topics.db` — which is most of them. Asking here means a surface that
 *  wants the group asks for it, and the ones that do not never open the file.
 *
 *  **Nothing about the wiki may fail the search.** The topic group is a garnish
 *  on an answer that is already complete, so every way of not getting one — a
 *  refusing artifact, a `HOME` that will not resolve, a driver that dies while
 *  the layer is built — degrades to no group. `catchCause` rather than
 *  `catchTag`, because the failures are not all in the error channel: the
 *  installed layer resolves its paths through `Config` and dies on a miss, and
 *  a search that answered perfectly well must not be thrown away over the
 *  heading printed above it. The cause is logged, so a degradation is visible
 *  rather than silent.
 *
 *  The scope is exactly this fetch. The search already ran, in its own effect,
 *  and its defects still reach the caller.
 *
 *  Resolved through `WikiLayer`, the same `Context.Reference` the `bible wiki`
 *  commands use: its default opens the installed artifact, and a test points it
 *  at a fixture without this command taking a layer parameter. */
const searchTopics = (text: string): Effect.Effect<readonly SearchTopicHit[]> =>
  Effect.flatMap(WikiLayer, (layer) =>
    Effect.gen(function* () {
      const wiki = yield* WikiService;
      const summaries = yield* wiki.list({ query: text });
      return summaries.slice(0, SEARCH_TOPIC_LIMIT).map((summary) =>
        SearchTopicHit.make({
          slug: summary.slug,
          title: summary.title,
          status: summary.status,
        }),
      );
    }).pipe(
      Effect.provide(layer),
      Effect.catchCause((cause) =>
        Effect.as(
          Effect.logDebug('search.topics.unavailable').pipe(
            Effect.annotateLogs({ cause: Cause.pretty(cause) }),
          ),
          [] as readonly SearchTopicHit[],
        ),
      ),
    ),
  );

export const localSearch = (
  query: string,
  bookCode: Option.Option<string>,
  limit = 20,
  full = false,
) =>
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
      yield* Console.log(formatLocalSearchResult(r, i, full));
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
/** Print each hit's whole paragraph instead of the 200-character cut.
 *
 *  The text is already on the hit, so this asks the printer for what the
 *  search already returned rather than for more data. It exists because
 *  checking a quotation against the corpus otherwise took one `lookup` call
 *  per result — `--json` carried the full text all along, but only for a
 *  reader willing to parse JSON. */
const full = Flag.boolean('full').pipe(
  Flag.withDescription('Print each result’s full paragraph instead of a 200-character snippet'),
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
/** Put the lookup apparatus back in — dictionaries, topical and scripture
 *  indexes, 39% of the corpus (`APPARATUS_TYPES`).
 *
 *  **Excluded by default, like the web surface.** `NEVER_APPARATUS` argues that
 *  a search box over the writings has no use for a see-also stub, and adds that
 *  "the CLI and the desktop reader both have uses for the indexes" — which is
 *  true, and was the reason this command first shipped the exclusion as an
 *  opt-in `--no-apparatus`. Measuring it settled the question the other way: an
 *  index entry is short and made almost entirely of the query's own words, so
 *  BM25 ranks it *well* for exactly the topical phrases this corpus is searched
 *  with. `latter rain` returned six `TopIndex` rows in its first ten, none of
 *  them an answer — "latter, See Latter rain" is a pointer to where to look,
 *  taking the slot of the paragraph that would have said something.
 *
 *  So the default now matches what a reader searching the writings means, and
 *  the flag is how someone looking a reference *up* asks for the apparatus
 *  back. That is the narrower, more deliberate act of the two, which is the one
 *  that should have to be named.
 *
 *  Both surfaces agreeing is the point: the same query typed into either now
 *  returns the same rows, and neither hides the other's behaviour behind a
 *  default nobody can see. */
const apparatus = Flag.boolean('apparatus').pipe(
  Flag.withDescription('Include dictionaries and topical/scripture indexes (excluded by default)'),
  Flag.withDefault(false),
);
/** The remote search path. `FullLayer` — the API client plus auth — is provided
 *  here, at this operation's own boundary, rather than inside the command body. */
const remoteSearch = (queryStr: string, lang: string, limit: number, json: boolean) =>
  Effect.gen(function* () {
    const client = yield* EGWApiClient;
    const params: EGWSchemas.SearchParams = { query: queryStr, lang, limit };
    const response = yield* client.search(params);

    if (json) {
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

export const egwSearch = Command.make(
  'search',
  { query, book, limit, remote, json, lang, scope, full, apparatus },
  (args) =>
    Effect.gen(function* () {
      const queryStr = args.query.join(' ').trim();
      if (queryStr.length === 0) {
        yield* Console.log(
          'Usage: bible egw search <query> [--book CODE] [--remote] [--limit N] [--full]',
        );
        return;
      }

      if (args.remote) {
        // Remote path requires the API client + auth layer.
        yield* remoteSearch(queryStr, args.lang, args.limit, args.json);
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
              // Excluded unless asked for, matching the web surface; see
              // `apparatus` for why the default moved.
              filter: { ...NO_FILTER, excludeApparatus: !args.apparatus },
            }),
          ),
        ),
      );

      if (args.json) {
        // `--json` is the wire codec and nothing else: `SearchResultJson` is
        // what `v1.search.query` returns, and adding a group the RPC handler
        // does not send would break the byte parity that contract rests on. A
        // script that wants topics asks `bible wiki topics` for them.
        yield* Console.log(yield* encodeSearchResult(result));
        return;
      }
      const topics = yield* searchTopics(queryStr);
      for (const line of formatSearchResult(result, args.full, topics)) {
        yield* Console.log(line);
      }
    }),
);
