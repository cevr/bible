// The two courts. The cold open's (`cold`), whose layout the landing rebuilds
// in cardboard (`name`, `thesis`); and the heavenly court of Zech 3
// (`accuser`, `robe`), where `accuser` ends on the exact frame `robe` opens
// on. Every place is in 1920×1080 frame units.

import {
  type Camera,
  type Hand,
  type Pt,
  type WriteOptions,
  at,
  ellipseShape,
  line,
  multiplane,
  probePlate,
  rectShape,
  stroke,
  write,
  sub,
} from '@bible/film/canvas';
import { type Key, lerp } from '@bible/film/core';
import {
  C,
  F,
  type Hands,
  type Person,
  blob,
  christ,
  contact,
  glow,
  person,
  piece,
  rounded,
  sky,
  mix,
  turban,
} from './kit.ts';

// ─── the cold open's court, and the landing's ───────────────────────────────

/** The cold open's framings: where the camera rests, and wide with paper above the bench for the question. */
export const REST: Camera = { x: 930, y: 560, zoom: 1.35 };
export const WIDE: Camera = { x: 930, y: 480, zoom: 1.3 };

/** Where the accused stands, where the Advocate stands at the landing, the judge and his gavel. */
export const ACCUSED: Pt = [640, 860];
export const ADVOCATE: Pt = [820, 860];
export const JUDGE: Pt = [1180, 350];
export const GAVEL: Pt = [1330, 445];

/** The grey figure's stains, in the person's units: each blob's centre, size and seed (`cold`, `exchange`, `declared`). */
export const FIGURE_STAIN_SPOTS = [
  [10, -76, 30, 38, 7],
  [-14, -52, 14, 16, 11],
] as const;
export const FIGURE_STAINS = FIGURE_STAIN_SPOTS.map(([x, y, w, h, seed]) => blob(x, y, w, h, seed));

/** The gavel's angle at rest, and where the landing's soft fall leaves it (`name` to `thesis`). */
export const GAVEL_REST = 0.35;
export const GAVEL_DOWN = 1.45;
/** The verdict label's scale across its `stamp` cue: in large, a small give, settled (`cold`, `name`). */
export const STAMP_POP: ReadonlyArray<Key> = [
  [0, 1.2],
  [0.6, 0.97, 'outCubic'],
  [1, 1, 'inOutCubic'],
];

/** Job's question, where the cold open wrote it: the only words on screen (`cold`, `name`, `thesis`). */
const QUESTION = 'How should man be just with God?';
const QUESTION_AT: Pt = [960, 205];
const questionStyle = {
  family: F.display,
  size: 84,
  weight: 600,
  color: C.ink,
  align: 'center',
} as const;
export const question = (ctx: CanvasRenderingContext2D, hand: Hand, opts: WriteOptions) =>
  write(ctx, QUESTION, QUESTION_AT[0], QUESTION_AT[1], questionStyle, hand, {
    boil: 0.4,
    ...opts,
  });

// The cold open's layout rebuilt in cardboard under the landing sky: the
// figure stands where they stood, now in the white robe, and Christ stands
// beside them as Advocate.

/** Christ as Advocate at the landing (`name`, `thesis`): his brows and hands; the scene gives his turn and look. */
export const ADVOCATE_POSE: Person = { browTilt: 0.15, handL: [-86, -104], handR: [30, -58] };

/**
 * The figure as the verdict lands: turned to the Advocate, smiling. `name`
 * ends on it and `thesis` starts from it, so the cut between them holds.
 */
export const FIGURE_LANDED = {
  tilt: -0.05,
  look: [3, 0],
  browL: 2,
  browR: 2,
  smile: 0.7,
} as const satisfies Person;

export interface Court {
  readonly cam: Camera;
  /** The gavel's angle, radians: 0.35 at rest, about 1.6 down. */
  readonly swing: number;
  /** The verdict label: 0 gone, 1 stamped; `pop` its scale. */
  readonly stamp: number;
  readonly pop: number;
  /** The bench's gold: 0 cardboard, 1 glowing. */
  readonly gold: number;
  /** The robe's own glow. */
  readonly shine: number;
  readonly figure: Person;
  readonly advocate: Person;
}

