/** Bun runtime composition for the driver-agnostic WikiService. */

import * as SqliteBun from '@effect/sql-sqlite-bun/SqliteClient';
import { Cause, Layer, type FileSystem } from 'effect';

import { BibleDatabase } from '../bible-db/bible-database.js';
import { EGWCommentaryService } from '../egw-commentary/service.js';
import { EGWParagraphDatabase } from '../egw-db/book-database.js';
import { TopicService } from '../topics/service.js';
import { WritingsService } from '../writings/service.js';
import {
  immutableFilename,
  layerArtifact,
  layerArtifactOrAbsent,
  type ArtifactSqlClientLayer,
} from './service-artifact.js';
import { WikiSectionSources } from './section-composer.js';
import { WikiService } from './service.js';

/** The artifact is immutable at rest — only the supply pipeline's atomic swap
 *  ever replaces it — so it opens read-only with WAL disabled, exactly as
 *  `bible.db` does. `create: false` is what keeps the driver from manufacturing
 *  a missing artifact behind the existence check's back. */
const bunArtifactDriver: ArtifactSqlClientLayer = (filename) =>
  SqliteBun.layer({
    filename: immutableFilename(filename),
    readonly: true,
    readwrite: false,
    create: false,
    disableWAL: true,
  });

/** Reads an installed `topics.db` through Bun's driver. The three-state mapping
 *  lives in `service-artifact.ts`; only the driver is Bun's. */
export const layerBun = (
  filename: string,
): Layer.Layer<WikiService, never, TopicService | WikiSectionSources> =>
  layerArtifact(bunArtifactDriver, filename);

/** The layer a host actually wants: the installed artifact when there is one,
 *  and the typed-absence service when there is not. */
export const layerBunOrAbsent = (
  filename: string,
): Layer.Layer<WikiService, never, FileSystem.FileSystem | TopicService | WikiSectionSources> =>
  layerArtifactOrAbsent(bunArtifactDriver, filename);

/** The four §6 section sources, from the two corpora on disk.
 *
 *  `bible.db` opens read-only and immutable; the writings database opens
 *  read-write because `EGWParagraphDatabase.layerCore` initializes its schema
 *  on construction — the same way every other Bun consumer of it opens it.
 *
 *  A failure to open either file makes this layer *degraded* rather than fatal:
 *  §3.5's degradation posture applies to the sections too, and a CLI that
 *  cannot open the EGW library should still print a topic's authored core. It
 *  still provides `WikiSectionSources` — as `NotWired` — so the page carries
 *  the reason rather than six sections nobody can account for. */
export const layerBunSectionSources = (input: {
  readonly bible: string;
  readonly writings: string;
}): Layer.Layer<WikiSectionSources> => {
  const writingsDatabase = EGWParagraphDatabase.layerCore.pipe(
    Layer.provide(SqliteBun.layer({ filename: input.writings, create: false })),
  );
  return WikiSectionSources.Live.pipe(
    Layer.provide(layerBunCatalog(input.bible)),
    Layer.provide(BibleDatabase.layer.pipe(Layer.provide(readOnlySqlite(input.bible)))),
    Layer.provide(WritingsService.Live.pipe(Layer.provide(writingsDatabase))),
    Layer.provide(EGWCommentaryService.Live.pipe(Layer.provide(writingsDatabase))),
    // Degraded rather than fatal, and *stated* rather than absent: corpora that
    // will not open still leave the CLI printing authored cores, and the page
    // now says `sections-not-wired` so the empty lineup is legible as a host
    // state rather than as an empty library.
    //
    // Only corpora that will not open. A blanket `catchCause` here also caught
    // defects and interruption, so a genuine construction fault reached the
    // reader as a degradation state — the same hiding this milestone's first
    // review round removed one level down. The shared combinator draws the
    // line and logs the cause it accepts.
    WikiSectionSources.NotWiredOnCorpusAbsence,
    // What survives the combinator is a `SqlError` the combinator refused —
    // one arriving alongside a cause that is not a corpus absence. That is a
    // fault, not a degradation, so it dies rather than being folded back into
    // the same `NotWired` the combinator just declined to give it.
    Layer.orDie,
  );
};

/** The catalog half alone. Always available: `bible.db` is the verified
 *  bootstrap corpus and ships the topic tables §3.5's fallback depends on. */
export const layerBunCatalog = (bible: string): Layer.Layer<TopicService> =>
  TopicService.Live.pipe(Layer.provide(readOnlySqlite(bible)));

const readOnlySqlite = (filename: string) =>
  SqliteBun.layer({
    filename: immutableFilename(filename),
    readonly: true,
    readwrite: false,
    create: false,
    disableWAL: true,
  });

/** The whole wiki from the corpora on disk: authored cores from `topics.db`
 *  when it is installed, the catalog long tail from `bible.db`, and the §6.1
 *  section lineup composed live out of both plus the EGW writings library.
 *
 *  Hosts compose this rather than wiring the five services themselves — the
 *  wiki page model spans three artifacts (§2, §6), and which file backs which
 *  part of a page is this module's business, not a caller's. */
export const layerBunWithCatalog = (input: {
  readonly topics: string;
  readonly bible: string;
  readonly writings: string;
}): Layer.Layer<WikiService, never, FileSystem.FileSystem> =>
  layerBunOrAbsent(input.topics).pipe(
    Layer.provide(layerBunSectionSources({ bible: input.bible, writings: input.writings })),
    Layer.provide(layerBunCatalog(input.bible)),
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
