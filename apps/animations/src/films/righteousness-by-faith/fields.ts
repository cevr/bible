// The harvest's fields (the Board's `rain.harvest` and `rain.rain`), drawn in
// the Board's own pixels (a panel is 1536 × 1024) as the court is: a teal sky
// lit from the upper left, the sun's beams falling soft through it; lilac
// hills far off, gold rolling fields under them with dark cypresses and
// bushes on their rims; then the near field, its green rows running to a
// point low at the right, red-brown furrows between them, and at the frame's
// foot the near plants, tall leaves and ears, the one part lined in the ink.
// The far planes are flat paper with no outline, paler as they stand back.
// The grain ripens from the distance toward us (`ripe`), greens and stands
// up under the rain (`green`), and the rain itself is flecks of silver and
// gold falling a little to the left. Pure: the same numbers draw the same
// field.

import { type Hex, mix, unprobed } from '@bible/film/canvas';
import { clamp, lerp, rng } from '@bible/film/core';
import type { Pt } from '@bible/film/style';
import { C } from './kit.ts';

/** The panel's framing: the Board's 1536 wide at the film's 1920. */
export const FIELD_REST = { x: 768, y: 512, zoom: 1.25 } as const;

/** Where the near rows run to, low at the right, and the near field's far edge. */
const VP: Pt = [1220, 512];

/** How far below the frame the field runs, so a camera can travel over it. */
const FOOT = 1180;

/** The field's colours: the sky's, the far hills', the near rows' green, the ripe gold, the furrows' soil. */
const F = {
  skyTop: '#4fb0d2',
  skyMid: '#a7d8d3',
  skyLow: '#f5efc4',
  beam: '#fff7cf',
  hillFar: '#d1bdc9',
  hillNear: '#c6a9bd',
  goldFar: '#ecc877',
  goldNear: '#ddb062',
  goldBand: '#e5bb68',
  cypress: '#5f7f5d',
  cypressShade: '#4c6754',
  bush: '#6f8d5e',
  green: '#9bbb58',
  greenShade: '#6f9150',
  greenLush: '#86b54d',
  ripe: '#e6bf5c',
  ripeShade: '#c79c52',
  soil: '#c98c5e',
  soilShade: '#b47863',
  leaf: '#6fa04f',
  leafShade: '#57824b',
  ear: '#c9d98f',
  earRipe: '#ecc35c',
  rainGold: '#f4cf5a',
  rainSilver: '#e7ecf6',
} as const satisfies Record<string, Hex>;

const LINE = 3.5;

/** `pts` as the current path. */
const trace = (ctx: CanvasRenderingContext2D, pts: ReadonlyArray<Pt>) => {
  ctx.beginPath();
  pts.forEach(([x, y], i) => (i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y)));
  ctx.closePath();
};

const fill = (ctx: CanvasRenderingContext2D, pts: ReadonlyArray<Pt>, color: string) => {
  trace(ctx, pts);
  ctx.fillStyle = color;
  ctx.fill();
};

/** A ridge from x0 to x1 at about `y`, its rise `amp`, cut down to `foot`. */
const ridge = (y: number, amp: number, seed: number, foot: number): Pt[] => {
  const r = rng(seed);
  const pts: Pt[] = [[-700, foot]];
  for (let x = -700; x <= 2300; x += 100)
    pts.push([x, y - amp * (0.5 + 0.5 * Math.sin(x / 260 + r() * 0.8))]);
  pts.push([2300, foot]);
  return pts;
};

