// A cast sheet's underlay: one mannequin per view, their soles on one row and no line under them, each
// as tall as the others, its eyes and its nose showing the way its slot
// faces (two eyes from the front, one in profile, none from behind; the nose
// past the head on the side it faces), each hand at the end of its sleeve on
// the body; on a sheet of figures of their own sizes (a child beside the
// grown member, a member of its own design), each mannequin stands its own
// height and its own heads.

import { describe, expect, test } from 'bun:test';
import { CANON_HEADS, TURNAROUND_SLOTS } from './cast-sheet.ts';
import { mannequinUnderlay } from './cast-underlay.ts';

const W = 768;
const H = 512;
const sheet = mannequinUnderlay(
  { slots: TURNAROUND_SLOTS, profiles: [3, 5], shown: [1, 2, 3, 4, 5, 6] },
  { width: W, height: H, hand: 0.33 },
);
const step = W / 6;
const rgbAt = (x: number, y: number) => {
  const i = (y * W + x) * 4;
  return [sheet.rgba[i], sheet.rgba[i + 1], sheet.rgba[i + 2]].join(',');
};
const INK = '120,98,84';
const PAPER = new Set(['243,234,216']);

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

  test('stands six mannequins of one height, their soles on one row, each the canon of its heads tall', () => {
    expect(new Set(views.map((v) => v.top)).size).toBe(1);
    expect(new Set(views.map((v) => v.bottom)).size).toBe(1);
    expect(views[0]!.bottom - views[0]!.top).toBeCloseTo(CANON_HEADS * h, -1);
  });

  test('draws no line under the soles: off the mannequins every pixel is paper', () => {
    const colours = new Set(
      Array.from({ length: W * H }, (_, i) => rgbAt(i % W, Math.floor(i / W))),
    );
    expect([...colours].filter((c) => !PAPER.has(c) && c !== INK && c !== '228,220,206')).toEqual(
      [],
    );
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

describe("a pose sheet's underlay", () => {
  test('leaves the column of a pose that does not stand empty', () => {
    const poses = mannequinUnderlay(
      { slots: ['left', 'left'], profiles: [], shown: [1] },
      { width: 256, height: 256, hand: 0.33 },
    );
    const inked = (x0: number, x1: number) =>
      Array.from({ length: 256 * (x1 - x0) }, (_, i) => [
        x0 + (i % (x1 - x0)),
        Math.floor(i / (x1 - x0)),
      ]).some(([x, y]) => poses.rgba[(y! * 256 + x!) * 4] === 120);
    expect([inked(0, 128), inked(128, 256)]).toEqual([true, false]);
  });
});

describe('an underlay of figures of their own sizes', () => {
  const [w, h] = [512, 512];
  /**
   * Each column's mannequin: its height in pixels, and its head read two
   * ways that bracket it: from the top of the head to the neck (its
   * narrowest row above the body, a little under the chin) and twice the
   * top to the head's widest row (a little short of the chin).
   */
  const sized = (statures: ReadonlyArray<{ height: number; heads: number }>) => {
    const picture = mannequinUnderlay(
      { slots: ['front', 'front'], profiles: [], shown: [1, 2], statures },
      { width: w, height: h, hand: 0.33 },
    );
    const inked = (x: number, y: number) => picture.rgba[(y * w + x) * 4] !== 243;
    return [0, 1].map((k) => {
      const centre = Math.round((k + 0.5) * (w / 2));
      const rows = Array.from({ length: h }, (_, y) => y).filter((y) => inked(centre, y));
      const widths = rows.map(
        (y) =>
          Array.from({ length: w / 2 }, (_, i) => k * (w / 2) + i).filter((x) => inked(x, y))
            .length,
      );
      const [top, soles] = [rows[0]!, rows.at(-1)!];
      const from = Math.round(rows.length / 10);
      const upper = widths.slice(from, Math.round(rows.length / 2));
      const neck = from + upper.indexOf(Math.min(...upper));
      const crown = widths.slice(0, neck);
      const widest = Math.max(...crown);
      const middle = (crown.indexOf(widest) + crown.lastIndexOf(widest)) / 2;
      const tall = soles - top;
      return { tall, heads: { over: tall / (rows[neck]! - top), under: tall / (2 * middle) } };
    });
  };
  type Sized = ReturnType<typeof sized>[number];
  /** Whether a mannequin stands `heads` of its own heads: between its two reads. */
  const stands = (m: Sized, heads: number) => m.heads.under <= heads && heads <= m.heads.over;
  /** Whether the second stands `share` of the first's height, to 2 %. */
  const shareOf = (grown: Sized, child: Sized, share: number) =>
    Math.abs(child.tall / grown.tall - share) < 0.02;

  test("stands a smaller figure its share of the grown one's height, its head a larger share of it", () => {
    const [grown, child] = sized([
      { height: 1, heads: CANON_HEADS },
      { height: 0.7, heads: 2.2 },
    ]);
    expect([
      shareOf(grown!, child!, 0.7),
      stands(grown!, CANON_HEADS),
      stands(child!, 2.2),
    ]).toEqual([true, true, true]);
  });

  // Drawn wrong once each: a child of 2.5 heads, or of 2, in place of 2.2, and one at 0.75 of the height.
  test('tells a child drawn at the wrong heads or the wrong share from the one asked', () => {
    const at = (child: { height: number; heads: number }) =>
      sized([{ height: 1, heads: CANON_HEADS }, child]);
    const [g25, c25] = at({ height: 0.7, heads: 2.5 });
    const [g20, c20] = at({ height: 0.7, heads: 2 });
    const [g75, c75] = at({ height: 0.75, heads: 2.2 });
    expect([stands(c25!, 2.2), stands(c20!, 2.2), shareOf(g75!, c75!, 0.7)]).toEqual([
      false,
      false,
      false,
    ]);
    expect([shareOf(g25!, c25!, 0.7), shareOf(g20!, c20!, 0.7), stands(c75!, 2.2)]).toEqual([
      true,
      true,
      true,
    ]);
  });

  test('stands a member of its own design its own heads tall', () => {
    const [one, two] = sized([
      { height: 1, heads: 2.6 },
      { height: 1, heads: 2.6 },
    ]);
    expect(one!.tall).toBe(two!.tall);
    expect([stands(one!, 2.6), stands(one!, 2.4), stands(one!, 2.8)]).toEqual([true, false, false]);
  });
});
