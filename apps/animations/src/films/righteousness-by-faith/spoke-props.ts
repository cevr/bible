// The first page's world and the word's three gifts, for `spoke` and the
// beats that call its row back, drawn in the Board's pixels. The world as
// `spoke.dark` and `spoke.light` paint it: torn paper planes with no ink,
// each torn edge a rim cut lighter in its own hue (the dark's faint cool
// edge, the day's cream), so the dark reads as unlit paper; the gold word of
// light that flies its arc across the dark and bursts into the sun; the sky
// it floods, dawn and then teal; the land and water that rise into place
// under it; the gold stars called out over it. The seal's old outline,
// traced round the seed. And the three icons the word brings
// (`spoke.brings`), each lined in the cast's ink and drawn about its foot on
// the page: the lead's own lilac hand circle with the gold seed on it
// (faith), the white cloth (forgiveness), the green blade (power). Nothing
// here is lettered. The lines are the props' own, under any card, so they
// are drawn `unprobed`. Pure: the same pose draws the same thing.

import {
  type Hand,
  type Hex,
  type Pt,
  clearOf,
  cutout,
  ellipseShape,
  glow,
  length,
  mix,
  spline,
  sub,
  trim,
  unprobed,
  wash,
} from '@bible/film/canvas';
import { clamp, lerp } from '@bible/film/core';
import { cut } from './court-set.ts';
import { C } from './kit.ts';
import { GOLD_GLOW, type Paper, paper } from './page-set.ts';
import { type OpenSeedPose, glow as shine, openSeed } from './props.ts';
import { PAPERS } from './rigs/papers.ts';

// ─── the world's papers ──────────────────────────────────────────────────────

/** A torn plane of the world: its paper, and the rim its torn edge shows, a lighter cut of its own hue. */
export interface Torn {
  readonly color: Hex;
  readonly rim: Hex;
}

/** How far every plane runs past the panels' edges, Board pixels, so the camera can travel and breathe over them. */
const RUN = { left: -700, right: 2300, top: -900, bottom: 1700 } as const;

/**
 * A torn edge's roughness, how far its rim shows above it and how high it
 * lifts off the plane behind, Board pixels: a clean tear, its rim a thin line
 * (`spoke.dark`); and how much rougher the rim's own tear is than the face's.
 */
const TEAR = { torn: 2.5, rim: 2.5, shadow: 0.3, rougher: 1.3 } as const;

/** The props' ink, Board pixels: the cast's, as heavy as his outline and the risen seed's (`seed.life`). */
export const ICON_LINE = 5;

/** The unlit world (`spoke.dark`): its sky, one flat indigo, and its three bands of land, farthest first. */
export const DARK = {
  sky: '#25224f',
  bands: [
    { color: '#4a3c7b', rim: '#7769ba' },
    { color: '#1f2247', rim: '#6a62b3' },
    { color: '#232456', rim: '#7c72c6' },
  ],
} as const satisfies { readonly sky: Hex; readonly bands: ReadonlyArray<Torn> };

/** The front band as the day reaches it (`spoke.light`): still dark, holding the foreground, a little bluer, its rim lilac. */
const FRONT_LIT: Torn = { color: '#2b2b6b', rim: '#9a8fd2' };

/** The made world (`spoke.light`): the far hills, the land either side of the water, the water. */
const MADE = {
  hills: { color: '#c99b94', rim: '#f5dccb' },
  land: { color: '#c9a26b', rim: '#f6e4b8' },
  shore: { color: '#c19867', rim: '#f2dcb0' },
  water: { color: '#4ea2a5', rim: '#9fd6cc' },
} as const satisfies Record<string, Torn>;

/** The water's deep toward the front: where it starts darkening, how far it runs, its colour. */
const DEEP = { from: 690, run: 220, color: '#2c7c8d' } as const satisfies {
  readonly from: number;
  readonly run: number;
  readonly color: Hex;
};

/** The sun's glint along the horizon: its middle, its half-length and half-height, its light. */
const GLINT = { x: 880, y: 642, rx: 300, ry: 9, color: '#fff0bf', alpha: 0.8 } as const;

