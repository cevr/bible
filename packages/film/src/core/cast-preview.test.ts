// A cast sheet try normalised as the trace will make it: every standing view
// drawn one head height a head and the canon tall, however tall the painting
// drew it, so a taller view comes out the canon's height; on a heads sheet
// each view is only drawn at one head height, its body as painted.

import { describe, expect, test } from 'bun:test';
import { Result } from 'effect';
import { sheetPreview } from './cast-preview.ts';
import { CANON_HEADS, measureSheet, type SheetOptions } from './cast-sheet.ts';
import { drawFigure, drawSheet, type FigureSpec, PLAIN } from './fixtures/figure.ts';

const base: FigureSpec = { ...PLAIN, robeShade: [60, 78, 150], arm: 'sleeve', eyeShift: 0 };
const sheet = drawSheet([drawFigure(base), drawFigure({ ...base, robeDepth: 380 })]);
const previewOf = (options: SheetOptions) =>
  sheetPreview(sheet, Result.getOrThrow(measureSheet(sheet, options)), options);

/** The lowest row of the preview that is not white or the band's green, in each half. */
const lowestInk = (r: ReturnType<typeof previewOf>, half: 0 | 1) => {
  const xs = Array.from({ length: r.width / 2 }, (_, i) => Math.floor(half * (r.width / 2)) + i);
  const inked = (x: number, y: number) => {
    const i = (y * r.width + x) * 4;
    const [red, green, blue] = [r.rgba[i]!, r.rgba[i + 1]!, r.rgba[i + 2]!];
    return !(red > 250 && green > 250 && blue > 250) && !(red < 20 && green > 150 && blue < 110);
  };
  return Array.from({ length: r.height }, (_, y) => y).findLast((y) => xs.some((x) => inked(x, y)));
};

describe('a pose sheet whose second view stands taller', () => {
  const preview = previewOf({ kind: 'poses', count: 2, anchor: 1, standing: [1, 2] });

  test('draws both views the canon tall, their soles on one row', () => {
    const soles = [lowestInk(preview, 0), lowestInk(preview, 1)];
    expect(Math.abs(soles[0]! - soles[1]!)).toBeLessThanOrEqual(2);
    expect(soles[0]! - 24).toBeCloseTo(CANON_HEADS * 120, -1);
  });
});

describe('a heads sheet', () => {
  test('draws each view at one head height and holds no body to the canon', () => {
    const preview = previewOf({ kind: 'heads', count: 2, anchor: 1 });
    expect(lowestInk(preview, 1)!).toBeGreaterThan(lowestInk(preview, 0)! + 10);
  });
});
