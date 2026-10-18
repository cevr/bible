// What holds an override to the owner's words: every override a figure
// carries, wherever it is laid and whatever rule it frees (`overridesIn`);
// each whose quote is not, verbatim, his on his production's ledger is
// broken itself (`unquoted`); and the ledger a film's build reads for them
// (`unsaid`), whose decisions' and notes' quotes are his and whose
// questions' are not.

import { BunServices } from '@effect/platform-bun';
import { describe, expect, it } from 'effect-bun-test';
import { test } from 'bun:test';
import { Effect, FileSystem } from 'effect';
import { unsaid } from './build.ts';
import { overridesIn, unquoted } from './override.ts';

/** The owner's words on a ledger: a decision's quote and a note's. */
const SAID = new Set(['lets lock in that style', 'lock in a rig and a style']);

/** An override of the lead's lock, in words the owner said. */
const LOCKED = {
  rule: 'FigureLock',
  place: 'lead',
  reason: 'his ear a unit back',
  quote: 'lets lock in that style',
  frees: 'b'.repeat(64),
};

/** An override of InnerRim on an ear, in words the owner said. */
const RIMMED = {
  rule: 'InnerRim',
  place: 'ear',
  reason: 'the ear reads as cut from the head',
  quote: 'lock in a rig and a style',
};

/** Words the owner never said. */
const FABRICATED = 'move his ear back, the owner wants it';

/** Why an override of `rule` at `place` on the lead, in `quote`, is broken. */
const unsaidWhy = (rule: string, place: string, quote: string) =>
  `lead's override of ${rule} at ${place} is broken: its quote is not on the ledger: no decision or note filed on his production says "${quote}"`;

/** A ledger whose decision and note say `SAID`'s words, and whose question says words of its own. */
const LEDGER = `{
  "production": "righteousness-by-faith",
  "title": "Righteousness by Faith",
  "versions": [{ "at": 0, "title": "the first" }],
  "said": [
    { "_tag": "Asked", "at": 1, "text": "Keep and lock them?", "quote": "Keep and lock them?" },
    { "_tag": "Decided", "at": 2, "text": "Lock the court figures", "quote": "lets lock in that style" },
    { "_tag": "Decided", "at": 3, "text": "Keep and lock them", "ask": "a92f276635e" },
    { "_tag": "Noted", "at": 4, "text": "The aim of the style work", "quote": "lock in a rig and a style" }
  ]
}`;

describe('an override', () => {
  test('is found wherever a figure lays it, whatever rule it frees', () => {
    const laid = {
      lock: { item: 'lead', override: LOCKED },
      head: { _tag: 'TracedHead', y: -79, outline: [[0, 0]] },
      ear: { _tag: 'Ear', at: [54, 17.5], override: RIMMED },
      states: [{ _tag: 'Stain' }],
      knobs: { gazeX: 0 },
    };
    expect(overridesIn(laid)).toEqual([LOCKED, RIMMED]);
    expect(overridesIn({ head: { _tag: 'RoundHead', y: 0 }, knobs: { faceY: 0 } })).toEqual([]);
  });

  test("in the owner's words, verbatim, is his", () => {
    expect(
      unquoted(
        [
          { item: 'lead', override: LOCKED },
          { item: 'lead', override: RIMMED },
        ],
        SAID,
      ),
    ).toEqual([]);
  });

  test('in words he never said is broken itself, whatever rule it frees', () => {
    const lock = { item: 'lead', override: { ...LOCKED, quote: FABRICATED } };
    const rim = { item: 'lead', override: { ...RIMMED, quote: FABRICATED } };
    expect(unquoted([lock, rim], SAID)).toEqual([
      { ...lock, why: unsaidWhy('FigureLock', 'lead', FABRICATED) },
      { ...rim, why: unsaidWhy('InnerRim', 'ear', FABRICATED) },
    ]);
  });

  test('in his words changed by a letter, or cut short, is broken', () => {
    for (const quote of [
      'Lets lock in that style',
      'lets lock in that style.',
      'lock in that style',
    ])
      expect(unquoted([{ item: 'lead', override: { ...LOCKED, quote } }], SAID)).toHaveLength(1);
  });
});

describe("a film's build", () => {
  it.effect.layer(BunServices.layer)('reads no ledger while no override is laid', () =>
    Effect.gen(function* () {
      expect(yield* unsaid('/no/ledger/here.json', [])).toEqual([]);
    }),
  );

  it.effect.layer(BunServices.layer)(
    "holds each override to his decisions' and notes' words on the ledger, never a question's",
    () =>
      Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem;
        const ledger = `${yield* fs.makeTempDirectoryScoped()}/righteousness-by-faith.json`;
        yield* fs.writeFileString(ledger, LEDGER);
        const asked = { ...LOCKED, quote: 'Keep and lock them?' };
        const broken = yield* unsaid(ledger, [
          { item: 'lead', override: LOCKED },
          { item: 'lead', override: RIMMED },
          { item: 'lead', override: asked },
          { item: 'lead', override: { ...RIMMED, quote: FABRICATED } },
        ]);
        expect(broken.map((b) => b.why)).toEqual([
          unsaidWhy('FigureLock', 'lead', 'Keep and lock them?'),
          unsaidWhy('InnerRim', 'ear', FABRICATED),
        ]);
      }).pipe(Effect.scoped),
  );
});
