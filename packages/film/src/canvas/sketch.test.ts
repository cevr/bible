// Sketch text paints from its top: each line's top (the font's ascent above
// its baseline) at the shape's y, a line step (`TEXT_LINE`) below the last, as
// the surface's SVG sets it and as the box a select or an eraser reads holds it.

import { describe, expect, test } from 'bun:test';
import { Option } from 'effect';
import { paintSketch, textSize } from './sketch.ts';
import { recorder } from './fixtures/stand-in.ts';
import { type SketchItem, TEXT_LINE, itemAt } from '../core/sketch.ts';

const view = { w: 1000, h: 500 };
const note: SketchItem = {
  _tag: 'Text',
  id: 't',
  ink: 'red',
  at: { x: 0.1, y: 0.2 },
  text: 'too tall\nlower it',
};

describe('sketch text', () => {
  test('paints each line from its top, a line step apart', () => {
    const set: Array<{ line: unknown; y: unknown }> = [];
    const r = recorder(view.w, view.h, {
      onCall: (key, args) => {
        if (key === 'fillText') set.push({ line: args[0], y: args[2] });
      },
    });
    paintSketch(r.ctx, [note], view.w, view.h);
    // The stand-in's font ascent is 9: the baseline sits that far below each line's top.
    const top = 0.2 * view.h;
    expect(set).toEqual([
      { line: 'too tall', y: top + 9 },
      { line: 'lower it', y: top + textSize(view) * TEXT_LINE + 9 },
    ]);
  });
  test('its box runs from that top down its lines', () => {
    const top = 0.2 * view.h;
    const bottom = top + 2 * textSize(view) * TEXT_LINE;
    const at = (y: number) => itemAt(view, [note], { x: 0.1 * view.w + 4, y }, 0);
    expect(Option.isSome(at(top + 1))).toBe(true);
    expect(Option.isSome(at(bottom - 1))).toBe(true);
    expect(Option.isSome(at(top - 4))).toBe(false);
  });
});
