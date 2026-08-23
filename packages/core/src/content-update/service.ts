/** §3.6's update policy as one portable service.
 *
 *  `status` answers the four surfaces — the toast, the settings entry,
 *  `bible topics status` and `v1.content.status` — with one value and **no
 *  mutation**. `update` runs the decision and, only on an offer, installs
 *  through the File Corpus lifecycle every host already has.
 *
 *  Nothing here fetches bytes, opens a database, or knows a transport. The
 *  manifest arrives through {@link ContentManifestSource}, which each host
 *  wires to its own reachable route; the install is `CorpusSupply.installFrom`,
 *  whose installer already streams, hashes, size-checks, semantically verifies
 *  and atomically swaps — so §10 M9's "digest or size mismatch aborts and
 *  leaves the installed version active" is not re-implemented here, it is
 *  inherited, and the test that proves it drives this service. */

import { Context, Effect, Layer, Option } from 'effect';

import {
  TOPICS_ARTIFACT_GENERATION,
  TOPICS_ARTIFACT_RELEASE,
  TOPICS_SCHEMA_MAJOR,
  type FileArtifactRelease,
} from '../corpus-supply/file-artifact.js';
import { corpusRevision, type CorpusGeneration } from '../corpus-supply/model.js';
import { CorpusSupply } from '../corpus-supply/service.js';
import {
  ContentFloor,
  ContentStatus,
  ContentUpdateOutcome,
  decideUpdate,
  manifestUnavailable,
  type ManifestFetchOutcome,
  type UpdatableCorpus,
} from './model.js';

/** How this host reads the runtime manifest.
 *
 *  A service rather than a parameter because it is the *only* thing that
 *  differs between the three hosts (§10 M9's adapter check), and because a
 *  `Config`-resolvable seam is what lets a test seed a fake manifest without
 *  the service growing a test-only branch. It cannot fail — see
 *  `ManifestFetchOutcome`. */
export interface ContentManifestSourceService {
  readonly read: Effect.Effect<ManifestFetchOutcome>;
}

export class ContentManifestSource extends Context.Service<
  ContentManifestSource,
  ContentManifestSourceService
>()('@bible/core/content-update/ContentManifestSource') {
  /** The host that cannot reach a manifest at all — a build with the runtime
   *  path deliberately off, and the layer every suite that is not testing the
   *  update seam supplies. Reported as `offline`, which is the truth. */
  static Unreachable: Layer.Layer<ContentManifestSource> = Layer.succeed(
    ContentManifestSource,
    ContentManifestSource.of({
      read: Effect.succeed(manifestUnavailable('no manifest source is wired')),
    }),
  );

  /** A fixed manifest outcome. The Config seam's landing point on every host,
   *  and what the desktop e2e seeds. */
  static layerOf = (outcome: ManifestFetchOutcome): Layer.Layer<ContentManifestSource> =>
    Layer.succeed(
      ContentManifestSource,
      ContentManifestSource.of({ read: Effect.succeed(outcome) }),
    );
}

/** What this build compiled against, for the one corpus §3.6's runtime path
 *  updates.
 *
 *  A constant rather than a function over `CorpusFileName`: the surface is
 *  `UpdatableCorpus`, and `UpdatableCorpus` is `'topics'`. The earlier version
 *  took any file corpus and returned the *topics* schema floor for all of them,
 *  which meant `bible` and `vectors` were told a decision computed against a
 *  gate that was not theirs (round-3 F8). Widening `UpdatableCorpus` will make
 *  this a compile error until the new corpus states its own floor, which is
 *  exactly the moment that decision should have to be made.
 *
 *  Both halves come from the pin: `TOPICS_ARTIFACT_RELEASE` for the revision and
 *  `TOPICS_ARTIFACT_GENERATION` for the ordinal a manifest entry is compared
 *  against. Both are `None` until the first content release.
 *
 *  The derivation is a named function rather than an inline literal so a suite
 *  can drive it with a **published** pin — the `Option.some` shape every host
 *  will be in once a release exists, and the shape today's constants cannot
 *  reach (round-4 F7). The floor is what a fresh, offline machine reports, and
 *  a fresh machine is exactly the case that has no installed generation to fall
 *  back on if the derivation is wrong. */
