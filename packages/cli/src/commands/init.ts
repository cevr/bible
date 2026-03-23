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

import { Flag, Command } from 'effect/unstable/cli';
import { Console, Effect, Schema } from 'effect';
import { existsSync, mkdirSync } from 'fs';
import { homedir } from 'os';
import { join } from 'path';

class InitError extends Schema.TaggedErrorClass<InitError>()('InitError', {
  cause: Schema.Defect,
}) {}

const BIBLE_DIR = join(homedir(), '.bible');
const GITHUB_RAW = 'https://raw.githubusercontent.com/cevr/bible-tools/main';
const GITHUB_RELEASE = 'https://github.com/cevr/bible-tools/releases/download/db-v1';

const DBS = {
  bible: {
    name: 'bible.db',
    url: `${GITHUB_RELEASE}/bible.db`,
    description: "KJV Bible with Strong's concordance and cross-references",
    size: '~125MB',
  },
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
    yield* Console.log(`Downloading ${label}...`);
    yield* Effect.tryPromise({
      try: async () => {
        const res = await fetch(url);
        if (!res.ok) throw new Error(`HTTP ${res.status}: ${res.statusText}`);
        const buf = await res.arrayBuffer();
        await Bun.write(dest, new Uint8Array(buf));
      },
      catch: (error) => new InitError({ cause: error }),
    });
  });

export const init = Command.make('init', { force }, (args) =>
  Effect.gen(function* () {
    // Ensure ~/.bible/ exists
    if (!existsSync(BIBLE_DIR)) {
      mkdirSync(BIBLE_DIR, { recursive: true });
      yield* Console.log(`Created ${BIBLE_DIR}`);
    }

    // Download each database
    for (const db of Object.values(DBS)) {
      const dbPath = join(BIBLE_DIR, db.name);
      if (!args.force && existsSync(dbPath)) {
        yield* Console.log(`✓ ${db.name} (${db.description})`);
      } else {
        yield* downloadFile(db.url, dbPath, `${db.name} ${db.size}`);
        yield* Console.log(`✓ ${db.name} installed`);
      }
    }

    // EGW database status
    const egwDbPath = join(BIBLE_DIR, 'egw-paragraphs.db');
    if (existsSync(egwDbPath)) {
      yield* Console.log(`✓ egw-paragraphs.db (EGW writings)`);
    } else {
      yield* Console.log(`✗ egw-paragraphs.db — sync from API:`);
      yield* Console.log(`  cd packages/core && bun run sync:egw`);
    }

    yield* Console.log(``);
    yield* Console.log(`Databases: ${BIBLE_DIR}`);
  }),
);
