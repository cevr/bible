/** §10 Milestone 8: "RRF k=60 with ×2 original weighting and top-rank bonuses
 *  reproduces the fusion fixture exactly."
 *
 *  "Exactly" is the word that shapes this file. The fixture below is not a
 *  regression snapshot taken from the implementation — it is the arithmetic
 *  written out by hand from §9.4's four rules, so a change to the formula fails
 *  here even if the new formula is self-consistent. A fixture generated from the
 *  code it tests can only ever prove the code is deterministic. */

import { describe, expect, it } from 'bun:test';
import { Option } from 'effect';

import {
  contribution,
  fuse,
  NEAR_TOP_RANK_BONUS,
  ORIGINAL_QUERY_WEIGHT,
  rankBonus,
  RRF_K,
  TOP_RANK_BONUS,
} from './fusion.js';

/** §9.4's four constants, pinned. A silent change to any of them reorders every
 *  result the three clients show, so they are asserted rather than imported and
 *  trusted. */
describe('§9.4 the pinned constants', () => {
  it('is RRF with k = 60', () => {
    expect(RRF_K).toBe(60);
  });

  it('weights the original query ×2', () => {
    expect(ORIGINAL_QUERY_WEIGHT).toBe(2);
  });

  it('gives +0.05 to a list’s #1 and +0.02 to its #2-3', () => {
    expect(TOP_RANK_BONUS).toBe(0.05);
    expect(NEAR_TOP_RANK_BONUS).toBe(0.02);
  });
});

describe('§9.4 one contribution', () => {
  it('is weight / (k + rank), with no bonus in it', () => {
    // Written out longhand rather than by calling the function under test.
    // qmd's `rrfContribution = weight / (k + rank + 1)` over a 0-based rank,
    // which is `weight / (k + rank)` over the 1-based rank used here.
    expect(contribution(1, 1)).toBeCloseTo(1 / 61, 12);
    expect(contribution(2, 1)).toBeCloseTo(1 / 62, 12);
    expect(contribution(3, 1)).toBeCloseTo(1 / 63, 12);
    expect(contribution(4, 1)).toBeCloseTo(1 / 64, 12);
  });

  it('scales the reciprocal term by the weight', () => {
    expect(contribution(1, 2)).toBeCloseTo(2 / 61, 12);
  });

  it('carries no bonus, because the bonus is not a per-list quantity', () => {
    // The distinction the old formula lost: a rank-1 contribution and a rank-4
    // contribution differ only by the RRF term. The bonus is added once per
    // document, from its best rank anywhere, after every list is summed.
    expect(contribution(1, 1) - 1 / 61).toBeCloseTo(0, 12);
  });
});