export const landingCourt = (
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  hand: Hands,
  s: Court,
) =>
  multiplane(
    ctx,
    s.cam,
    w,
    h,
    [
      {
        // The court's pillars and floor, in chipboard.
        z: 1.35,
        draw: () => {
          for (const [x, k] of [
            [300, 1],
            [1580, 2],
          ] as const)
            piece(ctx, rectShape(x, 80, 200, 800), C.boardLight, hand(`pillar${k}`), {
              line: 0,
              torn: 3,
              shadow: 0.3,
            });
          piece(ctx, rectShape(-400, 868, 2700, 400), C.boardShade, hand('floor'), {
            line: 0,
            torn: 5,
            shadow: 0.25,
          });
        },
      },
      {
        // The bench and the judge.
        z: 1,
        draw: () => {
          contact(ctx, 1180, 860, 820);
          glow(ctx, 1180, 560, 700, C.glow, 0.9 * s.gold);
          at(ctx, { x: JUDGE[0], y: JUDGE[1] }, () => {
            piece(ctx, rounded(0, 120, 250, 120, 40), C.ink, hand('judgeRobe'));
            for (const x of [-9, 9])
              piece(ctx, rounded(x, 88, 14, 30, 3), C.paper, hand(`band${x}`), { line: 2 });
            piece(ctx, ellipseShape(0, 0, 60, 65), C.figure, hand('judgeHead'));
            ctx.fillStyle = C.outline;
            for (const x of [-22, 22]) {
              ctx.beginPath();
              ctx.ellipse(x - 6, -6, 4.5, 5.5, 0, 0, Math.PI * 2);
              ctx.fill();
            }
            // Brows at ease now, and a small smile.
            for (const side of [-1, 1] as const)
              stroke(
                ctx,
                line([side * 22 - 13, -30 + side * 2], [side * 22 + 13, -30 - side * 2]),
                { color: C.outline, width: 5, jitter: 0.3, taper: 0.2 },
                hand(`judgeBrow${side}`),
              );
            stroke(
              ctx,
              [
                [-13, 27],
                [0, 33],
                [13, 27],
              ],
              { color: C.outline, width: 4, jitter: 0.3 },
              hand('judgeMouth'),
            );
          });
          piece(ctx, rectShape(860, 475, 640, 380), mix(C.board, C.gold, s.gold), hand('bench'), {
            torn: 2,
          });
          [980, 1180, 1380].forEach((x, i) => {
            const panel = rounded(x, 680, 170, 280, 10);
            stroke(
              ctx,
              [...panel, panel[0] ?? [x, 540]],
              { color: C.boardShade, width: 3, jitter: 0.5, taper: 0 },
              hand(`panel${i}`),
            );
          });
          piece(ctx, rounded(1180, 472, 690, 34, 6), C.boardDeep, hand('rim'));
          piece(ctx, rounded(1436, 448, 76, 14, 4), C.boardDeep, hand('block'), { line: 2 });
          at(ctx, { x: GAVEL[0], y: GAVEL[1], rot: s.swing }, () => {
            piece(ctx, rounded(0, -52, 12, 100, 4), C.inkSoft, hand('handle'), { line: 2 });
            piece(ctx, rounded(0, -104, 64, 34, 8), C.boardDeep, hand('gavelHead'), {
              line: 2.5,
            });
            piece(ctx, ellipseShape(0, 0, 15, 13), C.figure, hand('gavelHand'), { line: 2.5 });
          });
          if (s.stamp > 0.01)
            at(ctx, { x: 1180, y: 672, rot: -0.07, scale: s.pop }, () => {
              ctx.save();
              ctx.globalAlpha *= Math.min(1, s.stamp);
              const label = rectShape(-250, -78, 500, 118);
              piece(ctx, label, C.cream, hand('label'), { line: 0, torn: 3, shadow: 0.4 });
              probePlate(ctx, label, () =>
                write(
                  ctx,
                  'Righteous',
                  0,
                  12,
                  { family: F.display, size: 100, weight: 700, color: C.gold, align: 'center' },
                  hand('stamp'),
                  { boil: 0.4 },
                ),
              );
              ctx.restore();
            });
        },
      },
      {
        // The figure in the robe, and Christ beside them.
        z: 0.9,
        lift: 1.3,
        draw: () => {
          contact(ctx, ACCUSED[0], ACCUSED[1] + 4, 170);
          contact(ctx, ADVOCATE[0], ADVOCATE[1] + 4, 190);
          glow(ctx, ADVOCATE[0], ADVOCATE[1] - 150, 260, C.glow, 0.7);
          glow(ctx, ACCUSED[0], ACCUSED[1] - 110, 200, C.glow, s.shine);
          at(ctx, { x: ADVOCATE[0], y: ADVOCATE[1], scale: 1.12 }, () =>
            christ(ctx, s.advocate, hand),
          );
          at(ctx, { x: ACCUSED[0], y: ACCUSED[1] }, () =>
            person(
              ctx,
              { ...s.figure, body: C.robe, shade: C.robe, garment: 'robe' },
              hand('figure'),
            ),
          );
        },
      },
    ],
    { rest: [REST.x, REST.y], haze: C.tealLow, thickness: 0.4 },
  );

