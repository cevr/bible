import { describe, expect, test } from 'bun:test';
import { Option, Schema } from 'effect';
import {
  type SketchItem,
  SketchItem as Item,
  hits,
  inside,
  moved,
  itemAt,
  sketchSummary,
} from './sketch.ts';

const view = { w: 1000, h: 500 };
const pen: SketchItem = {
  _tag: 'Pen',
  id: 'a',
  ink: 'ink',
  points: [
    { x: 0.1, y: 0.1, p: 0.5 },
    { x: 0.3, y: 0.1, p: 0.6 },
  ],
};
const rect: SketchItem = { _tag: 'Rect', id: 'b', ink: 'red', x: 0.5, y: 0.5, w: 0.2, h: 0.2 };
const ellipse: SketchItem = {
  _tag: 'Ellipse',
  id: 'c',
  ink: 'gold',
  x: 0,
  y: 0.5,
  w: 0.2,
  h: 0.4,
};
const text: SketchItem = {
  _tag: 'Text',
  id: 'd',
  ink: 'ink',
  at: { x: 0.8, y: 0.1 },
  text: 'here',
};

describe('a sketch item', () => {
  test('decodes from a note as written, and refuses an unknown ink', () => {
    expect(Schema.decodeSync(Item)(rect)).toEqual(rect);
    expect(() => Schema.decodeUnknownSync(Item)({ ...rect, ink: 'blue' })).toThrow();
  });
  test('a pen stroke is hit along its line, within the tolerance in view pixels', () => {
    expect(hits(view, pen, { x: 200, y: 55 }, 6)).toBe(true);
    expect(hits(view, pen, { x: 200, y: 62 }, 6)).toBe(false);
  });
  test('an outline is hit on its edge, not in its open middle', () => {
    expect(hits(view, rect, { x: 500, y: 300 }, 4)).toBe(true);
    expect(hits(view, rect, { x: 600, y: 300 }, 4)).toBe(false);
    expect(hits(view, ellipse, { x: 100, y: 250 }, 4)).toBe(true);
    expect(hits(view, ellipse, { x: 100, y: 350 }, 4)).toBe(false);
  });
  test('a text is hit anywhere in its box', () => {
    expect(hits(view, text, { x: 810, y: 60 }, 0)).toBe(true);
  });
  test('the topmost item under a point is the one drawn last', () => {
    const over: SketchItem = { ...pen, id: 'e' };
    expect(Option.map(itemAt(view, [pen, over], { x: 200, y: 50 }, 6), (s) => s.id)).toEqual(
      Option.some('e'),
    );
    expect(Option.isNone(itemAt(view, [pen], { x: 900, y: 400 }, 6))).toBe(true);
  });
  test('a marquee selects what it wholly holds', () => {
    expect(inside(view, rect, { x: 490, y: 240, w: 220, h: 120 })).toBe(true);
    expect(inside(view, rect, { x: 490, y: 240, w: 100, h: 120 })).toBe(false);
  });
  test('moves by panel fractions, every point of it', () => {
    const m = moved(pen, 0.1, -0.05);
    expect(m._tag === 'Pen' && m.points.map((p) => [p.x, p.y])).toEqual([
      [0.2, 0.05],
      [0.4, 0.05],
    ]);
  });
  test('says what a sketch holds in a few words', () => {
    expect(sketchSummary([pen, pen, rect])).toBe('pen 2, rect 1');
  });
});
