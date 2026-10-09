import { BunFileSystem } from '@effect/platform-bun';
import { Database } from 'bun:sqlite';
import { Effect, FileSystem, Option, type Scope } from 'effect';
import { describe, expect, it as itBase } from 'effect-bun-test';

import { TopicsArtifact } from '../corpus-supply/file-artifact.js';
import type { CorpusProvenance } from '../corpus-supply/model.js';
import { layerNativeTopicsArtifacts } from './bible-artifact.js';
import { verifyTopicsDatabase } from './corpus-verify.js';
import type { NativeFileArtifactProvenanceStore } from './file-artifact.js';

/** Writes a topics artifact with the §2.2 tables at `file`. `schemaMajor` is a
 *  string because `meta.value` is a TEXT column: a corrupt version field is a
 *  string the artifact can really hold, and the verifier's strict parse only
 *  has a defect to catch if the fixture can write one. */
const writeArtifact = (
  file: string,
  input: { readonly schemaMajor: string; readonly topics: number; readonly aliases: number },
): void => {
  const database = new Database(file, { create: true });
  database.exec(`
    CREATE TABLE meta (key TEXT PRIMARY KEY, value TEXT NOT NULL);
    CREATE TABLE topics (slug TEXT PRIMARY KEY, title TEXT NOT NULL, thesis_ast TEXT NOT NULL, body_ast TEXT NOT NULL, position INTEGER NOT NULL);
    CREATE TABLE topic_aliases (alias TEXT PRIMARY KEY, display TEXT NOT NULL, slug TEXT NOT NULL, canonical INTEGER NOT NULL);
    CREATE TABLE topic_edges (from_slug TEXT NOT NULL, to_slug TEXT NOT NULL, kind TEXT NOT NULL, position INTEGER NOT NULL, PRIMARY KEY (from_slug, to_slug, kind));
    CREATE TABLE topic_catalog_keys (slug TEXT PRIMARY KEY, catalog_id TEXT NOT NULL, matched_by TEXT NOT NULL);
  `);
  database
    .prepare('INSERT INTO meta (key, value) VALUES (?, ?)')
    .run('schema_major', input.schemaMajor);
  const insertTopic = database.prepare(
    'INSERT INTO topics (slug, title, thesis_ast, body_ast, position) VALUES (?, ?, ?, ?, ?)',
  );
  for (let index = 0; index < input.topics; index += 1) {
    insertTopic.run(`slug-${String(index)}`, `Title ${String(index)}`, '[]', '[]', index);
  }
  const insertAlias = database.prepare(
    'INSERT INTO topic_aliases (alias, display, slug, canonical) VALUES (?, ?, ?, ?)',
  );
  for (let index = 0; index < input.aliases; index += 1) {
    insertAlias.run(`alias-${String(index)}`, `Alias ${String(index)}`, 'slug-0', 1);
  }
  database.close();
};

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

/** A fresh directory per test, removed when the test's scope closes. Fixed
 *  paths under `/tmp` would survive a run and collide with the next one. */
const scratch = (): Effect.Effect<string, never, FileSystem.FileSystem | Scope.Scope> =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    return yield* fs.makeTempDirectoryScoped({ prefix: 'bible-topics-native-' }).pipe(Effect.orDie);
  });

/** The acquire-then-install round at its own boundary. The layer is built per
 *  test from a scratch directory, so the provide belongs here rather than to a
 *  block nested inside each test's generator. */
const installFirstSource = (layer: ReturnType<typeof layerNativeTopicsArtifacts>) =>
  Effect.gen(function* () {
    const recipe = yield* TopicsArtifact.Recipe;
    const installer = yield* TopicsArtifact.Installer;
    const source = Option.fromNullishOr(recipe.sources[0]);
    if (Option.isNone(source)) return yield* Effect.fail('no source');
    return yield* source.value.acquire.pipe(Effect.flatMap(installer.install));
  }).pipe(Effect.provide(layer));

describe('native Topics artifact', () => {
  const it = itBase.scopedLive.layer(BunFileSystem.layer);

  it('atomically swaps a verified artifact into the destination', () =>
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const dir = yield* scratch();
      const incoming = `${dir}/incoming.db`;
      const destination = `${dir}/topics.db`;
      writeArtifact(incoming, { schemaMajor: '1', topics: 3, aliases: 5 });

      const receipt = yield* installFirstSource(
        layerNativeTopicsArtifacts({
          destination,
          sources: [{ kind: 'workspace', path: incoming, label: 'workspace' }],
          provenanceStore: makeProvenanceStore(),
          verify: verifyTopicsDatabase,
        }),
      );

      expect(receipt.installed).toBe(3);
      expect(yield* fs.exists(destination)).toBe(true);
      // The staging file is gone: the swap is a rename, not a copy left behind.
      expect(yield* fs.exists(`${destination}.building`)).toBe(false);
    }));

  it('leaves the active artifact in place when the candidate fails verification', () =>
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const dir = yield* scratch();
      const destination = `${dir}/topics.db`;
      // An artifact already active, and a candidate from an unreadable future.
      writeArtifact(destination, { schemaMajor: '1', topics: 2, aliases: 2 });
      const before = yield* fs.readFile(destination);
      const bad = `${dir}/bad.db`;
      writeArtifact(bad, { schemaMajor: '99', topics: 1, aliases: 1 });

      const exit = yield* installFirstSource(
        layerNativeTopicsArtifacts({
          destination,
          sources: [{ kind: 'workspace', path: bad, label: 'workspace' }],
          provenanceStore: makeProvenanceStore(),
          verify: verifyTopicsDatabase,
        }),
      ).pipe(Effect.exit);

      expect(exit._tag).toBe('Failure');
      expect(yield* fs.readFile(destination)).toEqual(before);
      expect(yield* fs.exists(`${destination}.building`)).toBe(false);
    }));
});

