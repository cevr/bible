/** Where a touch on iOS's position bar lands, and where a screen reader's swipe moves it. */

import { describe, expect, it } from 'bun:test';

import { nudged, placeAt } from './scrub';

describe('placeAt', () => {
  it('maps a touch along the bar to its place in the recording, held inside the bar', () => {
    expect(placeAt(75, 300, 120)).toBe(30);
    expect(placeAt(-20, 300, 120)).toBe(0);
    expect(placeAt(340, 300, 120)).toBe(120);
  });

  it('gives the start before the bar is measured', () => {
    expect(placeAt(75, 0, 120)).toBe(0);
  });
});

describe('nudged', () => {
  it('moves ten seconds a swipe, within the recording', () => {
    expect(nudged(30, 120, 1)).toBe(40);
    expect(nudged(30, 120, -1)).toBe(20);
    expect(nudged(115, 120, 1)).toBe(120);
    expect(nudged(4, 120, -1)).toBe(0);
  });
});
