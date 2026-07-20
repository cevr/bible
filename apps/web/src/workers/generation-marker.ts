const DATABASE_NAME = 'bible-user-state-metadata';
const STORE_NAME = 'runtime';
const ACTIVE_GENERATION_KEY = 'active-generation';

export interface GenerationMarkerStore {
  readonly read: () => Promise<string | undefined>;
  readonly write: (generation: string) => Promise<void>;
}

export interface GenerationMarkerOperations {
  readonly read: (key: string) => Promise<string | undefined>;
  readonly write: (key: string, value: string) => Promise<void>;
}

export const makeGenerationMarkerStore = (
  operations: GenerationMarkerOperations,
  key = ACTIVE_GENERATION_KEY,
): GenerationMarkerStore => ({
  read: () => operations.read(key),
  write: (generation) => operations.write(key, generation),
});

const requestResult = <A>(request: IDBRequest<A>): Promise<A> =>
  new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });

const transactionComplete = (transaction: IDBTransaction): Promise<void> =>
  new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
    transaction.onabort = () => reject(transaction.error);
  });

const openDatabase = (databaseName: string): Promise<IDBDatabase> => {
  const request = indexedDB.open(databaseName, 1);
  request.onupgradeneeded = () => {
    const database = request.result;
    if (!database.objectStoreNames.contains(STORE_NAME)) database.createObjectStore(STORE_NAME);
  };
  return requestResult(request);
};

export const makeIndexedDbGenerationMarkerStore = (options?: {
  readonly databaseName?: string;
  readonly key?: string;
}): GenerationMarkerStore => {
  const databaseName = options?.databaseName ?? DATABASE_NAME;
  return makeGenerationMarkerStore(
    {
      read: async (key) => {
        const database = await openDatabase(databaseName);
        const transaction = database.transaction(STORE_NAME, 'readonly');
        const value = await requestResult(transaction.objectStore(STORE_NAME).get(key));
        await transactionComplete(transaction);
        database.close();
        if (typeof value === 'string') return value;
        return undefined;
      },
      write: async (key, value) => {
        const database = await openDatabase(databaseName);
        const transaction = database.transaction(STORE_NAME, 'readwrite', { durability: 'strict' });
        transaction.objectStore(STORE_NAME).put(value, key);
        await transactionComplete(transaction);
        database.close();
      },
    },
    options?.key,
  );
};
