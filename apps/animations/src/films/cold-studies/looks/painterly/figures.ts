// The painterly look's people: stylised and exaggerated, the way a painter
// caricatures a type. Heavy heads on long faces, a jaw and a nose that carry
// the character, deep-set eyes under a hard brow, and big hands that do the
// acting. Both are seen in profile, as a stage would show them: the accused
// facing right toward the bench, the judge facing left down at them. Every
// form is painted with the brush (`brush.ts`) and modelled by its light: a
// face's planes are bumps of light and hollows of shade in its tone, lit warm
// from the lamps in front, rimmed cool from the windows behind. Ink is kept
// for features (brows, lids, nostrils, mouths, knuckles); the oil pass adds
// the rest.
//
// A head is drawn facing right in its own units, its origin where the neck
// meets the skull; `flip` turns it to face left.

import { type Hand, stroke, sub } from '@bible/film/canvas';
import { clamp, lerp } from '@bible/film/core';
import {
  type Easel,
  type Shape,
  boxOf,
  curve,
  oval,
  paint,
  paintAt,
  shade,
  within,
} from './brush.ts';
import { P, R, type Ramp } from './palette.ts';

type Pt = readonly [number, number];
type Pts = ReadonlyArray<Pt>;

/** A rise of light (or, below zero, a hollow of shade) on a form: where, how wide, how much. */
type Bump = readonly [x: number, y: number, r: number, amount: number];

/** A face's drawing: its silhouette and hair, its planes, and where its features sit. */
interface Head {
  readonly sil: Pts;
  readonly hair: Pts;
  readonly ear: Pt;
  readonly eye: Pt;
  readonly brow: Pts;
  readonly nostril: Pts;
  readonly mouth: Pts;
  readonly folds: ReadonlyArray<Pts>;
  /** The planes: brow, cheekbone and nose ridge catching the light; socket and cheek in shade. */
  readonly bumps: ReadonlyArray<Bump>;
  readonly skin: Ramp;
  readonly hairRamp: Ramp;
  /** Stubble along the jaw: the jaw's outline, painted thin in the hair's colour. */
  readonly stubble?: Pts;
  readonly seed: number;
}

/** The accused: gaunt and long-faced, a big nose, a heavy chin, lank dark hair falling over the brow. */
const ACCUSED_HEAD: Head = {
  sil: [
    [0, -188],
    [40, -180],
    [66, -156],
    [76, -126],
    [80, -113],
    [72, -104],
    [80, -92],
    [94, -72],
    [108, -56],
    [98, -49],
    [84, -49],
    [88, -40],
    [80, -33],
    [84, -26],
    [76, -16],
    [84, -3],
    [72, 9],
    [40, 6],
    [12, -10],
    [-22, -18],
    [-46, -30],
    [-66, -70],
    [-72, -122],
    [-56, -166],
    [-28, -186],
  ],
  hair: [
    [44, -184],
    [62, -168],
    [70, -146],
    [56, -154],
    [52, -134],
    [40, -150],
    [26, -128],
    [18, -146],
    [6, -116],
    [-2, -128],
    [-10, -100],
    [-26, -98],
    [-32, -76],
    [-40, -52],
    [-50, -66],
    [-58, -40],
    [-66, -62],
    [-80, -84],
    [-82, -124],
    [-70, -166],
    [-44, -194],
    [-8, -204],
    [24, -198],
  ],
  ear: [-14, -94],
  eye: [58, -100],
  brow: [
    [38, -118],
    [58, -123],
    [80, -115],
  ],
  nostril: [
    [80, -58],
    [88, -54],
    [94, -56],
  ],
  mouth: [
    [58, -34],
    [70, -36],
    [82, -32],
  ],
  folds: [
    [
      [72, -70],
      [64, -52],
      [66, -40],
    ],
    [
      [40, -86],
      [52, -76],
      [62, -76],
    ],
  ],
  bumps: [
    [60, -128, 22, 0.16],
    [54, -78, 18, 0.18],
    [94, -74, 12, 0.22],
    [76, -6, 14, 0.12],
    [58, -100, 22, -0.34],
    [44, -56, 24, -0.2],
    [30, -20, 30, -0.15],
  ],
  skin: R.skin,
  hairRamp: R.hair,
  stubble: [
    [84, -24],
    [82, 0],
    [70, 10],
    [40, 8],
    [14, -8],
    [10, -30],
    [40, -30],
    [70, -20],
  ],
  seed: 300,
};

