/** The Bible and Topics instances of the File Corpus lifecycle, under Bun
 *  (§3.5).
 *
 *  Each is the generic lifecycle in `file-artifact.ts` bound to its artifact,
 *  with its semantic verifier from `corpus-verify.ts` as the default gate.
 */

import {
  BibleArtifact,
  TopicsArtifact,
  type BibleArtifactInstaller,
  type BibleArtifactRecipe,
  type TopicsArtifactInstaller,
  type TopicsArtifactRecipe,
} from '../corpus-supply/file-artifact.js';
import type { Effect, Layer } from 'effect';

import { verifyBibleDatabase, verifyTopicsDatabase } from './corpus-verify.js';
import {
  layerNativeFileArtifacts,
  type NativeFileArtifactProvenanceStore,
  type NativeFileArtifactSource,
} from './file-artifact.js';

export type { NativeFileArtifactSource } from './file-artifact.js';

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
