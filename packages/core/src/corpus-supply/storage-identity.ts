import { Option } from 'effect';

import type { CorpusFileName } from './model.js';

/** Every name a browser host uses to store one File Corpus's generations. All
 *  four are derived from the corpus name in this one place, so a host cannot
 *  hand one corpus's artifact to another corpus's store, database, or key. */
export interface CorpusStorageIdentity<Corpus extends string> {
  /** The corpus this identity belongs to; a store and an artifact must agree. */
  readonly corpus: Corpus;
  /** The leading filename component every generation of this corpus carries. */
  readonly generationPrefix: string;
  /** The IndexedDB database holding this corpus's durable generation registry. */
  readonly metadataDatabaseName: string;
  /** The registry record key inside that database. */
  readonly activeGenerationKey: string;
  /** The HTTP path the release Asset Source streams bytes from. */
  readonly assetPath: string;
  /** Builds one generation filename from a raw revision and the
   *  12-hex-character digest prefix. The revision passes through
   *  `encodeRevision`, which is injective, so this is injective in
   *  (revision, digest) for every corpus, and injective in
   *  (corpus, revision, digest) for every strict corpus — see
   *  `LEGACY_IDENTITIES`. */
  readonly generationFilename: (revision: string, digest12: string) => string;
  /** Matches exactly the generation filenames this corpus owns, including the
   *  `-next.db` refresh slot. Literal-prefix based, never an interpolated
   *  RegExp source. */
  readonly ownsGeneration: (filename: string) => boolean;
}

/** Bytes a revision may carry into a filename unescaped. `_` is deliberately
 *  excluded: it is the escape introducer, so it must escape itself. */
const REVISION_LITERAL = /[^a-zA-Z0-9.-]/gu;

const UTF8 = new TextEncoder();

const escapeByte = (byte: number): string => `_${byte.toString(16).padStart(2, '0')}`;

/** Encodes a revision into `[a-zA-Z0-9._-]` reversibly rather than lossily.
 *
 *  Every character outside `[a-zA-Z0-9.-]` becomes `_XX` per UTF-8 byte, two
 *  lowercase hex digits each, and `_` itself becomes `_5f`. The map is
 *  injective: `_` never appears literally in the output, so each `_` in an
 *  encoded revision opens exactly one two-hex-digit escape and the byte
 *  sequence — hence the revision — can be read back uniquely. A lossy
 *  replacement would fold `v/1` and `v?1` onto the same filename and let two
 *  distinct revisions claim one generation.
 *
 *  Bible's shipped revision `db-v2` is drawn entirely from the literal set, so
 *  its legacy filename derivation is unchanged byte for byte. */
export const encodeRevision = (revision: string): string =>
  revision.replace(REVISION_LITERAL, (character) =>
    Array.from(UTF8.encode(character), escapeByte).join(''),
  );

/** Exactly the strings `encodeRevision` can produce: literal runs and complete
 *  lowercase-hex escapes, nothing else. */
const ENCODED_REVISION = /^(?:[a-zA-Z0-9.-]|_[0-9a-f]{2})*$/u;

const isEncodedRevision = (revision: string): boolean => ENCODED_REVISION.test(revision);

const DIGEST12 = /^[a-f0-9]{12}$/u;

/** `-` separates the components of Bible's legacy filenames and can also appear
 *  inside an encoded revision, so `bible` + `db-v2` and a hypothetical
 *  `bible-db` + `v2` would encode identically. `~` survives revision encoding
 *  nowhere and appears in no corpus name, so every strict corpus encodes
 *  injectively. */
const STRICT_SEPARATOR = '~';
const LEGACY_SEPARATOR = '-';
const SUFFIX = '.db';
const REFRESH_SUFFIX = '-next.db';

interface LegacyStorageNames {
  readonly generationPrefix: string;
  readonly metadataDatabaseName: string;
  readonly activeGenerationKey: string;
  readonly assetPath: string;
}