/** The judge: older and heavier, a hooked nose, jowls, a high bald brow with grey hair swept back. */
const JUDGE_HEAD: Head = {
  sil: [
    [0, -198],
    [46, -192],
    [74, -168],
    [86, -136],
    [90, -120],
    [80, -110],
    [88, -98],
    [102, -80],
    [116, -56],
    [104, -50],
    [90, -50],
    [94, -40],
    [86, -32],
    [90, -24],
    [82, -12],
    [90, 4],
    [82, 22],
    [50, 28],
    [18, 10],
    [-20, -12],
    [-50, -30],
    [-72, -78],
    [-78, -132],
    [-60, -178],
    [-30, -196],
  ],
  hair: [
    [-4, -186],
    [-24, -174],
    [-30, -150],
    [-20, -132],
    [-30, -112],
    [-26, -96],
    [-40, -76],
    [-44, -50],
    [-56, -30],
    [-66, -46],
    [-76, -38],
    [-80, -70],
    [-88, -104],
    [-84, -148],
    [-66, -186],
    [-36, -204],
  ],
  ear: [-18, -96],
  eye: [62, -104],
  brow: [
    [40, -124],
    [62, -131],
    [86, -121],
  ],
  nostril: [
    [84, -58],
    [94, -54],
    [100, -57],
  ],
  mouth: [
    [56, -32],
    [72, -35],
    [86, -30],
  ],
  folds: [
    [
      [76, -72],
      [62, -46],
      [64, -24],
    ],
    [
      [44, -160],
      [72, -158],
    ],
    [
      [40, -148],
      [72, -146],
    ],
    [
      [50, -88],
      [64, -84],
      [78, -86],
    ],
    [
      [54, -6],
      [48, 12],
    ],
  ],
  bumps: [
    [44, -170, 34, 0.14],
    [64, -134, 22, 0.14],
    [104, -78, 12, 0.22],
    [52, -80, 18, 0.14],
    [80, 8, 18, 0.1],
    [62, -104, 24, -0.36],
    [40, -40, 30, -0.18],
    [20, 6, 30, -0.18],
  ],
  skin: ['#2b3133', '#544b46', '#86664f', '#ba8a62', '#e3b98a'],
  hairRamp: ['#2a3030', '#4a5250', '#6f7672', '#959a91', '#c4c3b2'],
  seed: 400,
};

/** How a face is acting: its eyes shut (0 open), where it looks (-1 down, 1 up), and the gold light on it. */
interface Mood {
  readonly shut: number;
  readonly look: number;
  readonly gold: number;
}

const smooth01 = (v: number) => {
  const k = clamp(v);
  return k * k * (3 - 2 * k);
};

/** The light the bumps add at (x, y). */
const bumped = (bumps: ReadonlyArray<Bump>, x: number, y: number) => {
  let sum = 0;
  for (const [bx, by, r, a] of bumps) {
    const d2 = ((x - bx) ** 2 + (y - by) ** 2) / (r * r);
    if (d2 < 4) sum += a * Math.exp(-d2);
  }
  return sum;
};

