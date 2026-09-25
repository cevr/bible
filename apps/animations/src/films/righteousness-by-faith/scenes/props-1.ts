// Props for the problem-and-word scenes (rags, witness, void, centurion).

import {
  at,
  cutout,
  type Hand,
  type Pt,
  ellipseShape,
  line,
  quad,
  rectShape,
  spline,
  stroke,
} from '@bible/film/canvas';
import { hash2 } from '@bible/film/core';
import { C } from '../kit.ts';

export const SKY = '#8fb8c9';
export const SEA = '#4f86a3';
export const HILL = '#7fa35f';
export const HILL_DARK = '#5d8347';
export const LEAF = '#6f9a5a';
export const WILT = '#8a7a52';
export const STONE = '#8f9498';

const sub = (h: Hand, k: number): Hand => ({ boil: h.boil, seed: h.seed + k });

/** An almond leaf with a midrib, centred at (x, y), pointing along `angle`. */
export const leaf = (
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  len: number,
  angle: number,
  color: string,
  h: Hand,
) => {
  at(ctx, { x, y, rot: angle }, () => {
    const w = len * 0.42;
    const shape = spline(
      [
        [-len / 2, 0],
        [-len * 0.1, -w / 2],
        [len / 2, 0],
        [-len * 0.1, w / 2],
      ],
      8,
      true,
    );
    cutout(ctx, shape, { color, torn: 1.4, rim: 2, shadow: 0.35 }, h);
    stroke(
      ctx,
      line([-len * 0.45, 0], [len * 0.42, 0], 0.03, h.seed),
      { color: C.ink, width: Math.max(2, len * 0.03), alpha: 0.45 },
      sub(h, 3),
    );
  });
};

/** A square-ish patch with running stitches round its edge. */
export const patch = (
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  s: number,
  rot: number,
  color: string,
  h: Hand,
  stitch = 1,
) => {
  at(ctx, { x, y, rot }, () => {
    const pts: Pt[] = [
      [-s / 2 + hash2(1, h.seed) * 6, -s / 2],
      [s / 2, -s / 2 + hash2(2, h.seed) * 8],
      [s / 2 - hash2(3, h.seed) * 6, s / 2],
      [-s / 2, s / 2 - hash2(4, h.seed) * 6],
    ];
    cutout(ctx, pts, { color, torn: 2, rim: 2, shadow: 0.4 }, h);
    if (stitch > 0) {
      const n = 12;
      for (let i = 0; i < Math.round(n * stitch); i++) {
        const side = Math.floor(i / 3);
        const a = pts[side % 4] ?? [0, 0];
        const b = pts[(side + 1) % 4] ?? [0, 0];
        const u = ((i % 3) + 0.3) / 3.2;
        const p0: Pt = [a[0] + (b[0] - a[0]) * u, a[1] + (b[1] - a[1]) * u];
        const p1: Pt = [a[0] + (b[0] - a[0]) * (u + 0.14), a[1] + (b[1] - a[1]) * (u + 0.14)];
        const inward = (p: Pt): Pt => [p[0] * 0.82, p[1] * 0.82];
        stroke(
          ctx,
          [inward(p0), inward(p1)],
          { color: C.ink, width: 3, alpha: 0.7, jitter: 0.3 },
          sub(h, 10 + i),
        );
      }
    }
  });
};

/** A little paper note with handwritten text stuck on at a tilt. */
export const note = (
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  rot: number,
  color: string,
  h: Hand,
  draw: () => void,
) => {
  at(ctx, { x, y, rot }, () => {
    cutout(
      ctx,
      rectShape(-w / 2, -w * 0.32, w, w * 0.64),
      { color, torn: 2, rim: 0, shadow: 0.5, grain: 0.4 },
      h,
    );
    draw();
  });
};