/** A plane under the top edge `top` (smoothed), down past the frame's foot and out past its sides. */
const under = (top: ReadonlyArray<Pt>): Pt[] => {
  const edge = spline(top, 8);
  const first = edge[0] ?? [0, 0];
  const last = edge.at(-1) ?? first;
  return [
    [RUN.left, first[1]],
    ...edge,
    [RUN.right, last[1]],
    [RUN.right, RUN.bottom],
    [RUN.left, RUN.bottom],
  ];
};

/** The dark's three bands, farthest first, each under its top edge as `spoke.dark` tears it. */
const BANDS: ReadonlyArray<ReadonlyArray<Pt>> = [
  under([
    [-80, 575],
    [120, 568],
    [280, 557],
    [460, 578],
    [700, 615],
    [900, 640],
    [1060, 628],
    [1290, 600],
    [1536, 595],
    [1700, 592],
  ]),
  under([
    [-80, 626],
    [150, 628],
    [380, 645],
    [620, 690],
    [870, 721],
    [1000, 708],
    [1200, 682],
    [1400, 664],
    [1536, 656],
    [1700, 650],
  ]),
  under([
    [-80, 806],
    [150, 790],
    [420, 772],
    [650, 776],
    [900, 795],
    [1100, 812],
    [1300, 835],
    [1450, 856],
    [1536, 868],
    [1700, 885],
  ]),
];

/** The far hills under their ridge, as `spoke.light` lays it: a long rise on the left, a lower one beyond the water. */
const HILLS = under([
  [-80, 552],
  [100, 540],
  [260, 526],
  [420, 540],
  [600, 568],
  [800, 606],
  [880, 608],
  [1000, 582],
  [1080, 576],
  [1200, 584],
  [1350, 596],
  [1536, 598],
  [1700, 598],
]);

/** The water, from the horizon down. */
const WATER = under([
  [-80, 636],
  [1700, 636],
]);

/** The land on the near side of the water, left: a wedge running out into it. */
const LAND: ReadonlyArray<Pt> = [
  [RUN.left, 592],
  ...spline(
    [
      [-80, 590],
      [150, 592],
      [350, 603],
      [520, 622],
      [640, 648],
      [668, 659],
    ],
    8,
  ),
  [600, 666],
  [300, 668],
  [-80, 670],
  [RUN.left, 672],
];

/** The land beyond the water, right: rising from the water's edge to the frame's side. */
const SHORE: ReadonlyArray<Pt> = [
  [758, 707],
  ...spline(
    [
      [770, 703],
      [860, 690],
      [1000, 664],
      [1150, 632],
      [1300, 602],
      [1450, 578],
      [1536, 568],
      [1700, 556],
      [RUN.right, 545],
    ],
    8,
  ),
  [RUN.right, 714],
  [1536, 707],
  [760, 709],
];

/**
 * One torn plane of the world, `pts` in `p`, at `alpha`: no ink, its edge
 * still. Its rim is a sheet of its own under it, the plane's shape lifted
 * `TEAR.rim` and torn as the face is but a little rougher, so it shows above
 * the torn edge as a thin uneven line, and it casts the plane's shadow. A
 * fading plane's rim fades ahead of its face, so the face never shows it
 * through. The camp in `look` tears its sand and its dunes the same way.
 */
export const plane = (
  ctx: CanvasRenderingContext2D,
  pts: ReadonlyArray<Pt>,
  p: Torn,
  hand: Hand,
  alpha = 1,
) => {
  ctx.save();
  ctx.translate(0, -TEAR.rim);
  cutout(
    ctx,
    pts,
    {
      color: p.rim,
      rim: 0,
      torn: TEAR.torn * TEAR.rougher,
      shadow: TEAR.shadow,
      alpha: alpha * alpha,
      boil: 'none',
    },
    hand,
  );
  ctx.restore();
  cutout(
    ctx,
    pts,
    { color: p.color, rim: 0, torn: TEAR.torn, shadow: 0, alpha, boil: 'none' },
    hand,
  );
};

/** How far a dark band sinks as the land rises in its place, Board pixels. */
const SINK = 140;

