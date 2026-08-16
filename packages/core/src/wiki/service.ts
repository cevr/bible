import { Context, Effect, Layer, Option, Schema } from 'effect';
import * as SqlClient from 'effect/unstable/sql/SqlClient';
import type { SqlError } from 'effect/unstable/sql/SqlError';

import { readTopicsSchemaMajor } from '../corpus-supply/file-artifact.js';
import { TopicId } from '../topics/model.js';
import { TopicService, type TopicServiceApi } from '../topics/service.js';
import {
  AuthoredCore,
  BlocksJson,
  PhraseDictionary,
  PhraseDictionaryEntry,
  TOPICS_SCHEMA_MAJOR,
  TopicAlias,
  TopicEdge,
  TopicEdgeKind,
  TopicSlug,
  type TopicsUnavailableReason,
  WikiPage,
  type WikiSectionLineup,
  type WikiSectionsUnavailableReason,
  WikiPageSummary,
  type WikiListInput,
} from './model.js';
import {
  composeSections,
  emptySectionLineup,
  WikiSectionSources,
  type ComposeInput,
  type SectionSourcing,
} from './section-composer.js';

/** Why a wiki operation failed, as a closed set rather than an opaque cause.
 *
 *  `open-failed` — the artifact file exists but the driver could not open it.
 *  `corrupt`     — it opened, but its contents are not a readable artifact.
 *  `decode-failed` — a row crossed the boundary in a shape the model rejects.
 *  `query-failed`  — the artifact is readable and one statement failed.
 *
 *  A closed set because this error is destined for the wire: Milestone 3 puts
 *  `WikiService` behind RPC, and `Schema.Unknown` has no stable encoding a
 *  client could depend on. */
export const WikiErrorCategory = Schema.Literals([
  'open-failed',
  'corrupt',
  'decode-failed',
  'query-failed',
]);
export type WikiErrorCategory = typeof WikiErrorCategory.Type;

/** The topics artifact is installed but could not be read. Distinct from the
 *  artifact simply being absent, which is a typed value on the page rather than
 *  an error. `message` is a rendered string rather than the original defect:
 *  the cause is a driver object with no stable shape, and a consumer across an
 *  RPC boundary can only ever display it. */
export class WikiUnavailableError extends Schema.TaggedError<WikiUnavailableError>()(
  'WikiUnavailableError',
  {
    operation: Schema.NonEmptyString,
    category: WikiErrorCategory,
    message: Schema.String,
  },
) {}

export type WikiError = WikiUnavailableError;

export interface WikiServiceApi {
  /** Every topic that has a page: the authored flagship pages the artifact
   *  carries, followed by the catalog long tail from `bible.db`. §2.1 gives
   *  every topic a page and only flagship pages an authored core, so a caller
   *  with no artifact still gets the catalog entries rather than an empty list
   *  — the §3.5 degradation posture is visible in the data, not only in
   *  `availability`. */
  readonly list: (input: WikiListInput) => Effect.Effect<readonly WikiPageSummary[], WikiError>;
  /** The composed layered page: the authored core (`None` for a catalog page)
   *  plus the §6.1 section lineup, assembled live by the one composer both
   *  statuses traverse. */
  readonly topic: (slug: TopicSlug) => Effect.Effect<WikiPage, WikiError>;
  /** The compiled alias → slug table (§2.5), so a client builds its matcher
   *  once. Empty with the typed absence when no artifact is installed —
   *  Milestone 4's matcher then matches nothing, which is the correct behavior
   *  for a wiki with no authored pages. */
  readonly dictionary: Effect.Effect<PhraseDictionary, WikiError>;
  /** Why authored cores are unavailable, or `None` when the artifact is
   *  readable. A property of the artifact rather than of any one page, so a
   *  caller listing an empty wiki can say *why* it is empty without fetching a
   *  page to find out. */
  readonly availability: Effect.Effect<Option.Option<TopicsUnavailableReason>, WikiError>;
}

