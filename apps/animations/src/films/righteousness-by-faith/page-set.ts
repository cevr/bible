// The parchment page of `word` (the Board's `word.all`, `word.short` and
// `word.fig`), drawn as the court set is drawn (`court-set.ts`): in the
// Board's pixels at the lead's size, each prop one paper creased once at the
// light's angle and lined in the film's ink, its far side a hue of its own
// (CRAFT rule 12). The warm peach page and the sun's shafts across it from
// the upper left; the lilac shadows things cast on it, down and to the right,
// away from the sun; the gold line, a strip of gold paper, the one thing on
// the page that glows; the two stone tablets of the law, round at the top,
// five lines on each, cut into the stone or lit gold; the green fig leaf,
// lobed, cut from one paper, its veins its own shade. Pure: the same pose
// draws the same page.

import { type Hex, clearOf, mix, ramp, rounded, unprobed } from '@bible/film/canvas';
import { clamp } from '@bible/film/core';
import { type Pt, keyLight, shading } from '@bible/film/style';
import { contact, cut } from './court-set.ts';
import { C } from './kit.ts';

/** A paper as the page cuts it: its colour and its crease's far side. */
export interface Paper {
  readonly color: Hex;
  readonly shade: Hex;
}

/** `base`'s ramp under the key light, its crease falling `share` of the way to the ramp's shade. */
export const paper = (base: Hex, share: number): Paper => {
  const r = ramp(base, keyLight, shading);
  return { color: r.base, shade: mix(r.base, r.shade, share) };
};

/** `pts` as the current path, closed. */
const trace = (ctx: CanvasRenderingContext2D, pts: ReadonlyArray<Pt>) => {
  ctx.beginPath();
  pts.forEach(([x, y], i) => (i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y)));
  ctx.closePath();
};

// ─── the page ────────────────────────────────────────────────────────────────

/** The page's paper: the film's cream warmed toward its peach, as the kept panels lay it. */
export const PAGE: Hex = mix(C.cream, C.peachTop, 0.3);

/** One shaft of the sun: its angle below the level (radians) and its half-width. */
interface Shaft {
  readonly angle: number;
  readonly half: number;
}

/** The sun's shafts: where they start (a share of the frame, off its corner), how far they reach (a share of its width), their light, and each shaft. */
interface Shafts {
  readonly from: Pt;
  readonly reach: number;
  readonly color: Hex;
  readonly alpha: number;
  readonly each: ReadonlyArray<Shaft>;
}

/** The sun's shafts across the page, as the kept panels fan them from the upper left. */
const SHAFTS: Shafts = {
  from: [-0.08, -0.12],
  reach: 1.1,
  color: '#fff7de',
  alpha: 0.5,
  each: [
    { angle: 0.58, half: 0.03 },
    { angle: 0.74, half: 0.05 },
    { angle: 0.9, half: 0.028 },
    { angle: 1.05, half: 0.042 },
  ],
};

/** One of the three layers a shaft is laid in, so its edges are soft: its width against the shaft's, and the share of its light. */
interface Layer {
  readonly wide: number;
  readonly share: number;
}
const SOFT: ReadonlyArray<Layer> = [
  { wide: 1.6, share: 0.25 },
  { wide: 1, share: 0.35 },
  { wide: 0.5, share: 0.4 },
];

/** The sun's shafts over a page `w` by `h`, in its pixels: light fading as it reaches across. */
export const shafts = (ctx: CanvasRenderingContext2D, w: number, h: number) => {
  const ox = SHAFTS.from[0] * w;
  const oy = SHAFTS.from[1] * h;
  const r = SHAFTS.reach * w;
  ctx.save();
  const g = ctx.createRadialGradient(ox, oy, 0, ox, oy, r);
  g.addColorStop(0, SHAFTS.color);
  g.addColorStop(1, clearOf(SHAFTS.color));
  ctx.fillStyle = g;
  for (const s of SHAFTS.each)
    for (const { wide, share } of SOFT) {
      const a0 = s.angle - s.half * wide;
      const a1 = s.angle + s.half * wide;
      ctx.save();
      ctx.globalAlpha *= SHAFTS.alpha * share;
      ctx.beginPath();
      ctx.moveTo(ox, oy);
      ctx.lineTo(ox + r * Math.cos(a0), oy + r * Math.sin(a0));
      ctx.lineTo(ox + r * Math.cos(a1), oy + r * Math.sin(a1));
      ctx.closePath();
      ctx.fill();
      ctx.restore();
    }
  ctx.restore();
};