/** A roman helmet with a red crest, sitting on a figure head (figure-local coords). */
export const helmet = (ctx: CanvasRenderingContext2D, h: Hand) => {
  const cy = -366;
  const dome: Pt[] = [];
  for (let i = 0; i <= 20; i++) {
    const a = Math.PI + (Math.PI * i) / 20;
    dome.push([Math.cos(a) * 62, cy - 4 + Math.sin(a) * 60]);
  }
  dome.push(
    [62, cy + 6],
    [54, cy + 26],
    [40, cy + 6],
    [-40, cy + 6],
    [-54, cy + 26],
    [-62, cy + 6],
  );
  cutout(ctx, dome, { color: STONE, torn: 1.5, rim: 2, shadow: 0.4 }, sub(h, 1));
  const crest = spline(
    [
      [-58, cy - 50],
      [-20, cy - 104],
      [30, cy - 106],
      [66, cy - 56],
      [30, cy - 70],
      [-20, cy - 72],
    ],
    8,
    true,
  );
  cutout(ctx, crest, { color: C.red, torn: 3, rim: 2, shadow: 0.4 }, sub(h, 2));
  for (let i = 0; i < 6; i++) {
    const x = -44 + i * 18;
    stroke(
      ctx,
      line([x, cy - 74 + Math.abs(i - 2.5) * 3], [x + 4, cy - 96 + Math.abs(i - 2.5) * 4], 0.05, i),
      { color: C.ink, width: 2.5, alpha: 0.4 },
      sub(h, 5 + i),
    );
  }
};

/** A beard for the Jesus figure (figure-local coords). */
export const beard = (ctx: CanvasRenderingContext2D, color: string, h: Hand) => {
  const cy = -366;
  const shape = spline(
    [
      [-50, cy + 10],
      [-30, cy + 58],
      [0, cy + 72],
      [30, cy + 58],
      [50, cy + 10],
      [22, cy + 40],
      [-22, cy + 40],
    ],
    8,
    true,
  );
  cutout(ctx, shape, { color, torn: 2, rim: 0, shadow: 0.2 }, h);
};

/** A simple bed seen from the side, headboard at left. Top of mattress at y. */
export const bed = (
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  blanket: string,
  h: Hand,
) => {
  cutout(
    ctx,
    rectShape(x - w / 2 - 10, y - 110, 26, 190),
    { color: C.clay, torn: 2, rim: 2, shadow: 0.5 },
    sub(h, 1),
  );
  cutout(
    ctx,
    rectShape(x + w / 2 - 16, y - 50, 26, 130),
    { color: C.clay, torn: 2, rim: 2, shadow: 0.5 },
    sub(h, 2),
  );
  cutout(
    ctx,
    rectShape(x - w / 2, y, w, 44),
    { color: C.robe, torn: 2, rim: 2, shadow: 0.5, grain: 0.3 },
    sub(h, 3),
  );
  cutout(
    ctx,
    rectShape(x - w / 2 + 10, y + 44, w - 20, 26),
    { color: C.clay, torn: 2, rim: 0, shadow: 0.4 },
    sub(h, 4),
  );
  void blanket;
};

/** A paper plane pointing along +x, centred at the origin of the current transform. */
export const plane = (ctx: CanvasRenderingContext2D, s: number, h: Hand) => {
  const top: Pt[] = [
    [60 * s, 0],
    [-50 * s, -34 * s],
    [-30 * s, 0],
  ];
  const bottom: Pt[] = [
    [60 * s, 0],
    [-30 * s, 0],
    [-50 * s, 24 * s],
  ];
  const keel: Pt[] = [
    [60 * s, 2 * s],
    [-30 * s, 2 * s],
    [-36 * s, 16 * s],
  ];
  cutout(ctx, keel, { color: '#e4dccb', torn: 0.8, rim: 0, shadow: 0.4 }, sub(h, 1));
  cutout(ctx, bottom, { color: '#efe8da', torn: 0.8, rim: 0, shadow: 0.2 }, sub(h, 2));
  cutout(ctx, top, { color: C.robe, torn: 0.8, rim: 0, shadow: 0.5 }, sub(h, 3));
};

