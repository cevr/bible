// Per-viewer settings kept in the browser, through Effect's `KeyValueStore`:
// a store is an atom runtime over one (`TabStore` over the tab's session,
// `ViewerStore` over the browser's local storage, `storage-browser.ts`; a
// test's over a `Storage` of its own). A value kept as JSON is a `keptJson`
// (an `Atom.kvs` over its Schema, read once and written through); a value kept as plain text (the microphone, the review's
// quality and filter, stored so before this module) is a `keptText`, written
// and read as it is. A storage the page may not use (its getter throws, as a
// sandboxed or private window's does) is a store in memory instead; one that
// throws on a read or a write keeps nothing past the page: the read is none,
// the write is dropped, and the page keeps what it was told while it lives.

import { Effect, Layer, Option, type Schema } from 'effect';
import { KeyValueStore } from 'effect/persistence';
import * as AsyncResult from 'effect/reactivity/AsyncResult';
import * as Atom from 'effect/reactivity/Atom';
import * as AtomRegistry from 'effect/reactivity/AtomRegistry';

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

/** A value kept as JSON: read once, kept in memory, written through on each `set`. */
interface KeptJson<A> {
  readonly get: () => A;
  readonly set: (value: A) => void;
}

/**
 * The value kept under `key` in `store` as `schema`'s JSON, `defaultValue`
 * when nothing is (or what is fails the schema): read once as it is made,
 * then each `set` keeps it in memory and writes it through. Over a server
 * render's store (one in memory, empty) it is the default.
 */
export const keptJson = <S extends Schema.ConstraintCodec<unknown, unknown>>(
  store: StoreRuntime,
  key: string,
  schema: S,
  defaultValue: () => S['Type'],
): KeptJson<S['Type']> => {
  const kept = Atom.kvs({ runtime: store, key, schema, defaultValue, mode: 'sync' });
  const registry = AtomRegistry.make();
  registry.mount(kept);
  return {
    get: () => registry.get(kept),
    set: (value) => registry.set(kept, value),
  };
};

/**
 * The text kept under `key` in `store`, as it is stored (none when nothing
 * is, or the store cannot be read); a write keeps the text given.
 *
 * What a viewer kept is in their browser, which a page rendered on the
 * server has not seen: its server value is none (`Atom.withServerValue`),
 * which the server renders and the client hydrates with before it reads
 * the store (`@bible/atom-solid`'s hooks).
 */
export const keptText = (
  store: StoreRuntime,
  key: string,
): Atom.Writable<Option.Option<string>, string> => {
  const read = store.atom(KeyValueStore.KeyValueStore.use((kv) => kv.get(key)));
  const write = store.fn((text: string) =>
    KeyValueStore.KeyValueStore.use((kv) => kv.set(key, text)),
  );
  const kept = Atom.writable(
    (get) => {
      get.mount(write);
      return Option.flatMap(AsyncResult.value(get(read)), Option.fromUndefinedOr);
    },
    (ctx, text: string) => {
      ctx.set(write, text);
      ctx.setSelf(Option.some(text));
    },
  );
  return Atom.withServerValue(kept, () => Option.none<string>());
};
