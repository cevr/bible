// The small props the landing hands round, drawn in the set's way (`cut`:
// one paper creased at the light's angle, lined in the ink), in the Board's
// pixels: the gold seed, the green blade up through the crack, the dry fig
// leaves, the seal's gold, the seed `seed` opens along its seam with the
// blade folded inside it (`openSeed`), and the light that marks a gift as it
// is named (`glow`). Each is drawn about its own place, so a scene puts it in
// a hand, at a crack, on the floor or in the air.

import { mix, spline, unprobed } from '@bible/film/canvas';
import { clamp, lerp } from '@bible/film/core';
import type { Pt } from '@bible/film/style';
import { cut } from './court-set.ts';
import { C } from './kit.ts';
import { GOLD_GLOW, type Paper, paper } from './page-set.ts';

/**
 * The seal's gold (`court-cast.ts` draws the seal): its wax and the wax's
 * shade, the ring pressed round its R, its ribbon, its R. The seed it turns
 * into keeps a scrap of its ribbon.
 */
export const SEAL_GOLD = {
  wax: C.gold,
  shade: '#cf8a2e',
  rim: '#b9781f',
  ribbon: '#d49a32',
  letter: '#8a5a12',
} as const;

/** The props' papers, as the kept panels paint them (`court.12`, `court.you`). */
const P = {
  seed: { color: '#ebb43e', shade: '#c98a26' },
  blade: { color: '#a1be41', shade: '#7baa28' },
  leaf: { color: '#cca358', shade: '#ba964d' },
} as const;

/** A teardrop `rx` by `ry` about the origin, its point up: the seed's outline. */
const drop = (rx: number, ry: number): Pt[] =>
  Array.from({ length: 20 }, (_, i): Pt => {
    const t = (i / 20) * 2 * Math.PI;
    // Narrow at the top (t = 0), full at the bottom.
    const w = 0.45 + 0.55 * ((1 - Math.cos(t)) / 2);
    return [rx * Math.sin(t) * w, -ry * Math.cos(t)];
  });

/** A seed's place: its centre, its turn, its size against the Board's, and how far it shows. */
export interface SeedPose {
  x: number;
  y: number;
  rot: number;
  scale: number;
  shown: number;
}

/** A seed held nowhere yet. */
export const noSeed = (): SeedPose => ({ x: 0, y: 0, rot: 0, scale: 1, shown: 0 });

/** The gold seed at its pose: its paper, its ink, a light on its near shoulder. */
export const seed = (ctx: CanvasRenderingContext2D, s: SeedPose) => {
  if (s.shown <= 0) return;
  ctx.save();
  ctx.globalAlpha *= Math.min(1, s.shown);
  ctx.translate(s.x, s.y);
  ctx.rotate(s.rot);
  ctx.scale(s.scale, s.scale);
  cut(ctx, drop(9.5, 10), P.seed, { line: 2.4 });
  ctx.fillStyle = '#fff3c4';
  ctx.beginPath();
  ctx.ellipse(-3.2, -2, 2, 3, -0.3, 0, 2 * Math.PI);
  ctx.fill();
  ctx.restore();
};

/** One leaf of the blade: from its foot at the origin to `tip`, `w` wide at its middle, bowed `bow`. */
const bladeLeaf = (tip: Pt, w: number, bow: number): Pt[] => {
  const n = 8;
  const len = Math.hypot(tip[0], tip[1]);
  const nx = -tip[1] / len;
  const ny = tip[0] / len;
  const side = (sign: number) =>
    Array.from({ length: n + 1 }, (_, i): Pt => {
      const t = i / n;
      const b = bow * Math.sin(Math.PI * t);
      const half = (sign * w * Math.sin(Math.PI * t) ** 0.8) / 2;
      return [tip[0] * t + nx * (b + half), tip[1] * t + ny * (b + half)];
    });
  return [...side(1), ...side(-1).reverse().slice(1, -1)];
};