/** Three points as a smooth line of `n` steps (a quadratic through the middle one). */
const bend = (pts: Pts, n = 8): Array<[number, number]> => {
  const [a = [0, 0], b = a, c = b] = pts;
  if (pts.length === 2)
    return [
      [a[0], a[1]],
      [b[0], b[1]],
    ];
  const out: Array<[number, number]> = [];
  // Through b at t = 0.5: the control point pulled out to meet it.
  const cx = 2 * b[0] - (a[0] + c[0]) / 2;
  const cy = 2 * b[1] - (a[1] + c[1]) / 2;
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    out.push([
      (1 - t) * (1 - t) * a[0] + 2 * (1 - t) * t * cx + t * t * c[0],
      (1 - t) * (1 - t) * a[1] + 2 * (1 - t) * t * cy + t * t * c[1],
    ]);
  }
  return out;
};

/** A line of ink: a feature, tapered, still (no boil: the painting holds). */
const ink = (ctx: CanvasRenderingContext2D, pts: Pts, width: number, hand: Hand, alpha = 1) =>
  stroke(
    ctx,
    bend(pts),
    { color: P.ink, width, taper: 0.45, jitter: 0, boil: 'none', alpha },
    hand,
  );

/** A head, painted in its own units: skin modelled by its planes and the light in front, the features in ink, the hair. */
const head = (e: Easel, d: Head, m: Mood, hand: Hand) => {
  const { ctx } = e;
  const silBox = boxOf(d.sil, 4);
  // Warm light on the front plane, the side plane falling into teal shade, a cool rim behind.
  const light = (x: number, y: number) =>
    0.06 +
    0.56 * smooth01((x + 10) / 110) -
    0.18 * clamp((y + 20) / 30) +
    0.3 * smooth01((-x - 52) / 18) +
    bumped(d.bumps, x, y);
  paint(e, curve(d.sil), {
    ramp: d.skin,
    box: silBox,
    seed: d.seed,
    dir: -1.2,
    spread: 0.35,
    size: 9,
    ratio: 0.32,
    jitter: 0.06,
    // A cool green broken into the flesh, as a painter cools a half-tone: sparingly, or it reads as grime.
    accent: { color: '#9aa894', share: 0.03 },
    tone: light,
  });
  if (d.stubble !== undefined) shade(ctx, curve(d.stubble), d.hairRamp[0], 0.28);
  if (m.gold > 0) {
    ctx.save();
    ctx.beginPath();
    curve(d.sil)(ctx);
    ctx.clip();
    ctx.globalCompositeOperation = 'screen';
    const g = ctx.createLinearGradient(112, 0, -10, 0);
    g.addColorStop(0, `rgba(240,192,96,${0.9 * m.gold})`);
    g.addColorStop(1, 'rgba(240,192,96,0)');
    ctx.fillStyle = g;
    ctx.fillRect(silBox.x, silBox.y, silBox.w, silBox.h);
    ctx.restore();
  }
  // The ear.
  const [ex, ey] = d.ear;
  paint(e, oval(ex, ey, 14, 25, 0.15), {
    ramp: d.skin,
    box: { x: ex - 16, y: ey - 27, w: 32, h: 54 },
    seed: d.seed + 20,
    dir: -1.4,
    size: 6,
    tone: (x) => 0.22 + 0.3 * clamp((x - ex + 10) / 24),
  });
  ink(
    ctx,
    [
      [ex + 6, ey - 14],
      [ex - 6, ey - 4],
      [ex + 2, ey + 14],
    ],
    2.4,
    sub(hand, 1),
    0.8,
  );
  // The eye: its white dull in the socket's shade, the iris looking, the lid closing over it.
  const [eyx, eyy] = d.eye;
  ctx.save();
  ctx.beginPath();
  oval(eyx, eyy, 9.5, 5.5)(ctx);
  ctx.clip();
  ctx.fillStyle = '#8f8a78';
  ctx.fillRect(eyx - 12, eyy - 8, 24, 16);
  ctx.fillStyle = P.ink;
  ctx.beginPath();
  oval(eyx + 4.5, eyy - 1.2 * m.look, 4.4, 4.4)(ctx);
  ctx.fill();
  const lid = clamp(m.shut);
  ctx.fillStyle = paintAt(d.skin, 0.3);
  ctx.fillRect(eyx - 12, eyy - 8, 24, 3 + 13 * lid);
  ctx.restore();
  ink(
    ctx,
    [
      [eyx - 10, eyy - 3 + 8 * lid],
      [eyx, eyy - 6 + 11 * lid],
      [eyx + 10, eyy - 2 + 6 * lid],
    ],
    3,
    sub(hand, 2),
  );
  ink(
    ctx,
    [
      [eyx - 7, eyy + 7],
      [eyx + 1, eyy + 9],
      [eyx + 9, eyy + 5],
    ],
    1.4,
    sub(hand, 3),
    0.45,
  );
  // Brow, nostril, mouth and the lines of the face.
  const [b0 = [0, 0], b1 = b0, b2 = b1] = d.brow;
  ink(ctx, [b0, [b1[0], b1[1] + 4 * m.shut], b2], 8, sub(hand, 4));
  ink(ctx, d.nostril, 3, sub(hand, 5));
  ink(ctx, d.mouth, 3.6, sub(hand, 6));
  for (const [i, fold] of d.folds.entries()) ink(ctx, fold, 1.8, sub(hand, 10 + i), 0.45);
  // The hair, laid in long strokes swept back, its ends breaking the silhouette.
  paint(e, curve(d.hair, 0.55), {
    ramp: d.hairRamp,
    box: boxOf(d.hair, 4),
    seed: d.seed + 30,
    dir: 2.2,
    spread: 0.2,
    size: 16,
    ratio: 0.18,
    jitter: 0.1,
    turn: (x) => -0.5 * smooth01((x + 20) / 80),
    tone: (x, y) =>
      0.12 +
      0.4 * smooth01((x + 30) / 100) +
      0.3 * smooth01((-x - 62) / 16) +
      0.12 * clamp((-y - 180) / 20),
  });
};

