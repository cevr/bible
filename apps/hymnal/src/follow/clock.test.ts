import { describe, expect, it } from 'bun:test';

import { clockAt, observe, placeOf, SLACK } from './clock';

const report = (at: number, playing = true, seek = false) => ({ at, playing, seek });

describe('the follow clock', () => {
  it('runs on from the last report while playing', () => {
    const clock = clockAt(10_000, true, 0);
    expect(placeOf(clock, 0)).toBe(10_000);
    expect(placeOf(clock, 120)).toBe(10_120);
    expect(placeOf(clock, 249)).toBe(10_249);
  });

  it('holds while paused', () => {
    const clock = observe(clockAt(10_000, true, 0), report(10_250, false), 250);
    expect(placeOf(clock, 250)).toBe(10_250);
    expect(placeOf(clock, 5_000)).toBe(10_250);
  });

  it('takes a report near where it has run without stepping back', () => {
    const clock = clockAt(10_000, true, 0);
    // The player reports a little behind the running clock: the clock keeps its place.
    expect(placeOf(observe(clock, report(10_200), 250), 250)).toBe(10_250);
    // A little ahead: the clock moves on to it.
    expect(placeOf(observe(clock, report(10_300), 250), 250)).toBe(10_300);
  });

  it('jumps to a report further off than the slack, either way', () => {
    const clock = clockAt(10_000, true, 0);
    expect(placeOf(observe(clock, report(10_250 + SLACK + 1), 250), 250)).toBe(10_501);
    expect(placeOf(observe(clock, report(10_250 - SLACK - 1), 250), 250)).toBe(9_999);
  });

  it('jumps on a seek, however near', () => {
    const clock = clockAt(10_000, true, 0);
    expect(placeOf(observe(clock, report(10_100, true, true), 250), 250)).toBe(10_100);
    expect(placeOf(observe(clock, report(10_100, true, true), 250), 350)).toBe(10_200);
  });
});
