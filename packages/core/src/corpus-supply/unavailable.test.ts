import { describe, expect, it } from 'effect-bun-test';
import { Effect, Option } from 'effect';

import { isKnownUnavailable, KNOWN_UNAVAILABLE, unavailableReason } from './unavailable.js';

describe('KNOWN_UNAVAILABLE', () => {
  const test = it.effect;

  /** The count is the measurement: 18 books failed the 2026-09-19 sync, and
   *  all 18 were probed individually. A 19th appearing means the library
   *  changed something and the list needs re-measuring, not padding. */
  test('holds exactly the eighteen measured publications', () =>
    Effect.sync(() => {
      expect(KNOWN_UNAVAILABLE).toHaveLength(18);
    }));

  test('keys every entry by a distinct book id', () =>
    Effect.sync(() => {
      const ids = KNOWN_UNAVAILABLE.map((entry) => entry.bookId);
      expect(new Set(ids).size).toBe(ids.length);
    }));

  /** The trap this list exists to avoid. `ChS` is served as `1ChS`, so a
   *  membership test written against `book_code` would quietly stop matching
   *  the day the library renames one of these. Ids are the stable key. */
  test('identifies by numeric id, not by code', () =>
    Effect.sync(() => {
      expect(isKnownUnavailable(12515)).toBe(true);
      expect(unavailableReason(12515)).toEqual(Option.some('subscription'));
    }));

  test('does not claim an available book is unavailable', () =>
    Effect.sync(() => {
      // `DA` (Desire of Ages) syncs fine and must never be skipped.
      expect(isKnownUnavailable(130)).toBe(false);
      expect(unavailableReason(130)).toEqual(Option.none());
    }));

  /** The five modern translations are withheld for a different reason than
   *  the SDA reference set, and the weekly report says which. */
  test('separates subscription gating from third-party licensing', () =>
    Effect.sync(() => {
      expect(unavailableReason(14340)).toEqual(Option.some('third-party-licence'));
      expect(unavailableReason(12668)).toEqual(Option.some('subscription'));

      const licensed = KNOWN_UNAVAILABLE.filter((entry) => entry.reason === 'third-party-licence');
      expect(licensed.map((entry) => entry.code).sort()).toEqual([
        'ICB',
        'NCV',
        'NET',
        'NIV',
        'NKJV',
      ]);
    }));
});