/** The sky, the beams, the hills and the gold fields under them, with their trees: everything past the near field. */
export const farField = (ctx: CanvasRenderingContext2D) => {
  const sky = ctx.createLinearGradient(0, -300, 0, 420);
  sky.addColorStop(0, F.skyTop);
  sky.addColorStop(0.55, F.skyMid);
  sky.addColorStop(1, F.skyLow);
  ctx.fillStyle = sky;
  ctx.fillRect(-700, -700, 3000, 1200);
  // The sun's beams from the upper left, soft.
  ctx.save();
  for (const [a, w, alpha] of [
    [0.52, 0.05, 0.22],
    [0.64, 0.035, 0.16],
    [0.76, 0.06, 0.14],
  ] as const) {
    ctx.globalAlpha = alpha;
    fill(
      ctx,
      [
        [-80, -120],
        [-80 + 2400 * Math.cos(a - w), -120 + 2400 * Math.sin(a - w)],
        [-80 + 2400 * Math.cos(a + w), -120 + 2400 * Math.sin(a + w)],
      ],
      F.beam,
    );
  }
  ctx.restore();
  fill(ctx, ridge(345, 30, 3, 520), F.hillFar);
  fill(ctx, ridge(372, 24, 5, 520), F.hillNear);
  // The gold rolling fields, in three bands toward us.
  fill(ctx, ridge(405, 22, 7, 560), F.goldFar);
  fill(ctx, ridge(440, 18, 11, 560), F.goldBand);
  fill(ctx, ridge(470, 14, 13, 560), F.goldNear);
  // Cypresses and bushes on the rims.
  for (const [x, y, h] of [
    [72, 412, 92],
    [152, 405, 120],
    [432, 408, 52],
    [452, 410, 44],
    [1438, 412, 108],
    [1476, 418, 96],
    [690, 412, 28],
    [712, 412, 26],
    [858, 418, 34],
    [880, 418, 30],
  ] as const)
    cypress(ctx, x, y, h);
  for (const [x, y, rx] of [
    [212, 420, 32],
    [262, 426, 26],
    [640, 418, 22],
    [1342, 444, 40],
    [1390, 446, 30],
    [970, 478, 26],
    [1010, 480, 20],
  ] as const)
    bush(ctx, x, y, rx);
  // The haze that sets them back.
  ctx.save();
  ctx.globalAlpha = 0.18;
  ctx.fillStyle = F.skyLow;
  ctx.fillRect(-700, 300, 3000, 260);
  ctx.restore();
};

const cypress = (ctx: CanvasRenderingContext2D, x: number, y: number, h: number) => {
  const w = h * 0.2;
  const shape: Pt[] = Array.from({ length: 24 }, (_, i) => {
    const a = (2 * Math.PI * i) / 24;
    return [x + w * Math.sin(a), y - h / 2 - (h / 2) * Math.cos(a) * (Math.cos(a) > 0 ? 1 : 0.85)];
  });
  fill(ctx, shape, F.cypress);
  ctx.save();
  trace(ctx, shape);
  ctx.clip();
  fill(
    ctx,
    [
      [x + w * 0.15, y - h - 4],
      [x + w + 4, y - h],
      [x + w + 4, y + 4],
      [x + w * 0.3, y + 4],
    ],
    F.cypressShade,
  );
  ctx.restore();
};

const bush = (ctx: CanvasRenderingContext2D, x: number, y: number, rx: number) => {
  const shape: Pt[] = Array.from({ length: 20 }, (_, i) => {
    const a = Math.PI + (Math.PI * i) / 19;
    return [x + rx * Math.cos(a), y + rx * 0.75 * Math.sin(a)];
  });
  fill(ctx, shape, F.bush);
};

/**
 * The near field's furrows at its foot: each one's centre, a step apart, far
 * enough to the left that their lines reach the frame's left edge near the
 * horizon (the point is at its right).
 */
const STEP = 260;
const FURROWS = Array.from({ length: 75 }, (_, i) => -16120 + i * STEP);
/** The ground's span across, which every furrow and row is drawn inside. */
const SPAN = [-700, 2300] as const;

/** The near field's state: how ripe from the distance (0..1, 1 all gold), and how green and full the rain has made it. */
export interface FieldState {
  readonly ripe: number;
  readonly green: number;
}

/** How ripe a plant at depth `d` (0 at the far edge, 1 at the frame's foot) is. */
const ripeAt = (s: FieldState, d: number) => clamp(s.ripe * 2.2 - d * 1.4, 0, 1);

