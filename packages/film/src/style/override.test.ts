// What holds an override to the owner's word: every override a figure
// carries, wherever it is laid (`overridesIn`); the word it cites, his words
// verbatim or his pick on an ask, one and never both (`overrideOf`, as a lock
// reads its override); each that no decision of his on its figure allows,
// broken itself (`unbacked`): a decision filed at the point `item:<item>`,
// after the lock when the override frees one, whose words are the quote's,
// verbatim, or which answered the ask with the pick it cites; and the ledger
// a film's build reads for them (`unsaid`), whose questions and notes decide
// nothing.

import { BunServices } from '@effect/platform-bun';
import { describe, expect, it } from 'effect-bun-test';
import { test } from 'bun:test';
import { Effect, FileSystem, Schema } from 'effect';
import { ProductionFile, decisionsOf } from '../core/production.ts';
import { repoJson } from '../core/schema.ts';
import { unsaid } from './build.ts';
import { decodeLock } from './lock.ts';
import { type Laid, overrideOf, overridesIn, unbacked } from './override.ts';

/** The ask the owner kept and locked the court figures in, and the time the ledger filed his decision there. */
const LOCK_ASK = 'a92f276635e';
const LOCK_AT = 1792281444576;

/** An ask about the lead's ear, answered; one about the judge's; and one asked, then withdrawn. */
const EAR_ASK = 'a1111111111';
const JUDGE_ASK = 'a2222222222';
const ARM_ASK = 'a0590057595';

/** An override of the lead's lock, in words the owner said on him after the lock. */
const SAID = {
  rule: 'FigureLock' as const,
  place: 'lead',
  reason: 'his ear a unit back',
  quote: 'move his ear back a unit',
  frees: 'b'.repeat(64),
};

/** An override of the lead's lock, citing the owner's pick on an ask about him after the lock. */
const PICKED = {
  rule: 'FigureLock' as const,
  place: 'lead',
  reason: 'his ear a unit back',
  answer: { ask: EAR_ASK, question: 'ear', value: 'back' },
  frees: 'b'.repeat(64),
};

/**
 * A ledger round the lead's lock: before it, a decision on him and one on no
 * figure; the decision the lock names; after it, his note on the lead, a
 * decision on no figure, his decision on the lead, one on the judge, a
 * question on the lead and its answer's picks, a pick on the judge, and an
 * ask on the lead asked, then withdrawn.
 */
const LEDGER = `{
  "production": "righteousness-by-faith",
  "title": "Righteousness by Faith",
  "versions": [{ "at": 0, "title": "the first" }],
  "said": [
    { "_tag": "Asked", "at": ${LOCK_AT - 3}, "text": "Keep and lock them?", "quote": "Keep and lock them?", "ask": "${LOCK_ASK}", "set": "cold" },
    { "_tag": "Decided", "at": ${LOCK_AT - 2}, "text": "His ear as cut", "quote": "his ear as the concept cuts it", "set": "cast", "point": "item:lead" },
    { "_tag": "Decided", "at": ${LOCK_AT - 1}, "text": "The style", "quote": "lets lock in that style", "set": "concepts" },
    { "_tag": "Decided", "at": ${LOCK_AT}, "text": "Keep and lock them", "ask": "${LOCK_ASK}", "picks": { "keep": "lock" }, "set": "cold" },
    { "_tag": "Noted", "at": ${LOCK_AT + 1}, "text": "His ear", "quote": "move his ear back a unit", "set": "cast", "point": "item:lead" },
    { "_tag": "Decided", "at": ${LOCK_AT + 2}, "text": "The aim", "quote": "lock in a rig and a style", "set": "concepts" },
    { "_tag": "Decided", "at": ${LOCK_AT + 3}, "text": "His ear back", "quote": "move his ear back a unit", "set": "cast", "point": "item:lead" },
    { "_tag": "Decided", "at": ${LOCK_AT + 4}, "text": "The judge's ear", "quote": "the judge's ear too", "set": "cast", "point": "item:judge" },
    { "_tag": "Asked", "at": ${LOCK_AT + 5}, "text": "Move his ear back?", "quote": "Move his ear back?", "ask": "${EAR_ASK}", "set": "cast", "point": "item:lead" },
    { "_tag": "Decided", "at": ${LOCK_AT + 6}, "text": "Move his ear back? back", "ask": "${EAR_ASK}", "picks": { "ear": "back", "notes": "none" }, "set": "cast", "point": "item:lead" },
    { "_tag": "Decided", "at": ${LOCK_AT + 7}, "text": "The judge's ear? back", "ask": "${JUDGE_ASK}", "picks": { "ear": "back" }, "set": "cast", "point": "item:judge" },
    { "_tag": "Asked", "at": ${LOCK_AT + 8}, "text": "An arm?", "ask": "${ARM_ASK}", "picks": { "arm": "arm" }, "set": "cast", "point": "item:lead" },
    { "_tag": "Noted", "at": ${LOCK_AT + 9}, "text": "An arm? withdrawn", "ask": "${ARM_ASK}", "picks": { "arm": "arm" }, "set": "cast", "point": "item:lead" }
  ]
}`;

