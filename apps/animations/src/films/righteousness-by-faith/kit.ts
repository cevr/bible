// The film's recurring pieces, so every scene draws one world: BibleProject's
// grey paper people (a brow line and eye strokes for a face), the skies, the
// glows, the stains. Scenes place them; nothing here reads the clock.

import {
  type Hand,
  type Pt,
  cutout,
  ellipseShape,
  quad,
  reach,
  spline,
  stroke,
} from '@bible/film/canvas';
import { hash2 } from '@bible/film/core';
import { fonts, palette } from './palette.ts';

export const C = palette;
export const F = fonts;

/** A sub-hand, so each piece of a drawing boils on its own seed. */
export const sub = (hand: Hand, k: number): Hand => ({ boil: hand.boil, seed: hand.seed + k });

// ─── shapes ──────────────────────────────────────────────────────────────────

/** A rectangle centred on (x, y) with corners rounded to `r`. */
export const rounded = (x: number, y: number, w: number, h: number, r: number): Pt[] => {
  const k = Math.min(r, w / 2, h / 2);
  const corner = (cx: number, cy: number, from: number): Pt[] =>
    Array.from({ length: 7 }, (_, i): Pt => {
      const a = from + (Math.PI / 2) * (i / 6);
      return [cx + Math.cos(a) * k, cy + Math.sin(a) * k];
    });
  const l = x - w / 2 + k;
  const rr = x + w / 2 - k;
  const t = y - h / 2 + k;
  const b = y + h / 2 - k;
  return [
    ...corner(rr, t, -Math.PI / 2),
    ...corner(rr, b, 0),
    ...corner(l, b, Math.PI / 2),
    ...corner(l, t, Math.PI),
  ];
};

/** An irregular round patch (a stain, a speck, a flake), centred on (x, y). */
export const blob = (x: number, y: number, w: number, h: number, seed: number): Pt[] =>
  spline(
    Array.from({ length: 11 }, (_, i): Pt => {
      const a = (2 * Math.PI * i) / 11;
      const k = 0.78 + 0.3 * hash2(i, seed);
      return [x + ((Math.cos(a) * w) / 2) * k, y + ((Math.sin(a) * h) / 2) * k];
    }),
    6,
    true,
  );

// ─── light ───────────────────────────────────────────────────────────────────

/** A vertical gradient over the whole frame: `stops` are [position 0..1, colour]. */
export const sky = (
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  stops: ReadonlyArray<readonly [number, string]>,
) => {
  const g = ctx.createLinearGradient(0, 0, 0, h);
  for (const [at, color] of stops) g.addColorStop(at, color);
  ctx.save();
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);
  ctx.restore();
};

/** A soft round light of `color`, strongest at its centre. */
export const glow = (
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  r: number,
  color: string,
  alpha: number,
) => {
  if (alpha <= 0 || r <= 0) return;
  const g = ctx.createRadialGradient(x, y, 0, x, y, r);
  g.addColorStop(0, color);
  g.addColorStop(1, `${color}00`);
  ctx.save();
  ctx.globalAlpha *= Math.min(1, alpha);
  ctx.fillStyle = g;
  ctx.fillRect(x - r, y - r, r * 2, r * 2);
  ctx.restore();
};

/** The soft contact shadow under something standing on the floor at (x, y). */
export const contact = (ctx: CanvasRenderingContext2D, x: number, y: number, w: number) => {
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(1, 0.12);
  const g = ctx.createRadialGradient(0, 0, 0, 0, 0, w / 2);
  g.addColorStop(0, `${C.boardDeep}70`);
  g.addColorStop(0.55, `${C.paperTone}30`);
  g.addColorStop(1, `${C.paperTone}00`);
  ctx.fillStyle = g;
  ctx.fillRect(-w / 2, -w / 2, w, w);
  ctx.restore();
};

// ─── paper pieces ────────────────────────────────────────────────────────────

