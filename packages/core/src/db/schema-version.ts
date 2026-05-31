/**
 * Per-service schema versioning over a shared SQLite file.
 *
 * Several services (EGW paragraphs, KJV bible, Strong's, cross-refs, margin
 * notes — and on desktop, the API-response cache) live in ONE cache.sqlite
 * file behind ONE connection. They each evolve their own tables and need their
 * own "drop + rebuild on schema bump" check.
 *
 * They used to each use SQLite's single `PRAGMA user_version` for this. That's
 * one integer PER DATABASE FILE, not per table — so with N services stamping it
 * with N different numbers at startup, the last writer won and every other
 * service saw a mismatch on the next launch and dropped + rebuilt its tables.
 * For the EGW paragraph index (~8k+ rows rebuilt from cached chapter blobs)
 * that turned every launch into a full re-index — a multi-second cold start.
 *
 * This helper replaces `user_version` with a `schema_versions(name, version)`
 * table: each service owns ONE row keyed by a stable name and reads/writes only
 * that row, so services no longer clobber each other.
 *
 * Driver-agnostic: plain SQL over `SqlClient`, works under both the sqlite-node
 * (Electron main) and sqlite-bun (CLI/tests) drivers.
 */

import { Effect } from 'effect';
import type * as SqlClient from 'effect/unstable/sql/SqlClient';
import type { SqlError } from 'effect/unstable/sql/SqlError';

/**
 * Ensure the shared `schema_versions` registry table exists. Idempotent; safe
 * to call from every service's init (the first one wins, the rest no-op).
 */
export const ensureSchemaVersionsTable = (
  sql: SqlClient.SqlClient,
): Effect.Effect<void, SqlError> =>
  sql
    .unsafe(
      `CREATE TABLE IF NOT EXISTS schema_versions (
         name TEXT PRIMARY KEY,
         version INTEGER NOT NULL
       )`,
    )
    .pipe(Effect.asVoid);

/**
 * Read a service's stored schema version. Returns 0 when the service has never
 * stamped a version (fresh DB, or first run after migrating off
 * `PRAGMA user_version`) — callers treat 0 as "fresh, don't drop".
 */
export const readSchemaVersion = (
  sql: SqlClient.SqlClient,
  name: string,
): Effect.Effect<number, SqlError> =>
  sql<{
    version: number;
  }>`SELECT version FROM schema_versions WHERE name = ${name}`.pipe(
    Effect.map((rows) => rows[0]?.version ?? 0),
  );

/** Upsert a service's stored schema version. */
export const writeSchemaVersion = (
  sql: SqlClient.SqlClient,
  name: string,
  version: number,
): Effect.Effect<void, SqlError> =>
  sql`
    INSERT INTO schema_versions (name, version) VALUES (${name}, ${version})
    ON CONFLICT(name) DO UPDATE SET version = excluded.version
  `.pipe(Effect.asVoid);