interface StorageNames extends LegacyStorageNames {
  /** Which filename separator this corpus encodes with: `-` only for the
   *  corpora that shipped before this derivation existed, `~` for every other. */
  readonly separator: string;
}

/** Bible shipped before this derivation existed. Installed browsers hold
 *  `bible-db-v2-<digest12>.db` in an IndexedDB database named
 *  `bible-corpus-metadata` under the key `active-bible-generation`, so those
 *  exact strings are the derivation for `bible` and nothing else. Every corpus
 *  added from now on takes the strict rule below and can never collide. */
const legacyEntry = (
  corpus: CorpusFileName,
  names: LegacyStorageNames,
): readonly [string, LegacyStorageNames] => [corpus, names];

const LEGACY_IDENTITIES: ReadonlyMap<string, LegacyStorageNames> = new Map([
  legacyEntry('bible', {
    generationPrefix: 'bible',
    metadataDatabaseName: 'bible-corpus-metadata',
    activeGenerationKey: 'active-bible-generation',
    assetPath: '/api/assets/bible',
  }),
]);

const legacyNames = (corpus: string): Option.Option<LegacyStorageNames> =>
  Option.fromUndefinedOr(LEGACY_IDENTITIES.get(corpus));

const stripSuffix = (filename: string): Option.Option<string> => {
  if (filename.endsWith(REFRESH_SUFFIX)) {
    return Option.some(filename.slice(0, filename.length - REFRESH_SUFFIX.length));
  }
  if (filename.endsWith(SUFFIX))
    return Option.some(filename.slice(0, filename.length - SUFFIX.length));
  return Option.none();
};

const isOwned = (prefix: string, separator: string, filename: string): boolean => {
  const body = stripSuffix(filename);
  if (Option.isNone(body)) return false;
  const head = `${prefix}${separator}`;
  if (!body.value.startsWith(head)) return false;
  const rest = body.value.slice(head.length);
  const boundary = rest.lastIndexOf(separator);
  if (boundary <= 0) return false;
  const revision = rest.slice(0, boundary);
  const digest12 = rest.slice(boundary + separator.length);
  if (revision.length === 0 || !DIGEST12.test(digest12)) return false;
  return isEncodedRevision(revision);
};

/** Derives every storage name one File Corpus uses from its name alone.
 *  Generic in the corpus name so the production call sites stay narrowed to
 *  `CorpusFileName` while a test can instantiate a distinct corpus identity
 *  without widening the production literal union. */
export const makeCorpusStorageIdentity = <Corpus extends string>(
  corpus: Corpus,
): CorpusStorageIdentity<Corpus> => {
  const { separator, ...names } = Option.match(legacyNames(corpus), {
    onNone: (): StorageNames => ({
      separator: STRICT_SEPARATOR,
      generationPrefix: corpus,
      metadataDatabaseName: `${corpus}-corpus-metadata`,
      activeGenerationKey: `active-${corpus}-generation`,
      assetPath: `/api/assets/${corpus}`,
    }),
    onSome: (legacy): StorageNames => ({ separator: LEGACY_SEPARATOR, ...legacy }),
  });
  return {
    corpus,
    generationPrefix: names.generationPrefix,
    metadataDatabaseName: names.metadataDatabaseName,
    activeGenerationKey: names.activeGenerationKey,
    assetPath: names.assetPath,
    generationFilename: (revision, digest12) =>
      `${names.generationPrefix}${separator}${encodeRevision(revision)}${separator}${digest12}${SUFFIX}`,
    ownsGeneration: (filename) => isOwned(names.generationPrefix, separator, filename),
  };
};

/** Narrowed to the production corpus vocabulary: hosts derive their storage
 *  names from a registered File Corpus and nothing else. */
export const corpusStorageIdentity = <Corpus extends CorpusFileName>(
  corpus: Corpus,
): CorpusStorageIdentity<Corpus> => makeCorpusStorageIdentity(corpus);
