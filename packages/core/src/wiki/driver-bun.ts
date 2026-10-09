/** The Bun SQLite driver the artifact-backed wiki opens its files through. */

import * as SqliteBun from '@effect/sql-sqlite-bun/SqliteClient';

import { immutableFilename, type ArtifactSqlClientLayer } from './service-artifact.js';

/** The artifact is immutable at rest — only the supply pipeline's atomic swap
 *  ever replaces it — so it opens read-only with WAL disabled, exactly as
 *  `bible.db` does. `create: false` is what keeps the driver from manufacturing
 *  a missing artifact behind the existence check's back. */
export const bunArtifactDriver: ArtifactSqlClientLayer = (filename) =>
  SqliteBun.layer({
    filename: immutableFilename(filename),
    readonly: true,
    readwrite: false,
    create: false,
    disableWAL: true,
  });