// ─── the heavenly court of Zech 3 ────────────────────────────────────────────

/** The heavenly court's wall: a warm glow falling to board. */
export const courtWall = (ctx: CanvasRenderingContext2D, w: number, h: number) =>
  sky(ctx, w, h, [
    [0, C.glow],
    [0.55, C.peachLow],
    [1, C.boardLight],
  ]);

/** Where the court's high window stands, and the bench's centre. */
export const COURT_WINDOW: Pt = [1045, 220];
export const COURT_BENCH: Pt = [1600, 750];

/**
 * The heavenly court's set in 1920×1080 frame units (`accuser`, `robe`,
 * `name`): the high window with a low sun and its light, two pillars, the
 * floor and the bench at centre right. `sun` 0..1 lowers the sun toward the
 * sill (a great day closing).
 */
export const court = (ctx: CanvasRenderingContext2D, hand: Hands, sun = 0) => {
  const [wx, wy] = COURT_WINDOW;
  piece(ctx, rounded(wx, wy, 230, 260, 20), C.peachTop, hand('window'), { line: 5 });
  piece(ctx, ellipseShape(wx, wy + 52 + 150 * sun, 39, 39), C.gold, hand('sun'), { line: 0 });
  ctx.save();
  ctx.globalAlpha *= 0.33;
  ctx.fillStyle = C.glow;
  ctx.beginPath();
  ctx.moveTo(wx - 100, wy + 132);
  ctx.lineTo(wx + 100, wy + 132);
  ctx.lineTo(wx + 330, 960);
  ctx.lineTo(wx - 330, 960);
  ctx.fill();
  ctx.restore();
  for (const [x, k] of [
    [150, 34],
    [1790, 35],
  ] as const)
    piece(ctx, rectShape(x - 65, 60, 130, 1000), C.board, sub(hand('pillar'), k), {
      line: 0,
      torn: 3,
    });
  piece(ctx, rectShape(-40, 935, 2000, 160), C.boardShade, hand('floor'), { line: 0, torn: 4 });
  const [bx, by] = COURT_BENCH;
  piece(ctx, rectShape(bx - 240, by, 480, 200), C.board, hand('bench'), { line: 4 });
  piece(ctx, rectShape(bx - 260, by - 27, 520, 34), C.boardDeep, hand('benchTop'), { line: 4 });
};

/**
 * The accuser, feet at the origin, about 490 units tall: a tall angular
 * shadow-grey figure. `point` 0..1 swings his arm from his side to point
 * ahead (+x).
 */
export const accuser = (ctx: CanvasRenderingContext2D, hand: Hands, point = 0) => {
  glow(ctx, 20, -300, 380, C.boardDeep, 0.4);
  const shadow = '#5f5a55';
  piece(
    ctx,
    [
      [-40, -370],
      [40, -370],
      [74, -6],
      [-74, -6],
    ],
    shadow,
    hand('accuserBody'),
    { line: 4 },
  );
  // Hanging at his left side, or swung from the near shoulder to point ahead.
  at(ctx, { x: -62 + 102 * point, y: -345, rot: 0.12 - 1.72 * point }, () =>
    piece(ctx, rounded(0, 95, 26, 190, 12), shadow, hand('accuserArm'), { line: 3.5 }),
  );
  at(ctx, { x: 0, y: -420 }, () => {
    piece(
      ctx,
      [
        [0, -70],
        [46, -10],
        [30, 50],
        [-30, 50],
        [-46, -10],
      ],
      shadow,
      hand('accuserHead'),
      { line: 4 },
    );
    ctx.fillStyle = C.outline;
    for (const x of [-14, 16]) {
      ctx.beginPath();
      ctx.ellipse(x, 6, 3.5, 6, 0, 0, Math.PI * 2);
      ctx.fill();
    }
  });
};

