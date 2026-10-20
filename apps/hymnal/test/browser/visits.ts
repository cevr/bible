/* oxlint-disable effect/noTernary, effect/noNullish -- the browser test's sampler, plain arithmetic over small tables. */

/**
 * The cases the browser test (`list.test.ts`) runs, drawn from the
 * property's whole domain by a seeded sampler. The domain is a product:
 * - a visit: each list × each way back × each offset (by share of the
 *   list's height, its first rows to its very end) × each window height ×
 *   each move after the return × whether the reader presses a row at once
 *   after his scroll or after a pause;
 * - a cold load: each list × each window height × the offset scrolled
 *   before hydration × the offset scrolled after it.
 * The whole product is too many cases for the test's time, so each run
 * draws its cases from a seed: every pair of values its domain names
 * meets in at least one case, and the seed decides the rest, so runs with
 * other seeds reach other cases of the product. A visit's every two axes
 * meet: every value of every axis runs, every move meets every height and
 * every offset, and each list's end meets the smallest and the tallest
 * window. A cold load's window height meets every offset before hydration
 * and every offset after it. `uncovered` names the pairs a set of cases
 * misses, so the test can say none is missed.
 * Kept apart from the test so it can be read without a browser.
 */

import { type ListName } from './routes';

/** Window heights, in CSS pixels: a small phone's to a tall Mac window's. */
export const heights = [320, 568, 874, 1400] as const;

/** The offsets, by share of the list's height: its first rows to its very end. */
export const shares = [0.005, 0.1, 0.33, 0.6, 0.85, 1] as const;

/** The ways back to a list after the reader leaves it. */
export const ways = ['back', 'header', 'tab'] as const;
export type Way = (typeof ways)[number];

/** What the reader does after the list is back: the Search list alone has a search to empty. */
export const movesOf = {
  hymns: ['top', 'fling', 'onward'],
  search: ['top', 'fling', 'nothing', 'onward'],
} as const satisfies Record<ListName, ReadonlyArray<string>>;
export type Move = (typeof movesOf)[ListName][number];

/** When he presses a row after his scroll: at once, or after a pause. */
export const presses = ['now', 'later'] as const;
export type Press = (typeof presses)[number];

export interface Visit {
  readonly way: Way;
  readonly share: number;
  readonly height: number;
  readonly move: Move;
  readonly press: Press;
}

export interface Cold {
  readonly height: number;
  /** The share of the list's height scrolled to before hydration. */
  readonly before: number;
  /** The share scrolled to after it. */
  readonly after: number;
}

type Axes = Readonly<Record<string, ReadonlyArray<string | number>>>;

/** A domain: its axes, each with its values, and the axes whose every pair of values must meet. */
export interface Domain<A extends Axes> {
  readonly axes: A;
  readonly meet: ReadonlyArray<readonly [keyof A & string, keyof A & string]>;
}

type Case<A extends Axes> = { readonly [K in keyof A]: A[K][number] };

/** Every two of `names`. */
const everyTwo = <N extends string>(names: ReadonlyArray<N>) =>
  names.flatMap((a, i) => names.slice(i + 1).map((b) => [a, b] as const));

/** A list's visits: every two axes meet. */
export const visitDomain = (list: ListName) => {
  const axes = {
    way: ways,
    share: shares,
    height: heights,
    move: movesOf[list],
    press: presses,
  } as const;
  return {
    axes,
    meet: everyTwo(['way', 'share', 'height', 'move', 'press'] as const),
  } satisfies Domain<typeof axes>;
};

/**
 * A list's cold loads: each window height meets every offset scrolled
 * before hydration and every offset scrolled after it.
 */
export const coldDomain = {
  axes: { height: heights, before: shares, after: shares },
  meet: [
    ['height', 'before'],
    ['height', 'after'],
  ],
} as const satisfies Domain<{
  height: typeof heights;
  before: typeof shares;
  after: typeof shares;
}>;

/** A seeded source of numbers in [0, 1) (mulberry32): the same seed, the same cases. */
const random = (seed: number) => {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
};

type Value = string | number;

const key = (a: string, x: Value | undefined, b: string, y: Value | undefined) =>
  `${a}=${x} ${b}=${y}`;

/** Every pair of values that must meet, each named "<axis>=<value> <axis>=<value>". */
const pairsOf = <A extends Axes>({ axes, meet }: Domain<A>): Array<string> =>
  meet.flatMap(([a, b]) =>
    (axes[a] ?? []).flatMap((x) => (axes[b] ?? []).map((y) => key(a, x, b, y))),
  );

/** The pairs that must meet that a case holds. */
const pairsIn = <A extends Axes>({ meet }: Domain<A>, c: { readonly [K in keyof A]: Value }) =>
  meet.map(([a, b]) => key(a, c[a], b, c[b]));

/** The pairs of values that must meet and that no case in `cases` holds. */
export const uncovered = <A extends Axes>(
  domain: Domain<A>,
  cases: ReadonlyArray<{ readonly [K in keyof A]: Value }>,
): Array<string> => {
  const held = new Set(cases.flatMap((c) => pairsIn(domain, c)));
  return pairsOf(domain).filter((pair) => !held.has(pair));
};

/** Every case of the product of `axes`. */
const productOf = <A extends Axes>(axes: A): Array<Case<A>> =>
  Object.entries(axes).reduce<Array<Record<string, string | number>>>(
    (cases, [name, values]) => cases.flatMap((c) => values.map((v) => ({ ...c, [name]: v }))),
    [{}],
  ) as Array<Case<A>>;

/**
 * Cases of `domain` in which every pair that must meet does, drawn from
 * `seed`: each next case is, of the product's cases, one that holds the
 * most pairs not yet held, the seed breaking ties; it stops once every pair
 * is held.
 */
const sample = <A extends Axes>(domain: Domain<A>, seed: number): Array<Case<A>> => {
  const next = random(seed);
  const all = productOf(domain.axes);
  const open = new Set(pairsOf(domain));
  const cases: Array<Case<A>> = [];
  while (open.size > 0) {
    let best: Array<Case<A>> = [];
    let most = 0;
    for (const c of all) {
      const gain = pairsIn(domain, c).filter((pair) => open.has(pair)).length;
      if (gain > most) [best, most] = [[c], gain];
      else if (gain === most) best.push(c);
    }
    const chosen = best[Math.floor(next() * best.length)];
    if (chosen === undefined) break;
    for (const pair of pairsIn(domain, chosen)) open.delete(pair);
    cases.push(chosen);
  }
  return cases;
};

/** A list's visits for `seed`. */
export const visitsOf = (list: ListName, seed: number): Array<Visit> =>
  sample(visitDomain(list), seed + (list === 'hymns' ? 0 : 1));

/** A list's cold loads for `seed`. */
export const coldsOf = (list: ListName, seed: number): Array<Cold> =>
  sample(coldDomain, seed + (list === 'hymns' ? 2 : 3));
