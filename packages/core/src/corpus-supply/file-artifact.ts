import { Context, Effect, Layer, Option, Schema, SchemaTransformation } from 'effect';
import type { Stream } from 'effect';

import { CorpusInstallationError, type CorpusSourceUnavailableError } from './errors.js';
import {
  registeredCorpusName,
  type CorpusFileName,
  type CorpusGeneration,
  type CorpusProvenance,
} from './model.js';
import { makeCorpusStorageIdentity, type CorpusStorageIdentity } from './storage-identity.js';

/** Where one candidate File Corpus Artifact came from, in the order a Recipe
 *  consults them. Local kinds are read from disk; `release` is the pinned
 *  manifest download every client falls back to. */
export type FileArtifactSourceKind = 'packaged' | 'workspace' | 'runtime' | 'release';

/** A pinned release manifest: the exact bytes one corpus version consists of.
 *  Digest and size are the whole trust surface — see corpus-supply/CONTEXT.md. */
export interface FileArtifactRelease {
  readonly url: string;
  readonly revision: string;
  readonly digest: string;
  readonly size: number;
}

export const BIBLE_ARTIFACT_RELEASE: FileArtifactRelease = {
  url: 'https://github.com/cevr/bible/releases/download/db-v2/bible.db',
  revision: 'db-v2',
  digest: 'sha256:e72244f576be2bfa1b28c4816f60d3668338c1322d7cd329d73143ec43bf277c',
  size: 156_291_072,
};

/** No topics content release is published yet. The pin is the compiled-in
 *  offline floor of §3.6, and a floor whose digest names bytes that do not
 *  exist is worse than no floor: every host would list a release source that
 *  can only ever 404, and the digest would be a lie the trust surface is built
 *  on. Until the first `topics.db` is released, the artifact is supplied from
 *  the local sources every host already offers — the packaged copy, the
 *  workspace build output `bun run build:topics` writes, and the runtime copy
 *  in `~/.bible` — and `TOPICS_ARTIFACT_RELEASE` stays `None`.
 *
 *  Activating it on first publish is one edit here: fill in the release and
 *  every host's recipe grows its release source, because each already appends
 *  the pin through `topicsReleaseSource`. */
export const TOPICS_ARTIFACT_RELEASE: Option.Option<FileArtifactRelease> = Option.none();

/** The release ordinal the compiled Topics pin was published under — §3.6's
 *  offline floor, as the number a manifest entry is compared against.
 *
 *  `None` alongside `TOPICS_ARTIFACT_RELEASE` being `None`: a build with no pin
 *  has no floor ordinal, so every published generation is above nothing and the
 *  first runtime release is installable on a fresh machine. Filled in with the
 *  release itself on first publish, which is the same one edit.
 *
 *  It lives beside the pin rather than inside it because `FileArtifactRelease`
 *  is the shape both installers already consume, and a generation is a fact
 *  about the *update policy* rather than about the bytes — the installer does
 *  not order releases, it verifies one. */
export const TOPICS_ARTIFACT_GENERATION: Option.Option<CorpusGeneration> = Option.none();

/** The pinned Topics release as a source list: empty while no release exists,
 *  one entry once `TOPICS_ARTIFACT_RELEASE` is filled in. Every host spreads
 *  this after its local sources, so publishing the first content version wires
 *  the release leg into all three hosts without touching any of them. */
export interface ReleaseSourceDeclaration extends FileArtifactRelease {
  readonly kind: 'release';
  /** The release ordinal this pin was published under (§3.6), when the build
   *  states one.
   *
   *  Carried on the *declaration* rather than left to the installer because
   *  this is the fact startup's install decision turns on: a host holding
   *  runtime generation 4 must not be re-floored by a compiled pin at
   *  generation 3, and the only way `ensure` can know that is for the pin to
   *  say which generation its bytes are (round-4 F2). `None` on a local source
   *  — a packaged copy is not a published content version. */
  readonly generation: Option.Option<CorpusGeneration>;
}

export const topicsReleaseSource = (): readonly ReleaseSourceDeclaration[] =>
  Option.match(TOPICS_ARTIFACT_RELEASE, {
    onNone: (): readonly ReleaseSourceDeclaration[] => [],
    onSome: (release) => [{ kind: 'release', ...release, generation: TOPICS_ARTIFACT_GENERATION }],
  });

