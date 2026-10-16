import { describe, expect, test } from 'bun:test';
import { Schema } from 'effect';
import { type SketchItem, SketchItem as Item, sketchSummary } from './sketch.ts';

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
describe('a sketch item', () => {
  test('decodes from a note as written, and refuses an unknown ink', () => {
    expect(Schema.decodeSync(Item)(rect)).toEqual(rect);
    expect(() => Schema.decodeUnknownSync(Item)({ ...rect, ink: 'blue' })).toThrow();
  });
  test('says what a sketch holds in a few words', () => {
    expect(sketchSummary([pen, pen, rect])).toBe('pen 2, rect 1');
  });
});
