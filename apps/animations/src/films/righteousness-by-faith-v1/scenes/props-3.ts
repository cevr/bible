// Props for the closing beats: the wilderness camp, serpents, the bronze
// serpent, the heart, flowers, the 1888 newspaper and stamp, and the angel.

import {
  at,
  cutout,
  type Look,
  type Pose,
  drawFigure,
  type Hand,
  type Pt,
  ellipseShape,
  line,
  quad,
  rectShape,
  spline,
  stroke,
  write,
} from '@bible/film/canvas';
import { hash2, clamp } from '@bible/film/core';
import { C, F, hand } from '../kit.ts';

const sub = (h: Hand, k: number): Hand => ({ boil: h.boil, seed: h.seed + k });

/**
 * A figure whose garment changes from `from` to `to`, sweeping down from the
 * head: the robe arriving over the rags. Draw in the figure's local frame.
 */
export const changing = (
  ctx: CanvasRenderingContext2D,
  pose: Pose,
  from: Look,
  to: Look,
  p: number,
  h: Hand,
) => {
  if (p < 1) drawFigure(ctx, pose, from, h);
  if (p <= 0) return;
  ctx.save();
  ctx.beginPath();
  ctx.rect(-600, -560, 1200, 40 + 560 * p);
  ctx.clip();
  drawFigure(ctx, pose, to, h);
  ctx.restore();
};

/** A soft round glow. */
export const glow = (
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  r: number,
  a: number,
  rgb = '251, 239, 200',
) => {
  if (a <= 0) return;
  const g = ctx.createRadialGradient(x, y, 0, x, y, r);
  g.addColorStop(0, `rgba(${rgb}, ${0.9 * a})`);
  g.addColorStop(1, `rgba(${rgb}, 0)`);
  ctx.save();
  ctx.fillStyle = g;
  ctx.fillRect(x - r, y - r, r * 2, r * 2);
  ctx.restore();
};

// ─── wilderness ──────────────────────────────────────────────────────────────

/** Dusk sky in torn bands, dunes, and a row of tents. */
export const wilderness = (ctx: CanvasRenderingContext2D, h: Hand, dusk: number) => {
  const bands: Array<[number, string]> = [
    [-40, '#e9b48a'],
    [170, '#eec393'],
    [330, '#f2d3a1'],
  ];
  bands.forEach(([y, color], i) =>
    cutout(
      ctx,
      rectShape(-60, y, 2040, 260),
      { color, torn: 5, rim: 0, shadow: 0.2, grain: 0.7 },
      sub(h, i),
    ),
  );
  // Night creeping in from the top.
  if (dusk > 0) {
    ctx.save();
    ctx.globalAlpha *= dusk * 0.55;
    cutout(
      ctx,
      rectShape(-60, -60, 2040, 250),
      { color: C.night, torn: 6, rim: 0, shadow: 0, grain: 0.8 },
      sub(h, 5),
    );
    ctx.restore();
  }
  const dunes: Array<[Pt[], string]> = [
    [
      spline(
        [
          [-80, 620],
          [300, 540],
          [700, 600],
          [1150, 520],
          [1600, 590],
          [2000, 540],
        ],
        10,
      ),
      '#d9a86c',
    ],
    [
      spline(
        [
          [-80, 720],
          [420, 660],
          [900, 720],
          [1400, 650],
          [2000, 710],
        ],
        10,
      ),
      '#caa06a',
    ],
  ];
  dunes.forEach(([top, color], i) =>
    cutout(
      ctx,
      [...top, [2000, 1140], [-80, 1140]],
      { color, torn: 3, rim: 2, shadow: 0.4, grain: 0.8 },
      sub(h, 10 + i),
    ),
  );
  // Tents on the far ridge.
  for (let i = 0; i < 7; i++) {
    const x = 120 + i * 270 + hash2(i, 4) * 60;
    const y = 600 + hash2(i, 9) * 30;
    const w = 110 + hash2(i, 2) * 40;
    const tent: Pt[] = [
      [x - w / 2, y],
      [x, y - w * 0.62],
      [x + w / 2, y],
    ];
    cutout(
      ctx,
      tent,
      { color: i % 2 === 0 ? '#efe3cc' : '#e2cfae', torn: 2, rim: 2, shadow: 0.4 },
      sub(h, 20 + i),
    );
    cutout(
      ctx,
      [
        [x - 10, y],
        [x, y - w * 0.3],
        [x + 10, y],
      ],
      { color: C.inkSoft, torn: 1, rim: 0, shadow: 0 },
      sub(h, 40 + i),
    );
  }
};

