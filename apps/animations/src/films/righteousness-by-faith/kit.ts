// The film's recurring pieces, so every scene draws one world: BibleProject's
// grey paper people (a brow line and eye strokes for a face), the skies, the
// glows, the stains. Scenes place them; nothing here reads the clock.

import {
  type Hand,
  type PieceStyle,
  type Pt,
  type StrokeStyle,
  at,
  piece as paperPiece,
  cutout,
  ground,
  ellipseShape,
  probeFace,
  quad,
  reach,
  rectShape,
  spline,
  stroke,
  sub,
} from '@bible/film/canvas';
import { clamp, hash2, lerp } from '@bible/film/core';
import { fonts, palette } from './palette.ts';

export const C = palette;
export const F = fonts;

// ─── helpers ─────────────────────────────────────────────────────────────────

/** A framing from its knobs: the framework's, so every film's scenes name it from their kit. */
export { ground, knobCamera } from '@bible/film/canvas';

/** The icon's word-bubble, centred on (0, 0): 160 units wide. The word of light is this bubble, lit. */
export const BUBBLE: Pt[] = [
  [-80, -48],
  [80, -48],
  [80, 40],
  [-20, 40],
  [-54, 76],
  [-46, 40],
  [-80, 40],
];

/** A rectangle centred on (x, y), `w` by `h`: a text plate's shape, drawn by `piece` and declared by `probePlate`. */
export const plate = (x: number, y: number, w: number, h: number): Pt[] =>
  rectShape(x - w / 2, y - h / 2, w, h);

/** A colour between two hex colours. */
export const mix = (a: string, b: string, t: number): string => {
  const ch = (hex: string, i: number) => Number.parseInt(hex.slice(1 + i * 2, 3 + i * 2), 16);
  const k = Math.min(1, Math.max(0, t));
  const out = [0, 1, 2].map((i) =>
    Math.round(lerp(ch(a, i), ch(b, i), k))
      .toString(16)
      .padStart(2, '0'),
  );
  return `#${out.join('')}`;
};

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

// ─── paper pieces ────────────────────────────────────────────────────────────

/** How one piece of this film's paper is made: its role, and whatever it names over the role's. */
export type PieceOpts = Omit<PieceStyle, 'color' | 'outline'> & { readonly outline?: string };

/**
 * One piece of the film's paper in `color` (the engine's `piece`): a figure's
 * piece is cut and outlined in the film's ink, scenery is torn with no ink.
 */
export const piece = (
  ctx: CanvasRenderingContext2D,
  shape: ReadonlyArray<Pt>,
  color: string,
  hand: Hand,
  opts: PieceOpts,
) => paperPiece(ctx, shape, { ...opts, color, outline: opts.outline ?? C.outline }, hand);

/** The bubble's three lines of writing, centred like it. */
const BUBBLE_LINES = [0, 1, 2].map((i) =>
  rounded(-6 + (i % 2) * 8, -12 + i * 14, 90 - (i % 2) * 20, 5, 2),
);

/**
 * The word-bubble in `fill` with its three lines of writing in `ink`,
 * centred on (0, 0): the icon (`icons`), the word of light (`spoken`), the
 * heavy word (`declared`). `lines(i)` seeds each line.
 */
export const bubble = (
  ctx: CanvasRenderingContext2D,
  hand: Hand,
  lines: (i: number) => Hand,
  s: { readonly fill: string; readonly ink: string; readonly shadow: number },
) => {
  piece(ctx, BUBBLE, s.fill, hand, { role: 'scenery', kind: 'cut', line: 5, shadow: s.shadow });
  BUBBLE_LINES.forEach((l, i) =>
    piece(ctx, l, s.ink, lines(i), { role: 'scenery', kind: 'ink', line: 0, shadow: 0 }),
  );
};

/** The icon's heart, centred on (0, 0), about 190 units wide (`within` shows a callback inside it). */
export const HEART: ReadonlyArray<Pt> = [
  [0, -54],
  [40, -94],
  [96, -60],
  [84, 4],
  [0, 96],
  [-84, 4],
  [-96, -60],
  [-40, -94],
];

