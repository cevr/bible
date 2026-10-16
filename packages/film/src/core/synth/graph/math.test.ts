import { describe, expect, test } from 'bun:test';
import { rng } from '../../random.ts';
import { cosTurn, dbToGain, exp, exp2, log, sinTurn, tanh } from './math.ts';

/** The worst error of `mine` against the host's `host` over `n` seeded draws of `x`. */
const worst = (
  n: number,
  x: (u: number) => number,
  mine: (x: number) => number,
  host: (x: number) => number,
) => {
  const r = rng(20261015);
  let absolute = 0;
  let relative = 0;
  for (let i = 0; i < n; i++) {
    const at = x(r());
    const want = host(at);
    const error = Math.abs(mine(at) - want);
    absolute = Math.max(absolute, error);
    if (want !== 0) relative = Math.max(relative, error / Math.abs(want));
  }
  return { absolute, relative };
};

const N = 20_000;
/** One unit in the last place of a double near 1. */
const ULP = Number.EPSILON;

describe('the graph’s own math, against the host’s', () => {
  test('sin and cos of turns: within 4 ULP of 1 absolute, near and far from 0', () => {
    for (const span of [1, 2000]) {
      const turns = (u: number) => (u - 0.5) * span;
      // The host's argument is reduced first, so its 2π × t keeps its bits.
      const host = (f: (r: number) => number) => (t: number) =>
        f(2 * Math.PI * (t - Math.floor(t)));
      expect(worst(N, turns, sinTurn, host(Math.sin)).absolute).toBeLessThan(4 * ULP);
      expect(worst(N, turns, cosTurn, host(Math.cos)).absolute).toBeLessThan(4 * ULP);
    }
    expect([sinTurn(0), sinTurn(0.25), sinTurn(0.5), sinTurn(0.75)]).toEqual([0, 1, 0, -1]);
    expect([cosTurn(0), cosTurn(0.25), cosTurn(0.5), cosTurn(0.75)]).toEqual([1, 0, -1, 0]);
  });

  test('e^x and 2^x: within 2 ULP relative over the doubles’ range', () => {
    expect(worst(N, (u) => (u - 0.5) * 1400, exp, Math.exp).relative).toBeLessThan(2 * ULP);
    expect(
      worst(
        N,
        (u) => (u - 0.5) * 60,
        exp2,
        (x) => 2 ** x,
      ).relative,
    ).toBeLessThan(2 * ULP);
    for (let k = -1022; k <= 1023; k += 37) expect(exp2(k)).toBe(2 ** k);
    expect([exp(0), exp(800), exp(-800), exp(-Infinity)]).toEqual([1, Infinity, 0, 0]);
    expect(Number.isNaN(exp(Number.NaN))).toBe(true);
  });

  test('ln x: within 2 ULP relative, near 1, over the range and in the subnormals', () => {
    expect(worst(N, (u) => 1 + (u - 0.5) * 2e-3, log, Math.log).relative).toBeLessThan(2 * ULP);
    expect(worst(N, (u) => Math.exp((u - 0.5) * 1380), log, Math.log).relative).toBeLessThan(
      2 * ULP,
    );
    expect(log(5e-324)).toBe(Math.log(5e-324));
    expect(Object.is(log(1), 0)).toBe(true);
    expect([log(0), log(Infinity)]).toEqual([-Infinity, Infinity]);
    expect(Number.isNaN(log(-1))).toBe(true);
  });

  test('tanh x: within 4 ULP relative, across the knee and in the tails', () => {
    expect(worst(N, (u) => (u - 0.5) * 0.4, tanh, Math.tanh).relative).toBeLessThan(4 * ULP);
    expect(worst(N, (u) => (u - 0.5) * 60, tanh, Math.tanh).relative).toBeLessThan(4 * ULP);
    expect([tanh(0), tanh(30), tanh(-30)]).toEqual([0, 1, -1]);
  });

  test('a level in dB as a gain: within 16 ULP relative from −120 to +48 dB', () => {
    expect(
      worst(
        N,
        (u) => u * 168 - 120,
        dbToGain,
        (db) => 10 ** (db / 20),
      ).relative,
    ).toBeLessThan(16 * ULP);
    expect(dbToGain(0)).toBe(1);
  });
});
