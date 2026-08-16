import {
  BIBLE_ARTIFACT_RELEASE,
  BibleArtifact,
  corpusStorageIdentity,
  CorpusSupply,
  makeUnregisteredFileCorpusArtifact,
  type CorpusInstallationError,
  type CorpusName,
  type CorpusSourceUnavailableError,
  type FileArtifactInstallerService,
  type FileArtifactRecipeService,
} from '@bible/core/corpus-supply';
import { describe, expect, it } from 'effect-bun-test';
import { Context, Effect, Layer, Option, Predicate, Stream } from 'effect';

import {
  layerBrowserBibleArtifacts,
  layerBrowserFileArtifacts,
  type BrowserArtifactVerifier,
} from './corpus-artifact-database.js';
import {
  makeCorpusGenerationStore,
  type CorpusGenerationStore,
} from './corpus-generation-store.js';
import type { DatabaseFileDownloader } from './database-file-downloader.js';
import type { GenerationRegistry, GenerationRegistryStore } from './generation-marker.js';
import type { SqliteDatabase, SqliteDatabaseFamily, SqliteRow } from './sqlite-database.js';

const digest = BIBLE_ARTIFACT_RELEASE.digest;

/** Reads the corpus name an installer stamped on a failure. An unregistered
 *  corpus must leave it unset rather than borrow a registered corpus's name. */
const reportedCorpus = (
  failure: CorpusSourceUnavailableError | CorpusInstallationError,
): Option.Option<CorpusName> => {
  if (failure._tag === 'CorpusInstallationError') return Option.fromNullishOr(failure.corpus);
  return Option.none();
};

const bibleStorage = corpusStorageIdentity('bible');

/** A second File Corpus with its own corpus name, service keys, label, release
 *  manifest, semantic verifier, and — the part that matters for storage
 *  collisions — its own Corpus Storage Identity: a distinct generation prefix,
 *  a distinct asset path, and distinct IndexedDB names, all derived in one
 *  place from a corpus name that is deliberately outside `CorpusFileName`. */
class FixtureArtifactRecipe extends Context.Service<
  FixtureArtifactRecipe,
  FileArtifactRecipeService
>()('@bible/web/workers/test/FixtureArtifactRecipe') {}

class FixtureArtifactInstaller extends Context.Service<
  FixtureArtifactInstaller,
  FileArtifactInstallerService
>()('@bible/web/workers/test/FixtureArtifactInstaller') {}

const FixtureArtifact = makeUnregisteredFileCorpusArtifact({
  corpus: 'fixture-corpus',
  label: 'Fixture',
  Recipe: FixtureArtifactRecipe,
  Installer: FixtureArtifactInstaller,
});

/** The generation filename the fixture's own identity derives — a strict
 *  `~`-separated encoding, structurally distinct from Bible's legacy `-`
 *  encoding, so a collision between the two corpora is impossible. */
const FIXTURE_GENERATION = FixtureArtifact.storage.generationFilename(
  'fixture-v1',
  digest.slice('sha256:'.length, 'sha256:'.length + 12),
);

const makeDatabase = (options: {
  readonly events: string[];
  readonly provenance: boolean;
  readonly valid?: boolean;
  readonly revision?: string;
  readonly generation?: string;
  readonly refresh?: boolean;
}): SqliteDatabase => ({
  isOpen: false,
  open: (flags) =>
    Effect.sync(() => options.events.push(`open:${String(flags)}`)).pipe(Effect.asVoid),
  close: Effect.sync(() => options.events.push('close')).pipe(Effect.asVoid),
  query: (sql) =>
    Effect.sync((): readonly SqliteRow[] => {
      if (sql === 'PRAGMA integrity_check') return [{ integrity_check: 'ok' }];
      if (sql.includes('FROM meta')) {
        if (!options.provenance) return [];
        return [
          { key: 'corpus_source', value: 'bible-release' },
          {
            key: 'corpus_revision',
            value: options.revision ?? BIBLE_ARTIFACT_RELEASE.revision,
          },
          { key: 'corpus_digest', value: digest },
        ];
      }
      if (sql.includes('FROM books')) {
        if (options.valid === false) return [{ count: 0 }];
        return [{ count: 66 }];
      }
      if (sql.includes('FROM verses')) return [{ count: 31_102 }];
      return [{ count: 1 }];
    }),
  values: () => Effect.succeed([]),
  write: (_sql, params) =>
    Effect.sync(() => {
      options.events.push(`write:${String(params?.[0])}`);
      return 1;
    }),
  exec: (sql) => Effect.sync(() => options.events.push(`exec:${sql}`)).pipe(Effect.asVoid),
});

