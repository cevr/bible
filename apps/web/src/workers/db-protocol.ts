/** Schema-owned messages shared by the main thread and SQLite worker. */
import { Schema } from 'effect';

const Integer = Schema.Number.pipe(Schema.check(Schema.isInt()));
const RequestId = Integer.pipe(Schema.check(Schema.isGreaterThan(0)));
const ResponseId = Integer.pipe(Schema.check(Schema.isGreaterThanOrEqualTo(0)));
const Progress = Schema.Number.pipe(
  Schema.check(Schema.isGreaterThanOrEqualTo(0), Schema.isLessThanOrEqualTo(100)),
);
const DatabaseName = Schema.Literals(['bible', 'state', 'egw', 'topics']);
const SqlParameters = Schema.optional(Schema.Array(Schema.Unknown));
const Row = Schema.Record(Schema.String, Schema.Unknown);

export const WorkerRequestSchema = Schema.Union([
  Schema.Struct({ type: Schema.Literal('init') }),
  Schema.Struct({
    type: Schema.Literal('query'),
    id: RequestId,
    db: DatabaseName,
    sql: Schema.NonEmptyString,
    params: SqlParameters,
  }),
  Schema.Struct({
    type: Schema.Literal('exec'),
    id: RequestId,
    db: Schema.Literal('state'),
    sql: Schema.NonEmptyString,
    params: SqlParameters,
  }),
  Schema.Struct({ type: Schema.Literal('export-state') }),
  Schema.Struct({ type: Schema.Literal('is-dirty') }),
  Schema.Struct({
    type: Schema.Literal('sync-book'),
    id: RequestId,
    bookCode: Schema.NonEmptyString,
  }),
  Schema.Struct({ type: Schema.Literal('get-egw-sync-status') }),
  Schema.Struct({ type: Schema.Literal('sync-full-egw') }),
  Schema.Struct({ type: Schema.Literal('init-topics') }),
]);
export type WorkerRequest = typeof WorkerRequestSchema.Type;

const SyncStatus = Schema.Struct({
  bookCode: Schema.NonEmptyString,
  status: Schema.NonEmptyString,
  paragraphCount: Integer.pipe(Schema.check(Schema.isGreaterThanOrEqualTo(0))),
});

export const WorkerResponseSchema = Schema.Union([
  Schema.Struct({
    type: Schema.Literal('init-progress'),
    stage: Schema.String,
    progress: Progress,
  }),
  Schema.Struct({ type: Schema.Literal('init-complete') }),
  Schema.Struct({ type: Schema.Literal('init-error'), error: Schema.String }),
  Schema.Struct({ type: Schema.Literal('query-result'), id: RequestId, rows: Schema.Array(Row) }),
  Schema.Struct({ type: Schema.Literal('query-error'), id: RequestId, error: Schema.String }),
  Schema.Struct({ type: Schema.Literal('exec-result'), id: RequestId, changes: Integer }),
  Schema.Struct({ type: Schema.Literal('exec-error'), id: RequestId, error: Schema.String }),
  Schema.Struct({
    type: Schema.Literal('export-state-result'),
    data: Schema.instanceOf(globalThis.ArrayBuffer),
  }),
  Schema.Struct({ type: Schema.Literal('export-state-error'), error: Schema.String }),
  Schema.Struct({ type: Schema.Literal('is-dirty-result'), dirty: Schema.Boolean }),
  Schema.Struct({
    type: Schema.Literal('sync-book-progress'),
    bookCode: Schema.NonEmptyString,
    stage: Schema.String,
    progress: Progress,
  }),
  Schema.Struct({
    type: Schema.Literal('sync-book-result'),
    id: ResponseId,
    bookCode: Schema.NonEmptyString,
    paragraphCount: Integer.pipe(Schema.check(Schema.isGreaterThanOrEqualTo(0))),
  }),
  Schema.Struct({
    type: Schema.Literal('sync-book-error'),
    id: ResponseId,
    bookCode: Schema.NonEmptyString,
    error: Schema.String,
  }),
  Schema.Struct({ type: Schema.Literal('egw-sync-status'), books: Schema.Array(SyncStatus) }),
  Schema.Struct({ type: Schema.Literal('sync-full-egw-result') }),
  Schema.Struct({ type: Schema.Literal('sync-full-egw-error'), error: Schema.String }),
  Schema.Struct({
    type: Schema.Literal('init-topics-progress'),
    stage: Schema.String,
    progress: Progress,
  }),
  Schema.Struct({ type: Schema.Literal('init-topics-complete') }),
  Schema.Struct({ type: Schema.Literal('init-topics-error'), error: Schema.String }),
]);
export type WorkerResponse = typeof WorkerResponseSchema.Type;

export const decodeWorkerRequest = Schema.decodeUnknownSync(WorkerRequestSchema);
export const decodeWorkerResponse = Schema.decodeUnknownSync(WorkerResponseSchema);