export interface FileArtifact {
  readonly kind: FileArtifactSourceKind;
  readonly provenance: CorpusProvenance;
  /** The exact byte count a pinned release manifest promises. Both installers
   *  reject a different count before semantic verification runs; a local source
   *  pins no manifest and declares `None`. */
  readonly expectedSize: Option.Option<number>;
  readonly bytes: Stream.Stream<Uint8Array, CorpusSourceUnavailableError>;
}

export interface FileArtifactSourceService {
  readonly kind: FileArtifactSourceKind;
  readonly acquire: Effect.Effect<FileArtifact, CorpusSourceUnavailableError>;
}

const sourcePriority = {
  packaged: 0,
  workspace: 1,
  runtime: 2,
  release: 3,
} satisfies Readonly<Record<FileArtifactSourceKind, number>>;

/** One content version a host may be asked to install *at runtime*, named by a
 *  manifest entry rather than by a compiled pin (§3.6).
 *
 *  The same four facts a `FileArtifactRelease` carries, because they are the
 *  same four facts: url, revision, digest, size. A separate type only to say
 *  where the value came from — a pin is compiled into this build, a
 *  `RuntimeArtifactRelease` arrived over the network — which is the distinction
 *  `installFrom` exists to keep honest. */
export interface RuntimeArtifactRelease extends FileArtifactRelease {
  /** §3.6's release ordinal for these bytes, as the manifest stated it.
   *
   *  Required, unlike the pin's, because a runtime release *is* a published
   *  content version by definition — it came out of a manifest that numbers
   *  one release per version. Carrying it on the release rather than beside it
   *  is what lets one `releaseSource` builder serve both legs: the pinned and
   *  the runtime candidate reach the installer with the ordinal already on
   *  their provenance, rather than the runtime one having it re-attached
   *  afterwards by a caller who has to remember to (round-4 F2). */
  readonly generation: Option.Option<CorpusGeneration>;
}

export interface FileArtifactRecipeService {
  readonly sources: readonly FileArtifactSourceService[];
  /** One Asset Source over a release this host was *handed*, built the same way
   *  this host builds its pinned release source.
   *
   *  §3.6's runtime path needs it: a manifest entry names bytes no compiled
   *  source list mentions, so a host that could only consult `sources` could
   *  never install the version it just offered — `ensure` would re-consult the
   *  same pinned sources and reinstall what is already there (round-3 F1).
   *
   *  `None` on a host that cannot fetch a release at all, which is how "this
   *  host has no runtime install path" is written down rather than left to a
   *  source list that happens to be empty. */
  readonly releaseSource: Option.Option<
    (release: RuntimeArtifactRelease) => FileArtifactSourceService
  >;
}

export interface FileArtifactInstallerService {
  readonly current: Effect.Effect<Option.Option<CorpusProvenance>, CorpusInstallationError>;
  readonly install: (
    artifact: FileArtifact,
  ) => Effect.Effect<
    { readonly installed: number; readonly provenance: CorpusProvenance },
    CorpusInstallationError
  >;
  /** Where the *host* reads the generation this installer activated.
   *
   *  `None` when nothing is activated, which is exactly `current` being `None`.
   *
   *  It exists because activation is not always a rename over one canonical
   *  path. A flat artifact has no `meta` table, so its provenance lives in a
   *  sidecar — and renaming an artifact and its sidecar is two operations with a
   *  window between them, in which the host had the *new* bytes described by
   *  the *old* provenance, or the reverse (round-4 B2). The browser already
   *  solved this with versioned generation files and one atomic registry
   *  pointer; this is the same shape natively, and the address the pointer names
   *  is what a host must open rather than a path it assumed. */
  readonly activeFile: Effect.Effect<Option.Option<string>, CorpusInstallationError>;
}

/** The Recipe key of one File Corpus: the ordered Asset Sources a host offers
 *  for that corpus. One class per corpus so hosts cannot wire one corpus's
 *  sources into another's slot. */
export class BibleArtifactRecipe extends Context.Service<
  BibleArtifactRecipe,
  FileArtifactRecipeService
>()('@bible/core/corpus-supply/BibleArtifactRecipe') {}

/** The Installer key of one File Corpus: reading the active Provenance and
 *  performing the verified atomic swap. */
export class BibleArtifactInstaller extends Context.Service<
  BibleArtifactInstaller,
  FileArtifactInstallerService
>()('@bible/core/corpus-supply/BibleArtifactInstaller') {}

