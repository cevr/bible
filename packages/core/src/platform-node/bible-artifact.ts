import * as BunHttpClient from '@effect/platform-bun/BunHttpClient';
import * as BunServices from '@effect/platform-bun/BunServices';
import { sha256 } from '@noble/hashes/sha2.js';
import { bytesToHex } from '@noble/hashes/utils.js';

import { CorpusInstallationError, CorpusSourceUnavailableError } from '../corpus-supply/errors.js';
import {
  VectorsArtifact,
  type VectorsArtifactInstaller,
  type VectorsArtifactRecipe,
} from '../search/vector-artifact.js';
import { parseVectorIndex } from '../search/vector-index.js';
import {
  BibleArtifact,
  TopicsArtifact,
  type BibleArtifactInstaller,
  type BibleArtifactRecipe,
  type FileArtifactSourceKind,
  type FileCorpusArtifact,
  type TopicsArtifactInstaller,
  type TopicsArtifactRecipe,
} from '../corpus-supply/file-artifact.js';
import {
  verifyTopicsArtifact,
  type TopicsArtifactReader,
} from '../corpus-supply/topics-verifier.js';
import {
  assetSourceId,
  corpusDigest,
  corpusGeneration,
  corpusRevision,
  CorpusProvenance,
  registeredCorpusName,
  type CorpusGeneration,
} from '../corpus-supply/model.js';
import Database from 'better-sqlite3';
import { Effect, FileSystem, Layer, Option, Path, Predicate, Schema, Stream } from 'effect';
import { HttpClient } from 'effect/unstable/http';

export interface LocalFileArtifactSource {
  readonly kind: Exclude<FileArtifactSourceKind, 'release'>;
  readonly path: string;
  readonly label: string;
}

export interface ReleaseFileArtifactSource {
  readonly kind: 'release';
  readonly url: string;
  readonly revision: string;
  readonly digest: string;
  /** The exact byte count the pinned manifest promises; rejected before the
   *  semantic verifier ever opens the file. */
  readonly size: number;
  /** The release ordinal these bytes were published under (§3.6), when the
   *  source states one.
   *
   *  What makes startup's install decision able to see that a compiled pin is
   *  *older* than what this host already installed at runtime — the re-flooring
   *  round-4 F2 found. `None` for a source with no ordinal, which is every
   *  local one. Defaulted so no existing call site has to state it. */
  readonly generation?: Option.Option<CorpusGeneration>;
}

export type NativeFileArtifactSource = LocalFileArtifactSource | ReleaseFileArtifactSource;

/** What kind of file one File Corpus's artifact is.
 *
 *  Not a cosmetic distinction: it decides where the lifecycle can put
 *  provenance. `sqlite` artifacts (Bible, Topics) carry it in a `meta` table
 *  inside themselves; `flat` artifacts (§9.2's vector index) carry it in a
 *  sidecar JSON, because there is nowhere inside a pinned binary format to put
 *  it. Declared by the caller rather than inferred from the bytes — see
 *  `layerNativeFileArtifacts`. */
export type FileArtifactLayout = 'sqlite' | 'flat';

/** Provenance as it is written down, in the artifact's `meta` table or in a
 *  sidecar JSON.
 *
 *  `generation` is `optionalKey` rather than required, and that is the
 *  migration: every artifact installed before §3.6's runtime path existed has
 *  no generation row, and a decoder that demanded one would report every one of
 *  them as "no verified generation" and re-install from the floor. Absent reads
 *  back as `None`, which is exactly what a local source means. */
export const StoredProvenance = Schema.Struct({
  source: Schema.String,
  revision: Schema.String,
  digest: Schema.String,
  generation: Schema.optionalKey(Schema.Int),
  /** The **file this record describes**, for a flat artifact whose provenance
   *  lives beside it rather than inside it.
   *
   *  This is what makes the sidecar a *pointer* rather than a second file that
   *  has to be kept in step with a first (round-4 B2). A flat activation used to
   *  be two renames over two fixed paths, and a crash between them left the old
   *  bytes wearing the new provenance — a wrong receipt, not an absent one, and
   *  nothing could tell. With a versioned artifact filename here, the sidecar's
   *  own rename is the single atomic step that makes a generation active, and
   *  whatever it names is what the host reads.
   *
   *  `optionalKey` because a SQLite artifact writes its provenance into itself
   *  and has no pointer to make, and because a sidecar written before this
   *  field existed still decodes — as `None`, which the reader treats as the
   *  destination path itself, exactly what it meant. */
  artifact: Schema.optionalKey(Schema.String),
});

/** One decoded record back into a `CorpusProvenance`, with the generation read
 *  as the `Option` the model carries. One function so the SQLite store and the
 *  sidecar store cannot disagree about what a stored record means. */
export const provenanceFrom = (stored: typeof StoredProvenance.Type): CorpusProvenance =>
  CorpusProvenance.make({
    source: assetSourceId(stored.source),
    revision: corpusRevision(stored.revision),
    digest: Option.some(corpusDigest(stored.digest)),
    generation: Option.map(Option.fromUndefinedOr(stored.generation), corpusGeneration),
  });

