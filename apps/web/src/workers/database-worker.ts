let instance: Worker | undefined;

/** One worker owns every browser SQLite connection and both transport channels. */
export const getDatabaseWorker = (): Worker => {
  instance ??= new Worker(new URL('./db-worker-host.ts', import.meta.url), { type: 'module' });
  return instance;
};