/**
 * The heart in `fill` with the two tablets of the law on it (`icons`,
 * `within`); `law` writes their lines, so they stay legible close up.
 */
export const heart = (
  ctx: CanvasRenderingContext2D,
  hand: (k: string) => Hand,
  fill: string,
  law: boolean,
) => {
  piece(ctx, HEART, fill, hand('heart'), { role: 'scenery', kind: 'cut', line: 5 });
  for (const x of [-24, 24] as const) {
    piece(ctx, rounded(x, 6, 40, 64, 14), C.gold, sub(hand('tablet'), x), {
      role: 'scenery',
      kind: 'cut',
      line: 3.5,
    });
    if (law)
      for (let i = 0; i < 4; i++)
        piece(ctx, rounded(x, -10 + i * 12, 24, 3, 1), C.ink, sub(hand('law'), x * 10 + i), {
          role: 'scenery',
          kind: 'ink',
          line: 0,
          shadow: 0,
        });
  }
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
  /** The mouth's curve, −1 a frown to 1 a smile (held there); nothing near 0. An "oh" opens under it. */
  smile?: number;
  /** 1 open to 0 shut; below 0.3 each eye is an arc, a happy crescent when smiling past 0.5. */
  eyes?: number;
  /**
   * What sits on the head (a turban, a helmet, hair, spectacles): drawn in
   * head space, turned with it, over the eyes and under the brows. `c` is the
   * head's centre and `r` its radii, in the person's units. A module-level
   * function, so no closure is made per frame: what it needs beyond the
   * person's hand comes through `headHands`.
   */
  onHead?: HeadPiece;
  /** Keyed hands `onHead` draws with, so its pieces keep the scene's own seeds. */
  headHands?: Hands;
  /**
   * The body's width and height as multiples (garment, legs, shoulders), each
   * held in 0.6..1.5; the head keeps the size that reads.
   */
  build?: readonly [number, number];
  /** A moustache, 0 none to 1 a full handlebar (held there), in `hair` (the outline ink unless given). */
  moustache?: number;
  hair?: string;
  /** Hands, in the person's units, when they reach for something; no arm otherwise. */
  handL?: Pt;
  handR?: Pt;
  /** Stains on the garment: blob outlines in the person's units. */
  stains?: ReadonlyArray<ReadonlyArray<Pt>>;
  /**
   * How far each stain is washed out, in `stains`' order: 0 scarlet, toward 1
   * the garment's own colour, and at 1 gone. None given, every stain is scarlet.
   */
  washed?: ReadonlyArray<number>;
  /**
   * 0 stands, 1 sits: the origin becomes the seat's front edge, the body
   * drops onto it by the legs' height, the lap comes forward over the edge
   * with its two knees, and the shins hang down its face.
   */
  sit?: number;
  /**
   * How much ground is under the feet, 0..1: a standing person casts the
   * engine's contact shadow there (`ground`), fading as they sit. 0 for a
   * figure with nothing under it: flying, on the cross, lying down. Default 1.
   */
  ground?: number;
}

const NECK: Pt = [0, -128];
const HEAD: Pt = [0, -165];
const HEAD_RX = 35;
const HEAD_RY = 38;
const HEAD_R: Pt = [HEAD_RX, HEAD_RY];
const SHOULDER_Y = -116;
const ARM = [36, 34];
/** How far the body drops onto its seat when sitting: the legs' height. */
const SEAT = 22;

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

/** Each turban wrap: its height on the head and half its width, in head radii. */
const TURBAN_WRAPS = [
  [-0.82, 0.92],
  [-1.02, 0.8],
  [-1.22, 0.5],
] as const;

/** `pts` moved by (dx, dy), without a per-point closure. */
export const shifted = (pts: ReadonlyArray<Pt>, dx: number, dy: number): Pt[] => {
  const out: Pt[] = [];
  for (const [x, y] of pts) out.push([dx + x, dy + y]);
  return out;
};

