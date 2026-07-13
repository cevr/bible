import { Effect, Layer, Ref, Context, Schema } from 'effect';
import { DbClientService, type DatabaseQueryError, type WorkerError } from '../db-client-service';

export class SyncError extends Schema.TaggedErrorClass<SyncError>()('SyncError', {
  cause: Schema.Unknown,
  message: Schema.String,
  statusCode: Schema.optional(Schema.Number),
}) {}

const SYNC_DEBOUNCE_MS = 30_000;

const SyncMetaRow = Schema.Struct({ device_id: Schema.String });

interface WebSyncServiceShape {
  readonly syncNow: () => Effect.Effect<void, SyncError>;
}

export class WebSyncService extends Context.Service<WebSyncService, WebSyncServiceShape>()(
  '@bible-web/Sync',
) {
  static Live = Layer.effect(
    WebSyncService,
    Effect.gen(function* () {
      const db = yield* DbClientService;
      const syncingRef = yield* Ref.make(false);
      const deviceIdRef = yield* Ref.make<string | null>(null);

      // Plain mutable state for timer — must be synchronous from onExec callback
      let timer: ReturnType<typeof setTimeout> | null = null;

      const ensureDeviceId = Effect.gen(function* () {
        const cached = yield* Ref.get(deviceIdRef);
        if (cached) return cached;

        const rows = yield* db.query(
          SyncMetaRow,
          'state',
          'SELECT device_id FROM sync_meta WHERE id = 1',
        );

        const firstRow = rows[0];
        if (firstRow !== undefined) {
          const id = firstRow.device_id;
          yield* Ref.set(deviceIdRef, id);
          return id;
        }

        const id = crypto.randomUUID();
        yield* db.exec('INSERT INTO sync_meta (id, device_id) VALUES (1, ?)', [id]);
        yield* Ref.set(deviceIdRef, id);
        return id;
      });

      const doSync = Effect.gen(function* () {
        const isSyncing = yield* Ref.get(syncingRef);
        if (isSyncing) return;

        yield* Ref.set(syncingRef, true);

        yield* Effect.ensuring(
          Effect.gen(function* () {
            const dirty = yield* db.isDirty();
            if (!dirty) return;

            const id = yield* ensureDeviceId;
            const blob = yield* db.exportState();

            const res = yield* Effect.tryPromise({
              try: () =>
                fetch('/api/sync/state', {
                  method: 'POST',
                  headers: { 'X-Device-Id': id },
                  body: blob,
                }),
              catch: (cause) =>
                new SyncError({
                  cause,
                  message: 'Sync upload failed',
                }),
            });

            if (!res.ok) {
              yield* Effect.logWarning(`[sync] upload failed: ${res.status} ${res.statusText}`);
              return;
            }

            yield* db.exec('UPDATE sync_meta SET last_synced_at = ? WHERE id = 1', [Date.now()]);
          }),
          Ref.set(syncingRef, false),
        );
      });

      function resetTimer() {
        if (timer != null) clearTimeout(timer);
        timer = setTimeout(() => {
          Effect.runFork(
            doSync.pipe(
              Effect.catch((error) =>
                Effect.logWarning('[sync] error:', error).pipe(Effect.as(undefined)),
              ),
            ),
          );
        }, SYNC_DEBOUNCE_MS);
      }

      // Start: listen for exec events
      db.onExec(resetTimer);

      // Cleanup on scope disposal
      yield* Effect.addFinalizer(() =>
        Effect.sync(() => {
          if (timer != null) {
            clearTimeout(timer);
            timer = null;
          }
        }),
      );

      const mapSyncError = (
        operation: string,
        effect: Effect.Effect<void, DatabaseQueryError | WorkerError | SyncError>,
      ) =>
        effect.pipe(
          Effect.mapError((cause) =>
            cause._tag === 'SyncError'
              ? cause
              : new SyncError({ cause, message: `${operation} failed` }),
          ),
        );

      return WebSyncService.of({
        syncNow: () =>
          mapSyncError(
            'Sync',
            Effect.gen(function* () {
              if (timer != null) {
                clearTimeout(timer);
                timer = null;
              }
              yield* doSync;
            }),
          ),
      });
    }),
  );
}
