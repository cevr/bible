import { Effect, Exit, Option, Schema } from 'effect';

import { PublicationArchive } from '../writings/archive.js';
import { PublicationId } from '../writings/model.js';

/** The corpora installed as one verified file: a pinned manifest, a digest, a
 *  semantic verifier, an atomic swap. `makeFileCorpusArtifact` is parameterized
 *  by this vocabulary, so adding a file corpus adds a name here and nothing
 *  else to the lifecycle. */
export const CorpusFileName = Schema.Literals(['bible', 'topics', 'vectors']);
export type CorpusFileName = typeof CorpusFileName.Type;

/** The corpora installed per publication through a SQL transaction rather than
 *  as a replaceable file. */
export const CorpusStreamName = Schema.Literals(['writings']);
export type CorpusStreamName = typeof CorpusStreamName.Type;

/** The closed set of corpora the supply pipeline can install. Extending the
 *  pipeline with a new corpus artifact starts by adding its name to one of the
 *  two vocabularies above — every receipt, activation, and error narrows from
 *  this single union. */
export const CorpusName = Schema.Union([CorpusFileName, CorpusStreamName]);
export type CorpusName = typeof CorpusName.Type;

/** What one Activation or skip refers to: the sole artifact of a File Corpus
 *  or one Writings publication. A File Corpus installs a single artifact, so
 *  `canonical` identifies it whichever corpus it belongs to. */
export const CorpusIdentity = Schema.Union([Schema.Literal('canonical'), PublicationId]);
export type CorpusIdentity = typeof CorpusIdentity.Type;

export const AssetSourceId = Schema.NonEmptyString.pipe(Schema.brand('CorpusSupply/AssetSourceId'));
export type AssetSourceId = typeof AssetSourceId.Type;

export const CorpusRevision = Schema.NonEmptyString.pipe(Schema.brand('CorpusSupply/Revision'));
export type CorpusRevision = typeof CorpusRevision.Type;

export const CorpusDigest = Schema.String.pipe(
  Schema.check(Schema.isPattern(/^sha256:[a-f0-9]{64}$/)),
  Schema.brand('CorpusSupply/Digest'),
);
export type CorpusDigest = typeof CorpusDigest.Type;

/** The monotonic ordinal of one published content version (§3.6).
 *
 *  A revision is a *tag* — `db-v2`, `content-2026-08` — and tags have no order a
 *  publisher and a client could both be trusted to compute. Ordering by tag
 *  string is what let a manifest naming an *older* version read as "different
 *  from installed, therefore newer" and talk a client into a downgrade
 *  (round-3 F2). The generation is the number that carries the order the tag
 *  cannot: the publisher increments it once per release, and a client installs
 *  only above what it holds. */
export const CorpusGeneration = Schema.Int.pipe(
  Schema.check(Schema.isGreaterThanOrEqualTo(0)),
  Schema.brand('CorpusSupply/Generation'),
);
export type CorpusGeneration = typeof CorpusGeneration.Type;

export const corpusGeneration = Schema.decodeSync(CorpusGeneration);

export class CorpusProvenance extends Schema.Class<CorpusProvenance>('CorpusSupply/Provenance')({
  source: AssetSourceId,
  revision: CorpusRevision,
  digest: Schema.Option(CorpusDigest),
  /** The release ordinal these bytes were published under, when they came from
   *  a source that states one.
   *
   *  `None` for every local source — a packaged copy, a workspace build, a
   *  writings publication — because none of them is a *published content
   *  version* and inventing an ordinal for them would put the compiled floor
   *  and a runtime release on one scale they do not share. A runtime install
   *  records the manifest entry's own generation here, which is what makes a
   *  later startup able to see that what it holds is newer than the pin
   *  (round-3 F2). Defaulted so no existing construction site has to state it. */
  generation: Schema.Option(CorpusGeneration).pipe(
    Schema.withConstructorDefault(Effect.succeed(Option.none<CorpusGeneration>())),
  ),
}) {}

export class WritingsContribution extends Schema.Class<WritingsContribution>(
  'CorpusSupply/WritingsContribution',
)({
  provenance: CorpusProvenance,
  archive: PublicationArchive,
}) {}

