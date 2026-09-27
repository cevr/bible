// Props for the exchange half of the film: the Christ figure, the balance,
// the open hand, the torn rags, the loom.

import {
  at,
  cutout,
  type Look,
  type Pose,
  drawFigure,
  robeShape,
  type Hand,
  type Pt,
  ellipseShape,
  line,
  quad,
  rectShape,
  spline,
  stroke,
} from '@bible/film/canvas';
import { hash2, clamp, ease, lerp } from '@bible/film/core';
import { C } from '../kit.ts';

/** Blend two #rrggbb colours. */
export const mix = (a: string, b: string, t: number): string => {
  const p = (s: string, i: number) => Number.parseInt(s.slice(1 + i * 2, 3 + i * 2), 16);
  const k = clamp(t);
  const c = [0, 1, 2].map((i) => Math.round(lerp(p(a, i), p(b, i), k)));
  return `rgb(${c[0]}, ${c[1]}, ${c[2]})`;
};

export const LINEN = '#e6d8bc';

/** The person, in whatever they are wearing. */
export const person = (ctx: CanvasRenderingContext2D, pose: Pose, look: Partial<Look>, h: Hand) =>
  drawFigure(
    ctx,
    pose,
    { robe: C.teal, skin: C.skin, ink: C.ink, hair: C.ink, rags: true, face: 'calm', ...look },
    h,
  );

/** Christ: a white robe, a gold sash, a warm halo of light behind. */
export const christ = (
  ctx: CanvasRenderingContext2D,
  pose: Pose,
  h: Hand,
  opts: { glow?: number; robe?: string; rags?: boolean; sash?: number; face?: Look['face'] } = {},
) => {
  const glow = opts.glow ?? 1;
  if (glow > 0) {
    const g = ctx.createRadialGradient(0, -260, 20, 0, -260, 420);
    g.addColorStop(0, `rgba(251, 239, 200, ${0.9 * glow})`);
    g.addColorStop(0.5, `rgba(230, 179, 71, ${0.25 * glow})`);
    g.addColorStop(1, 'rgba(230, 179, 71, 0)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(0, -260, 420, 0, Math.PI * 2);
    ctx.fill();
  }
  drawFigure(
    ctx,
    pose,
    {
      robe: opts.robe ?? C.robe,
      skin: C.clay,
      ink: C.ink,
      hair: '#3b2a20',
      rags: opts.rags ?? false,
      face: opts.face ?? 'calm',
    },
    h,
  );
  const sash = opts.sash ?? 1;
  if (sash > 0) {
    ctx.save();
    ctx.rotate(pose.lean ?? 0);
    stroke(
      ctx,
      quad([-66, -282], [0, -210], [74, -140]),
      { color: C.gold, width: 22, alpha: sash, taper: 0.05, pressure: 0.15 },
      { boil: h.boil, seed: h.seed + 700 },
    );
    ctx.restore();
  }
};

/** Dark smudges on a robe (figure-local coordinates). */
export const stains = (ctx: CanvasRenderingContext2D, h: Hand, alpha = 1) => {
  const spots: Array<[number, number, number]> = [
    [-42, -225, 30],
    [36, -160, 24],
    [-22, -95, 34],
    [52, -262, 16],
    [-70, -150, 14],
  ];
  ctx.save();
  ctx.globalAlpha *= alpha;
  spots.forEach(([x, y, r], i) =>
    cutout(
      ctx,
      ellipseShape(x, y, r, r * 0.8),
      { color: C.tealDeep, torn: 5, rim: 0, shadow: 0, grain: 0.9, alpha: 0.85 },
      { boil: h.boil, seed: h.seed + i },
    ),
  );
  ctx.restore();
};

/**
 * The rags torn into pieces that blow away on the wind. `p` 0 = still worn,
 * 1 = gone. Figure-local coordinates.
 */
export const blowRags = (
  ctx: CanvasRenderingContext2D,
  p: number,
  h: Hand,
  color = C.teal,
  dir = 1,
) => {
  if (p >= 1) return;
  const shape = robeShape(true, h.seed);
  const cols = 4;
  const rows = 6;
  const x0 = -125;
  const y0 = -325;
  const cw = 250 / cols;
  const rh = 360 / rows;
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const k = r * cols + c;
      // Pieces near the collar let go first.
      const delay = (r / rows) * 0.35 + hash2(k, 5) * 0.15;
      const q = clamp((p - delay) / (1 - 0.5));
      const e = ease.inCubic(q);
      const dx = dir * e * (500 + hash2(k, 1) * 900);
      const dy = -e * (180 + hash2(k, 2) * 420) + Math.sin(q * 6 + k) * 30 * q;
      const rot = dir * e * (hash2(k, 3) - 0.3) * 5;
      const alpha = 1 - clamp((q - 0.7) / 0.3);
      if (alpha <= 0) continue;
      const cx = x0 + (c + 0.5) * cw;
      const cy = y0 + (r + 0.5) * rh;
      const piece: Pt[] = [];
      const corners: Pt[] = [
        [x0 + c * cw, y0 + r * rh],
        [x0 + (c + 1) * cw, y0 + r * rh],
        [x0 + (c + 1) * cw, y0 + (r + 1) * rh],
        [x0 + c * cw, y0 + (r + 1) * rh],
      ];
      corners.forEach((a, i) => {
        const b = corners[(i + 1) % 4] ?? a;
        for (let s = 0; s < 5; s++) {
          const u = s / 5;
          const j =
            (hash2(k * 31 + i * 7 + s, h.seed) - 0.5) * 9 * (1 - (c === 0 && i === 3 ? 1 : 0));
          piece.push([lerp(a[0], b[0], u) + j, lerp(a[1], b[1], u) + j]);
        }
      });
      ctx.save();
      ctx.globalAlpha *= alpha;
      ctx.translate(cx + dx, cy + dy);
      ctx.rotate(rot);
      ctx.translate(-cx, -cy);
      ctx.beginPath();
      piece.forEach((pt, i) => (i === 0 ? ctx.moveTo(pt[0], pt[1]) : ctx.lineTo(pt[0], pt[1])));
      ctx.closePath();
      ctx.clip();
      cutout(ctx, shape, { color, torn: 2.5, rim: 3, shadow: q > 0 ? 0.6 : 0.3, grain: 0.7 }, h);
      if (k % 3 === 0)
        cutout(
          ctx,
          ellipseShape(cx, cy, 16, 13),
          { color: C.tealDeep, torn: 4, rim: 0, shadow: 0, alpha: 0.8 },
          { boil: h.boil, seed: h.seed + k },
        );
      ctx.restore();
    }
  }
};