/** `accepted` carries the page count the verifier must return; `refused` carries
 *  the exact message it must report. Both are asserted, so a case cannot pass by
 *  failing for the wrong reason. */
type TopicsVerifierOutcome =
  | { readonly kind: 'accepted'; readonly installed: number }
  | { readonly kind: 'refused'; readonly message: string };

interface TopicsVerifierCase {
  readonly name: string;
  readonly fixture: {
    readonly schemaMajor: string;
    readonly topics: number;
    readonly aliases: number;
  };
  readonly outcome: TopicsVerifierOutcome;
}

const accepted = (installed: number): TopicsVerifierOutcome => ({ kind: 'accepted', installed });
const refused = (message: string): TopicsVerifierOutcome => ({ kind: 'refused', message });

/** Every value that must not read as a usable schema major.
 *
 *  `Number.parseInt('1junk', 10)` is 1, so a lenient parse reads each of these
 *  as a version this build can serve and installs a file whose version field is
 *  nonsense. */
const UNREADABLE_SCHEMA_MAJORS: readonly string[] = [
  '1junk',
  '',
  ' 1',
  '1.5',
  'NaN',
  '-1',
  '9'.repeat(30),
];

const TOPICS_VERIFIER_CASES: readonly TopicsVerifierCase[] = [
  {
    name: 'accepts an artifact with pages and a phrase dictionary',
    fixture: { schemaMajor: '1', topics: 4, aliases: 7 },
    outcome: accepted(4),
  },
  {
    name: 'accepts a schema major older than this build',
    fixture: { schemaMajor: '0', topics: 2, aliases: 2 },
    outcome: accepted(2),
  },
  {
    // A compile where every authored core is still `status: draft` produces this
    // file honestly, but it can never answer a lookup — so it is refused rather
    // than swapped over a generation that can.
    name: 'rejects an empty artifact',
    fixture: { schemaMajor: '1', topics: 0, aliases: 0 },
    outcome: refused('Topics Artifact has no pages'),
  },
  {
    name: 'rejects an artifact with no pages',
    fixture: { schemaMajor: '1', topics: 0, aliases: 3 },
    outcome: refused('Topics Artifact has no pages'),
  },
  {
    name: 'rejects pages with no phrase dictionary',
    fixture: { schemaMajor: '1', topics: 4, aliases: 0 },
    outcome: refused('Topics Artifact has no phrase dictionary'),
  },
  {
    name: 'rejects a schema major beyond this build',
    fixture: { schemaMajor: '99', topics: 1, aliases: 1 },
    outcome: refused('Topics Artifact schema_major 99 exceeds 1'),
  },
  ...UNREADABLE_SCHEMA_MAJORS.map((schemaMajor): TopicsVerifierCase => ({
    name: `rejects the schema_major '${schemaMajor}'`,
    fixture: { schemaMajor, topics: 1, aliases: 1 },
    outcome: refused('Topics Artifact has no readable schema_major'),
  })),
];

/** The verifier's rules, run against the production verifier through a real
 *  on-disk artifact. */
describe('Topics semantic verifier — native adapter', () => {
  const it = itBase.scopedLive.layer(BunFileSystem.layer);

  for (const testCase of TOPICS_VERIFIER_CASES) {
    it(testCase.name, () =>
      Effect.gen(function* () {
        const file = `${yield* scratch()}/topics.db`;
        writeArtifact(file, testCase.fixture);
        if (testCase.outcome.kind === 'accepted') {
          expect(yield* verifyTopicsDatabase(file)).toBe(testCase.outcome.installed);
          return;
        }
        expect(yield* Effect.flip(verifyTopicsDatabase(file))).toBe(testCase.outcome.message);
      }),
    );
  }

  /** Not in the shared matrix: "the tables were never created" is a state only
   *  a native adapter can be handed. The rule it proves is shared — a read
   *  that fails is a refusal, not a defect — but the fixture is not portable. */
  it('rejects a file missing the artifact tables', () =>
    Effect.gen(function* () {
      const file = `${yield* scratch()}/topics.db`;
      const database = new Database(file, { create: true });
      database.exec('CREATE TABLE meta (key TEXT PRIMARY KEY, value TEXT NOT NULL)');
      database.prepare('INSERT INTO meta (key, value) VALUES (?, ?)').run('schema_major', '1');
      database.close();
      const exit = yield* Effect.exit(verifyTopicsDatabase(file));
      expect(exit._tag).toBe('Failure');
    }));
});
