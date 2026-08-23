/** §3.6's release ordinal, written by a real install and read back by a *fresh*
 *  store over the same storage (round-4 F2 / F7).
 *
 *  The other browser adapter suite drives the installer against a database stub
 *  that answers `SELECT` with a fixed row set, which can prove the installer
 *  *asks* for provenance but never that what it wrote is what comes back. The
 *  question F2 turns on is exactly that: after a runtime install, does the next
 *  launch — a new store, a new installer, nothing carried in memory — see the
 *  generation it installed, or `None`? A stub that returns constants answers
 *  the same either way.
 *
 *  So this file keeps the real `makeCorpusGenerationStore`, the real installer,
 *  the real `readProvenance`, the real registry reconciliation, and gives them
 *  a `SqliteDatabaseFamily` that genuinely stores rows per filename. What is
 *  faked is the SQL engine, which is what `wa-sqlite` is and what cannot run
 *  under `bun test`; the `meta` table it serves is the four-column key/value
 *  shape the adapter writes, and nothing in the path under test is short-cut.
 */

import {
  corpusGeneration,
  corpusStorageIdentity,
  CorpusSupply,
  TopicsArtifact,
  type CorpusGeneration,
} from '@bible/core/corpus-supply';
import { Effect, Layer, Option, Stream } from 'effect';
import { describe, expect, it } from 'effect-bun-test';

import { layerBrowserFileArtifacts } from './corpus-artifact-database.js';
import { makeCorpusGenerationStore } from './corpus-generation-store.js';
import type { DatabaseFileDownloader } from './database-file-downloader.js';
import type { GenerationRegistry, GenerationRegistryStore } from './generation-marker.js';
import type { SqliteDatabase, SqliteDatabaseFamily, SqliteRow } from './sqlite-database.js';

const RELEASE = {
  url: 'https://example.test/topics.db',
  revision: 'topics-v1',
  digest: 'sha256:1111111111111111111111111111111111111111111111111111111111111111',
  size: 32,
};

const generation = corpusGeneration;

/** OPFS, as far as this test is concerned: filename to `meta` rows. It is the
 *  only thing that survives a "restart", which is what makes the second store
 *  instance a real second launch rather than the same one renamed. */
interface Storage {
  readonly files: Map<string, Map<string, string>>;
}

const makeDatabase = (storage: Storage, target: () => string): SqliteDatabase => {
  const rowsFor = (): Map<string, string> => {
    const filename = target();
    return Option.match(Option.fromUndefinedOr(storage.files.get(filename)), {
      onNone: () => {
        const created = new Map<string, string>();
        storage.files.set(filename, created);
        return created;
      },
      onSome: (existing) => existing,
    });
  };
  return {
    isOpen: false,
    open: () => Effect.void,
    close: Effect.void,
    query: (sql) =>
      Effect.sync((): readonly SqliteRow[] => {
        if (sql === 'PRAGMA integrity_check') return [{ integrity_check: 'ok' }];
        if (sql.includes('FROM meta')) {
          return [...rowsFor()].map(([key, value]) => ({ key, value }));
        }
        // The Topics semantic verifier's counts; a non-zero count is what it
        // requires, and the shape of that check is covered by its own suite.
        return [{ count: 1 }];
      }),
    values: () => Effect.succeed([]),
    write: (sql, params) =>
      Effect.sync(() => {
        const rows = rowsFor();
        if (sql.startsWith('DELETE FROM meta')) {
          rows.delete(String(params?.[0]));
          return 1;
        }
        rows.set(String(params?.[0]), String(params?.[1]));
        return 1;
      }),
    exec: () => Effect.void,
  };
};

/** One browser, wired the way `db-worker.ts` wires Topics. Each call is a
 *  launch: new store, new installer, new registry *reader* — over storage and a
 *  registry that persist, because those are the two things IndexedDB and OPFS
 *  keep across a reload. */