/** A balance: beam tilted by `tilt` radians (+ = left pan down). Base at (0, 0). */
export const balance = (
  ctx: CanvasRenderingContext2D,
  tilt: number,
  h: Hand,
  left?: () => void,
  right?: () => void,
) => {
  const sub = (k: number): Hand => ({ boil: h.boil, seed: h.seed + k });
  cutout(
    ctx,
    [
      [-120, 0],
      [120, 0],
      [70, -40],
      [-70, -40],
    ],
    { color: C.clay, torn: 2, rim: 3, shadow: 0.6 },
    sub(1),
  );
  cutout(
    ctx,
    rectShape(-14, -420, 28, 384),
    { color: C.clay, torn: 2, rim: 3, shadow: 0.6 },
    sub(2),
  );
  const top: Pt = [0, -420];
  const arm = 330;
  const ends: Pt[] = [-1, 1].map((s): Pt => [
    top[0] + s * Math.cos(tilt) * arm,
    top[1] - s * Math.sin(tilt) * arm,
  ]);
  stroke(
    ctx,
    line(ends[0] ?? top, ends[1] ?? top, 0.01, 3),
    { color: C.ink, width: 16, taper: 0.1 },
    sub(3),
  );
  cutout(
    ctx,
    ellipseShape(0, -420, 22, 22),
    { color: C.gold, torn: 1.5, rim: 2, shadow: 0.4 },
    sub(4),
  );
  ends.forEach((e, i) => {
    const pan: Pt = [e[0], e[1] + 200];
    stroke(
      ctx,
      line(e, [pan[0] - 90, pan[1]], 0.01, 10 + i),
      { color: C.inkSoft, width: 3.5 },
      sub(10 + i),
    );
    stroke(
      ctx,
      line(e, [pan[0] + 90, pan[1]], 0.01, 20 + i),
      { color: C.inkSoft, width: 3.5 },
      sub(20 + i),
    );
    ctx.save();
    ctx.translate(pan[0], pan[1]);
    (i === 0 ? left : right)?.();
    const bowl: Pt[] = spline(
      [
        [-110, 0],
        [-70, 34],
        [0, 44],
        [70, 34],
        [110, 0],
      ],
      8,
    );
    cutout(ctx, bowl, { color: C.gold, torn: 2, rim: 3, shadow: 0.6 }, sub(30 + i));
    ctx.restore();
  });
};