/** A limb's outline: a sleeve along `pts`, `w0` wide at its start and `w1` at its end. */
const limb = (pts: Pts, w0: number, w1: number): Shape => {
  const left: Array<[number, number]> = [];
  const right: Array<[number, number]> = [];
  for (const [i, [x, y]] of pts.entries()) {
    const [px, py] = pts[Math.max(0, i - 1)] ?? [x, y];
    const [nx, ny] = pts[Math.min(pts.length - 1, i + 1)] ?? [x, y];
    const dx = nx - px;
    const dy = ny - py;
    const l = Math.hypot(dx, dy) || 1;
    const w = lerp(w0, w1, i / Math.max(1, pts.length - 1)) / 2;
    left.push([x - (dy / l) * w, y + (dx / l) * w]);
    right.push([x + (dy / l) * w, y - (dx / l) * w]);
  }
  return curve([...left, ...right.reverse()], 0.7);
};

/** A sleeve painted along shoulder, elbow and wrist, lit on its forward side. */
const sleeve = (
  e: Easel,
  pts: Pts,
  w0: number,
  w1: number,
  ramp: Ramp,
  seed: number,
  lit: number,
) =>
  paint(e, limb(pts, w0, w1), {
    ramp,
    box: boxOf(pts, Math.max(w0, w1)),
    seed,
    dir: Math.atan2(
      (pts[1]?.[1] ?? 0) - (pts[0]?.[1] ?? 0),
      (pts[1]?.[0] ?? 0) - (pts[0]?.[0] ?? 0),
    ),
    spread: 0.2,
    size: 12,
    tone: (x) => 0.1 + lit * smooth01((x - (pts[0]?.[0] ?? 0) + 10) / 110),
  });

