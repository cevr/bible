import { BunFileSystem } from '@effect/platform-bun';
import { sha256 } from '@noble/hashes/sha2.js';
import { bytesToHex } from '@noble/hashes/utils.js';
import { Context, Effect, FileSystem, Option } from 'effect';
import { describe, expect, it } from 'effect-bun-test';

import {
  BibleArtifact,
  makeUnregisteredFileCorpusArtifact,
  type FileArtifactInstallerService,
  type FileArtifactRecipeService,
} from '../corpus-supply/file-artifact.js';
import type {
  CorpusInstallationError,
  CorpusSourceUnavailableError,
} from '../corpus-supply/errors.js';
import type { CorpusName, CorpusProvenance } from '../corpus-supply/model.js';
import {
  layerNativeFileArtifacts,
  type NativeFileArtifactProvenanceStore,
  type NativeFileArtifactSource,
} from './bible-artifact.js';

/** A second File Corpus declared exactly the way a real third corpus will be:
 *  its own corpus name, its own two service keys, its own label, its own
 *  Corpus Storage Identity, its own semantic verifier. Its name is deliberately
 *  outside `CorpusFileName`, which is what proves the lifecycle is no longer
 *  bible-branded and no longer needs the receipt vocabulary widened to be
 *  exercised. */
class FixtureArtifactRecipe extends Context.Service<
  FixtureArtifactRecipe,
  FileArtifactRecipeService
>()('@bible/core/corpus-supply/test/FixtureArtifactRecipe') {}

class FixtureArtifactInstaller extends Context.Service<
  FixtureArtifactInstaller,
  FileArtifactInstallerService
>()('@bible/core/corpus-supply/test/FixtureArtifactInstaller') {}

const FixtureArtifact = makeUnregisteredFileCorpusArtifact({
  corpus: 'fixture-corpus',
  label: 'Fixture',
  Recipe: FixtureArtifactRecipe,
  Installer: FixtureArtifactInstaller,
});

const makeProvenanceStore = (): NativeFileArtifactProvenanceStore => {
  let current = Option.none<CorpusProvenance>();
  return {
    read: () => {
      if (Option.isNone(current)) return Effect.fail('provenance is unavailable');
      return Effect.succeed(current.value);
    },
    write: (_filename, provenance) =>
      Effect.sync(() => {
        current = Option.some(provenance);
      }),
  };
};

/** Drives the lifecycle through the fixture corpus's own Recipe and Installer
 *  keys rather than `CorpusSupply`, so the test observes exactly what the
 *  parameterized adapter does with the bytes its recipe hands it. Returns one
 *  receipt per declared source, in recipe priority order. */
const install = (input: {
  readonly destination: string;
  readonly sources: readonly NativeFileArtifactSource[];
  readonly provenanceStore: NativeFileArtifactProvenanceStore;
  readonly verify: (filename: string) => Effect.Effect<number, unknown>;
  readonly fetch?: (url: string) => Effect.Effect<Response, unknown>;
}) =>
  Effect.gen(function* () {
    const recipe = yield* FixtureArtifact.Recipe;
    const installer = yield* FixtureArtifact.Installer;
    return yield* Effect.forEach(recipe.sources, (source) =>
      source.acquire.pipe(Effect.flatMap(installer.install)),
    );
  }).pipe(
    Effect.provide(
      layerNativeFileArtifacts({
        artifact: FixtureArtifact,
        destination: input.destination,
        sources: input.sources,
        provenanceStore: input.provenanceStore,
        verify: input.verify,
        fetch: input.fetch,
      }),
    ),
  );

/** Reads the corpus name an installer stamped on a failure. An unregistered
 *  corpus must leave it unset rather than borrow a registered corpus's name. */
const reportedCorpus = (
  failure: CorpusSourceUnavailableError | CorpusInstallationError,
): Option.Option<CorpusName> => {
  if (failure._tag === 'CorpusInstallationError') return Option.fromNullishOr(failure.corpus);
  return Option.none();
};

const FIXTURE_BYTES = 'wrong bytes';

const releaseSource = (input: {
  readonly digest: string;
  readonly size: number;
}): NativeFileArtifactSource => ({
  kind: 'release',
  url: 'https://example.test/fixture.db',
  revision: 'fixture-v1',
  digest: input.digest,
  size: input.size,
});

const fixtureDigest = `sha256:${bytesToHex(sha256(new TextEncoder().encode(FIXTURE_BYTES)))}`;

