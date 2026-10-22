/* oxlint-disable effect/noGlobals, effect/noNewError -- a build-time host script: the bundler plugin runs it under Bun and reads its JSON from standard output, and the build fails naming the hymn the encoding cannot carry. */

/**
 * Every compiled hymn's chords as the app carries them: `[number, string]`
 * in number order, each string the hymn's parts and guitar chords in the
 * encoding `src/hymns/chords.ts` decodes. Read by the `virtual:hymnal-chords`
 * plugin (`hymnal.ts`) and by the app's tests; the compiled set is read as
 * `words.ts` reads it, and the build fails on a hymn it cannot encode.
 */

import { Option } from 'effect';

import { encodeHymn } from '../src/hymns/chords';
import { readHymns } from './words';

export const readChords = (): ReadonlyArray<readonly [number, string]> =>
  readHymns().map((hymn) => [
    hymn.number,
    Option.getOrThrowWith(
      encodeHymn(hymn),
      () => new Error(`hymnal: hymn ${hymn.number} has a syllable the chord encoding cannot carry`),
    ),
  ]);

if (import.meta.main) process.stdout.write(JSON.stringify(readChords()));