/**
 * An open hand, palm up, the forearm rising from below. The palm's centre
 * is the origin; things placed there sit in the hand.
 */
export const openHand = (
  ctx: CanvasRenderingContext2D,
  h: Hand,
  sleeve: string = LINEN,
  curl = 0,
) => {
  const sub = (k: number): Hand => ({ boil: h.boil, seed: h.seed + k });
  // Forearm and sleeve.
  cutout(
    ctx,
    [
      [-70, 20],
      [60, 30],
      [120, 520],
      [-90, 520],
    ],
    { color: C.skin, torn: 2, rim: 3, shadow: 0.6 },
    sub(1),
  );
  cutout(
    ctx,
    [
      [-110, 250],
      [140, 250],
      [190, 560],
      [-150, 560],
    ],
    { color: sleeve, torn: 3, rim: 3, shadow: 0.6 },
    sub(2),
  );
  // Fingers (behind the palm edge), thumb, palm.
  const fingers: Array<[number, number]> = [
    [150, -14],
    [158, 16],
    [150, 44],
    [130, 70],
  ];
  fingers.forEach(([len, y], i) => {
    const tipY = y - 40 - curl * 60;
    stroke(
      ctx,
      quad([80, y], [80 + len * 0.6, y - 6], [80 + len, tipY]),
      { color: C.skin, width: 44, taper: 0.02, pressure: 0.05, jitter: 0.6 },
      sub(10 + i),
    );
  });
  const palm: Pt[] = spline(
    [
      [-120, -10],
      [-60, -34],
      [40, -34],
      [110, -10],
      [120, 40],
      [60, 78],
      [-40, 80],
      [-110, 50],
    ],
    8,
    true,
  );
  cutout(ctx, palm, { color: C.skin, torn: 2, rim: 3, shadow: 0.5 }, sub(3));
  stroke(
    ctx,
    quad([-110, 10], [-170, -40], [-150, -110 - curl * 30]),
    { color: C.skin, width: 46, taper: 0.02, pressure: 0.05, jitter: 0.6 },
    sub(4),
  );
  // Palm crease.
  stroke(ctx, quad([-60, 20], [0, 36], [60, 18]), { color: C.clay, width: 4, alpha: 0.6 }, sub(5));
};

/** A paper coin. */
export const coin = (
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  h: Hand,
  color = '#a88a5c',
) => {
  cutout(ctx, ellipseShape(x, y, 64, 18), { color, torn: 1.5, rim: 2, shadow: 0.5 }, h);
  stroke(
    ctx,
    quad([x - 40, y], [x, y + 6], [x + 40, y]),
    { color: C.ink, width: 3, alpha: 0.4 },
    h,
  );
};

