/**
 * The reader's settings, kept in a key-value store: the device's own on a
 * phone and the web (`src/store.ts`), or one a test hands in. A setting
 * survives a restart because `Atom.kvs` writes it through.
 *
 * A static web page is rendered with each default, so hydration reads the
 * default too and the stored value comes in the render after it; reading the
 * store first would leave the server's markup standing over the stored value.
 */

import { type Layer, Schema } from 'effect';
// The module itself: the `effect/persistence` barrel brings in a SQL
// migrator whose dynamic import() Hermes cannot compile.
import type * as KeyValueStore from 'effect/persistence/KeyValueStore';
import * as Atom from 'effect/reactivity/Atom';

import { Move, still } from './hymns/chords';

/** How the app is shown: as the system is set, or always light, or always dark. */
export const Appearance = Schema.Literals(['system', 'light', 'dark']);
export type Appearance = typeof Appearance.Type;

export const settingsOn = (store: Layer.Layer<KeyValueStore.KeyValueStore>) => {
  const runtime = Atom.runtime(store);
  const setting = <S extends Schema.ConstraintCodec<unknown, unknown>>(
    key: string,
    schema: S,
    initial: S['Type'],
  ) =>
    Atom.withServerValue(
      Atom.kvs({ runtime, key, schema, defaultValue: () => initial, mode: 'sync' }),
      () => initial,
    );
  return {
    /** A hymn shows its words alone until the reader turns chords on. */
    chords: setting('chords', Schema.Boolean, false),
    appearance: setting('appearance', Appearance, 'system'),
    /**
     * Each hymn's transpose and capo, by its number: a move fits one hymn's
     * key and the singers' range for it, so it never reaches another hymn.
     */
    move: Atom.family((number: number) => setting(`move.${number}`, Move, still)),
  };
};