/** The violet a cast shadow lays on the page: the court floor's (`court-set.ts`), so both rooms shade alike. */
const SHADOW: Hex = '#b7a3dc';

/** How far an upright thing throws its shadow, across and down, as shares of its height. */
interface Throw {
  readonly x: number;
  readonly y: number;
}
/** Down and to the right, away from the sun, long as the kept panels lay it. */
const THROW: Throw = { x: 0.7, y: 0.17 };

/**
 * The shadow an upright thing standing on the page along `x0..x1` at `y`,
 * `h` tall, casts: a band thrown down and to the right, fading as it goes,
 * at `alpha`.
 */
export const cast = (
  ctx: CanvasRenderingContext2D,
  x0: number,
  x1: number,
  y: number,
  h: number,
  alpha: number,
) => {
  if (alpha <= 0) return;
  const dx = THROW.x * h;
  const dy = THROW.y * h;
  ctx.save();
  ctx.globalAlpha *= alpha;
  const g = ctx.createLinearGradient(x0, y, x0 + dx, y + dy);
  g.addColorStop(0, SHADOW);
  g.addColorStop(1, clearOf(SHADOW));
  ctx.fillStyle = g;
  trace(ctx, [
    [x0, y],
    [x1, y],
    [x1 + dx, y + dy],
    [x0 + dx, y + dy],
  ]);
  ctx.fill();
  ctx.restore();
};

// ─── the gold line ───────────────────────────────────────────────────────────

/** The gold's glow: what it lays round a lit thing. */
export const GOLD_GLOW: Hex = '#ffd35c';

/** The gold's glow, laid round a lit stroke in widening, fading strokes so it has no edge: each one's width against the stroke's, and its light. */
const GLOW_LAYERS: ReadonlyArray<Layer> = [
  { wide: 3.4, share: 0.06 },
  { wide: 2.4, share: 0.08 },
  { wide: 1.7, share: 0.1 },
];

/** `pts` as the current path, open. */
const along = (ctx: CanvasRenderingContext2D, pts: ReadonlyArray<Pt>) => {
  ctx.beginPath();
  pts.forEach(([x, y], i) => (i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y)));
};

/**
 * The gold's glow round a stroke along `pts`, `width` thick, at `amount`
 * (over 1 it swells): light laid on what is drawn, round at its ends. Not
 * ink, so drawn `unprobed`.
 */
const halo = (
  ctx: CanvasRenderingContext2D,
  pts: ReadonlyArray<Pt>,
  width: number,
  amount: number,
) => {
  if (amount <= 0) return;
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  ctx.strokeStyle = GOLD_GLOW;
  along(ctx, pts);
  for (const { wide, share } of GLOW_LAYERS) {
    ctx.save();
    ctx.globalAlpha *= Math.min(1, share * amount);
    ctx.lineWidth = width * wide;
    unprobed(ctx, () => ctx.stroke());
    ctx.restore();
  }
  ctx.restore();
};

/**
 * The gold line along `pts`, `width` thick, at `alpha`: a strip of gold
 * paper with its glow laid soft round it. Its strokes are the prop's own,
 * under any card, so they are drawn `unprobed`.
 */
export const goldLine = (
  ctx: CanvasRenderingContext2D,
  pts: ReadonlyArray<Pt>,
  width: number,
  alpha: number,
) => {
  if (pts.length < 2 || alpha <= 0) return;
  ctx.save();
  ctx.globalAlpha *= alpha;
  halo(ctx, pts, width, 1);
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  ctx.strokeStyle = C.gold;
  ctx.lineWidth = width;
  along(ctx, pts);
  unprobed(ctx, () => ctx.stroke());
  ctx.restore();
};

// ─── the tablets ─────────────────────────────────────────────────────────────

