// A lab write reloads the page; the view it was in (speed, loop, onion,
// compare, play) comes back from the tab's sessionStorage. Storage that is
// missing, throws or holds something else is the default view, never an error.

import { describe, expect, test } from 'bun:test';
import { DEFAULT_VIEW, type StorageLike, viewStore } from './view-state.ts';

const memory = (): StorageLike & { readonly items: Map<string, string> } => {
  const items = new Map<string, string>();
  return {
    items,
    getItem: (k) => items.get(k) ?? null,
    setItem: (k, v) => {
      items.set(k, v);
    },
  };
};

const throwing: StorageLike = {
  getItem: () => {
    throw new Error('SecurityError');
  },
  setItem: () => {
    throw new Error('QuotaExceededError');
  },
};

describe('lab view state', () => {
  test('what a page patched is what the next page of the same film reads', () => {
    const storage = memory();
    const before = viewStore('f', storage);
    before.patch({ rate: 0.25 });
    before.patch({ loop: { kind: 'cue', scene: 'hand', name: 'topple' } });
    before.patch({ onion: { on: true, count: 3, spacing: 2 } });
    before.patch({ compare: { mode: 'wipe', split: 0.3 } });
    before.patch({ playing: true });
    const after = viewStore('f', storage).get();
    expect(after).toEqual({
      rate: 0.25,
      loop: { kind: 'cue', scene: 'hand', name: 'topple' },
      onion: { on: true, count: 3, spacing: 2 },
      compare: { mode: 'wipe', split: 0.3 },
      playing: true,
    });
    // Another film's page starts from the default.
    expect(viewStore('g', storage).get()).toEqual(DEFAULT_VIEW);
  });

  test('a loop can be turned off', () => {
    const storage = memory();
    viewStore('f', storage).patch({ loop: { kind: 'ab', from: 1, to: 2 } });
    viewStore('f', storage).patch({ loop: undefined });
    expect(viewStore('f', storage).get().loop).toBeUndefined();
  });

  test('storage that throws, or holds what is not a view, is the default view', () => {
    const store = viewStore('f', throwing);
    expect(store.get()).toEqual(DEFAULT_VIEW);
    store.patch({ rate: 0.5 });
    // The page keeps what it was told even when the tab cannot store it.
    expect(store.get().rate).toBe(0.5);
    const storage = memory();
    storage.setItem('film-lab-view:f', '{"rate":"fast"}');
    expect(viewStore('f', storage).get()).toEqual(DEFAULT_VIEW);
    storage.setItem('film-lab-view:f', 'not json');
    expect(viewStore('f', storage).get()).toEqual(DEFAULT_VIEW);
  });
});
