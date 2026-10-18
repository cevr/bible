// What holds an override to the owner's word: every override a figure
// carries, wherever it is laid and whatever rule it frees (`overridesIn`);
// the word it cites, his words verbatim or his pick on an ask, one and never
// both (`overrideOf`, as a lock reads its override); each whose quote is
// not, verbatim, his on his production's ledger, or whose answer is not a
// pick the ledger filed with the decision that answered that ask, broken
// itself (`unbacked`); and the ledger a film's build reads for them
// (`unsaid`), whose decisions' and notes' quotes are his and whose
// questions' are not.

import { BunServices } from '@effect/platform-bun';
import { describe, expect, it } from 'effect-bun-test';
import { test } from 'bun:test';
import { Effect, FileSystem } from 'effect';
import { unsaid } from './build.ts';
import { decodeLock } from './lock.ts';
import { overridesIn, unbacked } from './override.ts';

/** The ask the owner kept and locked the court figures in, and his pick there. */
const LOCK_ASK = 'a92f276635e';

/** The owner's word on a ledger: a decision's quote and a note's, and the pick an ask filed with its decision. */
const WORDS = {
  quotes: new Set(['lets lock in that style', 'lock in a rig and a style']),
  picks: new Map([[LOCK_ASK, { keep: 'lock', notes: 'none' }]]),
};

/** An override of the lead's lock, in words the owner said. */
const LOCKED = {
  rule: 'FigureLock' as const,
  place: 'lead',
  reason: 'his ear a unit back',
  quote: 'lets lock in that style',
  frees: 'b'.repeat(64),
};

