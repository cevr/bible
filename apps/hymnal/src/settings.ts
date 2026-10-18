/**
 * The reader's settings, kept on the device: One's key-value store (SQLite
 * on a phone, local storage on the web) under Effect's KeyValueStore, so a
 * setting survives a restart. A store that fails is logged, since a sync
 * `Atom.kvs` drops a failed read and keeps a failed write for the session
 * only; where the store cannot open at all, the settings live in memory.
 */

import { Effect, Layer, Option, Schema } from 'effect';
// The module itself: the `effect/persistence` barrel brings in a SQL
// migrator whose dynamic import() Hermes cannot compile.
import * as KeyValueStore from 'effect/persistence/KeyValueStore';
import * as Atom from 'effect/reactivity/Atom';
import { One } from 'one';

type Database = ReturnType<typeof One.Database.openKeyValue>;

/**
 * One store call, its failure typed and logged with the method and the key
 * it read or wrote (none for a call on the whole store).
 */
const call = <A>(method: string, key: Option.Option<string>, run: () => A) =>
  Effect.try({
    try: run,
    catch: (cause) =>
      Option.match(key, {
        onNone: () => new KeyValueStore.KeyValueStoreError({ message: method, method, cause }),
        onSome: (k) =>
          new KeyValueStore.KeyValueStoreError({
            message: `${method} ${k}`,
            method,
            key: k,
            cause,
          }),
      }),
  }).pipe(
    Effect.tapError((error) =>
      Effect.logWarning('settings.store.failed').pipe(
        Effect.annotateLogs({
          method,
          key: Option.getOrElse(key, () => '*'),
          cause: String(error.cause),
        }),
      ),
    ),
  );

const storeOn = (db: Database) =>
  KeyValueStore.makeStringOnly({
    get: (key) =>
      call('get', Option.some(key), () =>
        Option.getOrUndefined(Option.fromNullishOr(db.getItem(key))),
      ),
    set: (key, value) => call('set', Option.some(key), () => db.setItem(key, value)),
    remove: (key) => call('remove', Option.some(key), () => db.removeItem(key)),
    clear: call('clear', Option.none(), () => db.clear()),
    size: call('size', Option.none(), () => db.getAllKeys().length),
  });

const store = Atom.runtime(
  Layer.unwrap(
    Effect.match(
      call('open', Option.none(), () => One.Database.openKeyValue({ name: 'hymnal' })),
      {
        onFailure: () => KeyValueStore.layerMemory,
        onSuccess: (db) => Layer.succeed(KeyValueStore.KeyValueStore, storeOn(db)),
      },
    ),
  ),
);

/**
 * A hymn shows its words alone until the reader turns chords on. A static
 * page is rendered with the default, so hydration reads the default too and
 * the stored value comes in the render after it; reading the store first
 * would leave the server's markup standing over the stored value.
 */
export const chordsAtom = Atom.withServerValue(
  Atom.kvs({
    runtime: store,
    key: 'chords',
    schema: Schema.Boolean,
    defaultValue: () => false,
    mode: 'sync',
  }),
  () => false,
);
