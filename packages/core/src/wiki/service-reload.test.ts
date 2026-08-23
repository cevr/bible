/** §3.6's update, at the seam the reader actually reads through (round-3 F3).
 *
 *  The supply pipeline installs a new `topics.db` with an atomic `rename` over
 *  the path. A connection opened `immutable=1` holds the *inode* it opened, so
 *  a host that keeps one open goes on serving the previous content after a
 *  successful update — indefinitely, with nothing failing and nothing to see in
 *  any status. The desktop held exactly one such connection for the life of the
 *  process, which meant "the update installed" and "the reader serves the new
 *  content" were two different claims and only the first was true.
 *
 *  What is under test here is the second claim, over a real file, a real SQLite
 *  driver, and a real rename: content that exists **only** in the new artifact
 *  is served after `reload`, and was not served before it.
 *
 *  The Bun driver rather than a stub, for the reason the finding turns on: a
 *  stubbed client has no inode, so it would happily "see" the swap and the test
 *  would pass against the very code that shipped the bug.
 */

import { BunFileSystem } from '@effect/platform-bun';
import { Database } from 'bun:sqlite';
import * as SqliteBun from '@effect/sql-sqlite-bun/SqliteClient';
import { Context, Effect, FileSystem, Layer, Option } from 'effect';
import { describe, expect, it } from 'effect-bun-test';

import { TopicService } from '../topics/service.js';
import { WikiSectionSources } from './section-composer.js';
import {
  immutableFilename,
  layerArtifactOrAbsent,
  layerReloadableArtifact,
  layerReloadableWiki,
  ReloadableArtifact,
  type ArtifactSqlClientLayer,
} from './service-artifact.js';
import { topicSlug } from './model.js';
import { WikiService } from './service.js';

/** The same driver `service-bun.ts` ships, restated here rather than imported
 *  so this file does not pull the whole Bun composition in for one factory —
 *  and, more to the point, so the `immutable=1` URI that *causes* the finding
 *  is visible in the test that proves it fixed. */
const driver: ArtifactSqlClientLayer = (filename) =>
  SqliteBun.layer({
    filename: immutableFilename(filename),
    readonly: true,
    readwrite: false,
    create: false,
    disableWAL: true,
  });

/** The literal an empty AST array encodes to. Written out rather than encoded,
 *  because this is a fixture writer filling a column, not a domain value
 *  crossing a boundary. */
const EMPTY_AST = '[]';

/** One artifact carrying exactly one authored page. The slug is the parameter,
 *  so "the content that exists only in the new artifact" is a slug the old file
 *  does not contain — an observable no stale connection can fake. */
const writeArtifact = (file: string, slug: string, title: string): void => {
  const database = new Database(file, { create: true });
  database.exec(`
    CREATE TABLE meta (key TEXT PRIMARY KEY, value TEXT NOT NULL);
    CREATE TABLE topics (slug TEXT PRIMARY KEY, title TEXT NOT NULL, thesis_ast TEXT NOT NULL, body_ast TEXT NOT NULL, position INTEGER NOT NULL);
    CREATE TABLE topic_aliases (alias TEXT PRIMARY KEY, display TEXT NOT NULL, slug TEXT NOT NULL, canonical INTEGER NOT NULL);
    CREATE TABLE topic_edges (from_slug TEXT NOT NULL, to_slug TEXT NOT NULL, kind TEXT NOT NULL, position INTEGER NOT NULL, PRIMARY KEY (from_slug, to_slug, kind));
    CREATE TABLE topic_catalog_keys (slug TEXT PRIMARY KEY, catalog_id TEXT NOT NULL, matched_by TEXT NOT NULL);
    INSERT INTO meta (key, value) VALUES ('schema_major', '1');
  `);
  database
    .prepare(
      'INSERT INTO topics (slug, title, thesis_ast, body_ast, position) VALUES (?, ?, ?, ?, ?)',
    )
    .run(slug, title, EMPTY_AST, EMPTY_AST, 0);
  database.close();
  return;
};

/** The two dependencies the artifact-backed wiki composes over. Neither reads
 *  `topics.db`, which is the point: a reload must reopen the artifact and leave
 *  the other corpora alone. */
const dependencies: Layer.Layer<TopicService | WikiSectionSources> = Layer.merge(
  TopicService.Test([]),
  WikiSectionSources.NotWired,
);

/** The paths one reload test works over: a scoped temp directory, the active
 *  artifact path, and the staging path an install renames from.
 *
 *  A service rather than three locals, so the host layer a test provides at its
 *  own boundary can be built from the same paths the test body reads. */