/** The generation as a struct fragment, so an absent row spreads to nothing
 *  rather than to an explicit `undefined` the exact-optional decoder refuses. */
export const storedGeneration = (raw: Option.Option<string>): { readonly generation?: number } =>
  Option.match(
    Option.flatMap(raw, (value) => Schema.decodeUnknownOption(Schema.Int)(Number(value))),
    {
      onNone: () => ({}),
      onSome: (generation) => ({ generation }),
    },
  );

export interface NativeFileArtifactProvenanceStore {
  readonly read: (filename: string) => Effect.Effect<CorpusProvenance, unknown>;
  readonly write: (filename: string, provenance: CorpusProvenance) => Effect.Effect<void, unknown>;
}

const sourceError = (operation: string, cause: unknown): CorpusSourceUnavailableError =>
  CorpusSourceUnavailableError.make({ operation, cause });

const localSource = (corpus: string, source: LocalFileArtifactSource) => ({
  kind: source.kind,
  acquire: Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const details = yield* fs.stat(source.path);
    if (details.type !== 'File' || details.size === 0n) {
      return yield* sourceError(`open-${corpus}-artifact:${source.label}`, 'source is empty');
    }
    const modified = Option.match(details.mtime, {
      onNone: () => 'unknown',
      onSome: (value) => String(value.getTime()),
    });
    const provenance = CorpusProvenance.make({
      source: assetSourceId(source.label),
      revision: corpusRevision(`${String(details.size)}-${modified}`),
      digest: Option.none(),
    });
    return {
      kind: source.kind,
      provenance,
      expectedSize: Option.none(),
      bytes: fs
        .stream(source.path)
        .pipe(
          Stream.mapError((cause) => sourceError(`read-${corpus}-artifact:${source.label}`, cause)),
        ),
    };
  }).pipe(
    Effect.mapError((cause) => sourceError(`open-${corpus}-artifact:${source.label}`, cause)),
    Effect.provide(BunServices.layer),
  ),
});

interface FileArtifactResponse {
  readonly status: number;
  readonly bytes: Stream.Stream<Uint8Array, unknown>;
}

const releaseSource = (
  corpus: string,
  source: ReleaseFileArtifactSource,
  fetchArtifact: (url: string) => Effect.Effect<FileArtifactResponse, unknown>,
) => ({
  kind: source.kind,
  acquire: Effect.succeed({
    kind: source.kind,
    provenance: CorpusProvenance.make({
      source: assetSourceId(`${corpus}-release`),
      revision: corpusRevision(source.revision),
      digest: Option.some(corpusDigest(source.digest)),
      // The ordinal this release states, carried onto the candidate so the
      // install decision can compare it with what is already installed
      // (round-4 F2) and so a successful install persists it.
      generation: source.generation ?? Option.none(),
    }),
    expectedSize: Option.some(source.size),
    bytes: Stream.unwrap(
      fetchArtifact(source.url).pipe(
        Effect.mapError((cause) => sourceError(`fetch-${corpus}-release`, cause)),
        Effect.flatMap((response) => {
          if (response.status < 200 || response.status >= 300)
            return Effect.fail(
              sourceError(`fetch-${corpus}-release`, `HTTP ${String(response.status)}`),
            );
          return Effect.succeed(
            response.bytes.pipe(
              Stream.mapError((cause) => sourceError(`read-${corpus}-release`, cause)),
            ),
          );
        }),
      ),
    ),
  }),
});

class FileArtifactStoreError extends Schema.TaggedError<FileArtifactStoreError>()(
  'FileArtifactStoreError',
  { operation: Schema.String, cause: Schema.Unknown },
) {}

const storeError = (operation: string) => (cause: unknown) =>
  FileArtifactStoreError.make({ operation, cause });

const openDatabase = (filename: string, readonly: boolean) =>
  Effect.try({
    try: () => new Database(filename, { readonly, fileMustExist: true }),
    catch: storeError('open-database'),
  });

const closeDatabase = (database: Database.Database) =>
  Effect.try({
    try: () => database.close(),
    catch: storeError('close-database'),
  });

const countRows = (database: Database.Database, table: string, where = '') =>
  Effect.try({
    try: () => database.prepare(`SELECT COUNT(*) AS count FROM ${table} ${where}`).get(),
    catch: storeError('count-rows'),
  }).pipe(
    Effect.flatMap((raw) =>
      Schema.decodeUnknownEffect(Schema.Struct({ count: Schema.Finite }))(raw).pipe(
        Effect.mapError(storeError('count-rows')),
      ),
    ),
    Effect.map((row) => row.count),
  );

