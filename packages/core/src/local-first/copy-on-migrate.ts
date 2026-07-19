import { Effect, Schema } from 'effect';

import type {
  LegacyMigrationReceipt,
  MigrationDiagnostic,
  MigrationSemanticCount,
  MigrationSourceId,
} from './legacy-migration.js';
import type { DomainMutationCommand, MutationId, Timestamp } from './model.js';
import type { SyncStore, SyncStoreError } from './sync-store.js';

export class CopyOnMigrateError extends Schema.TaggedErrorClass<CopyOnMigrateError>()(
  'CopyOnMigrateError',
  {
    operation: Schema.String,
    message: Schema.String,
    cause: Schema.optional(Schema.Unknown),
  },
) {}

export interface LegacySourceProjection {
  readonly sourceId: MigrationSourceId;
  readonly fingerprint: string;
  readonly commands: ReadonlyArray<DomainMutationCommand>;
  readonly diagnostics: ReadonlyArray<MigrationDiagnostic>;
  readonly semanticCounts: ReadonlyArray<MigrationSemanticCount>;
}

export interface CanonicalGeneration {
  readonly store: SyncStore;
  readonly close: Effect.Effect<void, CopyOnMigrateError>;
}

/** Host boundary for filesystem, OPFS, or another atomic activation mechanism. */
export interface CanonicalGenerationAdapter {
  readonly activeGeneration: Effect.Effect<string | undefined, CopyOnMigrateError>;
  readonly discardInactive: (
    activeGeneration: string | undefined,
  ) => Effect.Effect<void, CopyOnMigrateError>;
  readonly create: (generation: string) => Effect.Effect<CanonicalGeneration, CopyOnMigrateError>;
  readonly open: (generation: string) => Effect.Effect<CanonicalGeneration, CopyOnMigrateError>;
  readonly verify: (
    generation: CanonicalGeneration,
    expected: ReadonlyArray<LegacyMigrationReceipt>,
  ) => Effect.Effect<void, CopyOnMigrateError>;
  readonly activate: (generation: string) => Effect.Effect<void, CopyOnMigrateError>;
}

export interface CopyOnMigrateOptions {
  readonly generation: string;
  readonly sources: ReadonlyArray<LegacySourceProjection>;
  readonly adapter: CanonicalGenerationAdapter;
  readonly mutationId: (sourceId: MigrationSourceId, index: number) => MutationId;
  readonly mutationTimestamp: (sourceId: MigrationSourceId, index: number) => Timestamp;
  readonly completedAt: Timestamp;
}

export interface CopyOnMigrateResult {
  readonly generation: string;
  readonly activated: boolean;
  readonly receipts: ReadonlyArray<LegacyMigrationReceipt>;
}

const closeGeneration = (generation: CanonicalGeneration): Effect.Effect<void> =>
  generation.close.pipe(Effect.ignore);

const receiptMatches = (
  actual: LegacyMigrationReceipt | undefined,
  expected: LegacyMigrationReceipt,
): boolean => {
  if (actual === undefined) return false;
  if (
    actual.sourceId !== expected.sourceId ||
    actual.fingerprint !== expected.fingerprint ||
    actual.generation !== expected.generation ||
    actual.mutationCount !== expected.mutationCount ||
    actual.diagnosticCount !== expected.diagnosticCount ||
    actual.completedAt !== expected.completedAt ||
    actual.semanticCounts.length !== expected.semanticCounts.length
  )
    return false;
  return actual.semanticCounts.every((count, index) => {
    const wanted = expected.semanticCounts[index];
    return wanted !== undefined && count.entity === wanted.entity && count.count === wanted.count;
  });
};

const verifyReceipts = (
  generation: CanonicalGeneration,
  expected: ReadonlyArray<LegacyMigrationReceipt>,
): Effect.Effect<void, CopyOnMigrateError | SyncStoreError> =>
  Effect.forEach(expected, (receipt) => generation.store.migrationReceipt(receipt.sourceId)).pipe(
    Effect.flatMap((actual) => {
      const mismatch = actual.findIndex((receipt, index) => {
        const wanted = expected[index];
        return wanted === undefined || !receiptMatches(receipt, wanted);
      });
      if (mismatch === -1) return Effect.void;
      return Effect.fail(
        new CopyOnMigrateError({
          operation: 'verify-receipts',
          message: `canonical generation receipt ${String(mismatch)} did not survive reopen`,
        }),
      );
    }),
  );

export const copyOnMigrate = Effect.fn('LocalFirst.copyOnMigrate')(
  (options: CopyOnMigrateOptions): Effect.Effect<CopyOnMigrateResult, CopyOnMigrateError> =>
    Effect.gen(function* () {
      const active = yield* options.adapter.activeGeneration;
      if (active === options.generation) {
        return { generation: active, activated: false, receipts: [] };
      }

      yield* options.adapter.discardInactive(active);
      const target = yield* options.adapter.create(options.generation);
      const receipts = yield* Effect.forEach(options.sources, (source) =>
        target.store
          .importLegacy({
            sourceId: source.sourceId,
            fingerprint: source.fingerprint,
            generation: options.generation,
            items: source.commands.map((command, index) => ({
              mutationId: options.mutationId(source.sourceId, index),
              command,
              createdAt: options.mutationTimestamp(source.sourceId, index),
            })),
            diagnostics: source.diagnostics,
            semanticCounts: source.semanticCounts,
            completedAt: options.completedAt,
          })
          .pipe(Effect.map((result) => result.receipt)),
      ).pipe(
        Effect.tapError(() => closeGeneration(target)),
        Effect.mapError(
          (cause) =>
            new CopyOnMigrateError({
              operation: 'import',
              message: 'canonical generation import failed',
              cause,
            }),
        ),
      );
      yield* target.close;

      const reopened = yield* options.adapter.open(options.generation);
      yield* verifyReceipts(reopened, receipts).pipe(
        Effect.andThen(options.adapter.verify(reopened, receipts)),
        Effect.ensuring(closeGeneration(reopened)),
        Effect.mapError(
          (cause) =>
            new CopyOnMigrateError({
              operation: 'verify',
              message: 'canonical generation verification failed',
              cause,
            }),
        ),
      );

      yield* options.adapter.activate(options.generation);
      return { generation: options.generation, activated: true, receipts };
    }),
);