/**
 * What sits on a head, drawn in head space: `c` the head's centre, `r` its
 * radii, `hand` the person's, `hands` the person's `headHands` when given.
 */
export type HeadPiece = (
  ctx: CanvasRenderingContext2D,
  c: Pt,
  r: Pt,
  hand: Hand,
  hands: Hands | undefined,
) => void;

/** A priest's wrapped linen turban, as a person's `onHead`. */
export const turban: HeadPiece = (ctx, [cx, cy], [rx, ry], hand) => {
  piece(ctx, shifted(turbanShape(rx, ry), cx, cy), C.paper, sub(hand, 5), { role: 'figure' });
  for (const [y, w] of TURBAN_WRAPS)
    stroke(
      ctx,
      quad(
        [cx - w * rx, cy + (y - 0.04) * ry],
        [cx, cy + (y + 0.08) * ry],
        [cx + w * rx, cy + (y + 0.02) * ry],
      ),
      { color: C.paperTone, width: 2, jitter: 0.4, boil: 'crawl' },
      sub(hand, 70 + y),
    );
};

/**
 * One side of a moustache over a mouth at (x, y), `side` −1 left or 1 right:
 * `m` 0..1 grows it from a trim line to a full handlebar with its tips out.
 */
const moustacheSide = (x: number, y: number, side: -1 | 1, m: number): Pt[] => {
  const s = 0.5 + 0.5 * m;
  return spline(
    [
      [x, y - 3],
      [x + side * 9 * s, y - 5],
      [x + side * 17 * s, y - 2],
      [x + side * 23 * s, y + 1 + 4 * m],
      [x + side * 15 * s, y + 3],
      [x + side * 6 * s, y + 4],
      [x, y + 3],
    ],
    5,
    true,
  );
};

/** Each eye's, leg's and moustache side's offset or side: fixed, so a frame allocates none. */
const EYE_DX = [-12, 13] as const;
const LEG_X = [-13, 13] as const;
const SIDES = [-1, 1] as const;

/**
 * The two eyes about (x, y), the midpoint between them: filled ovals that
 * narrow as `open` falls, and below 0.3 an arc each, bowed down when shut,
 * bowed up in a happy crescent when `smile` is past 0.5.
 */
const eyePair = (
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  open: number,
  smile: number,
  hand: Hand,
) => {
  for (const dx of EYE_DX) {
    if (open < 0.3) {
      const bow = smile > 0.5 ? -4 : 4;
      stroke(
        ctx,
        quad([x + dx - 5, y], [x + dx, y + bow], [x + dx + 5, y]),
        { color: C.outline, width: 2.6, jitter: 0.3, taper: 0.2, boil: 'crawl' },
        sub(hand, 11 + dx),
      );
      continue;
    }
    ctx.fillStyle = C.outline;
    ctx.beginPath();
    ctx.ellipse(x + dx, y, 3.2, 4.2 * open, 0, 0, Math.PI * 2);
    ctx.fill();
  }
};

/**
 * The mouth under a head centred on (x, y): the `smile` curve, and `open` as
 * a small round "oh" that becomes an open grin under the curve as the smile
 * grows.
 */
const mouthOf = (
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  open: number,
  smile: number,
  hand: Hand,
) => {
  if (Math.abs(smile) > 0.05)
    stroke(
      ctx,
      quad([x - 7, y + 14], [x + 2, y + 14 + 8 * smile], [x + 11, y + 14]),
      { color: C.outline, width: 3, jitter: 0.3, taper: 0.3, boil: 'crawl' },
      sub(hand, 10),
    );
  if (open <= 0.02) return;
  const grin = clamp(smile * 3);
  const oh = open * (1 - grin);
  ctx.fillStyle = C.outline;
  if (oh > 0.02) {
    ctx.beginPath();
    ctx.ellipse(x + 2, y + 16, 3 * oh + 0.5, 4 * oh + 0.5, 0, 0, Math.PI * 2);
    ctx.fill();
  }
  const lip = open * grin;
  if (lip > 0.02) {
    ctx.beginPath();
    ctx.moveTo(x - 7, y + 14);
    ctx.quadraticCurveTo(x + 2, y + 14 + 8 * smile + 10 * lip, x + 11, y + 14);
    ctx.closePath();
    ctx.fill();
  }
};

