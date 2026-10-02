// Upstream: packages/react/src/drawer/root/useDrawerSnapPoints.test.ts
//
// The snap point arithmetic: swipe damping past the open edge, the closest
// point, resolving each unit, and collapsing near-equal points.
import { describe, expect, it } from 'bun:test';

import {
  closestSnapPointIndex,
  getSnapPointSwipeMovement,
  resolveActiveSnapPoint,
  resolveSnapPoints,
  resolveSnapPointValue,
} from './snapPoints.ts';

describe('getSnapPointSwipeMovement', () => {
  it('returns the raw movement when the drag does not overshoot the open edge', () => {
    expect(getSnapPointSwipeMovement(100, -50)).toBe(-50);
    expect(getSnapPointSwipeMovement(0, 20)).toBe(20);
  });

  it('returns the raw movement at the open edge', () => {
    expect(getSnapPointSwipeMovement(100, -100)).toBe(-100);
  });

  it('damps the movement with a square root once the drag overshoots the open edge', () => {
    expect(getSnapPointSwipeMovement(0, -150)).toBeCloseTo(-Math.sqrt(150));
    expect(getSnapPointSwipeMovement(100, -250)).toBeCloseTo(-Math.sqrt(150) - 100);
  });
});

describe('closestSnapPointIndex', () => {
  it('returns the closest value and keeps the first value on ties', () => {
    expect(closestSnapPointIndex([100, 200, 300], 240)).toBe(1);
    expect(closestSnapPointIndex([100, 200], 150)).toBe(0);
  });

  it('returns -1 when there are no values', () => {
    expect(closestSnapPointIndex([], 100)).toBe(-1);
  });
});

describe('resolveSnapPointValue', () => {
  it('reads numbers up to 1 as a fraction of the viewport, larger ones as pixels', () => {
    expect(resolveSnapPointValue(0.5, 800, 16)).toBe(400);
    expect(resolveSnapPointValue(1, 800, 16)).toBe(800);
    expect(resolveSnapPointValue(240, 800, 16)).toBe(240);
  });

  it('reads px and rem strings', () => {
    expect(resolveSnapPointValue('148px', 800, 16)).toBe(148);
    expect(resolveSnapPointValue(' 10rem ', 800, 20)).toBe(200);
  });

  it('does not resolve other units, non-finite numbers or an unmeasured viewport', () => {
    expect(resolveSnapPointValue('50%', 800, 16)).toBeNull();
    expect(resolveSnapPointValue(Number.NaN, 800, 16)).toBeNull();
    expect(resolveSnapPointValue(0.5, 0, 16)).toBeNull();
  });
});

describe('resolveSnapPoints', () => {
  const measurements = { viewportHeight: 800, popupHeight: 600, rootFontSize: 16 };

  it('resolves heights clamped to the popup and the offsets that show them', () => {
    expect(resolveSnapPoints([0.25, 1], measurements)).toEqual([
      { value: 0.25, height: 200, offset: 400 },
      { value: 1, height: 600, offset: 0 },
    ]);
  });

  it('collapses points within a pixel, keeping the last one listed', () => {
    expect(resolveSnapPoints(['200px', 200.5, 1], measurements)).toEqual([
      { value: 200.5, height: 200.5, offset: 399.5 },
      { value: 1, height: 600, offset: 0 },
    ]);
  });

  it('resolves nothing before the popup is measured', () => {
    expect(resolveSnapPoints([0.5], { ...measurements, popupHeight: 0 })).toEqual([]);
  });

  it('matches the active point by value, else by the closest height', () => {
    const resolved = resolveSnapPoints([0.25, 1], measurements);
    expect(resolveActiveSnapPoint(1, resolved, measurements)?.offset).toBe(0);
    expect(resolveActiveSnapPoint('220px', resolved, measurements)?.value).toBe(0.25);
    expect(resolveActiveSnapPoint(null, resolved, measurements)).toBeUndefined();
  });
});
