#!/usr/bin/env bun
/**
 * Clean Bible Assets
 *
 * One-time cleanup of encoding issues in JSON source files.
 * Run: bun run packages/core/scripts/clean-assets.ts
 */

import * as BunRuntime from '@effect/platform-bun/BunRuntime';
import * as BunServices from '@effect/platform-bun/BunServices';
import { Console, Effect, FileSystem, Path, Schema, SchemaGetter } from 'effect';

const StrongsEntry = Schema.Struct({
  lemma: Schema.String,
  xlit: Schema.optional(Schema.String),
  pron: Schema.optional(Schema.String),
  def: Schema.String,
  kjvDef: Schema.optional(Schema.String),
});

const StrongsLexicon = Schema.Record(Schema.String, StrongsEntry);

const PrettyJson = Schema.Unknown.pipe(
  Schema.encodeTo(Schema.String, {
    decode: SchemaGetter.parseJson(),
    encode: SchemaGetter.stringifyJson({ space: 2 }),
  }),
);

const decodeStrongs = Schema.decodeUnknownEffect(Schema.fromJsonString(StrongsLexicon));
const encodeJson = Schema.encodeEffect(PrettyJson);

function decodeHtmlEntities(text: string): string {
  return text.replace(/&#(\d+)/g, (entity, code: string | undefined) => {
    if (code === undefined) return entity;
    return String.fromCharCode(Number.parseInt(code, 10));
  });
}

const program = Effect.gen(function* () {
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const assetsDirectory = path.resolve(import.meta.dir, '../assets');
  const strongsPath = path.join(assetsDirectory, 'strongs.json');

  yield* Console.log('Cleaning strongs.json...');
  const source = yield* fs.readFileString(strongsPath);
  const strongs = yield* decodeStrongs(source);

  let strongsFixed = 0;
  const cleanedStrongs: Record<string, typeof StrongsEntry.Type> = {};
  for (const [strongsNumber, entry] of Object.entries(strongs)) {
    const cleaned = decodeHtmlEntities(entry.def);
    if (cleaned !== entry.def) {
      strongsFixed += 1;
    }
    cleanedStrongs[strongsNumber] = { ...entry, def: cleaned };
  }

  const encoded = yield* encodeJson(cleanedStrongs);
  yield* fs.writeFileString(strongsPath, `${encoded}\n`);
  yield* Console.log(`  Fixed ${strongsFixed} definitions`);
  yield* Console.log('Done');
});

program.pipe(Effect.provide(BunServices.layer), BunRuntime.runMain);