interface TopicRow {
  readonly slug: string;
  readonly title: string;
  readonly thesis_ast: string;
  readonly body_ast: string;
}

interface AliasRow {
  readonly alias: string;
  readonly display: string;
  readonly canonical: number;
}

interface EdgeRow {
  readonly to_slug: string;
  readonly kind: string;
}

interface CatalogKeyRow {
  readonly catalog_id: string;
}

interface DictionaryRow {
  readonly alias: string;
  readonly display: string;
  readonly slug: string;
  readonly canonical: number;
}

interface MetaRow {
  readonly value: string;
}

/** A statement failed against an artifact that opened. SQLite reports a missing
 *  or malformed table the same way it reports any other bad statement, and the
 *  artifact's tables are fixed by the compiler — so a failing query here means
 *  the file is not the artifact it claims to be, which is `corrupt` rather than
 *  a transient query error. */
const unavailable =
  (operation: string) =>
  (cause: SqlError): WikiUnavailableError =>
    WikiUnavailableError.make({
      operation,
      category: 'corrupt',
      message: cause.message,
    });

/** Rows crossing the boundary are decoded into the error channel, not with a
 *  `*Sync` decoder that throws. A corrupt artifact is a state this service
 *  reports, and a thrown schema issue would surface as a defect the caller
 *  cannot catch — the exact difference between "the wiki is unavailable" and
 *  "the process died".
 *
 *  Every column these decoders read is declared `TEXT NOT NULL` by the §2.2
 *  DDL, so the input contract is `string` — what is untrusted is the *value*,
 *  not the type, and that is exactly what the schema establishes. */
const decoded =
  <A>(operation: string, decode: (input: string) => Effect.Effect<A, Schema.SchemaError>) =>
  (input: string): Effect.Effect<A, WikiUnavailableError> =>
    decode(input).pipe(
      Effect.mapError((cause) =>
        WikiUnavailableError.make({
          operation,
          category: 'decode-failed',
          message: cause.message,
        }),
      ),
    );

const decodeBlocks = decoded('decode-blocks', Schema.decodeUnknownEffect(BlocksJson));
const decodeSlug = decoded('decode-slug', Schema.decodeUnknownEffect(TopicSlug));
/** The `kind` column carries a CHECK constraint, but the row is still untrusted
 *  input crossing a boundary — decode it rather than assert it. */
const decodeEdgeKind = decoded('decode-edge-kind', Schema.decodeUnknownEffect(TopicEdgeKind));

/** Strips LIKE wildcards from a caller-supplied filter and drops it entirely
 *  when nothing meaningful is left, so an empty or whitespace-only term means
 *  "no filter" rather than "match everything with a stray wildcard". */
const filterTerm = (input: WikiListInput, key: 'query' | 'letter'): Option.Option<string> =>
  Option.fromNullishOr(input[key]).pipe(
    Option.map((value) => value.replace(/[%_]/g, '').trim()),
    Option.filter((value) => value.length > 0),
  );

const summary = (row: TopicRow): Effect.Effect<WikiPageSummary, WikiError> =>
  decodeSlug(row.slug).pipe(
    Effect.map((slug) => WikiPageSummary.make({ slug, title: row.title, status: 'flagship' })),
  );

/** The catalog long tail, read through the service that already owns
 *  `bible.db`'s topic tables rather than by querying them a second time here.
 *  A catalog topic's id is its page's slug: it is already a stable, unique,
 *  URL-safe identifier, so no second naming scheme is invented for it.
 *
 *  `TopicService` failures are folded into `WikiError` — a caller listing the
 *  wiki should not have to know which of the two databases backed which half of
 *  the answer. */
