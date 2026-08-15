import { Option } from 'effect';

let instance: Option.Option<Worker> = Option.none();

/** One worker owns every browser SQLite connection and both transport channels. */
export const getDatabaseWorker = (): Worker =>
  Option.getOrElse(instance, () => {
    const worker = new Worker(new URL('./db-worker-host.ts', import.meta.url), { type: 'module' });
    instance = Option.some(worker);
    return worker;
  });