/** Where a tablet's five lines lie: the first's and the last's height down it, and each line's length and thickness. */
interface Lines {
  /** Shares of the tablet's height, from its top. */
  readonly first: number;
  readonly last: number;
  /** A share of the tablet's width. */
  readonly length: number;
  /** Board pixels at the tablets' own size. */
  readonly thick: number;
}

/** A tablet's measures: its width and its height (its top a half circle), the gap to the next, its lines. */
interface TabletMeasure {
  readonly w: number;
  readonly h: number;
  readonly gap: number;
  readonly lines: Lines;
}

/** The tablets as word.all stands them beside the lead, Board pixels at his size. */
export const TABLET: TabletMeasure = {
  w: 162,
  h: 282,
  gap: 8,
  lines: { first: 0.254, last: 0.821, length: 0.52, thick: 8 },
};

/** How many lines each tablet carries. */
const LINES_EACH = 5;

/** The tablets' stone, as the kept panels paint it: a warm taupe, its shade turned to a soft lilac. */
const STONE = paper('#ad9584', 0.6);

/** A line lit: its gold, its glow's light at rest, and how much more it lays at the full of a swell. */
interface LitLine {
  readonly face: Hex;
  readonly rest: number;
  readonly swell: number;
}
/** The Board's lit gold, its glow held close round it as the kept panels hold it. */
const LIT: LitLine = { face: '#ffe27a', rest: 1.3, swell: 1.2 };

/** How many points the arch of a tablet's top is cut with. */
const ARCH = 18;

/** One tablet's outline, its bottom-left corner at (`x0`, `y0`), `scale` times its size. */
const tabletShape = (x0: number, y0: number, scale: number): Pt[] => {
  const w = TABLET.w * scale;
  const r = w / 2;
  const top = y0 - (TABLET.h * scale - r);
  const pts: Pt[] = [
    [x0, y0],
    [x0, top],
  ];
  for (let i = 1; i < ARCH; i++) {
    const a = Math.PI + (i / ARCH) * Math.PI;
    pts.push([x0 + r + r * Math.cos(a), top + r * Math.sin(a)]);
  }
  pts.push([x0 + w, top], [x0 + w, y0]);
  return pts;
};

/**
 * The point `u` (0..1) of the way round a tablet's edge, its bottom-left
 * corner at (`x0`, `y0`), `scale` times its size: from the middle of its
 * foot to the left, up its left side, over its top (`u` 0.5 its peak),
 * down its right side and along its foot back to the middle. A line laid
 * along the floor, left to right, is lifted into it by its middle without
 * crossing itself, and its ends fold down the sides and in along the foot.
 */
export const tabletEdgeAt = (x0: number, y0: number, scale: number, u: number): Pt => {
  const w = TABLET.w * scale;
  const r = w / 2;
  const side = TABLET.h * scale - r;
  const arc = Math.PI * r;
  let d = clamp(u) * (w + 2 * side + arc);
  if (d <= r) return [x0 + r - d, y0];
  d -= r;
  if (d <= side) return [x0, y0 - d];
  d -= side;
  if (d <= arc) {
    const a = Math.PI - (d / arc) * Math.PI;
    return [x0 + r + r * Math.cos(a), y0 - side - r * Math.sin(a)];
  }
  d -= arc;
  if (d <= side) return [x0 + w, y0 - side + d];
  d -= side;
  return [x0 + w - d, y0];
};

/** Where the tablets stand and how they show: written by a scene every frame. */
export interface TabletsPose {
  /** The left one's bottom-left corner, on the floor; the pair grows about it. */
  x: number;
  y: number;
  /** Their size against `TABLET`'s. */
  scale: number;
  /** How far their stone shows, 0..1: 0 none of it. */
  stone: number;
  /** How far each of the ten lines is lit gold, the left tablet's five first, each 0..1. */
  readonly lit: number[];
  /** How far the lit lines' glow swells over its rest: 0 at rest. */
  swell: number;
}