export const JOSHUA: Pt = [760, 950];
/** Joshua's scale in the court, and his helpers'. */
export const JS = 2;
export const AS = 1.7;
/** The helpers who lift his clothes (Zech 3:4): where each stands, the side it grips from, its seed. */
export const HELPERS = [
  [610, 1, 1],
  [910, -1, 2],
] as const;

export const TUNIC: Pt[] = [
  [-39, -134],
  [39, -134],
  [48, -18],
  [-48, -18],
];
export const TUNIC_STAINS = [
  blob(-15, -105, 23, 19, 21),
  blob(18, -65, 29, 22, 22),
  blob(-20, -40, 20, 15, 23),
  blob(15, -118, 13, 11, 24),
];
/** The specks on his skin: the cheek's is the last to go. */
export const CHEEK: Pt = [-19, -160];
export const SPECKS = [blob(22, -100, 7, 6, 12), blob(-15, -60, 8, 6, 13)];

/** The frame `accuser` ends on and `robe` opens on: the whole court. */
export const ZECH_REST: Camera = { x: 960, y: 540, zoom: 1 };
/** Where the accuser stands once he has stepped up (he steps in from off the left), and his scale there. */
export const ACCUSER_AT: Pt = [300, 950];
const ACCUSER_FROM = -260;
const ACCUSER_S = 0.9;
/** Where the Angel (Christ) stands at the bench, his scale, and his near hand at rest. */
export const ANGEL_AT: Pt = [1330, 950];
const ANGEL_S = 2.1;
export const ANGEL_HAND: Pt = [-30, -58];
/** His near hand at rest, at his side. */
export const ANGEL_NEAR: Pt = [30, -58];

/** The heavenly court's people, as a scene has them this frame; every place is the court's. */
export interface ZechCourt {
  /** The sun's fall in the window (`court`'s `sun`). */
  readonly sun: number;
  /** The accuser: 0..1 stepped up (0 draws none), shrunk back, pointing. */
  readonly accuser: { readonly enter: number; readonly shrink: number; readonly point: number };
  /**
   * The Angel: his light brightening 0..1, his head's turn, his far hand (from
   * `ANGEL_HAND`), and his near hand when it reaches (at his side unless given).
   */
  readonly angel: {
    readonly lift: number;
    readonly tilt: number;
    readonly hand: Pt;
    readonly handR?: Pt;
  };
  /** Joshua's pose (the turban is his); his specks' alpha; the cheek's speck, moved `dy` and faded. */
  readonly joshua: Person;
  readonly specks: number;
  readonly cheek: { readonly dy: number; readonly alpha: number };
  /** The filthy tunic: where it is (frame units) and each stain's flare. */
  readonly tunic: { readonly at: Pt; readonly flare: (i: number) => number };
  /** Those who stand by: 0..1 their hands on the tunic, walked `dx`, bobbing, looking up. */
  readonly helpers: {
    readonly grip: number;
    readonly dx: number;
    readonly bob: number;
    readonly up: number;
  };
}

/**
 * The heavenly court of Zech 3 with its people, in 1920×1080 frame units
 * under the scene's camera, so `accuser` and `robe` draw one layout and the
 * handoff frame cannot drift: the set, the accuser, the Angel at the bench,
 * Joshua, those who stand by, and the tunic.
 */
export const zechCourt = (ctx: CanvasRenderingContext2D, hand: Hands, s: ZechCourt) => {
  court(ctx, hand, s.sun);
  zechAccuser(ctx, hand, s.accuser);
  zechAngel(ctx, hand, s.angel);
  zechJoshua(ctx, hand, s);
  for (const helper of HELPERS) zechHelper(ctx, hand, helper, s);
  at(ctx, { x: s.tunic.at[0], y: s.tunic.at[1], scale: JS }, () => tunic(ctx, hand, s.tunic.flare));
};

const zechAccuser = (ctx: CanvasRenderingContext2D, hand: Hands, a: ZechCourt['accuser']) => {
  if (a.enter <= 0) return;
  const [x, y] = ACCUSER_AT;
  at(ctx, { x: lerp(ACCUSER_FROM, x, a.enter), y, scale: lerp(1.05, ACCUSER_S, a.shrink) }, () => {
    accuser(ctx, hand, a.point);
    // Shrinking back into shadow.
    glow(ctx, 0, -250, 330, C.boardDeep, 0.35 * a.shrink * (1 - a.shrink) * 4);
  });
};

