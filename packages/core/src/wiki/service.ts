import { Context, Effect, Layer, Option, Schema } from 'effect';
import * as SqlClient from 'effect/unstable/sql/SqlClient';
import type { SqlError } from 'effect/unstable/sql/SqlError';

import { readTopicsSchemaMajor } from '../corpus-supply/file-artifact.js';
import { TopicService, type TopicServiceApi } from '../topics/service.js';
import {
  AuthoredCore,
  BlocksJson,
  TOPICS_SCHEMA_MAJOR,
  TopicAlias,
  TopicEdge,
  TopicEdgeKind,
  TopicSlug,
  type TopicsUnavailableReason,
  WikiPage,
  WikiPageSummary,
  type WikiListInput,
} from './model.js';

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
  readonly topic: (slug: TopicSlug) => Effect.Effect<WikiPage, WikiError>;
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

/** A page with no authored core, carrying why. Milestone 3 gives this the
 *  live-assembled section lineup; Milestone 2 returns the shell so the three
 *  clients already agree on the shape and the absence reason. */
const catalogPage = (slug: TopicSlug, reason: Option.Option<TopicsUnavailableReason>): WikiPage =>
  WikiPage.make({
    slug,
    title: slug,
    status: 'catalog',
    core: Option.none(),
    unavailable: reason,
  });

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
  static Live: Layer.Layer<WikiService, never, SqlClient.SqlClient | TopicService> = Layer.effect(
    WikiService,
    Effect.gen(function* () {
      const sql = yield* SqlClient.SqlClient;
      const catalog = yield* TopicService;

      /** `None` while the artifact is usable, `Some(reason)` when its schema
       *  major is beyond this build. A version that cannot be read at all fails
       *  in the typed channel instead — see `readSchemaMajor`. Read per call
       *  rather than cached at layer construction: the artifact can be swapped
       *  underneath a running host. */
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

      const topic = Effect.fn('WikiService.topic')((slug: TopicSlug) =>
        Effect.gen(function* () {
          const refused = yield* gate('topic');
          if (Option.isSome(refused)) return catalogPage(slug, refused);
          const rows = yield* sql<TopicRow>`
            SELECT slug, title, thesis_ast, body_ast FROM topics WHERE slug = ${slug} LIMIT 1
          `;
          const found = Option.fromNullishOr(rows[0]);
          // A slug the artifact does not carry is a catalog page, not a miss:
          // §2.1 gives every topic a page and only flagship pages an authored
          // core. Milestone 3 fills the lineup in.
          if (Option.isNone(found)) return catalogPage(slug, Option.none());
          const aliases = yield* sql<AliasRow>`
            SELECT alias, display, canonical FROM topic_aliases WHERE slug = ${slug} ORDER BY alias
          `;
          const edges = yield* sql<EdgeRow>`
            SELECT to_slug, kind FROM topic_edges WHERE from_slug = ${slug}
            ORDER BY kind, position
          `;
          return WikiPage.make({
            slug: yield* decodeSlug(found.value.slug),
            title: found.value.title,
            status: 'flagship',
            core: Option.some(
              AuthoredCore.make({
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
              }),
            ),
            unavailable: Option.none(),
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

      const availability = gate('availability');

      return WikiService.of({ list, topic, availability });
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
        availability: Effect.fail(failure),
      }),
    );
  };

  /** No topics artifact is installed. Every page is a catalog page carrying
   *  `artifact-not-installed` — never a failure. This is the layer a host
   *  provides when its `ensureTopics` caught and warned.
   *
   *  `list` is *not* empty: the catalog tables ship inside the verified
   *  `bible.db`, so the long tail is still fully available and the wiki
   *  degrades to catalog-only rather than to nothing (§3.5). A caller sees the
   *  entries plus the reason the authored cores are missing. */
  static Absent: Layer.Layer<WikiService, never, TopicService> = Layer.effect(
    WikiService,
    Effect.gen(function* () {
      const catalog = yield* TopicService;
      return WikiService.of({
        list: (input) => catalogSummaries(catalog, input),
        topic: (slug) => Effect.succeed(catalogPage(slug, Option.some('artifact-not-installed'))),
        availability: Effect.succeed(Option.some('artifact-not-installed')),
      });
    }),
  );
}
