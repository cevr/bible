/**
 * Wiki CLI command graph.
 *
 * `bible wiki topics [--query <q>] [--json]` lists the authored flagship pages
 * the installed topics artifact carries. With no artifact the command still
 * succeeds and reports the typed absence — §3.5's degradation posture is a
 * domain value, not an error path, and the CLI proves it the same way the two
 * visual hosts do.
 *
 * `bible wiki topic <slug> [--json]` prints the composed page: the authored
 * core plus the §6.1 section lineup. It calls `WikiService` directly, so the
 * page it prints is the value `v1.wiki.topic.get` returns — the same composer,
 * the same caps, the same result identities, with no second rendering path
 * that could drift from the two visual hosts.
 *
 * The `--json` payloads are produced by **the core schemas themselves**
 * (`WikiPageJson`, `WikiPageSummaryJson`), not by a hand-written projection.
 * That is the whole point: `v1.wiki.topic.get` encodes the same schema, so the
 * two seams cannot disagree, and a field added to the model reaches both at
 * once instead of silently missing from one.
 */

import {
  TopicSlug,
  WikiPageJson,
  WikiPageSummaryJson,
  WikiService,
  TopicsUnavailableReason,
  type WikiPage,
  type WikiPageSummary,
  type WikiSection,
} from '@bible/core/wiki';
import { layerBunWithCatalog } from '@bible/core/wiki/bun';
import {
  Config,
  Console,
  Context,
  Effect,
  Layer,
  Option,
  Path,
  Schema,
  SchemaGetter,
} from 'effect';
import { Argument, Command, Flag } from 'effect/unstable/cli';
import { BunServices } from '@effect/platform-bun';

const JsonString = Schema.Unknown.pipe(
  Schema.encodeTo(Schema.String, {
    decode: SchemaGetter.parseJson(),
    encode: SchemaGetter.stringifyJson({ space: 2 }),
  }),
);

const encodeJson = Schema.encodeUnknownEffect(JsonString);

/** The two core encoders. Nothing below names a field of a page or a section:
 *  the schema is the wire contract, so the CLI's job is to run it. */
const encodePage = Schema.encodeEffect(WikiPageJson);

/** The listing envelope, as a schema rather than as an object literal built at
 *  the call site: `count` and `unavailable` are wire fields like any other, and
 *  declaring them here means the encoded shape has one definition and one
 *  `Encoded` type instead of a hand-written annotation that can drift from what
 *  the encoder actually emits.
 *
 *  `unavailable` is absent-or-a-reason, and the wire form is the reason string
 *  when the artifact is missing. This is *listing* metadata rather than page
 *  data — `wiki.availability` is a property of the artifact, not of any page —
 *  which is why it lives here and not inside `WikiPageJson`.
 *
 *  The reason is the **closed** `TopicsUnavailableReason`, not `Schema.String`.
 *  `WikiPage.unavailable` already declares the closed union, and widening the
 *  listing's copy to any string means the CLI and the page model disagree about
 *  what a client may receive: a consumer that switches on the reason would have
 *  to carry a default branch for the listing that its page handling does not
 *  need, and a typo introduced here would encode instead of failing. */
export const WikiTopicsJson = Schema.Struct({
  topics: WikiPageSummaryJson,
  count: Schema.Int,
  unavailable: Schema.OptionFromNullOr(TopicsUnavailableReason),
});

const encodeTopics = Schema.encodeEffect(WikiTopicsJson);

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
 *  missing-artifact case still lists every catalog topic (§2, M2), and the §6
 *  section sources come from `bible.db` plus the EGW writings library. All
 *  three databases live in `~/.bible`. */
const installedWikiLayer = Layer.unwrap(
  Effect.gen(function* () {
    const path = yield* Path.Path;
    const home = yield* Config.string('HOME');
    return layerBunWithCatalog({
      topics: path.join(home, '.bible', 'topics.db'),
      bible: path.join(home, '.bible', 'bible.db'),
      writings: path.join(home, '.bible', 'egw-paragraphs.db'),
    });
  }).pipe(Effect.provide(BunServices.layer), Effect.orDie),
).pipe(Layer.provide(BunServices.layer));

/** Which `WikiService` the two commands resolve, as an overridable default.
 *
 *  A `Context.Reference` rather than a plain constant, and rather than adding
 *  `WikiService` to the CLI's top-level requirements. The default is the
 *  installed-corpora layer, so production wiring is unchanged and no other
 *  command pays to open three SQLite files it does not use. What the reference
 *  buys is that a test can point the commands at a fixture artifact **and still
 *  run the real command** — argument parsing, encoder, `Console.log` and all —
 *  instead of calling the exported `topicJson` helper and proving only that the
 *  helper works. The seam a helper-level test leaves open is precisely the one
 *  where a hand-mapped rename could reappear between the page and stdout. */
