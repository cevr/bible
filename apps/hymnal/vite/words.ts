/* oxlint-disable effect/noNodeBuiltinImport, effect/noTryCatch, effect/noThrowStatement, effect/noNewError, effect/noGlobals -- a build-time host script: the bundler plugin and the test preload call it synchronously, so it reads the compiled set from disk, fails the build naming the file that does not decode, and writes its JSON to standard output. */

/**
 * Every compiled hymn's words (`HymnText`), in number order, each with its
 * topical section's name from the compiled topics (`topics.json`, through
 * `topicOf`): read by the `virtual:hymnal` plugin (`hymnal.ts`, which runs
 * this file under Bun and reads its standard output) and by the app's tests.
 */

import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

import { Hymn, Topics, topicOf } from '@bible/hymnal/hymn';
import { Option, Schema } from 'effect';

import { type HymnText, textOf } from '../src/hymns/text';

/** The compiled set's folder, found through the package so no path climbs the repo. */
const folder = join(
  dirname(Bun.resolveSync('@bible/hymnal/hymn', import.meta.dir)),
  '../data/sdah-1985',
);

const decode = Schema.decodeUnknownSync(Schema.fromJsonString(Hymn));
const decodeTopics = Schema.decodeUnknownSync(Schema.fromJsonString(Topics));

/** The compiled hymn in `file`; the build fails naming a file that does not decode. */
const decodeHymn = (file: string): Hymn => {
  try {
    return decode(readFileSync(file, 'utf8'));
  } catch (cause) {
    throw new Error(`hymnal: ${file} does not decode`, { cause });
  }
};

/** The name of the topic that holds `hymn`; the build fails for a hymn in none. */
const topicName = (topics: Topics, hymn: Hymn): string =>
  Option.getOrThrowWith(
    Option.map(topicOf(topics, hymn.number), (topic) => topic.name),
    () => new Error(`hymnal: hymn ${hymn.number} is in no topic of topics.json`),
  );

/** The compiled topical sections. */
export const readTopics = (): Topics =>
  decodeTopics(readFileSync(join(folder, 'topics.json'), 'utf8'));

let hymns: ReadonlyArray<Hymn> = [];

/**
 * Every compiled hymn, in number order, read once per process: the words
 * here and the chords (`chords.ts`) both derive from it.
 */
export const readHymns = (): ReadonlyArray<Hymn> => {
  if (hymns.length === 0)
    hymns = readdirSync(folder)
      .filter((name) => /^\d{3}\.json$/.test(name))
      .toSorted()
      .map((name) => decodeHymn(join(folder, name)));
  return hymns;
};

export const readWords = (): ReadonlyArray<HymnText> => {
  const topics = readTopics();
  return readHymns().map((hymn) => textOf(hymn, topicName(topics, hymn)));
};

if (import.meta.main) process.stdout.write(JSON.stringify(readWords()));