/** Cut paper with a boiling ink outline: the look of every drawn thing here. */
export const piece = (
  ctx: CanvasRenderingContext2D,
  shape: ReadonlyArray<Pt>,
  color: string,
  hand: Hand,
  opts: { line?: number; torn?: number; shadow?: number; outline?: string; alpha?: number } = {},
) => {
  const alpha = opts.alpha ?? 1;
  if (alpha <= 0) return;
  cutout(
    ctx,
    shape,
    { color, torn: opts.torn ?? 1.4, rim: 0, shadow: opts.shadow ?? 0.35, grain: 0.5, alpha },
    hand,
  );
  const width = opts.line ?? 3;
  if (width > 0)
    stroke(
      ctx,
      [...shape, shape[0] ?? [0, 0]],
      { color: opts.outline ?? C.outline, width, jitter: 0.7, taper: 0, pressure: 0.15, alpha },
      sub(hand, 7),
    );
};

// ─── people ──────────────────────────────────────────────────────────────────

/**
 * A grey paper person, feet at the origin, about 200 units tall: a round
 * garment, two short legs, a big head with eyes and a brow line. Everything
 * that makes a face read is a number, so scenes animate it like any other.
 */
export interface Person {
  /** Garment and head colours. */
  body?: string;
  shade?: string;
  skin?: string;
  /** `round` is a tunic; `robe` falls to the feet. */
  garment?: 'round' | 'robe';
  /** Head turn about the neck, radians (+ tips right). */
  tilt?: number;
  /** Head drop, in units (+ down). */
  nod?: number;
  /** Where the pupils look, in units. */
  look?: Pt;
  /** Each brow's rise in units (+ up) and its tilt (+ raises the inner end: curious, worried). */
  browL?: number;
  browR?: number;
  browTilt?: number;
  /** 0 closed, 1 a small round "oh". */
  mouth?: number;
  /** A priest's wrapped linen turban. */
  turban?: boolean;
  /** Hands, in the person's units, when they reach for something; no arm otherwise. */
  handL?: Pt;
  handR?: Pt;
  /** Stains on the garment: blob outlines in the person's units. */
  stains?: ReadonlyArray<ReadonlyArray<Pt>>;
}

export const NECK: Pt = [0, -128];
export const HEAD: Pt = [0, -165];
const HEAD_RX = 35;
const HEAD_RY = 38;
const SHOULDER_Y = -116;
const ARM = [36, 34];

/** Where a point on the head lands once the head has turned and dropped. */
const onHead = (p: Person, x: number, y: number): Pt => {
  const a = p.tilt ?? 0;
  const dx = x - NECK[0];
  const dy = y - NECK[1];
  return [
    NECK[0] + dx * Math.cos(a) - dy * Math.sin(a),
    NECK[1] + (p.nod ?? 0) + dx * Math.sin(a) + dy * Math.cos(a),
  ];
};

/** The turban's dome, over a head centred on (0, 0) of radii rx, ry: high enough to leave the brows showing. */
const turbanShape = (rx: number, ry: number): Pt[] =>
  spline(
    [
      [-1.1 * rx, -0.7 * ry],
      [-1.04 * rx, -1.02 * ry],
      [-0.56 * rx, -1.42 * ry],
      [0.56 * rx, -1.42 * ry],
      [1.04 * rx, -1.02 * ry],
      [1.1 * rx, -0.7 * ry],
      [0, -0.66 * ry],
    ],
    8,
    true,
  );

