/**
 * The reader's settings, kept on the device: One's key-value store (SQLite
 * on a phone, local storage on the web) under Effect's KeyValueStore, so a
 * setting survives a restart. Where the store cannot open, as in a static
 * render, the settings live in memory.
 */

import { Effect, Layer, Option, Schema } from 'effect';
// The module itself: the `effect/persistence` barrel brings in a SQL
// migrator whose dynamic import() Hermes cannot compile.
import * as KeyValueStore from 'effect/persistence/KeyValueStore';
import * as Atom from 'effect/reactivity/Atom';
import { One } from 'one';

type Database = ReturnType<typeof One.Database.openKeyValue>;

const failed = (method: string, key: string) => (cause: unknown) =>
  new KeyValueStore.KeyValueStoreError({ message: `${method} ${key}`, method, key, cause });

const storeOn = (db: Database) =>
  KeyValueStore.makeStringOnly({
    get: (key) =>
      Effect.try({
        try: () => Option.getOrUndefined(Option.fromNullishOr(db.getItem(key))),
        catch: failed('get', key),
      }),
    set: (key, value) =>
      Effect.try({ try: () => db.setItem(key, value), catch: failed('set', key) }),
    remove: (key) => Effect.try({ try: () => db.removeItem(key), catch: failed('remove', key) }),
    clear: Effect.try({ try: () => db.clear(), catch: failed('clear', '*') }),
    size: Effect.try({ try: () => db.getAllKeys().length, catch: failed('size', '*') }),
  });

const store = Atom.runtime(
  Layer.unwrap(
    Effect.match(
      Effect.try(() => One.Database.openKeyValue({ name: 'hymnal' })),
      {
        onFailure: () => KeyValueStore.layerMemory,
        onSuccess: (db) => Layer.succeed(KeyValueStore.KeyValueStore, storeOn(db)),
      },
    ),
  ),
);

/** A hymn shows its words alone until the reader turns chords on. */
export const chordsAtom = Atom.kvs({
  runtime: store,
  key: 'chords',
  schema: Schema.Boolean,
  defaultValue: () => false,
  mode: 'sync',
});