/** The blade's three leaves at their full height, from its foot: the middle one tallest. */
const BLADE: ReadonlyArray<{ readonly tip: Pt; readonly w: number; readonly bow: number }> = [
  { tip: [-13, -24], w: 6, bow: -3 },
  { tip: [12, -22], w: 6, bow: 3 },
  { tip: [-2, -36], w: 7, bow: 2 },
];

/** The green blade up through the crack at (`x`, `y`), `grow` of its height (0 not yet up), swaying `sway` radians. */
export const blade = (
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  grow: number,
  sway = 0,
) => {
  if (grow <= 0) return;
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(sway);
  ctx.scale(Math.min(1, 0.4 + grow), grow);
  for (const leaf of BLADE) cut(ctx, bladeLeaf(leaf.tip, leaf.w, leaf.bow), P.blade, { line: 2 });
  ctx.restore();
};

/** A dry fig leaf lying on the floor at (`x`, `y`), turned `rot`: an almond with its midrib, seen shallow. */
export const figLeaf = (ctx: CanvasRenderingContext2D, x: number, y: number, rot: number) => {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(rot);
  ctx.scale(1, 0.55);
  const pts = Array.from({ length: 16 }, (_, i): Pt => {
    const t = (i / 16) * 2 * Math.PI;
    // Pointed at both ends.
    return [20 * Math.cos(t), 11 * Math.sin(t) * Math.abs(Math.sin(t)) ** 0.3];
  });
  cut(ctx, pts, P.leaf, { line: 2.4 });
  cut(
    ctx,
    [
      [-16, 0],
      [16, 0],
    ],
    P.leaf,
    { line: 1.6, flat: true },
  );
  ctx.restore();
};

/**
 * Light round a thing as it is named: `color` laid on what is drawn, from
 * full at (`x`, `y`) to nothing at `r`, at `amount`.
 */
export const glow = (
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  r: number,
  color: string,
  amount: number,
) => {
  if (amount <= 0) return;
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  ctx.globalAlpha *= Math.min(1, amount);
  const g = ctx.createRadialGradient(x, y, 0, x, y, r);
  g.addColorStop(0, color);
  g.addColorStop(1, `${color.slice(0, 7)}00`);
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(x, y, r, 0, 2 * Math.PI);
  ctx.fill();
  ctx.restore();
};

// ─── the seed opened ─────────────────────────────────────────────────────────

/** The opened seed's own units: it stands this tall about its middle, its point up. */
const SEED_TALL = 100;

/**
 * Its husk: half its width at its fullest; how deep its tip parts where its
 * two halves meet as it opens, and how far round the tip the cleft reaches
 * (radians round its outline).
 */
const HUSK = { half: 43, notch: 10, cleft: 0.26 } as const;

/**
 * Its hollow, a lens down its middle along the seam, from the cleft at its
 * tip to its foot: the lens's middle, its half-width opened full and its
 * half-height; and how far the cut face of the shell shows round it.
 */
const HOLLOW = { x: 1.5, y: 2, half: 16.5, tall: 43, face: 4 } as const;

/**
 * Its inner lines, as shares of its ink: each half's lip round the cut face,
 * and the hollow's edge inside it, finer, so the cut face reads as one ring
 * (`seed.folded`).
 */
const LINES = { lip: 0.7, hollow: 0.45 } as const;

/**
 * Its heart, in the hollow where the leaves meet the root: where its light
 * wakes behind the blade, how far that light reaches inside it, and how
 * much of it it lays there.
 */
const HEART = { x: 3, y: 8, r: 30, share: 0.9 } as const;

/** How far its light reaches round it on the page, in its units, and how much of it it lays there. */
const HALO = { r: 64, share: 0.5 } as const;

/** A leaf of the blade folded in it: from its foot to its tip, its width and its bow, in the seed's units. */
interface FoldedLeaf {
  readonly foot: Pt;
  readonly tip: Pt;
  readonly w: number;
  readonly bow: number;
}

/**
 * What is folded in the seed: its two first leaves; its root (its spine from
 * where it meets them, its width there, and its width at its round tip as a
 * share of that); and the point it swells from.
 */