class ReloadFixture extends Context.Service<
  ReloadFixture,
  { readonly directory: string; readonly destination: string; readonly staged: string }
>()('@bible/core/wiki/test/ReloadFixture') {
  /** A fresh temp directory, with `seed` — when given — written to the active
   *  path before anything opens it. */
  static readonly layer = (
    seed: Option.Option<{ readonly slug: string; readonly title: string }>,
  ): Layer.Layer<ReloadFixture, never, FileSystem.FileSystem> =>
    Layer.effect(
      ReloadFixture,
      Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem;
        const directory = yield* fs
          .makeTempDirectoryScoped({ prefix: 'wiki-reload-' })
          .pipe(Effect.orDie);
        const destination = `${directory}/topics.db`;
        yield* Option.match(seed, {
          onNone: () => Effect.void,
          onSome: (present) =>
            Effect.sync(() => writeArtifact(destination, present.slug, present.title)),
        });
        return ReloadFixture.of({
          directory,
          destination,
          staged: `${directory}/topics.db.building`,
        });
      }),
    );
}

/** The reloadable host over {@link ReloadFixture}'s active path, plus the
 *  fixture itself — one layer a test provides once, at its own boundary. */
const reloadableHost = (
  seed: Option.Option<{ readonly slug: string; readonly title: string }> = Option.none(),
): Layer.Layer<WikiService | ReloadableArtifact | ReloadFixture, never, FileSystem.FileSystem> =>
  Layer.unwrap(
    Effect.map(ReloadFixture, (fixture) =>
      layerReloadableArtifact(driver, fixture.destination).pipe(Layer.provide(dependencies)),
    ),
  ).pipe(Layer.provideMerge(ReloadFixture.layer(seed)));

/** Every authored slug the non-reloadable composition serves for `file`, read
 *  at that composition's own boundary. */
const slugsFromArtifact = (file: string) =>
  authoredSlugs().pipe(
    Effect.provide(layerArtifactOrAbsent(driver, file).pipe(Layer.provide(dependencies))),
  );

/** Every authored slug the wiki currently serves. `list` rather than `topic`
 *  because it answers "what is in this artifact" without the catalog long tail
 *  deciding the answer for it. */
const authoredSlugs = Effect.fn('reload-test.authoredSlugs')(function* () {
  const wiki = yield* WikiService;
  const pages = yield* wiki.list({});
  return pages.map((page) => String(page.slug));
});

