/** The Bun composition of §3.6's update policy, and the seam a test substitutes.
 *
 *  Its own module rather than the bottom of `topics.ts`, for the reason
 *  `search-layer.ts` gives: the parity test substitutes the seam and nothing
 *  else, and importing `topics.ts` to reach it would drag in the printer and
 *  every flag with it.
 *
 *  The pattern is `WikiLayer` / `LookupLayer` / `StudyLayer` / `SearchLayer`
 *  (M5-M9): a `Context.Reference` whose default reads the manifest over Bun's
 *  own HTTP client and installs into `~/.bible`, so a test provides its own
 *  layer without the command knowing.
 */

import {
  ContentActivation,
  ContentUpdate,
  layerHttpContentManifest,
} from '@bible/core/content-update';
import { CorpusSupply, topicsReleaseSource } from '@bible/core/corpus-supply';
import {
  layerNativeTopicsArtifacts,
  type NativeFileArtifactSource,
} from '@bible/core/corpus-supply/node';
import { sqliteProvenanceStore, verifyTopicsDatabase } from '@bible/core/corpus-supply/bun';
import { BunServices } from '@effect/platform-bun';
import { Config, Context, Effect, Layer, Path } from 'effect';
import { FetchHttpClient } from 'effect/unstable/http';

import { packagedDataCandidates } from '~/src/lib/paths';

/** The topics corpus as `bible init` already wires it: the same destination and
 *  the same ordered sources.
 *
 *  Restated here rather than imported from `init.ts` because `init` builds it
 *  inside its own command body, where it is not reachable. Both must name one
 *  set of sources — a `topics status` that consulted a *different* recipe than
 *  `topics update` installs through would report on a file nothing else writes.
 *  The precedence is the shared one: the copy shipped inside the install, the
 *  workspace build, then the release pin. */
const installedTopicsSupply: Layer.Layer<CorpusSupply> = Layer.unwrap(
  Effect.gen(function* () {
    const path = yield* Path.Path;
    const home = yield* Config.string('HOME');
    return CorpusSupply.layer.pipe(
      Layer.provide(
        layerNativeTopicsArtifacts({
          destination: path.join(home, '.bible', 'topics.db'),
          sources: [
            ...packagedDataCandidates('topics.db').map((candidate): NativeFileArtifactSource => ({
              kind: 'packaged',
              path: candidate,
              label: 'packaged',
            })),
            {
              kind: 'workspace',
              path: path.resolve('packages', 'core', 'data', 'topics.db'),
              label: 'workspace',
            },
            ...topicsReleaseSource(),
          ],
          // Bun's own SQLite driver: `better-sqlite3` panics the compiled
          // binary's Bun at open time, and the rules are shared either way.
          verify: verifyTopicsDatabase,
          provenanceStore: sqliteProvenanceStore,
        }),
      ),
    );
  }).pipe(Effect.provide(BunServices.layer), Effect.orDie),
);

/** §3.6 under Bun: the portable policy over the platform's `fetch`, reading the
 *  manifest directly. Like Electron main and unlike the browser, the CLI has no
 *  origin to be same as, so it reads the pinned release URL — resolved through
 *  the same `Config` seam every host reads. */
const installedContentLayer: Layer.Layer<ContentUpdate> = ContentUpdate.Live.pipe(
  Layer.provide(installedTopicsSupply),
  Layer.provide(layerHttpContentManifest),
  Layer.provide(FetchHttpClient.layer),
  // The CLI reopens nothing after an activation: the next read is a new
  // process, so there is no long-lived connection holding the old inode. Stated
  // rather than left to an omitted dependency (§3.6).
  Layer.provide(ContentActivation.Inert),
);

/** The substitution point (§10's host-parity seam).
 *
 *  A `Context.Reference` rather than a plain constant so `runCli` can hand the
 *  command a fixture manifest and a fixture corpus without the command taking a
 *  layer parameter it would otherwise never vary. */
export class ContentLayer extends Context.Reference<Layer.Layer<ContentUpdate>>(
  '@bible/cli/ContentLayer',
  { defaultValue: () => installedContentLayer },
) {}

/** Runs an effect against whichever `ContentUpdate` is in scope. */
export const contentService = <A, E>(
  use: Effect.Effect<A, E, ContentUpdate>,
): Effect.Effect<A, E> => Effect.flatMap(ContentLayer, (layer) => use.pipe(Effect.provide(layer)));
