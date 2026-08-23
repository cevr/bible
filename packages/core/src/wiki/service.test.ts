import { BunFileSystem } from '@effect/platform-bun';
import { Database } from 'bun:sqlite';
import { Effect, FileSystem, Layer, Option, Schema, type Scope } from 'effect';
import { describe, expect, it } from 'effect-bun-test';
import * as SqliteBun from '@effect/sql-sqlite-bun/SqliteClient';

import { TopicDetail, TopicId } from '../topics/model.js';
import { TopicService } from '../topics/service.js';
import {
  BlocksJson,
  ParagraphBlock,
  TextInline,
  topicSlug,
  type WikiPageSummary,
} from './model.js';
import { WikiSectionSources } from './section-composer.js';
import { layerBunOrAbsent } from './service-bun.js';
import { WikiService } from './service.js';

/** Builds a topics artifact on disk with the §2.2 schema and whatever rows a
 *  test declares. Real SQLite rather than a stub service: the absence contract
 *  is only worth testing against the same driver the hosts use. */
const artifact = (input: {
  /** A string because `meta.value` is a TEXT column: a corrupt version field is
   *  a value the artifact can really hold, and the reader's strict parse only
   *  has something to catch if the fixture can write one. */
  readonly schemaMajor: string;
  readonly topics?: readonly {
    readonly slug: string;
    readonly title: string;
    readonly thesis: string;
    readonly body: string;
  }[];
}): Effect.Effect<string, never, FileSystem.FileSystem | Scope.Scope> =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const directory = yield* fs
      .makeTempDirectoryScoped({ prefix: 'bible-topics-service-' })
      .pipe(Effect.orDie);
    return yield* Effect.sync(() => write(`${directory}/topics.db`, input));
  });

const write = (
  file: string,
  input: {
    readonly schemaMajor: string;
    readonly topics?: readonly {
      readonly slug: string;
      readonly title: string;
      readonly thesis: string;
      readonly body: string;
    }[];
  },
): string => {
  const database = new Database(file, { create: true });
  database.exec(`
    CREATE TABLE meta (key TEXT PRIMARY KEY, value TEXT NOT NULL);
    CREATE TABLE topics (slug TEXT PRIMARY KEY, title TEXT NOT NULL, thesis_ast TEXT NOT NULL, body_ast TEXT NOT NULL, position INTEGER NOT NULL);
    CREATE TABLE topic_aliases (alias TEXT PRIMARY KEY, display TEXT NOT NULL, slug TEXT NOT NULL, canonical INTEGER NOT NULL);
    CREATE TABLE topic_edges (from_slug TEXT NOT NULL, to_slug TEXT NOT NULL, kind TEXT NOT NULL, position INTEGER NOT NULL, PRIMARY KEY (from_slug, to_slug, kind));
    CREATE TABLE topic_catalog_keys (slug TEXT PRIMARY KEY, catalog_id TEXT NOT NULL, matched_by TEXT NOT NULL);
  `);
  database
    .prepare('INSERT INTO meta (key, value) VALUES (?, ?)')
    .run('schema_major', input.schemaMajor);
  const insert = database.prepare(
    'INSERT INTO topics (slug, title, thesis_ast, body_ast, position) VALUES (?, ?, ?, ?, ?)',
  );
  for (const [index, topic] of Option.getOrElse(
    Option.fromNullishOr(input.topics),
    (): readonly { slug: string; title: string; thesis: string; body: string }[] => [],
  ).entries()) {
    insert.run(topic.slug, topic.title, topic.thesis, topic.body, index);
  }
  database.close();
  return file;
};

/** The catalog long tail every listing now includes. Two entries, one of which
 *  (`sanctuary`) is also authored as a flagship page in several tests — the
 *  overlap is what proves a topic appears once, as its better half. */
const CATALOG = [
  TopicDetail.make({
    id: Schema.decodeSync(TopicId)('sanctuary'),
    name: 'Sanctuary',
    alternativeNames: [],
    sections: [],
  }),
  TopicDetail.make({
    id: Schema.decodeSync(TopicId)('grace'),
    name: 'Grace',
    alternativeNames: [],
    sections: [],
  }),
];

