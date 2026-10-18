// What a locked figure's print answers its lock (`heldTo`), read against the
// owner's decisions on his production's ledger, and the hold a film's build
// and test run over its locked figures (`unlocked`): each print hashed with
// sha256, held to its lock, the lock held to the decision it names, and each
// broken one named with the rule's words and the hash an override would name
// to free it.

import { BunServices } from '@effect/platform-bun';
import { describe, expect, it } from 'effect-bun-test';
import { test } from 'bun:test';
import { Effect, FileSystem, Schema } from 'effect';
import { ProductionFile, decisionsOf } from '../core/production.ts';
import { repoJson } from '../core/schema.ts';
import { unlocked } from './build.ts';
import { decodeLock, heldTo } from './lock.ts';

/** The sha256 of `abc` (FIPS 180-2's first example): the print the lock holds. */
const KEPT = 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad';

/** The sha256 of an empty text: a print changed from it. */
const CHANGED = 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855';

/** The ask the owner kept and locked the lead in, the time the ledger filed his decision there, and that time as a broken lock names it. */
const ASK = 'a92f276635e';
const AT = 1792281444576;
const FILED = '2026-10-17T23:57:24.576Z';

/** What the lock answers the changed print with no override. */
const NOT_KEPT = `its print ${CHANGED} is not its lock's ${KEPT} (version 1, kept in ask ${ASK}): only an override citing a decision of the owner's on lead, filed after the lock, frees it, naming the print it frees`;

/**
 * A ledger with the question the lock was kept in, the decision that kept
 * it, and a decision of the owner's on the lead after it, in his words.
 */
const LEDGER = `{
  "production": "righteousness-by-faith",
  "title": "Righteousness by Faith",
  "versions": [{ "at": 0, "title": "the first" }],
  "said": [
    { "_tag": "Asked", "at": ${AT - 1}, "text": "Keep and lock them?", "ask": "${ASK}", "set": "cold" },
    { "_tag": "Decided", "at": ${AT}, "text": "Keep and lock them", "ask": "${ASK}", "picks": { "keep": "lock" }, "set": "cold" },
    { "_tag": "Decided", "at": ${AT + 1}, "text": "His ear back", "quote": "move his ear back a unit", "set": "cast", "point": "item:lead" }
  ]
}`;

/** The owner's decisions on that ledger. */
const DECISIONS = decisionsOf(Schema.decodeSync(repoJson(ProductionFile))(LEDGER));

/** The lead's lock as his file keeps it, holding the print `abc`. */
const LOCK = decodeLock(
  {
    item: 'lead',
    version: 1,
    hash: KEPT,
    ask: ASK,
    at: AT,
    seen: { set: 'concepts', file: 'images/lead.png' },
  },
  'lock',
);

/** An override of the lead's lock that frees the print `frees`, quoting `quote`: by default, his decision on the lead after the lock. */
const overrideFreeing = (frees: string, quote = 'move his ear back a unit') => ({
  rule: 'FigureLock' as const,
  place: 'lead',
  frees,
  reason: 'his ear a unit back',
  quote,
});

/** The lead's lock with that override. */
const freeing = (frees: string, quote?: string) =>
  decodeLock({ ...LOCK, override: overrideFreeing(frees, quote) }, 'lock');

describe("a locked figure's print against its lock", () => {
  test('holds when it is the print the lock holds', () => {
    expect(heldTo('lead', LOCK, KEPT, DECISIONS)).toEqual({ _tag: 'Holds' });
  });

  test('is broken when it is not, naming both prints and the way out', () => {
    expect(heldTo('lead', LOCK, CHANGED, DECISIONS)).toEqual({ _tag: 'Broken', why: NOT_KEPT });
  });

  test("is freed by an override that names that very print, citing a decision of the owner's on the figure after the lock", () => {
    expect(heldTo('lead', freeing(CHANGED), CHANGED, DECISIONS)).toEqual({
      _tag: 'Freed',
      override: overrideFreeing(CHANGED),
    });
  });

  test('is broken by an override naming that very print whose citation no decision of his on the figure allows', () => {
    const quote = 'words a test stands in for';
    expect(heldTo('lead', freeing(CHANGED, quote), CHANGED, DECISIONS)).toEqual({
      _tag: 'Broken',
      why: `lead's override of FigureLock at lead is broken: no decision on his production's ledger at the point item:lead, filed after his lock (${FILED}) says "${quote}": file his words as a decision there (\`film production decide\` with \`--quote\`, \`--set\` and \`--point item:lead\`), then quote them verbatim`,
    });
  });

  test('is broken by an override that frees another print, or one the lock holds already', () => {
    const other = 'c'.repeat(64);
    expect(heldTo('lead', freeing(CHANGED), other, DECISIONS)).toEqual({
      _tag: 'Broken',
      why: `its override frees ${CHANGED}, not its print ${other}`,
    });
    // The print is the lock's, so the override would free a later change unasked.
    expect(heldTo('lead', freeing(CHANGED), KEPT, DECISIONS)).toEqual({
      _tag: 'Broken',
      why: "its print is its lock's, so its override frees nothing: drop it, or it frees a later change unasked",
    });
  });

  test("is broken when it carries another figure's lock", () => {
    expect(heldTo('judge', LOCK, KEPT, DECISIONS)).toEqual({
      _tag: 'Broken',
      why: "it carries lead's lock",
    });
  });

  test('is broken, its print the lock holds or not, while the lock names a decision the ledger does not hold', () => {
    const lost = `its lock names a decision his production's ledger does not hold: none filed at ${FILED} answers ask ${ASK}`;
    // A ledger with no decision: the question the lock was kept in is no answer to it.
    for (const decisions of [[], DECISIONS.filter((d) => d.at !== AT)])
      expect(heldTo('lead', LOCK, KEPT, decisions)).toEqual({ _tag: 'Broken', why: lost });
    // A lock filed at another time, or naming another ask.
    expect(heldTo('lead', { ...LOCK, at: AT + 1 }, KEPT, DECISIONS)._tag).toEqual('Broken');
    expect(heldTo('lead', { ...LOCK, ask: 'a0000000000' }, KEPT, DECISIONS)._tag).toEqual('Broken');
  });
});

describe("a film's locked figures held to their locks", () => {
  it.effect.layer(BunServices.layer)('read no ledger while no figure is locked', () =>
    Effect.gen(function* () {
      expect(yield* unlocked('/no/ledger/here.json', [])).toEqual({ broken: [], overridden: [] });
    }),
  );

  it.effect.layer(BunServices.layer)(
    'hash each print and answer each figure apart, read against the ledger committed with the film',
    () =>
      Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem;
        const ledger = `${yield* fs.makeTempDirectoryScoped()}/righteousness-by-faith.json`;
        yield* fs.writeFileString(ledger, LEDGER);
        expect(yield* unlocked(ledger, [{ item: 'lead', lock: LOCK, print: 'abc' }])).toEqual({
          broken: [],
          overridden: [],
        });
        const answers = yield* unlocked(ledger, [
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
      }).pipe(Effect.scoped),
  );
});