describe('parameterized File Corpus lifecycle', () => {
  const test = it.scopedLive.layer(BunFileSystem.layer);

  test('swaps the destination atomically once the candidate verifies', () =>
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const directory = yield* fs.makeTempDirectoryScoped({ prefix: 'fixture-corpus-' });
      const source = `${directory}/source.db`;
      const destination = `${directory}/nested/fixture.db`;
      yield* fs.writeFileString(source, 'fixture-corpus');

      const installed = yield* install({
        destination,
        sources: [{ kind: 'workspace', path: source, label: 'fixture-workspace' }],
        provenanceStore: makeProvenanceStore(),
        verify: () => Effect.succeed(7),
      });

      expect(installed).toMatchObject([
        { installed: 7, provenance: { source: 'fixture-workspace' } },
      ]);
      expect(yield* fs.readFileString(destination)).toBe('fixture-corpus');
      expect(yield* fs.exists(`${destination}.building`)).toBe(false);
    }));

  test('rejects release bytes whose digest does not match the pinned manifest', () =>
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const directory = yield* fs.makeTempDirectoryScoped({ prefix: 'fixture-corpus-' });
      const destination = `${directory}/fixture.db`;
      let verified = 0;

      const failure = yield* Effect.flip(
        install({
          destination,
          sources: [
            releaseSource({ digest: `sha256:${'a'.repeat(64)}`, size: FIXTURE_BYTES.length }),
          ],
          provenanceStore: makeProvenanceStore(),
          verify: () =>
            Effect.sync(() => {
              verified += 1;
              return 1;
            }),
          fetch: () => Effect.succeed(new Response(FIXTURE_BYTES)),
        }),
      );

      expect(failure).toMatchObject({
        _tag: 'CorpusInstallationError',
        cause: 'Fixture Artifact digest does not match its release manifest',
      });
      expect(verified).toBe(0);
      expect(yield* fs.exists(destination)).toBe(false);
      expect(yield* fs.exists(`${destination}.building`)).toBe(false);
    }));

  test('rejects release bytes whose size does not match the pinned manifest', () =>
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const directory = yield* fs.makeTempDirectoryScoped({ prefix: 'fixture-corpus-' });
      const destination = `${directory}/fixture.db`;
      yield* fs.writeFileString(destination, 'active-generation');
      let verified = 0;

      const failure = yield* Effect.flip(
        install({
          destination,
          // Digest matches the bytes exactly; only the declared size is wrong,
          // so nothing but the size check can reject this candidate.
          sources: [releaseSource({ digest: fixtureDigest, size: FIXTURE_BYTES.length + 1 })],
          provenanceStore: makeProvenanceStore(),
          verify: () =>
            Effect.sync(() => {
              verified += 1;
              return 1;
            }),
          fetch: () => Effect.succeed(new Response(FIXTURE_BYTES)),
        }),
      );

      expect(failure).toMatchObject({
        _tag: 'CorpusInstallationError',
        cause: 'Fixture Artifact size does not match its release manifest',
      });
      expect(verified).toBe(0);
      expect(yield* fs.readFileString(destination)).toBe('active-generation');
      expect(yield* fs.exists(`${destination}.building`)).toBe(false);
    }));

  test('accepts release bytes whose size and digest both match the pinned manifest', () =>
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const directory = yield* fs.makeTempDirectoryScoped({ prefix: 'fixture-corpus-' });
      const destination = `${directory}/fixture.db`;

      const installed = yield* install({
        destination,
        sources: [releaseSource({ digest: fixtureDigest, size: FIXTURE_BYTES.length })],
        provenanceStore: makeProvenanceStore(),
        verify: () => Effect.succeed(3),
        fetch: () => Effect.succeed(new Response(FIXTURE_BYTES)),
      });

      expect(installed).toMatchObject([{ installed: 3 }]);
      expect(yield* fs.readFileString(destination)).toBe(FIXTURE_BYTES);
    }));

  test('preserves the active file when semantic verification rejects the candidate', () =>
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const directory = yield* fs.makeTempDirectoryScoped({ prefix: 'fixture-corpus-' });
      const source = `${directory}/source.db`;
      const destination = `${directory}/fixture.db`;
      const provenanceStore = makeProvenanceStore();
      yield* fs.writeFileString(destination, 'active-generation');
      yield* fs.writeFileString(source, 'rejected-generation');

      const failure = yield* Effect.flip(
        install({
          destination,
          sources: [{ kind: 'workspace', path: source, label: 'fixture-workspace' }],
          provenanceStore,
          verify: () => Effect.fail('Fixture Artifact is incomplete'),
        }),
      );

      // An unregistered corpus never decorates a pipeline error with a name the
      // receipt vocabulary does not admit.
      expect(failure).toMatchObject({ _tag: 'CorpusInstallationError' });
      expect(reportedCorpus(failure)).toEqual(Option.none());
      expect(yield* fs.readFileString(destination)).toBe('active-generation');
      expect(yield* fs.exists(`${destination}.building`)).toBe(false);
    }));

  test('keeps one corpus out of another corpus service slot', () =>
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const directory = yield* fs.makeTempDirectoryScoped({ prefix: 'fixture-corpus-' });
      const source = `${directory}/source.db`;
      yield* fs.writeFileString(source, 'fixture-corpus');
      const layer = layerNativeFileArtifacts({
        artifact: FixtureArtifact,
        destination: `${directory}/fixture.db`,
        sources: [{ kind: 'workspace', path: source, label: 'fixture-workspace' }],
        provenanceStore: makeProvenanceStore(),
        verify: () => Effect.succeed(1),
      });

      const wired = yield* Effect.gen(function* () {
        const own = yield* Effect.serviceOption(FixtureArtifact.Installer);
        const other = yield* Effect.serviceOption(BibleArtifact.Installer);
        return { own: Option.isSome(own), other: Option.isSome(other) };
      }).pipe(Effect.provide(layer));

      expect(wired).toEqual({ own: true, other: false });
    }));
});
