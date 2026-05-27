/**
 * Suspense cache — stable promises + manual invalidation.
 *
 * Uses React 19's `use()` for reads: suspends on miss, returns T on hit.
 * No SWR, no TTL — invalidation is explicit.
 */

// ---------------------------------------------------------------------------
// PromiseWithStatus — lets React's `use()` read synchronously when settled
// ---------------------------------------------------------------------------

type PromiseStatus = 'pending' | 'fulfilled' | 'rejected';

class PromiseWithStatus<T> extends Promise<T> {
  status: PromiseStatus = 'pending';
  value: T | null = null;
  reason: unknown = null;

  constructor(executor: (resolve: (value: T) => void, reject: (reason: unknown) => void) => void) {
    let resolve!: (value: T) => void;
    let reject!: (reason: unknown) => void;
    super((_resolve, _reject) => {
      resolve = _resolve;
      reject = _reject;
    });
    executor(
      (value) => {
        this.status = 'fulfilled';
        this.value = value;
        resolve(value);
      },
      (reason) => {
        this.status = 'rejected';
        this.reason = reason;
        reject(reason);
      },
    );
  }
}

// ---------------------------------------------------------------------------
// Cache
// ---------------------------------------------------------------------------

function makeKey(args: unknown[]): string {
  if (args.length === 0) return '()';
  return `(${args.map((arg) => JSON.stringify(arg)).join(':')})`;
}

export interface Cache<Args extends unknown[], T> {
  /** Get or start the fetch for the given args. */
  get(...args: Args): PromiseWithStatus<T>;
  /** Delete a specific cached entry, notifying subscribers. */
  invalidate(...args: Args): void;
  /** Delete all cached entries, notifying subscribers. */
  invalidateAll(): void;
}

export function createCache<Args extends unknown[], T>(
  loader: (...args: Args) => Promise<T>,
): Cache<Args, T> {
  const entries = new Map<string, PromiseWithStatus<T>>();
  const listeners = new Set<() => void>();
  // Monotonic version counter for useSyncExternalStore
  let version = 0;

  function notify() {
    version++;
    for (const listener of listeners) listener();
  }

  function subscribe(cb: () => void) {
    listeners.add(cb);
    return () => listeners.delete(cb);
  }

  function getSnapshot() {
    return version;
  }

  function get(...args: Args): PromiseWithStatus<T> {
    const key = makeKey(args);
    let entry = entries.get(key);
    if (entry) return entry;

    entry = new PromiseWithStatus<T>((resolve, reject) => {
      loader(...args).then(resolve, reject);
    });
    // Prevent unhandled rejection warnings
    entry.catch(() => {});
    entries.set(key, entry);
    return entry;
  }

  function invalidate(...args: Args) {
    const key = makeKey(args);
    if (entries.delete(key)) {
      notify();
    }
  }

  function invalidateAll() {
    if (entries.size > 0) {
      entries.clear();
      notify();
    }
  }

  // Expose subscribe/getSnapshot for useCache hook
  return Object.assign({ get, invalidate, invalidateAll }, { subscribe, getSnapshot });
}