/** A big fist round a bar running along x (a rail, a handle), seen from its side, knuckles forward. */
const fist = (e: Easel, skin: Ramp, seed: number, hand: Hand, lit: number) => {
  const { ctx } = e;
  const f: Pts = [
    [-44, -26],
    [-10, -38],
    [30, -34],
    [44, -18],
    [48, 6],
    [40, 30],
    [14, 38],
    [-28, 34],
    [-50, 8],
  ];
  paint(e, curve(f, 0.45), {
    ramp: skin,
    box: boxOf(f, 4),
    seed,
    dir: -0.8,
    size: 8,
    jitter: 0.05,
    tone: (x, y) =>
      0.12 +
      lit * smooth01((x + 30) / 80) -
      0.15 * clamp(y / 36) +
      0.12 * Math.exp(-(((x - 34) / 10) ** 2) - ((y + 6) / 18) ** 2),
  });
  for (const [i, x] of [8, 22, 36].entries())
    ink(
      ctx,
      [
        [x - 5, -10],
        [x, 10],
        [x - 3, 32],
      ],
      2.4,
      sub(hand, i),
      0.8,
    );
  const thumb: Pts = [
    [-18, -44],
    [30, -42],
    [36, -30],
    [-12, -26],
  ];
  paint(e, curve(thumb, 0.8), {
    ramp: skin,
    box: boxOf(thumb, 2),
    seed: seed + 5,
    dir: 0,
    size: 7,
    tone: (x) => 0.15 + lit * smooth01((x + 10) / 50),
  });
  ink(
    ctx,
    [
      [26, -40],
      [32, -36],
      [34, -30],
    ],
    2,
    sub(hand, 9),
    0.7,
  );
};

/** A broad hand laid flat on the bench, fingers forward, seen from the side. */
const flat = (e: Easel, skin: Ramp, seed: number, hand: Hand, lit: number) => {
  const { ctx } = e;
  const f: Pts = [
    [-70, -2],
    [-34, -30],
    [28, -28],
    [84, -12],
    [96, 0],
    [-70, 4],
  ];
  paint(e, curve(f, 0.8), {
    ramp: skin,
    box: boxOf(f, 4),
    seed,
    dir: 0,
    spread: 0.2,
    size: 8,
    tone: (x, y) => 0.12 + lit * smooth01((x + 40) / 120) - 0.1 * clamp((y + 20) / 20),
  });
  for (const [i, x] of [40, 56, 72].entries())
    ink(
      ctx,
      [
        [x - 20, -16 + i * 2],
        [x, -7],
        [x + 16, -2],
      ],
      1.8,
      sub(hand, i),
      0.7,
    );
};

/** The accused's pose: head bowed (0 up, 1 down), lifted at the verdict, the gold of it on the face, their breath. */
export interface AccusedPose {
  readonly bow: number;
  readonly lift: number;
  readonly gold: number;
  readonly breath: number;
}

/** Where the accused's neck meets the skull, in the world, and the figure's scale. */
export const ACCUSED = { x: 540, y: 500, scale: 0.88 } as const;

/** The accused's arms, in the figure's own units: shoulder, elbow, wrist, the near arm and the far. */
const ARM_NEAR: Pts = [
  [-34, 66],
  [-14, 192],
  [86, 254],
];
const ARM_FAR: Pts = [
  [-34, 54],
  [-10, 180],
  [150, 250],
];