/** A fresh pose: the pair at `TABLET`'s size, no stone, no line lit. */
export const tabletsAt = (x: number, y: number): TabletsPose => ({
  x,
  y,
  scale: 1,
  stone: 0,
  lit: Array.from({ length: 2 * LINES_EACH }, () => 0),
  swell: 0,
});

/** Where tablet `i` (0 the left) of a pair at `p` has its bottom-left corner. */
export const tabletX = (p: TabletsPose, i: number) => p.x + i * (TABLET.w + TABLET.gap) * p.scale;

/** The two tablets at `p`: their stone, creased and lined in the ink, and their lines, cut in or lit. */
export const tablets = (ctx: CanvasRenderingContext2D, p: TabletsPose) => {
  if (p.stone <= 0) return;
  for (let i = 0; i < 2; i++) {
    const x0 = tabletX(p, i);
    cut(ctx, tabletShape(x0, p.y, p.scale), STONE, { alpha: p.stone });
    tabletLines(ctx, x0, p, i * LINES_EACH);
  }
};

/**
 * The tablets at `p` standing on the page: the shadow they cast and the
 * shadow at each one's foot, both as far as their stone shows, then the
 * tablets.
 */
export const standingTablets = (ctx: CanvasRenderingContext2D, p: TabletsPose) => {
  const s = p.scale;
  cast(ctx, p.x, p.x + (2 * TABLET.w + TABLET.gap) * s, p.y, TABLET.h * s, 0.6 * p.stone);
  ctx.save();
  ctx.globalAlpha *= p.stone;
  for (let i = 0; i < 2; i++)
    contact(ctx, tabletX(p, i) + (TABLET.w * s) / 2, p.y + 2, 0.62 * TABLET.w * s);
  ctx.restore();
  tablets(ctx, p);
};

/** The five lines of the tablet whose bottom-left corner is at `x0`, the `from`th of the ten its first. */
const tabletLines = (ctx: CanvasRenderingContext2D, x0: number, p: TabletsPose, from: number) => {
  const { lines } = TABLET;
  const w = TABLET.w * p.scale;
  const h = TABLET.h * p.scale;
  const cx = x0 + w / 2;
  const len = lines.length * w;
  const thick = lines.thick * p.scale;
  for (let k = 0; k < LINES_EACH; k++) {
    const cy = p.y - h + h * (lines.first + ((lines.last - lines.first) * k) / (LINES_EACH - 1));
    const bar = rounded(cx, cy, len, thick, thick / 2);
    // Cut into the stone: its shade.
    ctx.save();
    ctx.globalAlpha *= p.stone;
    ctx.fillStyle = STONE.shade;
    trace(ctx, bar);
    ctx.fill();
    ctx.restore();
    const lit = p.lit[from + k] ?? 0;
    if (lit <= 0) continue;
    // Lit: its gold over the cut, and the glow close round it.
    ctx.save();
    ctx.globalAlpha *= p.stone * Math.min(1, lit);
    ctx.fillStyle = LIT.face;
    trace(ctx, bar);
    ctx.fill();
    ctx.restore();
    const reach = len / 2 - thick / 2;
    halo(
      ctx,
      [
        [cx - reach, cy],
        [cx + reach, cy],
      ],
      thick,
      p.stone * lit * (LIT.rest + LIT.swell * p.swell),
    );
  }
};

// ─── the fig leaf ────────────────────────────────────────────────────────────

/** One lobe of a fig leaf: its angle off the leaf's tip (radians), its reach (a share of the leaf's) and its width. */
interface Lobe {
  readonly at: number;
  readonly reach: number;
  readonly width: number;
}

/** A fig leaf's five lobes, as word.fig cuts them: broad and round at the tip, the top one longest, the two beside it, the two low ones short. */
const LOBES: ReadonlyArray<Lobe> = [
  { at: 0, reach: 1, width: 0.56 },
  { at: -1.12, reach: 0.9, width: 0.5 },
  { at: 1.12, reach: 0.9, width: 0.5 },
  { at: -2.15, reach: 0.64, width: 0.42 },
  { at: 2.15, reach: 0.64, width: 0.42 },
];