export const verifyBibleDatabase = (filename: string): Effect.Effect<number, unknown> =>
  Effect.acquireUseRelease(
    openDatabase(filename, true),
    (database) =>
      Effect.gen(function* () {
        const integrity = yield* Effect.try({
          try: () => database.pragma('integrity_check', { simple: true }),
          catch: storeError('integrity-check'),
        });
        if (integrity !== 'ok') {
          return yield* Effect.fail(`SQLite integrity check failed: ${String(integrity)}`);
        }
        const books = yield* countRows(database, 'books');
        if (books !== 66) {
          return yield* Effect.fail('Bible Artifact does not contain the 66-book Canon');
        }
        const verses = yield* countRows(database, 'verses', "WHERE version_code = 'KJV'");
        if (verses !== 31_102) {
          return yield* Effect.fail(`Bible Artifact contains ${String(verses)} KJV Verses`);
        }
        if ((yield* countRows(database, 'strongs')) === 0) {
          return yield* Effect.fail("Bible Artifact has no Strong's lexicon");
        }
        if ((yield* countRows(database, 'cross_refs', "WHERE source = 'openbible'")) === 0) {
          return yield* Effect.fail('Bible Artifact has no OpenBible Cross References');
        }
        if ((yield* countRows(database, 'cross_refs', "WHERE source = 'tske'")) === 0) {
          return yield* Effect.fail('Bible Artifact has no TSKe Cross References');
        }
        if ((yield* countRows(database, 'margin_notes')) === 0) {
          return yield* Effect.fail('Bible Artifact has no Margin Notes');
        }
        if ((yield* countRows(database, 'topics')) === 0) {
          return yield* Effect.fail('Bible Artifact has no Topics');
        }
        return verses;
      }),
    closeDatabase,
  );

/** The native `TopicsArtifactReader`: the three reads the shared verifier makes,
 *  expressed against one open `better-sqlite3` connection.
 *
 *  Exported because it is also how the verifier's *rules* become testable here.
 *  `better-sqlite3`'s NAPI binding hard-crashes the Bun canary this repo tests
 *  under, so the driver cannot be opened in a test — but the driver is the only
 *  part that cannot. A test supplies its own reader over `bun:sqlite` and runs
 *  the same `verifyTopicsArtifact` production installs run, which is the whole
 *  reason the reader is a parameter rather than an internal detail. */
export const nativeTopicsReader = (database: Database.Database): TopicsArtifactReader => ({
  integrity: Effect.try({
    try: () => String(database.pragma('integrity_check', { simple: true })),
    catch: storeError('integrity-check'),
  }),
  meta: (key) =>
    Effect.try({
      try: () => database.prepare('SELECT value FROM meta WHERE key = ?').get(key),
      catch: storeError('read-meta'),
    }).pipe(
      Effect.flatMap((raw) =>
        // No row is `None`, not a failure: "the artifact does not say" is a
        // state the verifier decides about, not one the reader decides for it.
        Option.match(Option.fromNullishOr(raw), {
          onNone: () => Effect.succeedNone,
          onSome: (row) =>
            Schema.decodeUnknownEffect(Schema.Struct({ value: Schema.String }))(row).pipe(
              Effect.map((decoded) => Option.some(decoded.value)),
              Effect.mapError(storeError('read-meta')),
            ),
        }),
      ),
    ),
  count: (table) => countRows(database, table),
});

/** The Topics semantic verifier (§3.5) over a file on disk: open, apply the
 *  shared rules, close. The rules themselves live in `topics-verifier.ts` so the
 *  browser adapter applies the identical gate. */
export const verifyTopicsDatabase = (filename: string): Effect.Effect<number, unknown> =>
  Effect.acquireUseRelease(
    openDatabase(filename, true),
    (database) => verifyTopicsArtifact(nativeTopicsReader(database)),
    closeDatabase,
  );