const catalog = TopicService.Test(CATALOG);

/** These tests are about the artifact reader, not about §6, so they wire the
 *  *explicit* degraded sourcing rather than four live corpora. `NotWired` is a
 *  layer a host chooses on purpose — which is the whole point of making
 *  `WikiSectionSources` a required dependency: there is no way to simply omit
 *  it and get an unexplained empty lineup. */
const live = (file: string): Layer.Layer<WikiService> =>
  WikiService.Live.pipe(
    Layer.provide(SqliteBun.layer({ filename: file, readonly: true })),
    Layer.provide(catalog),
    Layer.provide(WikiSectionSources.NotWired),
    Layer.orDie,
  );

/** {@link live}, over an artifact this same layer builds — so the whole graph is
 *  one value a test provides at its own boundary. */
const liveArtifact = (input: {
  readonly schemaMajor: string;
  readonly topics?: readonly {
    readonly slug: string;
    readonly title: string;
    readonly thesis: string;
    readonly body: string;
  }[];
}): Layer.Layer<WikiService, never, FileSystem.FileSystem | Scope.Scope> =>
  Layer.unwrap(Effect.map(artifact(input), live));

/** The catalog-only wiring a host gets from a path, for the tests that supply
 *  their own file rather than {@link artifact}'s. */
const orAbsent = (file: string): Layer.Layer<WikiService, never, FileSystem.FileSystem> =>
  layerBunOrAbsent(file).pipe(Layer.provide(catalog), Layer.provide(WikiSectionSources.NotWired));

/** The typed failure `list` gives for the artifact at `file`, read at that
 *  wiring's own boundary — the corrupt case and the absent case are two
 *  different graphs, so each is its own named call rather than one provide. */
const listFailureFrom = (file: string) =>
  Effect.flatMap(WikiService, (wiki) => Effect.flip(wiki.list({}))).pipe(
    Effect.provide(orAbsent(file)),
  );

/** Every corruption the version gate should report for the artifact at `file`,
 *  read at that file's own wiring — the loop below builds a fresh artifact per
 *  case, so one shared provide cannot serve them. */
const versionFailuresFrom = (file: string) =>
  Effect.gen(function* () {
    const wiki = yield* WikiService;
    return {
      availability: yield* Effect.flip(wiki.availability),
      list: yield* Effect.flip(wiki.list({})),
      topic: yield* Effect.flip(wiki.topic(topicSlug('sanctuary'))),
    };
  }).pipe(Effect.provide(live(file)));

/** The availability and listing length the artifact at `file` reports. */
const availabilityFrom = (file: string) =>
  Effect.gen(function* () {
    const wiki = yield* WikiService;
    return {
      availability: yield* wiki.availability,
      listed: (yield* wiki.list({})).length,
    };
  }).pipe(Effect.provide(orAbsent(file)));

const encodeBlocks = Schema.encodeSync(BlocksJson);
const THESIS = encodeBlocks([
  ParagraphBlock.make({ content: [TextInline.make({ text: 'The thesis.' })] }),
]);
const EMPTY = encodeBlocks([]);

