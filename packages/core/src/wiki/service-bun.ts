/** Bun runtime composition for the driver-agnostic WikiService. */

import * as SqliteBun from '@effect/sql-sqlite-bun/SqliteClient';
import { Cause, Layer, type FileSystem } from 'effect';
import type { SqlError } from 'effect/sql/SqlError';

import type { TopicService } from '../topics/service.js';
import { bunArtifactDriver } from './driver-bun.js';
import { immutableFilename, layerArtifactOrAbsent } from './service-artifact.js';
import { LookupService } from './lookup-service.js';
import type { WikiSectionSources } from './section-composer.js';
import { catalogOver, sectionSourcesOver } from './section-sources.js';
import { WikiService } from './service.js';

/** The layer a host actually wants: the installed artifact when there is one,
 *  and the typed-absence service when there is not. The three-state mapping
 *  lives in `service-artifact.ts`; only the driver is Bun's. */
const layerBunOrAbsent = (
  filename: string,
): Layer.Layer<WikiService, never, FileSystem.FileSystem | TopicService | WikiSectionSources> =>
  layerArtifactOrAbsent(bunArtifactDriver, filename);

/** The four §6 section sources, from the two corpora on disk
 *  (`sectionSourcesOver` holds the composition and its degradation posture).
 *
 *  `bible.db` opens read-only and immutable; the writings database opens
 *  read-write because `EGWParagraphDatabase.layerCore` initializes its schema
 *  on construction — the same way every other Bun consumer of it opens it. */
const layerBunSectionSources = (input: {
  readonly bible: string;
  readonly writings: string;
}): Layer.Layer<WikiSectionSources> =>
  sectionSourcesOver({
    bible: readOnlySqlite(input.bible),
    catalog: readOnlySqlite(input.bible),
    writings: SqliteBun.layer({ filename: input.writings, create: false }),
  });

/** The catalog half alone, from `bible.db`'s topic tables. `bible.db` is the
 *  verified bootstrap corpus, so it opening is the expected case; when it does
 *  not, the typed `SqlError` reaches each consumer's own recovery. */
const layerBunCatalog = (bible: string): Layer.Layer<TopicService, SqlError> =>
  catalogOver(readOnlySqlite(bible));

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

/** Select-to-lookup (§7) from the corpora on disk.
 *
 *  The same three files `layerBunWithCatalog` opens, composed once and shared
 *  by both services: `LookupService` needs exactly `WikiService` (for the
 *  phrase dictionary) and `WikiSectionSources` (for the four corpus groups),
 *  which is precisely what a topic page needs. Building the section sources
 *  once and providing them to both is what keeps the CLI from opening
 *  `bible.db` and the writings library twice for one command. */
export const layerBunLookup = (input: {
  readonly topics: string;
  readonly bible: string;
  readonly writings: string;
}): Layer.Layer<LookupService, never, FileSystem.FileSystem> => {
  const sections = layerBunSectionSources({ bible: input.bible, writings: input.writings });
  const catalog = layerBunCatalog(input.bible);
  const wiki = layerBunOrAbsent(input.topics).pipe(
    Layer.provide(sections),
    Layer.provide(catalog),
    // The same typed-absence posture `layerBunWithCatalog` takes: a wiki that
    // cannot open reports through `WikiService.Broken`, whose failing
    // `dictionary` the resolver degrades to an empty topic group rather than a
    // dead process.
    Layer.catchCause((cause) =>
      WikiService.Broken({ operation: 'open-catalog', message: Cause.pretty(cause) }),
    ),
  );
  return LookupService.Live.pipe(Layer.provide(wiki), Layer.provide(sections));
};
