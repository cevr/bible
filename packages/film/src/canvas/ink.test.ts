// How a line boils (DIRECTION, "Boil"): ink re-jitters on every boil tick;
// a figure's line only crawls, each point moving at most about 0.3 px a tick;
// scenery holds its line still. The wobble stays: a held line is still drawn
// by hand, it just does not move.

import { describe, expect, test } from 'bun:test';
import { Schema } from 'effect';
import {
  type Boil,
  CRAWL_MAX,
  type Pt,
  STROKE_JITTER,
  type StrokeStyle,
  ellipseShape,
  stroke,
} from './ink.ts';

/** A stand-in context that records every point the stroke's outline passes through. */
const outline = (boil: Boil | undefined, tick: number): Pt[] => {
  const pts: Pt[] = [];
  const at = (x: number, y: number) => pts.push([x, y]);
  const ctx: CanvasRenderingContext2D = Schema.decodeSync(Schema.Any)({
    globalAlpha: 1,
    fillStyle: '#000',
    save: () => {},
    restore: () => {},
    beginPath: () => {},
    moveTo: at,
    lineTo: at,
    closePath: () => {},
    fill: () => {},
  });
  const path: Pt[] = [
    [0, 0],
    [400, 0],
    [400, 300],
  ];
  const style: StrokeStyle = { color: '#000', width: 6 };
  if (boil !== undefined) style.boil = boil;
  stroke(ctx, path, style, { boil: tick, seed: 3 });
  return pts;
};

/** The farthest any point of the outline moved from tick `a` to tick `b`. */
const moved = (boil: Boil | undefined, a: number, b: number) => {
  const from = outline(boil, a);
  const to = outline(boil, b);
  expect(to).toHaveLength(from.length);
  let most = 0;
  from.forEach(([x, y], i) => {
    const [u, v] = to[i] ?? [x, y];
    most = Math.max(most, Math.hypot(u - x, v - y));
  });
  return most;
};

describe('boil', () => {
  test('ink re-jitters on every tick, and a stroke boils so unless it says otherwise', () => {
    expect(moved('tick', 4, 5)).toBeGreaterThan(STROKE_JITTER / 2);
    expect(moved(undefined, 4, 5)).toBeCloseTo(moved('tick', 4, 5));
  });

  test('scenery holds its line: no tick moves it', () => {
    expect(moved('none', 0, 1)).toBe(0);
    expect(moved('none', 3, 250)).toBe(0);
  });

  test('a figure crawls: under 0.3 px a tick, yet it does move', () => {
    expect(CRAWL_MAX).toBeLessThanOrEqual(0.3);
    let step = 0;
    for (let t = 0; t < 48; t++) step = Math.max(step, moved('crawl', t, t + 1));
    expect(step).toBeGreaterThan(0);
    expect(step).toBeLessThanOrEqual(CRAWL_MAX + 1e-9);
    // Over two seconds it has wandered well past one tick's step.
    expect(moved('crawl', 0, 24)).toBeGreaterThan(step * 3);
  });

  test('a closed outline meets itself with no notch: no pinch, no step at the seam', () => {
    const ring = (closed: boolean) => {
      const pts: Pt[] = [];
      const at = (x: number, y: number) => pts.push([x, y]);
      const ctx: CanvasRenderingContext2D = Schema.decodeSync(Schema.Any)({
        globalAlpha: 1,
        fillStyle: '#000',
        save: () => {},
        restore: () => {},
        beginPath: () => {},
        moveTo: at,
        lineTo: at,
        closePath: () => {},
        fill: () => {},
      });
      const circle = ellipseShape(0, 0, 60, 60, 48);
      stroke(
        ctx,
        [...circle, circle[0] ?? [60, 0]],
        { color: '#000', width: 6, jitter: 0.7, taper: 0, pressure: 0.15, closed },
        { boil: 4, seed: 11 },
      );
      // moveTo the first left point, then the left edge, then the right edge back.
      const n = (pts.length - 1) / 2;
      const left = pts.slice(1, n + 1);
      const right = pts.slice(n + 1).reverse();
      const widths = left.map(([x, y], i) => {
        const [u, v] = right[i] ?? [x, y];
        return Math.hypot(u - x, v - y);
      });
      const sorted = widths.toSorted((a, b) => a - b);
      const median = sorted[Math.floor(sorted.length / 2)] ?? 1;
      const [fx, fy] = left[0] ?? [0, 0];
      const [lx, ly] = left.at(-1) ?? [0, 0];
      return {
        pinch: Math.min(widths[0] ?? 0, widths.at(-1) ?? 0) / median,
        step: Math.hypot(lx - fx, ly - fy),
      };
    };
    const open = ring(false);
    expect(open.pinch).toBeLessThan(0.5);
    const shut = ring(true);
    expect(shut.pinch).toBeGreaterThan(0.85);
    expect(shut.step).toBeLessThan(0.05);
  });

  test('a held line is still drawn by hand: its wobble stays', () => {
    const straight = outline('none', 0).filter(([, y]) => Math.abs(y) < 10);
    const ys = straight.map(([, y]) => Math.abs(y));
    expect(Math.max(...ys) - Math.min(...ys)).toBeGreaterThan(0.2);
  });
});