/** A slithering torn-red-paper snake, head at (x, y), heading `dir`. */
export const snake = (
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  len: number,
  t: number,
  dir: 1 | -1,
  h: Hand,
  scale = 1,
) => {
  const pts: Pt[] = [];
  const n = 28;
  for (let i = 0; i <= n; i++) {
    const u = i / n;
    pts.push([x - dir * u * len * scale, y + Math.sin(u * 9 - t * 7) * 14 * scale * (0.4 + u)]);
  }
  stroke(ctx, pts, { color: C.red, width: 20 * scale, taper: 0.5, pressure: 0.1, jitter: 0.6 }, h);
  const head = pts[0] ?? [x, y];
  cutout(
    ctx,
    ellipseShape(head[0] + dir * 6 * scale, head[1], 16 * scale, 11 * scale),
    { color: C.red, torn: 1, rim: 2, shadow: 0.4 },
    sub(h, 1),
  );
  ctx.fillStyle = C.glow;
  ctx.beginPath();
  ctx.arc(head[0] + dir * 12 * scale, head[1] - 3 * scale, 3 * scale, 0, Math.PI * 2);
  ctx.fill();
};

/** The pole and its bronze serpent; `rise` 0→1 lifts it from the ground. */
export const brazen = (
  ctx: CanvasRenderingContext2D,
  x: number,
  ground: number,
  height: number,
  rise: number,
  shine: number,
  h: Hand,
) => {
  if (rise <= 1e-3) return;
  const top = ground - height * rise;
  glow(ctx, x, top + 60, 360, shine, '230, 179, 71');
  stroke(
    ctx,
    line([x, ground + 10], [x, top], 0.01, 3),
    { color: C.clay, width: 22, taper: 0.03, pressure: 0.1 },
    sub(h, 1),
  );
  stroke(
    ctx,
    line([x - 110, top + 40], [x + 110, top + 40], 0.02, 4),
    { color: C.clay, width: 16, taper: 0.05 },
    sub(h, 2),
  );
  // The serpent winds around the pole in an S, once the pole is up.
  ctx.save();
  ctx.globalAlpha *= clamp((rise - 0.55) * 3);
  const s = spline(
    [
      [x - 16, top + 250],
      [x + 55, top + 205],
      [x - 55, top + 150],
      [x + 55, top + 95],
      [x - 20, top + 40],
      [x + 30, top - 8],
    ],
    10,
  );
  stroke(ctx, s, { color: '#c98a3a', width: 24, taper: 0.35, pressure: 0.15 }, sub(h, 3));
  stroke(ctx, s, { color: C.gold, width: 8, taper: 0.4, alpha: 0.8 }, sub(h, 4));
  cutout(
    ctx,
    ellipseShape(x + 38, top - 14, 22, 15),
    { color: '#c98a3a', torn: 1.5, rim: 2, shadow: 0.4 },
    sub(h, 5),
  );
  ctx.fillStyle = C.ink;
  ctx.beginPath();
  ctx.arc(x + 46, top - 18, 3.5, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
};

// ─── heart, cards, flowers ───────────────────────────────────────────────────

export const heartShape = (cx: number, cy: number, s: number): Pt[] =>
  spline(
    [
      [cx, cy + 0.9 * s],
      [cx - 0.95 * s, cy - 0.05 * s],
      [cx - 0.7 * s, cy - 0.7 * s],
      [cx - 0.15 * s, cy - 0.6 * s],
      [cx, cy - 0.3 * s],
      [cx + 0.15 * s, cy - 0.6 * s],
      [cx + 0.7 * s, cy - 0.7 * s],
      [cx + 0.95 * s, cy - 0.05 * s],
    ],
    10,
    true,
  );

/** A small five-petal flower that grows 0→1 from the ground at (x, y). */
export const flower = (
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  grow: number,
  color: string,
  h: Hand,
) => {
  if (grow <= 0) return;
  const g = clamp(grow);
  const stem = 70 * g;
  stroke(
    ctx,
    quad([x, y], [x + 8, y - stem / 2], [x, y - stem]),
    { color: C.leaf, width: 6, taper: 0.1 },
    sub(h, 1),
  );
  if (g > 0.3)
    cutout(
      ctx,
      ellipseShape(x - 14, y - stem * 0.45, 13 * g, 6 * g),
      { color: C.leaf, torn: 1, rim: 1, shadow: 0.2 },
      sub(h, 2),
    );
  const bloom = clamp((g - 0.5) * 2);
  if (bloom <= 0) return;
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2 + hash2(h.seed, 1);
    cutout(
      ctx,
      ellipseShape(
        x + Math.cos(a) * 13 * bloom,
        y - stem + Math.sin(a) * 13 * bloom,
        11 * bloom,
        11 * bloom,
        16,
      ),
      { color, torn: 1, rim: 1.5, shadow: 0.3 },
      sub(h, 10 + i),
    );
  }
  cutout(
    ctx,
    ellipseShape(x, y - stem, 7 * bloom, 7 * bloom, 12),
    { color: C.gold, torn: 0.5, rim: 0, shadow: 0 },
    sub(h, 20),
  );
};

