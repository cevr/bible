// A lab write reloads the page; the view it was in (speed, loop, onion,
// compare, play) comes back from the tab's store, as the JSON it was always
// kept as. Storage that is missing, throws or holds something else is the
// default view, never an error.

import { describe, expect, test } from 'bun:test';
import { Option, Schema } from 'effect';
import { storeOver } from '../browser/storage.ts';
import { deniedStorage, memoryStorage, refusingStorage } from '../browser/fixtures/storage.ts';
import { DEFAULT_VIEW, type LabView, viewStore } from './view-state.ts';

/** The film the stored views are read against: 392.9 s long. */
const DURATION = 392.9;

/** A value as stored JSON text, the lab's view or not. */
const jsonText = Schema.encodeSync(Schema.fromJsonString(Schema.Unknown));

/** A tab: its storage, and a page's store over it (each page builds its own). */
const tab = () => {
  const storage = memoryStorage();
  return {
    storage,
    page: (film = 'f') =>
      viewStore(
        film,
        DURATION,
        storeOver(() => storage),
      ),
  };
};

describe('lab view state', () => {
  test('what a page patched is what the next page of the same film reads', () => {
    const { page } = tab();
    const before = page();
    before.patch({ rate: 0.25 });
    before.patch({ loop: Option.some({ kind: 'cue', scene: 'hand', name: 'topple' }) });
    before.patch({ onion: { on: true, count: 3, spacing: 2 } });
    before.patch({ compare: { mode: 'wipe', split: 0.3 } });
    before.patch({ playing: true });
    before.patch({ studio: { beat: 'thesis' } });
    const after = page().get();
    expect(after).toEqual({
      rate: 0.25,
      loop: { kind: 'cue', scene: 'hand', name: 'topple' },
      onion: { on: true, count: 3, spacing: 2 },
      compare: { mode: 'wipe', split: 0.3 },
      playing: true,
      studio: { beat: 'thesis' },
    });
    // Another film's page starts from the default.
    expect(page('g').get()).toEqual(DEFAULT_VIEW);
  });

  test('is kept as the JSON it always was, under the film’s key', () => {
    const { storage, page } = tab();
    page().patch({ rate: 0.5, loop: Option.some({ kind: 'ab', from: 1, to: 2 }) });
    expect(storage.items.get('film-lab-view:f')).toBe(
      '{"rate":0.5,"loop":{"kind":"ab","from":1,"to":2},"onion":{"on":false,"count":2,"spacing":3},"compare":{"mode":"off","split":0.5},"playing":false}',
    );
  });

  test('a loop can be turned off', () => {
    const { page } = tab();
    page().patch({ loop: Option.some({ kind: 'ab', from: 1, to: 2 }) });
    page().patch({ loop: Option.none() });
    expect(page().get().loop).toBeUndefined();
  });

  test('storage that throws, or holds what is not a view, is the default view', () => {
    for (const store of [storeOver(refusingStorage), storeOver(deniedStorage)]) {
      const view = viewStore('f', DURATION, store);
      expect(view.get()).toEqual(DEFAULT_VIEW);
      view.patch({ rate: 0.5 });
      // The page keeps what it was told even when the tab cannot store it.
      expect(view.get().rate).toBe(0.5);
    }
    const { storage, page } = tab();
    storage.setItem('film-lab-view:f', '{"rate":"fast"}');
    expect(page().get()).toEqual(DEFAULT_VIEW);
    storage.setItem('film-lab-view:f', 'not json');
    expect(page().get()).toEqual(DEFAULT_VIEW);
  });

  test('a stored A–B loop is read against the film as it is now: clamped to it, or dropped', () => {
    const { storage, page } = tab();
    const stored = (loop: NonNullable<LabView['loop']>) => {
      storage.setItem('film-lab-view:f', jsonText({ ...DEFAULT_VIEW, loop }));
      return page().get().loop;
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
    const { storage, page } = tab();
    for (const rate of [0, -1, 2, 0.3]) {
      storage.setItem('film-lab-view:f', jsonText({ ...DEFAULT_VIEW, rate, playing: true }));
      expect(page().get()).toEqual(DEFAULT_VIEW);
    }
    storage.setItem('film-lab-view:f', jsonText({ ...DEFAULT_VIEW, rate: 0.25 }));
    expect(page().get().rate).toBe(0.25);
  });
});