/** The near field: its ground, its furrows to the point low at the right, and its rows of grain, far first. */
export const nearField = (ctx: CanvasRenderingContext2D, s: FieldState) => {
  const ground = mix(F.green, F.greenLush, s.green);
  fill(
    ctx,
    [
      [SPAN[0], VP[1]],
      [SPAN[1], VP[1]],
      [SPAN[1], FOOT],
      [SPAN[0], FOOT],
    ],
    mix(ground, F.ripe, ripeAt(s, 0.3) * 0.6),
  );
  for (const x of FURROWS) {
    const half = 46;
    fill(
      ctx,
      [
        [VP[0], VP[1]],
        [x - half, FOOT],
        [x + half, FOOT],
      ],
      F.soil,
    );
    // The furrow's far wall in shade, toward the light's complement.
    fill(
      ctx,
      [
        [VP[0], VP[1]],
        [x + half * 0.2, FOOT],
        [x + half, FOOT],
      ],
      F.soilShade,
    );
  }
  // The rows of grain between the furrows, each a run of leaf tops from the
  // far edge toward us, far ones first so the near overlap them.
  const rows = FURROWS.slice(1).map((x) => x - STEP / 2);
  const steps = 34;
  for (let k = 0; k < steps; k++) {
    const d = (k / (steps - 1)) ** 1.7;
    const y = lerp(VP[1], FOOT, d);
    const ripe = ripeAt(s, d);
    const top = mix(mix(F.green, F.greenLush, s.green), F.ripe, ripe);
    const side = mix(F.greenShade, F.ripeShade, ripe);
    for (const xb of rows) {
      const x = lerp(VP[0], xb, d);
      const w = lerp(4, 190, d);
      if (x + w / 2 < SPAN[0] || x - w / 2 > SPAN[1]) continue;
      const h = w * (0.55 + 0.25 * s.green);
      tuft(ctx, x, y, w, h, top, side);
    }
  }
};

/** A row's leaf tops at one depth: three points, the far sides in shade. */
const tuft = (
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  top: string,
  side: string,
) => {
  const pts: Pt[] = [
    [x - w / 2, y],
    [x - w / 3, y - h * 0.8],
    [x - w / 6, y - h * 0.35],
    [x, y - h],
    [x + w / 6, y - h * 0.35],
    [x + w / 3, y - h * 0.8],
    [x + w / 2, y],
  ];
  fill(ctx, pts, top);
  fill(
    ctx,
    [
      [x, y - h],
      [x + w / 6, y - h * 0.35],
      [x + w / 3, y - h * 0.8],
      [x + w / 2, y],
      [x + w * 0.08, y],
    ],
    side,
  );
};

/** The near plants along the frame's foot: each its place, its size and its lean. */
const NEAR = [
  [-30, 1030, 1.1, -0.1],
  [150, 1050, 0.9, 0.08],
  [330, 1010, 0.8, -0.05],
  [700, 1040, 1.15, 0.05],
  [930, 1060, 0.95, -0.08],
  [1130, 1020, 1, 0.1],
  [1330, 1050, 1.05, -0.04],
  [1520, 1030, 1.1, 0.06],
] as const;

/** The near plants standing from `from` to short of `to` (x): tall leaves and an ear on each, lined in the ink. */
export const nearPlants = (
  ctx: CanvasRenderingContext2D,
  s: FieldState,
  from = -Infinity,
  to = Infinity,
) => {
  const ripe = ripeAt(s, 1);
  for (const [x, y, size, lean] of NEAR) {
    if (x < from || x >= to) continue;
    const sz = size * (0.85 + 0.2 * s.green);
    for (const [dx, h, turn] of [
      [-34, 230, -0.35],
      [30, 210, 0.3],
      [-6, 170, -0.08],
    ] as const)
      leaf(ctx, x + dx * sz, y, h * sz, turn + lean, ripe);
    ear(ctx, x + 4 * sz, y - 150 * sz, sz, lean, ripe);
  }
};

const ink = (ctx: CanvasRenderingContext2D, width = LINE) => {
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  ctx.lineWidth = width;
  ctx.strokeStyle = C.outline;
  unprobed(ctx, () => ctx.stroke());
};

