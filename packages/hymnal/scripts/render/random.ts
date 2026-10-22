/**
 * CPython's `random.Random(seed)` for a string seed, and its `randint`: the
 * Mersenne Twister (MT19937) seeded as Python 3 seeds it (seed version 2,
 * the seed's UTF-8 bytes followed by their SHA-512, read as one big-endian
 * integer and fed to `init_by_array` as 32-bit words, least significant
 * first), and `randint(a, b)` as `a + _randbelow(b − a + 1)`, which draws
 * `getrandbits(k)` until the draw falls below the range.
 *
 * The velocities the owner heard in the listening pilot were drawn by
 * Python's `random` from the seed `<hymn padded>-<style>-<stem>`. Drawing the
 * same numbers keeps every stem's velocities note for note the pilot's.
 * Pure.
 */

import { createHash } from 'node:crypto';

const N = 624;
const M = 397;

/** The seed's words as CPython's `random_seed` reads a str: UTF-8 then SHA-512, big-endian, least significant word first. */
const keyOf = (seed: string): number[] => {
  const bytes = Buffer.from(seed, 'utf8');
  const all = Buffer.concat([bytes, createHash('sha512').update(bytes).digest()]);
  const key: number[] = [];
  for (let end = all.length; end > 0; end -= 4) {
    let word = 0;
    for (let i = Math.max(0, end - 4); i < end; i++) word = (word * 256 + (all[i] ?? 0)) >>> 0;
    key.push(word);
  }
  while (key.length > 1 && key.at(-1) === 0) key.pop();
  return key;
};

/** MT19937's state after `init_by_array(key)`. */
const stateOf = (key: ReadonlyArray<number>) => {
  const mt = new Uint32Array(N);
  mt[0] = 19650218;
  for (let i = 1; i < N; i++) {
    const prev = mt[i - 1] ?? 0;
    mt[i] = (Math.imul(1812433253, prev ^ (prev >>> 30)) + i) >>> 0;
  }
  let i = 1;
  let j = 0;
  for (let k = Math.max(N, key.length); k > 0; k--) {
    const prev = mt[i - 1] ?? 0;
    mt[i] = ((mt[i] ?? 0) ^ Math.imul(prev ^ (prev >>> 30), 1664525)) + (key[j] ?? 0) + j;
    i++;
    j++;
    if (i >= N) {
      mt[0] = mt[N - 1] ?? 0;
      i = 1;
    }
    if (j >= key.length) j = 0;
  }
  for (let k = N - 1; k > 0; k--) {
    const prev = mt[i - 1] ?? 0;
    mt[i] = ((mt[i] ?? 0) ^ Math.imul(prev ^ (prev >>> 30), 1566083941)) - i;
    i++;
    if (i >= N) {
      mt[0] = mt[N - 1] ?? 0;
      i = 1;
    }
  }
  mt[0] = 0x80000000;
  return mt;
};

/** CPython's `random.Random(seed)` for a string seed: `randint` draws what Python's draws, in order. */
export const pythonRandom = (seed: string) => {
  const mt = stateOf(keyOf(seed));
  let index = N;
  const word = () => {
    if (index >= N) {
      for (let k = 0; k < N; k++) {
        const y = ((mt[k] ?? 0) & 0x80000000) | ((mt[(k + 1) % N] ?? 0) & 0x7fffffff);
        mt[k] = (mt[(k + M) % N] ?? 0) ^ (y >>> 1) ^ (y & 1 ? 0x9908b0df : 0);
      }
      index = 0;
    }
    let y = mt[index++] ?? 0;
    y ^= y >>> 11;
    y ^= (y << 7) & 0x9d2c5680;
    y ^= (y << 15) & 0xefc60000;
    y ^= y >>> 18;
    return y >>> 0;
  };
  return {
    /** A whole number from `a` to `b`, both included (`b − a` under 2³¹). */
    randint: (a: number, b: number) => {
      const n = b - a + 1;
      const bits = 32 - Math.clz32(n);
      let r = word() >>> (32 - bits);
      while (r >= n) r = word() >>> (32 - bits);
      return a + r;
    },
  };
};
