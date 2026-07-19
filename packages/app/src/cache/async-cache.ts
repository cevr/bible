import { Effect } from 'effect';

import {
  createSyncedCache,
  type CacheInputArgs,
  type CacheRuntime,
  type SyncedCacheStatus,
} from './synced-cache.js';

export interface CreateAsyncCacheOptions<Input, A, E, R> {
  readonly name: string;
  readonly runtime: CacheRuntime<R>;
  readonly lookup: (input: Input) => Effect.Effect<A, E, R>;
  readonly emptyInput?: Input;
}

export interface AsyncCache<Input, A> {
  readonly get: (...args: CacheInputArgs<Input>) => () => A;
  readonly status: (...args: CacheInputArgs<Input>) => () => SyncedCacheStatus;
  readonly refresh: (...args: CacheInputArgs<Input>) => Promise<A>;
}

export const createAsyncCache = <Input, A, E, R>(
  options: CreateAsyncCacheOptions<Input, A, E, R>,
): AsyncCache<Input, A> => {
  const cache = createSyncedCache<Input, A, E, R, never, never, never>({
    ...options,
    mutate: (command) => Effect.die(command),
    affects: () => [],
    matches: () => false,
  });
  return {
    get: cache.get,
    status: cache.status,
    refresh: cache.refresh,
  };
};
