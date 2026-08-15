import { Effect, Exit, Option, Predicate, Schema } from 'effect';

const DATABASE_NAME = 'bible-user-state-metadata';
const STORE_NAME = 'runtime';
const ACTIVE_GENERATION_KEY = 'active-generation';

export interface GenerationMarkerStore {
  readonly read: Effect.Effect<Option.Option<string>, unknown>;
  readonly write: (generation: string) => Effect.Effect<void, unknown>;
}

export interface GenerationMarkerOperations {
  readonly read: (key: string) => Effect.Effect<Option.Option<string>, unknown>;
  readonly write: (key: string, value: string) => Effect.Effect<void, unknown>;
}

export interface GenerationRegistry {
  readonly active: Option.Option<string>;
  readonly managed: readonly string[];
}

export interface GenerationRegistryStore {
  readonly read: Effect.Effect<GenerationRegistry, unknown>;
  readonly write: (registry: GenerationRegistry) => Effect.Effect<void, unknown>;
}

export const makeGenerationMarkerStore = (
  operations: GenerationMarkerOperations,
  key = ACTIVE_GENERATION_KEY,
): GenerationMarkerStore => ({
  read: Effect.suspend(() => operations.read(key)),
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
  const databaseName = options?.databaseName ?? DATABASE_NAME;
  return makeGenerationMarkerStore(
    {
      read: (key) =>
        withDatabase(databaseName, (database) => {
          const transaction = database.transaction(STORE_NAME, 'readonly');
          return requestResult(transaction.objectStore(STORE_NAME).get(key)).pipe(
            Effect.tap(() => transactionComplete(transaction)),
            Effect.map(Option.liftPredicate(Predicate.isString)),
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

/** The durable persisted shape: a bare legacy string marker or the registry record. */
const StoredRegistry = Schema.Struct({
  active: Schema.OptionFromOptionalKey(Schema.String),
  managed: Schema.Array(Schema.String),
});
const StoredRegistryValue = Schema.Union([Schema.String, StoredRegistry]);
const decodeStoredRegistry = Schema.decodeUnknownExit(StoredRegistryValue);
const encodeStoredRegistry = Schema.encodeSync(StoredRegistry);

const emptyRegistry = (): GenerationRegistry => ({ active: Option.none(), managed: [] });

const registryFromDecoded = (stored: typeof StoredRegistryValue.Type): GenerationRegistry => {
  if (Predicate.isString(stored)) return { active: Option.some(stored), managed: [stored] };
  return { active: stored.active, managed: stored.managed };
};

/** Durable inventory for a generation family. A legacy string marker is migrated on read. */
export const makeIndexedDbGenerationRegistryStore = (options: {
  readonly databaseName: string;
  readonly key: string;
}): GenerationRegistryStore => ({
  read: withDatabase(options.databaseName, (database) => {
    const transaction = database.transaction(STORE_NAME, 'readonly');
    return requestResult(transaction.objectStore(STORE_NAME).get(options.key)).pipe(
      Effect.tap(() => transactionComplete(transaction)),
      Effect.map((value) =>
        Exit.match(decodeStoredRegistry(value), {
          onFailure: () => emptyRegistry(),
          onSuccess: registryFromDecoded,
        }),
      ),
    );
  }),
  write: (registry) =>
    withDatabase(options.databaseName, (database) => {
      const transaction = database.transaction(STORE_NAME, 'readwrite', {
        durability: 'strict',
      });
      transaction
        .objectStore(STORE_NAME)
        .put(
          encodeStoredRegistry({ active: registry.active, managed: registry.managed }),
          options.key,
        );
      return transactionComplete(transaction);
    }),
});
