/**
 * Init CLI Command
 *
 * `bible init` - Initialize all databases in ~/.bible/
 *
 * Downloads pre-built databases from GitHub:
 * - bible.db: KJV text, Strong's concordance, cross-references
 * - hymnal.db: 920 SDA hymns
 * - egw-paragraphs.db: too large to host — prints sync instructions
 */

import {
  BIBLE_ARTIFACT_RELEASE,
  CorpusSupply,
  type CorpusSupplyReceipt,
  Target,
  topicsReleaseSource,
} from '@bible/core/corpus-supply';
import {
  layerNativeBibleArtifacts,
  layerNativeTopicsArtifacts,
  type NativeFileArtifactSource,
} from '@bible/core/corpus-supply/node';
import {
  sqliteProvenanceStore,
  verifyBibleDatabase,
  verifyTopicsDatabase,
} from '@bible/core/corpus-supply/bun';
import { Config, Console, Effect, FileSystem, Layer, Option, Path, Schema } from 'effect';
import { Command, Flag } from 'effect/unstable/cli';
import { HttpClient, HttpClientResponse } from 'effect/unstable/http';

import { packagedDataCandidates } from '~/src/lib/paths';

class InitError extends Schema.TaggedError<InitError>()('InitError', {
  cause: Schema.Unknown,
}) {}

const GITHUB_RAW = 'https://raw.githubusercontent.com/cevr/bible/main';

const DBS = {
  hymnal: {
    name: 'hymnal.db',
    url: `${GITHUB_RAW}/packages/core/data/hymnal.db`,
    description: 'SDA Hymnal (920 hymns)',
    size: '~950KB',
  },
} as const;

const force = Flag.Boolean('force').pipe(
  Flag.withDefault(false),
  Flag.withDescription('Re-download databases even if they exist'),
);

const downloadFile = (url: string, dest: string, label: string) =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    yield* Console.log(`Downloading ${label}...`);
    const bytes = yield* HttpClient.get(url).pipe(
      Effect.flatMap(HttpClientResponse.filterStatusOk),
      Effect.flatMap((response) => response.arrayBuffer),
      Effect.mapError((cause) => InitError.make({ cause })),
    );
    yield* fs.writeFile(dest, new Uint8Array(bytes));
  });

/**
 * Resolve the bible and topics artifacts against one `CorpusSupply`
 * composition. The supply layer is built and provided here, at this
 * operation's own boundary, so the command handler never provides inline.
 */
const ensureArtifacts = (bibleDir: string, path: Path.Path, force: boolean) => {
  const bibleArtifacts = layerNativeBibleArtifacts({
    destination: path.join(bibleDir, 'bible.db'),
    sources: [{ kind: 'release', ...BIBLE_ARTIFACT_RELEASE }],
    // The `bun:sqlite` drivers: same rules, Bun's own driver. The default
    // `better-sqlite3` binding hard-crashes the Bun this CLI compiles against
    // the moment a database opens (NAPI panic under the compiled binary).
    verify: verifyBibleDatabase,
    provenanceStore: sqliteProvenanceStore,
  });
  // Topics has no published release yet, so its sources are the local slots,
  // in the same precedence every host uses: the copy shipped inside the CLI
  // install, the workspace build `bun run build:topics` writes, and any copy
  // already installed under ~/.bible.
  const topicsArtifacts = layerNativeTopicsArtifacts({
    destination: path.join(bibleDir, 'topics.db'),
    sources: [
      // Resolved from the executable's own location first, so a binary copied
      // off the build machine still finds the artifact it ships with; the
      // build-time root is only the dev-mode fallback. Every candidate is
      // offered as its own source rather than one path being chosen here —
      // the supply pipeline already tries sources in order and skips the ones
      // that are absent, so there is no reason to duplicate that logic.
      ...packagedDataCandidates('topics.db').map((candidate): NativeFileArtifactSource => ({
        kind: 'packaged',
        path: candidate,
        label: 'packaged',
      })),
      // Only reachable when the CLI runs from the repo root; an installed
      // binary is invoked from arbitrary directories, which is why the
      // packaged slot above — not this one — is the install-owned source.
      {
        kind: 'workspace',
        path: path.resolve(process.cwd(), 'packages', 'core', 'data', 'topics.db'),
        label: 'workspace',
      },
      ...topicsReleaseSource(),
    ],
    verify: verifyTopicsDatabase,
    provenanceStore: sqliteProvenanceStore,
  });
  const supply = CorpusSupply.layer.pipe(
    Layer.provide(Layer.merge(bibleArtifacts, topicsArtifacts)),
  );

  return Effect.gen(function* () {
    const corpus = yield* CorpusSupply;
    const bible = yield* corpus.ensure({ refresh: force });
    // Writings-style catch-and-warn (§3.5): a missing topics artifact leaves
    // the wiki on catalog pages, which is a degraded feature, not a failed init.
    const topics = yield* corpus.ensure({ target: Target.topics(), refresh: force }).pipe(
      Effect.map(Option.some),
      Effect.orElseSucceed(() => Option.none<CorpusSupplyReceipt>()),
    );
    return { bible, topics };
  }).pipe(Effect.provide(supply));
};

export const init = Command.make('init', { force }, (args) =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const home = yield* Config.String('HOME');
    const bibleDir = path.join(home, '.bible');
    // Ensure ~/.bible/ exists
    if (!(yield* fs.exists(bibleDir))) {
      yield* fs.makeDirectory(bibleDir, { recursive: true });
      yield* Console.log(`Created ${bibleDir}`);
    }

    const { bible, topics } = yield* ensureArtifacts(bibleDir, path, args.force);

    let bibleStatus = 'installed and verified';
    if (bible.activated.length === 0) {
      bibleStatus = 'ready';
    }
    yield* Console.log(`✓ bible.db (${bibleStatus})`);

    yield* Option.match(topics, {
      onNone: () =>
        Console.log(`✗ topics.db — build it with:`).pipe(
          Effect.andThen(Console.log(`  bun run build:topics`)),
        ),
      onSome: (receipt) =>
        Console.log(
          `✓ topics.db (${Option.match(
            Option.liftPredicate(receipt.activated, (activated) => activated.length > 0),
            { onNone: () => 'ready', onSome: () => 'installed and verified' },
          )})`,
        ),
    });

    // Download each database
    for (const db of Object.values(DBS)) {
      const dbPath = path.join(bibleDir, db.name);
      if (!args.force && (yield* fs.exists(dbPath))) {
        yield* Console.log(`✓ ${db.name} (${db.description})`);
      } else {
        yield* downloadFile(db.url, dbPath, `${db.name} ${db.size}`);
        yield* Console.log(`✓ ${db.name} installed`);
      }
    }

    // EGW database status
    const egwDbPath = path.join(bibleDir, 'egw-paragraphs.db');
    if (yield* fs.exists(egwDbPath)) {
      yield* Console.log(`✓ egw-paragraphs.db (EGW writings)`);
    } else {
      yield* Console.log(`✗ egw-paragraphs.db — add publications with:`);
      yield* Console.log(`  bible egw download <CODE>`);
    }

    yield* Console.log(``);
    yield* Console.log(`Databases: ${bibleDir}`);
  }),
);
