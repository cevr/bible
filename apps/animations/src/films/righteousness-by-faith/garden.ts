// What grows: the fig leaves we sew (`mirror`), the film's one tree (the
// garden's in `mirror`, the dawn's in `spoken`, the Sabbath field's), and the
// field the figure rests in on the Sabbath.

import {
  type Hand,
  type Pt,
  at,
  ellipseShape,
  line,
  spline,
  stroke,
  sub,
  blob,
  glow,
  rounded,
  sky,
} from '@bible/film/canvas';
import { type Key, clamp, hash2, keys, lerp } from '@bible/film/core';
import { C, CHEST, type Person, person, piece, type Hands } from './kit.ts';

/** A fig leaf, stem at (0, 0), pointing up, about 60 units long at size 1. */
const leafShape = (s: number, seed: number): Pt[] =>
  spline(
    Array.from({ length: 15 }, (_, i): Pt => {
      const a = (2 * Math.PI * i) / 15 - Math.PI / 2;
      const lobes =
        0.72 + 0.28 * Math.abs(Math.cos(2.5 * (a + Math.PI / 2))) + 0.06 * hash2(i, seed);
      return [Math.cos(a) * 28 * s * lobes, -30 * s + Math.sin(a) * 32 * s * lobes];
    }),
    5,
    true,
  );

/**
 * A fig-leaf apron over a person's garment (in the person's units): `count`
 * leaves shown, `droop` 0..1 wilts them brown and lets them hang.
 */
const APRON: ReadonlyArray<readonly [number, number, number]> = [
  [-16, -44, -0.3],
  [18, -46, 0.35],
  [0, -84, 0.05],
  [-24, -100, -0.5],
  [26, -98, 0.55],
  [2, -28, 0.1],
];

export const apron = (
  ctx: CanvasRenderingContext2D,
  hand: Hand,
  count: number,
  droop = 0,
  stitch = 1,
) => {
  const color = droop > 0.5 ? C.leafDry : C.leaf;
  APRON.forEach(([x, y, rot], i) => {
    const shown = Math.max(0, Math.min(1, count - i));
    if (shown <= 0) return;
    const hang = droop * (6 + 5 * hash2(i, 3));
    at(
      ctx,
      {
        x,
        y: y + 30 + hang,
        rot: rot + droop * (0.5 - hash2(i, 5)) * 1.4,
        scale: shown * (1 - 0.15 * droop),
      },
      () =>
        piece(ctx, leafShape(0.8, i), color, sub(hand, 90 + i), {
          role: 'figure',
          line: 2.5,
          shadow: 0.25,
        }),
    );
    // The seams, stained where they are sewn.
    if (i > 0 && shown >= 1 && stitch > 0)
      stroke(
        ctx,
        line([x - 8, y + 28 + hang], [x + 8, y + 22 + hang]),
        { color: C.scarlet, width: 3, jitter: 0.6, alpha: stitch, boil: 'crawl' },
        sub(hand, 110 + i),
      );
  });
};

/** A tree's shape: every tree in the film is this one tree at another size. */
interface Tree {
  /** The trunk's height and width. */
  readonly height: number;
  readonly trunk: number;
  /** How many leaf lobes ring the crown, and how far they sit from its centre. */
  readonly lobes: number;
  readonly spread: number;
  /** The lobes' two colours, alternating from the back. */
  readonly leaves: readonly [string, string];
  /** The trunk's board. */
  readonly bark?: string;
  /** Turns the ring of lobes and reseeds their shapes, so neighbours differ. */
  readonly seed?: number;
  /** 0..1: the trunk climbs over 0–0.6, then the crown opens out of it over 0.4–1. */
  readonly grow?: number;
}

/** The trunk climbs over the first 0.6 of a tree's growth. */
const TRUNK: ReadonlyArray<Key> = [
  [0, 0],
  [0.6, 1, 'outCubic'],
];
/** The crown opens out of it over the last 0.6, a settling pop. */
const CROWN: ReadonlyArray<Key> = [
  [0.4, 0],
  [1, 1, 'outBack'],
];

/**
 * A tree, feet at (0, 0): a board trunk and a crown of leaf lobes ringed
 * around its top, each lobe about 2 × `spread` wide.
 */
export const tree = (ctx: CanvasRenderingContext2D, hand: Hand, t: Tree) => {
  const seed = t.seed ?? 0;
  const grow = t.grow ?? 1;
  const height = t.height * keys(grow, TRUNK);
  if (height <= 0) return;
  piece(
    ctx,
    rounded(0, -height / 2, t.trunk, height, t.trunk * 0.3),
    t.bark ?? C.boardShade,
    sub(hand, seed),
    { role: 'scenery', line: 3, torn: 2, shadow: 0.4 },
  );
  const crown = keys(grow, CROWN);
  if (crown <= 0) return;
  const s = t.spread;
  at(ctx, { x: 0, y: -height - 0.57 * s, scale: crown }, () => {
    for (let i = 0; i < t.lobes; i++) {
      const a = (i / t.lobes) * Math.PI * 2 + seed;
      piece(
        ctx,
        blob(Math.cos(a) * s, Math.sin(a) * 0.64 * s, 2.15 * s, 1.7 * s, seed * 10 + i),
        t.leaves[i % 2] ?? C.leaf,
        sub(hand, seed * 10 + i + 1),
        { role: 'scenery', line: 3, torn: 2 },
      );
    }
  });
};