/** The dark's band `i` (0 the farthest), `sunk` of the way down and gone (`itself`). */
export const darkBand = (ctx: CanvasRenderingContext2D, i: number, hand: Hand, sunk: number) => {
  const pts = BANDS[i];
  const p = DARK.bands[i];
  if (pts === undefined || p === undefined || sunk >= 1) return;
  ctx.save();
  ctx.translate(0, SINK * sunk);
  plane(ctx, pts, p, hand, 1 - sunk);
  ctx.restore();
};

/** The dark's front band, which holds the foreground into the day: `lit` of the way to the day's blue. */
export const frontBand = (ctx: CanvasRenderingContext2D, hand: Hand, lit: number) => {
  const pts = BANDS[2];
  const dark = DARK.bands[2];
  if (pts === undefined) return;
  plane(
    ctx,
    pts,
    { color: mix(dark.color, FRONT_LIT.color, lit), rim: mix(dark.rim, FRONT_LIT.rim, lit) },
    hand,
  );
};

/** The far hills. */
export const hills = (ctx: CanvasRenderingContext2D, hand: Hand) =>
  plane(ctx, HILLS, MADE.hills, hand);

/** The land either side of the water: the near wedge on the left, the shore rising on the right. */
export const land = (ctx: CanvasRenderingContext2D, hand: Hand) =>
  plane(ctx, LAND, MADE.land, hand);
export const shore = (ctx: CanvasRenderingContext2D, hand: Hand) =>
  plane(ctx, SHORE, MADE.shore, hand);

/** The water from the horizon down, darkening toward the front, the sun's glint along it at `lit`. */
export const water = (ctx: CanvasRenderingContext2D, hand: Hand, lit: number) => {
  plane(ctx, WATER, MADE.water, hand);
  wash(ctx, RUN.left, DEEP.from, RUN.right - RUN.left, DEEP.run, [
    [0, clearOf(DEEP.color)],
    [1, DEEP.color],
  ]);
  ctx.save();
  ctx.fillStyle = DEEP.color;
  ctx.fillRect(RUN.left, DEEP.from + DEEP.run, RUN.right - RUN.left, RUN.bottom);
  ctx.restore();
  if (lit <= 0) return;
  ctx.save();
  ctx.translate(GLINT.x, GLINT.y);
  ctx.scale(1, GLINT.ry / GLINT.rx);
  shine(ctx, 0, 0, GLINT.rx, GLINT.color, GLINT.alpha * lit);
  ctx.restore();
};

// ─── the sky ─────────────────────────────────────────────────────────────────

/**
 * The sun as `spoke.light` sets it: its middle, its disc, its six rays (where
 * each starts and where its tip reaches, its half-width at each end), the
 * turn of its first ray, straight up and a little left. The dawn floods out
 * from it.
 */
export const SUN = {
  at: [1190, 298],
  r: 70,
  rays: 6,
  from: 100,
  to: 196,
  half: [15, 30],
  turn: -1.66,
} as const;

/** A sky's colours as `spoke.light` paints it, each at its height on the panel. */
type Stops = ReadonlyArray<readonly [number, Hex]>;

/** The dawn the sky floods to first: violet overhead, rose, gold low down. */
const DAWN: Stops = [
  [0, '#3d3a7e'],
  [200, '#7d5b8f'],
  [380, '#d8938a'],
  [500, '#f2b98c'],
  [600, '#f8d79c'],
];

/** The day it settles to (`spoke.light`): deep blue-violet overhead, teal, a band of rose, peach and gold at the horizon. */
const DAY: Stops = [
  [0, '#3c3c84'],
  [150, '#3e6c92'],
  [260, '#4b8496'],
  [340, '#8f8e9e'],
  [410, '#d59d8d'],
  [480, '#edb98c'],
  [560, '#f6d89f'],
  [650, '#f8e2ae'],
];

/** `stops` as a wash's, over the sky's whole run, top to bottom. */
const over = (stops: Stops): Stops =>
  stops.map(([y, c]): readonly [number, Hex] => [(y - RUN.top) / (RUN.bottom - RUN.top), c]);

const DAWN_WASH = over(DAWN);
const DAY_WASH = over(DAY);

/** `draw` at `alpha` of the context's own; nothing at none. */
const layer = (ctx: CanvasRenderingContext2D, alpha: number, draw: () => void) => {
  if (alpha <= 0) return;
  ctx.save();
  ctx.globalAlpha *= Math.min(1, alpha);
  draw();
  ctx.restore();
};