/** A labelled paper card with an icon drawn by `icon` in its upper half. */
export const card = (
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  label: string,
  sublabel: string,
  h: Hand,
  icon: () => void,
) => {
  cutout(
    ctx,
    rectShape(x - 210, y - 230, 420, 460),
    { color: C.robe, torn: 3, rim: 0, shadow: 0.7, grain: 0.35 },
    h,
  );
  ctx.save();
  ctx.translate(x, y - 70);
  icon();
  ctx.restore();
  write(
    ctx,
    label,
    x,
    y + 118,
    { family: F.display, size: 58, weight: 700, color: C.ink, align: 'center', tracking: 0.1 },
    sub(h, 1),
    { boil: 0.3 },
  );
  write(ctx, sublabel, x, y + 180, { ...hand(44, C.orange), align: 'center' }, sub(h, 2), {
    boil: 0.3,
  });
};

/** A ticket stub. */
export const ticket = (ctx: CanvasRenderingContext2D, h: Hand) => {
  const shape: Pt[] = [
    [-120, -60],
    [120, -60],
    [120, -18],
    [104, 0],
    [120, 18],
    [120, 60],
    [-120, 60],
    [-120, 18],
    [-104, 0],
    [-120, -18],
  ];
  cutout(ctx, shape, { color: C.gold, torn: 1.5, rim: 3, shadow: 0.5 }, h);
  stroke(ctx, line([60, -46], [60, 46], 0.01, 1), { color: C.orange, width: 3 }, sub(h, 1));
  // The words sit on the body, between the notch (x -104) and the tear (x 60).
  write(
    ctx,
    'ADMIT ONE',
    -22,
    10,
    { family: F.display, size: 22, weight: 700, color: C.ink, align: 'center', tracking: 0.12 },
    sub(h, 2),
    { boil: 0.2 },
  );
};