export const person = (ctx: CanvasRenderingContext2D, p: Person, hand: Hand) => {
  const body = p.body ?? C.figure;
  const shade = p.shade ?? C.figureShade;
  const skin = p.skin ?? C.figure;
  const arm = (side: -1 | 1, target: Pt | undefined, k: number) => {
    if (target === undefined) return;
    const path = spline(reach([side * 26, SHOULDER_Y], target, ARM, side), 8);
    stroke(ctx, path, { color: C.outline, width: 17, taper: 0, jitter: 0.5 }, sub(hand, k));
    stroke(ctx, path, { color: body, width: 12, taper: 0, jitter: 0.5 }, sub(hand, k + 1));
    const [hx, hy] = path.at(-1) ?? target;
    piece(ctx, ellipseShape(hx, hy, 8, 8, 20), skin, sub(hand, k + 2), { line: 2.5 });
  };

  // The far arm behind the body, the near one over it.
  arm(-1, p.handL, 40);
  for (const x of [-13, 13])
    piece(ctx, rounded(x, -10, 16, 22, 5), shade, sub(hand, 1 + x), { line: 2.5 });
  const garment =
    p.garment === 'robe'
      ? spline(
          [
            [-24, -126],
            [24, -126],
            [44, -60],
            [52, -2],
            [-52, -2],
            [-44, -60],
          ],
          6,
          true,
        )
      : rounded(0, -72, 66, 112, 22);
  piece(ctx, garment, body, sub(hand, 3));
  (p.stains ?? []).forEach((stain, i) =>
    cutout(ctx, stain, { color: C.scarlet, torn: 2.5, rim: 0, shadow: 0.1 }, sub(hand, 60 + i)),
  );

  // The head turns about the neck.
  ctx.save();
  ctx.translate(NECK[0], NECK[1] + (p.nod ?? 0));
  ctx.rotate(p.tilt ?? 0);
  ctx.translate(-NECK[0], -NECK[1]);
  const [cx, cy] = HEAD;
  piece(ctx, ellipseShape(cx, cy, HEAD_RX, HEAD_RY), skin, sub(hand, 4));
  const [lx, ly] = p.look ?? [0, 0];
  for (const x of [-12, 13]) {
    ctx.fillStyle = C.outline;
    ctx.beginPath();
    ctx.ellipse(cx + x + lx, cy - 7 + ly, 3.2, 4.2, 0, 0, Math.PI * 2);
    ctx.fill();
  }
  if (p.turban === true) {
    const dome = turbanShape(HEAD_RX, HEAD_RY).map(([x, y]): Pt => [cx + x, cy + y]);
    piece(ctx, dome, C.paper, sub(hand, 5));
    // Each wrap: its height on the head and half its width, in head radii.
    for (const [y, w] of [
      [-0.82, 0.92],
      [-1.02, 0.8],
      [-1.22, 0.5],
    ] as const)
      stroke(
        ctx,
        quad(
          [cx - w * HEAD_RX, cy + (y - 0.04) * HEAD_RY],
          [cx, cy + (y + 0.08) * HEAD_RY],
          [cx + w * HEAD_RX, cy + (y + 0.02) * HEAD_RY],
        ),
        { color: C.paperTone, width: 2, jitter: 0.4 },
        sub(hand, 70 + y),
      );
  }
  const tilt = p.browTilt ?? 0;
  const brow = (side: -1 | 1, rise: number, k: number) => {
    const bx = cx + side * 13;
    const by = cy - 21 - rise;
    // A raised inner end lifts the end nearer the nose: the left brow's inner
    // end is its right one, and the other way round.
    stroke(
      ctx,
      [
        [bx - 8, by - side * tilt * 6],
        [bx + 8, by + side * tilt * 6],
      ],
      { color: C.outline, width: 3.4, jitter: 0.3, taper: 0.2 },
      sub(hand, k),
    );
  };
  brow(-1, p.browL ?? 0, 8);
  brow(1, p.browR ?? 0, 9);
  const open = p.mouth ?? 0;
  if (open > 0.02) {
    ctx.fillStyle = C.outline;
    ctx.beginPath();
    ctx.ellipse(cx + 2, cy + 16, 3 * open + 0.5, 4 * open + 0.5, 0, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
  arm(1, p.handR, 50);
};

/** Where a person's face is, for a camera to find it. */
export const faceOf = (p: Person): Pt => onHead(p, HEAD[0], HEAD[1]);
