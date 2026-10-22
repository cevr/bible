/**
 * The settings over a store the test holds: a plain map behind Effect's
 * KeyValueStore, as One's key-value store is on a phone and the web. A
 * second set of settings over the same map is the app opened again.
 */

import { describe, expect, it } from 'bun:test';
import { Effect, Layer } from 'effect';
import * as KeyValueStore from 'effect/persistence/KeyValueStore';
import * as AtomRegistry from 'effect/reactivity/AtomRegistry';

import { DEFAULT_SIZE } from './reader/reading';
import { settingsOn } from './settings';

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

/** The app opened over `map`: fresh settings, a fresh registry. */
const launch = (map: Map<string, string>) => {
  const settings = settingsOn(storeOver(map));
  const registry = AtomRegistry.make();
  return { settings, registry };
};

describe('the appearance setting', () => {
  it('follows the system until the reader picks one', () => {
    const { settings, registry } = launch(new Map());
    expect(registry.get(settings.appearance)).toBe('system');
  });

  it('keeps the reader’s pick when the app is opened again', () => {
    const device = new Map<string, string>();
    const first = launch(device);
    first.registry.set(first.settings.appearance, 'dark');
    expect(first.registry.get(first.settings.appearance)).toBe('dark');
    first.registry.dispose();

    const again = launch(device);
    expect(again.registry.get(again.settings.appearance)).toBe('dark');
  });

  it('reads a stored value it cannot decode as the default', () => {
    const { settings, registry } = launch(new Map([['appearance', '"sepia"']]));
    expect(registry.get(settings.appearance)).toBe('system');
  });
});

describe('a hymn’s transpose and capo', () => {
  it('starts at no transpose and no capo', () => {
    const { settings, registry } = launch(new Map());
    expect(registry.get(settings.move(100))).toEqual({ transpose: 0, capo: 0 });
  });

  it('is kept for its own hymn alone, when the app is opened again', () => {
    const device = new Map<string, string>();
    const first = launch(device);
    first.registry.set(first.settings.move(100), { transpose: 2, capo: 2 });
    expect(first.registry.get(first.settings.move(1))).toEqual({ transpose: 0, capo: 0 });
    first.registry.dispose();

    const again = launch(device);
    expect(again.registry.get(again.settings.move(100))).toEqual({ transpose: 2, capo: 2 });
    expect(again.registry.get(again.settings.move(1))).toEqual({ transpose: 0, capo: 0 });
  });

  it('reads a stored move it cannot decode as none', () => {
    const { settings, registry } = launch(new Map([['move.100', '{"transpose":9,"capo":2}']]));
    expect(registry.get(settings.move(100))).toEqual({ transpose: 0, capo: 0 });
  });
});

describe('the reading settings', () => {
  it('start at the page as it has always been set, with the screen left to sleep', () => {
    const { settings, registry } = launch(new Map());
    expect(registry.get(settings.reading.size)).toBe(DEFAULT_SIZE);
    expect(registry.get(settings.reading.font)).toBe('system');
    expect(registry.get(settings.reading.spacing)).toBe('normal');
    expect(registry.get(settings.reading.awake)).toBe(false);
  });

  it('are kept under their reading keys when the app is opened again', () => {
    const device = new Map<string, string>();
    const first = launch(device);
    first.registry.set(first.settings.reading.size, DEFAULT_SIZE + 2);
    first.registry.set(first.settings.reading.font, 'serif');
    first.registry.set(first.settings.reading.spacing, 'roomy');
    first.registry.set(first.settings.reading.awake, true);
    first.registry.dispose();
    expect([...device.keys()].toSorted()).toEqual([
      'reading.awake',
      'reading.font',
      'reading.size',
      'reading.spacing',
    ]);

    const again = launch(device);
    expect(again.registry.get(again.settings.reading.size)).toBe(DEFAULT_SIZE + 2);
    expect(again.registry.get(again.settings.reading.font)).toBe('serif');
    expect(again.registry.get(again.settings.reading.spacing)).toBe('roomy');
    expect(again.registry.get(again.settings.reading.awake)).toBe(true);
  });

  it('read a stored value they cannot decode as the default', () => {
    const { settings, registry } = launch(
      new Map([
        ['reading.size', '99'],
        ['reading.font', '"mono"'],
        ['reading.spacing', '"loose"'],
        ['reading.awake', '"yes"'],
      ]),
    );
    expect(registry.get(settings.reading.size)).toBe(DEFAULT_SIZE);
    expect(registry.get(settings.reading.font)).toBe('system');
    expect(registry.get(settings.reading.spacing)).toBe('normal');
    expect(registry.get(settings.reading.awake)).toBe(false);
  });
});