// ─── the path ahead ──────────────────────────────────────────────────────────

/**
 * The path ahead, near left to far right, and the hill it climbs, in its
 * view's units: `within`'s `second` panel, and the view from `daily`'s window.
 */
export const PATH_AHEAD: ReadonlyArray<Pt> = [
  [-360, 250],
  [-180, 200],
  [-40, 110],
  [110, 40],
  [260, -60],
  [380, -130],
];
export const PATH_HILL = blob(0, 260, 1100, 420, 31);

/** Where the path ahead is at `t` 0..1 along it, written into `out`. */
export const alongPath = (t: number, out: [number, number]): [number, number] => {
  const k = clamp(t) * (PATH_AHEAD.length - 1);
  const i = Math.min(PATH_AHEAD.length - 2, Math.floor(k));
  const a = PATH_AHEAD[i] ?? PATH_AHEAD[0] ?? out;
  const b = PATH_AHEAD[i + 1] ?? a;
  out[0] = lerp(a[0], b[0], k - i);
  out[1] = lerp(a[1], b[1], k - i);
  return out;
};

// ─── the Sabbath field ───────────────────────────────────────────────────────

/** The resting figure's default: plain grey paper. */
const PAPER: Person = {};

/**
 * The Sabbath rest (Heb 4:10), full frame: a cardboard field at golden hour,
 * tools set down, the figure leaning against a tree with its face to the low
 * sun. `settle` 0..1 eases the push-in back to rest; `rest` 0..1 settles the
 * figure and swells the sun. `dress` is what the figure wears (grey paper
 * unless given) and `lit` 0..1 glows the heart in their chest: `daily`'s
 * Sabbath, the robed figure from `robe` at rest.
 */
export const restingField = (
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  hand: Hands,
  settle: number,
  rest: number,
  dress: Person = PAPER,
  lit = 0,
) => {
  sky(ctx, w, h, [
    [0, C.peachTop],
    [0.6, C.peachLow],
    [1, C.glow],
  ]);
  at(ctx, { x: 960, y: 540, scale: lerp(1.12, 1, settle) }, () => {
    at(ctx, { x: -960, y: -540 }, () => {
      glow(ctx, 1500, 700, 520 + 80 * rest, C.glow, 0.9);
      piece(ctx, ellipseShape(1500, 700, 70, 70), C.gold, hand('sun'), {
        role: 'scenery',
        line: 0,
      });
      piece(ctx, blob(1300, 900, 2200, 420, 51), C.boardLight, hand('hillFar'), {
        role: 'scenery',
        line: 0,
        shadow: 0.3,
      });
      piece(ctx, blob(700, 1000, 2000, 360, 52), C.leaf, hand('field'), {
        role: 'scenery',
        line: 0,
        shadow: 0.4,
      });
      // Tools set down: a hoe on the ground, a basket beside it.
      at(ctx, { x: 1060, y: 915, rot: -0.12 }, () =>
        piece(ctx, rounded(0, 0, 300, 12, 5), C.boardDeep, hand('hoe'), {
          role: 'scenery',
          kind: 'cut',
          line: 2,
        }),
      );
      piece(ctx, rounded(918, 902, 26, 44, 4), C.inkSoft, hand('hoeBlade'), {
        role: 'scenery',
        kind: 'cut',
        line: 2,
      });
      piece(ctx, rounded(1230, 880, 130, 80, 30), C.board, hand('basket'), {
        role: 'scenery',
        kind: 'cut',
        line: 3,
      });
      at(ctx, { x: 640, y: 935, scale: 1.6 }, () =>
        tree(ctx, hand('tree'), {
          height: 300,
          trunk: 60,
          lobes: 4,
          spread: 90,
          leaves: [C.leaf, C.leafPale],
        }),
      );
      // Leaning back against the trunk, face to the low sun.
      at(ctx, { x: 712, y: 935, scale: 1.9, rot: -0.13 }, () => {
        person(
          ctx,
          {
            tilt: lerp(0.05, -0.1, rest),
            nod: lerp(2, -2, rest),
            look: [lerp(2, 3, rest), lerp(1, -1, rest)],
            browL: lerp(0, 1, rest),
            browR: lerp(0, 1, rest),
            browTilt: 0,
            ...dress,
          },
          hand('rester'),
        );
        if (lit > 0) glow(ctx, CHEST[0], CHEST[1], 90, C.glow, lit);
      });
    });
  });
};
