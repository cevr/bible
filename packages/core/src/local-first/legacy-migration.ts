import { Schema } from 'effect';

import { DomainMutationCommand, MutationId, Timestamp } from './model.js';

export const MigrationSourceId = Schema.NonEmptyString.pipe(
  Schema.brand('LocalFirst/MigrationSourceId'),
);
export type MigrationSourceId = typeof MigrationSourceId.Type;

export const MigrationDiagnosticId = Schema.NonEmptyString.pipe(
  Schema.brand('LocalFirst/MigrationDiagnosticId'),
);
export type MigrationDiagnosticId = typeof MigrationDiagnosticId.Type;

export const MigrationDiagnostic = Schema.Struct({
  id: MigrationDiagnosticId,
  path: Schema.NonEmptyString,
  category: Schema.Literals(['malformed', 'out-of-range', 'ambiguous', 'quarantined', 'discarded']),
  message: Schema.NonEmptyString,
});
export type MigrationDiagnostic = typeof MigrationDiagnostic.Type;

export const MigrationSemanticCount = Schema.Struct({
  entity: Schema.NonEmptyString,
  count: Schema.Int.pipe(Schema.check(Schema.isGreaterThanOrEqualTo(0))),
});
export type MigrationSemanticCount = typeof MigrationSemanticCount.Type;

export const LegacyMigrationItem = Schema.Struct({
  mutationId: MutationId,
  command: DomainMutationCommand,
  createdAt: Timestamp,
});
export type LegacyMigrationItem = typeof LegacyMigrationItem.Type;

export const LegacyMigrationBatch = Schema.Struct({
  sourceId: MigrationSourceId,
  fingerprint: Schema.NonEmptyString,
  generation: Schema.NonEmptyString,
  items: Schema.Array(LegacyMigrationItem),
  diagnostics: Schema.Array(MigrationDiagnostic),
  semanticCounts: Schema.Array(MigrationSemanticCount),
  completedAt: Timestamp,
});
export type LegacyMigrationBatch = typeof LegacyMigrationBatch.Type;

export const LegacyMigrationReceipt = Schema.Struct({
  sourceId: MigrationSourceId,
  fingerprint: Schema.NonEmptyString,
  generation: Schema.NonEmptyString,
  mutationCount: Schema.Int.pipe(Schema.check(Schema.isGreaterThanOrEqualTo(0))),
  diagnosticCount: Schema.Int.pipe(Schema.check(Schema.isGreaterThanOrEqualTo(0))),
  semanticCounts: Schema.Array(MigrationSemanticCount),
  completedAt: Timestamp,
});
export type LegacyMigrationReceipt = typeof LegacyMigrationReceipt.Type;

export interface LegacyMigrationResult {
  readonly imported: boolean;
  readonly receipt: LegacyMigrationReceipt;
}