/** The accused, standing in the dock facing the bench: body and head (the hands are `accusedHands`, over the dock). */
export const accused = (e: Easel, p: AccusedPose, hand: Hand) => {
  const slump = 0.06 * p.bow * (1 - p.lift);
  within(e, { x: ACCUSED.x, y: ACCUSED.y, scale: ACCUSED.scale }, (b) => {
    sleeve(b, ARM_FAR, 46, 36, R.coat, 310, 0.25);
    within(b, { x: 0, y: 300, rot: slump }, (t) => {
      t.ctx.translate(0, -300 - 3 * p.breath);
      const coat: Pts = [
        [-18, 2],
        [-66, 14],
        [-112, 46],
        [-134, 104],
        [-138, 210],
        [-132, 340],
        [96, 340],
        [102, 236],
        [96, 132],
        [82, 66],
        [56, 28],
        [22, 12],
      ];
      paint(t, curve(coat, 0.8), {
        ramp: R.coat,
        box: boxOf(coat, 4),
        seed: 320,
        dir: -1.3,
        spread: 0.3,
        size: 15,
        jitter: 0.1,
        accent: { color: '#5b4e36', share: 0.06 },
        // Dark against the window behind, lamplight on the chest, a cool rim down the back.
        tone: (x, y) =>
          0.04 +
          0.34 * smooth01((x + 10) / 120) +
          0.5 * smooth01((-x - 118) / 18) -
          0.08 * clamp((y - 200) / 150),
      });
      // The coat's folds: shade down from the shoulder blade and under the arm.
      shade(
        t.ctx,
        curve(
          [
            [-90, 70],
            [-70, 60],
            [-60, 200],
            [-84, 330],
            [-104, 220],
          ],
          0.8,
        ),
        P.gloom,
        0.35,
      );
      // The shirt at the open coat, the stain spread on it.
      const shirt: Pts = [
        [22, 12],
        [56, 28],
        [76, 92],
        [72, 176],
        [44, 120],
        [20, 44],
      ];
      paint(t, curve(shirt, 0.8), {
        ramp: R.shirt,
        box: boxOf(shirt, 2),
        seed: 330,
        dir: -1.4,
        size: 9,
        tone: (x) => 0.2 + 0.5 * smooth01((x - 10) / 60),
      });
      const stain: Pts = [
        [46, 70],
        [64, 62],
        [76, 88],
        [74, 128],
        [62, 156],
        [52, 128],
        [40, 100],
      ];
      paint(t, curve(stain, 0.9), {
        ramp: ['#3e0d0b', '#5e1410', P.scarlet, '#b3261c', '#c8402e'],
        box: boxOf(stain, 2),
        seed: 331,
        dir: -1.5,
        size: 7,
        tone: (x) => 0.25 + 0.4 * smooth01((x - 40) / 30),
      });
      // The coat's lapel, folded back over the shirt.
      const lapel: Pts = [
        [18, 10],
        [48, 30],
        [58, 90],
        [40, 70],
        [22, 40],
      ];
      paint(t, curve(lapel, 0.7), {
        ramp: R.coat,
        box: boxOf(lapel, 2),
        seed: 335,
        dir: -1.2,
        size: 10,
        tone: (x) => 0.2 + 0.4 * smooth01((x - 20) / 40),
      });
      // The coat's collar, turned up behind the neck.
      const collar: Pts = [
        [-44, 8],
        [-32, -16],
        [-6, -16],
        [14, 8],
        [-16, 28],
      ];
      paint(t, curve(collar), {
        ramp: R.coat,
        box: boxOf(collar, 2),
        seed: 340,
        dir: -1.2,
        size: 10,
        tone: (x) => 0.14 + 0.3 * smooth01((x + 30) / 50) + 0.3 * smooth01((-x - 40) / 8),
      });
      // The neck, and the head on it.
      const neck: Pts = [
        [-26, -24],
        [12, -14],
        [22, 20],
        [-18, 24],
      ];
      paint(t, curve(neck, 0.6), {
        ramp: R.skin,
        box: boxOf(neck, 2),
        seed: 350,
        dir: -1.57,
        size: 8,
        tone: (x) => 0.08 + 0.35 * smooth01((x + 10) / 40),
      });
      const tilt = -0.05 + 0.5 * p.bow * (1 - p.lift) - 0.18 * p.lift;
      within(t, { x: 0, y: 0, rot: tilt }, (h) =>
        head(
          h,
          ACCUSED_HEAD,
          { shut: p.bow * (1 - p.lift), look: lerp(-0.4, 1, p.lift), gold: p.gold },
          hand,
        ),
      );
    });
    sleeve(b, ARM_NEAR, 52, 40, R.coat, 360, 0.32);
  });
};

/** The accused's big hands round the dock's rail, drawn over the dock. */
export const accusedHands = (e: Easel, hand: Hand) =>
  within(e, { x: ACCUSED.x, y: ACCUSED.y, scale: ACCUSED.scale }, (b) => {
    within(b, { x: 172, y: 270, scale: 1.25 }, (h) => fist(h, R.skin, 370, sub(hand, 40), 0.45));
    within(b, { x: 104, y: 274, scale: 1.3 }, (h) => fist(h, R.skin, 380, sub(hand, 60), 0.6));
  });