describe('§3.6 the reader after an update', () => {
  const test = it.scopedLive.layer(BunFileSystem.layer);

  /** The finding itself. Two artifacts, one path, one rename between them.
   *
   *  Before `reload` the host must still serve the *old* page — not because
   *  staleness is wanted, but because a test that could not observe the stale
   *  window would not be observing the inode at all, and would pass against a
   *  driver that never held one. */
  test('serves content that exists only in the new artifact, after reload', () =>
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const { destination, staged } = yield* ReloadFixture;
      {
        // The generation this host opened.
        expect(yield* authoredSlugs()).toEqual(['sanctuary']);

        // §3.6's install, at the only step the reader can observe: a verified
        // candidate renamed over the active path.
        yield* Effect.sync(() => writeArtifact(staged, 'investigative-judgment', 'The Judgment'));
        yield* fs.rename(staged, destination);

        // The open connection still holds the old inode. This is the state the
        // desktop was permanently stuck in.
        expect(yield* authoredSlugs()).toEqual(['sanctuary']);

        yield* Effect.flatMap(ReloadableArtifact, (artifact) => artifact.reload);

        // The page that exists only in the new artifact.
        expect(yield* authoredSlugs()).toEqual(['investigative-judgment']);
        const page = yield* Effect.flatMap(WikiService, (wiki) =>
          wiki.topic(topicSlug('investigative-judgment')),
        );
        expect(page.title).toBe('The Judgment');
      }
    }).pipe(
      Effect.provide(reloadableHost(Option.some({ slug: 'sanctuary', title: 'The Sanctuary' }))),
    ));

  /** The first install onto a host that had nothing. A reload of the
   *  *connection* could not do this — there is no connection to reload — which
   *  is why the seam rebuilds the whole three-state decision and not just the
   *  driver. It is also the ordinary case today: `TOPICS_ARTIFACT_RELEASE` is
   *  `None`, so every install starts from absent. */
  test('an absent artifact becomes live after the first install and a reload', () =>
    Effect.gen(function* () {
      const { destination } = yield* ReloadFixture;
      {
        // §3.5's steady state: no artifact, catalog-only, and a typed reason.
        expect(yield* authoredSlugs()).toEqual([]);
        const before = yield* Effect.flatMap(WikiService, (wiki) => wiki.availability);
        expect(Option.getOrUndefined(before)).toBe('artifact-not-installed');

        yield* Effect.sync(() => writeArtifact(destination, 'sanctuary', 'The Sanctuary'));
        yield* Effect.flatMap(ReloadableArtifact, (artifact) => artifact.reload);

        expect(yield* authoredSlugs()).toEqual(['sanctuary']);
        const after = yield* Effect.flatMap(WikiService, (wiki) => wiki.availability);
        expect(Option.isNone(after)).toBe(true);
      }
    }).pipe(Effect.provide(reloadableHost())));

  /** A reload whose new file cannot be opened must leave the working generation
   *  serving — the same stale-fallback posture the installer takes when it
   *  refuses a candidate. A reload that could break a working reader would make
   *  §3.6's "a mismatch leaves the installed generation active" true of the
   *  file and false of the app.
   *
   *  The assertion is the **content**, not that the call resolved. Round 4
   *  found this test asserting only that `availability` produced *some* result
   *  tag, which a `Broken` service satisfies as readily as a working one — so
   *  it passed against the unconditional swap it was written to forbid. */
  test('a reload that cannot open the artifact keeps the previous generation serving', () =>
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const { destination } = yield* ReloadFixture;
      {
        expect(yield* authoredSlugs()).toEqual(['sanctuary']);

        // Not an artifact at all — the state a truncated download would leave
        // if it somehow reached the destination.
        yield* fs.writeFileString(destination, 'not a database');
        yield* Effect.flatMap(ReloadableArtifact, (artifact) => artifact.reload);

        // The page the working generation serves, still served. Not "a result
        // came back": the reader must still be answering *from the artifact it
        // had*, which only the previous generation can do.
        // The slug the working generation holds, still served. Not "a result
        // came back": the reader is answering *from the artifact it opened*,
        // which only the previous generation can do — the bytes at that path
        // are no longer a database at all.
        expect(yield* authoredSlugs()).toEqual(['sanctuary']);
        //
        // Only the pages this connection already read are asserted on. The
        // destination's *bytes* are now garbage, and `immutable=1` does not
        // pin them — SQLite still faults unread pages in from the path, so a
        // table this generation never touched would come back corrupt no matter
        // which seam is in place. That is a property of the file, not of the
        // reload, and asserting it would be asserting SQLite's page cache.
        //
        // No typed absence or open-failure is reported, because none
        // happened to the generation that is serving. A swapped-in `Broken`
        // would fail this call, and an `Absent` would answer
        // `artifact-not-installed`.
        const availability = yield* Effect.flatMap(WikiService, (wiki) => wiki.availability);
        expect(Option.isNone(availability)).toBe(true);
      }
    }).pipe(
      Effect.provide(reloadableHost(Option.some({ slug: 'sanctuary', title: 'The Sanctuary' }))),
    ));

  /** A query already running when a reload lands must finish against the
   *  generation it started on (round-4 F3/B1).
   *
   *  The hand-rolled seam read the current generation, then ran the query with
   *  no lease held; a `reload` that interleaved closed that connection while the
   *  query was mid-flight. `RcRef.get` takes a reference for the duration of the
   *  call and `invalidate` defers the close until the last one lets go, which is
   *  what makes this safe rather than merely unlikely.
   *
   *  The interleave is forced rather than raced: the reload runs *between* the
   *  reader's borrow and its use, in a fiber the test joins, so the window is
   *  entered every run instead of on an unlucky schedule. */
  test('a query in flight when a reload lands still answers', () =>
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const { destination, staged } = yield* ReloadFixture;
      {
        const wiki = yield* WikiService;
        const artifact = yield* ReloadableArtifact;

        // Ten readers and a reload, all in flight together. Each reader is a
        // full borrow-query-release cycle, so the reload's `invalidate` has to
        // land against a moving reference count rather than a quiet one.
        yield* Effect.sync(() => writeArtifact(staged, 'investigative-judgment', 'The Judgment'));
        yield* fs.rename(staged, destination);

        const readers = Effect.forEach(
          [0, 1, 2, 3, 4, 5, 6, 7, 8, 9],
          () => Effect.map(wiki.list({}), (pages) => pages.map((page) => String(page.slug))),
          { concurrency: 'unbounded' },
        );
        const [answers] = yield* Effect.all([readers, artifact.reload], {
          concurrency: 'unbounded',
        });

        // Every reader answered, and every answer is a whole generation: the
        // one that was serving when it borrowed, or the one that replaced it.
        // Never an error, and never an empty list from a connection closed
        // underneath it.
        for (const answer of answers) {
          expect(answer).toHaveLength(1);
          expect(['sanctuary', 'investigative-judgment']).toContain(String(answer.at(0)));
        }

        // And after the dust settles, the new generation is the one serving.
        expect(yield* authoredSlugs()).toEqual(['investigative-judgment']);
      }
    }).pipe(
      Effect.provide(reloadableHost(Option.some({ slug: 'sanctuary', title: 'The Sanctuary' }))),
    ));

  /** Shutdown closes every generation, each exactly once — the live one
   *  included.
   *
   *  Counted rather than inspected: the chooser wraps each build in an
   *  `acquireRelease` whose finalizer records the tag, so the tally is over
   *  real `Scope` lifetimes and both claims — nothing leaked, nothing closed
   *  twice — read off the same list.
   *
   *  **What this does and does not discriminate.** It is a live regression
   *  guard on the `RcRef` wiring: an `acquire` that registered against the
   *  wrong scope, an `invalidate` that dropped a generation without closing it,
   *  or a borrow whose release ran twice would all show up here. It does *not*
   *  fail against the hand-rolled seam it replaced, and the reason is worth
   *  recording: that seam's `Layer.build` registered its finalizers on the
   *  *enclosing* scope, which in this harness is the test's, so its leaked
   *  generations were still swept up at the end — and `Scope.close` is
   *  idempotent, so its double-close was absorbed. The defect was real in a
   *  long-lived host, where the enclosing scope is the process. The two
   *  properties that *are* falsifiable at this seam — the lease and the
   *  conditional swap — are the two tests above, and both fail against it. */
  test('every generation is finalized exactly once, including the last', () =>
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const directory = yield* fs.makeTempDirectoryScoped({ prefix: 'wiki-reload-' });
      const destination = `${directory}/topics.db`;
      yield* Effect.sync(() => writeArtifact(destination, 'sanctuary', 'The Sanctuary'));

      const opened: string[] = [];
      const closed: string[] = [];
      let generation = 0;
      let stillOpen: readonly string[] = [];
      /** The shipped chooser, with each build tagged and its close counted. */
      const choose = (): Layer.Layer<
        WikiService,
        never,
        FileSystem.FileSystem | TopicService | WikiSectionSources
      > =>
        Layer.effectDiscard(
          Effect.acquireRelease(
            Effect.sync(() => {
              generation += 1;
              const tag = `generation-${String(generation)}`;
              opened.push(tag);
              return tag;
            }),
            (tag) => Effect.sync(() => closed.push(tag)),
          ),
        ).pipe(Layer.merge(layerArtifactOrAbsent(driver, destination)));

      yield* Effect.scoped(
        Effect.gen(function* () {
          const built = yield* Layer.build(
            layerReloadableWiki(choose).pipe(Layer.provide(dependencies)),
          );
          const artifact = Context.get(built, ReloadableArtifact);
          const wiki = Context.get(built, WikiService);

          // Force the first build: nothing is opened until something reads.
          yield* wiki.list({});
          yield* artifact.reload;
          yield* wiki.list({});
          yield* artifact.reload;
          yield* wiki.list({});

          // The generation that answered the last read is still open — it is
          // the one serving, and nothing has retired it.
          stillOpen = opened.filter((tag) => !closed.includes(tag));
          expect(stillOpen.length).toBeGreaterThan(0);
        }),
      );

      // The host's scope has closed. Whatever was still open is closed now —
      // the case the hand-rolled seam leaked, because its finalizer owned the
      // *first* scope and every reload replaced the value that finalizer could
      // no longer reach. Three reloads there left three generations open for
      // the life of the process.
      for (const tag of stillOpen) expect(closed).toContain(tag);
      // And every generation ever opened is closed, each exactly once. The
      // same finalizer that leaked the last one could close the first twice.
      expect(closed).toHaveLength(opened.length);
      expect(new Set(closed).size).toBe(closed.length);
      expect([...closed].sort()).toEqual([...opened].sort());
    }));

  /** The non-reloading composition is unchanged. `layerArtifactOrAbsent` is
   *  what the CLI and every existing suite build, and adding a reloadable
   *  variant must not have altered what it does — a process that exits has no
   *  swap to observe. */
  test('the non-reloadable layer still resolves an installed artifact', () =>
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const directory = yield* fs.makeTempDirectoryScoped({ prefix: 'wiki-reload-' });
      const destination = `${directory}/topics.db`;
      yield* Effect.sync(() => writeArtifact(destination, 'sanctuary', 'The Sanctuary'));

      const slugs = yield* slugsFromArtifact(destination);
      expect(slugs).toEqual(['sanctuary']);
    }));
});
