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
  Schema.Struct({ type: Schema.Literal('init'), id: RequestId }),
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
  Schema.Struct({ type: Schema.Literal('export-state'), id: RequestId }),
  Schema.Struct({ type: Schema.Literal('is-dirty'), id: RequestId }),
  Schema.Struct({
    type: Schema.Literal('sync-book'),
    id: RequestId,
    bookCode: Schema.NonEmptyString,
  }),
  Schema.Struct({ type: Schema.Literal('get-egw-sync-status'), id: RequestId }),
  Schema.Struct({ type: Schema.Literal('sync-full-egw'), id: RequestId }),
  Schema.Struct({ type: Schema.Literal('init-topics'), id: RequestId }),
]);
export type WorkerRequest = typeof WorkerRequestSchema.Type;
export type WorkerRequestPayload = WorkerRequest extends infer Request
  ? Request extends { readonly id: number }
    ? Omit<Request, 'id'>
    : never
  : never;

export const SyncStatus = Schema.Struct({
  bookCode: Schema.NonEmptyString,
  status: Schema.NonEmptyString,
  paragraphCount: Integer.pipe(Schema.check(Schema.isGreaterThanOrEqualTo(0))),
});
export type SyncStatus = typeof SyncStatus.Type;

export const WorkerResponseSchema = Schema.Union([
  Schema.Struct({
    type: Schema.Literal('init-progress'),
    id: RequestId,
    stage: Schema.String,
    progress: Progress,
  }),
  Schema.Struct({ type: Schema.Literal('init-complete'), id: RequestId }),
  Schema.Struct({ type: Schema.Literal('init-error'), id: RequestId, error: Schema.String }),
  Schema.Struct({ type: Schema.Literal('query-result'), id: RequestId, rows: Schema.Array(Row) }),
  Schema.Struct({ type: Schema.Literal('query-error'), id: RequestId, error: Schema.String }),
  Schema.Struct({ type: Schema.Literal('exec-result'), id: RequestId, changes: Integer }),
  Schema.Struct({ type: Schema.Literal('exec-error'), id: RequestId, error: Schema.String }),
  Schema.Struct({
    type: Schema.Literal('export-state-result'),
    id: RequestId,
    data: Schema.instanceOf(globalThis.ArrayBuffer),
  }),
  Schema.Struct({
    type: Schema.Literal('export-state-error'),
    id: RequestId,
    error: Schema.String,
  }),
  Schema.Struct({ type: Schema.Literal('is-dirty-result'), id: RequestId, dirty: Schema.Boolean }),
  Schema.Struct({
    type: Schema.Literal('sync-book-progress'),
    id: ResponseId,
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
  Schema.Struct({
    type: Schema.Literal('egw-sync-status-result'),
    id: RequestId,
    books: Schema.Array(SyncStatus),
  }),
  Schema.Struct({
    type: Schema.Literal('egw-sync-status-error'),
    id: RequestId,
    error: Schema.String,
  }),
  Schema.Struct({
    type: Schema.Literal('sync-full-egw-progress'),
    id: RequestId,
    stage: Schema.String,
    progress: Progress,
  }),
  Schema.Struct({ type: Schema.Literal('sync-full-egw-result'), id: RequestId }),
  Schema.Struct({
    type: Schema.Literal('sync-full-egw-error'),
    id: RequestId,
    error: Schema.String,
  }),
  Schema.Struct({
    type: Schema.Literal('init-topics-progress'),
    id: RequestId,
    stage: Schema.String,
    progress: Progress,
  }),
  Schema.Struct({ type: Schema.Literal('init-topics-complete'), id: RequestId }),
  Schema.Struct({
    type: Schema.Literal('init-topics-error'),
    id: RequestId,
    error: Schema.String,
  }),
]);
export type WorkerResponse = typeof WorkerResponseSchema.Type;

export const decodeWorkerRequest = Schema.decodeUnknownSync(WorkerRequestSchema);
export const decodeWorkerResponse = Schema.decodeUnknownSync(WorkerResponseSchema);

export function makeWorkerRequest(id: number, payload: WorkerRequestPayload): WorkerRequest {
  return decodeWorkerRequest({ ...payload, id });
}