/**
 * Opens a frame dropped `dy` and scaled (sx, sy) about the origin, skipping
 * the identity; the caller restores it. The person's layers use it in place
 * of a closure per layer.
 */
const frameOf = (ctx: CanvasRenderingContext2D, dy: number, sx = 1, sy = 1) => {
  ctx.save();
  if (dy !== 0) ctx.translate(0, dy);
  if (sx !== 1 || sy !== 1) ctx.scale(sx, sy);
};

/** A seated shin's length, from under the knee to the heel: long enough to hang down a wall and read. */
const SHIN = 46;
/** Where a seated shin starts: under the lap's knees. */
const KNEE_Y = 6;

/**
 * The two legs: under the body standing; as `sit` goes to 1 each becomes a
 * shin hanging from under its knee down the seat's face, a foot turned out
 * toward us at its end.
 */
const legs = (ctx: CanvasRenderingContext2D, sit: number, shade: string, hand: Hand) => {
  for (const x of LEG_X) {
    const k = sub(hand, 1 + x);
    if (sit <= 0) {
      piece(ctx, rounded(x, -10, 16, 22, 5), shade, k, { role: 'figure', line: 2.5 });
      continue;
    }
    const lx = x * (1 + 0.35 * sit);
    const top = lerp(-21, KNEE_Y, sit);
    const heel = lerp(1, KNEE_Y + SHIN, sit);
    piece(ctx, rounded(lx, (top + heel) / 2, 15, heel - top, 5), shade, k, {
      role: 'figure',
      line: 2.5,
    });
    piece(
      ctx,
      ellipseShape(lx + Math.sign(x) * 4 * sit, heel - 1, 8 + 3 * sit, 6, 24),
      shade,
      sub(k, 40),
      { role: 'figure', line: 2.5 },
    );
  }
};

const ROBE_SHAPE = spline(
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
);
const TUNIC_SHAPE = rounded(0, -72, 66, 112, 22);
/** Each garment's top and hem, standing. */
const ROBE_SPAN = [-126, -2] as const;
const TUNIC_SPAN = [-128, -16] as const;
/** Where the hem rests once seated: under the lap, just over the seat's edge. */
const SEAT_HEM = 3;
/**
 * The seated lap, about the seat: the thighs come toward us over the seat's
 * edge, so the silhouette widens there; its top is the fold at the hips, its
 * bottom the two knees with the cloth dipping between them.
 */
const LAP = spline(
  [
    [-46, -14],
    [0, -11],
    [46, -14],
    [52, 2],
    [38, 14],
    [20, 13],
    [0, 7],
    [-20, 13],
    [-38, 14],
    [-52, 2],
  ],
  6,
  true,
);
/** The shadowed crease between the knees, and its soft line. */
const LAP_CREASE: Pt[] = [
  [1, -4],
  [0, 7],
];
const LAP_FOLD: StrokeStyle = {
  color: C.outline,
  width: 2,
  jitter: 0.4,
  taper: 0.4,
  alpha: 0.5,
  boil: 'crawl',
};
const UNBUILT = [1, 1] as const;
/** How far a build may stretch or squash the body: a person still, never flat or inside out. */
const BUILD_MIN = 0.6;
const BUILD_MAX = 1.5;

/** The person's build, each factor held in [BUILD_MIN, BUILD_MAX]. */
export const buildOf = (p: Person): readonly [number, number] =>
  p.build === undefined
    ? UNBUILT
    : [clamp(p.build[0], BUILD_MIN, BUILD_MAX), clamp(p.build[1], BUILD_MIN, BUILD_MAX)];
/** Pupils looking straight ahead. */
const HEAD_STILL: Pt = [0, 0];
const NO_STAINS: ReadonlyArray<ReadonlyArray<Pt>> = [];