/**
 * How far the dark is drawn back from the sun as the sky floods, Board
 * pixels: past the farthest sky the frame shows, its soft edge and all; and
 * how soft that edge is.
 */
const FLOOD = { reach: 1700, soft: 360 } as const;

/** How far the flood's edge stands from the sun at `flood` (0..1): the middle of its soft edge. */
const floodEdge = (flood: number) => FLOOD.reach * flood - FLOOD.soft / 2;

/** The dark's indigo over the whole sky, drawn back from the sun `flood` of the way, its edge soft. */
const night = (ctx: CanvasRenderingContext2D, flood: number) => {
  if (flood >= 1) return;
  const [x, y] = SUN.at;
  const r = FLOOD.reach * flood;
  ctx.save();
  if (flood <= 0) ctx.fillStyle = DARK.sky;
  else {
    const g = ctx.createRadialGradient(x, y, Math.max(0, r - FLOOD.soft), x, y, r);
    g.addColorStop(0, clearOf(DARK.sky));
    g.addColorStop(1, DARK.sky);
    ctx.fillStyle = g;
  }
  ctx.fillRect(RUN.left, RUN.top, RUN.right - RUN.left, RUN.bottom - RUN.top);
  ctx.restore();
};

/**
 * The sky: the dark's one indigo, the dawn flooding out from the sun into it
 * `flood` of the way (the dark drawn back from it, so the two never mix but
 * at its soft edge), and the day over the dawn `day` of the way.
 */
export const sky = (ctx: CanvasRenderingContext2D, flood: number, day: number) => {
  const w = RUN.right - RUN.left;
  const h = RUN.bottom - RUN.top;
  if (flood > 0) {
    wash(ctx, RUN.left, RUN.top, w, h, DAWN_WASH);
    layer(ctx, day, () => wash(ctx, RUN.left, RUN.top, w, h, DAY_WASH));
  }
  night(ctx, flood);
};

// ─── the word of light and the sun ───────────────────────────────────────────

/** The sun's papers: its disc, the light in its middle, its rays. */
const SUN_PAPER = { disc: '#f6d15a', core: '#fde68f', ray: '#f7d660' } as const;

/** The warm air round the sun, and its own light. */
const SUN_AIR = { color: '#ffe2a4', r: 620, alpha: 0.75 } as const;
const SUN_LIGHT = { r: 300, alpha: 0.5 } as const;

/** The ring of light that goes out from it as it bursts, at the flood's edge: how thick at first, how bright. */
const RING = { width: 30, alpha: 0.7 } as const;

/** One of the sun's rays about (`x`, `y`), at `s` of its size: a strip widening along `a` from its foot out to its tip. */
const ray = (x: number, y: number, a: number, s: number): Pt[] => {
  const c = Math.cos(a);
  const n = Math.sin(a);
  const from = SUN.from * s;
  const to = SUN.to * s;
  const h0 = SUN.half[0] * s;
  const h1 = SUN.half[1] * s;
  return [
    [x + c * from - n * h0, y + n * from + c * h0],
    [x + c * to - n * h1, y + n * to + c * h1],
    [x + c * to + n * h1, y + n * to - c * h1],
    [x + c * from + n * h0, y + n * from - c * h0],
  ];
};

/** The sun's papers as cut: clean, flat, no rim, lying on the sky. */
const sunCut = (ctx: CanvasRenderingContext2D, pts: ReadonlyArray<Pt>, color: Hex, hand: Hand) =>
  cutout(ctx, pts, { color, rim: 0, torn: 1.5, shadow: 0, boil: 'none' }, hand);

/**
 * The sun, `burst` of the way out of the word (past 1 as it overshoots),
 * bursting out from its middle as a whole: its light, the warm air round it
 * `air` of the way in (the day's, as the sky floods: over the dark it would
 * only grey it), its rays, its disc.
 */