const sqliteProvenanceStore: NativeFileArtifactProvenanceStore = {
  read: (filename) =>
    Effect.acquireUseRelease(
      openDatabase(filename, true),
      (database) =>
        Effect.gen(function* () {
          const row = Schema.Struct({ value: Schema.String });
          const value = (key: string) =>
            Effect.try({
              try: () => database.prepare('SELECT value FROM meta WHERE key = ?').get(key),
              catch: storeError('read-provenance'),
            }).pipe(
              Effect.flatMap((raw) =>
                Schema.decodeUnknownEffect(row)(raw).pipe(
                  Effect.mapError(storeError('read-provenance')),
                ),
              ),
              Effect.map((decoded) => decoded.value),
            );
          // `optionalValue` for the generation alone: an artifact installed
          // before §3.6's runtime path has no such row, and that absence is
          // `None` rather than an unreadable artifact.
          const optionalValue = (key: string) =>
            Effect.try({
              try: () => database.prepare('SELECT value FROM meta WHERE key = ?').get(key),
              catch: storeError('read-provenance'),
            }).pipe(
              Effect.map((raw) =>
                Option.fromNullishOr(raw).pipe(
                  Option.flatMap((found) =>
                    Schema.decodeUnknownOption(row)(found).pipe(
                      Option.map((decoded) => decoded.value),
                    ),
                  ),
                ),
              ),
            );
          const stored = yield* Schema.decodeEffect(StoredProvenance)({
            source: yield* value('corpus_source'),
            revision: yield* value('corpus_revision'),
            digest: yield* value('corpus_digest'),
            ...storedGeneration(yield* optionalValue('corpus_generation')),
          }).pipe(Effect.mapError(storeError('read-provenance')));
          return provenanceFrom(stored);
        }),
      closeDatabase,
    ),
  write: (filename, provenance) =>
    Effect.acquireUseRelease(
      openDatabase(filename, false),
      (database) =>
        Effect.try({
          try: () => {
            database.exec(
              'CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY, value TEXT NOT NULL)',
            );
            const upsert = database.prepare(
              'INSERT INTO meta (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value',
            );
            database.transaction(() => {
              upsert.run('corpus_source', provenance.source);
              upsert.run('corpus_revision', provenance.revision);
              upsert.run('corpus_digest', Option.getOrThrow(provenance.digest));
              // Only written when the source stated one, so a local install
              // does not stamp an ordinal onto bytes no publisher numbered.
              // A previous runtime generation is cleared for the same reason:
              // a stale row would outrank the artifact it no longer describes.
              Option.match(provenance.generation, {
                onNone: () =>
                  database.prepare('DELETE FROM meta WHERE key = ?').run('corpus_generation'),
                onSome: (generation) => upsert.run('corpus_generation', String(generation)),
              });
            })();
          },
          catch: storeError('write-provenance'),
        }),
      closeDatabase,
    ),
};

/** Provenance for a **flat** artifact, in a sidecar JSON file beside it.
 *
 *  The SQLite store above writes `meta` rows *into* the artifact, which is only
 *  possible because the artifact is a database. §9.2's vector index is a flat
 *  binary: it has no `meta` table, no schema, and no room for one — the parser
 *  addresses it from byte zero and any appended bytes make it malformed. The
 *  default store therefore could not install a `.bvi` at all. It opened the
 *  candidate file with `better-sqlite3` and failed before the rename, so
 *  `Target.vectors()` on desktop could never activate a generation (round-2 B1).
 *
 *  A sidecar rather than a header field, for two reasons. The format is pinned —
 *  §9.2 fixes the header and the manifest, and both the compiler and the shipped
 *  parser agree on their layout — so provenance cannot be added to it without a
 *  format version bump that every installed index would fail. And provenance is
 *  *supply* metadata, not index content: which release these bytes came from is
 *  a fact about the install, and the digest it records is the digest of the file
 *  without it, which a field inside the file could not be.
 *
 *  **Written to the building file's sidecar, then renamed with it.** The
 *  installer writes provenance to `<destination>.building` and renames that over
 *  `<destination>`; this store mirrors the same two-step onto
 *  `<destination>.building.provenance.json` → `<destination>.provenance.json`,
 *  so an interrupted install leaves the active file *and* its sidecar untouched.
 *  Reading provenance for a file whose sidecar is missing fails, which the
 *  lifecycle's `readCurrent` turns into "no current generation" — the correct
 *  answer for a file this host did not install.
 */
export const sidecarProvenanceStore: NativeFileArtifactProvenanceStore = {
  read: (filename) => Effect.map(readSidecar(filename), (pointer) => pointer.provenance),
  write: (filename, provenance) =>
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const digest = yield* Option.match(provenance.digest, {
        onNone: () => Effect.fail('Artifact digest is required'),
        onSome: Effect.succeed,
      });
      const encoded = yield* Schema.encodeEffect(Schema.fromJsonString(StoredProvenance))({
        source: provenance.source,
        revision: provenance.revision,
        digest,
        ...Option.match(provenance.generation, {
          onNone: () => ({}),
          onSome: (generation) => ({ generation: Number(generation) }),
        }),
      });
      yield* fs.writeFileString(sidecarPath(filename), encoded);
    }).pipe(Effect.mapError(storeError('write-provenance')), Effect.provide(BunServices.layer)),
};

/** What one sidecar says: the provenance, and the file it describes.
 *
 *  Two facts rather than one because the pointer is a fact about *storage* and
 *  the provenance is a fact about the *release* — and only the pointer half is
 *  what makes the flat activation atomic. */
interface SidecarPointer {
  readonly provenance: CorpusProvenance;
  /** The artifact this record describes, absolute. `None` for a sidecar written
   *  before versioned filenames existed, which meant the destination itself. */
  readonly artifact: Option.Option<string>;
}

const readSidecar = (filename: string): Effect.Effect<SidecarPointer, unknown> =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const raw = yield* fs.readFileString(sidecarPath(filename));
    const stored = yield* Schema.decodeUnknownEffect(Schema.fromJsonString(StoredProvenance))(raw);
    return {
      provenance: provenanceFrom(stored),
      artifact: Option.fromUndefinedOr(stored.artifact),
    };
  }).pipe(Effect.mapError(storeError('read-provenance')), Effect.provide(BunServices.layer));