/** The leaf's size: its longest lobe's reach from where its veins meet, Board pixels at the lead's size (word.fig). */
const LEAF_R = 35;
/** How deep the cuts between its lobes run: the outline's least reach, a share of `LEAF_R`. */
const SINUS = 0.4;
/** A stalk's length and width. */
interface Stalk {
  readonly length: number;
  readonly width: number;
}
/** The leaf's stalk, down from where its veins meet. */
const STALK: Stalk = { length: 16, width: 4 };

/** The leaf's outline about where its veins meet, its tip up. */
const LEAF_SHAPE: ReadonlyArray<Pt> = Array.from({ length: 84 }, (_, i): Pt => {
  const a = -Math.PI + (2 * Math.PI * i) / 84;
  let lobe = 0;
  for (const l of LOBES) lobe = Math.max(lobe, l.reach * Math.exp(-(((a - l.at) / l.width) ** 2)));
  const reach = LEAF_R * (SINUS + (1 - SINUS) * lobe);
  return [reach * Math.sin(a), -reach * Math.cos(a)];
});

/** Its veins: from where they meet out toward each lobe's tip. */
const VEINS: ReadonlyArray<Pt> = LOBES.map((l): Pt => [
  0.72 * LEAF_R * l.reach * Math.sin(l.at),
  -0.72 * LEAF_R * l.reach * Math.cos(l.at),
]);

/** The green leaf, the Board's olive, its shade toward violet; the dry leaf it browns to, props.ts's. */
const LEAF = paper('#6f8f40', 0.6);
const DRY = paper('#cca358', 0.6);
/** A leaf's edge, green and dry: its own paper deepened, never the ink. */
interface Edges {
  readonly green: Hex;
  readonly dry: Hex;
}
const EDGE: Edges = { green: '#46632a', dry: '#8f6f36' };

/** A fig leaf's place and state, on the page. */
export interface LeafPose {
  /** Where its veins meet, and its turn (0: its tip up). */
  readonly x: number;
  readonly y: number;
  readonly rot: number;
  readonly scale: number;
  /** How far it has curled and dried, 0 green and flat to 1 rolled half shut and brown. */
  readonly curl: number;
  /** How tall it stands on the page, whatever its turn: 1 upright to 0.5 lying on the floor, seen shallow. */
  readonly lie: number;
}

/**
 * The leaf's own points placed on the page by `p`, `curl` narrowing it across
 * its vein: so it is creased at the page's light, not its own turn.
 */
const placed = (p: LeafPose, curl: number) => {
  const c = Math.cos(p.rot);
  const s = Math.sin(p.rot);
  const across = p.scale * (1 - 0.5 * curl);
  return ([x, y]: Pt): Pt => {
    const u = x * across;
    const v = y * p.scale;
    return [p.x + u * c - v * s, p.y + (u * s + v * c) * p.lie];
  };
};

/** The fig leaf at `p`: its stalk, its blade creased once, its veins in its shade, its edge a deeper green. */
export const leaf = (ctx: CanvasRenderingContext2D, p: LeafPose) => {
  const curl = clamp(p.curl);
  const paperNow: Paper =
    curl > 0
      ? { color: mix(LEAF.color, DRY.color, curl), shade: mix(LEAF.shade, DRY.shade, curl) }
      : LEAF;
  const on = placed(p, curl);
  const blade = LEAF_SHAPE.map(on);
  ctx.save();
  ctx.fillStyle = paperNow.shade;
  trace(ctx, rounded(0, STALK.length / 2, STALK.width, STALK.length, STALK.width / 2).map(on));
  ctx.fill();
  cut(ctx, blade, paperNow, { line: 0 });
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.strokeStyle = paperNow.shade;
  ctx.lineWidth = 2.4 * p.scale;
  ctx.beginPath();
  const [hx, hy] = on([0, 0]);
  for (const vein of VEINS) {
    ctx.moveTo(hx, hy);
    ctx.lineTo(...on(vein));
  }
  unprobed(ctx, () => ctx.stroke());
  ctx.strokeStyle = mix(EDGE.green, EDGE.dry, curl);
  ctx.lineWidth = 2 * p.scale;
  trace(ctx, blade);
  unprobed(ctx, () => ctx.stroke());
  ctx.restore();
};