/** Reports exactly the byte count the pinned Bible manifest promises unless a
 *  test asks for a mismatch, so the size contract is a live assertion on every
 *  Bible install rather than a value the harness happens to satisfy. */
const makeDownloader = (events: string[], writtenBytes?: number): DatabaseFileDownloader => ({
  install: (_bytes, filename, onProgress) =>
    Effect.sync(() => {
      events.push(`install:${filename}`);
      onProgress(100);
      return { bytes: writtenBytes ?? BIBLE_ARTIFACT_RELEASE.size, digest };
    }),
});

const ensure = (options: {
  readonly provenance: boolean;
  readonly events: string[];
  readonly valid?: boolean;
  readonly revision?: string;
  readonly generation?: string;
  readonly refresh?: boolean;
  readonly writtenBytes?: number;
}) => {
  const database = makeDatabase(options);
  let activeFilename: Option.Option<string> = Option.none();
  const databases: SqliteDatabaseFamily = {
    active: database,
    candidate: () => database,
    activate: (filename) =>
      Effect.sync(() => {
        options.events.push(`activate:${filename}`);
        activeFilename = Option.some(filename);
      }),
    deactivate: Effect.sync(() => {
      options.events.push('deactivate');
      activeFilename = Option.none();
    }),
    get activeFilename() {
      return activeFilename;
    },
  };
  let registry: GenerationRegistry = { active: Option.none(), managed: [] };
  if (options.provenance) {
    const generation = options.generation ?? 'bible-db-v2-e72244f576be.db';
    registry = { active: Option.some(generation), managed: [generation] };
  }
  const registryStore: GenerationRegistryStore = {
    read: Effect.sync(() => {
      options.events.push('registry:read');
      return registry;
    }),
    write: (next) =>
      Effect.sync(() => {
        options.events.push(`registry:write:${Option.getOrElse(next.active, () => 'none')}`);
        registry = next;
      }),
  };
  const artifacts = layerBrowserBibleArtifacts({
    generations: makeCorpusGenerationStore({
      identity: bibleStorage,
      databases,
      registry: registryStore,
      discard: (filename) =>
        Effect.sync(() => options.events.push(`discard:${filename}`)).pipe(Effect.asVoid),
    }),
    downloader: makeDownloader(options.events, options.writtenBytes),
    fetch: () => Effect.succeed({ status: 200, bytes: Stream.make(new Uint8Array([1])) }),
  });
  const supply = CorpusSupply.layer.pipe(Layer.provide(artifacts));
  return Effect.gen(function* () {
    return yield* (yield* CorpusSupply).ensure({ refresh: options.refresh });
  }).pipe(Effect.provide(supply));
};