const zechAngel = (ctx: CanvasRenderingContext2D, hand: Hands, a: ZechCourt['angel']) => {
  const [x, y] = ANGEL_AT;
  glow(ctx, x, y - 250, 310, C.glow, 0.8 + 0.2 * a.lift);
  at(ctx, { x, y, scale: ANGEL_S }, () =>
    christ(
      ctx,
      { tilt: a.tilt, look: [-3, 1], browTilt: 0.15, handL: a.hand, handR: a.handR ?? ANGEL_NEAR },
      hand,
    ),
  );
};

const zechJoshua = (ctx: CanvasRenderingContext2D, hand: Hands, s: ZechCourt) =>
  at(ctx, { x: JOSHUA[0], y: JOSHUA[1], scale: JS }, () => {
    person(ctx, { ...s.joshua, onHead: turban }, hand('joshua'));
    SPECKS.forEach((speck, i) =>
      piece(ctx, speck, C.scarlet, sub(hand('speck'), i), {
        line: 0,
        shadow: 0.1,
        alpha: s.specks,
      }),
    );
    const [cx, cy] = CHEEK;
    piece(ctx, blob(cx, cy + s.cheek.dy, 6, 5, 11), C.scarlet, hand('cheek'), {
      line: 0,
      shadow: 0.1,
      alpha: s.cheek.alpha,
    });
  });

/** One who stands by, gripping the tunic's near side a little below its shoulder as `grip` goes to 1. */
const zechHelper = (
  ctx: CanvasRenderingContext2D,
  hand: Hands,
  [x0, side, k]: (typeof HELPERS)[number],
  s: ZechCourt,
) => {
  const { grip, dx, bob, up } = s.helpers;
  const x = x0 + dx;
  const y = JOSHUA[1] - (k === 1 ? bob : 5 - bob);
  const [tx, ty] = s.tunic.at;
  const target: Pt = [(tx - side * 44 * JS - x) / AS, (ty - 90 * JS - y) / AS];
  const rest: Pt = [side * 30, -58];
  const reachTo: Pt =
    grip >= 1 ? target : [lerp(rest[0], target[0], grip), lerp(rest[1], target[1], grip)];
  at(ctx, { x, y, scale: AS }, () =>
    person(
      ctx,
      {
        body: C.figureShade,
        skin: C.figureShade,
        look: [side * 2 * grip - side * 1.5 * (1 - grip), -2 * up],
        ...(side === 1 ? { handR: reachTo } : { handL: reachTo }),
      },
      sub(hand('helper'), k),
    ),
  );
};

/** The filthy tunic in Joshua's units; `flare` 0..1 per stain lights it scarlet. */
export const tunic = (ctx: CanvasRenderingContext2D, hand: Hands, flare: (i: number) => number) => {
  piece(ctx, TUNIC, C.boardShade, hand('tunic'), { torn: 2.5, line: 2 });
  TUNIC_STAINS.forEach((stain, i) => {
    const lit = flare(i);
    if (lit > 0) {
      const [sx, sy] = stain[0] ?? [0, 0];
      glow(ctx, sx + 10, sy, 36, C.scarlet, 0.6 * lit);
    }
    piece(ctx, stain, i % 2 === 0 ? C.scarlet : C.scarletShade, sub(hand('stain'), i), {
      line: 0,
      torn: 3,
      shadow: 0.1,
    });
  });
};

/**
 * The cold open's gavel, its handle's foot at the origin and its head up the
 * handle (−y); `rot` turns it about the foot. As it lies on the heavenly
 * court's bench in `robe`, set aside.
 */
export const gavel = (ctx: CanvasRenderingContext2D, hand: Hands, rot: number) =>
  at(ctx, { x: 0, y: 0, rot }, () => {
    piece(ctx, GAVEL_HANDLE, C.inkSoft, hand('handle'), { line: 2 });
    piece(ctx, GAVEL_HEAD, C.boardDeep, hand('gavelHead'), { line: 2.5 });
  });
const GAVEL_HANDLE = rounded(0, -52, 12, 100, 4);
const GAVEL_HEAD = rounded(0, -104, 64, 34, 8);