/** Writes the **pointer**: the provenance plus the versioned file it describes.
 *
 *  Written to a staging sidecar and renamed over the live one as the *last*
 *  step of an activation, which is what makes a flat install atomic (round-4
 *  B2). Until that rename lands, the live pointer still names the previous
 *  generation's file — so a crash mid-install leaves a host reading exactly what
 *  it was reading before, rather than reading new bytes under old provenance or
 *  old bytes under new. */
const writeSidecarPointer = (input: {
  readonly sidecarFor: string;
  readonly artifact: string;
  readonly provenance: CorpusProvenance;
}): Effect.Effect<void, unknown> =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const digest = yield* Option.match(input.provenance.digest, {
      onNone: () => Effect.fail('Artifact digest is required'),
      onSome: Effect.succeed,
    });
    const encoded = yield* Schema.encodeEffect(Schema.fromJsonString(StoredProvenance))({
      source: input.provenance.source,
      revision: input.provenance.revision,
      digest,
      artifact: input.artifact,
      ...Option.match(input.provenance.generation, {
        onNone: () => ({}),
        onSome: (generation) => ({ generation: Number(generation) }),
      }),
    });
    yield* fs.writeFileString(sidecarPath(input.sidecarFor), encoded);
  }).pipe(Effect.mapError(storeError('write-provenance')), Effect.provide(BunServices.layer));

/** The digest of one file on disk, streamed rather than read whole.
 *
 *  What makes the pointer *checkable*: `readCurrent` compares this against the
 *  digest the pointer states, so a pointer that names a file it does not
 *  describe reports no generation instead of reporting the wrong one
 *  (round-4 B2). Streamed because a Bible artifact is 150 MB and this runs at
 *  every startup. */
const fileDigest = (filename: string): Effect.Effect<string, unknown> =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const hasher = sha256.create();
    yield* fs
      .stream(filename)
      .pipe(Stream.runForEach((chunk) => Effect.sync(() => hasher.update(chunk))));
    return `sha256:${bytesToHex(hasher.digest())}`;
  }).pipe(Effect.provide(BunServices.layer));

/** The versioned filename one generation's bytes live at.
 *
 *  Derived from the digest the pointer records, so the name and the check are
 *  one fact: a pointer naming `vectors.bvi.g-abc123def456` is claiming the file
 *  at that path hashes to `sha256:abc123def456…`, and `readCurrent` verifies
 *  exactly that. Twelve hex characters, the same prefix length the browser
 *  generation store already uses. */
/** Removes one retired generation's file, never the one that is live.
 *
 *  Best-effort: a file that cannot be removed is disk to reclaim, never a
 *  reason to fail an activation that already happened, or to turn a failed
 *  install into a second, different failure. `keep` is the file this run must
 *  not touch — the generation it just activated, or the one it is falling back
 *  to. */
const retire = (
  fs: FileSystem.FileSystem,
  candidate: Option.Option<string>,
  keep: string,
): Effect.Effect<void> =>
  Option.match(
    Option.filter(candidate, (file) => file !== keep),
    {
      onNone: () => Effect.void,
      onSome: (file) => fs.remove(file, { force: true }).pipe(Effect.ignore),
    },
  );

const generationPath = (destination: string, digest: string): string =>
  `${destination}.g-${digest.slice('sha256:'.length, 'sha256:'.length + 12)}`;

/** Where one artifact's sidecar lives: the artifact's own path plus a suffix.
 *
 *  Derived rather than configured, so the sidecar of `x.building` is
 *  `x.building.provenance.json` and renaming `x.building` → `x` has an exactly
 *  parallel sidecar rename. One function so the installer, the reader and the
 *  cleanup cannot disagree about the name. */
const sidecarPath = (filename: string): string => `${filename}.provenance.json`;

/** What this host currently has activated: the artifact file, and its
 *  provenance.
 *
 *  For a `sqlite` artifact the answer is the destination itself — the file
 *  carries its own `meta` rows, so there is nothing to point at and nothing to
 *  cross-check that reading the file does not already check.
 *
 *  For a `flat` artifact the pointer decides (round-4 B2), and the pointer is
 *  **verified against the file it names**: the digest the sidecar states must be
 *  the digest of those bytes. That is what turns a torn install into "no
 *  generation" rather than "the wrong generation reported confidently" — the
 *  sidecar used to be believed unconditionally, so old bytes wearing a new
 *  sidecar were indistinguishable from a clean activation. */
interface ActiveGeneration {
  readonly file: string;
  readonly provenance: CorpusProvenance;
}

