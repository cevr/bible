import { Effect } from 'effect';
import { describe, expect, it } from 'effect-bun-test';

import { agreementOf, sampleOf } from './quality.js';

/** Where an item of a sample came from. */
type Stratum = Parameters<typeof agreementOf>[1][number]['stratum'];
import { historyComment } from './testing.js';

/** The label of history at `p`. */
const labelAt = (p: number) => {
  if (p >= 0.5) return 'history';
  return 'today';
};

/** A kept answer of history at `p`. */
const at = (p: number) => ({ label: labelAt(p), probabilities: { history: p, today: 1 - p } });

/** Ten kept items of historyComment, `k0`…`k9`: the last three report (p 0.95), the rest do not (p 0.1). */
const KEPT = [0.1, 0.1, 0.1, 0.1, 0.1, 0.1, 0.1, 0.95, 0.95, 0.95].map((p, n) => ({
  rule: historyComment,
  key: `k${n}`,
  item: n,
  kept: at(p),
}));

describe('the quality sample', () => {
  it.effect(
    'draws each rule its random items and tops its findings up, each key once, by its seed',
    () =>
      Effect.sync(() => {
        const plan = { random: 4, findings: 3, seed: 7 };
        const sample = sampleOf([...KEPT, ...KEPT], [historyComment], plan);
        const keys = sample.map((entry) => entry.key);
        expect(new Set(keys).size).toBe(keys.length);
        const random = sample.filter((entry) => entry.stratum === 'random');
        expect(random).toHaveLength(4);
        // Three findings in all: those drawn at random, then kept ones past them.
        expect(sample.filter((entry) => entry.kept.label === 'history').length).toBe(3);
        expect(sampleOf(KEPT, [historyComment], plan)).toEqual(sample);
        expect(sampleOf(KEPT, [historyComment], { ...plan, seed: 8 })).not.toEqual(sample);
      }),
  );

  it.effect('sets each new answer beside its kept one', () =>
    Effect.sync(() => {
      const entry = (stratum: Stratum, key: string, p: number) => ({ stratum, key, kept: at(p) });
      const sample = [
        entry('random', 'a', 0.1),
        entry('random', 'b', 0.95),
        entry('random', 'c', 0.2),
        entry('finding', 'd', 0.92),
        entry('random', 'e', 0.3),
      ];
      const fresh = new Map([
        ['a', at(0.1)],
        ['b', at(0.6)],
        ['c', at(0.97)],
        ['d', at(0.92)],
      ]);
      const { movedRandom, movedFindings, ...counts } = agreementOf(historyComment, sample, fresh);
      expect(counts).toEqual({
        random: 3,
        labelKept: 2,
        findingKept: 1,
        newFindings: 1,
        findings: 2,
        findingsStill: 1,
        unanswered: 1,
      });
      expect([movedRandom.toFixed(4), movedFindings.toFixed(4)]).toEqual(['0.3733', '0.1750']);
    }),
  );
});
