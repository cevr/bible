import { Effect, Option, Schema } from 'effect';

import { PublicationArchive } from '../writings/archive.js';
import { PublicationId } from '../writings/model.js';

export const AssetSourceId = Schema.NonEmptyString.pipe(Schema.brand('CorpusSupply/AssetSourceId'));
export type AssetSourceId = typeof AssetSourceId.Type;

export const CorpusRevision = Schema.NonEmptyString.pipe(Schema.brand('CorpusSupply/Revision'));
export type CorpusRevision = typeof CorpusRevision.Type;

export const CorpusDigest = Schema.String.pipe(
  Schema.check(Schema.isPattern(/^sha256:[a-f0-9]{64}$/)),
  Schema.brand('CorpusSupply/Digest'),
);
export type CorpusDigest = typeof CorpusDigest.Type;

export class CorpusProvenance extends Schema.Class<CorpusProvenance>('CorpusSupply/Provenance')({
  source: AssetSourceId,
  revision: CorpusRevision,
  digest: Schema.Option(CorpusDigest),
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

export class BibleTarget extends Schema.TaggedClass<BibleTarget>('CorpusSupply/BibleTarget')(
  'bible',
  {},
) {}

export class WritingsTarget extends Schema.TaggedClass<WritingsTarget>(
  'CorpusSupply/WritingsTarget',
)('writings', {
  publications: Schema.optional(Schema.Array(PublicationId)),
}) {}

export const CorpusTarget = Schema.Union([BootstrapTarget, BibleTarget, WritingsTarget]);
export type CorpusTarget = typeof CorpusTarget.Type;

export class CorpusSupplyInput extends Schema.Class<CorpusSupplyInput>('CorpusSupply/Input')({
  target: Schema.optional(CorpusTarget),
  refresh: Schema.optional(Schema.Boolean),
}) {}

export class CorpusActivation extends Schema.Class<CorpusActivation>('CorpusSupply/Activation')({
  corpus: Schema.Literals(['bible', 'writings']),
  identity: Schema.Union([Schema.Literal('canonical'), PublicationId]),
  source: AssetSourceId,
  revision: CorpusRevision,
  installed: Schema.Number.pipe(Schema.check(Schema.isInt(), Schema.isGreaterThanOrEqualTo(0))),
}) {}

export class CorpusSupplyReceipt extends Schema.Class<CorpusSupplyReceipt>('CorpusSupply/Receipt')({
  activated: Schema.Array(CorpusActivation),
  skipped: Schema.Array(Schema.Union([Schema.Literal('canonical'), PublicationId])),
}) {}

export const assetSourceId = Schema.decodeSync(AssetSourceId);
export const corpusRevision = Schema.decodeSync(CorpusRevision);
export const corpusDigest = Schema.decodeSync(CorpusDigest);

export const unknownProvenance = (source: string, revision: string): CorpusProvenance =>
  new CorpusProvenance({
    source: assetSourceId(source),
    revision: corpusRevision(revision),
    digest: Option.none(),
  });

export const provenanceForArchive = Effect.fn('CorpusSupply.provenanceForArchive')(function* (
  source: string,
  revision: string,
  archive: PublicationArchive,
) {
  const encoded = Schema.encodeSync(Schema.fromJsonString(PublicationArchive))(archive);
  const bytes = new TextEncoder().encode(encoded);
  const digest = yield* Effect.tryPromise(() =>
    globalThis.crypto.subtle.digest('SHA-256', bytes),
  ).pipe(Effect.orDie);
  const hex = [...new Uint8Array(digest)]
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
  return new CorpusProvenance({
    source: assetSourceId(source),
    revision: corpusRevision(revision),
    digest: Option.some(corpusDigest(`sha256:${hex}`)),
  });
});

export const Target = {
  bootstrap: (): BootstrapTarget => new BootstrapTarget({}),
  bible: (): BibleTarget => new BibleTarget({}),
  writings: (publications?: readonly PublicationId[]): WritingsTarget =>
    new WritingsTarget({ publications }),
} as const;