const catalogSummaries = (
  topics: TopicServiceApi,
  input: WikiListInput,
): Effect.Effect<readonly WikiPageSummary[], WikiError> =>
  topics.list(input).pipe(
    Effect.mapError((cause) =>
      WikiUnavailableError.make({
        operation: 'list-catalog',
        category: 'query-failed',
        message: cause.message,
      }),
    ),
    Effect.flatMap((found) =>
      Effect.forEach(found, (topic) =>
        decodeSlug(topic.id).pipe(
          Effect.map((slug) =>
            WikiPageSummary.make({ slug, title: topic.name, status: 'catalog' }),
          ),
        ),
      ),
    ),
  );

/** Flagship pages first, then the catalog entries no flagship page already
 *  covers. A topic authored as a flagship page must appear once, as a flagship
 *  — the authored core is strictly better than the catalog shell for the same
 *  subject. */
const mergeSummaries = (
  flagship: readonly WikiPageSummary[],
  catalog: readonly WikiPageSummary[],
): readonly WikiPageSummary[] => {
  const claimed = new Set(flagship.map((page) => String(page.slug)));
  return [...flagship, ...catalog.filter((page) => !claimed.has(String(page.slug)))];
};

/** A catalog page: no authored core, the same six-section lineup, and the
 *  reason the core is missing when there is one.
 *
 *  §2.1's "one code path" is literal here — this calls the same composer a
 *  flagship page calls, with an empty core. A catalog topic's id *is* its
 *  slug (`catalogSummaries` explains why), so the overlay key needs no lookup:
 *  the page is already keyed to the catalog row it renders. */
const catalogPage = (
  sourcing: SectionSourcing,
  slug: TopicSlug,
  reason: Option.Option<TopicsUnavailableReason>,
  artifact: ArtifactReads,
): Effect.Effect<WikiPage> =>
  Effect.gen(function* () {
    const catalogId = Schema.decodeOption(TopicId)(String(slug));
    const title = yield* catalogTitle(sourcing, catalogId);
    return WikiPage.make({
      slug,
      title,
      status: 'catalog',
      core: Option.none(),
      sections: yield* composed(sourcing, {
        slug,
        title,
        core: Option.none(),
        catalogId,
        // A catalog page has no core, but its §2.3 backlinks point *at* it from
        // flagship pages — whose titles only the artifact knows. Resolving them
        // is the difference between "The Sanctuary" and a raw slug in the
        // related-topics section.
        titleOf: artifact.titleOf,
        backlinksTo: artifact.backlinksTo,
      }),
      unavailable: reason,
      sectionsUnavailable: sectionsUnavailableFor(sourcing),
    });
  });

/** The two reads only the topics artifact can answer, as the composer needs
 *  them. Bundled because both are `None`/empty in exactly the same situation —
 *  no artifact — and passing them apart invites one to be wired and the other
 *  forgotten. */
interface ArtifactReads {
  readonly titleOf: ComposeInput['titleOf'];
  readonly backlinksTo: ComposeInput['backlinksTo'];
}

/** What the artifact answers when there is no artifact: nothing, for both
 *  reads. `WikiService.Absent` is the one caller. */
const noArtifactReads: ArtifactReads = {
  titleOf: () => Effect.succeedNone,
  backlinksTo: () => Effect.succeed([]),
};

/** The catalog row's own name, falling back to the slug. A page titled with its
 *  slug is a page that reads as a URL fragment; the catalog knows the real name
 *  and it costs one lookup the composer is about to make anyway. */
const catalogTitle = (
  sourcing: SectionSourcing,
  catalogId: Option.Option<TopicId>,
): Effect.Effect<string> => {
  if (sourcing._tag === 'not-wired' || Option.isNone(catalogId)) {
    return Effect.succeed(Option.getOrElse(catalogId, () => 'Topic'));
  }
  return sourcing.sources.catalog.topic(catalogId.value).pipe(
    Effect.map((detail) => detail.name),
    Effect.orElseSucceed(() => String(catalogId.value)),
  );
};

