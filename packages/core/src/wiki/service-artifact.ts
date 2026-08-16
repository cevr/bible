/** Resolving an installed `topics.db` into a `WikiService`, driver-agnostically.
 *
 *  The three §3.5 states a host must keep apart — absent, present-and-readable,
 *  present-but-broken — are decided here once rather than per host. Only the
 *  SQLite driver differs between Bun, Electron main and the worker, so only the
 *  driver is a parameter: the file-existence check, the read-only open, and the
 *  mapping from each outcome onto `Absent` / `Live` / `Broken` are shared.
 *
 *  Sharing this matters because the states are easy to conflate in exactly one
 *  direction. Every Node/Bun SQLite driver **creates** a missing file unless
 *  told not to, so a host that opens the artifact without checking first turns
 *  "not installed" into "installed and empty" — the first query then reports a
 *  corrupt artifact, and the file it just created is left on disk. */

import { Cause, Effect, FileSystem, Layer, Result } from 'effect';
import type * as SqlClient from 'effect/unstable/sql/SqlClient';

import type { TopicService } from '../topics/service.js';
import type { WikiSectionSources } from './section-composer.js';
import { WikiService } from './service.js';

/** Opens the artifact **read-only and without creating it**, in this host's
 *  driver.
 *
 *  Both properties are load-bearing rather than defensive. The artifact is
 *  immutable at rest — only the supply pipeline's atomic swap ever replaces it
 *  — so read-only is the truthful mode; and no-create is what keeps a
 *  driver-level open from manufacturing the very file whose absence the caller
 *  already established. Each driver spells the second differently
 *  (`create: false` on `bun:sqlite`, implied by `readOnly` on `node:sqlite`),
 *  which is exactly why the driver is the parameter and the decision is not. */
export type ArtifactSqlClientLayer = (
  filename: string,
) => Layer.Layer<SqlClient.SqlClient, unknown, never>;

/** Reads an installed artifact through one driver.
 *
 *  A driver failure here is *not* a defect. `layerArtifactOrAbsent` has
 *  established that the file exists, so failing to open it means the file is
 *  there but unreadable — a corrupt or truncated artifact, which §3.5 makes a
 *  reportable state rather than a crash. The failure becomes a `WikiService`
 *  whose every call carries the typed error, so "missing" (absence) and
 *  "present but broken" (`open-failed`) survive all the way to the caller. */
export const layerArtifact = (
  driver: ArtifactSqlClientLayer,
  filename: string,
): Layer.Layer<WikiService, never, TopicService | WikiSectionSources> =>
  WikiService.Live.pipe(
    Layer.provide(driver(filename)),
    Layer.catchCause((cause) =>
      WikiService.Broken({ operation: 'open-artifact', message: Cause.pretty(cause) }),
    ),
  );

/** The layer a host actually wants: the installed artifact when there is one,
 *  and the typed-absence service when there is not. Keeping the choice here
 *  means no caller has to know that "no file" is a legal, non-failing state —
 *  and no caller can skip the check and have its driver create the file.
 *
 *  A failing `exists` is not a defect either. The check is filesystem
 *  reachability, and an unreachable path is exactly the "present but not usable"
 *  state §3.5 makes reportable — so it becomes a `WikiService` whose calls fail
 *  with the typed error, the same shape a corrupt artifact produces. Dying here
 *  would take the whole host down over a stat the wiki alone needed. */
export const layerArtifactOrAbsent = (
  driver: ArtifactSqlClientLayer,
  filename: string,
): Layer.Layer<WikiService, never, FileSystem.FileSystem | TopicService | WikiSectionSources> =>
  Layer.unwrap(
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const found = yield* fs.exists(filename).pipe(
        Effect.map(Result.succeed),
        Effect.catchCause((cause) => Effect.succeed(Result.fail(Cause.pretty(cause)))),
      );
      if (Result.isFailure(found)) {
        return WikiService.Broken({ operation: 'stat-artifact', message: found.failure });
      }
      if (!found.success) return WikiService.Absent;
      return layerArtifact(driver, filename);
    }),
  );

/** The `file:…?immutable=1` URI this artifact opens under, the same way
 *  `bible.db` does — one shared builder, so the encoding cannot be right for
 *  one artifact and wrong for the other. Re-exported here because every
 *  driver's layer factory reaches for it beside `ArtifactSqlClientLayer`. */
export { immutableFileUri as immutableFilename } from '../db/immutable-uri.js';
