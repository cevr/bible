// A cast sheet try normalised as the trace will make it: every standing view
// drawn one head height a head and the canon tall, however tall the painting
// drew it, so a taller view comes out the canon's height; on a heads sheet
// each view is only drawn at one head height, its body as painted.

import { describe, expect, test } from 'bun:test';
import { Result, Struct } from 'effect';
import { sheetPreview } from './cast-preview.ts';
import { CANON_HEADS, measureSheet, type SheetOptions } from './cast-sheet.ts';
import { drawFigure, drawSheet, type FigureSpec, PLAIN } from './fixtures/figure.ts';
import { scaleRaster } from './raster.ts';

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

describe('a pose sheet whose smaller figure stands its own heads', () => {
  // The grown one about 2.66 of its heads, the child about 2.2 of its own, at 0.75 of the grown height.
  const own = drawSheet([
    drawFigure({ ...base, robeDepth: 220 }),
    scaleRaster(drawFigure({ ...base, robeDepth: 154 }), (0.75 * 386) / 320),
  ]);
  const options: SheetOptions = {
    kind: 'poses',
    count: 2,
    anchor: 1,
    standing: [1, 2],
    heads: 2.6,
    figures: [{ view: 2, height: 0.75, heads: 2.2 }],
  };
  const read = Result.getOrThrow(measureSheet(own, options));
  // The child's head left unread, as the measure leaves one that reads over half its figure.
  const unread = {
    ...read,
    views: read.views.map((v) => (v.view === 2 && Struct.omit(v, ['head'])) || v),
  };

  test("cuts a smaller figure whose head does not read at its own head, never the anchor's share of its height", () => {
    const kept = sheetPreview(own, read, options).width;
    expect(read.views[1]?.head).toBeDefined();
    expect(Math.abs(sheetPreview(own, unread, options).width - kept)).toBeLessThan(0.02 * kept);
  });
});