const readActive = (input: {
  readonly destination: string;
  readonly layout: FileArtifactLayout;
  readonly verify: (filename: string) => Effect.Effect<number, unknown>;
  readonly provenanceStore: NativeFileArtifactProvenanceStore;
}): Effect.Effect<Option.Option<ActiveGeneration>> =>
  Effect.gen(function* () {
    if (input.layout !== 'flat') {
      yield* input.verify(input.destination);
      return {
        file: input.destination,
        provenance: yield* input.provenanceStore.read(input.destination),
      };
    }
    const pointer = yield* readSidecar(input.destination);
    // A sidecar written before versioned filenames named the destination
    // itself, which is still the file it described.
    const file = Option.getOrElse(pointer.artifact, () => input.destination);
    const stated = yield* Option.match(pointer.provenance.digest, {
      onNone: () => Effect.fail('Artifact provenance states no digest'),
      onSome: Effect.succeed,
    });
    // The check the pointer exists to make possible. A file that is not the one
    // the pointer describes is not an activation, whatever the sidecar says.
    if ((yield* fileDigest(file)) !== stated) {
      return yield* Effect.fail('Artifact does not match the generation its pointer names');
    }
    yield* input.verify(file);
    return { file, provenance: pointer.provenance };
  }).pipe(Effect.option);

/** Streams one File Corpus Artifact to `<destination>.building`, hashes while
 *  writing, rejects a manifest-digest mismatch, semantically verifies the
 *  building file, writes Provenance into it, then renames over the active
 *  file. Any failure removes the building file and leaves the active one. */
