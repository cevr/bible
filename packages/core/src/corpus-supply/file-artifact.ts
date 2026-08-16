import { Context, Effect, Layer, Option } from 'effect';
import type { Stream } from 'effect';

import type { CorpusInstallationError, CorpusSourceUnavailableError } from './errors.js';
import type { CorpusFileName, CorpusProvenance } from './model.js';
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

export interface FileArtifactRecipeService {
  readonly sources: readonly FileArtifactSourceService[];
}

export interface FileArtifactInstallerService {
  readonly current: Effect.Effect<Option.Option<CorpusProvenance>, CorpusInstallationError>;
  readonly install: (
    artifact: FileArtifact,
  ) => Effect.Effect<
    { readonly installed: number; readonly provenance: CorpusProvenance },
    CorpusInstallationError
  >;
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
  readonly layerRecipe: (sources: readonly FileArtifactSourceService[]) => Layer.Layer<RecipeId>;
  readonly layerInstaller: (installer: FileArtifactInstallerService) => Layer.Layer<InstallerId>;
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
  layerRecipe: (sources) =>
    Layer.succeed(input.Recipe, {
      sources: [...sources].sort(
        (left, right) => sourcePriority[left.kind] - sourcePriority[right.kind],
      ),
    }),
  layerInstaller: (installer) => Layer.succeed(input.Installer, installer),
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

/** The canonical Bible Artifact: the first and, until the topics artifact
 *  lands, only instance of the File Corpus lifecycle. */
export const BibleArtifact = makeFileCorpusArtifact({
  corpus: 'bible',
  label: 'Bible',
  Recipe: BibleArtifactRecipe,
  Installer: BibleArtifactInstaller,
});