describe('§9.4 the one bonus', () => {
  it('is +0.05 at best rank 1, +0.02 at best rank 2-3, nothing below', () => {
    expect(rankBonus(1)).toBe(TOP_RANK_BONUS);
    expect(rankBonus(2)).toBe(NEAR_TOP_RANK_BONUS);
    expect(rankBonus(3)).toBe(NEAR_TOP_RANK_BONUS);
    expect(rankBonus(4)).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// The fixture
// ---------------------------------------------------------------------------

/** Two ranked lists over five documents, chosen so every branch of §9.4 shows
 *  up in the answer:
 *
 *  - `a` tops the lexical list and sits 4th in the vector list — the confident
 *    top hit that also has broad agreement.
 *  - `b` is 2nd lexically and 1st by vector — a top-rank bonus in each list,
 *    one of them weighted.
 *  - `c` is 3rd in both — the bonus band twice, no #1.
 *  - `d` appears only in the lexical list, deep.
 *  - `e` appears only in the vector list, at its #2. */
const LEXICAL = ['a', 'b', 'c', 'd'];
const VECTOR = ['b', 'e', 'c', 'a'];

/** The scores, computed by hand from qmd's formula: sum `weight / (60 + rank)`
 *  over the lists, then add ONE unweighted bonus from the document's best rank
 *  in any list.
 *
 *  Every line is `Σ weight/(k+rank)` + `bonus(min rank)`, written out rather
 *  than derived, so a change back to a per-list or weighted bonus fails here. */
const EXPECTED = {
  // lexical #1 (×2), vector #4; best rank 1 → +0.05, once, unweighted.
  a: 2 / 61 + 1 / 64 + TOP_RANK_BONUS,
  // lexical #2 (×2), vector #1; best rank 1 → +0.05. Tops one list only once.
  b: 2 / 62 + 1 / 61 + TOP_RANK_BONUS,
  // lexical #3 (×2), vector #3; best rank 3 → +0.02, once — not twice for
  // being in the bonus band of both lists.
  c: 2 / 63 + 1 / 63 + NEAR_TOP_RANK_BONUS,
  // lexical #4 (×2) only; best rank 4 → no bonus.
  d: 2 / 64,
  // vector #2 only; best rank 2 → +0.02.
  e: 1 / 62 + NEAR_TOP_RANK_BONUS,
} as const;

describe('§9.4 the fusion fixture', () => {
  const fused = fuse([
    { ids: LEXICAL, weight: ORIGINAL_QUERY_WEIGHT },
    { ids: VECTOR, weight: 1 },
  ]);

  it('reproduces every score exactly', () => {
    for (const hit of fused) {
      expect(hit.score).toBeCloseTo(EXPECTED[hit.id as keyof typeof EXPECTED], 12);
    }
    expect(fused.length).toBe(5);
  });

  it('produces the order those scores imply', () => {
    // Not a hand-written order: the ranking is whatever the hand-written scores
    // sort to, so this asserts the sort rather than restating the arithmetic.
    const byScore = Object.entries(EXPECTED)
      .sort(([, left], [, right]) => right - left)
      .map(([id]) => id);
    expect(fused.map((hit) => hit.id)).toEqual(byScore);
  });

  it('bonuses a document once even when it tops one list and nearly tops another', () => {
    // The behavioral difference the correct formula makes, stated as the
    // number rather than as a preference. `a` tops the ×2 lexical list; `b`
    // tops the vector list and is 2nd lexically. Under a per-list weighted
    // bonus `a` would collect 0.100 and win. Under qmd's single unweighted
    // bonus both collect 0.05 exactly once, and the ranking is then decided by
    // the reciprocal terms alone — where `b`'s (2/62 + 1/61) edges `a`'s
    // (2/61 + 1/64) by 0.00024.
    const order = fused.map((hit) => hit.id);
    expect(order.indexOf('b')).toBeLessThan(order.indexOf('a'));
    expect((EXPECTED.b - EXPECTED.a).toFixed(5)).toBe('0.00024');
  });

  it('gives a document that tops two lists no more bonus than one that tops one', () => {
    // The property that makes the bonus a yes/no rather than a tally. Both
    // documents here top both lists or one list; the bonus is 0.05 either way,
    // and only the reciprocal terms separate them.
    const both = fuse([
      { ids: ['x'], weight: 1 },
      { ids: ['x'], weight: 1 },
    ]);
    expect(both[0]?.score).toBeCloseTo(1 / 61 + 1 / 61 + TOP_RANK_BONUS, 12);
    const one = fuse([{ ids: ['x'], weight: 1 }]);
    expect(one[0]?.score).toBeCloseTo(1 / 61 + TOP_RANK_BONUS, 12);
    // Exactly one bonus in each — the difference is the second RRF term alone.
    expect((both[0]?.score ?? 0) - (one[0]?.score ?? 0)).toBeCloseTo(1 / 61, 12);
  });

  it('does not multiply the bonus by the weight', () => {
    // A ×2 list's #1 gets 2/61 + 0.05, not 2 × (1/61 + 0.05).
    const weighted = fuse([{ ids: ['x'], weight: ORIGINAL_QUERY_WEIGHT }]);
    expect(weighted[0]?.score).toBeCloseTo(2 / 61 + TOP_RANK_BONUS, 12);
  });

  it('lifts a doubly-agreed document above one the weighted list ranked higher', () => {
    // The other half of the same trade, and the observable point of fusing at
    // all: `d` is 4th lexically and nowhere by vector; `e` is nowhere lexically
    // and 2nd by vector. Weighted RRF puts `e` first, so a document the reader's
    // literal words nearly missed can still surface on the strength of one
    // leg's confidence.
    const order = fused.map((hit) => hit.id);
    expect(order.indexOf('e')).toBeLessThan(order.indexOf('d'));
  });

  it('carries each document’s rank in each list, positionally', () => {
    const a = fused.find((hit) => hit.id === 'a');
    expect(a?.ranks).toEqual([Option.some(1), Option.some(4)]);
    const e = fused.find((hit) => hit.id === 'e');
    // Absent from the lexical list entirely — the case the fused ranking exists
    // to surface, and the case a client renders differently.
    expect(e?.ranks).toEqual([Option.none(), Option.some(2)]);
  });
});

describe('§9.4 fusion is a function of its inputs', () => {
  it('breaks ties by first appearance, not by iteration order', () => {
    // Two lists that rank two documents identically. §9.7 asks three clients to
    // agree on ordered identities, which an unstable tiebreak makes untestable.
    const fused = fuse([
      { ids: ['x', 'y'], weight: 1 },
      { ids: ['y', 'x'], weight: 1 },
    ]);
    expect(fused.map((hit) => hit.id)).toEqual(['x', 'y']);
    expect(fused[0]?.score).toBeCloseTo(fused[1]?.score ?? 0, 12);
  });

  it('scores a repeated id once, at its best rank', () => {
    // A leg that mentions a document twice has one opinion about it. Summing
    // both would let a buggy leg inflate a document by repeating it.
    const fused = fuse([{ ids: ['x', 'x'], weight: 1 }]);
    expect(fused.length).toBe(1);
    expect(fused[0]?.score).toBeCloseTo(1 / 61 + TOP_RANK_BONUS, 12);
    expect(fused[0]?.ranks).toEqual([Option.some(1)]);
  });

  it('an empty list contributes nothing and breaks nothing', () => {
    // The lexical-only case: this is what every `VectorIndexUnavailable` result
    // fuses, so it has to be the identity rather than an edge case.
    const withVector = fuse([
      { ids: LEXICAL, weight: ORIGINAL_QUERY_WEIGHT },
      { ids: [], weight: 1 },
    ]);
    expect(withVector.map((hit) => hit.id)).toEqual(LEXICAL);
    for (const hit of withVector) {
      expect(hit.ranks[1]).toEqual(Option.none());
    }
  });
});