/** The §6.1 lineup: composed live when this host wired its sources, and six
 *  empty sections when it deliberately did not.
 *
 *  Both branches produce all six sections in lineup order, because the lineup is
 *  the page's shape and a client indexing position 3 for commentary must find it
 *  there in every state. What separates the branches is
 *  `WikiPage.sectionsUnavailable`, set below — six empty sections that were
 *  never queried say so, rather than passing as six sections that found nothing. */
const composed = (
  sourcing: SectionSourcing,
  input: ComposeInput,
): Effect.Effect<WikiSectionLineup> => {
  if (sourcing._tag === 'not-wired') return Effect.succeed(emptySectionLineup());
  return composeSections(sourcing.sources, input);
};

const sectionsUnavailableFor = (
  sourcing: SectionSourcing,
): Option.Option<WikiSectionsUnavailableReason> => {
  if (sourcing._tag === 'not-wired') return Option.some('sources-not-wired');
  return Option.none();
};

/** Reads the artifact's `meta.schema_major` and refuses a major this build was
 *  not compiled against (§3.6). A readable artifact from the future is not a
 *  failure — it is the `schema-too-new` absence, and the page falls back to
 *  catalog exactly as an absent artifact does.
 *
 *  A *missing* or *unreadable* version row is a different thing entirely: the
 *  file opened, but nothing in it says which schema it speaks, so this reader
 *  cannot know whether the rows it is about to read mean what it thinks. That
 *  is the `corrupt` category, not an absence to degrade around — degrading
 *  would mean serving a catalog page while quietly holding a file whose version
 *  field is nonsense.
 *
 *  `readTopicsSchemaMajor` is the same strict parse both install-time verifiers
 *  run, so the gate a candidate passed at install is the gate the reader
 *  applies. `Number.parseInt` cannot express it — it stops at the first
 *  non-digit, so `'1junk'` reads as major 1 and the artifact is served as v1. */
const readSchemaMajor = (
  operation: string,
  sql: SqlClient.SqlClient,
): Effect.Effect<number, WikiError> =>
  sql<MetaRow>`SELECT value FROM meta WHERE key = 'schema_major' LIMIT 1`.pipe(
    Effect.mapError(unavailable(operation)),
    Effect.flatMap((rows) =>
      Option.fromNullishOr(rows[0]).pipe(
        Option.flatMap((row) => readTopicsSchemaMajor(row.value)),
        Option.match({
          onNone: () =>
            Effect.fail(
              WikiUnavailableError.make({
                operation,
                category: 'corrupt',
                message: 'Topics Artifact has no readable schema_major',
              }),
            ),
          onSome: Effect.succeed,
        }),
      ),
    ),
  );

