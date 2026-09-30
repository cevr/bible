// The law and its measure: the two tables of stone (which become the mirror
// in `mirror` and the heart's tablets in `within`), the gold ring as big as
// the universe, and the cross that meets the tablets in `message`.

import {
  type Hand,
  type Pt,
  at,
  ellipseShape,
  line,
  stroke,
  sub,
  glow,
  rounded,
} from '@bible/film/canvas';
import { C, piece, type Hands } from './kit.ts';

/** A tablet with an arched top, centred on (0, 0), `w` by `h`. */
export const tabletShape = (w: number, h: number): Pt[] => {
  const r = w / 2;
  const top = -h / 2 + r;
  const arch = Array.from({ length: 13 }, (_, i): Pt => {
    const a = Math.PI + (Math.PI * i) / 12;
    return [Math.cos(a) * r, top + Math.sin(a) * r];
  });
  return [...arch, [r, h / 2], [-r, h / 2]];
};

/**
 * The two tablets of the law side by side, centred on (0, 0) at about 250 by
 * 180: five lines on each. `lit` 0..10 turns the lines gold one by one.
 */
export const tablets = (ctx: CanvasRenderingContext2D, hand: Hands, lit = 0) => {
  for (const side of [-1, 1] as const) {
    const x = side * 62;
    at(ctx, { x, y: 0 }, () =>
      piece(ctx, tabletShape(116, 176), C.stone, sub(hand('tablet'), side), {
        role: 'scenery',
        kind: 'cut',
        line: 4,
      }),
    );
    for (let i = 0; i < 5; i++) {
      const n = side < 0 ? i : i + 5;
      const on = Math.max(0, Math.min(1, lit - n));
      const y = -38 + i * 20;
      const w = 70 - (i === 0 ? 0 : (i % 2) * 14);
      if (on > 0) glow(ctx, x, y, 44, C.glow, on * 0.8);
      piece(ctx, rounded(x, y, w, 7, 3), on > 0.5 ? C.gold : C.inkSoft, sub(hand('law'), n), {
        role: 'scenery',
        kind: 'ink',
        line: 0,
        shadow: 0,
      });
    }
  }
};

/** A gold ring, the law's measure, about (x, y) of radius `r`. */
export const ring = (
  ctx: CanvasRenderingContext2D,
  hand: Hand,
  x: number,
  y: number,
  r: number,
  alpha = 1,
) => {
  if (r <= 0 || alpha <= 0) return;
  glow(ctx, x, y - r, 120, C.glow, 0.3 * alpha);
  const pts = ellipseShape(x, y, r, r, Math.max(48, Math.round(r / 6)));
  stroke(
    ctx,
    [...pts, pts[0] ?? [x + r, y]],
    { color: C.gold, width: 12, jitter: 0.6, taper: 0, alpha, closed: true },
    hand,
  );
};

/** A small planet: a disc with a band, at (x, y) of radius r. */
export const planet = (
  ctx: CanvasRenderingContext2D,
  hand: Hand,
  x: number,
  y: number,
  r: number,
  color: string,
) => {
  piece(ctx, ellipseShape(x, y, r, r), color, hand, { role: 'scenery', line: 3 });
  stroke(
    ctx,
    line([x - r * 1.5, y + r * 0.3], [x + r * 1.5, y - r * 0.3]),
    { color: C.outline, width: 3, jitter: 0.4 },
    sub(hand, 3),
  );
};

/** A four-point star at (x, y) of radius r. */
export const star = (ctx: CanvasRenderingContext2D, hand: Hand, x: number, y: number, r: number) =>
  piece(
    ctx,
    Array.from({ length: 8 }, (_, i): Pt => {
      const a = (i * Math.PI) / 4 - Math.PI / 2;
      const k = i % 2 === 0 ? r : r * 0.35;
      return [x + Math.cos(a) * k, y + Math.sin(a) * k];
    }),
    C.gold,
    hand,
    { role: 'scenery', kind: 'cut', line: 2, shadow: 0.15 },
  );

/** A cross of `s` scale, centred on (0, 0): about 120 by 190 at 1. */
export const crossShape = (s: number): Pt[] => {
  const a = 18 * s;
  const arm = 60 * s;
  return [
    [-a, -95 * s],
    [a, -95 * s],
    [a, -40 * s],
    [arm, -40 * s],
    [arm, -8 * s],
    [a, -8 * s],
    [a, 95 * s],
    [-a, 95 * s],
    [-a, -8 * s],
    [-arm, -8 * s],
    [-arm, -40 * s],
    [-a, -40 * s],
  ];
};