/** One tall leaf from its base at (x, y), `h` long, leaning `turn`: its far half in shade. */
const leaf = (
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  h: number,
  turn: number,
  ripe: number,
) => {
  const w = h * 0.2;
  const tip: Pt = [x + Math.sin(turn) * h, y - Math.cos(turn) * h];
  const mid: Pt = [x + Math.sin(turn) * h * 0.5, y - Math.cos(turn) * h * 0.5];
  const nx = Math.cos(turn) * w;
  const ny = Math.sin(turn) * w;
  ctx.beginPath();
  ctx.moveTo(x - nx * 0.6, y - ny * 0.6);
  ctx.quadraticCurveTo(mid[0] - nx * 1.4, mid[1] - ny * 1.4, tip[0], tip[1]);
  ctx.quadraticCurveTo(mid[0] + nx * 1.4, mid[1] + ny * 1.4, x + nx * 0.6, y + ny * 0.6);
  ctx.closePath();
  ctx.fillStyle = mix(F.leaf, F.ripe, ripe * 0.7);
  ctx.fill();
  ctx.save();
  ctx.clip();
  ctx.beginPath();
  ctx.moveTo(x, y);
  ctx.lineTo(tip[0], tip[1]);
  ctx.lineTo(tip[0] + nx * 3, tip[1] + ny * 3);
  ctx.lineTo(x + nx * 3, y + ny * 3);
  ctx.closePath();
  ctx.fillStyle = mix(F.leafShade, F.ripeShade, ripe * 0.7);
  ctx.fill();
  ctx.restore();
  ctx.beginPath();
  ctx.moveTo(x - nx * 0.6, y - ny * 0.6);
  ctx.quadraticCurveTo(mid[0] - nx * 1.4, mid[1] - ny * 1.4, tip[0], tip[1]);
  ctx.quadraticCurveTo(mid[0] + nx * 1.4, mid[1] + ny * 1.4, x + nx * 0.6, y + ny * 0.6);
  ink(ctx);
};

/** An ear of grain on its stalk, its top at (x, y): a braid of grains, green to gold. */
const ear = (
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  size: number,
  lean: number,
  ripe: number,
) => {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(lean * 0.6);
  ctx.scale(size, size);
  ctx.beginPath();
  ctx.moveTo(0, 30);
  ctx.lineTo(-2, 150);
  ink(ctx, LINE / size);
  const color = mix(F.ear, F.earRipe, ripe);
  const shade = mix('#a9bb72', '#c99b45', ripe);
  for (let i = 0; i < 6; i++) {
    for (const side of [-1, 1]) {
      const gx = side * 7;
      const gy = 28 - i * 11;
      ctx.beginPath();
      ctx.ellipse(gx, gy, 8, 12, side * 0.5, 0, 2 * Math.PI);
      ctx.fillStyle = side > 0 ? shade : color;
      ctx.fill();
      ink(ctx, 2.6 / size);
    }
  }
  ctx.restore();
};

/** The rain's flecks: a fixed field that falls and drifts a little left. */
const DROPS = (() => {
  const r = rng(523);
  return Array.from({ length: 260 }, (_, i) => ({
    x: -200 + r() * 2000,
    y: r() * 1300,
    v: 0.75 + r() * 0.5,
    gold: i % 3 === 0,
  }));
})();

/** The rain at time `t`: `count` of its flecks (0..1 of them) at `alpha`. */
export const rain = (ctx: CanvasRenderingContext2D, t: number, count: number, alpha = 1) => {
  if (count <= 0) return;
  const n = Math.round(DROPS.length * clamp(count, 0, 1));
  ctx.save();
  ctx.globalAlpha *= alpha;
  ctx.lineCap = 'round';
  for (const d of DROPS.slice(0, n)) {
    const fall = (d.y + t * 520 * d.v) % 1300;
    const x = d.x - fall * 0.22;
    const y = fall - 160;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x - 5, y + 24);
    ctx.lineWidth = d.gold ? 5 : 4;
    ctx.strokeStyle = d.gold ? F.rainGold : F.rainSilver;
    unprobed(ctx, () => ctx.stroke());
  }
  ctx.restore();
};
