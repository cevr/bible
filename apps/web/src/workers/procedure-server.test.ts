import { describe, expect, test } from 'bun:test';
import { makeBunSyncStore, makeBunUserDatabase } from '@bible/core/local-first/bun';
import { ClientId, makeSimulatedTransport, MutationId, Timestamp } from '@bible/core/local-first';
import { LibraryEntityId } from '@bible/core/library-state';
import { CommitId, RuntimeGeneration } from '@bible/core/procedure';
import { Database } from 'bun:sqlite';
import { Effect, Fiber, Layer, Schema } from 'effect';

import type { SqliteDatabase } from './sqlite-database.js';
import { startWebProcedureHost } from './procedure-client.js';
import type { ProcedureWorkerEndpoint } from './procedure-worker-protocol.js';
import { layerProcedureServer } from './procedure-server.js';

const migrationSql = await Bun.file(
  new URL(
    '../../../../packages/core/src/local-first/migrations/0001_user_state.sql',
    import.meta.url,
  ),
).text();

const SqlRows = Schema.Array(Schema.Record(Schema.String, Schema.Unknown));
const decodeRows = Schema.decodeUnknownSync(SqlRows);

const toBinding = (value: unknown) => {
  if (
    value === null ||
    typeof value === 'string' ||
    typeof value === 'number' ||
    typeof value === 'bigint' ||
    typeof value === 'boolean' ||
    value instanceof Uint8Array
  ) {
    return value;
  }
  throw new TypeError('unsupported SQLite binding');
};

const makeDatabase = (client: Database): SqliteDatabase => ({
  isOpen: true,
  open: () => Promise.resolve(),
  close: () => Promise.resolve(),
  exec: (sql) => {
    client.exec(sql);
    return Promise.resolve();
  },
  query: (sql, params = []) =>
    Promise.resolve(decodeRows(client.query(sql).all(...params.map(toBinding)))),
  values: (sql, params = []) => Promise.resolve(client.query(sql).values(...params.map(toBinding))),
  write: (sql, params = []) =>
    Promise.resolve(client.query(sql).run(...params.map(toBinding)).changes),
});

describe('web procedure server', () => {
  test('negotiates the shared host over a transferred browser message port', async () => {
    const bibleClient = new Database(':memory:');
    const writingsClient = new Database(':memory:');
    const userDatabase = makeBunUserDatabase();
    await Effect.runPromise(userDatabase.migrate(migrationSql));
    const clientId = Schema.decodeSync(ClientId)('web-procedure-test');
    let mutationIndex = 0;
    let commitIndex = 0;

    let server: ReturnType<typeof Effect.runFork> | undefined;
    const worker: ProcedureWorkerEndpoint = {
      postMessage: (_message, transfer) => {
        const port = transfer[0];
        const readinessPort = transfer[1];
        if (!(port instanceof MessagePort)) throw new TypeError('expected procedure message port');
        if (!(readinessPort instanceof MessagePort)) {
          throw new TypeError('expected readiness message port');
        }
        server = Effect.runFork(
          Layer.launch(
            layerProcedureServer({
              port,
              bibleDatabase: makeDatabase(bibleClient),
              writingsDatabase: makeDatabase(writingsClient),
              runtime: {
                clientId,
                store: makeBunSyncStore(userDatabase, clientId),
                transport: makeSimulatedTransport(),
                generation: Schema.decodeSync(RuntimeGeneration)('web-procedure-test'),
                capabilities: ['external-links'],
                nextMutationId: () =>
                  Schema.decodeSync(MutationId)(`web-mutation-${String(++mutationIndex)}`),
                nextHistoryId: () =>
                  Schema.decodeSync(LibraryEntityId)(`web-history-${String(mutationIndex + 1)}`),
                nextCommitId: () =>
                  Schema.decodeSync(CommitId)(`web-commit-${String(++commitIndex)}`),
                now: () => Schema.decodeSync(Timestamp)('2026-07-19T00:00:00.000Z'),
              },
            }),
          ),
        );
        readinessPort.postMessage({ type: 'ready' });
      },
    };

    const host = await startWebProcedureHost(worker);

    expect(String(host.connection.generation)).toBe('web-procedure-test');
    expect(host.connection.capabilities).toEqual(['external-links']);

    await host.dispose();
    if (server !== undefined) await Effect.runPromise(Fiber.interrupt(server));
    await Effect.runPromise(userDatabase.close);
    bibleClient.close();
    writingsClient.close();
  });
});