/** A red ink ring, like a teacher circling a mistake. */
export const circleMark = (
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  r: number,
  p: number,
  h: Hand,
) => {
  const pts: Pt[] = [];
  const start = hash2(h.seed, 2) * Math.PI * 2;
  for (let i = 0; i <= 40; i++) {
    const a = start + ((Math.PI * 2 + 0.5) * i) / 40;
    const rr = r * (1 + 0.08 * Math.sin(i * 0.7 + h.seed));
    pts.push([x + Math.cos(a) * rr * 1.15, y + Math.sin(a) * rr]);
  }
  stroke(ctx, pts, { color: C.red, width: 6, progress: p, jitter: 1 }, h);
};

/** Rolling hills across the bottom of the frame, rising by `rise` px. */
export const hills = (
  ctx: CanvasRenderingContext2D,
  baseY: number,
  color: string,
  h: Hand,
  seed: number,
) => {
  const pts: Pt[] = [[-60, 1140]];
  for (let x = -60; x <= 1980; x += 160)
    pts.push([x, baseY - 40 - hash2(Math.round(x), seed) * 90]);
  pts.push([1980, 1140]);
  cutout(
    ctx,
    [...spline(pts.slice(1, -1), 10), [1980, 1140], [-60, 1140]],
    { color, torn: 3, rim: 3, shadow: 0.6 },
    h,
  );
};

/** A lollipop tree: trunk + round crown. Base at (x, y). */
export const tree = (ctx: CanvasRenderingContext2D, x: number, y: number, s: number, h: Hand) => {
  if (s <= 0) return;
  cutout(
    ctx,
    rectShape(x - 8 * s, y - 70 * s, 16 * s, 70 * s),
    { color: C.clay, torn: 1, rim: 1.5, shadow: 0.3 },
    sub(h, 1),
  );
  cutout(
    ctx,
    ellipseShape(x, y - 100 * s, 50 * s, 56 * s),
    { color: HILL_DARK, torn: 2.5, rim: 2, shadow: 0.4 },
    sub(h, 2),
  );
  cutout(
    ctx,
    ellipseShape(x - 12 * s, y - 112 * s, 26 * s, 26 * s),
    { color: LEAF, torn: 1.5, rim: 0, shadow: 0 },
    sub(h, 3),
  );
};

/** A five-petal flower on a stem. Base at (x, y). */
export const flower = (
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  s: number,
  color: string,
  h: Hand,
) => {
  if (s <= 0) return;
  stroke(
    ctx,
    quad([x, y], [x + 6 * s, y - 25 * s], [x, y - 50 * s]),
    { color: HILL_DARK, width: 5 * s },
    sub(h, 1),
  );
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2;
    cutout(
      ctx,
      ellipseShape(x + Math.cos(a) * 11 * s, y - 50 * s + Math.sin(a) * 11 * s, 9 * s, 9 * s),
      { color, torn: 0.8, rim: 1, shadow: 0.2 },
      sub(h, 2 + i),
    );
  }
  cutout(
    ctx,
    ellipseShape(x, y - 50 * s, 7 * s, 7 * s),
    { color: C.gold, torn: 0.5, rim: 0, shadow: 0 },
    sub(h, 9),
  );
};

/** A small house with a door (centurion's home). Base centre (x, y). */
export const house = (ctx: CanvasRenderingContext2D, x: number, y: number, s: number, h: Hand) => {
  cutout(
    ctx,
    rectShape(x - 110 * s, y - 150 * s, 220 * s, 150 * s),
    { color: '#d9c7a4', torn: 2, rim: 2.5, shadow: 0.5 },
    sub(h, 1),
  );
  cutout(
    ctx,
    [
      [x - 135 * s, y - 145 * s],
      [x, y - 240 * s],
      [x + 135 * s, y - 145 * s],
    ],
    { color: C.red, torn: 2.5, rim: 2.5, shadow: 0.5 },
    sub(h, 2),
  );
  cutout(
    ctx,
    rectShape(x - 26 * s, y - 90 * s, 52 * s, 90 * s),
    { color: C.clay, torn: 1, rim: 0, shadow: 0.2 },
    sub(h, 3),
  );
};
