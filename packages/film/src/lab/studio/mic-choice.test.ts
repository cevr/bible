// The viewer's microphone choice: remembered in storage across pages, the
// default when none was picked or storage fails, and still kept in memory
// while the page lives when storage throws.

import { describe, expect, test } from 'bun:test';
import { Effect, Option } from 'effect';
import type { StorageLike } from '../../player/view-state.ts';
import { micChoice } from './mic-choice.ts';

const memory = (): StorageLike => {
  const kept = new Map<string, string>();
  return {
    getItem: (key) => Option.getOrNull(Option.fromUndefinedOr(kept.get(key))),
    setItem: (key, value) => void kept.set(key, value),
  };
};

/** Storage a private window refuses: every call throws. */
const refused: StorageLike = {
  getItem: () => Effect.runSync(Effect.die('storage denied')),
  setItem: () => Effect.runSync(Effect.die('quota exceeded')),
};

describe('micChoice', () => {
  test('the default until one is picked, then the pick, on the next page too', () => {
    const storage = Option.some(memory());
    const first = micChoice(storage);
    expect(first.get()).toEqual(Option.none());
    first.set(Option.some('usb-1'));
    expect(first.get()).toEqual(Option.some('usb-1'));
    expect(micChoice(storage).get()).toEqual(Option.some('usb-1'));
  });

  test('picking the default forgets the device', () => {
    const storage = Option.some(memory());
    micChoice(storage).set(Option.some('usb-1'));
    micChoice(storage).set(Option.none());
    expect(micChoice(storage).get()).toEqual(Option.none());
  });

  test('storage that throws or is missing keeps the pick while the page lives', () => {
    for (const storage of [Option.some(refused), Option.none()]) {
      const choice = micChoice(storage);
      expect(choice.get()).toEqual(Option.none());
      choice.set(Option.some('usb-2'));
      expect(choice.get()).toEqual(Option.some('usb-2'));
    }
  });
});