const launch = (input: {
  readonly storage: Storage;
  readonly registry: { current: GenerationRegistry };
  readonly pinnedGeneration: Option.Option<CorpusGeneration>;
}) => {
  let active = Option.none<string>();
  // The real family hands out one long-lived connection object for the active
  // generation and re-points its handle on `activate`. The fake matches that
  // shape rather than a fresh object per access, because the store captures
  // `databases.active` once at construction — a per-access object would make
  // this harness disagree with the code it is testing.
  const activeDatabase = makeDatabase(input.storage, () => Option.getOrElse(active, () => 'none'));
  const databases: SqliteDatabaseFamily = {
    active: activeDatabase,
    candidate: (filename) => makeDatabase(input.storage, () => filename),
    activate: (filename) =>
      Effect.sync(() => {
        active = Option.some(filename);
      }),
    deactivate: Effect.sync(() => {
      active = Option.none();
    }),
    get activeFilename() {
      return active;
    },
  };
  const registryStore: GenerationRegistryStore = {
    read: Effect.sync(() => input.registry.current),
    write: (next) =>
      Effect.sync(() => {
        input.registry.current = next;
      }),
  };
  const downloader: DatabaseFileDownloader = {
    install: (_bytes, filename, onProgress) =>
      Effect.sync(() => {
        input.storage.files.set(filename, new Map());
        onProgress(100);
        return { bytes: RELEASE.size, digest: RELEASE.digest };
      }),
  };
  return CorpusSupply.layer.pipe(
    Layer.provide(
      layerBrowserFileArtifacts({
        artifact: TopicsArtifact,
        release: Option.some(RELEASE),
        pinnedGeneration: input.pinnedGeneration,
        generations: makeCorpusGenerationStore({
          identity: corpusStorageIdentity('topics'),
          databases,
          registry: registryStore,
          discard: (filename) =>
            Effect.sync(() => {
              input.storage.files.delete(filename);
            }),
        }),
        downloader,
        verify: () => Effect.succeed(1),
        // Never called: this suite's installs all come through `installFrom`,
        // whose bytes the downloader below records, and the pinned release the
        // recipe would fetch is deliberately absent. A source that answered
        // would be a second path to the installer that no case exercises.
        fetch: () => Effect.succeed({ status: 404, bytes: Stream.empty }),
      }),
    ),
  );
};

const freshBrowser = () => ({
  storage: { files: new Map<string, Map<string, string>>() } satisfies Storage,
  registry: { current: { active: Option.none(), managed: [] } as GenerationRegistry },
});

const installedGeneration = (supply: CorpusSupply['Service'], corpus: 'topics') =>
  Effect.map(supply.installed(corpus), (provenance) =>
    Option.getOrUndefined(Option.flatMap(provenance, (p) => Option.map(p.generation, Number))),
  );

describe('browser generation round-trip', () => {
  /** The round-trip itself: an ordinal a runtime install persisted is the
   *  ordinal a *new* store reads. Without the write, or without the read,
   *  this is `undefined`. */
  it.effect('a runtime install persists its ordinal for the next launch', () =>
    Effect.gen(function* () {
      const browser = freshBrowser();
      const first = launch({ ...browser, pinnedGeneration: Option.none() });

      yield* Effect.flatMap(CorpusSupply, (supply) =>
        supply.installFrom({
          corpus: 'topics',
          release: { ...RELEASE, generation: Option.some(generation(4)) },
        }),
      ).pipe(Effect.provide(first));

      // A second launch, sharing only what OPFS and IndexedDB keep.
      const second = launch({ ...browser, pinnedGeneration: Option.none() });
      const read = yield* Effect.flatMap(CorpusSupply, (supply) =>
        installedGeneration(supply, 'topics'),
      ).pipe(Effect.provide(second));

      expect(read).toBe(4);
    }),
  );

  /** F2 in the browser: the scenario the finding names, on the host where the
   *  §3.6 offer is actually shown. Runtime generation 4 is active; the app
   *  reloads with a build pinned at generation 3; startup must install
   *  nothing. */
  it.effect('startup does not re-floor a runtime generation with an older pin', () =>
    Effect.gen(function* () {
      const browser = freshBrowser();

      yield* Effect.flatMap(CorpusSupply, (supply) =>
        supply.installFrom({
          corpus: 'topics',
          release: { ...RELEASE, generation: Option.some(generation(4)) },
        }),
      ).pipe(Effect.provide(launch({ ...browser, pinnedGeneration: Option.none() })));

      const restarted = launch({
        ...browser,
        pinnedGeneration: Option.some(generation(3)),
      });
      const after = yield* Effect.gen(function* () {
        const supply = yield* CorpusSupply;
        const receipt = yield* supply.ensure({ target: { _tag: 'file', corpus: 'topics' } });
        return { receipt, generation: yield* installedGeneration(supply, 'topics') };
      }).pipe(Effect.provide(restarted));

      expect(after.receipt.activated).toEqual([]);
      expect(after.generation).toBe(4);
    }),
  );
});
