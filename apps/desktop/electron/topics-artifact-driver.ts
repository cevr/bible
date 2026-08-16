/** Electron main's SQLite driver for the topics artifact — the one definition.
 *
 *  Its own module rather than a `const` in `runtime.ts` because the two desktop
 *  artifact tests need the *same* driver the runtime builds, and importing
 *  `runtime.ts` would drag in the whole main-process service graph. The tests
 *  used to re-declare the three options and claim in a comment that they did
 *  not; a test that duplicates the thing it is testing passes while the
 *  original regresses, which is the failure this module removes rather than
 *  documents.
 */

import { immutableFilename, type ArtifactSqlClientLayer } from '@bible/core/wiki';
import * as SqliteNode from '@effect/sql-sqlite-node/SqliteClient';

/** Read-only, WAL disabled, over an `immutable=1` URI — the one mode the
 *  artifact is ever read in, and exactly how `bible.db` opens on the Bun host.
 *
 *  `readonly: true` is load-bearing beyond honesty. `node:sqlite` **creates** a
 *  missing database by default, so a plain `SqliteNode.layer({ filename })`
 *  turned "no artifact installed" — the §3.5 steady state until the first
 *  content release — into an empty file that reported itself corrupt on the
 *  first query and stayed on disk. Under `readOnly` a missing file fails the
 *  open instead, and the absence check in `layerArtifactOrAbsent` runs first
 *  anyway, so all three hosts decide the three states the same way. */
export const topicsArtifactDriver: ArtifactSqlClientLayer = (filename) =>
  SqliteNode.layer({
    filename: immutableFilename(filename),
    readonly: true,
    disableWAL: true,
  });
