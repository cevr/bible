// A `Storage` for the store tests (`browser/storage.ts`): one in memory,
// whose items a test reads as the browser would keep them, and one that
// throws on every read and write, as a full quota or a denied page does.

import { Effect, Option } from 'effect';

/** A storage in memory, with its items for a test to read. */
export const memoryStorage = (): Storage & { readonly items: Map<string, string> } => {
  const items = new Map<string, string>();
  return {
    items,
    get length() {
      return items.size;
    },
    clear: () => items.clear(),
    getItem: (key) => Option.getOrNull(Option.fromUndefinedOr(items.get(key))),
    key: (index) => Option.getOrNull(Option.fromUndefinedOr([...items.keys()][index])),
    removeItem: (key) => void items.delete(key),
    setItem: (key, value) => void items.set(key, value),
  };
};

/** A storage the page may not use: its getter throws, as a sandboxed or private window's does. */
export const deniedStorage = (): Storage => Effect.runSync(Effect.die('SecurityError'));

/** A storage that refuses every read and write. */
export const refusingStorage = (): Storage => ({
  ...memoryStorage(),
  getItem: () => Effect.runSync(Effect.die('storage denied')),
  setItem: () => Effect.runSync(Effect.die('quota exceeded')),
});
