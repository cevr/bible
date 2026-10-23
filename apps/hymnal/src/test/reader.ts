/**
 * The hymn page's chord reader over a store the test holds: the settings
 * over a plain map (what the device keeps), and a fresh chord book over the
 * chords the bundler derives (`vite/chords.ts`), so a test counts its
 * decodes.
 */

import { Effect, Layer } from 'effect';
import * as KeyValueStore from 'effect/persistence/KeyValueStore';
import type * as Atom from 'effect/reactivity/Atom';

import { readChords } from '../../vite/chords';
import { chordBook } from '~/hymns/chords';
import type { ChordStyle } from '~/hymns/simple';
import type { ChordReader } from '~/reader/HymnPage';
import { settingsOn } from '~/settings';

const bundled = readChords();

/** A store over `map`: what the device keeps between two launches. */
const storeOver = (map: Map<string, string>) =>
  Layer.succeed(KeyValueStore.KeyValueStore)(
    KeyValueStore.makeStringOnly({
      get: (key) => Effect.sync(() => map.get(key)),
      set: (key, value) => Effect.sync(() => void map.set(key, value)),
      remove: (key) => Effect.sync(() => void map.delete(key)),
      clear: Effect.sync(() => map.clear()),
      size: Effect.sync(() => map.size),
    }),
  );

/** A reader over `device`, with its own chord book; its chord style can be set, as Settings sets it. */
export const readerOn = (
  device: Map<string, string> = new Map(),
): ChordReader & { readonly style: Atom.Writable<ChordStyle> } => {
  const settings = settingsOn(storeOver(device));
  return {
    chords: settings.chords,
    style: settings.chordStyle,
    move: settings.move,
    book: chordBook(bundled),
    reading: settings.reading,
    favourites: settings.lists.favourites,
  };
};