export class WikiService extends Context.Service<WikiService, WikiServiceApi>()(
  '@bible/core/wiki/WikiService',
) {
  /** Backed by an installed topics artifact, plus the catalog `TopicService`
   *  reads out of `bible.db`. Composing over `TopicService` rather than
   *  querying the catalog tables again keeps one reader for one set of tables
   *  (§2); the extra layer requirement is the honest cost of the page model
   *  spanning two artifacts. */
  static Live: Layer.Layer<
    WikiService,
    never,
    SqlClient.SqlClient | TopicService | WikiSectionSources
  > = Layer.effect(
    WikiService,
    Effect.gen(function* () {
      const sql = yield* SqlClient.SqlClient;
      const catalog = yield* TopicService;
      // Required, not optional. A host must say which of the two answers it
      // gives — the four live sources, or `WikiSectionSources.NotWired`. There
      // is no third answer where the wiring was simply forgotten, because that
      // one does not compile.
      const sourcing = yield* WikiSectionSources;

      /** `None` while the artifact is usable, `Some(reason)` when its schema
       *  major is beyond this build. A version that cannot be read at all fails
       *  in the typed channel instead — see `readSchemaMajor`.
       *
       *  Read per call rather than cached at layer construction, but *not*
       *  because this connection could observe a swap: the supply pipeline
       *  replaces `topics.db` with an atomic `rename` over the path, and a
       *  connection opened `immutable=1` holds the old inode and will never see
       *  the new file. Seeing a replacement requires reopening the handle,
       *  which happens when the layer is rebuilt — next app launch on the
       *  desktop, next command on the CLI, next worker start on the web.
       *
       *  What the per-call read does buy is that the schema major is one fact
       *  with one reader instead of a value captured once and then quoted by
       *  four call sites. The cost is a single indexed `meta` lookup against an
       *  immutable page cache, which is not a cost worth trading correctness
       *  for. */
      const gate = Effect.fn('WikiService.gate')(function* (operation: string) {
        const major = yield* readSchemaMajor(operation, sql);
        if (major > TOPICS_SCHEMA_MAJOR) {
          return Option.some<TopicsUnavailableReason>('schema-too-new');
        }
        return Option.none<TopicsUnavailableReason>();
      });

      /** The flagship half of the listing. Empty when the schema gate refuses
       *  the artifact — the catalog half still answers, which is what makes a
       *  refused artifact a degradation rather than an outage. */
      const flagship = (input: WikiListInput): Effect.Effect<readonly TopicRow[], WikiError> =>
        Effect.gen(function* () {
          if (Option.isSome(yield* gate('list'))) return [];
          const query = filterTerm(input, 'query');
          const letter = filterTerm(input, 'letter').pipe(Option.map((value) => value.slice(0, 1)));
          if (Option.isSome(query)) {
            const like = `%${query.value}%`;
            return yield* sql<TopicRow>`
              SELECT slug, title, thesis_ast, body_ast
              FROM topics
              WHERE title LIKE ${like} OR slug LIKE ${like}
              ORDER BY position
            `;
          }
          if (Option.isSome(letter)) {
            return yield* sql<TopicRow>`
              SELECT slug, title, thesis_ast, body_ast
              FROM topics
              WHERE title LIKE ${`${letter.value}%`}
              ORDER BY position
            `;
          }
          return yield* sql<TopicRow>`
            SELECT slug, title, thesis_ast, body_ast FROM topics ORDER BY position
          `;
        }).pipe(
          // Only SQL failures become `corrupt` here; the gate's own typed
          // failure already carries its category and must not be relabelled.
          Effect.catchIf(
            (cause): cause is SqlError => !Schema.is(WikiUnavailableError)(cause),
            (cause) => Effect.fail(unavailable('list')(cause)),
          ),
        );

      const list = Effect.fn('WikiService.list')((input: WikiListInput) =>
        Effect.gen(function* () {
          const rows = yield* flagship(input);
          const pages = yield* Effect.forEach(rows, summary);
          return mergeSummaries(pages, yield* catalogSummaries(catalog, input));
        }),
      );

      /** A neighbouring slug's display title, read from the artifact. Section 6
       *  lists titles rather than slugs, and only this service can see the
       *  `topics` table — so the composer asks through this closure rather than
       *  taking a fifth source it would have to open the artifact to satisfy. */
      const titleOf = (slug: TopicSlug): Effect.Effect<Option.Option<string>> =>
        sql<{ readonly title: string }>`SELECT title FROM topics WHERE slug = ${slug} LIMIT 1`.pipe(
          Effect.map((rows) => Option.fromNullishOr(rows[0]).pipe(Option.map((row) => row.title))),
          Effect.orElseSucceed(() => Option.none<string>()),
        );

      /** §2.3's live backlinks: every page whose `topic_edges` row points *at*
       *  this slug. The artifact stores no catalog-keyed edge by design, so a
       *  catalog page's related-topics section can only come from here — and a
       *  flagship page gains the neighbours compiled after it the same way.
       *
       *  Reported as `backlink` regardless of how the pointing edge was
       *  authored: from *this* page's side the relationship is a link inbound,
       *  which is exactly what §6.1's second half of row 6 lists. `idx_topic_edges_to`
       *  is the index §2.2 declares for this query.
       *
       *  An unreadable artifact yields no backlinks rather than failing the
       *  page: this is one of six sources, and §3.5's posture is that the page
       *  still renders. */
      const backlinksTo = (slug: TopicSlug): Effect.Effect<readonly TopicEdge[]> =>
        sql<{ readonly from_slug: string }>`
          SELECT from_slug FROM topic_edges WHERE to_slug = ${slug} ORDER BY position, from_slug
        `.pipe(
          Effect.flatMap((rows) =>
            Effect.forEach(rows, (row) =>
              decodeSlug(row.from_slug).pipe(
                Effect.map((from) => TopicEdge.make({ slug: from, kind: 'backlink' })),
              ),
            ),
          ),
          Effect.orElseSucceed((): readonly TopicEdge[] => []),
        );

      const topic = Effect.fn('WikiService.topic')((slug: TopicSlug) =>
        Effect.gen(function* () {
          const refused = yield* gate('topic');
          if (Option.isSome(refused)) {
            return yield* catalogPage(sourcing, slug, refused, { titleOf, backlinksTo });
          }
          const rows = yield* sql<TopicRow>`
            SELECT slug, title, thesis_ast, body_ast FROM topics WHERE slug = ${slug} LIMIT 1
          `;
          const found = Option.fromNullishOr(rows[0]);
          // A slug the artifact does not carry is a catalog page, not a miss:
          // §2.1 gives every topic a page and only flagship pages an authored
          // core. Both statuses then traverse the same composer.
          if (Option.isNone(found)) {
            return yield* catalogPage(sourcing, slug, Option.none(), { titleOf, backlinksTo });
          }
          const aliases = yield* sql<AliasRow>`
            SELECT alias, display, canonical FROM topic_aliases WHERE slug = ${slug} ORDER BY alias
          `;
          const edges = yield* sql<EdgeRow>`
            SELECT to_slug, kind FROM topic_edges WHERE from_slug = ${slug}
            ORDER BY kind, position
          `;
          // §2.4 resolves the overlay key at compile time. Reading the compiled
          // row is what makes a flagship page's key verses come from the catalog
          // topic the author meant, rather than from whichever catalog id
          // happens to share the slug.
          const keys = yield* sql<CatalogKeyRow>`
            SELECT catalog_id FROM topic_catalog_keys WHERE slug = ${slug} LIMIT 1
          `;
          const decodedSlug = yield* decodeSlug(found.value.slug);
          const core = AuthoredCore.make({
            thesis: yield* decodeBlocks(found.value.thesis_ast),
            body: yield* decodeBlocks(found.value.body_ast),
            aliases: aliases.map((row) =>
              TopicAlias.make({
                alias: row.alias,
                display: row.display,
                canonical: row.canonical === 1,
              }),
            ),
            edges: yield* Effect.forEach(edges, (row) =>
              Effect.gen(function* () {
                return TopicEdge.make({
                  slug: yield* decodeSlug(row.to_slug),
                  kind: yield* decodeEdgeKind(row.kind),
                });
              }),
            ),
          });
          return WikiPage.make({
            slug: decodedSlug,
            title: found.value.title,
            status: 'flagship',
            core: Option.some(core),
            sections: yield* composed(sourcing, {
              slug: decodedSlug,
              title: found.value.title,
              core: Option.some(core),
              catalogId: Option.fromNullishOr(keys[0]).pipe(
                Option.flatMap((row) => Schema.decodeOption(TopicId)(row.catalog_id)),
              ),
              titleOf,
              backlinksTo,
            }),
            unavailable: Option.none(),
            sectionsUnavailable: sectionsUnavailableFor(sourcing),
          });
        }).pipe(
          // Only SQL failures become `corrupt` here; a decode failure already
          // carries its own category and must not be relabelled.
          Effect.catchIf(
            (cause): cause is SqlError => !Schema.is(WikiUnavailableError)(cause),
            (cause) => Effect.fail(unavailable('topic')(cause)),
          ),
        ),
      );

      /** The whole alias table in one read (§2.5). A v1 dictionary is 250-400
       *  phrases (§4.1), so paging it would be machinery for a list that fits in
       *  a single query and is loaded once per client. */
      const dictionary = Effect.fn('WikiService.dictionary')(function* () {
        const refused = yield* gate('dictionary');
        if (Option.isSome(refused)) {
          return PhraseDictionary.make({ entries: [], unavailable: refused });
        }
        const rows = yield* sql<DictionaryRow>`
          SELECT alias, display, slug, canonical FROM topic_aliases ORDER BY alias
        `.pipe(Effect.mapError(unavailable('dictionary')));
        return PhraseDictionary.make({
          entries: yield* Effect.forEach(rows, (row) =>
            decodeSlug(row.slug).pipe(
              Effect.map((slug) =>
                PhraseDictionaryEntry.make({
                  alias: row.alias,
                  display: row.display,
                  slug,
                  canonical: row.canonical === 1,
                }),
              ),
            ),
          ),
          unavailable: Option.none(),
        });
      });

      const availability = gate('availability');

      return WikiService.of({ list, topic, dictionary: dictionary(), availability });
    }),
  );

  /** The artifact is present but could not be opened or read. Every call fails
   *  with the typed error rather than dying, so a host can tell a corrupt
   *  artifact apart from a missing one and say so — the state §3.5 would
   *  otherwise leave indistinguishable from absence.
   *
   *  `topic` still fails rather than falling back to a catalog page: absence is
   *  a known-good degradation, but an artifact that will not open is a fault
   *  the operator needs surfaced, not smoothed over. */
  static Broken = (input: {
    readonly operation: string;
    readonly message: string;
  }): Layer.Layer<WikiService> => {
    const failure = WikiUnavailableError.make({
      operation: input.operation,
      category: 'open-failed',
      message: input.message,
    });
    return Layer.succeed(
      WikiService,
      WikiService.of({
        list: () => Effect.fail(failure),
        topic: () => Effect.fail(failure),
        dictionary: Effect.fail(failure),
        availability: Effect.fail(failure),
      }),
    );
  };

  /** No topics artifact is installed. Every page is a catalog page carrying
   *  `artifact-not-installed` — never a failure. This is the layer a host
   *  provides when its `ensureTopics` caught and warned.
   *
   *  `list` is *not* empty and the pages are *not* section-less: the catalog
   *  tables ship inside the verified `bible.db`, so the long tail is still
   *  fully listable and every one of its pages still composes the §6.1 lineup
   *  from the corpora this host has. The wiki degrades to catalog-only rather
   *  than to nothing (§3.5) — a caller sees real pages plus the reason the
   *  authored cores are missing. */
  static Absent: Layer.Layer<WikiService, never, TopicService | WikiSectionSources> = Layer.effect(
    WikiService,
    Effect.gen(function* () {
      const catalog = yield* TopicService;
      const sourcing = yield* WikiSectionSources;
      return WikiService.of({
        list: (input) => catalogSummaries(catalog, input),
        // No artifact means no `topic_edges` table to read, so §2.3's live
        // backlinks are empty here rather than queried — the same value the
        // query would produce, without pretending there is a connection.
        topic: (slug) =>
          catalogPage(sourcing, slug, Option.some('artifact-not-installed'), noArtifactReads),
        dictionary: Effect.succeed(
          PhraseDictionary.make({
            entries: [],
            unavailable: Option.some('artifact-not-installed'),
          }),
        ),
        availability: Effect.succeed(Option.some('artifact-not-installed')),
      });
    }),
  );
}
