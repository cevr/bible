/** Bun runtime composition for the driver-agnostic WikiService. */

import * as SqliteBun from '@effect/sql-sqlite-bun/SqliteClient';
import { Cause, Effect, FileSystem, Layer, Result } from 'effect';

import { TopicService } from '../topics/service.js';
import { WikiService } from './service.js';

const immutableFilename = (filename: string): string => {
  let uri = filename;
  if (!filename.startsWith('file:')) uri = `file:${encodeURI(filename)}`;
  let separator = '?';
  if (uri.includes('?')) separator = '&';
  return `${uri}${separator}immutable=1`;
};

/** Reads an installed `topics.db`. The artifact is immutable at rest — only the
 *  supply pipeline's atomic swap ever replaces it — so it opens read-only with
 *  WAL disabled, exactly as `bible.db` does.
 *
 *  A driver failure here is *not* a defect. `layerBunOrAbsent` has established
 *  that the file exists, so failing to open it means the file is there but
 *  unreadable — a corrupt or truncated artifact, which §3.5 makes a reportable
 *  state rather than a crash. The failure is converted into a `WikiService`
 *  whose every call carries the typed error, so the distinction between
 *  "missing" (absence) and "present but broken" (`open-failed`) survives all
 *  the way to the caller. */
export const layerBun = (filename: string): Layer.Layer<WikiService, never, TopicService> =>
  WikiService.Live.pipe(
    Layer.provide(
      SqliteBun.layer({
        filename: immutableFilename(filename),
        readonly: true,
        readwrite: false,
        create: false,
        disableWAL: true,
      }),
    ),
    Layer.catchCause((cause) =>
      WikiService.Broken({ operation: 'open-artifact', message: Cause.pretty(cause) }),
    ),
  );

/** The layer a host actually wants: the installed artifact when there is one,
 *  and the typed-absence service when there is not. Keeping the choice here
 *  means no caller has to know that "no file" is a legal, non-failing state.
 *
 *  A failing `exists` is not a defect either. The check is filesystem
 *  reachability, and an unreadable path is exactly the "present but not usable"
 *  state §3.5 makes reportable — so it becomes a `WikiService` whose calls fail
 *  with the typed error, the same shape a corrupt artifact produces. Dying here
 *  would take the whole host down over a stat the wiki alone needed. */
export const layerBunOrAbsent = (
  filename: string,
): Layer.Layer<WikiService, never, FileSystem.FileSystem | TopicService> =>
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
      return layerBun(filename);
    }),
  );

/** The whole wiki, both halves, from the two files on disk: authored cores from
 *  `topics.db` when it is installed, and the catalog long tail from `bible.db`,
 *  which is always present because it is the bootstrap corpus.
 *
 *  Hosts compose this rather than wiring `TopicService` themselves — the wiki
 *  page model spans two artifacts (§2), and which file backs which half is this
 *  module's business, not a caller's. `bible.db` opens read-only and immutable
 *  exactly as `BibleDatabase` opens it. */
export const layerBunWithCatalog = (input: {
  readonly topics: string;
  readonly bible: string;
}): Layer.Layer<WikiService, never, FileSystem.FileSystem> =>
  layerBunOrAbsent(input.topics).pipe(
    Layer.provide(
      TopicService.Live.pipe(
        Layer.provide(
          SqliteBun.layer({
            filename: immutableFilename(input.bible),
            readonly: true,
            readwrite: false,
            create: false,
            disableWAL: true,
          }),
        ),
      ),
    ),
    // `bible.db` is the verified bootstrap corpus, so it opening is the
    // expected case — but "expected" is not "guaranteed", and a driver failure
    // here is the same class of fact as an unreadable topics artifact: the
    // wiki cannot answer, and the host must be told rather than killed. Both
    // halves therefore report through the one typed channel, so a caller sees
    // `open-failed` instead of a dead process.
    Layer.catchCause((cause) =>
      WikiService.Broken({ operation: 'open-catalog', message: Cause.pretty(cause) }),
    ),
  );

export const Default = layerBunOrAbsent;
