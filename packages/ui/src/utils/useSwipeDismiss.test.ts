// Upstream: packages/react/src/utils/useSwipeDismiss.test.tsx
//
// The swipe's pure geometry. The gesture itself (pointer events, threshold,
// damping while dragging) is covered through its one part, the drawer, in
// test/browser/drawer.test.ts.
import { describe, expect, it } from 'bun:test';

import { applyDirectionalDamping, getDisplacement, parseTransform } from './useSwipeDismiss.ts';

describe('getDisplacement', () => {
  it('measures travel along each direction', () => {
    expect(getDisplacement('right', 30, -5)).toBe(30);
    expect(getDisplacement('left', 30, -5)).toBe(-30);
    expect(getDisplacement('down', 30, -5)).toBe(-5);
    expect(getDisplacement('up', 30, -5)).toBe(5);
  });
});

describe('applyDirectionalDamping', () => {
  it('leaves travel in an allowed direction alone', () => {
    expect(applyDirectionalDamping(100, 0, ['right'])).toEqual({ x: 100, y: 0 });
    expect(applyDirectionalDamping(0, -64, ['up', 'down'])).toEqual({ x: 0, y: -64 });
  });

  it('damps travel the wrong way on an allowed axis to its square root', () => {
    expect(applyDirectionalDamping(-100, 0, ['right'])).toEqual({ x: -10, y: 0 });
    expect(applyDirectionalDamping(0, 49, ['up'])).toEqual({ x: 0, y: 7 });
  });

  it('damps all travel on an axis with no allowed direction', () => {
    expect(applyDirectionalDamping(16, -25, ['right'])).toEqual({ x: 16, y: -5 });
    expect(applyDirectionalDamping(-9, 4, ['down'])).toEqual({ x: -3, y: 4 });
  });
});

describe('parseTransform', () => {
  it('is the identity for none or a missing value', () => {
    expect(parseTransform('none')).toEqual({ x: 0, y: 0, scale: 1 });
    expect(parseTransform(undefined)).toEqual({ x: 0, y: 0, scale: 1 });
  });

  it('reads the translation and scale of a 2D matrix', () => {
    expect(parseTransform('matrix(0.5, 0, 0, 0.5, 12, -8)')).toEqual({ x: 12, y: -8, scale: 0.5 });
  });

  it('reads the translation and scale of a 3D matrix', () => {
    expect(parseTransform('matrix3d(2, 0, 0, 0, 0, 2, 0, 0, 0, 0, 1, 0, 30, 40, 0, 1)')).toEqual({
      x: 30,
      y: 40,
      scale: 2,
    });
  });
});
