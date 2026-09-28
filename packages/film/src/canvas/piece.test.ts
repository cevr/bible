// Paper by meaning: a piece's role decides its edge and its outline. A figure
// is cut clean with a thin light core and keeps its ink outline; scenery is
// torn with a white rim and has no outline; an ink letter has no core. What a
// piece names for itself wins over its role.

import { describe, expect, test } from 'bun:test';
import { Schema } from 'effect';
import { CRAWL_MAX, type Pt, rectShape } from './ink.ts';
import {
  FIGURE_LINE,
  PAPER_EDGES,
  type PieceStyle,
  boilOf,
  kindOf,
  lineOf,
  piece,
} from './piece.ts';
import { type Probe, probing } from './probe.ts';

/** A stand-in context that records the colour of every fill, in order, and every point a path passes through. */
const recording = () => {
  const fills: string[] = [];
  const points: Pt[] = [];
  const at = (x: number, y: number) => points.push([x, y]);
  const ctx: CanvasRenderingContext2D = Schema.decodeSync(Schema.Any)({
    globalAlpha: 1,
    globalCompositeOperation: 'source-over',
    filter: 'none',
    fillStyle: '#000',
    shadowColor: 'rgba(0, 0, 0, 0)',
    shadowBlur: 0,
    shadowOffsetX: 0,
    shadowOffsetY: 0,
    getTransform: () => ({ a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 }),
    save: () => {},
    restore: () => {},
    beginPath: () => {},
    moveTo: at,
    lineTo: at,
    closePath: () => {},
    fill() {
      fills.push(String(this.fillStyle));
    },
  });
  return { ctx, fills, points };
};

const hand = { boil: 0, seed: 7 };
const square = rectShape(0, 0, 100, 100);
const style = (role: PieceStyle['role'], more: Partial<PieceStyle> = {}): PieceStyle => ({
  color: '#aa3322',
  role,
  outline: '#2b2622',
  grain: 0,
  shadow: 0,
  ...more,
});

describe('paper by meaning', () => {
  test('a figure is cut and outlined; scenery is torn with no outline', () => {
    expect(kindOf({ role: 'figure' })).toBe('cut');
    expect(kindOf({ role: 'scenery' })).toBe('torn');
    expect(lineOf({ role: 'figure' })).toBe(FIGURE_LINE);
    expect(lineOf({ role: 'scenery' })).toBe(0);
  });

  test('a figure crawls; scenery holds still', () => {
    expect(boilOf({ role: 'figure' })).toBe('crawl');
    expect(boilOf({ role: 'scenery' })).toBe('none');
  });

  test('what a piece names for itself wins over its role', () => {
    expect(boilOf({ role: 'scenery', boil: 'tick' })).toBe('tick');
    expect(kindOf({ role: 'scenery', kind: 'cut' })).toBe('cut');
    expect(lineOf({ role: 'scenery', line: 5 })).toBe(5);
    expect(lineOf({ role: 'figure', line: 0 })).toBe(0);
  });

  test('a cut edge has a thin core, a torn one a wide fibrous rim, ink none', () => {
    expect(PAPER_EDGES.cut.rim).toBeGreaterThanOrEqual(1);
    expect(PAPER_EDGES.cut.rim).toBeLessThanOrEqual(2);
    expect(PAPER_EDGES.torn.rim).toBeGreaterThanOrEqual(2);
    expect(PAPER_EDGES.torn.rim).toBeLessThanOrEqual(4);
    expect(PAPER_EDGES.torn.torn).toBeGreaterThan(PAPER_EDGES.cut.torn);
    expect(PAPER_EDGES.ink.rim).toBe(0);
  });
});

describe('piece', () => {
  test('scenery draws its white core, then its face, and no ink', () => {
    const { ctx, fills } = recording();
    piece(ctx, square, style('scenery'), hand);
    expect(fills).toEqual(['#fbf6ea', '#aa3322']);
  });

  test('a figure draws its core, its face, then its outline in ink', () => {
    const { ctx, fills } = recording();
    piece(ctx, square, style('figure'), hand);
    expect(fills).toEqual(['#fbf6ea', '#aa3322', '#2b2622']);
  });

  test('an ink letter has no core', () => {
    const { ctx, fills } = recording();
    piece(ctx, square, style('figure', { kind: 'ink', line: 0 }), hand);
    expect(fills).toEqual(['#aa3322']);
  });

  test('scenery holds still on every tick; a figure crawls, edge and outline', () => {
    const drawn = (s: PieceStyle, boil: number) => {
      const { ctx, points } = recording();
      piece(ctx, square, s, { boil, seed: 7 });
      return points;
    };
    const most = (s: PieceStyle, a: number, b: number) => {
      const from = drawn(s, a);
      const to = drawn(s, b);
      expect(to).toHaveLength(from.length);
      return Math.max(
        ...from.map(([x, y], i) => {
          const [u, v] = to[i] ?? [x, y];
          return Math.hypot(u - x, v - y);
        }),
      );
    };
    expect(most(style('scenery'), 2, 3)).toBe(0);
    expect(most(style('scenery', { kind: 'cut', line: 5 }), 2, 90)).toBe(0);
    const step = most(style('figure'), 2, 3);
    expect(step).toBeGreaterThan(0);
    expect(step).toBeLessThanOrEqual(CRAWL_MAX);
    // Named, ink boils as ink on a piece too.
    expect(most(style('figure', { boil: 'tick' }), 2, 3)).toBeGreaterThan(CRAWL_MAX);
  });

  test('the check sees a scenery piece as a fill and a figure also as a stroke', () => {
    const kinds = (role: PieceStyle['role']) => {
      const { ctx } = recording();
      const probe: Probe = { sink: { texts: [], inks: [] }, scene: 's', dx: 0, alpha: 1 };
      probing(ctx, probe, () => piece(ctx, square, style(role), hand));
      return probe.sink.inks.map((m) => m.kind);
    };
    expect(kinds('scenery')).toEqual(['fill']);
    expect(kinds('figure')).toEqual(['fill', 'stroke']);
  });
});