export class WikiLayer extends Context.Reference<Layer.Layer<WikiService>>(
  '@bible/cli/wiki/WikiLayer',
  { defaultValue: () => installedWikiLayer },
) {}

/** The `WikiService` this run should use, resolved once per command body. */
const wikiService = <A, E>(use: Effect.Effect<A, E, WikiService>): Effect.Effect<A, E> =>
  Effect.flatMap(WikiLayer, (layer) => use.pipe(Effect.provide(layer)));

/** The `--json` payload for a listing, as a pure function of what the service
 *  returned — so the acceptance check asserts the wire shape directly rather
 *  than by scraping stdout. */
export const topicsJson = (result: {
  readonly topics: readonly WikiPageSummary[];
  readonly unavailable: Option.Option<TopicsUnavailableReason>;
}): Effect.Effect<typeof WikiTopicsJson.Encoded, Schema.SchemaError> =>
  encodeTopics({
    topics: result.topics,
    count: result.topics.length,
    unavailable: result.unavailable,
  });

export const wikiTopics = Command.make('topics', { query, json }, (args) =>
  Effect.gen(function* () {
    const result = yield* wikiService(
      Effect.gen(function* () {
        const wiki = yield* WikiService;
        const topics = yield* wiki.list({ query: Option.getOrUndefined(args.query) });
        return { topics, unavailable: yield* wiki.availability };
      }),
    );

    if (args.json) {
      yield* Console.log(yield* encodeJson(yield* topicsJson(result)));
      return;
    }
    if (result.topics.length === 0) {
      const reason = Option.getOrElse(result.unavailable, () => 'no approved pages');
      yield* Console.log(`No topics (${reason})`);
      return;
    }
    for (const topic of result.topics) {
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

/** The human-readable rendering of §6.1's default-open flag. */
const openMarker = (defaultOpen: boolean): string => {
  if (defaultOpen) return '  (open)';
  return '';
};

/** How many uninstalled cited books a section carries (§6.3). Only sections 2
 *  and 4 can have any; the value lives beside the ranked hits rather than among
 *  them, so the human summary reports it as its own number. */
const missingBookCount = (section: WikiSection): number => {
  if (section._tag !== 'egw-statements' && section._tag !== 'pioneer-witnesses') return 0;
  return section.missingBooks.length;
};

const missingMarker = (section: WikiSection): string => {
  const missing = missingBookCount(section);
  if (missing === 0) return '';
  return `  +${String(missing)} to get`;
};

/** The `--json` payload for one page: the core schema's own encoding, so the
 *  CLI emits the value `v1.wiki.topic.get` puts on the wire rather than a
 *  parallel projection of it. */
export const topicJson = (page: WikiPage): Effect.Effect<WikiPageJson, Schema.SchemaError> =>
  encodePage(page);

const slug = Argument.string('slug').pipe(Argument.withDescription('The topic page slug'));

export const wikiTopic = Command.make('topic', { slug, json }, (args) =>
  Effect.gen(function* () {
    const page = yield* wikiService(
      Effect.gen(function* () {
        const wiki = yield* WikiService;
        return yield* wiki.topic(yield* Schema.decodeEffect(TopicSlug)(args.slug));
      }),
    );

    if (args.json) {
      yield* Console.log(yield* encodeJson(yield* topicJson(page)));
      return;
    }
    yield* Console.log(`${page.title}  [${page.status}]`);
    // A host that wired no §6 sources says so, rather than printing six empty
    // sections a reader would take for "the corpora had nothing to say".
    yield* Option.match(page.sectionsUnavailable, {
      onNone: () => Effect.void,
      onSome: (reason) => Console.log(`sections unavailable: ${reason}`),
    });
    yield* Console.log(``);
    for (const section of page.sections) {
      yield* Console.log(
        `## ${section._tag}  ${String(section.items.length)}/${String(section.total)}${openMarker(
          section.defaultOpen,
        )}${missingMarker(section)}`,
      );
    }
  }).pipe(Effect.provide(BunServices.layer)),
);

export const wiki = Command.make('wiki', {}, () =>
  Console.log(
    `Usage: bible wiki topics [--query <q>] [--json]\n       bible wiki topic <slug> [--json]`,
  ),
).pipe(Command.withSubcommands([wikiTopics, wikiTopic]));
