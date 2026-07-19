import { Schema } from 'effect';

import { ChangeSet } from '../local-first/model.js';

export const ProtocolVersion = Schema.Number.pipe(
  Schema.check(Schema.isInt(), Schema.isGreaterThan(0)),
  Schema.brand('Procedure/ProtocolVersion'),
);
export type ProtocolVersion = typeof ProtocolVersion.Type;

export const RuntimeSchemaVersion = Schema.Number.pipe(
  Schema.check(Schema.isInt(), Schema.isGreaterThan(0)),
  Schema.brand('Procedure/RuntimeSchemaVersion'),
);
export type RuntimeSchemaVersion = typeof RuntimeSchemaVersion.Type;

export const RuntimeGeneration = Schema.NonEmptyString.pipe(
  Schema.brand('Procedure/RuntimeGeneration'),
);
export type RuntimeGeneration = typeof RuntimeGeneration.Type;

export const CommitId = Schema.NonEmptyString.pipe(Schema.brand('Procedure/CommitId'));
export type CommitId = typeof CommitId.Type;

export const OperationId = Schema.NonEmptyString.pipe(Schema.brand('Procedure/OperationId'));
export type OperationId = typeof OperationId.Type;

export const RuntimeEventSequence = Schema.Number.pipe(
  Schema.check(Schema.isInt(), Schema.isGreaterThanOrEqualTo(0)),
  Schema.brand('Procedure/RuntimeEventSequence'),
);
export type RuntimeEventSequence = typeof RuntimeEventSequence.Type;

export const CURRENT_PROTOCOL_VERSION = Schema.decodeSync(ProtocolVersion)(1);
export const CURRENT_RUNTIME_SCHEMA_VERSION = Schema.decodeSync(RuntimeSchemaVersion)(1);

export const RuntimeCapability = Schema.Literals([
  'external-links',
  'file-import',
  'file-export',
  'notifications',
  'window-controls',
]);
export type RuntimeCapability = typeof RuntimeCapability.Type;

export class RuntimeConnection extends Schema.Class<RuntimeConnection>('RuntimeConnection')({
  protocolVersion: ProtocolVersion,
  schemaVersion: RuntimeSchemaVersion,
  generation: RuntimeGeneration,
  capabilities: Schema.Array(RuntimeCapability),
}) {}

export class IncompatibleRuntimeError extends Schema.TaggedErrorClass<IncompatibleRuntimeError>()(
  'IncompatibleRuntimeError',
  {
    expectedProtocolVersion: ProtocolVersion,
    actualProtocolVersion: ProtocolVersion,
    expectedSchemaVersion: RuntimeSchemaVersion,
    actualSchemaVersion: RuntimeSchemaVersion,
  },
) {}

export class ProcedureError extends Schema.TaggedErrorClass<ProcedureError>()('ProcedureError', {
  procedure: Schema.NonEmptyString,
  code: Schema.NonEmptyString,
  message: Schema.NonEmptyString,
}) {}

export const MutationCommit = <Value extends Schema.Top>(value: Value) =>
  Schema.Struct({
    _tag: Schema.Literal('MutationCommit'),
    value,
    commitId: CommitId,
    changes: ChangeSet,
  });

export interface MutationCommitValue<Value> {
  readonly _tag: 'MutationCommit';
  readonly value: Value;
  readonly commitId: CommitId;
  readonly changes: ChangeSet;
}

export const RuntimeProgress = Schema.TaggedStruct('RuntimeProgress', {
  sequence: RuntimeEventSequence,
  operationId: OperationId,
  completed: Schema.Number.pipe(Schema.check(Schema.isGreaterThanOrEqualTo(0))),
  total: Schema.optional(Schema.Number.pipe(Schema.check(Schema.isGreaterThanOrEqualTo(0)))),
  message: Schema.optional(Schema.NonEmptyString),
});

export const RuntimeSyncStatus = Schema.TaggedStruct('RuntimeSyncStatus', {
  sequence: RuntimeEventSequence,
  state: Schema.Literals(['offline', 'idle', 'pushing', 'pulling', 'failed']),
  message: Schema.optional(Schema.NonEmptyString),
});

export const RuntimeCommitted = Schema.TaggedStruct('RuntimeCommitted', {
  sequence: RuntimeEventSequence,
  commitId: CommitId,
  changes: ChangeSet,
});

export const RuntimeEvent = Schema.Union([RuntimeProgress, RuntimeSyncStatus, RuntimeCommitted]);
export type RuntimeEvent = typeof RuntimeEvent.Type;