export const compiledFloor = (input: {
  readonly release: Option.Option<FileArtifactRelease>;
  readonly generation: Option.Option<CorpusGeneration>;
  readonly schemaMajor: number;
}): ContentFloor =>
  ContentFloor.make({
    pinned: Option.map(input.release, (release) => corpusRevision(release.revision)),
    pinnedGeneration: input.generation,
    schemaMajor: input.schemaMajor,
  });

const TOPICS_FLOOR: ContentFloor = compiledFloor({
  release: TOPICS_ARTIFACT_RELEASE,
  generation: TOPICS_ARTIFACT_GENERATION,
  schemaMajor: TOPICS_SCHEMA_MAJOR,
});

const floorFor = (corpus: UpdatableCorpus): ContentFloor => {
  switch (corpus) {
    case 'topics':
      return TOPICS_FLOOR;
  }
};

/** What a host does *after* an activation, so its readers serve the new bytes.
 *
 *  §3.6's install ends with an atomic rename over the artifact path. A host that
 *  holds an open `immutable=1` connection is still serving the previous inode at
 *  that point — the update succeeded and the reader did not notice (round-3 F3).
 *  Reopening is the host's job, because only the host knows which services hold
 *  which handles, but *invoking* it is this service's job: an install whose
 *  effect is not visible until the app restarts is not the update §3.6 describes.
 *
 *  It cannot fail. A reload that could not reopen leaves the previous generation
 *  serving, which is the same stale-fallback posture the installer takes — a
 *  host whose content was working keeps working, and turning that into an error
 *  would make a caller catch a failure to learn that nothing broke.
 *
 *  A service rather than a callback parameter so a host wires it where it wires
 *  everything else, and so a host that has nothing to reload says so
 *  (`Inert`) rather than by omission. */
export interface ContentActivationService {
  readonly onActivated: (corpus: UpdatableCorpus) => Effect.Effect<void>;
}

export class ContentActivation extends Context.Service<
  ContentActivation,
  ContentActivationService
>()('@bible/core/content-update/ContentActivation') {
  /** The host with nothing to reopen: the CLI, whose next command is a new
   *  process, and every suite not testing the reader seam. */
  static Inert: Layer.Layer<ContentActivation> = Layer.succeed(
    ContentActivation,
    ContentActivation.of({
      onActivated: () => Effect.void,
    }),
  );

  static layerOf = (
    onActivated: (corpus: UpdatableCorpus) => Effect.Effect<void>,
  ): Layer.Layer<ContentActivation> =>
    Layer.succeed(ContentActivation, ContentActivation.of({ onActivated }));
}

export interface ContentUpdateService {
  /** What is installed, what the manifest offers, and the decision — with no
   *  mutation of any kind. */
  readonly status: (corpus: UpdatableCorpus) => Effect.Effect<ContentStatus>;
  /** The decision, then the install when it is an offer. Reports the status
   *  *after* the run. */
  readonly update: (corpus: UpdatableCorpus) => Effect.Effect<ContentUpdateOutcome>;
}