/**
 * The garment and its stains: standing as it is; seated, its top dropped
 * onto the seat and its length folded into the lap, the hem at the seat's
 * edge.
 */
/**
 * The seated garment's fold for `sit` > 0: its top dropped onto the seat,
 * its length folded so the hem rests at the seat's edge under the lap, and
 * its width drawn in, since the cloth falls straight to the lap rather than
 * belling to the feet. As a drop `dy` and a scale (sx, sy) about the feet.
 */
const foldOf = (robe: boolean, sit: number): readonly [dy: number, sx: number, sy: number] => {
  const [top, hem] = robe ? ROBE_SPAN : TUNIC_SPAN;
  const k = (lerp(hem, SEAT_HEM, sit) - top - SEAT * sit) / (hem - top);
  return [top + SEAT * sit - top * k, 1 - 0.18 * sit, k];
};

/**
 * Where the point `y` units up this person's standing garment is drawn, for
 * their build and sit, and the garment's width there as a multiple: so
 * something worn on it (Christ's sash) stays on it.
 */
export const onGarment = (p: Person, y: number): readonly [sx: number, y: number] => {
  const [bw, bh] = buildOf(p);
  const sit = clamp(p.sit ?? 0);
  if (sit <= 0) return [bw, bh * y];
  const [dy, sx, sy] = foldOf(p.garment === 'robe', sit);
  return [bw * sx, bh * (dy + sy * y)];
};

/** Folds the frame onto the seat for `sit` > 0 (see `foldOf`); nothing standing. */
const toFold = (ctx: CanvasRenderingContext2D, robe: boolean, sit: number) => {
  if (sit <= 0) return;
  const [dy, sx, sy] = foldOf(robe, sit);
  ctx.translate(0, dy);
  ctx.scale(sx, sy);
};

/** Adds `pts` to the current path as one closed subpath. */
export const tracePath = (ctx: CanvasRenderingContext2D, pts: ReadonlyArray<Pt>) => {
  let first = true;
  for (const [x, y] of pts) {
    if (first) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
    first = false;
  }
  ctx.closePath();
};

/**
 * Clips to this person's garment as `person` draws it, build, seated fold
 * and lap included, in the frame `person` was drawn in: so something spread
 * through the cloth (declared's gold) stays on it. The caller saves before
 * and restores after; the transform is left as it was.
 */
export const clipToGarment = (ctx: CanvasRenderingContext2D, p: Person) => {
  const m = ctx.getTransform();
  const [bw, bh] = buildOf(p);
  const sit = clamp(p.sit ?? 0);
  const robe = p.garment === 'robe';
  if (bw !== 1 || bh !== 1) ctx.scale(bw, bh);
  ctx.beginPath();
  if (sit > 0) {
    // The lap's subpath first, in the build's frame, before the fold.
    const lap = ctx.getTransform();
    ctx.scale(robe ? 1 : 0.8, sit);
    tracePath(ctx, LAP);
    ctx.setTransform(lap);
  }
  toFold(ctx, robe, sit);
  tracePath(ctx, robe ? ROBE_SHAPE : TUNIC_SHAPE);
  ctx.clip();
  ctx.setTransform(m);
};

const garment = (
  ctx: CanvasRenderingContext2D,
  p: Person,
  sit: number,
  body: string,
  hand: Hand,
) => {
  const robe = p.garment === 'robe';
  ctx.save();
  toFold(ctx, robe, sit);
  piece(ctx, robe ? ROBE_SHAPE : TUNIC_SHAPE, body, sub(hand, 3), { role: 'figure' });
  let i = 0;
  for (const stain of p.stains ?? NO_STAINS) {
    const wash = p.washed?.[i] ?? 0;
    if (wash < 1)
      cutout(
        ctx,
        stain,
        {
          color: wash > 0 ? mix(C.scarlet, body, wash) : C.scarlet,
          torn: 2.5,
          rim: 0,
          shadow: 0.1,
          boil: 'crawl',
        },
        sub(hand, 60 + i),
      );
    i++;
  }
  ctx.restore();
  if (sit <= 0) return;
  // The lap: the thighs come toward us over the seat's edge, the cloth
  // draped across them and broken by the two knees; it grows in with `sit`.
  ctx.save();
  ctx.scale(robe ? 1 : 0.8, sit);
  piece(ctx, LAP, body, sub(hand, 6), { role: 'figure', shadow: 0.25 });
  stroke(ctx, LAP_CREASE, LAP_FOLD, sub(hand, 14));
  ctx.restore();
};