export class BootstrapTarget extends Schema.TaggedClass<BootstrapTarget>(
  'CorpusSupply/BootstrapTarget',
)('bootstrap', {}) {}

/** Ensure one File Corpus. The corpus name is a field rather than a tag so a
 *  new file corpus widens `CorpusFileName` alone. */
export class FileCorpusTarget extends Schema.TaggedClass<FileCorpusTarget>(
  'CorpusSupply/FileCorpusTarget',
)('file', {
  corpus: CorpusFileName,
}) {}

export class WritingsTarget extends Schema.TaggedClass<WritingsTarget>(
  'CorpusSupply/WritingsTarget',
)('writings', {
  publications: Schema.optional(Schema.Array(PublicationId)),
}) {}

export const CorpusTarget = Schema.Union([BootstrapTarget, FileCorpusTarget, WritingsTarget]);
export type CorpusTarget = typeof CorpusTarget.Type;

export class CorpusSupplyInput extends Schema.Class<CorpusSupplyInput>('CorpusSupply/Input')({
  target: Schema.optional(CorpusTarget),
  refresh: Schema.optional(Schema.Boolean),
}) {}

export class CorpusActivation extends Schema.Class<CorpusActivation>('CorpusSupply/Activation')({
  corpus: CorpusName,
  identity: CorpusIdentity,
  source: AssetSourceId,
  revision: CorpusRevision,
  installed: Schema.Finite.pipe(Schema.check(Schema.isInt(), Schema.isGreaterThanOrEqualTo(0))),
}) {}

export class CorpusSupplyReceipt extends Schema.Class<CorpusSupplyReceipt>('CorpusSupply/Receipt')({
  activated: Schema.Array(CorpusActivation),
  skipped: Schema.Array(CorpusIdentity),
}) {}

const decodeCorpusName = Schema.decodeUnknownExit(CorpusName);

/** Narrows any corpus name to the receipt vocabulary. A host adapter is
 *  parameterized by an arbitrary corpus name so a test can drive it with a
 *  corpus that is deliberately unregistered; only a registered name is allowed
 *  to decorate an error the pipeline surfaces. */
export const registeredCorpusName = (corpus: string): Option.Option<CorpusName> =>
  Exit.match(decodeCorpusName(corpus), {
    onFailure: () => Option.none(),
    onSuccess: Option.some,
  });

export const assetSourceId = Schema.decodeSync(AssetSourceId);
export const corpusRevision = Schema.decodeSync(CorpusRevision);
export const corpusDigest = Schema.decodeSync(CorpusDigest);

export const unknownProvenance = (source: string, revision: string): CorpusProvenance =>
  CorpusProvenance.make({
    source: assetSourceId(source),
    revision: corpusRevision(revision),
    digest: Option.none(),
  });

export const provenanceForArchive = Effect.fn('CorpusSupply.provenanceForArchive')(function* (
  source: string,
  revision: string,
  archive: PublicationArchive,
) {
  const encoded = yield* Schema.encodeEffect(Schema.fromJsonString(PublicationArchive))(archive);
  const bytes = new TextEncoder().encode(encoded);
  const digest = yield* Effect.tryPromise(() => globalThis.crypto.subtle.digest('SHA-256', bytes));
  const hex = [...new Uint8Array(digest)]
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
  return CorpusProvenance.make({
    source: assetSourceId(source),
    revision: corpusRevision(revision),
    digest: Option.some(corpusDigest(`sha256:${hex}`)),
  });
}, Effect.orDie);

export const Target = {
  bootstrap: (): BootstrapTarget => BootstrapTarget.make({}),
  file: (corpus: CorpusFileName): FileCorpusTarget => FileCorpusTarget.make({ corpus }),
  bible: (): FileCorpusTarget => FileCorpusTarget.make({ corpus: 'bible' }),
  topics: (): FileCorpusTarget => FileCorpusTarget.make({ corpus: 'topics' }),
  vectors: (): FileCorpusTarget => FileCorpusTarget.make({ corpus: 'vectors' }),
  writings: (publications?: readonly PublicationId[]): WritingsTarget =>
    WritingsTarget.make({ publications }),
};
