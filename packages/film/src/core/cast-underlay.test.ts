// A cast sheet's underlay: one mannequin per view on one ground line, each
// as tall as the others, its eyes and its nose showing the way its slot
// faces (two eyes from the front, one in profile, none from behind; the nose
// past the head on the side it faces), each hand at the end of its sleeve on
// the body.

import { describe, expect, test } from 'bun:test';
import { CANON_HEADS, TURNAROUND_SLOTS } from './cast-sheet.ts';
import { mannequinUnderlay } from './cast-underlay.ts';

const W = 768;
const H = 512;
const sheet = mannequinUnderlay(TURNAROUND_SLOTS, [3, 5], { width: W, height: H, hand: 0.33 });
const step = W / 6;
const rgbAt = (x: number, y: number) => {
  const i = (y * W + x) * 4;
  return [sheet.rgba[i], sheet.rgba[i + 1], sheet.rgba[i + 2]].join(',');
};
const INK = '120,98,84';
const PAPER = new Set(['243,234,216', '226,212,188']);

/** A view's column: its mannequin's rows, and the ink runs along a row. */
const column = (k: number) => {
  const xs = Array.from({ length: Math.floor(step) }, (_, i) => Math.floor(k * step) + i);
  const rows = Array.from({ length: H }, (_, y) => y).filter((y) =>
    xs.some((x) => !PAPER.has(rgbAt(x, y))),
  );
  const inkRuns = (y: number) =>
    xs.filter((x, i) => rgbAt(x, y) === INK && (i === 0 || rgbAt(x - 1, y) !== INK)).length;
  const span = (y: number) => {
    const filled = xs.filter((x) => !PAPER.has(rgbAt(x, y)));
    return [filled[0]! - (k + 0.5) * step, filled.at(-1)! - (k + 0.5) * step] as const;
  };
  return { top: rows[0]!, bottom: rows.at(-1)!, inkRuns, span };
};

describe("a turnaround's underlay", () => {
  const views = TURNAROUND_SLOTS.map((_, k) => column(k));
  const h = Math.min((0.8 * H) / CANON_HEADS, step / 2.1);
  const eyeRow = (k: number) => Math.round(views[k]!.top + 0.52 * h);

  test('stands six mannequins of one height on one ground line, each the canon of its heads tall', () => {
    expect(new Set(views.map((v) => v.top)).size).toBe(1);
    expect(new Set(views.map((v) => v.bottom)).size).toBe(1);
    expect(views[0]!.bottom - views[0]!.top).toBeCloseTo(CANON_HEADS * h, -1);
  });

  test('shows two eyes from the front and at three-quarters, one in profile and none from behind', () => {
    // Each eye is an ink run between the head's two contour runs.
    expect(views.map((_, k) => column(k).inkRuns(eyeRow(k)) - 2)).toEqual([2, 2, 1, 0, 1, 2]);
  });

  test('hangs each hand at the end of its sleeve on the body: from the chin to the hem, each row of a mannequin is one piece', () => {
    // A hand drawn beside the body leaves paper between them on the hand's rows.
    const pieces = (k: number, y: number) => {
      const xs = Array.from({ length: Math.floor(step) }, (_, i) => Math.floor(k * step) + i);
      return xs.filter((x, i) => !PAPER.has(rgbAt(x, y)) && (i === 0 || PAPER.has(rgbAt(x - 1, y))))
        .length;
    };
    const rows = (k: number) =>
      Array.from(
        { length: Math.round(2.1 * h) },
        (_, i) => Math.round(views[k]!.top + 1.05 * h) + i,
      );
    expect(views.map((_, k) => Math.max(...rows(k).map((y) => pieces(k, y))))).toEqual([
      1, 1, 1, 1, 1, 1,
    ]);
  });

  test("draws each sleeve's own line over the body, so the arm reads", () => {
    const armRow = (k: number) => Math.round(views[k]!.top + 1.6 * h);
    expect(views.map((_, k) => column(k).inkRuns(armRow(k)) > 2)).toEqual([
      true,
      true,
      true,
      true,
      true,
      true,
    ]);
  });

  test('turns the nose past the head on the side each view faces', () => {
    const nose = (k: number) => column(k).span(Math.round(views[k]!.top + 0.58 * h));
    const [l3, r3] = nose(2);
    const [l5, r5] = nose(4);
    expect(-l3).toBeGreaterThan(r3);
    expect(r5).toBeGreaterThan(-l5);
  });
});
