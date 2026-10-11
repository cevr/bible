/** The wiki's corpus-backed layers over the SQL connections they read.
 *
 *  Driver-agnostic: a host adapter (`service-bun.ts`) opens the connections
 *  and hands them here, so which connection feeds which service is decided in
 *  one place, and the degradation posture holds whatever order they open in. */

import { Layer } from 'effect';
import type * as SqlClient from 'effect/sql/SqlClient';
import type { SqlError } from 'effect/sql/SqlError';

import { BibleDatabase } from '../bible-db/bible-database.js';
import { EGWCommentaryService } from '../egw-commentary/service.js';
import { EGWParagraphDatabase } from '../egw-db/book-database.js';
import { TopicService } from '../topics/service.js';
import { WritingsService } from '../writings/service.js';
import { WikiSectionSources } from './section-composer.js';

/** One SQL connection, as a host opens it: a file that will not open is a
 *  typed `SqlError`. */
type Connection = Layer.Layer<SqlClient.SqlClient, SqlError>;

/** The topic catalog, from `bible.db`'s topic tables.
 *
 *  A catalog that will not open stays a typed `SqlError`, and each composition
 *  says what it means: the section sources degrade to `NotWired` (§3.5), a
 *  wiki reports `Broken`. Dying here would hide it from the section sources'
 *  classifier, which reads a died `SqlError` as a fault, not an absence; the
 *  wiki's `Layer.catchCause` would still report it as `Broken`. */
export const catalogOver = (connection: Connection): Layer.Layer<TopicService, SqlError> =>
  TopicService.Live.pipe(Layer.provide(connection));

/** The four §6 section sources: the topic catalog and the Bible database
 *  (two connections to `bible.db`) and the EGW writings library.
 *
 *  A corpus that will not open makes this layer *degraded* rather than fatal:
 *  §3.5's degradation posture applies to the sections too, and a CLI that
 *  cannot open the EGW library should still print a topic's authored core. It
 *  still provides `WikiSectionSources`, as `NotWired`, so the page carries the
 *  reason rather than six sections nobody can account for. */
export const sectionSourcesOver = (connections: {
  readonly bible: Connection;
  readonly catalog: Connection;
  readonly writings: Connection;
}): Layer.Layer<WikiSectionSources> => {
  const writingsDatabase = EGWParagraphDatabase.layerCore.pipe(Layer.provide(connections.writings));
  return WikiSectionSources.Live.pipe(
    Layer.provide(catalogOver(connections.catalog)),
    Layer.provide(BibleDatabase.layer.pipe(Layer.provide(connections.bible))),
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