/** One arm from its shoulder on a body of build (bw, bh) to `target`, when it reaches. */
const arm = (
  ctx: CanvasRenderingContext2D,
  side: -1 | 1,
  target: Pt | undefined,
  [bw, bh]: readonly [number, number],
  colours: readonly [body: string, skin: string],
  hand: Hand,
  k: number,
) => {
  if (target === undefined) return;
  const path = spline(reach([side * 26 * bw, SHOULDER_Y * bh], target, ARM, side), 8);
  stroke(
    ctx,
    path,
    { color: C.outline, width: 17, taper: 0, jitter: 0.5, boil: 'crawl' },
    sub(hand, k),
  );
  stroke(
    ctx,
    path,
    { color: colours[0], width: 12, taper: 0, jitter: 0.5, boil: 'crawl' },
    sub(hand, k + 1),
  );
  const [hx, hy] = path.at(-1) ?? target;
  piece(ctx, ellipseShape(hx, hy, 8, 8, 20), colours[1], sub(hand, k + 2), {
    role: 'figure',
    line: 2.5,
  });
};

/** How wide the contact shadow under a standing person spreads, by garment: past the robe's hem, or the tunic and feet. */
const FOOT_SHADOW_W = { robe: 150, round: 100 } as const;
/** Where it lies: just under the soles. */
const FOOT_SHADOW_Y = 2;

export const person = (ctx: CanvasRenderingContext2D, p: Person, hand: Hand) => {
  const colours = [p.body ?? C.figure, p.skin ?? C.figure] as const;
  const build = buildOf(p);
  const [bw, bh] = build;
  const sit = clamp(p.sit ?? 0);
  // Seated, everything but the legs drops onto the seat.
  const drop = sit > 0 ? SEAT * sit * bh : 0;

  // The contact shadow under the feet, under everything else, as wide as the hem.
  const standing = clamp(p.ground ?? 1) * (1 - sit);
  if (standing > 0) {
    ctx.save();
    ctx.globalAlpha *= standing;
    ground(ctx, 0, FOOT_SHADOW_Y, FOOT_SHADOW_W[p.garment ?? 'round'] * bw);
    ctx.restore();
  }

  // The far arm behind the body, the near one over it.
  frameOf(ctx, drop);
  arm(ctx, -1, p.handL, build, colours, hand, 40);
  ctx.restore();
  // A build stretches the body from the feet; the head rides its neck.
  frameOf(ctx, 0, bw, bh);
  legs(ctx, sit, p.shade ?? C.figureShade, hand);
  ctx.restore();
  frameOf(ctx, 0, bw, bh);
  garment(ctx, p, sit, colours[0], hand);
  ctx.restore();
  frameOf(ctx, drop);
  head(ctx, p, colours[1], hand, NECK[1] * (bh - 1));
  arm(ctx, 1, p.handR, build, colours, hand, 50);
  ctx.restore();
};

/**
 * One brow over the eye on `side` of a head centred on (cx, cy), raised
 * `rise`; a `tilt` past 0 lifts the end nearer the nose: the left brow's
 * inner end is its right one, and the other way round.
 */
const browOf = (
  ctx: CanvasRenderingContext2D,
  [cx, cy]: Pt,
  side: -1 | 1,
  rise: number,
  tilt: number,
  hand: Hand,
) => {
  const bx = cx + side * 13;
  const by = cy - 21 - rise;
  stroke(
    ctx,
    [
      [bx - 8, by - side * tilt * 6],
      [bx + 8, by + side * tilt * 6],
    ],
    { color: C.outline, width: 3.4, jitter: 0.3, taper: 0.2, boil: 'crawl' },
    hand,
  );
};