export const sun = (ctx: CanvasRenderingContext2D, burst: number, air: number, hand: Hand) => {
  if (burst <= 0) return;
  const [x, y] = SUN.at;
  const k = clamp(burst);
  glow(ctx, x, y, SUN_AIR.r, SUN_AIR.color, SUN_AIR.alpha * k * clamp(air));
  shine(ctx, x, y, SUN_LIGHT.r, GOLD_GLOW, SUN_LIGHT.alpha * k);
  for (let i = 0; i < SUN.rays; i++)
    sunCut(
      ctx,
      ray(x, y, SUN.turn + (i * 2 * Math.PI) / SUN.rays, burst),
      SUN_PAPER.ray,
      sub(hand, i),
    );
  const r = SUN.r * burst;
  sunCut(ctx, ellipseShape(x, y, r, r, 48), SUN_PAPER.disc, hand);
  glow(ctx, x - 0.2 * r, y - 0.2 * r, 0.7 * r, SUN_PAPER.core, 0.8 * k);
};

/** The ring of light going out from the sun as it bursts, at the edge of the flood `flood` of the way out, fading as it goes. */
export const sunRing = (ctx: CanvasRenderingContext2D, flood: number) => {
  if (flood <= 0 || flood >= 1) return;
  const [x, y] = SUN.at;
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  ctx.globalAlpha *= RING.alpha * (1 - flood);
  ctx.strokeStyle = GOLD_GLOW;
  ctx.lineWidth = RING.width * (1 - flood) + 2;
  ctx.beginPath();
  ctx.arc(x, y, Math.max(SUN.r, floodEdge(flood)), 0, 2 * Math.PI);
  unprobed(ctx, () => ctx.stroke());
  ctx.restore();
};

/** The arc the word of light flies (`spoke.light`): in from the dark's left edge, high over the land, down into the sun's left side. */
const ARC = { from: [70, 415], via: [770, 100], to: [1124, 278] } as const;

/** The point `t` (0..1) along the arc. */
const along = (t: number): Pt => {
  const u = 1 - t;
  return [
    u * u * ARC.from[0] + 2 * u * t * ARC.via[0] + t * t * ARC.to[0],
    u * u * ARC.from[1] + 2 * u * t * ARC.via[1] + t * t * ARC.to[1],
  ];
};

/** The arc's heading at `t`, radians. */
const heading = (t: number): number => {
  const dx = 2 * (1 - t) * (ARC.via[0] - ARC.from[0]) + 2 * t * (ARC.to[0] - ARC.via[0]);
  const dy = 2 * (1 - t) * (ARC.via[1] - ARC.from[1]) + 2 * t * (ARC.to[1] - ARC.via[1]);
  return Math.atan2(dy, dx);
};

/**
 * The ribbon the word leaves (`spoke.light`): its width at its tail and at
 * its head, Board pixels; its gold paper and the light along its upper edge;
 * and its glow, how far it spreads, frame pixels, and its light.
 */
const RIBBON = {
  tail: 12,
  head: 44,
  color: '#ecc458',
  light: '#f8de8a',
  glow: 30,
  halo: 'rgba(255, 214, 110, 0.9)',
} as const;
/** How many points the ribbon is cut with along what is drawn of it. */
const RIBBON_POINTS = 40;

/**
 * One edge of the ribbon from `tail` to `head` along the arc: `share` of its
 * half-width off the middle (1 its lower edge, -1 its upper).
 */
const edge = (tail: number, head: number, share: number): Pt[] =>
  Array.from({ length: RIBBON_POINTS + 1 }, (_, i): Pt => {
    const t = lerp(tail, head, i / RIBBON_POINTS);
    const [x, y] = along(t);
    const a = heading(t);
    const off = (share * lerp(RIBBON.tail, RIBBON.head, t)) / 2;
    return [x - Math.sin(a) * off, y + Math.cos(a) * off];
  });

/** The strip of the ribbon between two of its edges, as one outline. */
const strip = (a: ReadonlyArray<Pt>, b: ReadonlyArray<Pt>): Pt[] => [...a, ...[...b].reverse()];

/**
 * The word's ribbon from `tail` to `head` along the arc (each 0..1), at
 * `alpha`: its glow soft round it, then a strip of gold paper widening
 * toward the sun, the light along its upper edge. No ink: it is light.
 */