/** A little plant in a pot, grown 0→1. */
export const plant = (ctx: CanvasRenderingContext2D, grow: number, h: Hand) => {
  cutout(
    ctx,
    [
      [-52, 20],
      [52, 20],
      [40, 90],
      [-40, 90],
    ],
    { color: C.clay, torn: 1.5, rim: 2, shadow: 0.5 },
    h,
  );
  const g = clamp(grow);
  const top = 20 - 110 * g;
  stroke(
    ctx,
    quad([0, 20], [10, (20 + top) / 2], [0, top]),
    { color: C.leaf, width: 8, taper: 0.1 },
    sub(h, 1),
  );
  for (let i = 0; i < 4; i++) {
    const lg = clamp(g * 4 - i);
    if (lg <= 0) continue;
    const ly = 10 - i * 26;
    const side = i % 2 === 0 ? -1 : 1;
    cutout(
      ctx,
      ellipseShape(side * 26 * lg, ly, 24 * lg, 11 * lg),
      { color: C.leaf, torn: 1, rim: 1.5, shadow: 0.3 },
      sub(h, 10 + i),
    );
  }
};

// ─── 1888 ────────────────────────────────────────────────────────────────────

/** A torn newspaper page with a masthead and columns of scribbled type. */
export const newspaper = (
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  ht: number,
  masthead: string,
  h: Hand,
) => {
  cutout(
    ctx,
    rectShape(x, y, w, ht),
    { color: '#f3ecdc', torn: 4, rim: 0, shadow: 0.8, grain: 0.5 },
    h,
  );
  write(
    ctx,
    masthead,
    x + w / 2,
    y + 96,
    { family: F.display, size: 74, weight: 700, color: C.ink, align: 'center', tracking: 0.06 },
    sub(h, 1),
    { boil: 0.2 },
  );
  stroke(
    ctx,
    line([x + 40, y + 128], [x + w - 40, y + 128], 0.005, 1),
    { color: C.ink, width: 4 },
    sub(h, 2),
  );
  stroke(
    ctx,
    line([x + 40, y + 140], [x + w - 40, y + 140], 0.005, 2),
    { color: C.ink, width: 2 },
    sub(h, 3),
  );
  const cols = 4;
  const cw = (w - 80) / cols;
  for (let c = 0; c < cols; c++) {
    for (let r = 0; r < Math.floor((ht - 200) / 26); r++) {
      const lx = x + 40 + c * cw + 10;
      const ly = y + 180 + r * 26;
      const len = (cw - 30) * (0.7 + 0.3 * hash2(r, c + 3));
      stroke(
        ctx,
        line([lx, ly], [lx + len, ly], 0.01, r),
        { color: C.inkSoft, width: 3, alpha: 0.35, taper: 0.05 },
        sub(h, 100 + c * 50 + r),
      );
    }
  }
};

/** A rubber stamp in red ink, slammed in: `p` 0→1. */
export const stamp = (
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  lines: ReadonlyArray<string>,
  p: number,
  h: Hand,
) => {
  if (p <= 0) return;
  const s = 1 + (1 - clamp(p * 1.4)) * 0.8;
  ctx.save();
  ctx.globalAlpha *= clamp(p * 3) * 0.92;
  at(ctx, { x, y, rot: -0.09, scale: s }, () => {
    const w = 760;
    const ht = 90 + lines.length * 78;
    for (const [inset, width] of [
      [0, 9],
      [16, 4],
    ] satisfies ReadonlyArray<readonly [number, number]>)
      for (const [a, b] of [
        [
          [-w / 2 + inset, -ht / 2 + inset],
          [w / 2 - inset, -ht / 2 + inset],
        ],
        [
          [w / 2 - inset, -ht / 2 + inset],
          [w / 2 - inset, ht / 2 - inset],
        ],
        [
          [w / 2 - inset, ht / 2 - inset],
          [-w / 2 + inset, ht / 2 - inset],
        ],
        [
          [-w / 2 + inset, ht / 2 - inset],
          [-w / 2 + inset, -ht / 2 + inset],
        ],
      ] satisfies ReadonlyArray<readonly [Pt, Pt]>)
        stroke(
          ctx,
          line(a, b, 0.004, inset + width),
          { color: C.red, width, taper: 0.02, jitter: 1.4 },
          sub(h, inset + a[0]),
        );
    lines.forEach((l, i) =>
      write(
        ctx,
        l,
        0,
        -ht / 2 + 110 + i * 78,
        { family: F.display, size: 64, weight: 800, color: C.red, align: 'center', tracking: 0.08 },
        sub(h, 30 + i),
        { boil: 0.5 },
      ),
    );
  });
  ctx.restore();
};