export const layerNativeFileArtifacts = <Corpus extends string, RecipeId, InstallerId>(input: {
  readonly artifact: FileCorpusArtifact<Corpus, RecipeId, InstallerId>;
  readonly destination: string;
  readonly sources: readonly NativeFileArtifactSource[];
  readonly verify: (filename: string) => Effect.Effect<number, unknown>;
  readonly fetch?: (url: string) => Effect.Effect<Response, unknown>;
  readonly provenanceStore?: NativeFileArtifactProvenanceStore;
  /** Whether this corpus's artifact is a SQLite database or an opaque blob.
   *
   *  It decides where provenance goes: inside the file for a database, in a
   *  sidecar JSON for a blob. Defaults to `sqlite`, so Bible and Topics are
   *  unchanged; §9.2's vector index declares `flat`. */
  readonly layout?: FileArtifactLayout;
}): Layer.Layer<InstallerId | RecipeId> => {
  const corpus = input.artifact.corpus;
  const reportedCorpus = Option.getOrUndefined(registeredCorpusName(corpus));
  const verify = input.verify;
  let fetchArtifact: (url: string) => Effect.Effect<FileArtifactResponse, unknown>;
  const injectedFetch = input.fetch;
  if (Predicate.isNotUndefined(injectedFetch)) {
    fetchArtifact = (url) =>
      injectedFetch(url).pipe(
        Effect.flatMap((response) => {
          const body = response.body;
          if (Predicate.isNull(body)) {
            return Effect.fail(sourceError(`fetch-${corpus}-release`, 'response has no body'));
          }
          return Effect.succeed({
            status: response.status,
            bytes: Stream.fromReadableStream({
              evaluate: () => body,
              onError: (cause) => cause,
            }),
          });
        }),
      );
  } else {
    fetchArtifact = (url) =>
      Effect.gen(function* () {
        const client = yield* HttpClient.HttpClient;
        const response = yield* client.get(url);
        return { status: response.status, bytes: response.stream };
      }).pipe(Effect.provide(BunHttpClient.layer));
  }
  // A flat artifact cannot hold `meta` rows, so it gets the sidecar store; a
  // SQLite artifact keeps writing provenance into itself, which is what the
  // browser adapter reads back and what shipped. `layout` is declared by the
  // caller rather than sniffed from the bytes: what an artifact *is* is a
  // property of the corpus, and probing a file to decide how to write its
  // provenance would be exactly the guess this milestone's audit found.
  const layout = input.layout ?? 'sqlite';
  const defaultProvenanceStore = (): NativeFileArtifactProvenanceStore => {
    if (layout === 'flat') return sidecarProvenanceStore;
    return sqliteProvenanceStore;
  };
  const provenanceStore = input.provenanceStore ?? defaultProvenanceStore();
  const makeSource = (source: NativeFileArtifactSource) => {
    if (source.kind === 'release') return releaseSource(corpus, source, fetchArtifact);
    return localSource(corpus, source);
  };
  const recipe = input.artifact.layerRecipe({
    sources: input.sources.map(makeSource),
    // §3.6's runtime leg: a manifest entry is exactly a `ReleaseFileArtifactSource`
    // — url, revision, digest, size — so a release this host was *handed* is
    // acquired through the identical source the pinned one is. One builder, so
    // a runtime install cannot take a different path to the installer than the
    // pin does, and the digest, size and atomic-swap guarantees are the same
    // guarantees rather than parallel ones.
    releaseSource: (release) =>
      releaseSource(
        corpus,
        {
          kind: 'release',
          url: release.url,
          revision: release.revision,
          digest: release.digest,
          size: release.size,
          // §3.6's ordinal, stated by whoever handed this host the release. It
          // reaches the persisted Provenance through the source rather than
          // being re-attached afterwards, so the runtime leg and the pinned leg
          // record it the same way.
          generation: release.generation,
        },
        fetchArtifact,
      ),
  });
  /** One read of what is active, shared by `current` and `activeFile` so the
   *  two can never disagree about which generation this host holds. */
  const active = readActive({
    destination: input.destination,
    layout,
    verify,
    provenanceStore,
  });
  const activeFile = active.pipe(Effect.map(Option.map((generation) => generation.file)));
  /** What an install must retire once it succeeds — for a flat artifact only.
   *
   *  A SQLite artifact renames over one canonical path and has nothing to
   *  retire, and reading `active` on that path would run this corpus's semantic
   *  verifier against the *outgoing* file: an extra open every install would pay
   *  for nothing, and one the digest-mismatch suites count. */
  const retirementTarget = (): Effect.Effect<Option.Option<string>> => {
    if (layout === 'flat') return activeFile;
    return Effect.succeedNone;
  };
  const activeFileForRetirement = retirementTarget();
  const installer = input.artifact.layerInstaller({
    current: active.pipe(Effect.map(Option.map((generation) => generation.provenance))),
    activeFile,
    install: (artifact) =>
      Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem;
        const path = yield* Path.Path;
        yield* fs.makeDirectory(path.dirname(input.destination), { recursive: true });
        const building = `${input.destination}.building`;
        const hasher = sha256.create();
        let written = 0;
        // Set once the candidate has a name of its own, so a failure removes
        // exactly what this run created and never a live generation.
        let staged = Option.none<string>();
        const install = Effect.gen(function* () {
          yield* artifact.bytes.pipe(
            Stream.tap((chunk) =>
              Effect.sync(() => {
                hasher.update(chunk);
                written += chunk.byteLength;
              }),
            ),
            Stream.run(fs.sink(building)),
          );
          // Size and digest are the whole trust surface, so both close before
          // the semantic verifier is allowed to open the candidate file.
          if (Option.exists(artifact.expectedSize, (expected) => expected !== written)) {
            return yield* Effect.fail(
              `${input.artifact.label} Artifact size does not match its release manifest`,
            );
          }
          const digest = corpusDigest(`sha256:${bytesToHex(hasher.digest())}`);
          if (Option.exists(artifact.provenance.digest, (expected) => expected !== digest)) {
            return yield* Effect.fail(
              `${input.artifact.label} Artifact digest does not match its release manifest`,
            );
          }
          const provenance = CorpusProvenance.make({
            source: artifact.provenance.source,
            revision: artifact.provenance.revision,
            digest: Option.some(digest),
            // The candidate's own generation, carried through to what is
            // persisted. Recomputing the digest here and *dropping* the ordinal
            // would have made every runtime install read back as ungenerationed
            // on the next startup — the exact re-flooring §3.6 forbids.
            generation: artifact.provenance.generation,
          });
          if (layout === 'flat') {
            // **Versioned file, then one atomic pointer** (round-4 B2).
            //
            // The bytes go to a name derived from their own digest, so they
            // never overwrite a live generation and the destination path is
            // never half-written. Only then is the pointer renamed over the
            // live sidecar — one atomic step, and the step that *is* the
            // activation. A crash before it leaves the previous pointer naming
            // the previous file, which is the state a host was already in.
            //
            // The old order — sidecar first, artifact second — had a window in
            // which the *old* bytes wore the *new* provenance, and nothing
            // could tell, because the sidecar was believed rather than checked.
            const versioned = generationPath(input.destination, digest);
            staged = Option.some(versioned);
            const stagedPointer = `${input.destination}.building`;
            const installed = yield* verify(building);
            yield* fs.rename(building, versioned);
            yield* writeSidecarPointer({
              sidecarFor: stagedPointer,
              artifact: versioned,
              provenance,
            });
            yield* fs.rename(sidecarPath(stagedPointer), sidecarPath(input.destination));
            // The generation this one replaced, retired only after the pointer
            // that named it is gone. Best-effort: a file that cannot be removed
            // is disk to reclaim, never a reason to fail an activation that has
            // already happened.
            yield* retire(fs, previouslyActive, versioned);
            return { installed, provenance };
          }
          const installed = yield* verify(building);
          yield* provenanceStore.write(building, provenance);
          yield* fs.rename(building, input.destination);
          // A SQLite artifact carries its own provenance, so a sidecar left
          // by an earlier flat install of the same destination would be a
          // second, stale answer to the same question.
          yield* fs.remove(sidecarPath(input.destination), { force: true });
          return { installed, provenance };
        });
        // Read *before* the install so the retirement above knows what it is
        // replacing. Only for a flat artifact: a SQLite one renames over one
        // canonical path and has nothing to retire, and reading `active` would
        // run this corpus's semantic verifier against the *outgoing* file — an
        // extra open every install would pay for nothing.
        const previouslyActive = yield* activeFileForRetirement;
        return yield* install.pipe(
          Effect.onError(() =>
            Effect.all(
              [
                fs.remove(building, { force: true }),
                // The candidate's staging sidecar goes with the candidate: a
                // failed install must leave nothing behind that a later read
                // could mistake for a generation.
                fs.remove(sidecarPath(building), { force: true }),
                // And the versioned file, when this run got as far as naming
                // one — unless it is the generation already active, which a
                // re-install of identical bytes reaches.
                retire(
                  fs,
                  staged,
                  Option.getOrElse(previouslyActive, () => building),
                ),
              ],
              { discard: true },
            ).pipe(Effect.ignore),
          ),
        );
      }).pipe(
        Effect.mapError((cause) => CorpusInstallationError.make({ corpus: reportedCorpus, cause })),
        Effect.provide(BunServices.layer),
      ),
  });
  return Layer.merge(recipe, installer);
};