describe('browser Bible Artifact adapter', () => {
  it.effect('keeps an exact verified Artifact active', () =>
    Effect.gen(function* () {
      const events: string[] = [];
      const receipt = yield* ensure({ provenance: true, events });

      expect(receipt.activated).toEqual([]);
      expect(receipt.skipped).toEqual(['canonical']);
      expect(events[0]).toBe('registry:read');
      expect(events[1]).toStartWith('activate:');
    }),
  );

  it.effect('atomically installs, verifies, and records Provenance for an absent Artifact', () =>
    Effect.gen(function* () {
      const events: string[] = [];
      const receipt = yield* ensure({ provenance: false, events });

      expect(receipt.activated).toMatchObject([{ corpus: 'bible', installed: 31_102 }]);
      expect(events).toContain('install:bible-db-v2-e72244f576be.db');
      expect(events).toContain('exec:BEGIN IMMEDIATE');
      expect(events).toContain('exec:COMMIT');
      expect(events).toContain('write:corpus_source');
      expect(events).toContain('write:corpus_revision');
      expect(events).toContain('write:corpus_digest');
      expect(events.indexOf('exec:COMMIT')).toBeLessThan(
        events.lastIndexOf('registry:write:bible-db-v2-e72244f576be.db'),
      );
      expect(events.indexOf('activate:bible-db-v2-e72244f576be.db')).toBeLessThan(
        events.lastIndexOf('registry:write:bible-db-v2-e72244f576be.db'),
      );
    }),
  );

  it.effect('preserves the active generation when semantic verification rejects a candidate', () =>
    Effect.gen(function* () {
      const events: string[] = [];

      const failure = yield* Effect.flip(ensure({ provenance: false, valid: false, events }));
      expect(failure).toMatchObject({ _tag: 'CorpusInstallationError' });
      expect(events.some((event) => event === 'registry:write:bible-db-v2-e72244f576be.db')).toBe(
        false,
      );
      expect(events.some((event) => event.startsWith('activate:'))).toBe(false);
      expect(events).toContain('discard:bible-db-v2-e72244f576be.db');
    }),
  );

  it.effect('preserves the active generation when the byte count misses the manifest', () =>
    Effect.gen(function* () {
      const events: string[] = [];
      const active = 'bible-db-v1-5f3bfd31151b.db';

      const failure = yield* Effect.flip(
        ensure({
          provenance: true,
          revision: 'db-v1',
          generation: active,
          writtenBytes: BIBLE_ARTIFACT_RELEASE.size - 1,
          events,
        }),
      );

      expect(failure).toMatchObject({
        _tag: 'CorpusInstallationError',
        corpus: 'bible',
        cause: 'Bible Artifact size does not match its release manifest',
      });
      expect(events).toContain('discard:bible-db-v2-e72244f576be.db');
      expect(events).not.toContain('discard:bible-db-v1-5f3bfd31151b.db');
      expect(events).not.toContain('activate:bible-db-v2-e72244f576be.db');
    }),
  );

  it.effect('retires the closed predecessor only after activating the verified generation', () =>
    Effect.gen(function* () {
      const events: string[] = [];
      yield* ensure({
        provenance: true,
        revision: 'db-v1',
        generation: 'bible-db-v1-5f3bfd31151b.db',
        events,
      });

      const activated = events.indexOf('activate:bible-db-v2-e72244f576be.db');
      const discarded = events.indexOf('discard:bible-db-v1-5f3bfd31151b.db');
      expect(activated).toBeGreaterThanOrEqual(0);
      expect(discarded).toBeGreaterThan(activated);
    }),
  );

  it.effect('refreshes a current Artifact through an inactive generation slot', () =>
    Effect.gen(function* () {
      const events: string[] = [];
      const active = 'bible-db-v2-e72244f576be.db';

      yield* ensure({ provenance: true, generation: active, refresh: true, events });

      expect(events).toContain('install:bible-db-v2-e72244f576be-next.db');
      expect(events).toContain('activate:bible-db-v2-e72244f576be-next.db');
      expect(events).toContain(`discard:${active}`);
      expect(events.indexOf(`discard:${active}`)).toBeGreaterThan(
        events.indexOf('activate:bible-db-v2-e72244f576be-next.db'),
      );
    }),
  );
});

