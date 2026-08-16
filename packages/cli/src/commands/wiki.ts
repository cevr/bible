/**
 * Wiki CLI command graph.
 *
 * `bible wiki topics [--query <q>] [--json]` lists the authored flagship pages
 * the installed topics artifact carries. With no artifact the command still
 * succeeds and reports the typed absence — §3.5's degradation posture is a
 * domain value, not an error path, and the CLI proves it the same way the two
 * visual hosts do.
 */

import { WikiService, type TopicsUnavailableReason, type WikiPageSummary } from '@bible/core/wiki';
import { layerBunWithCatalog } from '@bible/core/wiki/bun';
import { Config, Console, Effect, Layer, Option, Path, Schema, SchemaGetter } from 'effect';
import { Command, Flag } from 'effect/unstable/cli';
import { BunServices } from '@effect/platform-bun';

const JsonString = Schema.Unknown.pipe(
  Schema.encodeTo(Schema.String, {
    decode: SchemaGetter.parseJson(),
    encode: SchemaGetter.stringifyJson({ space: 2 }),
  }),
);

const encodeJson = Schema.encodeUnknownEffect(JsonString);

/** `unavailable` is absent-or-a-reason, and the wire form both the CLI and the
 *  acceptance tests read is `null` for "available". `Schema.NullOr` is the
 *  codec for exactly that, so the JSON shape is declared once here instead of
 *  being produced by hand at the call site. */
const encodeUnavailable = Schema.encodeSync(Schema.OptionFromNullOr(Schema.String));

const json = Flag.boolean('json').pipe(
  Flag.withDefault(false),
  Flag.withDescription('Emit stable JSON'),
);

const query = Flag.string('query').pipe(
  Flag.optional,
  Flag.withDescription('Filter pages by title or slug'),
);

/** Resolves the installed artifact into a `WikiService`. A missing file is the
 *  expected steady state until the first content release, and `layerBunOrAbsent`
 *  turns it into the typed-absence service rather than a failure — the
 *  command's whole contract is that both paths return data.
 *
 *  The catalog half comes from `bible.db` through `TopicService`, so the
 *  missing-artifact case still lists every catalog topic (§2, M2). Both
 *  databases live in `~/.bible`. */
const wikiLayer = Layer.unwrap(
  Effect.gen(function* () {
    const path = yield* Path.Path;
    const home = yield* Config.string('HOME');
    return layerBunWithCatalog({
      topics: path.join(home, '.bible', 'topics.db'),
      bible: path.join(home, '.bible', 'bible.db'),
    });
  }).pipe(Effect.provide(BunServices.layer), Effect.orDie),
);

const summaryJson = (summary: WikiPageSummary) => ({
  slug: summary.slug,
  title: summary.title,
  status: summary.status,
});

/** The `--json` payload, as a pure function of what the service returned.
 *  Extracted from the handler so the wire shape the milestone specifies —
 *  catalog entries present, and the absence reason alongside them — is asserted
 *  directly rather than by scraping stdout. */
export const topicsJson = (result: {
  readonly topics: readonly WikiPageSummary[];
  readonly unavailable: Option.Option<TopicsUnavailableReason>;
}) => ({
  topics: result.topics.map(summaryJson),
  count: result.topics.length,
  unavailable: encodeUnavailable(result.unavailable),
});

export const wikiTopics = Command.make('topics', { query, json }, (args) =>
  Effect.gen(function* () {
    const result = yield* Effect.gen(function* () {
      const wiki = yield* WikiService;
      const topics = yield* wiki.list({ query: Option.getOrUndefined(args.query) });
      return { topics, unavailable: yield* wiki.availability };
    }).pipe(Effect.provide(wikiLayer));

    if (args.json) {
      yield* Console.log(yield* encodeJson(topicsJson(result)));
      return;
    }
    if (result.topics.length === 0) {
      const reason = Option.getOrElse(result.unavailable, () => 'no approved pages');
      yield* Console.log(`No topics (${reason})`);
      return;
    }
    for (const topic of result.topics.map(summaryJson)) {
      yield* Console.log(`${topic.slug}  ${topic.title}  [${topic.status}]`);
    }
    yield* Console.log(``);
    const flagship = result.topics.filter((topic) => topic.status === 'flagship').length;
    const catalog = result.topics.length - flagship;
    yield* Console.log(
      `${String(flagship)} flagship, ${String(catalog)} catalog${Option.match(result.unavailable, {
        onNone: () => '',
        onSome: (reason) => ` (authored cores unavailable: ${reason})`,
      })}`,
    );
  }).pipe(Effect.provide(BunServices.layer)),
);

export const wiki = Command.make('wiki', {}, () =>
  Console.log(`Usage: bible wiki topics [--query <q>] [--json]`),
).pipe(Command.withSubcommands([wikiTopics]));