interface Folded {
  readonly back: FoldedLeaf;
  readonly front: FoldedLeaf;
  readonly root: { readonly spine: ReadonlyArray<Pt>; readonly w: number; readonly tip: number };
  readonly base: Pt;
}

/**
 * The blade folded in the seed (`seed.folded`): its two first leaves, broad,
 * one behind the other, filling the upper two-thirds of the hollow, the far
 * one standing taller up it and the near one across it, both inside its
 * edge; and its root, thick and white, curled under them in an S to a round
 * tip.
 */
const EMBRYO: Folded = {
  back: { foot: [-6, 10], tip: [0, -32], w: 21, bow: 0 },
  front: { foot: [-8, 18], tip: [10, -23], w: 26, bow: 2.5 },
  root: {
    spine: [
      [5, 4],
      [10, 14],
      [5, 24],
      [-3, 30],
      [-2, 37],
      [4, 40],
    ],
    w: 11,
    tip: 0.55,
  },
  base: [0, 8],
};

/** How small the blade is, curled tight, before it swells: a share of its folded size. */
const CURLED = 0.8;

/** The seal's ribbon's scrap at the seed's foot: one short, broad tail, forked at its end, hanging down a little to the left. */
const SCRAP: ReadonlyArray<Pt> = [
  [-10, 45],
  [-13, 61],
  [-7, 57],
  [-2.5, 62.5],
  [3.5, 46],
];

/**
 * The opened seed's papers (`seed.folded`, `seed.life`): its husk, dull
 * before its light wakes and the seal's gold after; the cut face of its
 * shell, dull and lit; its hollow, dull and lit; its first leaves, the near
 * one and the far one behind it, darker; its root; the seal's ribbon; and
 * the light in its heart.
 */
const OPEN = {
  husk: paper('#c8994f', 0.6),
  gold: paper(SEAL_GOLD.wax, 0.6),
  face: paper('#d8ad69', 0.5),
  faceLit: paper('#f2c862', 0.5),
  hollow: paper('#e3c594', 0.5),
  lit: paper('#f4cf6a', 0.4),
  leaf: paper('#86a85a', 0.6),
  leafBack: paper('#6b8f45', 0.6),
  root: paper('#f3ead8', 0.5),
  ribbon: paper(SEAL_GOLD.ribbon, 0.6),
  heart: GOLD_GLOW,
} as const;

/** How many points each of its outlines is cut with. */
const ROUND = 48;

/** Paper `a` toward `b` by `k`, its colour and its crease's both. */
const toward = (a: Paper, b: Paper, k: number): Paper =>
  k <= 0 ? a : { color: mix(a.color, b.color, k), shade: mix(a.shade, b.shade, k) };

/**
 * The husk about the seed's middle, its point up: an egg narrowing to its
 * tip and full at its foot, the tip drawn down `open` of its notch where
 * the two halves part.
 */
const huskShape = (open: number): Pt[] => {
  const pts: Pt[] = [];
  for (let i = 0; i < ROUND; i++) {
    const t = (i / ROUND) * 2 * Math.PI;
    const full = 0.62 + 0.19 * (1 - Math.cos(t));
    const fromTip = Math.min(t, 2 * Math.PI - t);
    pts.push([
      HUSK.half * Math.sin(t) * full,
      -(SEED_TALL / 2) * Math.cos(t) + HUSK.notch * open * Math.exp(-((fromTip / HUSK.cleft) ** 2)),
    ]);
  }
  return pts;
};

/** A lens about (`x`, `y`), `half` wide either side and `tall` high either way: pointed at both ends, fuller below. */
const lens = (x: number, y: number, half: number, tall: number): Pt[] => {
  const side = ROUND / 2;
  const at = (i: number, sign: number): Pt => {
    const s = -Math.cos((i / side) * Math.PI);
    return [x + sign * half * (1 - s * s) ** 0.85 * (1 + 0.15 * s), y + tall * s];
  };
  const pts: Pt[] = [];
  for (let i = 0; i <= side; i++) pts.push(at(i, 1));
  for (let i = side - 1; i > 0; i--) pts.push(at(i, -1));
  return pts;
};

