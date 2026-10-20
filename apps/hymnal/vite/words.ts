/* oxlint-disable effect/noNodeBuiltinImport, effect/noTryCatch, effect/noThrowStatement, effect/noNewError, effect/noGlobals -- a build-time host script: the bundler plugin and the test preload call it synchronously, so it reads the compiled set from disk, fails the build naming the file that does not decode, and writes its JSON to standard output. */

/**
 * Every compiled hymn's words (`HymnText`), in number order: read by the
 * `virtual:hymnal` plugin (`hymnal.ts`, which runs this file under Bun and
 * reads its standard output) and by the app's tests.
 */

import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

import { Hymn } from '@bible/hymnal/hymn';
import { Schema } from 'effect';

import { type HymnText, textOf } from '../src/hymns/text';

/** The compiled set's folder, found through the package so no path climbs the repo. */
const folder = join(
  dirname(Bun.resolveSync('@bible/hymnal/hymn', import.meta.dir)),
  '../data/sdah-1985',
);

const decode = Schema.decodeUnknownSync(Schema.fromJsonString(Hymn));

export const readWords = (): ReadonlyArray<HymnText> =>
  readdirSync(folder)
    .filter((name) => /^\d{3}\.json$/.test(name))
    .toSorted()
    .map((name) => {
      const file = join(folder, name);
      try {
        return textOf(decode(readFileSync(file, 'utf8')));
      } catch (cause) {
        throw new Error(`hymnal: ${file} does not decode`, { cause });
      }
    });

if (import.meta.main) process.stdout.write(JSON.stringify(readWords()));
