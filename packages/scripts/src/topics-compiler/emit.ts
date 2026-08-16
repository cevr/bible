import { BlocksJson } from '@bible/core/wiki';
import { Database } from 'bun:sqlite';
import { Clock, DateTime, Effect, FileSystem, Schema } from 'effect';

import type { CompiledTopics } from './compile.js';

/** The §2.2 DDL, verbatim. The artifact is created from scratch on every
 *  compile, so there is no migration path to keep and the schema in the repo is
 *  always exactly the schema on disk. */
const DDL = `
CREATE TABLE meta (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

CREATE TABLE topics (
  slug        TEXT PRIMARY KEY,
  title       TEXT NOT NULL,
  thesis_ast  TEXT NOT NULL,
  body_ast    TEXT NOT NULL,
  position    INTEGER NOT NULL
);

CREATE TABLE topic_aliases (
  alias       TEXT PRIMARY KEY,
  display     TEXT NOT NULL,
  slug        TEXT NOT NULL REFERENCES topics(slug) ON DELETE CASCADE,
  canonical   INTEGER NOT NULL
);

CREATE TABLE topic_edges (
  from_slug   TEXT NOT NULL REFERENCES topics(slug) ON DELETE CASCADE,
  to_slug     TEXT NOT NULL,
  kind        TEXT NOT NULL CHECK(kind IN ('authored', 'backlink')),
  position    INTEGER NOT NULL,
  PRIMARY KEY (from_slug, to_slug, kind)
);

CREATE TABLE topic_catalog_keys (
  slug        TEXT PRIMARY KEY REFERENCES topics(slug) ON DELETE CASCADE,
  catalog_id  TEXT NOT NULL,
  matched_by  TEXT NOT NULL CHECK(matched_by IN ('override', 'name'))
);

CREATE INDEX idx_topic_aliases_slug ON topic_aliases(slug);
CREATE INDEX idx_topic_edges_to ON topic_edges(to_slug);
`;

const encodeBlocks = Schema.encodeSync(BlocksJson);

/** Writing the artifact is infrastructure, not a compile rule: a failure here
 *  means the disk or the SQLite driver failed, which no caller can recover
 *  from, so it dies rather than joining `CompileError`. */
class ArtifactWriteError extends Schema.TaggedError<ArtifactWriteError>()('ArtifactWriteError', {
  cause: Schema.Unknown,
}) {}

export interface EmittedArtifact {
  readonly path: string;
  readonly size: number;
  readonly digest: string;
  readonly revision: string;
}

/** Writes the artifact and returns the manifest §3.4 step 7 asks for. The
 *  revision is the source digest's prefix: content-addressed, so recompiling an
 *  unchanged content set produces the same revision and the supply pipeline
 *  correctly reports it as already current. */
export const emitArtifact = Effect.fn('TopicsCompiler.emit')(function* (input: {
  readonly compiled: CompiledTopics;
  readonly destination: string;
}) {
  const compiled = input.compiled;
  const revision = `topics-${compiled.sourceDigest.slice(0, 12)}`;
  const fs = yield* FileSystem.FileSystem;
  const compiledAt = yield* Clock.currentTimeMillis;
  // A fresh file every compile: the emitter owns the whole artifact, so a
  // leftover from a previous run must not survive into this one.
  yield* fs.remove(input.destination, { force: true }).pipe(Effect.orDie);
  yield* Effect.acquireUseRelease(
    Effect.try({
      try: () => new Database(input.destination, { create: true }),
      catch: (cause) => ArtifactWriteError.make({ cause }),
    }),
    (database) =>
      Effect.try({
        try: (): void => {
          database.exec('PRAGMA journal_mode = DELETE');
          database.exec(DDL);
          const insertMeta = database.prepare('INSERT INTO meta (key, value) VALUES (?, ?)');
          const insertTopic = database.prepare(
            'INSERT INTO topics (slug, title, thesis_ast, body_ast, position) VALUES (?, ?, ?, ?, ?)',
          );
          const insertAlias = database.prepare(
            'INSERT INTO topic_aliases (alias, display, slug, canonical) VALUES (?, ?, ?, ?)',
          );
          const insertEdge = database.prepare(
            'INSERT INTO topic_edges (from_slug, to_slug, kind, position) VALUES (?, ?, ?, ?)',
          );
          const insertKey = database.prepare(
            'INSERT INTO topic_catalog_keys (slug, catalog_id, matched_by) VALUES (?, ?, ?)',
          );
          database.transaction(() => {
            insertMeta.run('schema_major', String(compiled.schemaMajor));
            insertMeta.run('schema_minor', String(compiled.schemaMinor));
            insertMeta.run('content_revision', revision);
            insertMeta.run('compiled_at', DateTime.formatIso(DateTime.makeUnsafe(compiledAt)));
            insertMeta.run('bible_db_revision', compiled.bibleDbRevision);
            insertMeta.run('source_digest', compiled.sourceDigest);
            for (const topic of compiled.topics) {
              insertTopic.run(
                topic.slug,
                topic.title,
                encodeBlocks(topic.thesis),
                encodeBlocks(topic.body),
                topic.position,
              );
            }
            for (const alias of compiled.aliases) {
              insertAlias.run(alias.alias, alias.display, alias.slug, Number(alias.canonical));
            }
            for (const edge of compiled.edges) {
              insertEdge.run(edge.from, edge.to, edge.kind, edge.position);
            }
            for (const key of compiled.catalogKeys) {
              insertKey.run(key.slug, key.catalogId, key.matchedBy);
            }
          })();
        },
        catch: (cause) => ArtifactWriteError.make({ cause }),
      }),
    (database) => Effect.sync(() => database.close()),
  ).pipe(Effect.orDie);

  const bytes = yield* fs.readFile(input.destination).pipe(Effect.orDie);
  const hasher = new Bun.CryptoHasher('sha256');
  hasher.update(bytes);
  return {
    path: input.destination,
    size: bytes.byteLength,
    digest: `sha256:${hasher.digest('hex')}`,
    revision,
  } satisfies EmittedArtifact;
});