/** The judge's pose: leaning in (0 upright, 1 over the bench), the gavel raised (0 resting, 1 up). */
export interface JudgePose {
  readonly lean: number;
  readonly raise: number;
  readonly breath: number;
}

/** Where the judge's neck meets the skull, in the world; the judge faces left, so his own +x is the world's -x. */
export const JUDGE = { x: 1500, y: 372, scale: 0.94 } as const;

/** The judge's waist, in his own units: he leans about it. */
const WAIST: Pt = [0, 270];

/** A point of the judge's upper body, as his lean carries it. */
const leaned = ([x, y]: Pt, lean: number): [number, number] => {
  const a = 0.16 * lean;
  const dx = x - WAIST[0];
  const dy = y - WAIST[1];
  return [
    WAIST[0] + dx * Math.cos(a) - dy * Math.sin(a),
    WAIST[1] + dx * Math.sin(a) + dy * Math.cos(a),
  ];
};

/** The gavel hand's grip and the gavel's turn, resting (by the block) and raised. */
const GRIP_REST: Pt = [62, 150];
const GRIP_UP: Pt = [330, -60];

/** Where the judge's gavel hand is and how the gavel is turned, as the pose has it. */
const grip = (p: JudgePose) => ({
  x: lerp(GRIP_REST[0], GRIP_UP[0], p.raise) + 16 * p.lean * (1 - p.raise),
  y: lerp(GRIP_REST[1], GRIP_UP[1], p.raise),
  rot: lerp(0.05, -1.05, p.raise),
});

/** The judge behind the bench: robe, collar, arms and head (his hands and the gavel are `judgeHands`, over the bench). */
export const judge = (e: Easel, p: JudgePose, hand: Hand) => {
  within(e, { x: JUDGE.x, y: JUDGE.y, scale: JUDGE.scale, flip: true }, (b) => {
    const g = grip(p);
    // The far arm, its hand laid on the bench.
    sleeve(b, [leaned([-60, 60], p.lean), [-110, 140], [-44, 168]], 74, 52, R.robe, 410, 0.3);
    within(b, { x: WAIST[0], y: WAIST[1], rot: 0.16 * p.lean }, (t) => {
      t.ctx.translate(-WAIST[0], -WAIST[1] - 3 * p.breath);
      const robe: Pts = [
        [-24, 6],
        [-96, 24],
        [-160, 62],
        [-188, 142],
        [-196, 280],
        [170, 280],
        [160, 142],
        [124, 62],
        [74, 22],
        [26, 10],
      ];
      paint(t, curve(robe, 0.8), {
        ramp: R.robe,
        box: boxOf(robe, 4),
        seed: 420,
        dir: -1.35,
        spread: 0.3,
        size: 16,
        // Lamplight on his front, a cool sheen on the shoulder, the rest lost in shade.
        jitter: 0.08,
        accent: { color: '#3a4a48', share: 0.08 },
        tone: (x, y) =>
          0.03 +
          0.34 * smooth01((x - 30) / 130) * (1 - 0.3 * clamp((y - 60) / 200)) +
          0.16 * Math.exp(-(((x + 90) / 70) ** 2) - ((y - 40) / 40) ** 2) +
          0.42 * smooth01((-x - 160) / 26),
      });
      // His bands: two strips of dull linen at the throat.
      const bands: Pts = [
        [24, 6],
        [52, 14],
        [60, 66],
        [44, 108],
        [28, 56],
      ];
      paint(t, curve(bands, 0.7), {
        ramp: R.shirt,
        box: boxOf(bands, 2),
        seed: 430,
        dir: -1.5,
        size: 8,
        tone: (x) => 0.25 + 0.5 * smooth01((x - 20) / 36),
      });
      // The high stiff collar, flaring behind the head.
      const collar: Pts = [
        [-64, -80],
        [-36, -48],
        [-6, -14],
        [30, 14],
        [-30, 32],
        [-84, 2],
        [-96, -44],
      ];
      paint(t, curve(collar, 0.8), {
        ramp: R.robe,
        box: boxOf(collar, 2),
        seed: 440,
        dir: -1,
        size: 11,
        tone: (x) => 0.1 + 0.4 * smooth01((x + 50) / 80),
      });
      const neck: Pts = [
        [-26, -24],
        [14, -12],
        [26, 24],
        [-20, 26],
      ];
      paint(t, curve(neck, 0.6), {
        ramp: JUDGE_HEAD.skin,
        box: boxOf(neck, 2),
        seed: 450,
        dir: -1.57,
        size: 8,
        tone: (x) => 0.08 + 0.35 * smooth01((x + 10) / 40),
      });
      within(t, { x: 0, y: 0, rot: 0.04 + 0.14 * p.lean }, (h) =>
        head(h, JUDGE_HEAD, { shut: 0.3 - 0.2 * p.lean, look: -0.4 - 0.6 * p.lean, gold: 0 }, hand),
      );
    });
    // The gavel arm, from the leaning shoulder to the grip.
    const shoulder = leaned([74, 56], p.lean);
    // Its elbow out behind the hand at rest, below the reach when the gavel is up.
    const elbow: Pt = [
      lerp(g.x + 48, (shoulder[0] + g.x) / 2 + 10, p.raise),
      lerp((g.y + shoulder[1]) / 2 + 34, (g.y + shoulder[1]) / 2 + 64, p.raise),
    ];
    sleeve(b, [shoulder, elbow, [g.x - 22, g.y + 4]], 78, 54, R.robe, 460, 0.55);
  });
};