/** One File Corpus's whole identity: its name in receipts and errors, the
 *  label it uses in operator-facing causes, the storage names every host
 *  derives from that name, and its two service keys. Every step of the
 *  lifecycle — native and browser adapters, the `ensure` loop — is
 *  parameterized by this value, so a new file corpus declares two keys and one
 *  `makeFileCorpusArtifact` call and inherits the lifecycle whole.
 *
 *  `Corpus` is only constrained to `string` here: a host adapter needs the
 *  corpus name for storage derivation and operator-facing causes, neither of
 *  which is the receipt vocabulary. `RegisteredFileCorpus`, which is what the
 *  `ensure` pipeline holds, keeps the narrow constraint, so an artifact whose
 *  name is not a `CorpusFileName` can drive the adapters in a test but can
 *  never reach a Receipt or the registry. */
export interface FileCorpusArtifact<Corpus extends string, RecipeId, InstallerId> {
  readonly corpus: Corpus;
  readonly label: string;
  readonly storage: CorpusStorageIdentity<Corpus>;
  readonly wired: Effect.Effect<Option.Option<WiredFileCorpus>>;
  readonly Recipe: Context.Service<RecipeId, FileArtifactRecipeService>;
  readonly Installer: Context.Service<InstallerId, FileArtifactInstallerService>;
  readonly layerRecipe: (recipe: {
    readonly sources: readonly FileArtifactSourceService[];
    /** How this host builds an Asset Source over a release it was handed.
     *  Omitted by a host with no runtime install path — a test recipe, or the
     *  browser before its proxy route exists — and `None` is what the supply
     *  pipeline then reports rather than silently installing something else. */
    readonly releaseSource?: (release: RuntimeArtifactRelease) => FileArtifactSourceService;
  }) => Layer.Layer<RecipeId>;
  readonly layerInstaller: (installer: FileArtifactInstallerService) => Layer.Layer<InstallerId>;
  /** This corpus, declared present but holding nothing.
   *
   *  A host that wires no artifact at all leaves both tags unprovided, and
   *  `wired` answers `None` — which is the right answer for a host that does
   *  not have this corpus. But a *seam* that requires the tags (the web
   *  worker's `ProcedureServerInput`, so §3.6's install can reach the reader's
   *  own store) needs something to hand a fixture, and "no sources, nothing
   *  installed, install refused" is a decision worth writing down rather than a
   *  stub every suite re-invents. `install` fails rather than dies: a caller
   *  that reaches it has asked a wired corpus to install, and the answer is the
   *  same typed refusal an empty recipe already produces. */
  readonly layerEmpty: Layer.Layer<InstallerId | RecipeId>;
}

/** Whichever keys a File Corpus was declared with, the pipeline only ever asks
 *  it two questions: what is it called, and is a host wiring it? `wired`
 *  answers the second without leaking the key types, so the `ensure` loop can
 *  hold corpora with unrelated keys in one registry. The corpus name stays a
 *  type parameter so the registry in `service.ts` can demand that the entry
 *  filed under a key *is* that key's corpus. */
export interface RegisteredFileCorpus<Corpus extends CorpusFileName = CorpusFileName> {
  readonly corpus: Corpus;
  readonly label: string;
  readonly wired: Effect.Effect<Option.Option<WiredFileCorpus>>;
}

export interface WiredFileCorpus {
  readonly recipe: FileArtifactRecipeService;
  readonly installer: FileArtifactInstallerService;
}

/** Declares a File Corpus for any corpus name. Generic in the name so a test
 *  can drive the adapters with a corpus that is deliberately not `bible`
 *  without widening `CorpusFileName`; production declares its corpora through
 *  `makeFileCorpusArtifact`, which narrows to the registered vocabulary. */
export const makeUnregisteredFileCorpusArtifact = <
  Corpus extends string,
  RecipeId,
  InstallerId,
>(input: {
  readonly corpus: Corpus;
  readonly label: string;
  readonly Recipe: Context.Service<RecipeId, FileArtifactRecipeService>;
  readonly Installer: Context.Service<InstallerId, FileArtifactInstallerService>;
}): FileCorpusArtifact<Corpus, RecipeId, InstallerId> => ({
  corpus: input.corpus,
  label: input.label,
  storage: makeCorpusStorageIdentity(input.corpus),
  Recipe: input.Recipe,
  Installer: input.Installer,
  wired: Effect.gen(function* () {
    const recipe = yield* Effect.serviceOption(input.Recipe);
    const installer = yield* Effect.serviceOption(input.Installer);
    if (Option.isNone(recipe) || Option.isNone(installer)) return Option.none();
    return Option.some({ recipe: recipe.value, installer: installer.value });
  }),
  layerRecipe: (recipe) =>
    Layer.succeed(input.Recipe, {
      sources: [...recipe.sources].sort(
        (left, right) => sourcePriority[left.kind] - sourcePriority[right.kind],
      ),
      releaseSource: Option.fromUndefinedOr(recipe.releaseSource),
    }),
  layerInstaller: (installer) => Layer.succeed(input.Installer, installer),
  layerEmpty: Layer.merge(
    Layer.succeed(input.Recipe, { sources: [], releaseSource: Option.none() }),
    Layer.succeed(input.Installer, {
      current: Effect.succeed(Option.none()),
      activeFile: Effect.succeed(Option.none()),
      install: () =>
        Effect.fail(
          CorpusInstallationError.make({
            corpus: Option.getOrUndefined(registeredCorpusName(input.corpus)),
            cause: `${input.label} Artifact is not wired on this host`,
          }),
        ),
    }),
  ),
});

