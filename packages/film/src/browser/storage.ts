// Per-viewer settings kept in the browser, through Effect's `KeyValueStore`:
// a store is an atom runtime over one (`TabStore` over the tab's session,
// `ViewerStore` over the browser's local storage, `storage-browser.ts`; a
// test's over a `Storage` of its own). A value kept as JSON is an `Atom.kvs`
// over its Schema; a value kept as plain text (the microphone, the review's
// quality and filter, stored so before this module) is a `keptText`, written
// and read as it is. A storage the page may not use (its getter throws, as a
// sandboxed or private window's does) is a store in memory instead; one that
// throws on a read or a write keeps nothing past the page: the read is none,
// the write is dropped, and the page keeps what it was told while it lives.

import { Effect, Layer, Option } from 'effect';
import { KeyValueStore } from 'effect/persistence';
import * as AsyncResult from 'effect/reactivity/AsyncResult';
import * as Atom from 'effect/reactivity/Atom';

/** A store of per-viewer settings: what `Atom.kvs` and `keptText` read and write through. */
export type StoreRuntime = Atom.AtomRuntime<KeyValueStore.KeyValueStore>;

/** A store over `storage`, or one in memory when the page may not use it. */
export const storeOver = (storage: () => Storage): StoreRuntime =>
  Atom.runtime(
    Layer.unwrap(
      Effect.match(Effect.try(storage), {
        onFailure: () => KeyValueStore.layerMemory,
        onSuccess: (kept) => KeyValueStore.layerStorage(() => kept),
      }),
    ),
  );

/**
 * The text kept under `key` in `store`, as it is stored (none when nothing
 * is, or the store cannot be read); a write keeps the text given.
 */
export const keptText = (
  store: StoreRuntime,
  key: string,
): Atom.Writable<Option.Option<string>, string> => {
  const read = store.atom(KeyValueStore.KeyValueStore.use((kv) => kv.get(key)));
  const write = store.fn((text: string) =>
    KeyValueStore.KeyValueStore.use((kv) => kv.set(key, text)),
  );
  return Atom.writable(
    (get) => {
      get.mount(write);
      return Option.flatMap(AsyncResult.value(get(read)), Option.fromUndefinedOr);
    },
    (ctx, text: string) => {
      ctx.set(write, text);
      ctx.setSelf(Option.some(text));
    },
  );
};
