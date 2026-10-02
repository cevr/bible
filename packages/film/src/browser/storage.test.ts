// A text kept in a store (the microphone, the review's quality and filter):
// none until one is kept, then the text as it was given, on the next page
// too, and stored as it is (the bytes the pages always wrote). Storage that
// throws, or that the page may not use, keeps the text while the page lives.

import { describe, expect, test } from 'bun:test';
import { Option } from 'effect';
import * as AtomRegistry from 'effect/reactivity/AtomRegistry';
import { deniedStorage, memoryStorage, refusingStorage } from './fixtures/storage.ts';
import { keptText, storeOver } from './storage.ts';

/** A page over `storage`: its own store and registry, as each page load has. */
const page = (storage: () => Storage) => {
  const kept = keptText(storeOver(storage), 'film-lab-mic');
  const registry = AtomRegistry.make();
  registry.mount(kept);
  return {
    read: () => registry.get(kept),
    keep: (text: string) => registry.set(kept, text),
  };
};

describe('keptText', () => {
  test('none until kept, then the text, on the next page too, stored as it is', () => {
    const storage = memoryStorage();
    const first = page(() => storage);
    expect(first.read()).toEqual(Option.none());
    first.keep('usb-1');
    expect(first.read()).toEqual(Option.some('usb-1'));
    expect(storage.items.get('film-lab-mic')).toBe('usb-1');
    expect(page(() => storage).read()).toEqual(Option.some('usb-1'));
    // An empty text is kept as one (the microphone's "browser default").
    page(() => storage).keep('');
    expect(storage.items.get('film-lab-mic')).toBe('');
    expect(page(() => storage).read()).toEqual(Option.some(''));
  });

  test('storage that throws, or that the page may not use, keeps the text while the page lives', () => {
    for (const storage of [refusingStorage, deniedStorage]) {
      const kept = page(storage);
      expect(kept.read()).toEqual(Option.none());
      kept.keep('usb-2');
      expect(kept.read()).toEqual(Option.some('usb-2'));
    }
  });
});