/** The owner's decisions on that ledger. */
const DECISIONS = decisionsOf(Schema.decodeSync(repoJson(ProductionFile))(LEDGER));

/** The lead's lock as his file keeps it. */
const LOCK_FILE = {
  item: 'lead',
  version: 1,
  hash: 'a'.repeat(64),
  ask: LOCK_ASK,
  at: LOCK_AT,
  seen: { set: 'concepts', file: 'images/lead.png' },
};

/** The lead's lock's override, laid as its film lays it: after the lock. */
const onLock = (override: Laid['override']): Laid => ({ item: 'lead', override, since: LOCK_AT });

/** The lead's lock's override, citing `value` for `question` on ask `ask`. */
const answering = (ask: string, question: string, value: string) =>
  onLock({ ...PICKED, answer: { ask, question, value } });

/** When the ledger filed the lead's lock, as a broken override names it. */
const AFTER = 'filed after his lock (2026-10-17T23:57:24.576Z)';

/** Why the lead's lock's override, quoting `quote`, is broken. */
const unsaidWhy = (quote: string) =>
  `lead's override of FigureLock at lead is broken: no decision on his production's ledger at the point item:lead, ${AFTER} says "${quote}": file his words as a decision there (\`film production decide\` with \`--quote\`, \`--set\` and \`--point item:lead\`), then quote them verbatim`;

/** Why the lead's lock's override, citing `value` for `question` on ask `ask`, is broken. */
const unpickedWhy = (ask: string, question: string, value: string) =>
  `lead's override of FigureLock at lead is broken: no decision on his production's ledger at the point item:lead, ${AFTER} answers ask ${ask} with "${value}" for ${question}: ask him with the point item:lead (the lab's \`ask\`, with its \`production\`, \`set\` and \`point\`), then cite the pick his answer files`;

