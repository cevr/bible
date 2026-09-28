// Paper by meaning: a piece's role decides its edge and its outline. A figure
// is cut clean with a thin light core and keeps its ink outline; scenery is
// torn with a white rim and has no outline; an ink letter has no core. What a
// piece names for itself wins over its role.

import { describe, expect, test } from 'bun:test';
import { Schema } from 'effect';
import { rectShape } from './ink.ts';
import { FIGURE_LINE, PAPER_EDGES, type PieceStyle, kindOf, lineOf, piece } from './piece.ts';
import { type Probe, probing } from './probe.ts';

/** A stand-in context that records the colour of every fill, in order. */
const recording = () => {
  const fills: string[] = [];
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
    moveTo: () => {},
    lineTo: () => {},
    closePath: () => {},
    fill() {
      fills.push(String(this.fillStyle));
    },
  });
  return { ctx, fills };
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

  test('what a piece names for itself wins over its role', () => {
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