/**
 * The head, turned about the neck and raised `lift` with a build, with its
 * face, whatever sits on it and any moustache.
 */
const head = (ctx: CanvasRenderingContext2D, p: Person, skin: string, hand: Hand, lift: number) => {
  ctx.save();
  ctx.translate(NECK[0], NECK[1] + (p.nod ?? 0) + lift);
  ctx.rotate(p.tilt ?? 0);
  ctx.translate(-NECK[0], -NECK[1]);
  const [cx, cy] = HEAD;
  piece(ctx, ellipseShape(cx, cy, HEAD_RX, HEAD_RY), skin, sub(hand, 4), { role: 'figure' });
  probeFace(ctx, cx, cy, 2 * HEAD_RY);
  const [lx, ly] = p.look ?? HEAD_STILL;
  const smile = clamp(p.smile ?? 0, -1, 1);
  eyePair(ctx, cx + lx, cy - 7 + ly, clamp(p.eyes ?? 1), smile, hand);
  p.onHead?.(ctx, HEAD, HEAD_R, hand, p.headHands);
  const tilt = p.browTilt ?? 0;
  browOf(ctx, HEAD, -1, p.browL ?? 0, tilt, sub(hand, 8));
  browOf(ctx, HEAD, 1, p.browR ?? 0, tilt, sub(hand, 9));
  mouthOf(ctx, cx, cy, p.mouth ?? 0, smile, hand);
  const m = clamp(p.moustache ?? 0);
  if (m > 0)
    for (const side of SIDES)
      piece(
        ctx,
        moustacheSide(cx + 2, cy + 10, side, m),
        p.hair ?? C.outline,
        sub(hand, 12 + side),
        {
          role: 'figure',
          line: 2,
          shadow: 0,
        },
      );
  ctx.restore();
};

/**
 * A walker's bob, in units (+ up), while the `walk` cue runs and 0 outside
 * it: a step every π/7 s counted from the cue's start, each rising up to 5
 * units, so the bob starts from rest and never jumps as the walk begins.
 */
export const gait = (t: number, walk: { readonly start: number; readonly end: number }): number =>
  t > walk.start && t < walk.end ? Math.abs(Math.sin((t - walk.start) * 7)) * 5 : 0;

// ─── recurring figures and the icon row ──────────────────────────────────────
// Figures and the icon row more than one scene draws, so a callback lands in
// the same layout (CRAFT rule 8). Each takes a `hand` for its keys, so boil
// seeds stay the scene's own. Sets live in their own modules: court.ts,
// heaven.ts, city.ts, law.ts, garden.ts, spoken.ts, gospel.ts.

/** A scene's hands: its own `f.hand`, or another scene's from `f.handsOf(scene)`. */
export type Hands = (k: string) => Hand;

/**
 * Christ, feet at the origin, as a `person` in the white robe with a gold
 * sash: the pose is the caller's (look, brows, hands), the robe is not.
 */
export const christ = (ctx: CanvasRenderingContext2D, pose: Person, hand: Hands) => {
  const robed: Person = { ...pose, body: C.robe, shade: C.robe, garment: 'robe' };
  person(ctx, robed, hand('christ'));
  // The sash rides the robe, 90 units up it, through any build or sit.
  const [sx, y] = onGarment(robed, -90);
  ctx.save();
  ctx.translate(0, y);
  ctx.rotate(-0.45);
  ctx.scale(sx, 1);
  piece(ctx, SASH, C.gold, hand('sash'), { role: 'figure', line: 2 });
  ctx.restore();
};
const SASH = rounded(0, 0, 92, 12, 3);

/** The shape of a robe, centred on (0, 0) at size 1: the loom's cloth and the icon. */
export const ROBE: Pt[] = [
  [-120, -330],
  [120, -330],
  [330, -210],
  [330, -80],
  [200, -110],
  [240, 330],
  [-240, 330],
  [-200, -110],
  [-330, -80],
  [-330, -210],
];