describe('an override', () => {
  test('is found in whatever carries it, at any depth, by what every override carries', () => {
    const laid = {
      lock: { ...LOCK_FILE, override: SAID },
      head: { _tag: 'TracedHead', y: -79, outline: [[0, 0]] },
      states: [{ _tag: 'Stain' }, { lock: { ...LOCK_FILE, override: PICKED } }],
      knobs: { gazeX: 0 },
    };
    expect(overridesIn(laid)).toEqual([SAID, PICKED]);
    expect(overridesIn({ head: { _tag: 'RoundHead', y: 0 }, knobs: { faceY: 0 } })).toEqual([]);
  });

  test('is made only of a rule whose way is an override a part carries', () => {
    expect(overrideOf('FigureLock', {})).toBeDefined();
    // @ts-expect-error KitA's way is the owner's: no part carries an override of it
    overrideOf('KitA', {});
    // @ts-expect-error nothing frees GreyShade
    overrideOf('GreyShade', {});
  });

  test("cites the owner's words or his pick, one, never both, nor neither: else its rule refuses it, saying where", () => {
    expect(decodeLock({ ...LOCK_FILE, override: SAID }, 'lock').override).toEqual(SAID);
    expect(decodeLock({ ...LOCK_FILE, override: PICKED }, 'lock').override).toEqual(PICKED);
    const both = () =>
      decodeLock({ ...LOCK_FILE, override: { ...PICKED, quote: SAID.quote } }, 'lock');
    expect(both).toThrow(/^lock refused by FigureLock, /);
    // Neither form takes the other's citation.
    expect(both).toThrow(
      '): Expected no excess property\n  at ["override"]["answer"]\nExpected no excess property\n  at ["override"]["quote"]',
    );
    const { rule, place, reason, frees } = SAID;
    const neither = () =>
      // @ts-expect-error an override cites the owner's words or his pick
      decodeLock({ ...LOCK_FILE, override: { rule, place, reason, frees } }, 'lock');
    expect(neither).toThrow(/^lock refused by FigureLock, /);
    expect(neither).toThrow(
      '): Missing key\n  at ["override"]["quote"]\nMissing key\n  at ["override"]["answer"]',
    );
  });

  test('in his words on its figure after its lock, verbatim, or in his pick there, is his', () => {
    expect(unbacked([onLock(SAID), onLock(PICKED)], DECISIONS)).toEqual([]);
  });

  test('in words he never said, or his words on another figure, on none, or before its lock, or in a note, is broken', () => {
    const quotes = [
      'move his ear back, the owner wants it',
      // On the judge.
      "the judge's ear too",
      // On no figure: before the lock, and after it.
      'lets lock in that style',
      'lock in a rig and a style',
      // On the lead, before the lock.
      'his ear as the concept cuts it',
      // A question's words.
      'Move his ear back?',
    ];
    expect(
      unbacked(
        quotes.map((quote) => onLock({ ...SAID, quote })),
        DECISIONS,
      ),
    ).toEqual(quotes.map((quote) => ({ ...onLock({ ...SAID, quote }), why: unsaidWhy(quote) })));
    // His note on the lead after the lock says the very words, and decides nothing.
    const noted = DECISIONS.filter((d) => d.at !== LOCK_AT + 3);
    expect(unbacked([onLock(SAID)], noted)).toEqual([
      { ...onLock(SAID), why: unsaidWhy(SAID.quote) },
    ]);
  });

  test('in his words changed by a letter, or cut short, is broken', () => {
    for (const quote of ['Move his ear back a unit', 'move his ear back a unit.', 'his ear back'])
      expect(unbacked([onLock({ ...SAID, quote })], DECISIONS)).toHaveLength(1);
  });

  test('citing an ask no decision answered, a value he did not pick there, or a pick on another figure, before its lock or in a question, is broken', () => {
    const cases = [
      ['a0000000000', 'ear', 'back'],
      [EAR_ASK, 'ear', 'front'],
      // The value he picked for another question there is not his pick for this one.
      [EAR_ASK, 'notes', 'back'],
      // A pick on the judge.
      [JUDGE_ASK, 'ear', 'back'],
      // The pick the lock's own decision filed: on no figure, and not after the lock.
      [LOCK_ASK, 'keep', 'lock'],
      // Asked, then withdrawn: what the question and the withdrawal carry is no pick of his.
      [ARM_ASK, 'arm', 'arm'],
    ] as const;
    const laid = cases.map(([ask, question, value]) => ({
      laid: answering(ask, question, value),
      why: unpickedWhy(ask, question, value),
    }));
    expect(
      unbacked(
        laid.map((l) => l.laid),
        DECISIONS,
      ),
    ).toEqual(laid.map((l) => ({ ...l.laid, why: l.why })));
  });

  test('laid with no lock to follow may cite a decision of his on its figure from any time', () => {
    const before = { ...SAID, quote: 'his ear as the concept cuts it' };
    expect(unbacked([{ item: 'lead', override: before }], DECISIONS)).toEqual([]);
    expect(unbacked([onLock(before)], DECISIONS)).toHaveLength(1);
  });
});

describe("a film's build", () => {
  it.effect.layer(BunServices.layer)('reads no ledger while no override is laid', () =>
    Effect.gen(function* () {
      expect(yield* unsaid('/no/ledger/here.json', [])).toEqual([]);
    }),
  );

  it.effect.layer(BunServices.layer)(
    "holds each override to his decisions on its figure on the ledger committed with the film, never a question's or a note's",
    () =>
      Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem;
        const ledger = `${yield* fs.makeTempDirectoryScoped()}/righteousness-by-faith.json`;
        yield* fs.writeFileString(ledger, LEDGER);
        const broken = yield* unsaid(ledger, [
          onLock(SAID),
          onLock(PICKED),
          onLock({ ...SAID, quote: 'Move his ear back?' }),
          onLock({ ...SAID, quote: 'lets lock in that style' }),
          answering(JUDGE_ASK, 'ear', 'back'),
        ]);
        expect(broken.map((b) => b.why)).toEqual([
          unsaidWhy('Move his ear back?'),
          unsaidWhy('lets lock in that style'),
          unpickedWhy(JUDGE_ASK, 'ear', 'back'),
        ]);
      }).pipe(Effect.scoped),
  );
});