/** How many points a tube's round tip is cut with, between its two sides. */
const TIP_POINTS = 5;

/**
 * A tube along `spine`, `w` wide at its first point and narrowing to `tip`
 * of that at its last, where it ends round.
 */
const tube = (spine: ReadonlyArray<Pt>, w: number, tip: number): Pt[] => {
  const n = spine.length;
  const near: Pt[] = [];
  const far: Pt[] = [];
  let heading = 0;
  for (let i = 0; i < n; i++) {
    const [x, y] = spine[i] ?? [0, 0];
    const [ax, ay] = spine[Math.max(0, i - 1)] ?? [x, y];
    const [bx, by] = spine[Math.min(n - 1, i + 1)] ?? [x, y];
    const len = Math.hypot(bx - ax, by - ay) || 1;
    const half = (w / 2) * lerp(1, tip, i / (n - 1));
    const nx = (-(by - ay) / len) * half;
    const ny = ((bx - ax) / len) * half;
    near.push([x + nx, y + ny]);
    far.push([x - nx, y - ny]);
    heading = Math.atan2(by - ay, bx - ax);
  }
  // The round tip: a half circle about the last point, from the near side over the end to the far.
  const [ex, ey] = spine[n - 1] ?? [0, 0];
  const r = (w / 2) * tip;
  const round = Array.from({ length: TIP_POINTS }, (_, j): Pt => {
    const a = heading + Math.PI / 2 - ((j + 1) / (TIP_POINTS + 1)) * Math.PI;
    return [ex + r * Math.cos(a), ey + r * Math.sin(a)];
  });
  return [...near, ...round, ...far.reverse()];
};

/** `pts` as the current path, closed. */
const trace = (ctx: CanvasRenderingContext2D, pts: ReadonlyArray<Pt>) => {
  ctx.beginPath();
  pts.forEach(([x, y], i) => (i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y)));
  ctx.closePath();
};

/** A leaf folded in the seed, from its foot, in `p`, lined `line`. */
const foldedLeaf = (ctx: CanvasRenderingContext2D, l: FoldedLeaf, p: Paper, line: number) => {
  ctx.save();
  ctx.translate(l.foot[0], l.foot[1]);
  cut(ctx, bladeLeaf([l.tip[0] - l.foot[0], l.tip[1] - l.foot[1]], l.w, l.bow), p, { line });
  ctx.restore();
};

/**
 * The blade folded in the hollow, `grown` of the way from curled tight to
 * its folded size, its ink `line` whatever its size: the far leaf, the root
 * under the leaves, the near leaf over it.
 */
const embryo = (ctx: CanvasRenderingContext2D, grown: number, line: number) => {
  const g = lerp(CURLED, 1, clamp(grown));
  const [bx, by] = EMBRYO.base;
  ctx.save();
  ctx.translate(bx, by);
  ctx.scale(g, g);
  ctx.translate(-bx, -by);
  const ink = line / g;
  foldedLeaf(ctx, EMBRYO.back, OPEN.leafBack, ink);
  const { spine, w, tip } = EMBRYO.root;
  cut(ctx, tube(spline(spine, 6), w, tip), OPEN.root, { line: ink });
  foldedLeaf(ctx, EMBRYO.front, OPEN.leaf, ink);
  ctx.restore();
};

/**
 * The seam down the shut seed from its tip to its foot, in the ink, fading
 * as it parts `open`: where it parts. Its top follows the tip down into the
 * cleft, so it never stands above the husk.
 */
const seam = (ctx: CanvasRenderingContext2D, line: number, open: number) => {
  if (open >= 1) return;
  ctx.save();
  ctx.globalAlpha *= 1 - open;
  ctx.lineCap = 'round';
  ctx.lineWidth = line;
  ctx.strokeStyle = C.outline;
  ctx.beginPath();
  ctx.moveTo(0, 3 - SEED_TALL / 2 + HUSK.notch * open);
  ctx.quadraticCurveTo(4, 0, 0, SEED_TALL / 2 - 4);
  unprobed(ctx, () => ctx.stroke());
  ctx.restore();
};