export const wordOfLight = (
  ctx: CanvasRenderingContext2D,
  tail: number,
  head: number,
  alpha: number,
  hand: Hand,
) => {
  if (head <= tail || alpha <= 0) return;
  const upper = edge(tail, head, -1);
  const ribbon = strip(upper, edge(tail, head, 1));
  ctx.save();
  ctx.globalAlpha *= Math.min(1, alpha);
  ctx.save();
  ctx.shadowColor = RIBBON.halo;
  ctx.shadowBlur = RIBBON.glow;
  ctx.fillStyle = RIBBON.color;
  ctx.beginPath();
  ribbon.forEach(([x, y], i) => (i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y)));
  ctx.closePath();
  ctx.fill();
  ctx.restore();
  cutout(ctx, ribbon, { color: RIBBON.color, rim: 0, torn: 1, shadow: 0, boil: 'none' }, hand);
  cutout(
    ctx,
    strip(upper, edge(tail, head, -0.35)),
    { color: RIBBON.light, rim: 0, torn: 0, shadow: 0, grain: 0, boil: 'none' },
    sub(hand, 1),
  );
  ctx.restore();
};

/** The word's light at `t` along the arc, at `amount`: a bright spark, white at its heart. */
export const spark = (ctx: CanvasRenderingContext2D, t: number, amount: number) => {
  if (amount <= 0) return;
  const [x, y] = along(t);
  shine(ctx, x, y, 110, GOLD_GLOW, amount);
  shine(ctx, x, y, 34, '#fff8e0', amount);
};

// ─── the stars ───────────────────────────────────────────────────────────────

/** The stars called out over the new sky, in the order they come: each one's middle and its size, none in the sun's light. */
export const STARS: ReadonlyArray<readonly [number, number, number]> = [
  [470, 125, 17],
  [150, 178, 15],
  [770, 112, 14],
  [335, 270, 11],
  [640, 208, 12],
  [1440, 142, 15],
  [905, 168, 10],
  [1452, 382, 11],
];

/** A star's gold paper, creased once, and how deep its points cut in. */
const STAR_PAPER: Paper = { color: '#f5d164', shade: '#dcae45' };
const STAR_WAIST = 0.45;
/** Its glint round it: its reach against its size, its light, how far it twinkles. */
const STAR_GLINT = { reach: 3.2, alpha: 0.45, twinkle: 0.25 } as const;

/** A five-pointed star of `r` about (`x`, `y`), its point up. */
const starShape = (x: number, y: number, r: number): Pt[] =>
  Array.from({ length: 10 }, (_, i): Pt => {
    const a = -Math.PI / 2 + (i * Math.PI) / 5;
    const k = i % 2 === 0 ? r : r * STAR_WAIST;
    return [x + k * Math.cos(a), y + k * Math.sin(a)];
  });

/** A star `k` of the way out (past 1 as it overshoots), its glint twinkling at `twinkle` (-1..1): gold paper, no ink. */
export const star = (
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  r: number,
  k: number,
  twinkle: number,
) => {
  if (k <= 0) return;
  const shown = clamp(k);
  shine(
    ctx,
    x,
    y,
    r * STAR_GLINT.reach,
    GOLD_GLOW,
    STAR_GLINT.alpha * shown * (1 + STAR_GLINT.twinkle * twinkle),
  );
  cut(ctx, starShape(x, y, r * k), STAR_PAPER, { line: 0, alpha: shown });
};

// ─── the seal's old outline ──────────────────────────────────────────────────

/** The seal's wax round as court-cast presses it (`seal`, which keeps it to itself): 23 units, its edge bumped six times, traced from its top. */
const SEAL_ROUND: ReadonlyArray<Pt> = Array.from({ length: 49 }, (_, i): Pt => {
  const a = -Math.PI / 2 + (i / 48) * 2 * Math.PI;
  const r = 23 + 1.4 * Math.sin(a * 6 + 0.7);
  return [r * Math.cos(a), r * Math.sin(a)];
});
const SEAL_ROUND_LENGTH = length(SEAL_ROUND);

/** Its ribbon's two tails, forked at their ends, hanging under the wax, as court-cast cuts them at its 0.85. */
const SEAL_TAILS: ReadonlyArray<ReadonlyArray<Pt>> = [-1, 1].map((side) =>
  (
    [
      [4, 10],
      [18, 48],
      [10, 42],
      [4, 50],
      [-6, 14],
      [4, 10],
    ] as const
  ).map(([x, y]): Pt => [side * x * 0.85, y * 0.85]),
);

