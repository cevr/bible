/** §9.4's ranking: RRF fusion, k = 60, original query weighted ×2, top-rank
 *  bonuses.
 *
 *  Pure and portable — ranked id lists in, one fused ranking out. No corpus, no
 *  service, no failure. §10's Milestone 8 asks that this "reproduces the fusion
 *  fixture exactly", which is only a checkable claim if the arithmetic lives
 *  somewhere a fixture can call directly.
 *
 *  **Reciprocal Rank Fusion** scores a document by summing `1 / (k + rank)` over
 *  the lists that ranked it. It is rank-based rather than score-based on purpose:
 *  BM25 scores and cosine similarities are not commensurable — one is unbounded
 *  and corpus-relative, the other is bounded and absolute — so any attempt to
 *  add them needs a normalization that is itself a tuning parameter. Ranks need
 *  none.
 */

import { Option } from 'effect';

/** RRF's smoothing constant (§9.4).
 *
 *  60 is the value from Cormack et al.'s original TREC evaluation, which qmd
 *  inherited and §9.4 pins. Its effect is to flatten the top of each list: at
 *  k = 60 the gap between rank 1 and rank 2 is 1/61 − 1/62 ≈ 0.00026, so a
 *  document has to be found by *both* legs to beat one found first by one. That
 *  is the property hybrid search wants — agreement between two different notions
 *  of relevance is stronger evidence than confidence within one.
 */
export const RRF_K = 60;

/** The weight §9.4 gives the original query's list.
 *
 *  ×2 relative to any other list. The lexical leg runs the reader's own words,
 *  and when a query expansion or a second embedding contributes a list, that list
 *  is answering a question the reader did not literally ask. Weighting the
 *  original at twice the derived keeps the reader's words the spine of the
 *  ranking while still letting a strong consensus elsewhere reorder it.
 */
export const ORIGINAL_QUERY_WEIGHT = 2;

/** §9.4's top-rank bonuses, added **once per document** from its best rank
 *  across every list.
 *
 *  RRF's flatness at k = 60 is the reason these exist. Without them a document
 *  that one leg is *certain* about — its own #1 — is worth 0.0164 while a
 *  document both legs put at #10 is worth 0.0286, so unanimous mediocrity
 *  outranks confident agreement. +0.05 for a #1 is roughly three RRF ranks of
 *  head start, enough to keep a top hit visible without letting it survive the
 *  other leg ranking it nowhere.
 *
 *  **Once per document, unweighted**, which is qmd's formula and not the
 *  obvious one. qmd sums `weight / (k + rank)` over the lists, tracks the best
 *  rank, and then adds a single bonus outside the loop
 *  (`store.ts` `reciprocalRankFusion`, ~4540). Two consequences the earlier
 *  reading of §9.4 got wrong:
 *
 *  1. A document that tops *both* lists is bonused once, not twice. The bonus
 *     answers "is any leg certain about this document" — a yes/no — and paying
 *     it twice would make agreement between legs worth more than the RRF terms
 *     that already express agreement.
 *  2. The bonus is not multiplied by the list's weight. The weight scales how
 *     much a list's *ranking* counts; the bonus is a property of the document's
 *     best position anywhere, so there is no single list whose weight it could
 *     wear.
 */
export const TOP_RANK_BONUS = 0.05;
export const NEAR_TOP_RANK_BONUS = 0.02;

/** One ranked list entering the fusion.
 *
 *  `weight` rather than a boolean `isOriginal`, because the weight is the thing
 *  the formula uses and a boolean would make every caller map it back to a
 *  number. `ORIGINAL_QUERY_WEIGHT` is the value the original list passes.
 */
export interface FusionList {
  /** Document ids in rank order, best first. Rank is the position, so a list
   *  with a duplicate id is a bug in the leg that produced it: the second
   *  occurrence would be scored as a worse rank for a document already scored. */
  readonly ids: readonly string[];
  readonly weight: number;
}

/** One document's place in the fused ranking. */
export interface FusedHit {
  readonly id: string;
  readonly score: number;
  /** 1-based rank in each input list that carried this document, in the order
   *  the lists were passed. Absent where a list did not rank it. */
  readonly ranks: readonly Option.Option<number>[];
}

/** §9.4's bonus for a document's best 1-based rank: +0.05 at #1, +0.02 at #2-3,
 *  nothing below. Applied once per document, never per list. */
export const rankBonus = (bestRank: number): number => {
  if (bestRank === 1) return TOP_RANK_BONUS;
  if (bestRank <= 3) return NEAR_TOP_RANK_BONUS;
  return 0;
};

/** One document's reciprocal-rank term from one list, at a 1-based rank.
 *
 *  `weight / (k + rank)` and nothing else. The bonus is not here because it is
 *  not a per-list quantity: it is added once, from the best rank the document
 *  reached in any list, after every list has been summed.
 */
export const contribution = (rank: number, weight: number): number => weight / (RRF_K + rank);

/** Fuses any number of ranked lists into one ranking (§9.4).
 *
 *  Ties break by first appearance across the lists in the order they were
 *  passed, which makes the output a function of the inputs alone. Sorting by
 *  score with an unstable comparator would let two runs over identical inputs
 *  produce two orders — and §9.7 requires ordered result identities to match
 *  across three clients, which a nondeterministic tiebreak makes untestable.
 */
export const fuse = (lists: readonly FusionList[]): readonly FusedHit[] => {
  const scores = new Map<string, number>();
  const ranks = new Map<string, Option.Option<number>[]>();
  const order = new Map<string, number>();
  /** Each document's best 1-based rank in any list — qmd's `topRank`, which the
   *  single bonus below reads. */
  const bestRank = new Map<string, number>();
  let seen = 0;

  lists.forEach((list, listIndex) => {
    list.ids.forEach((id, index) => {
      const rank = index + 1;
      const placed = Option.getOrElse(Option.fromNullishOr(ranks.get(id)), () => {
        const fresh = lists.map(() => Option.none<number>());
        ranks.set(id, fresh);
        order.set(id, seen);
        seen += 1;
        return fresh;
      });
      // A duplicate id inside one list is scored once, at its best rank: the
      // leg's first mention is its opinion, and adding the second would let a
      // buggy leg inflate a document by repeating it.
      if (Option.isSome(placed[listIndex] ?? Option.none())) return;
      placed[listIndex] = Option.some(rank);
      scores.set(id, (scores.get(id) ?? 0) + contribution(rank, list.weight));
      bestRank.set(id, Math.min(bestRank.get(id) ?? rank, rank));
    });
  });

  return [...scores.entries()]
    .map(([id, score]) => ({
      id,
      // The one bonus, from the best rank anywhere, outside the per-list sum.
      score: score + rankBonus(bestRank.get(id) ?? Number.MAX_SAFE_INTEGER),
      ranks: ranks.get(id) ?? [],
    }))
    .sort((left, right) => {
      if (right.score !== left.score) return right.score - left.score;
      return (order.get(left.id) ?? 0) - (order.get(right.id) ?? 0);
    });
};