/** The opened seed's place and state (a scene keeps one and rewrites it each frame). */
export interface OpenSeedPose {
  /** Its middle on the page, its turn, and how tall it stands, Board pixels. */
  x: number;
  y: number;
  rot: number;
  size: number;
  /** 0 shut, its seam a line down it; 1 parted along its seam, its hollow and what is folded in it showing. */
  open: number;
  /** How far the blade in it has swelled from curled tight to its folded size, 0..1. */
  grown: number;
  /** The warm light in its heart: 0 unlit, its gold dull; 1 awake, its gold glowing; past 1 it swells. */
  glow: number;
  /** Its ink's width, Board pixels, the same however tall it stands, so it keeps the cast's line. */
  line: number;
  shown: number;
}

/** `pts`, closed, stroked in the ink `line` wide: an edge drawn again over what was laid inside it. */
const inked = (ctx: CanvasRenderingContext2D, pts: ReadonlyArray<Pt>, line: number) => {
  ctx.save();
  ctx.lineJoin = 'round';
  ctx.lineWidth = line;
  ctx.strokeStyle = C.outline;
  trace(ctx, pts);
  unprobed(ctx, () => ctx.stroke());
  ctx.restore();
};

/**
 * The seed `seed` opens, at its pose: the seal's ribbon scrap at its foot,
 * its husk, and, parted along its seam, the cut face of its shell round its
 * hollow, from the cleft at its tip to its foot, the light that wakes in its
 * heart and lays its glow round it, and the blade folded in the hollow
 * before that light.
 * Its lines are the prop's own, under any card, so they are drawn
 * `unprobed`.
 */
export const openSeed = (ctx: CanvasRenderingContext2D, s: OpenSeedPose) => {
  if (s.shown <= 0 || s.size <= 0) return;
  const k = s.size / SEED_TALL;
  const ink = s.line / k;
  const inner = LINES.lip * ink;
  const lit = clamp(s.glow);
  const open = clamp(s.open);
  const husk = huskShape(open);
  ctx.save();
  ctx.globalAlpha *= Math.min(1, s.shown);
  ctx.translate(s.x, s.y);
  ctx.rotate(s.rot);
  ctx.scale(k, k);
  glow(ctx, HEART.x, HEART.y, HALO.r, GOLD_GLOW, HALO.share * s.glow);
  cut(ctx, SCRAP, OPEN.ribbon, { line: 0.8 * ink, flat: true });
  cut(ctx, husk, toward(OPEN.husk, OPEN.gold, lit), { line: ink });
  seam(ctx, 0.6 * ink, open);
  if (open > 0) {
    const { x, y, half, tall, face } = HOLLOW;
    const hollow = lens(x, y, half * open, tall);
    // Inside the husk, so the cut face runs out to its edge in the cleft and at its foot:
    // one ring of one tone round a hollow of one tone, so neither adds a crease's band.
    ctx.save();
    trace(ctx, husk);
    ctx.clip();
    cut(ctx, lens(x, y, (half + face) * open, tall + face), toward(OPEN.face, OPEN.faceLit, lit), {
      line: inner,
      flat: true,
    });
    cut(ctx, hollow, toward(OPEN.hollow, OPEN.lit, lit), { line: 0, flat: true });
    // The light in its heart, behind the blade, so the blade keeps its green and its ink.
    ctx.save();
    trace(ctx, hollow);
    ctx.clip();
    glow(ctx, HEART.x, HEART.y, HEART.r, OPEN.heart, HEART.share * s.glow);
    embryo(ctx, s.grown, inner);
    ctx.restore();
    // The hollow's edge, over what lies in it, finer than the lip.
    inked(ctx, hollow, LINES.hollow * ink);
    ctx.restore();
    // The husk's edge, over the cut face where it runs out to it.
    inked(ctx, husk, ink);
  }
  ctx.restore();
};
