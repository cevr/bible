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

import { BIBLE_ARTIFACT_RELEASE, CorpusSupply } from '@bible/core/corpus-supply';
import { layerNativeBibleArtifacts } from '@bible/core/corpus-supply/node';
import { Config, Console, Effect, FileSystem, Layer, Path, Schema } from 'effect';
import { Command, Flag } from 'effect/unstable/cli';
import { HttpClient, HttpClientResponse } from 'effect/unstable/http';

class InitError extends Schema.TaggedErrorClass<InitError>()('InitError', {
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

const force = Flag.boolean('force').pipe(
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
      Effect.mapError((cause) => new InitError({ cause })),
    );
    yield* fs.writeFile(dest, new Uint8Array(bytes));
  });

export const init = Command.make('init', { force }, (args) =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const home = yield* Config.string('HOME');
    const bibleDir = path.join(home, '.bible');
    // Ensure ~/.bible/ exists
    if (!(yield* fs.exists(bibleDir))) {
      yield* fs.makeDirectory(bibleDir, { recursive: true });
      yield* Console.log(`Created ${bibleDir}`);
    }

    const bibleArtifacts = layerNativeBibleArtifacts({
      destination: path.join(bibleDir, 'bible.db'),
      sources: [{ kind: 'release', ...BIBLE_ARTIFACT_RELEASE }],
    });
    const bibleSupply = CorpusSupply.layer.pipe(Layer.provide(bibleArtifacts));
    const bible = yield* Effect.gen(function* () {
      return yield* (yield* CorpusSupply).ensure({ refresh: args.force });
    }).pipe(Effect.provide(bibleSupply));
    let bibleStatus = 'installed and verified';
    if (bible.activated.length === 0) {
      bibleStatus = 'ready';
    }
    yield* Console.log(`✓ bible.db (${bibleStatus})`);

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