export class ContentUpdate extends Context.Service<ContentUpdate, ContentUpdateService>()(
  '@bible/core/content-update/ContentUpdate',
) {
  static Live: Layer.Layer<
    ContentUpdate,
    never,
    CorpusSupply | ContentManifestSource | ContentActivation
  > = Layer.effect(
    ContentUpdate,
    Effect.gen(function* () {
      const supply = yield* CorpusSupply;
      const manifests = yield* ContentManifestSource;
      const activation = yield* ContentActivation;

      /** What this host has verified and activated, read **without installing
       *  anything**.
       *
       *  `CorpusSupply.installed` rather than `ensure`: `ensure` is the
       *  install operation, and asking it "what do you have?" installs from
       *  the first local source whenever the answer is "nothing" — so a
       *  `status` built on it would have made `bible topics status --json`
       *  provision the artifact as a side effect of reporting on it, which is
       *  exactly the hidden mutation §3.6 rules out.
       *
       *  Both the revision and the generation, because the decision compares
       *  on the number and the reader reads the tag. */
      const activeProvenance = (corpus: UpdatableCorpus) => supply.installed(corpus);

      /** One status, over a manifest outcome the caller already has.
       *
       *  The manifest is a parameter rather than read here so `update` can
       *  read it **once** and report against the same answer it acted on. A
       *  second read would let the post-install report disagree with the
       *  install it is reporting on — and on a host whose source is a real
       *  network route, would spend a second round trip to do it. */
      const statusOver = Effect.fn('ContentUpdate.statusOver')(function* (
        corpus: UpdatableCorpus,
        manifest: ManifestFetchOutcome,
      ) {
        const provenance = yield* activeProvenance(corpus);
        const installedGeneration = Option.flatMap(provenance, (active) => active.generation);
        const floor = floorFor(corpus);
        return ContentStatus.make({
          corpus,
          installed: Option.map(provenance, (active) => active.revision),
          installedGeneration,
          floor,
          decision: decideUpdate({
            floor,
            installed: installedGeneration,
            manifest,
            corpus,
          }),
        });
      });

      return ContentUpdate.of({
        status: (corpus) =>
          Effect.flatMap(manifests.read, (manifest) => statusOver(corpus, manifest)),
        update: Effect.fn('ContentUpdate.update')(function* (corpus: UpdatableCorpus) {
          const manifest = yield* manifests.read;
          const before = yield* statusOver(corpus, manifest);
          if (before.decision._tag !== 'offer') {
            return ContentUpdateOutcome.make({ status: before, activated: Option.none() });
          }
          const offered = before.decision.entry;
          // `installFrom`, not `ensure`. `ensure` consults this host's
          // *compiled* source list, so the entry the manifest just offered
          // would never have reached the installer at all — the host would
          // have re-installed whatever its pinned sources already hold and
          // reported the version it started with (round-3 F1). `installFrom`
          // hands the offered release to the recipe's own release-source
          // builder, so the bytes take the identical leg a pinned release
          // takes and every guarantee M9 asks for is inherited: the digest
          // and size are checked against this entry before the semantic
          // verifier opens the candidate, and any failure removes the
          // building file and leaves the active generation untouched.
          const activated = yield* supply
            .installFrom({
              corpus,
              release: {
                url: offered.url,
                revision: offered.revision,
                digest: offered.sha256,
                size: offered.size,
                // Recorded in the installed Provenance, so a later startup can
                // see that what it holds is above the compiled floor.
                generation: Option.some(offered.generation),
              },
            })
            .pipe(
              Effect.map((receipt) =>
                Option.map(
                  Option.fromUndefinedOr(
                    receipt.activated.find((activation) => activation.corpus === corpus),
                  ),
                  (activation) => activation.revision,
                ),
              ),
              // A refused candidate leaves the installed generation active,
              // so the honest report is the post-run status with nothing
              // activated — not a failure the caller has to catch to learn
              // that its working content is still working.
              Effect.catch(() => Effect.succeedNone),
            );
          // The reader reopens *before* the post-run status is read, so a
          // caller that acts on this outcome is already reading the
          // generation it names. A host with nothing to reopen does nothing.
          if (Option.isSome(activated)) yield* activation.onActivated(corpus);
          // The status *after* the run, over the same manifest answer.
          return ContentUpdateOutcome.make({
            status: yield* statusOver(corpus, manifest),
            activated,
          });
        }),
      });
    }),
  );
}