/** Declares a File Corpus the supply pipeline can register: the corpus name
 *  must be one the receipt vocabulary admits, so the artifact also satisfies
 *  `RegisteredFileCorpus<Corpus>` and can be filed under its own name in
 *  `service.ts`. */
export const makeFileCorpusArtifact = <
  Corpus extends CorpusFileName,
  RecipeId,
  InstallerId,
>(input: {
  readonly corpus: Corpus;
  readonly label: string;
  readonly Recipe: Context.Service<RecipeId, FileArtifactRecipeService>;
  readonly Installer: Context.Service<InstallerId, FileArtifactInstallerService>;
}): FileCorpusArtifact<Corpus, RecipeId, InstallerId> & RegisteredFileCorpus<Corpus> =>
  makeUnregisteredFileCorpusArtifact(input);

/** The canonical Bible Artifact: the first instance of the File Corpus
 *  lifecycle. */
export const BibleArtifact = makeFileCorpusArtifact({
  corpus: 'bible',
  label: 'Bible',
  Recipe: BibleArtifactRecipe,
  Installer: BibleArtifactInstaller,
});

/** The Topics Artifact schema version this build reads. It lives beside the
 *  artifact rather than in `wiki/` because it is an *install-time* gate, not a
 *  page concern: both semantic verifiers refuse a candidate whose major
 *  exceeds it (§3.6), and both run inside the supply lifecycle before any
 *  reader exists. `wiki/model.ts` re-exports it for the service that reads the
 *  installed file. */
export const TOPICS_SCHEMA_MAJOR = 1;
export const TOPICS_SCHEMA_MINOR = 0;

/** `meta.schema_major` as both verifiers must read it: the whole string is the
 *  number or the artifact is unreadable. `Number.parseInt` cannot express that
 *  — it stops at the first non-digit, so `'1junk'` reads as major 1 and an
 *  artifact whose version field is corrupt installs as if it were v1. The
 *  version gate is the only thing standing between this build and a file it
 *  cannot interpret, so it decodes strictly or not at all.
 *
 *  Both semantic verifiers call this so the native and browser gates stay one
 *  rule with one definition rather than two implementations that agree today. */
export const TopicsSchemaMajor = Schema.String.check(Schema.isPattern(/^\d+$/)).pipe(
  Schema.decodeTo(
    Schema.Int.check(Schema.isBetween({ minimum: 0, maximum: Number.MAX_SAFE_INTEGER })),
    SchemaTransformation.numberFromString,
  ),
);

/** `None` when the stored value is not a full-string non-negative integer this
 *  build can compare against `TOPICS_SCHEMA_MAJOR`. */
export const readTopicsSchemaMajor: (raw: string) => Option.Option<number> =
  Schema.decodeUnknownOption(TopicsSchemaMajor);

export class TopicsArtifactRecipe extends Context.Service<
  TopicsArtifactRecipe,
  FileArtifactRecipeService
>()('@bible/core/corpus-supply/TopicsArtifactRecipe') {}

export class TopicsArtifactInstaller extends Context.Service<
  TopicsArtifactInstaller,
  FileArtifactInstallerService
>()('@bible/core/corpus-supply/TopicsArtifactInstaller') {}

/** The Topics Artifact: the wiki's compiled authored cores. Unlike Bible it is
 *  best-effort — §3.5's degradation posture wraps its `ensure` in a catch, so a
 *  host that cannot supply it still starts and every topic falls back to a
 *  catalog landing page. */
export const TopicsArtifact = makeFileCorpusArtifact({
  corpus: 'topics',
  label: 'Topics',
  Recipe: TopicsArtifactRecipe,
  Installer: TopicsArtifactInstaller,
});