/** A folded white robe tied with a gold ribbon — the gift. */
export const gift = (ctx: CanvasRenderingContext2D, h: Hand) => {
  const sub = (k: number): Hand => ({ boil: h.boil, seed: h.seed + k });
  cutout(
    ctx,
    [
      [-110, -10],
      [110, -10],
      [120, 60],
      [-120, 60],
    ],
    { color: C.robe, torn: 2, rim: 3, shadow: 0.7, grain: 0.4 },
    sub(1),
  );
  cutout(
    ctx,
    [
      [-100, -60],
      [100, -60],
      [110, 0],
      [-110, 0],
    ],
    { color: '#fffaf0', torn: 2, rim: 3, shadow: 0.5, grain: 0.4 },
    sub(2),
  );
  cutout(
    ctx,
    rectShape(-16, -62, 32, 124),
    { color: C.gold, torn: 1.5, rim: 0, shadow: 0.3 },
    sub(3),
  );
  cutout(
    ctx,
    spline(
      [
        [0, -64],
        [-60, -110],
        [-70, -70],
        [0, -60],
      ],
      6,
      true,
    ),
    { color: C.gold, torn: 1.5, rim: 2, shadow: 0.4 },
    sub(4),
  );
  cutout(
    ctx,
    spline(
      [
        [0, -64],
        [60, -110],
        [70, -70],
        [0, -60],
      ],
      6,
      true,
    ),
    { color: C.orange, torn: 1.5, rim: 2, shadow: 0.4 },
    sub(5),
  );
};

/**
 * A loom: gold warp threads, and a white cloth woven `woven` (0..1) of the way
 * up, with the shuttle riding the working row. Centred at the origin.
 */
export const loom = (
  ctx: CanvasRenderingContext2D,
  woven: number,
  t: number,
  h: Hand,
  w = 900,
  ht = 560,
) => {
  const sub = (k: number): Hand => ({ boil: h.boil, seed: h.seed + k });
  const x0 = -w / 2;
  const y0 = -ht / 2;
  // Frame.
  cutout(
    ctx,
    rectShape(x0 - 60, y0 - 60, 40, ht + 120),
    { color: C.clay, torn: 2, rim: 3, shadow: 0.6 },
    sub(1),
  );
  cutout(
    ctx,
    rectShape(x0 + w + 20, y0 - 60, 40, ht + 120),
    { color: C.clay, torn: 2, rim: 3, shadow: 0.6 },
    sub(2),
  );
  cutout(
    ctx,
    rectShape(x0 - 80, y0 - 70, w + 160, 44),
    { color: C.clay, torn: 2, rim: 3, shadow: 0.6 },
    sub(3),
  );
  cutout(
    ctx,
    rectShape(x0 - 80, y0 + ht + 26, w + 160, 44),
    { color: C.clay, torn: 2, rim: 3, shadow: 0.6 },
    sub(4),
  );
  // Woven cloth, row by row from the bottom.
  const rows = 22;
  const done = woven * rows;
  const rh = ht / rows;
  for (let r = 0; r < Math.ceil(done); r++) {
    const part = clamp(done - r);
    const y = y0 + ht - (r + 0.5) * rh;
    const dirR = r % 2 === 0 ? 1 : -1;
    const a: Pt = dirR > 0 ? [x0, y] : [x0 + w, y];
    const b: Pt = dirR > 0 ? [x0 + w, y] : [x0, y];
    stroke(
      ctx,
      line(a, b, 0.004, r),
      {
        color: r % 5 === 4 ? C.glow : '#fffaf0',
        width: rh * 1.05,
        progress: part,
        taper: 0.01,
        pressure: 0.08,
        jitter: 0.8,
      },
      sub(100 + r),
    );
  }
  // Warp.
  for (let i = 0; i <= 24; i++) {
    const x = x0 + (w * i) / 24;
    stroke(
      ctx,
      line([x, y0 - 30], [x, y0 + ht + 30], 0.004, i),
      { color: C.gold, width: 4, taper: 0.02, alpha: 0.95 },
      sub(200 + i),
    );
  }
  // Shuttle.
  if (woven > 0 && woven < 1) {
    const r = Math.floor(done);
    const part = done - r;
    const dirR = r % 2 === 0 ? 1 : -1;
    const sx = dirR > 0 ? x0 + w * part : x0 + w * (1 - part);
    const sy = y0 + ht - (r + 0.5) * rh;
    at(ctx, { x: sx, y: sy, rot: Math.sin(t * 9) * 0.04 }, () => {
      cutout(
        ctx,
        spline(
          [
            [-70, 0],
            [-30, -16],
            [30, -16],
            [70, 0],
            [30, 16],
            [-30, 16],
          ],
          6,
          true,
        ),
        { color: C.orange, torn: 1.5, rim: 3, shadow: 0.7 },
        sub(300),
      );
    });
  }
};
