// The film's recurring pieces, so every scene draws one world: BibleProject's
// grey paper people (a brow line and eye strokes for a face), the skies, the
// glows, the stains. Scenes place them; nothing here reads the clock.

import {
  type Camera,
  type Hand,
  type Pt,
  at,
  cutout,
  ellipseShape,
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

/** A camera part way from `a` to `b`. */
export const between = (a: Camera, b: Camera, t: number): Camera => ({
  x: lerp(a.x, b.x, t),
  y: lerp(a.y, b.y, t),
  zoom: lerp(a.zoom ?? 1, b.zoom ?? 1, t),
  rot: lerp(a.rot ?? 0, b.rot ?? 0, t),
});

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
  piece(ctx, BUBBLE, s.fill, hand, { line: 5, shadow: s.shadow });
  BUBBLE_LINES.forEach((l, i) => piece(ctx, l, s.ink, lines(i), { line: 0, shadow: 0 }));
};

/** The icon's heart, centred on (0, 0), about 190 units wide. */
const HEART: Pt[] = [
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
  piece(ctx, HEART, fill, hand('heart'), { line: 5 });
  for (const x of [-24, 24] as const) {
    piece(ctx, rounded(x, 6, 40, 64, 14), C.gold, sub(hand('tablet'), x), { line: 3.5 });
    if (law)
      for (let i = 0; i < 4; i++)
        piece(ctx, rounded(x, -10 + i * 12, 24, 3, 1), C.ink, sub(hand('law'), x * 10 + i), {
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
  /** The mouth's curve, −1 a frown to 1 a smile; nothing near 0. An "oh" opens under it. */
  smile?: number;
  /** 1 open to 0 shut; below 0.3 each eye is an arc, a happy crescent when smiling past 0.5. */
  eyes?: number;
  /** A priest's wrapped linen turban. */
  turban?: boolean;
  /** Hands, in the person's units, when they reach for something; no arm otherwise. */
  handL?: Pt;
  handR?: Pt;
  /** Stains on the garment: blob outlines in the person's units. */
  stains?: ReadonlyArray<ReadonlyArray<Pt>>;
  /**
   * 0 stands, 1 sits: the origin becomes the seat, the body drops onto it by
   * the legs' height, and the legs hang below it over the edge.
   */
  sit?: number;
}

export const NECK: Pt = [0, -128];
export const HEAD: Pt = [0, -165];
const HEAD_RX = 35;
const HEAD_RY = 38;
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
  for (const dx of [-12, 13]) {
    if (open < 0.3) {
      const bow = smile > 0.5 ? -4 : 4;
      stroke(
        ctx,
        quad([x + dx - 5, y], [x + dx, y + bow], [x + dx + 5, y]),
        { color: C.outline, width: 2.6, jitter: 0.3, taper: 0.2 },
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
      { color: C.outline, width: 3, jitter: 0.3, taper: 0.3 },
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
 * The two legs: under the body standing, and as `sit` goes to 1 hanging
 * below the seat, their feet splayed a little.
 */
const legs = (ctx: CanvasRenderingContext2D, sit: number, shade: string, hand: Hand) => {
  for (const x of [-13, 13]) {
    const k = sub(hand, 1 + x);
    if (sit <= 0) {
      piece(ctx, rounded(x, -10, 16, 22, 5), shade, k, { line: 2.5 });
      continue;
    }
    at(
      ctx,
      { x: x * (1 + 0.1 * sit), y: lerp(-10, 14, sit), rot: -Math.sign(x) * 0.08 * sit },
      () => piece(ctx, rounded(0, 0, 16, 22, 5), shade, k, { line: 2.5 }),
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
/** Where the hem rests once seated: just over the seat's edge. */
const SEAT_HEM = 3;

/**
 * Draws the garment's layer: standing as it is; seated, its top dropped onto
 * the seat and its length folded into the lap, the hem at the seat's edge.
 */
const garmentLayer = (
  ctx: CanvasRenderingContext2D,
  span: readonly [number, number],
  sit: number,
  draw: () => void,
) => {
  if (sit <= 0) return draw();
  const [top, hem] = span;
  const k = (lerp(hem, SEAT_HEM, sit) - top - SEAT * sit) / (hem - top);
  at(ctx, { x: 0, y: top + SEAT * sit - top * k, sy: k }, draw);
};

export const person = (ctx: CanvasRenderingContext2D, p: Person, hand: Hand) => {
  const body = p.body ?? C.figure;
  const skin = p.skin ?? C.figure;
  const arm = (side: -1 | 1, target: Pt | undefined, k: number) => {
    if (target === undefined) return;
    const path = spline(reach([side * 26, SHOULDER_Y], target, ARM, side), 8);
    stroke(ctx, path, { color: C.outline, width: 17, taper: 0, jitter: 0.5 }, sub(hand, k));
    stroke(ctx, path, { color: body, width: 12, taper: 0, jitter: 0.5 }, sub(hand, k + 1));
    const [hx, hy] = path.at(-1) ?? target;
    piece(ctx, ellipseShape(hx, hy, 8, 8, 20), skin, sub(hand, k + 2), { line: 2.5 });
  };
  // Seated, everything but the legs drops onto the seat.
  const sit = clamp(p.sit ?? 0);
  const upper = (draw: () => void) => (sit > 0 ? at(ctx, { x: 0, y: SEAT * sit }, draw) : draw());

  // The far arm behind the body, the near one over it.
  upper(() => arm(-1, p.handL, 40));
  legs(ctx, sit, p.shade ?? C.figureShade, hand);
  const robe = p.garment === 'robe';
  garmentLayer(ctx, robe ? ROBE_SPAN : TUNIC_SPAN, sit, () => {
    piece(ctx, robe ? ROBE_SHAPE : TUNIC_SHAPE, body, sub(hand, 3));
    (p.stains ?? []).forEach((stain, i) =>
      cutout(ctx, stain, { color: C.scarlet, torn: 2.5, rim: 0, shadow: 0.1 }, sub(hand, 60 + i)),
    );
  });
  upper(() => {
    head(ctx, p, skin, hand);
    arm(1, p.handR, 50);
  });
};

/** The head, turned about the neck, with its face and any turban. */
const head = (ctx: CanvasRenderingContext2D, p: Person, skin: string, hand: Hand) => {
  ctx.save();
  ctx.translate(NECK[0], NECK[1] + (p.nod ?? 0));
  ctx.rotate(p.tilt ?? 0);
  ctx.translate(-NECK[0], -NECK[1]);
  const [cx, cy] = HEAD;
  piece(ctx, ellipseShape(cx, cy, HEAD_RX, HEAD_RY), skin, sub(hand, 4));
  const [lx, ly] = p.look ?? [0, 0];
  const smile = p.smile ?? 0;
  eyePair(ctx, cx + lx, cy - 7 + ly, clamp(p.eyes ?? 1), smile, hand);
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
  mouthOf(ctx, cx, cy, p.mouth ?? 0, smile, hand);
  ctx.restore();
};

/**
 * A walker's bob, in units (+ up), while the `walk` cue runs and 0 outside
 * it: a step every π/7 s counted from `phase` (scene seconds; the cue's
 * start unless given), each rising up to 5 units.
 */
export const gait = (
  t: number,
  walk: { readonly start: number; readonly end: number },
  phase = walk.start,
): number => (t > walk.start && t < walk.end ? Math.abs(Math.sin((t - phase) * 7)) * 5 : 0);

// ─── recurring figures and the icon row ──────────────────────────────────────
// Figures and the icon row more than one scene draws, so a callback lands in
// the same layout (CRAFT rule 8). Each takes a `hand` for its keys, so boil
// seeds stay the scene's own. Sets live in their own modules: court.ts,
// heaven.ts, city.ts, law.ts, garden.ts, spoken.ts.

export type Hands = (k: string) => Hand;

/**
 * Christ, feet at the origin, as a `person` in the white robe with a gold
 * sash: the pose is the caller's (look, brows, hands), the robe is not.
 */
export const christ = (ctx: CanvasRenderingContext2D, pose: Person, hand: Hands) => {
  person(ctx, { ...pose, body: C.robe, shade: C.robe, garment: 'robe' }, hand('christ'));
  at(ctx, { x: 0, y: -90 + SEAT * clamp(pose.sit ?? 0), rot: -0.45 }, () =>
    piece(ctx, rounded(0, 0, 92, 12, 3), C.gold, hand('sash'), { line: 2 }),
  );
};

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
      piece(ctx, ellipseShape(0, 0, 150, 150), C.paper, hand(key), { line: 6 });
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
      piece(ctx, ROBE, C.robe, hand('iconRobeShape'), { line: 18 }),
    ),
  );
  disc(2, 'iconHeart', () => heart(ctx, hand, C.boardLight, false));
};
