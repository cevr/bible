// The small props the landing hands round, drawn in the set's way (`cut`:
// one paper creased at the light's angle, lined in the ink), in the Board's
// pixels: the gold seed, the green blade up through the crack, the dry fig
// leaves, and the light that marks a gift as it is named (`glow`). Each is
// drawn about its own place, so a scene puts it in a hand, at a crack or on
// the floor.

import type { Pt } from '@bible/film/style';
import { cut } from './court-set.ts';

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
  cut(ctx, drop(7, 10), P.seed, { line: 2.4 });
  ctx.fillStyle = '#fff3c4';
  ctx.beginPath();
  ctx.ellipse(-2.4, -2, 1.6, 3, -0.3, 0, 2 * Math.PI);
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
