// The film's recurring pieces, so every scene draws one world: BibleProject's
// grey paper people (a brow line and eye strokes for a face), the skies, the
// glows, the stains. Scenes place them; nothing here reads the clock.

import {
  type Gesture,
  type Grip,
  type Hand,
  type HandRoot,
  type PieceStyle,
  type Pt,
  type StrokeStyle,
  CLOSE_LINE,
  CLOSE_SPAN,
  at,
  breathOf,
  closeHand,
  floatingHand,
  glow,
  handAt,
  piece as paperPiece,
  cutout,
  ground,
  type Hex,
  ellipseShape,
  probeFace,
  probesHands,
  mix,
  quad,
  rounded,
  spline,
  stroke,
  sub,
} from '@bible/film/canvas';
import { clamp, lerp } from '@bible/film/core';
import { fonts, palette } from './palette.ts';

export const C = palette;
export const F = fonts;

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
 * What a person's hand does: the engine's `Gesture`, and how far it has gone
 * into its own close-up (`lent`, a `pushedHand`'s `into`) where the figure
 * stays in frame while its hand comes forward to us (`daily`): the figure's
 * hand gives way as the close-up takes its place, and comes back as the
 * close-up shrinks onto it, so the one hand is never shown twice.
 */
export interface PersonGesture extends Gesture {
  readonly lent?: number;
}

/**
 * A grey paper person, feet at the origin, about 200 units tall: a round
 * garment, two short legs, a big head with eyes and a brow line. Everything
 * that makes a face read is a number, so scenes animate it like any other.
 */
export interface Person {
  /** Garment and head colours. */
  body?: Hex;
  shade?: Hex;
  skin?: Hex;
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
  /**
   * What each floating hand does, on the far side (−x: behind the body, or
   * over it when it works in front of the body) and on the near side (+x,
   * over it): its target in the person's units, how far it has travelled
   * there from its rest (a named cue's `f.at`) and its grip. No gesture, or
   * one at `reach` 0, and the hand floats at rest beside the body, bobbing
   * with the breath. No arm is ever drawn (DIRECTION, Figures → Hands).
   */
  far?: PersonGesture;
  near?: PersonGesture;
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
/** What a hand moves round and measures its reach from, inside the garment's top: the near shoulder (the far one is its mirror). */
const SHOULDER: Pt = [17, -111];
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

const garment = (ctx: CanvasRenderingContext2D, p: Person, sit: number, body: Hex, hand: Hand) => {
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

/**
 * A person's hands: the 22-unit mitten, and their reach, how far from its
 * shoulder a hand may work (`film check` flags a target past it, `HandFar`).
 * The reach is a short arm's and a hand's length: about the shoulder to the
 * hip, or a hand's width above the head.
 */
export const PERSON_HAND = { mitten: 22, line: 2.5, radius: 120 } as const;
/** A `HandStyle` rewritten in place, frame to frame. */
interface ScratchStyle {
  skin: string;
  outline: string;
  mitten: number;
  line: number;
  radius: number;
}
/** The hand style a person draws with, its paper and reach rewritten per person (scratch, so the draw allocates none). */
const HAND_STYLE: ScratchStyle = {
  skin: C.figure,
  outline: C.outline,
  mitten: PERSON_HAND.mitten,
  line: PERSON_HAND.line,
  radius: PERSON_HAND.radius,
};
/**
 * Where the near hand floats at rest, standing, by garment (the far one is
 * its mirror): beside the hip, just off the garment's edge, so it reads as a
 * hand of its own and never as a patch on the cloth.
 */
const REST = { round: [42, -50], robe: [54, -50] } as const satisfies Record<string, Pt>;
/**
 * Seated, where the near hand rests on the lap instead, over the seat (in
 * the standing frame: the drop onto the seat is added), and how far out,
 * as a share of the lap's half width.
 */
const LAP_REST = { x: 0.62, y: -4 } as const;
/** The lap's half width, as `LAP` is drawn. */
const LAP_HALF = 46;
/** Which way each side lies, as a `HandRoot`'s `away`. */
const AWAY = { far: -1, near: 1 } as const;

/**
 * Where a person's hand on `side` belongs (scratch, rewritten every call):
 * its shoulder and its rest for the build, the rest moving onto the lap as
 * the person sits, both in the frame dropped onto the seat; and the breath
 * it bobs with, the person's own (`hand`).
 */
const ROOT_SHOULDER: [number, number] = [0, 0];
const ROOT_REST: [number, number] = [0, 0];
/** A `HandRoot` rewritten in place, call to call. */
interface ScratchRoot {
  readonly shoulder: Pt;
  readonly rest: Pt;
  away: -1 | 1;
  breath: number;
}
const ROOT: ScratchRoot = { shoulder: ROOT_SHOULDER, rest: ROOT_REST, away: 1, breath: 0 };
const rootOf = (p: Person, side: 'far' | 'near', hand: Hand): HandRoot => {
  const [bw, bh] = buildOf(p);
  const sit = clamp(p.sit ?? 0);
  const away = AWAY[side];
  const robe = p.garment === 'robe';
  const [rx, ry] = REST[robe ? 'robe' : 'round'];
  const lap = LAP_REST.x * LAP_HALF * (robe ? 1 : 0.8);
  ROOT_SHOULDER[0] = away * SHOULDER[0] * bw;
  ROOT_SHOULDER[1] = SHOULDER[1] * bh;
  ROOT_REST[0] = away * lerp(rx, lap, sit) * bw;
  ROOT_REST[1] = lerp(ry, LAP_REST.y - SEAT * sit, sit) * bh;
  ROOT.away = away;
  ROOT.breath = breathOf(hand);
  return ROOT;
};

/** The reach, for a build: a bigger body reaches farther. */
const reachOf = ([bw, bh]: readonly [number, number]) => PERSON_HAND.radius * Math.max(bw, bh);

/**
 * Whether a hand's target lies in front of the body's middle: across the
 * garment below the shoulders, where a far hand at work must be drawn over
 * the body or be lost behind it (declared's doubt at the chest).
 */
const inFront = ([x, y]: Pt, [bw, bh]: readonly [number, number]) =>
  Math.abs(x) < 26 * bw && y > -126 * bh && y < -8 * bh;

/**
 * Whether the far hand is drawn over the body: only on its way to work in
 * front of it, and there. At rest it tucks behind, beside the hip, where
 * nothing of the body covers it.
 */
const farOver = (g: Gesture | undefined, build: readonly [number, number]) =>
  g !== undefined && g.reach > 0 && inFront(g.to, build);

/**
 * The floating hand on `side` of a person of build `build`, doing what `p`
 * gives it, drawn `over` the body or behind it, in the frame dropped `drop`
 * onto a seat of `sit`. While a check probes hands it also hands the hand
 * the body's silhouette, so the hand declares itself (`floatingHand`).
 */
const personHand = (
  ctx: CanvasRenderingContext2D,
  p: Person,
  side: 'far' | 'near',
  build: readonly [number, number],
  hand: Hand,
  over: boolean,
  sit: number,
  drop: number,
) => {
  const g = p[side];
  HAND_STYLE.radius = reachOf(build);
  HAND_STYLE.mitten = PERSON_HAND.mitten;
  const probed = probesHands(ctx);
  const kept = keptOf(g);
  if (kept <= 0 && !probed) return;
  ctx.save();
  ctx.globalAlpha *= kept;
  floatingHand(
    ctx,
    rootOf(p, side, hand),
    g,
    HAND_STYLE,
    sub(hand, side === 'near' ? 50 : 40),
    probed ? { over, body: () => bodyOf(p, sit, drop) } : undefined,
  );
  ctx.restore();
};

/** How much of a hand the figure keeps while its close-up is out (`PersonGesture.lent`): all of it, unless lent. */
const keptOf = (g: PersonGesture | undefined) => 1 - clamp(PUSH_TAKES * (g?.lent ?? 0));

/**
 * Where a person's hand on `side` is, in their units: its mitten's centre,
 * at rest or at work or on its way (something held in it rides there). The
 * breath it bobs with at rest is the person's, `hand` as `person` draws it.
 */
export const handOf = (p: Person, side: 'far' | 'near', hand: Hand): Pt => {
  const [, bh] = buildOf(p);
  const [x, y] = handAt(rootOf(p, side, hand), p[side], HAND_STYLE);
  return [x, y + SEAT * clamp(p.sit ?? 0) * bh];
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

  // The far hand behind the body (or over it, working in front of it), the near one over it.
  HAND_STYLE.skin = colours[1];
  const farFront = farOver(p.far, build);
  if (!farFront) {
    frameOf(ctx, drop);
    personHand(ctx, p, 'far', build, hand, false, sit, drop);
    ctx.restore();
  }
  // A build stretches the body from the feet; the head rides its neck.
  frameOf(ctx, 0, bw, bh);
  legs(ctx, sit, p.shade ?? C.figureShade, hand);
  ctx.restore();
  frameOf(ctx, 0, bw, bh);
  garment(ctx, p, sit, colours[0], hand);
  ctx.restore();
  frameOf(ctx, drop);
  if (farFront) personHand(ctx, p, 'far', build, hand, true, sit, drop);
  head(ctx, p, colours[1], hand, NECK[1] * (bh - 1));
  personHand(ctx, p, 'near', build, hand, true, sit, drop);
  ctx.restore();
};

/**
 * A person's silhouette in the frame their hands float in (dropped `drop`
 * onto a seat of `sit`): the garment as built and folded, and the head. What
 * a check probing hands tests a hand against for `HandHidden`; built only
 * while one probes.
 */
const bodyOf = (p: Person, sit: number, drop: number): ReadonlyArray<ReadonlyArray<Pt>> => {
  const [bw, bh] = buildOf(p);
  const robe = p.garment === 'robe';
  const [dy, sx, sy] = sit > 0 ? foldOf(robe, sit) : ([0, 1, 1] as const);
  const garment = (robe ? ROBE_SHAPE : TUNIC_SHAPE).map(([x, y]): Pt => [
    bw * sx * x,
    bh * (dy + sy * y) - drop,
  ]);
  const lift = NECK[1] * (bh - 1) + (p.nod ?? 0);
  return [garment, ellipseShape(HEAD[0], HEAD[1] + lift, HEAD_RX, HEAD_RY)];
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

// ─── recurring figures and the icon row ──────────────────────────────────────
// Figures and the icon row more than one scene draws, so a callback lands in
// the same layout (CRAFT rule 8). Each takes a `hand` for its keys, so boil
// seeds stay the scene's own. Sets live in their own modules: court.ts,
// heaven.ts, city.ts, law.ts, garden.ts, spoken.ts, gospel.ts.

/** A hand's gesture whose target and reach a scene rewrites in place every frame (scratch, so the draw allocates none). */
export interface GestureAt extends PersonGesture {
  readonly to: [number, number];
  reach: number;
  grip?: Grip;
  turn?: number;
  lent?: number;
}

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

/** Each of the three icons' value: word, robe, heart. */
export type Three = readonly [number, number, number];
const EVERY: Three = [1, 1, 1];

/**
 * Where the eye goes on the row: the one language every count and every
 * section head lights a gift in. `lead` is each icon's lead 0..1 (an
 * `outBack` cue overshoots it, so the icon pops): a leading icon grows by
 * `ICON_LEAD`, sits on a gold rim with gold light behind it, and is drawn
 * over its neighbours. `dim` 0..1 is how far every icon neither leading nor
 * lit (its glow under `ICON_KEPT`) fades back into the page, by up to
 * `ICON_DIM`.
 */
export interface IconCount {
  readonly lead: Three;
  readonly dim: number;
}
/** How much bigger the leading icon grows. */
export const ICON_LEAD = 0.55;
/** How far an unlit icon fades while the row counts. */
export const ICON_DIM = 0.62;
const NO_COUNT: IconCount = { lead: [0, 0, 0], dim: 0 };

/**
 * The film's three icons in a row centred on the origin, the answer's shape
 * (`message`): a gold word-bubble (God declares), a white robe (clothes) and
 * a heart with two tablets (changes). `lit` is each icon's glow alpha 0..1
 * (0 draws none): the turn the film is on. `shown` scales each icon about its
 * centre as it pops in (0 draws none). `count` says which icon leads and how
 * far the unlit fade (`IconCount`); by default none leads and none fades.
 */
export const icons = (
  ctx: CanvasRenderingContext2D,
  hand: Hands,
  lit: Three,
  shown: Three = EVERY,
  count: IconCount = NO_COUNT,
) => {
  const disc = (i: 0 | 1 | 2) => {
    if (shown[i] <= 0) return;
    const lead = Math.max(0, count.lead[i]);
    const fade = count.dim * ICON_DIM * clamp(1 - Math.max(lead, lit[i] / ICON_KEPT));
    ctx.save();
    ctx.globalAlpha *= 1 - fade;
    at(ctx, { x: ICON_X[i], y: 0, scale: shown[i] * (1 + ICON_LEAD * lead) }, () => {
      if (lead > 0) {
        const on = Math.min(1, lead);
        glow(ctx, 0, 0, 360, C.gold, 0.6 * on);
        piece(ctx, ellipseShape(0, 0, 172, 172), C.gold, hand(RIM_KEYS[i]), {
          role: 'scenery',
          kind: 'cut',
          line: 4,
          alpha: on,
        });
      }
      piece(ctx, ellipseShape(0, 0, 150, 150), C.paper, hand(DISC_KEYS[i]), {
        role: 'scenery',
        kind: 'cut',
        line: 6,
      });
      if (lit[i] > 0) glow(ctx, 0, 0, 260, C.glow, lit[i]);
      INNER[i]?.(ctx, hand);
    });
    ctx.restore();
  };
  // The leading icons last, over their neighbours as they grow.
  for (const i of ORDER) if (count.lead[i] <= 0) disc(i);
  for (const i of ORDER) if (count.lead[i] > 0) disc(i);
};
const ORDER = [0, 1, 2] as const;
const DISC_KEYS = ['iconWord', 'iconRobe', 'iconHeart'] as const;
const RIM_KEYS = ['iconWordRim', 'iconRobeRim', 'iconHeartRim'] as const;
const INNER: ReadonlyArray<(ctx: CanvasRenderingContext2D, hand: Hands) => void> = [
  (ctx, hand) =>
    bubble(ctx, hand('bubble'), (i) => sub(hand('lines'), i), {
      fill: C.gold,
      ink: C.ink,
      shadow: 0.35,
    }),
  (ctx, hand) =>
    at(ctx, { x: 0, y: 10, scale: 0.26 }, () =>
      piece(ctx, ROBE, C.robe, hand('iconRobeShape'), { role: 'scenery', kind: 'cut', line: 18 }),
    ),
  (ctx, hand) => heart(ctx, hand, C.cutLight, false),
];

/**
 * The icon row at the head of every section (CRAFT rule 8): one layout, so
 * every pull-back is a true callback. Centred, full size, on the glow sky
 * (`ICON_SKY`). `woman` lifts the row out of `message`'s open hand into it on
 * "order"; `spoke`, `declared` and `within` open on it, lighting their gift;
 * `centurion`, `look` and `robe` pull back to it. `close` is the row's scale
 * where a push through one icon starts or ends, the icon filling the frame.
 */
export const ICON_ROW = { x: 960, y: 540, scale: 1, close: 2.3 } as const;
export const ICON_SKY = [
  [0, C.glow],
  [1, C.peachLow],
] as const;
/** A gift lit earlier in the film, still glowing under the one the section lights. */
export const ICON_KEPT = 0.7;

/** The close-up hand's paper, lifeline and ink: the figures' own. */
const CLOSE_UP = { skin: C.figure, crease: C.figureShade, outline: C.outline } as const;
/** A `CloseDraw` rewritten in place, draw to draw. */
interface ScratchCloseDraw {
  away: -1 | 1;
  line?: number;
  detail?: number;
}
/** A close-up's draw options (scratch, so a frame allocates none). */
const CLOSE_DRAW: ScratchCloseDraw = { away: 1 };

/**
 * A figure's hand close up (the engine's `closeHand`: an open hand held out
 * palm up, seen from above, with its lifeline and joint lines), the palm's
 * middle on the origin, `CLOSE_SPAN` units heel to fingertips, floating in
 * frame with no arm: faith, the hand that takes (`look` lays the gold light
 * in its palm, `message` and `daily` the icons). `open` 1 holds it flat;
 * toward 0 the fingers bend up and back over the palm, which stays showing
 * as a cup. `side` is which of the figure's hands it is: the far one's is
 * mirrored, its thumb where that hand's own thumb lies. A close-up is only
 * ever of a figure the viewer has just seen (CRAFT rule 12): `pushedHand`
 * pushes into it from that figure's hand.
 */
export const handCloseUp = (
  ctx: CanvasRenderingContext2D,
  hand: Hands,
  open = 1,
  side: 'far' | 'near' = 'near',
  draw: { readonly line?: number; readonly detail?: number } = {},
) => {
  CLOSE_DRAW.away = AWAY[side];
  CLOSE_DRAW.line = draw.line;
  CLOSE_DRAW.detail = draw.detail;
  closeHand(ctx, open, CLOSE_UP, hand('closeHand'), CLOSE_DRAW);
};

/**
 * A close-up drawn at a figure's own hand: its scale on screen when the
 * figure stands at `figureScale`, the size of the figure's mitten.
 */
const atMitten = (figureScale: number) => (figureScale * PERSON_HAND.mitten) / CLOSE_SPAN;

/**
 * How far a push magnifies a figure drawn at `figureScale` for its hand,
 * turned palm up (`GestureAt.turn`), to become the close-up at `scale`.
 */
export const pushZoom = (figureScale: number, scale: number) => scale / atMitten(figureScale);

/** A push from a figure's palm-up hand into its close-up, and back. */
export interface HandPush {
  /** The figure's hand on screen (its palm's middle, its gesture's target) before the push. */
  readonly from: Pt;
  /** The figure's scale on screen before the push. */
  readonly figureScale: number;
  /** Where the close-up's palm's middle sits once pushed in, and its scale there. */
  readonly to: Pt;
  readonly scale: number;
}

/**
 * The close-up `into` a push from a figure's hand (0 on the figure's own
 * hand, turned palm up, 1 at `push.to`): the same shape all the way, grown
 * as the push grows the figure (by `pushZoom`) and slid onto its place, its
 * line going from the figure's to its own and its lifeline and joints coming
 * in, so it takes the figure's hand's place with no change of shape; back
 * out, the same in reverse. `holds` draws in the hand's units (the palm's
 * middle on the origin), `under` the hand and `over` it: what it holds.
 */
export const pushedHand = (
  ctx: CanvasRenderingContext2D,
  hand: Hands,
  push: HandPush,
  into: number,
  open: number,
  side: 'far' | 'near',
  holds: { readonly under?: () => void; readonly over?: () => void } = {},
) => {
  if (into <= 0) return;
  const start = atMitten(push.figureScale);
  const scale = start * (push.scale / start) ** into;
  const px = lerp(PERSON_HAND.line * push.figureScale, CLOSE_LINE * push.scale, into);
  ctx.save();
  // Over the figure's own hand at once: the two are one shape there.
  ctx.globalAlpha *= clamp(PUSH_TAKES * into);
  at(
    ctx,
    {
      x: lerp(push.from[0], push.to[0], into),
      y: lerp(push.from[1], push.to[1], into),
      scale,
    },
    () => {
      holds.under?.();
      handCloseUp(ctx, hand, open, side, into < 1 ? { line: px / scale, detail: into } : {});
      holds.over?.();
    },
  );
  ctx.restore();
};
/** How soon into a push the close-up covers the figure's hand whole. */
const PUSH_TAKES = 4;