/** How far round the seal its tails may reach, its units: past their forks. */
const SEAL_CLEAR = 80;

/** `pts` as the current path, open. */
const path = (ctx: CanvasRenderingContext2D, pts: ReadonlyArray<Pt>) => {
  ctx.beginPath();
  pts.forEach(([x, y], i) => (i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y)));
};

/**
 * The seal's outline traced round a thing at (`x`, `y`), `scale` times the
 * seal's size, at `alpha`: its round `round` of the way round from its top,
 * then its tails `tails` of the way along, outside the round only (the wax
 * hid their tops), in the cast's ink.
 */
export const sealTrace = (
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  scale: number,
  round: number,
  tails: number,
  alpha: number,
) => {
  if (alpha <= 0 || round <= 0) return;
  ctx.save();
  ctx.globalAlpha *= Math.min(1, alpha);
  ctx.translate(x, y);
  ctx.scale(scale, scale);
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  ctx.lineWidth = ICON_LINE / scale;
  ctx.strokeStyle = C.outline;
  path(ctx, trim(SEAL_ROUND, SEAL_ROUND_LENGTH * clamp(round)));
  unprobed(ctx, () => ctx.stroke());
  if (tails > 0) {
    path(ctx, SEAL_ROUND);
    ctx.rect(-SEAL_CLEAR, -SEAL_CLEAR, 2 * SEAL_CLEAR, 2 * SEAL_CLEAR);
    ctx.clip('evenodd');
    for (const tail of SEAL_TAILS) {
      path(ctx, trim(tail, length(tail) * clamp(tails)));
      unprobed(ctx, () => ctx.stroke());
    }
  }
  ctx.restore();
};

// ─── the three icons ─────────────────────────────────────────────────────────

/**
 * The row the word brings, as `spoke.brings` lays it out beside him (his
 * feet on the page where word's `LAST_FRAME` stands him): each icon's foot
 * on the page, left to right.
 */
export const ROW = {
  faith: [798, 800],
  cloth: [1106, 800],
  blade: [1369, 800],
} as const satisfies Record<string, Pt>;

/** Each icon at its own size, from its foot: how far across its middle stands, how high, how tall and how wide it is. */
export const ICON_BOX = {
  faith: { dx: 0, up: 99, tall: 198, wide: 198 },
  cloth: { dx: 2, up: 91, tall: 182, wide: 276 },
  blade: { dx: 38, up: 145, tall: 290, wide: 120 },
} as const;

/** The open hand of faith: the lead's own hand circle, in his lilac paper (`PAPERS.lead`), drawn as big as the row's other icons. */
const HAND_R = ICON_BOX.faith.up;
const HAND_PAPER: Paper = { color: PAPERS.lead.color, shade: PAPERS.lead.shade };

/** The hand circle standing on its foot at (`x`, `y`), `scale` times its size, creased once at the light's angle. */
export const handCircle = (ctx: CanvasRenderingContext2D, x: number, y: number, scale: number) => {
  const r = HAND_R * scale;
  cut(ctx, ellipseShape(x, y - r, r, r, 72), HAND_PAPER, { line: ICON_LINE });
};

/**
 * The gold seed lying on the hand's top (`spoke.brings`), from the hand's
 * foot at its size: where, how tall, its tilt, its light (low: its light
 * lies over the hand's ink, which must stay dark).
 */
export const ON_HAND = { dx: 8, dy: -201, size: 72, rot: 0.95, glow: 0.3 } as const;

/** The seed on the hand standing at (`x`, `y`), `scale` times its size: its pose written into `out`, shut, lit, lined as the cast. */
export const seedOnHand = (x: number, y: number, scale: number, out: OpenSeedPose) => {
  out.x = x + ON_HAND.dx * scale;
  out.y = y + ON_HAND.dy * scale;
  out.rot = ON_HAND.rot;
  out.size = ON_HAND.size * scale;
  out.open = 0;
  out.grown = 1;
  out.glow = ON_HAND.glow;
  out.line = ICON_LINE;
  out.shown = 1;
  return out;
};