/** The heart's place on a person's chest, in their units (`within`, `daily`, the Sabbath field). */
export const CHEST: Pt = [0, -80];

/** The three icons' centres, relative to the row's centre. */
export const ICON_X = [-440, 0, 440] as const;

/**
 * The film's three icons in a row centred on the origin, the answer's shape
 * (`message`): a gold word-bubble (God declares), a white robe (clothes) and
 * a heart with two tablets (changes). `lit` is each icon's glow alpha 0..1
 * (0 draws none): the turn the film is on. `shown` scales each icon about its
 * centre as it pops in (0 draws none).
 */
export const icons = (
  ctx: CanvasRenderingContext2D,
  hand: Hands,
  lit: readonly [number, number, number],
  shown: readonly [number, number, number] = [1, 1, 1],
) => {
  const disc = (i: 0 | 1 | 2, key: string, inner: () => void) => {
    if (shown[i] <= 0) return;
    at(ctx, { x: ICON_X[i], y: 0, scale: shown[i] }, () => {
      piece(ctx, ellipseShape(0, 0, 150, 150), C.paper, hand(key), {
        role: 'scenery',
        kind: 'cut',
        line: 6,
      });
      if (lit[i] > 0) glow(ctx, 0, 0, 260, C.glow, lit[i]);
      inner();
    });
  };
  disc(0, 'iconWord', () =>
    bubble(ctx, hand('bubble'), (i) => sub(hand('lines'), i), {
      fill: C.gold,
      ink: C.ink,
      shadow: 0.35,
    }),
  );
  disc(1, 'iconRobe', () =>
    at(ctx, { x: 0, y: 10, scale: 0.26 }, () =>
      piece(ctx, ROBE, C.robe, hand('iconRobeShape'), { role: 'scenery', kind: 'cut', line: 18 }),
    ),
  );
  disc(2, 'iconHeart', () => heart(ctx, hand, C.boardLight, false));
};

/** The open hand's four fingers: each one's x across the palm and its seed. */
const FINGERS = [
  [-105, 1],
  [-37, 2],
  [33, 3],
  [100, 4],
] as const;
const WRIST = rounded(20, 190, 170, 260, 50);
const FINGER = rounded(0, 0, 58, 120, 28);
const PALM = rounded(0, 20, 310, 170, 80);
const THUMB = rounded(0, 0, 56, 130, 28);
const CREASE = spline([
  [-90, 50],
  [0, 30],
  [90, 55],
]);

/**
 * The open hand, palm up, the palm's centre near (0, 0), about 390 units
 * wide: faith, the hand that takes (`look` lays the gold light in it, `daily`
 * the icons). `open` 1 holds the fingers straight; toward 0 they curl
 * down toward the palm, as a hand closes.
 */
export const openHand = (ctx: CanvasRenderingContext2D, hand: Hands, open = 1) => {
  piece(ctx, WRIST, C.figure, hand('wrist'), { role: 'figure', line: 4 });
  const curl = lerp(0.45, 1, clamp(open));
  for (const [x, k] of FINGERS) {
    ctx.save();
    ctx.translate(x, lerp(-10, -80, curl));
    ctx.rotate(x * 0.0012);
    ctx.scale(1, curl);
    piece(ctx, FINGER, C.figure, sub(hand('finger'), k), { role: 'figure', line: 4 });
    ctx.restore();
  }
  piece(ctx, PALM, C.figure, hand('palm'), { role: 'figure', line: 4 });
  ctx.save();
  ctx.translate(-165, 10);
  ctx.rotate(-0.9);
  piece(ctx, THUMB, C.figure, hand('thumb'), { role: 'figure', line: 4 });
  ctx.restore();
  stroke(
    ctx,
    CREASE,
    { color: C.figureShade, width: 4, jitter: 0.4, boil: 'crawl' },
    hand('crease'),
  );
};
