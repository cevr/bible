// What a locked figure's print answers its lock (`heldTo`), and the hold a
// film's build and test run over its locked figures (`unlocked`): each print
// hashed with sha256, held to its lock, and each broken one named with the
// rule's words and the hash an override would name to free it.

import { BunServices } from '@effect/platform-bun';
import { describe, expect, it } from 'effect-bun-test';
import { test } from 'bun:test';
import { Effect } from 'effect';
import { unlocked } from './build.ts';
import { decodeLock, heldTo } from './lock.ts';

/** The sha256 of `abc` (FIPS 180-2's first example): the print the lock holds. */
const KEPT = 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad';

/** The sha256 of an empty text: a print changed from it. */
const CHANGED = 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855';

/** What the lock answers the changed print with no override. */
const NOT_KEPT = `its print ${CHANGED} is not its lock's ${KEPT} (version 1, kept in ask a92f276635e): only an override with the owner's words frees it, naming the print it frees`;

/** The lead's lock as his file keeps it, holding the print `abc`. */
const LOCK = decodeLock(
  {
    item: 'lead',
    version: 1,
    hash: KEPT,
    ask: 'a92f276635e',
    at: 1792281444576,
    seen: { set: 'concepts', file: 'images/lead.png' },
  },
  'lock',
);

/** An override of the lead's lock, in the owner's words, that frees the print `frees`. */
const overrideFreeing = (frees: string) => ({
  rule: 'FigureLock' as const,
  place: 'lead',
  frees,
  reason: 'a test of the way out',
  quote: 'words a test stands in for',
});

/** The lead's lock with that override. */
const freeing = (frees: string) =>
  decodeLock({ ...LOCK, override: overrideFreeing(frees) }, 'lock');

describe("a locked figure's print against its lock", () => {
  test('holds when it is the print the lock holds', () => {
    expect(heldTo('lead', LOCK, KEPT)).toEqual({ _tag: 'Holds' });
  });

  test('is broken when it is not, naming both prints and the way out', () => {
    expect(heldTo('lead', LOCK, CHANGED)).toEqual({ _tag: 'Broken', why: NOT_KEPT });
  });

  test("is freed by an override with the owner's words that names that very print", () => {
    expect(heldTo('lead', freeing(CHANGED), CHANGED)).toEqual({
      _tag: 'Freed',
      override: overrideFreeing(CHANGED),
    });
  });

  test('is broken by an override that frees another print, or one the lock holds already', () => {
    const other = 'c'.repeat(64);
    expect(heldTo('lead', freeing(CHANGED), other)).toEqual({
      _tag: 'Broken',
      why: `its override frees ${CHANGED}, not its print ${other}`,
    });
    // The print is the lock's, so the override would free a later change unasked.
    expect(heldTo('lead', freeing(CHANGED), KEPT)).toEqual({
      _tag: 'Broken',
      why: "its print is its lock's, so its override frees nothing: drop it, or it frees a later change unasked",
    });
  });

  test("is broken when it carries another figure's lock", () => {
    expect(heldTo('judge', LOCK, KEPT)).toEqual({ _tag: 'Broken', why: "it carries lead's lock" });
  });
});

describe("a film's locked figures held to their locks", () => {
  it.effect.layer(BunServices.layer)('hashes each print and answers each figure apart', () =>
    Effect.gen(function* () {
      expect(yield* unlocked([{ item: 'lead', lock: LOCK, print: 'abc' }])).toEqual({
        broken: [],
        overridden: [],
      });
      const answers = yield* unlocked([
        { item: 'lead', lock: LOCK, print: '' },
        { item: 'lead', lock: freeing(CHANGED), print: '' },
      ]);
      expect(answers.broken).toEqual([
        {
          item: 'lead',
          hash: CHANGED,
          why: `lead's lock is broken (FigureLock, a locked figure is drawn as the owner kept it, its print the one its lock holds): ${NOT_KEPT}`,
        },
      ]);
      expect(answers.overridden).toEqual([{ item: 'lead', override: overrideFreeing(CHANGED) }]);
    }),
  );
});