/** Faith standing at (`x`, `y`), `scale` times its size: the hand circle with the gold seed on it (`out` the seed's scratch pose). */
export const faithIcon = (
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  scale: number,
  out: OpenSeedPose,
) => {
  handCircle(ctx, x, y, scale);
  openSeed(ctx, seedOnHand(x, y, scale, out));
};

/** The white cloth, folded like a tent (`spoke.brings`), from its foot at its own size: the sheet under it, the far leaf hanging from the fold, the near leaf. */
const CLOTH = {
  under: [
    [-112, -38],
    [44, -23],
    [46, -9],
    [-106, -10],
  ],
  far: [
    [-72, -182],
    [93, -182],
    [140, -57],
    [51, 0],
  ],
  near: [
    [-72, -182],
    [93, -182],
    [51, 0],
    [-136, -57],
  ],
} as const satisfies Record<string, ReadonlyArray<Pt>>;

/** Its paper: the white tunic the lead is given (`PAPERS.robe`), its far side the robe's lilac; the far leaf, the inside of the fold, all in that lilac. */
const CLOTH_PAPER: Paper = {
  color: PAPERS.robe.color,
  shade: PAPERS.robe.shade ?? PAPERS.robe.color,
};
const CLOTH_FAR: Paper = { color: CLOTH_PAPER.shade, shade: CLOTH_PAPER.shade };

/** `pts` from a foot at (`x`, `y`), `scale` times their size. */
const placed = (pts: ReadonlyArray<Pt>, x: number, y: number, scale: number): Pt[] =>
  pts.map(([px, py]): Pt => [x + px * scale, y + py * scale]);

/** Forgiveness standing at (`x`, `y`), `scale` times its size: the white cloth, folded. */
export const clothIcon = (ctx: CanvasRenderingContext2D, x: number, y: number, scale: number) => {
  cut(ctx, placed(CLOTH.under, x, y, scale), CLOTH_PAPER, { line: ICON_LINE, flat: true });
  cut(ctx, placed(CLOTH.far, x, y, scale), CLOTH_FAR, { line: ICON_LINE, flat: true });
  cut(ctx, placed(CLOTH.near, x, y, scale), CLOTH_PAPER, { line: ICON_LINE });
};

/**
 * The green blade (`spoke.brings`), one tall leaf from its foot at its own
 * size: its near edge bowed out, its far edge, and the rib down which its
 * far half darkens, each from its foot to its tip.
 */
const BLADE = {
  near: [
    [-12, 0],
    [-28, -70],
    [-32, -140],
    [-14, -205],
    [30, -258],
    [89, -290],
  ],
  far: [
    [12, 0],
    [18, -70],
    [30, -140],
    [46, -205],
    [66, -252],
    [89, -290],
  ],
  rib: [
    [0, 0],
    [-6, -70],
    [-2, -140],
    [16, -205],
    [50, -256],
    [89, -290],
  ],
} as const satisfies Record<string, ReadonlyArray<Pt>>;

/** Its paper: the blade folded in the opened seed (`props.ts` cuts that leaf from this green), grown. */
const BLADE_PAPER: Paper = paper('#86a85a', 0.6);

/** `pts` filled flat in `color`, no ink. */
const flat = (ctx: CanvasRenderingContext2D, pts: ReadonlyArray<Pt>, color: Hex) =>
  cut(ctx, pts, { color, shade: color }, { line: 0, flat: true });

/** Power standing at (`x`, `y`), `scale` times its size: the green blade, its near half lit, its far half its shade, one line round it. */
export const bladeIcon = (ctx: CanvasRenderingContext2D, x: number, y: number, scale: number) => {
  const near = placed(spline(BLADE.near, 8), x, y, scale);
  const far = placed(spline(BLADE.far, 8), x, y, scale);
  const rib = placed(spline(BLADE.rib, 8), x, y, scale);
  flat(ctx, [...near, ...[...rib].reverse()], BLADE_PAPER.color);
  flat(ctx, [...rib, ...[...far].reverse()], BLADE_PAPER.shade);
  ctx.save();
  ctx.lineJoin = 'round';
  ctx.lineWidth = ICON_LINE;
  ctx.strokeStyle = C.outline;
  path(ctx, [...near, ...[...far].reverse()]);
  ctx.closePath();
  unprobed(ctx, () => ctx.stroke());
  ctx.restore();
};
