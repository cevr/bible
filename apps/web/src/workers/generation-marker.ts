const DATABASE_NAME = 'bible-user-state-metadata';
const STORE_NAME = 'runtime';
const ACTIVE_GENERATION_KEY = 'active-generation';

export interface GenerationMarkerStore {
  readonly read: () => Effect.Effect<string | undefined, unknown>;
  readonly write: (generation: string) => Effect.Effect<void, unknown>;
}

export interface GenerationMarkerOperations {
  readonly read: (key: string) => Effect.Effect<string | undefined, unknown>;
  readonly write: (key: string, value: string) => Effect.Effect<void, unknown>;
}

export interface GenerationRegistry {
  readonly active: string | undefined;
  readonly managed: readonly string[];
}

export interface GenerationRegistryStore {
  readonly read: () => Effect.Effect<GenerationRegistry, unknown>;
  readonly write: (registry: GenerationRegistry) => Effect.Effect<void, unknown>;
}

export const makeGenerationMarkerStore = (
  operations: GenerationMarkerOperations,
  key = ACTIVE_GENERATION_KEY,
): GenerationMarkerStore => ({
  read: () => operations.read(key),
  write: (generation) => operations.write(key, generation),
});

const requestResult = <A>(request: IDBRequest<A>): Effect.Effect<A, unknown> =>
  Effect.callback((resume) => {
    request.onsuccess = () => resume(Effect.succeed(request.result));
    request.onerror = () => resume(Effect.fail(request.error));
  });

const transactionComplete = (transaction: IDBTransaction): Effect.Effect<void, unknown> =>
  Effect.callback((resume) => {
    transaction.oncomplete = () => resume(Effect.void);
    transaction.onerror = () => resume(Effect.fail(transaction.error));
    transaction.onabort = () => resume(Effect.fail(transaction.error));
  });

const openDatabase = (databaseName: string): Effect.Effect<IDBDatabase, unknown> =>
  Effect.suspend(() => {
    const request = indexedDB.open(databaseName, 1);
    request.onupgradeneeded = () => {
      const database = request.result;
      if (!database.objectStoreNames.contains(STORE_NAME)) database.createObjectStore(STORE_NAME);
    };
    return requestResult(request);
  });

const withDatabase = <A>(
  databaseName: string,
  use: (database: IDBDatabase) => Effect.Effect<A, unknown>,
): Effect.Effect<A, unknown> =>
  Effect.acquireUseRelease(openDatabase(databaseName), use, (database) =>
    Effect.sync(() => database.close()),
  );

export const makeIndexedDbGenerationMarkerStore = (options?: {
  readonly databaseName?: string;
  readonly key?: string;
}): GenerationMarkerStore => {
  let databaseName = DATABASE_NAME;
  if (options?.databaseName !== undefined) databaseName = options.databaseName;
  return makeGenerationMarkerStore(
    {
      read: (key) =>
        withDatabase(databaseName, (database) => {
          const transaction = database.transaction(STORE_NAME, 'readonly');
          return requestResult(transaction.objectStore(STORE_NAME).get(key)).pipe(
            Effect.tap(() => transactionComplete(transaction)),
            Effect.map((value) => {
              if (typeof value === 'string') return value;
              return undefined;
            }),
          );
        }),
      write: (key, value) =>
        withDatabase(databaseName, (database) => {
          const transaction = database.transaction(STORE_NAME, 'readwrite', {
            durability: 'strict',
          });
          transaction.objectStore(STORE_NAME).put(value, key);
          return transactionComplete(transaction);
        }),
    },
    options?.key,
  );
};

const isGenerationRegistry = (value: unknown): value is GenerationRegistry =>
  typeof value === 'object' &&
  value !== null &&
  'managed' in value &&
  Array.isArray(value.managed) &&
  value.managed.every((generation) => typeof generation === 'string') &&
  (!('active' in value) || value.active === undefined || typeof value.active === 'string');

/** Durable inventory for a generation family. A legacy string marker is migrated on read. */
export const makeIndexedDbGenerationRegistryStore = (options: {
  readonly databaseName: string;
  readonly key: string;
}): GenerationRegistryStore => ({
  read: () =>
    withDatabase(options.databaseName, (database) => {
      const transaction = database.transaction(STORE_NAME, 'readonly');
      return requestResult(transaction.objectStore(STORE_NAME).get(options.key)).pipe(
        Effect.tap(() => transactionComplete(transaction)),
        Effect.map((value) => {
          if (typeof value === 'string') return { active: value, managed: [value] };
          if (isGenerationRegistry(value)) return value;
          return { active: undefined, managed: [] };
        }),
      );
    }),
  write: (registry) =>
    withDatabase(options.databaseName, (database) => {
      const transaction = database.transaction(STORE_NAME, 'readwrite', {
        durability: 'strict',
      });
      transaction.objectStore(STORE_NAME).put(registry, options.key);
      return transactionComplete(transaction);
    }),
});
import { Effect } from 'effect';