/** The judge's hands, the gavel and its block, drawn over the bench's cornice. */
export const judgeHands = (e: Easel, p: JudgePose, hand: Hand) =>
  within(e, { x: JUDGE.x, y: JUDGE.y, scale: JUDGE.scale, flip: true }, (b) => {
    const { ctx } = b;
    within(b, { x: -44, y: 168 }, (h) => flat(h, JUDGE_HEAD.skin, 470, sub(hand, 80), 0.5));
    // The block, on the cornice before him.
    const block: Pts = [
      [100, 160],
      [158, 160],
      [162, 176],
      [96, 176],
    ];
    paint(b, curve(block, 0.4), {
      ramp: R.wood,
      box: boxOf(block, 2),
      seed: 480,
      dir: 0,
      size: 7,
      tone: (x) => 0.3 + 0.4 * smooth01((x - 90) / 60),
    });
    const g = grip(p);
    within(b, { x: g.x, y: g.y, rot: g.rot }, (h) => {
      // The handle, and the head at its end, striking down.
      const handle: Pts = [
        [-30, -5],
        [74, -6],
        [74, 6],
        [-30, 5],
      ];
      paint(h, curve(handle, 0.3), {
        ramp: R.wood,
        box: boxOf(handle, 2),
        seed: 490,
        dir: 0,
        size: 6,
        tone: () => 0.45,
      });
      const mallet: Pts = [
        [62, -22],
        [92, -22],
        [98, 0],
        [92, 22],
        [62, 22],
        [58, 0],
      ];
      paint(h, curve(mallet, 0.5), {
        ramp: R.wood,
        box: boxOf(mallet, 2),
        seed: 491,
        dir: 1.57,
        size: 7,
        tone: (x, y) => 0.25 + 0.5 * smooth01((-y + 20) / 40) + 0.1 * smooth01((x - 54) / 40),
      });
      ctx.fillStyle = R.brass[2];
      ctx.fillRect(64, -23, 5, 46);
      ctx.fillRect(86, -23, 5, 46);
      within(h, { x: 0, y: 0, scale: 1.2 }, (k) =>
        fist(k, JUDGE_HEAD.skin, 495, sub(hand, 90), 0.55),
      );
    });
  });
