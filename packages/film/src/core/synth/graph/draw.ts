// The sound graph's draws. Every random number a render takes comes from a
// stream named for where it is taken: a node's seed is the render's seed and
// its place (or its `stream` name), and each of its fields draws from its own
// stream of that seed. So an edit to one node or one field leaves every other
// draw as it was, and a longer noise keeps its first samples.

import { fnv1a, hash2, rng } from '../../random.ts';
import { exp, log } from './math.ts';
import { type Pick, type Value, isPick, isVary } from './nodes.ts';

/** 2^32: a hash in [0, 1) times this is its unsigned 32-bit integer, exactly. */
const TWO_32 = 4294967296;

/** The seed of the stream `name` of `seed`: one unsigned 32-bit integer. */
export const streamSeed = (seed: number, name: string): number =>
  (hash2(seed, fnv1a(name)) * TWO_32) >>> 0;

/** One draw in [0, 1) from the stream `field` of `seed`. */
export const uniform = (seed: number, field: string): number => rng(streamSeed(seed, field))();

/** Where a node's draws come from: its seed, and the variant a `Pick` by seed plays. */
export interface Draws {
  readonly seed: number;
  readonly variant: number;
}

/** The choice a `Pick` plays: the variant's own (variant n plays `of[(n − 1) mod k]`), or one drawn. */
const picked = <U>(pick: Pick<U>, draws: Draws, field: string): U => {
  const k = pick.of.length;
  const index =
    pick.by === 'seed'
      ? (((draws.variant - 1) % k) + k) % k
      : Math.min(k - 1, Math.floor(uniform(draws.seed, field) * k));
  return pick.of[index] ?? pick.of[0];
};

/** A value drawn once: a constant as written, a range evenly (or evenly in its logarithm), a choice. */
export const drawValue = <U>(
  value: Value<U>,
  toNumber: (u: U) => number,
  draws: Draws,
  field: string,
): number => {
  if (isPick(value)) return toNumber(picked(value, draws, field));
  if (!isVary(value)) return toNumber(value);
  const lo = toNumber(value.min);
  const hi = toNumber(value.max);
  const u = uniform(draws.seed, field);
  if (value.curve === 'log') return exp(log(lo) + u * (log(hi) - log(lo)));
  return lo + u * (hi - lo);
};

/** A count drawn once: a range's whole numbers each as likely. */
export const drawInt = (value: Value<number>, draws: Draws, field: string): number => {
  if (isPick(value)) return picked(value, draws, field);
  if (!isVary(value)) return value;
  const lo = Math.min(value.min, value.max);
  const hi = Math.max(value.min, value.max);
  return Math.min(hi, lo + Math.floor(uniform(draws.seed, field) * (hi - lo + 1)));
};

/** A number as itself: the unit of every field that is not a pitch. */
export const plain = (u: number): number => u;