describe('WikiService', () => {
  const test = it.scopedLive.layer(BunFileSystem.layer);

  test('lists the flagship pages an installed artifact carries', () =>
    Effect.gen(function* () {
      {
        const wiki = yield* WikiService;
        const topics = yield* wiki.list({});
        // Flagship pages first, in artifact order, then the catalog entries no
        // flagship page already covers — `sanctuary` is authored, so it appears
        // once, as a flagship.
        expect(topics.map((topic: WikiPageSummary) => String(topic.slug))).toEqual([
          'sanctuary',
          '2300-days',
          'grace',
        ]);
        expect(topics.map((topic: WikiPageSummary) => topic.status)).toEqual([
          'flagship',
          'flagship',
          'catalog',
        ]);
        expect(Option.isNone(yield* wiki.availability)).toBe(true);
      }
    }).pipe(
      Effect.provide(
        liveArtifact({
          schemaMajor: '1',
          topics: [
            { slug: 'sanctuary', title: 'The Sanctuary', thesis: THESIS, body: EMPTY },
            { slug: '2300-days', title: '2300 Days', thesis: THESIS, body: EMPTY },
          ],
        }),
      ),
    ));

  test('returns the authored core for a flagship slug', () =>
    Effect.gen(function* () {
      const wiki = yield* WikiService;
      const page = yield* wiki.topic(topicSlug('sanctuary'));
      expect(page.status).toBe('flagship');
      expect(Option.isSome(page.core)).toBe(true);
      expect(Option.isNone(page.unavailable)).toBe(true);
    }).pipe(
      Effect.provide(
        liveArtifact({
          schemaMajor: '1',
          topics: [{ slug: 'sanctuary', title: 'The Sanctuary', thesis: THESIS, body: EMPTY }],
        }),
      ),
    ));

  test('gives an unknown slug a catalog page rather than a failure', () =>
    Effect.gen(function* () {
      const wiki = yield* WikiService;
      const page = yield* wiki.topic(topicSlug('nowhere'));
      expect(page.status).toBe('catalog');
      expect(Option.isNone(page.core)).toBe(true);
      // Not a *reason* — the artifact is fine, this topic simply has no core.
      expect(Option.isNone(page.unavailable)).toBe(true);
    }).pipe(Effect.provide(liveArtifact({ schemaMajor: '1' }))));

  test('refuses an artifact whose schema major exceeds this build', () =>
    Effect.gen(function* () {
      {
        // Present on disk, readable, and still refused — as a typed value. The
        // authored cores drop out; the catalog long tail does not, so a refused
        // artifact degrades exactly as an absent one does.
        const wiki = yield* WikiService;
        const topics = yield* wiki.list({});
        expect(topics.every((topic: WikiPageSummary) => topic.status === 'catalog')).toBe(true);
        expect(topics.map((topic: WikiPageSummary) => String(topic.slug))).toEqual([
          'sanctuary',
          'grace',
        ]);
        expect(yield* wiki.availability).toEqual(Option.some('schema-too-new'));
        const page = yield* wiki.topic(topicSlug('sanctuary'));
        expect(page.status).toBe('catalog');
        expect(page.unavailable).toEqual(Option.some('schema-too-new'));
      }
    }).pipe(
      Effect.provide(
        liveArtifact({
          schemaMajor: '99',
          topics: [{ slug: 'sanctuary', title: 'The Sanctuary', thesis: THESIS, body: EMPTY }],
        }),
      ),
    ));

  it.effect('a missing artifact yields catalog entries and a typed absence', () =>
    Effect.gen(function* () {
      const wiki = yield* WikiService;
      // The whole point of §3.5: with no artifact the wiki is catalog-only, not
      // empty. The catalog tables ship inside the verified bible.db, so the long
      // tail is still fully listable.
      const topics = yield* wiki.list({});
      expect(topics.map((topic: WikiPageSummary) => String(topic.slug))).toEqual([
        'sanctuary',
        'grace',
      ]);
      expect(topics.every((topic: WikiPageSummary) => topic.status === 'catalog')).toBe(true);
      expect(yield* wiki.availability).toEqual(Option.some('artifact-not-installed'));
      const page = yield* wiki.topic(topicSlug('sanctuary'));
      expect(page.status).toBe('catalog');
      expect(page.unavailable).toEqual(Option.some('artifact-not-installed'));
    }).pipe(
      Effect.provide(
        WikiService.Absent.pipe(Layer.provide(catalog), Layer.provide(WikiSectionSources.NotWired)),
      ),
    ),
  );

  it.effect('reports a corrupt artifact as a typed error rather than a defect', () =>
    Effect.gen(function* () {
      const wiki = yield* WikiService;
      const failure = yield* Effect.flip(wiki.list({}));
      expect(failure.category).toBe('open-failed');
      expect(failure.operation).toBe('open-artifact');
      // A defect would have killed the fiber instead of arriving here.
      expect(Option.isSome(Option.fromNullishOr(failure.message))).toBe(true);
    }).pipe(
      Effect.provide(
        WikiService.Broken({ operation: 'open-artifact', message: 'file is not a database' }),
      ),
    ),
  );

  test('a corrupt artifact file fails typed, and a missing one is absence', () =>
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const directory = yield* fs
        .makeTempDirectoryScoped({ prefix: 'bible-topics-corrupt-' })
        .pipe(Effect.orDie);
      // Bytes that are emphatically not SQLite: the file exists, so this is the
      // corrupt state, which must stay distinguishable from absence.
      const corrupt = `${directory}/topics.db`;
      yield* fs.writeFileString(corrupt, 'not a database at all').pipe(Effect.orDie);

      // SQLite opens lazily, so garbage bytes surface on the first statement
      // rather than at open — `corrupt` either way, and the point stands: a
      // present-but-unreadable artifact is a typed error, never a defect and
      // never silently reported as "not installed".
      const broken = yield* listFailureFrom(corrupt);
      expect(broken.category).toBe('corrupt');

      // The same call against a path with no file is the typed absence, and it
      // still lists the catalog.
      const absent = yield* availabilityFrom(`${directory}/absent.db`);
      expect(absent.availability).toEqual(Option.some('artifact-not-installed'));
      expect(absent.listed).toBe(2);
    }));

  test('reports an unreadable schema_major as corrupt, not as a usable version', () =>
    Effect.gen(function* () {
      // `Number.parseInt('1junk', 10)` is 1, so a lenient read serves this file
      // as v1 — every row interpreted under a schema the file never claimed.
      // The whole artifact is present and queryable, so nothing else here would
      // notice; the version gate is the only thing that can.
      for (const schemaMajor of ['1junk', '', ' 1', '1.5', 'NaN', '-1', '9'.repeat(30)]) {
        const file = yield* artifact({
          schemaMajor,
          topics: [{ slug: 'sanctuary', title: 'The Sanctuary', thesis: THESIS, body: EMPTY }],
        });
        const failures = yield* versionFailuresFrom(file);
        expect(failures.availability.category).toBe('corrupt');
        expect(failures.availability.operation).toBe('availability');
        expect(failures.availability.message).toBe('Topics Artifact has no readable schema_major');
        expect(failures.list.category).toBe('corrupt');
        expect(failures.topic.category).toBe('corrupt');
      }
    }));

  test('reports a missing schema_major row as corrupt', () =>
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const directory = yield* fs
        .makeTempDirectoryScoped({ prefix: 'bible-topics-no-version-' })
        .pipe(Effect.orDie);
      const file = `${directory}/topics.db`;
      yield* Effect.sync(() => {
        write(file, {
          schemaMajor: '1',
          topics: [{ slug: 'sanctuary', title: 'The Sanctuary', thesis: THESIS, body: EMPTY }],
        });
        // The tables are all there; only the version row is gone. Reading such a
        // file means guessing which schema its rows speak, which is not a
        // degradation to smooth over.
        const database = new Database(file);
        database.exec("DELETE FROM meta WHERE key = 'schema_major'");
        database.close();
      });
      const failures = yield* versionFailuresFrom(file);
      expect(failures.availability.category).toBe('corrupt');
      expect(failures.availability.message).toBe('Topics Artifact has no readable schema_major');
    }));

  test('filters the listing by query', () =>
    Effect.gen(function* () {
      const wiki = yield* WikiService;
      const found = yield* wiki.list({ query: 'sanctu' });
      expect(found.map((topic: WikiPageSummary) => String(topic.slug))).toEqual(['sanctuary']);
      // A wildcard-only query must not act as a filter.
      expect((yield* wiki.list({ query: '%' })).length).toBe(2);
    }).pipe(
      Effect.provide(
        liveArtifact({
          schemaMajor: '1',
          topics: [
            { slug: 'sanctuary', title: 'The Sanctuary', thesis: THESIS, body: EMPTY },
            { slug: 'sabbath', title: 'The Sabbath', thesis: THESIS, body: EMPTY },
          ],
        }),
      ),
    ));
});
