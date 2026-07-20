import { Context, Layer } from 'effect';
import type { Effect, Option, Stream } from 'effect';

import type { CorpusInstallationError, CorpusSourceUnavailableError } from './errors.js';
import type { CorpusProvenance } from './model.js';

export type BibleArtifactSourceKind = 'packaged' | 'workspace' | 'runtime' | 'release';

export const BIBLE_ARTIFACT_RELEASE = {
  url: 'https://github.com/cevr/bible/releases/download/db-v2/bible.db',
  revision: 'db-v2',
  digest: 'sha256:e72244f576be2bfa1b28c4816f60d3668338c1322d7cd329d73143ec43bf277c',
  size: 156_291_072,
} as const;

export interface BibleArtifact {
  readonly kind: BibleArtifactSourceKind;
  readonly provenance: CorpusProvenance;
  readonly bytes: Stream.Stream<Uint8Array, CorpusSourceUnavailableError>;
}

export interface BibleArtifactSourceShape {
  readonly kind: BibleArtifactSourceKind;
  readonly acquire: Effect.Effect<BibleArtifact, CorpusSourceUnavailableError>;
}

const sourcePriority: Readonly<Record<BibleArtifactSourceKind, number>> = {
  packaged: 0,
  workspace: 1,
  runtime: 2,
  release: 3,
};

export interface BibleArtifactRecipeShape {
  readonly sources: readonly BibleArtifactSourceShape[];
}

export class BibleArtifactRecipe extends Context.Service<
  BibleArtifactRecipe,
  BibleArtifactRecipeShape
>()('@bible/core/corpus-supply/BibleArtifactRecipe') {}

export const layerBibleArtifactRecipe = (
  sources: readonly BibleArtifactSourceShape[],
): Layer.Layer<BibleArtifactRecipe> =>
  Layer.succeed(
    BibleArtifactRecipe,
    BibleArtifactRecipe.of({
      sources: [...sources].sort(
        (left, right) => sourcePriority[left.kind] - sourcePriority[right.kind],
      ),
    }),
  );

export interface BibleArtifactInstallerShape {
  readonly current: Effect.Effect<Option.Option<CorpusProvenance>, CorpusInstallationError>;
  readonly install: (
    artifact: BibleArtifact,
  ) => Effect.Effect<
    { readonly installed: number; readonly provenance: CorpusProvenance },
    CorpusInstallationError
  >;
}

export class BibleArtifactInstaller extends Context.Service<
  BibleArtifactInstaller,
  BibleArtifactInstallerShape
>()('@bible/core/corpus-supply/BibleArtifactInstaller') {}

export const layerBibleArtifactInstaller = (
  installer: BibleArtifactInstallerShape,
): Layer.Layer<BibleArtifactInstaller> =>
  Layer.succeed(BibleArtifactInstaller, BibleArtifactInstaller.of(installer));
