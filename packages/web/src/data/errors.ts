import { Schema } from 'effect';

export class WorkerError extends Schema.TaggedErrorClass<WorkerError>()('WorkerError', {
  cause: Schema.Unknown,
  message: Schema.String,
  operation: Schema.String,
}) {}

export class SyncError extends Schema.TaggedErrorClass<SyncError>()('SyncError', {
  cause: Schema.Unknown,
  message: Schema.String,
  statusCode: Schema.optional(Schema.Number),
}) {}

export class DatabaseQueryError extends Schema.TaggedErrorClass<DatabaseQueryError>()(
  'DatabaseQueryError',
  {
    cause: Schema.Unknown,
    operation: Schema.String,
  },
) {}

export class RecordNotFoundError extends Schema.TaggedErrorClass<RecordNotFoundError>()(
  'RecordNotFoundError',
  {
    entity: Schema.String,
    id: Schema.String,
  },
) {}