/** The Bible instance of the native File Corpus lifecycle: the canonical
 *  destination plus the 66-book / 31,102-verse semantic verifier. */
export const layerNativeBibleArtifacts = (input: {
  readonly destination: string;
  readonly sources: readonly NativeFileArtifactSource[];
  readonly fetch?: (url: string) => Effect.Effect<Response, unknown>;
  readonly verify?: (filename: string) => Effect.Effect<number, unknown>;
  readonly provenanceStore?: NativeFileArtifactProvenanceStore;
}): Layer.Layer<BibleArtifactInstaller | BibleArtifactRecipe> =>
  layerNativeFileArtifacts({
    artifact: BibleArtifact,
    destination: input.destination,
    sources: input.sources,
    fetch: input.fetch,
    provenanceStore: input.provenanceStore,
    verify: input.verify ?? verifyBibleDatabase,
  });

/** The Topics instance of the native File Corpus lifecycle. Callers pass the
 *  local sources their host offers; `topicsReleaseSource` appends the pinned
 *  release once one is published. */
export const layerNativeTopicsArtifacts = (input: {
  readonly destination: string;
  readonly sources: readonly NativeFileArtifactSource[];
  readonly fetch?: (url: string) => Effect.Effect<Response, unknown>;
  readonly verify?: (filename: string) => Effect.Effect<number, unknown>;
  readonly provenanceStore?: NativeFileArtifactProvenanceStore;
}): Layer.Layer<TopicsArtifactInstaller | TopicsArtifactRecipe> =>
  layerNativeFileArtifacts({
    artifact: TopicsArtifact,
    destination: input.destination,
    sources: input.sources,
    fetch: input.fetch,
    provenanceStore: input.provenanceStore,
    verify: input.verify ?? verifyTopicsDatabase,
  });

/** The Vectors semantic verifier (§3.5): the shipped parser, over the installed
 *  file.
 *
 *  A digest match proves the bytes arrived intact; it cannot prove they are an
 *  index this build can read. Running `parseVectorIndex` is what makes a
 *  truncated, foreign-fingerprint or mis-tiled artifact fail *before* the swap,
 *  so a host never activates a generation whose index the search layer would
 *  then reject at every query. The count it returns is the receipt's own
 *  measure of what was installed.
 */
export const verifyVectorIndexFile = (filename: string): Effect.Effect<number, unknown> =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const bytes = yield* fs.readFile(filename);
    // Copied into its own `ArrayBuffer`: a read may hand back a view onto a
    // larger pooled buffer, and the parser addresses the index from byte zero.
    const buffer = new ArrayBuffer(bytes.byteLength);
    new Uint8Array(buffer).set(bytes);
    const parsed = parseVectorIndex(buffer);
    if (parsed._tag !== 'ok') {
      // A message, as the topics verifier fails: the installer's job is to
      // refuse the swap and say why, and the reason is operator-facing text
      // rather than a case any caller branches on.
      return yield* Effect.fail(`vector index rejected by the shipped parser: ${parsed._tag}`);
    }
    return parsed.index.count;
  }).pipe(Effect.provide(BunServices.layer));

/** The Vectors instance of the native File Corpus lifecycle. Callers pass the
 *  local sources their host offers; `vectorsReleaseSource` appends the pinned
 *  release once one is published. */
export const layerNativeVectorsArtifacts = (input: {
  readonly destination: string;
  readonly sources: readonly NativeFileArtifactSource[];
  readonly fetch?: (url: string) => Effect.Effect<Response, unknown>;
  readonly verify?: (filename: string) => Effect.Effect<number, unknown>;
  readonly provenanceStore?: NativeFileArtifactProvenanceStore;
}): Layer.Layer<VectorsArtifactInstaller | VectorsArtifactRecipe> =>
  layerNativeFileArtifacts({
    artifact: VectorsArtifact,
    destination: input.destination,
    sources: input.sources,
    fetch: input.fetch,
    provenanceStore: input.provenanceStore,
    // §9.2's index is an opaque binary, so provenance lives in a sidecar. The
    // default SQLite store opened the candidate `.bvi` with `better-sqlite3`
    // and failed before the rename, which meant no host could ever activate a
    // vectors generation (round-2 B1).
    layout: 'flat',
    verify: input.verify ?? verifyVectorIndexFile,
  });