/** An override of the lead's lock, citing the owner's pick on the ask he locked it in. */
const PICKED = {
  rule: 'FigureLock' as const,
  place: 'lead',
  reason: 'his ear a unit back',
  answer: { ask: LOCK_ASK, question: 'keep', value: 'lock' },
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

/** An ask id no ledger files. */
const FABRICATED_ASK = 'a0000000000';

/** Why an override of `rule` at `place` on the lead, in `quote`, is broken. */
const unsaidWhy = (rule: string, place: string, quote: string) =>
  `lead's override of ${rule} at ${place} is broken: its quote is not on the ledger: no decision or note filed on his production says "${quote}"`;

/** Why an override of the lead's lock, citing `value` for `question` on ask `ask`, is broken. */
const unpickedWhy = (ask: string, question: string, value: string) =>
  `lead's override of FigureLock at lead is broken: its answer is not on the ledger: no decision filed on his production by ask ${ask} picks "${value}" for ${question}`;

/** The lead's lock override citing `value` for `question` on ask `ask`. */
const answering = (ask: string, question: string, value: string) => ({
  item: 'lead',
  override: { ...PICKED, answer: { ask, question, value } },
});

/**
 * A ledger whose decision and note say `WORDS`' quotes, whose question says
 * words of its own, whose decision answering the lock's ask files his pick,
 * and whose other ask was asked, then withdrawn, never answered.
 */
const LEDGER = `{
  "production": "righteousness-by-faith",
  "title": "Righteousness by Faith",
  "versions": [{ "at": 0, "title": "the first" }],
  "said": [
    { "_tag": "Asked", "at": 1, "text": "Keep and lock them?", "quote": "Keep and lock them?", "ask": "${LOCK_ASK}" },
    { "_tag": "Decided", "at": 2, "text": "Lock the court figures", "quote": "lets lock in that style" },
    { "_tag": "Decided", "at": 3, "text": "Keep and lock them", "ask": "${LOCK_ASK}", "picks": { "keep": "lock" } },
    { "_tag": "Noted", "at": 4, "text": "The aim of the style work", "quote": "lock in a rig and a style" },
    { "_tag": "Asked", "at": 5, "text": "An arm?", "ask": "a0590057595", "picks": { "arm": "arm" } },
    { "_tag": "Noted", "at": 6, "text": "An arm? withdrawn", "ask": "a0590057595", "picks": { "arm": "arm" } }
  ]
}`;

/** The lead's lock as his file keeps it. */
const LOCK_FILE = {
  item: 'lead',
  version: 1,
  hash: 'a'.repeat(64),
  ask: LOCK_ASK,
  at: 1792281444576,
  seen: { set: 'concepts', file: 'images/lead.png' },
};

describe('an override', () => {
  test('is found wherever a figure lays it, whatever rule it frees and whatever it cites', () => {
    const laid = {
      lock: { item: 'lead', override: LOCKED },
      head: { _tag: 'TracedHead', y: -79, outline: [[0, 0]] },
      ear: { _tag: 'Ear', at: [54, 17.5], override: RIMMED },
      states: [{ _tag: 'Stain' }, { override: PICKED }],
      knobs: { gazeX: 0 },
    };
    expect(overridesIn(laid)).toEqual([LOCKED, RIMMED, PICKED]);
    expect(overridesIn({ head: { _tag: 'RoundHead', y: 0 }, knobs: { faceY: 0 } })).toEqual([]);
  });

  test("cites the owner's words or his pick, one, never both, nor neither", () => {
    expect(decodeLock({ ...LOCK_FILE, override: LOCKED }, 'lock').override).toEqual(LOCKED);
    expect(decodeLock({ ...LOCK_FILE, override: PICKED }, 'lock').override).toEqual(PICKED);
    expect(() =>
      decodeLock({ ...LOCK_FILE, override: { ...PICKED, quote: LOCKED.quote } }, 'lock'),
    ).toThrow(/lock refused/);
    const { rule, place, reason, frees } = LOCKED;
    expect(() =>
      // @ts-expect-error an override cites the owner's words or his pick
      decodeLock({ ...LOCK_FILE, override: { rule, place, reason, frees } }, 'lock'),
    ).toThrow(/lock refused/);
  });

  test("in the owner's words, verbatim, or in his pick, is his", () => {
    expect(
      unbacked(
        [
          { item: 'lead', override: LOCKED },
          { item: 'lead', override: RIMMED },
          { item: 'lead', override: PICKED },
        ],
        WORDS,
      ),
    ).toEqual([]);
  });

  test('in words he never said is broken itself, whatever rule it frees', () => {
    const lock = { item: 'lead', override: { ...LOCKED, quote: FABRICATED } };
    const rim = { item: 'lead', override: { ...RIMMED, quote: FABRICATED } };
    expect(unbacked([lock, rim], WORDS)).toEqual([
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
      expect(unbacked([{ item: 'lead', override: { ...LOCKED, quote } }], WORDS)).toHaveLength(1);
  });

  test('citing an ask no decision answered, or a value he did not pick there, is broken', () => {
    const fabricated = answering(FABRICATED_ASK, 'keep', 'lock');
    const unpicked = answering(LOCK_ASK, 'keep', 'revise');
    // The value he picked for another question there is not his pick for this one.
    const elsewhere = answering(LOCK_ASK, 'notes', 'lock');
    expect(unbacked([fabricated, unpicked, elsewhere], WORDS)).toEqual([
      { ...fabricated, why: unpickedWhy(FABRICATED_ASK, 'keep', 'lock') },
      { ...unpicked, why: unpickedWhy(LOCK_ASK, 'keep', 'revise') },
      { ...elsewhere, why: unpickedWhy(LOCK_ASK, 'notes', 'lock') },
    ]);
  });
});

describe("a film's build", () => {
  it.effect.layer(BunServices.layer)('reads no ledger while no override is laid', () =>
    Effect.gen(function* () {
      expect(yield* unsaid('/no/ledger/here.json', [])).toEqual([]);
    }),
  );

  it.effect.layer(BunServices.layer)(
    "holds each override to his decisions' and notes' words and to the picks his answers filed, never a question's",
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
          { item: 'lead', override: PICKED },
          answering(FABRICATED_ASK, 'keep', 'lock'),
          answering(LOCK_ASK, 'keep', 'revise'),
          // Asked, then withdrawn: what the question and the withdrawal carry is no pick of his.
          answering('a0590057595', 'arm', 'arm'),
        ]);
        expect(broken.map((b) => b.why)).toEqual([
          unsaidWhy('FigureLock', 'lead', 'Keep and lock them?'),
          unsaidWhy('InnerRim', 'ear', FABRICATED),
          unpickedWhy(FABRICATED_ASK, 'keep', 'lock'),
          unpickedWhy(LOCK_ASK, 'keep', 'revise'),
          unpickedWhy('a0590057595', 'arm', 'arm'),
        ]);
      }).pipe(Effect.scoped),
  );
});