/** A silhouette portrait: a figure in ink with a torn name tag. */
export const silhouette = (
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  s: number,
  name: string,
  p: number,
  h: Hand,
) => {
  if (p <= 0) return;
  at(ctx, { x, y, scale: s * p }, () => {
    cutout(
      ctx,
      ellipseShape(0, -230, 190, 250, 60),
      { color: C.tealPale, torn: 3, rim: 4, shadow: 0.6 },
      sub(h, 1),
    );
    ctx.save();
    ctx.beginPath();
    ctx.ellipse(0, -230, 190, 250, 0, 0, Math.PI * 2);
    ctx.clip();
    drawFigure(
      ctx,
      { armL: 0.08, armR: 0.08 },
      { robe: C.ink, skin: C.ink, ink: C.ink, hair: C.ink, face: 'none', grain: 0.3 },
      sub(h, 2),
    );
    ctx.restore();
  });
  const tagP = clamp(p * 2 - 1);
  if (tagP <= 0) return;
  ctx.save();
  ctx.globalAlpha *= tagP;
  at(ctx, { x, y: y + 60 * s, rot: 0.03 }, () => {
    const w = name.length * 24 + 50;
    cutout(
      ctx,
      rectShape(-w / 2, -32, w, 64),
      { color: C.robe, torn: 2.5, rim: 0, shadow: 0.5 },
      sub(h, 5),
    );
    write(ctx, name, 0, 14, { ...hand(42), align: 'center' }, sub(h, 6), { boil: 0.3 });
  });
  ctx.restore();
};

/** A flying angel, horizontal, with a trumpet; `flap` animates the wings. */
export const angel = (
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  s: number,
  flap: number,
  h: Hand,
) => {
  at(ctx, { x, y, scale: s, rot: -Math.PI / 2 + 0.12 }, () => {
    // Wings behind (drawn in the upright figure frame, the frame is rotated).
    const wing = (side: -1 | 1, k: number) => {
      const lift = Math.sin(flap) * 0.35;
      const pts: Pt[] = spline(
        [
          [side * 40, -250],
          [side * (180 + 40 * lift), -380 - 90 * lift],
          [side * (300 + 30 * lift), -330 - 140 * lift],
          [side * 220, -220],
          [side * 130, -160],
        ],
        8,
        true,
      );
      cutout(ctx, pts, { color: C.robe, torn: 2.5, rim: 3, shadow: 0.5, grain: 0.4 }, sub(h, k));
    };
    wing(1, 1);
    drawFigure(
      ctx,
      { armL: 1.9, armR: 2.4, elbowL: 0.1, elbowR: 0.2 },
      { robe: C.robe, skin: C.skin, ink: C.ink, hair: C.gold, face: 'joy' },
      sub(h, 3),
    );
    wing(-1, 2);
    // Trumpet from the raised right hand.
    stroke(
      ctx,
      line([90, -540], [150, -700], 0.01, 1),
      { color: C.gold, width: 14, taper: 0.02 },
      sub(h, 4),
    );
    cutout(
      ctx,
      [
        [120, -690],
        [190, -710],
        [170, -760],
        [135, -720],
      ],
      { color: C.gold, torn: 1, rim: 2, shadow: 0.4 },
      sub(h, 5),
    );
  });
};
