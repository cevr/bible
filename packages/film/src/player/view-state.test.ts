// A lab write reloads the page; the view it was in (speed, loop, onion,
// compare, play) comes back from the tab's sessionStorage. Storage that is
// missing, throws or holds something else is the default view, never an error.

import { describe, expect, test } from 'bun:test';
import { DEFAULT_VIEW, type StorageLike, viewStore } from './view-state.ts';

/** The film the stored views are read against: 392.9 s long. */
const DURATION = 392.9;

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
    const before = viewStore('f', storage, DURATION);
    before.patch({ rate: 0.25 });
    before.patch({ loop: { kind: 'cue', scene: 'hand', name: 'topple' } });
    before.patch({ onion: { on: true, count: 3, spacing: 2 } });
    before.patch({ compare: { mode: 'wipe', split: 0.3 } });
    before.patch({ playing: true });
    before.patch({ studio: { beat: 'thesis' } });
    const after = viewStore('f', storage, DURATION).get();
    expect(after).toEqual({
      rate: 0.25,
      loop: { kind: 'cue', scene: 'hand', name: 'topple' },
      onion: { on: true, count: 3, spacing: 2 },
      compare: { mode: 'wipe', split: 0.3 },
      playing: true,
      studio: { beat: 'thesis' },
    });
    // Another film's page starts from the default.
    expect(viewStore('g', storage, DURATION).get()).toEqual(DEFAULT_VIEW);
  });

  test('a loop can be turned off', () => {
    const storage = memory();
    viewStore('f', storage, DURATION).patch({ loop: { kind: 'ab', from: 1, to: 2 } });
    viewStore('f', storage, DURATION).patch({ loop: undefined });
    expect(viewStore('f', storage, DURATION).get().loop).toBeUndefined();
  });

  test('storage that throws, or holds what is not a view, is the default view', () => {
    const store = viewStore('f', throwing, DURATION);
    expect(store.get()).toEqual(DEFAULT_VIEW);
    store.patch({ rate: 0.5 });
    // The page keeps what it was told even when the tab cannot store it.
    expect(store.get().rate).toBe(0.5);
    const storage = memory();
    storage.setItem('film-lab-view:f', '{"rate":"fast"}');
    expect(viewStore('f', storage, DURATION).get()).toEqual(DEFAULT_VIEW);
    storage.setItem('film-lab-view:f', 'not json');
    expect(viewStore('f', storage, DURATION).get()).toEqual(DEFAULT_VIEW);
  });

  test('a stored A–B loop is read against the film as it is now: clamped to it, or dropped', () => {
    const storage = memory();
    const stored = (loop: unknown) => {
      storage.setItem('film-lab-view:f', JSON.stringify({ ...DEFAULT_VIEW, loop }));
      return viewStore('f', storage, DURATION).get().loop;
    };
    // Inside the film: kept as it is.
    expect(stored({ kind: 'ab', from: 10, to: 12 })).toEqual({ kind: 'ab', from: 10, to: 12 });
    // Running past the end of a film that got shorter: it ends where the film does.
    expect(stored({ kind: 'ab', from: 390, to: 400 })).toEqual({
      kind: 'ab',
      from: 390,
      to: DURATION,
    });
    // Wholly past the end: nothing of it is left to loop.
    expect(stored({ kind: 'ab', from: 500, to: 510 })).toBeUndefined();
    // A cue loop is resolved against the film when it is applied, so it is kept.
    expect(stored({ kind: 'cue', scene: 'hand', name: 'topple' })).toEqual({
      kind: 'cue',
      scene: 'hand',
      name: 'topple',
    });
  });

  test('a stored rate the lab does not offer is the default view', () => {
    const storage = memory();
    for (const rate of [0, -1, 2, 0.3]) {
      storage.setItem('film-lab-view:f', JSON.stringify({ ...DEFAULT_VIEW, rate, playing: true }));
      expect(viewStore('f', storage, DURATION).get()).toEqual(DEFAULT_VIEW);
    }
    storage.setItem('film-lab-view:f', JSON.stringify({ ...DEFAULT_VIEW, rate: 0.25 }));
    expect(viewStore('f', storage, DURATION).get().rate).toBe(0.25);
  });
});
