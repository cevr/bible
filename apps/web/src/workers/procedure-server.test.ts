import { makeBunSyncStore, makeBunUserDatabase } from '@bible/core/local-first/bun';
import { ClientId, makeSimulatedTransport, MutationId, Timestamp } from '@bible/core/local-first';
import migrationSql from '@bible/core/local-first/migrations/0001_user_state.sql?raw';
import { LibraryEntityId } from '@bible/core/library-state';
import { CommitId, RuntimeGeneration } from '@bible/core/procedure';
import { Database, type SQLQueryBindings } from 'bun:sqlite';
import { describe, expect, it } from 'effect-bun-test';
import { Effect, Fiber, Layer, Option, Schema } from 'effect';

import { SqliteDatabaseError, type SqliteDatabase, type SqliteRow } from './sqlite-database.js';
import { startWebProcedureHost } from './procedure-client.js';
import type { ProcedureWorkerEndpoint } from './procedure-worker-protocol.js';
import { layerProcedureServer } from './procedure-server.js';

const SqlRows = Schema.Array(Schema.Record(Schema.String, Schema.Unknown));
const decodeRows = Schema.decodeUnknownSync(SqlRows);

const databaseFailure = (operation: string, cause: unknown): SqliteDatabaseError =>
  SqliteDatabaseError.make({ operation, filename: ':memory:', cause });

const makeDatabase = (client: Database): SqliteDatabase => ({
  isOpen: true,
  open: () => Effect.void,
  close: Effect.void,
  exec: (sql) =>
    Effect.try({
      try: () => client.exec(sql),
      catch: (cause) => databaseFailure('exec', cause),
    }).pipe(Effect.asVoid),
  query: (sql, params = []) =>
    Effect.try({
      try: () =>
        decodeRows(
          client.query(sql).all(...(params as SQLQueryBindings[])),
        ) as readonly SqliteRow[],
      catch: (cause) => databaseFailure('query', cause),
    }),
  values: (sql, params = []) =>
    Effect.try({
      try: () => client.query(sql).values(...(params as SQLQueryBindings[])),
      catch: (cause) => databaseFailure('values', cause),
    }),
  write: (sql, params = []) =>
    Effect.try({
      try: () => client.query(sql).run(...(params as SQLQueryBindings[])).changes,
      catch: (cause) => databaseFailure('write', cause),
    }),
});

describe('web procedure server', () => {
  it.scoped('negotiates the shared host over a transferred browser message port', () =>
    Effect.gen(function* () {
      const bibleClient = yield* Effect.acquireRelease(
        Effect.sync(() => new Database(':memory:')),
        (database) => Effect.sync(() => database.close()),
      );
      const writingsClient = yield* Effect.acquireRelease(
        Effect.sync(() => new Database(':memory:')),
        (database) => Effect.sync(() => database.close()),
      );
      const userDatabase = yield* Effect.acquireRelease(
        Effect.sync(() => makeBunUserDatabase()),
        (database) => database.close,
      );
      yield* userDatabase.migrate(migrationSql);
      const clientId = yield* Schema.decodeEffect(ClientId)('web-procedure-test').pipe(
        Effect.orDie,
      );
      let mutationIndex = 0;
      let commitIndex = 0;

      let server: Option.Option<ReturnType<typeof Effect.runFork>> = Option.none();
      yield* Effect.addFinalizer(() =>
        Option.match(server, {
          onNone: () => Effect.void,
          onSome: (fiber) => Fiber.interrupt(fiber),
        }),
      );
      const worker: ProcedureWorkerEndpoint = {
        postMessage: (_message, transfer) => {
          const port = transfer[0];
          const readinessPort = transfer[1];
          if (!(port instanceof MessagePort)) {
            return Effect.runSync(Effect.die(new TypeError('expected procedure message port')));
          }
          if (!(readinessPort instanceof MessagePort)) {
            return Effect.runSync(Effect.die(new TypeError('expected readiness message port')));
          }
          server = Option.some(
            Effect.runFork(
              Layer.launch(
                layerProcedureServer({
                  port,
                  bibleDatabase: makeDatabase(bibleClient),
                  writingsDatabase: makeDatabase(writingsClient),
                  writingsFetch: () =>
                    Effect.runPromise(Effect.die(new TypeError('not used by negotiation'))),
                  runtime: {
                    clientId,
                    store: makeBunSyncStore(userDatabase, clientId),
                    transport: makeSimulatedTransport(),
                    generation: Schema.decodeSync(RuntimeGeneration)('web-procedure-test'),
                    capabilities: ['external-links'],
                    nextMutationId: () =>
                      Schema.decodeSync(MutationId)(`web-mutation-${String(++mutationIndex)}`),
                    nextHistoryId: () =>
                      Schema.decodeSync(LibraryEntityId)(
                        `web-history-${String(mutationIndex + 1)}`,
                      ),
                    nextCommitId: () =>
                      Schema.decodeSync(CommitId)(`web-commit-${String(++commitIndex)}`),
                    now: () => Schema.decodeSync(Timestamp)('2026-07-19T00:00:00.000Z'),
                  },
                }),
              ),
            ),
          );
          readinessPort.postMessage({ type: 'ready' });
        },
      };

      const host = yield* Effect.acquireRelease(
        Effect.tryPromise(() => startWebProcedureHost(worker)),
        (activeHost) => Effect.promise(() => activeHost.dispose()),
      );

      expect(String(host.connection.generation)).toBe('web-procedure-test');
      expect(host.connection.capabilities).toEqual(['external-links']);
    }),
  );
});