describe('parameterized browser File Corpus lifecycle', () => {
  const fixtureBytes = new Uint8Array([1, 2, 3, 4]);
  const fixtureRelease = {
    url: 'https://example.test/fixture.db',
    revision: 'fixture-v1',
    digest,
    size: fixtureBytes.byteLength,
  };

  /** Drives the fixture corpus through its own artifact, its own generation
   *  store, and its own installer. Nothing about the wiring names `bible`: the
   *  asset path, the generation filename, and the owned-filename rule all come
   *  from `FixtureArtifact.storage`. */
  const installFixture = (options: {
    readonly events: string[];
    readonly verify: BrowserArtifactVerifier;
    /** Bytes the downloader reports it wrote, defaulting to the manifest size. */
    readonly writtenBytes?: number;
    readonly writtenDigest?: string;
    /** An already-active generation the failing candidate must not disturb. */
    readonly activeGeneration?: string;
  }) => {
    const database = makeDatabase({ events: options.events, provenance: false });
    let activeFilename: Option.Option<string> = Option.none();
    const databases: SqliteDatabaseFamily = {
      active: database,
      candidate: () => database,
      activate: (filename) =>
        Effect.sync(() => {
          options.events.push(`activate:${filename}`);
          activeFilename = Option.some(filename);
        }),
      deactivate: Effect.sync(() => {
        activeFilename = Option.none();
      }),
      get activeFilename() {
        return activeFilename;
      },
    };
    let registry: GenerationRegistry = { active: Option.none(), managed: [] };
    if (Predicate.isNotUndefined(options.activeGeneration)) {
      registry = {
        active: Option.some(options.activeGeneration),
        managed: [options.activeGeneration],
      };
      activeFilename = Option.some(options.activeGeneration);
    }
    const registryStore: GenerationRegistryStore = {
      read: Effect.sync(() => registry),
      write: (next) =>
        Effect.sync(() => {
          options.events.push(`registry:write:${Option.getOrElse(next.active, () => 'none')}`);
          registry = next;
        }),
    };
    const artifacts = layerBrowserFileArtifacts({
      artifact: FixtureArtifact,
      release: fixtureRelease,
      generations: makeCorpusGenerationStore({
        identity: FixtureArtifact.storage,
        databases,
        registry: registryStore,
        discard: (filename) =>
          Effect.sync(() => options.events.push(`discard:${filename}`)).pipe(Effect.asVoid),
      }),
      downloader: {
        install: (bytes, filename, onProgress) =>
          Effect.gen(function* () {
            yield* Stream.runDrain(bytes);
            options.events.push(`install:${filename}`);
            onProgress(100);
            return {
              bytes: options.writtenBytes ?? fixtureBytes.byteLength,
              digest: options.writtenDigest ?? digest,
            };
          }),
      },
      verify: options.verify,
      fetch: (url) =>
        Effect.sync(() => {
          options.events.push(`fetch:${url}`);
          return { status: 200, bytes: Stream.make(fixtureBytes) };
        }),
    });
    return Effect.gen(function* () {
      const recipe = yield* FixtureArtifact.Recipe;
      const installer = yield* FixtureArtifact.Installer;
      return yield* Effect.forEach(recipe.sources, (source) =>
        source.acquire.pipe(Effect.flatMap(installer.install)),
      );
    }).pipe(
      Effect.provide(artifacts),
      Effect.map((installed) => ({ installed, registry: () => registry })),
    );
  };

  it.effect('derives the asset path and generation filename from the fixture identity alone', () =>
    Effect.gen(function* () {
      const events: string[] = [];

      const outcome = yield* installFixture({ events, verify: () => Effect.succeed(11) });

      expect(FixtureArtifact.storage.assetPath).toBe('/api/assets/fixture-corpus');
      expect(events).toContain('fetch:/api/assets/fixture-corpus');
      expect(events).toContain(`install:${FIXTURE_GENERATION}`);
      expect(events).toContain(`activate:${FIXTURE_GENERATION}`);
      expect(outcome.installed).toMatchObject([
        { installed: 11, provenance: { revision: 'fixture-v1' } },
      ]);
      // A strict corpus never encodes into Bible's legacy filename shape, so
      // the two corpora cannot claim the same generation.
      expect(FIXTURE_GENERATION).not.toStartWith(`${bibleStorage.generationPrefix}-`);
      expect(bibleStorage.ownsGeneration(FIXTURE_GENERATION)).toBe(false);
      expect(FixtureArtifact.storage.ownsGeneration('bible-db-v2-e72244f576be.db')).toBe(false);
    }),
  );

  it.effect('discards the candidate when the injected verifier rejects it', () =>
    Effect.gen(function* () {
      const events: string[] = [];

      const failure = yield* Effect.flip(
        installFixture({
          events,
          verify: () => Effect.fail('Fixture Artifact failed semantic verification'),
        }),
      );

      // The fixture corpus is outside the receipt vocabulary, so the error
      // carries no corpus name rather than borrowing Bible's.
      expect(failure).toMatchObject({ _tag: 'CorpusInstallationError' });
      expect(reportedCorpus(failure)).toEqual(Option.none());
      expect(events.some((event) => event.startsWith('activate:'))).toBe(false);
      expect(events).toContain(`discard:${FIXTURE_GENERATION}`);
    }),
  );

  it.effect('leaves an already-active generation in place when the candidate is rejected', () =>
    Effect.gen(function* () {
      const events: string[] = [];
      const active = FixtureArtifact.storage.generationFilename('fixture-v0', 'a'.repeat(12));

      const failure = yield* Effect.flip(
        installFixture({
          events,
          activeGeneration: active,
          verify: () => Effect.fail('Fixture Artifact failed semantic verification'),
        }),
      );

      expect(failure).toMatchObject({ _tag: 'CorpusInstallationError' });
      expect(events).toContain(`discard:${FIXTURE_GENERATION}`);
      expect(events).not.toContain(`discard:${active}`);
      expect(events.some((event) => event.startsWith('activate:'))).toBe(false);
      expect(events).not.toContain(`registry:write:${FIXTURE_GENERATION}`);
    }),
  );

  it.effect('rejects a digest mismatch before the semantic verifier runs', () =>
    Effect.gen(function* () {
      const events: string[] = [];
      const active = FixtureArtifact.storage.generationFilename('fixture-v0', 'a'.repeat(12));
      let verified = 0;

      const failure = yield* Effect.flip(
        installFixture({
          events,
          activeGeneration: active,
          writtenDigest: `sha256:${'b'.repeat(64)}`,
          verify: () =>
            Effect.sync(() => {
              verified += 1;
              return 1;
            }),
        }),
      );

      expect(failure).toMatchObject({
        _tag: 'CorpusInstallationError',
        cause: 'Fixture Artifact digest does not match its release manifest',
      });
      expect(verified).toBe(0);
      expect(events).toContain(`discard:${FIXTURE_GENERATION}`);
      expect(events).not.toContain(`discard:${active}`);
    }),
  );

  it.effect('rejects a size mismatch before the semantic verifier runs', () =>
    Effect.gen(function* () {
      const events: string[] = [];
      const active = FixtureArtifact.storage.generationFilename('fixture-v0', 'a'.repeat(12));
      let verified = 0;

      const failure = yield* Effect.flip(
        installFixture({
          events,
          activeGeneration: active,
          // The digest still matches; only the byte count is wrong, so nothing
          // but the size check can reject this candidate.
          writtenBytes: fixtureBytes.byteLength + 1,
          verify: () =>
            Effect.sync(() => {
              verified += 1;
              return 1;
            }),
        }),
      );

      expect(failure).toMatchObject({
        _tag: 'CorpusInstallationError',
        cause: 'Fixture Artifact size does not match its release manifest',
      });
      expect(verified).toBe(0);
      expect(events).toContain(`discard:${FIXTURE_GENERATION}`);
      expect(events).not.toContain(`discard:${active}`);
    }),
  );

  /** Type-level assertion, enforced by `tsc --noEmit` rather than at run time:
   *  the corpus binding must be inferred from the artifact alone. Without
   *  `NoInfer` on the generation store, `Corpus` widens to the union of both
   *  arguments, the mismatched pair below typechecks, and `@ts-expect-error`
   *  turns into an unused-directive error — so the gate fails either way if
   *  the guard is removed. Never called. */
  const rejectsAMismatchedGenerationStore = (
    bibleGenerations: CorpusGenerationStore<'bible'>,
    fixtureGenerations: CorpusGenerationStore<'fixture-corpus'>,
  ): void => {
    layerBrowserFileArtifacts({
      artifact: BibleArtifact,
      release: BIBLE_ARTIFACT_RELEASE,
      // @ts-expect-error a Bible artifact may not be wired onto another corpus's store
      generations: fixtureGenerations,
      downloader: { install: () => Effect.succeed({ bytes: 0, digest }) },
      verify: () => Effect.succeed(0),
    });
    layerBrowserFileArtifacts({
      artifact: FixtureArtifact,
      release: fixtureRelease,
      // @ts-expect-error a fixture artifact may not be wired onto Bible's store
      generations: bibleGenerations,
      downloader: { install: () => Effect.succeed({ bytes: 0, digest }) },
      verify: () => Effect.succeed(0),
    });
    // The matching pairs stay assignable, so the guard rejects the mismatch
    // rather than rejecting every call.
    layerBrowserFileArtifacts({
      artifact: BibleArtifact,
      release: BIBLE_ARTIFACT_RELEASE,
      generations: bibleGenerations,
      downloader: { install: () => Effect.succeed({ bytes: 0, digest }) },
      verify: () => Effect.succeed(0),
    });
    layerBrowserFileArtifacts({
      artifact: FixtureArtifact,
      release: fixtureRelease,
      generations: fixtureGenerations,
      downloader: { install: () => Effect.succeed({ bytes: 0, digest }) },
      verify: () => Effect.succeed(0),
    });
  };
  void rejectsAMismatchedGenerationStore;
});
