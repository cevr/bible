// The two gospel scenes of `roof`, where scripture shows the three gifts
// given in order: the house in Capernaum, where four friends lower a
// paralysed man through the roof (Mark 2:3–12), and the temple court, where a
// woman taken in adultery stands alone before Jesus (John 8:3–11). `robe` and
// `within` call them back inside their icons in `roof`'s own framings (CRAFT
// rule 8), so each set is drawn once, here, in 1920×1080 frame units, and
// each scene passes only where its people are. Screen direction holds the
// film's: the one receiving stands screen-left, Jesus screen-right.

import {
  type Camera,
  type Pt,
  at,
  inset,
  multiplane,
  quad,
  rectShape,
  spline,
  stroke,
  sub,
} from '@bible/film/canvas';
import { clamp, lerp } from '@bible/film/core';
import {
  C,
  type HeadPiece,
  type Hands,
  type Person,
  blob,
  christ,
  ground,
  glow,
  mix,
  person,
  piece,
  rounded,
  shifted,
  sky,
  tracePath,
} from './kit.ts';

// ─── people of the gospel ────────────────────────────────────────────────────

/** A headcloth over a head of radii (rx, ry): over the crown, framing the face, falling `drape` down the sides. */
const clothShape = (rx: number, ry: number, drape: number): Pt[] =>
  spline(
    [
      [-1.12 * rx, (0.2 + 0.9 * drape) * ry],
      [-1.2 * rx, -0.3 * ry],
      [-1.02 * rx, -0.98 * ry],
      [-0.45 * rx, -1.28 * ry],
      [0.45 * rx, -1.28 * ry],
      [1.02 * rx, -0.98 * ry],
      [1.2 * rx, -0.3 * ry],
      [1.12 * rx, (0.2 + 0.9 * drape) * ry],
      [0.86 * rx, (0.1 + 0.85 * drape) * ry],
      [0.9 * rx, -0.1 * ry],
      [0.7 * rx, -0.55 * ry],
      [0, -0.66 * ry],
      [-0.7 * rx, -0.55 * ry],
      [-0.9 * rx, -0.1 * ry],
      [-0.86 * rx, (0.1 + 0.85 * drape) * ry],
    ],
    6,
    true,
  );

/**
 * A headcloth as a person's `onHead`, in `color`, falling `drape` (0..1) down
 * the sides, with a cord round the brow in `cord` when given: the crowd and
 * the woman wear these, each its own, so no two heads are cut alike.
 */
const headcloth = (color: string, drape: number, cord?: string): HeadPiece => {
  let shape: Pt[] | undefined;
  return (ctx, [cx, cy], [rx, ry], hand) => {
    shape ??= clothShape(rx, ry, drape);
    piece(ctx, shifted(shape, cx, cy), color, sub(hand, 5), { role: 'figure' });
    if (cord !== undefined)
      stroke(
        ctx,
        quad(
          [cx - 1.1 * rx, cy - 0.62 * ry],
          [cx, cy - 0.78 * ry],
          [cx + 1.1 * rx, cy - 0.62 * ry],
        ),
        { color: cord, width: 5, jitter: 0.4, taper: 0.1, boil: 'crawl' },
        sub(hand, 6),
      );
  };
};

/** One in a crowd: where they stand, their scale and build, their cloth and garment, and where they look. */
interface Onlooker {
  readonly at: Pt;
  readonly s: number;
  readonly build: readonly [number, number];
  readonly head?: HeadPiece;
  readonly body: string;
  readonly look: Pt;
}

// ─── the house in Capernaum ──────────────────────────────────────────────────

/** The roof's top, the slab's depth, the room's floor and the house's walls. */
const ROOF_TOP = 300;
const SLAB = 46;
const FLOOR = 930;
const HOUSE_L = 140;
const HOUSE_R = 1780;
/** The hole the friends open, and the bed let down through it: its centre, size and resting place. */
const HOLE: Pt = [560, 920];
const BED_X = 720;
const BED_W = 320;
const BED_H = 40;
const BED_DOWN = FLOOR - 26;
const BED_UP = ROOF_TOP + 12;
/** The man's scale, and where his hips rest on the bed and stand above the floor. */
const MAN_S = 1.5;
const HIP_X = BED_X + 30;
const HIP_LIE = 48;
const HIP_STAND = 60 * MAN_S;
/** How far left he walks once standing: to the door, the crowd parting. */
const WALK_TO = 380;
/** Lying on the bed, propped a little; standing. */
const LIE = -Math.PI / 2 + 0.14;
/** Where Jesus stands in the room, and his scale. */
const JESUS_HOUSE: Pt = [1260, FLOOR];
const JESUS_HOUSE_S = 2.1;

/** Where the man walks out, bed on his shoulder (`roof`'s `went`, `within`'s callback). */
export const WENT: Camera = { x: 430, y: 690, zoom: 1.7 };

/** The four on the roof: each one's x, the side of the hole they hold from, their build and cloth. */
const FRIENDS: ReadonlyArray<{
  readonly x: number;
  readonly side: -1 | 1;
  readonly build: readonly [number, number];
  readonly head?: HeadPiece;
  readonly body: string;
}> = [
  { x: 400, side: -1, build: [1.1, 0.95], head: headcloth(C.boardShade, 0.7), body: C.figure },
  {
    x: 495,
    side: -1,
    build: [0.9, 1.15],
    head: headcloth(C.stone, 0.4, C.boardDeep),
    body: C.figureShade,
  },
  { x: 985, side: 1, build: [1.2, 0.9], body: C.figure },
  { x: 1080, side: 1, build: [0.95, 1.05], head: headcloth(C.boardLight, 0.9), body: C.figure },
];
const FRIEND_S = 1.1;
/** Where each friend's holding hand is, in their units: down toward the hole's edge. */
const FRIEND_HOLD = 40;
const FRIEND_HOLD_Y = -52;
const HOLD_R: Pt = [FRIEND_HOLD, FRIEND_HOLD_Y];
const HOLD_L: Pt = [-FRIEND_HOLD, FRIEND_HOLD_Y];

/** The tiles over the hole, and where each is set aside once lifted. */
const TILES: ReadonlyArray<readonly [from: number, to: Pt]> = [
  [620, [290, ROOF_TOP - 23]],
  [740, [1190, ROOF_TOP - 23]],
  [860, [290, ROOF_TOP - 69]],
];
const TILE = rounded(0, 0, 116, SLAB, 6);

/** The room's crowd, standing along the back wall: never two cut alike. */
const ROOM_CROWD: ReadonlyArray<Onlooker> = [
  {
    at: [300, 912],
    s: 1.3,
    build: [1.1, 1],
    head: headcloth(C.boardShade, 0.8),
    body: C.figure,
    look: [3, 1],
  },
  { at: [420, 915], s: 1.45, build: [0.9, 1.1], body: C.figureShade, look: [3, 0] },
  {
    at: [960, 910],
    s: 1.35,
    build: [1, 0.95],
    head: headcloth(C.stone, 0.5, C.boardDeep),
    body: C.figure,
    look: [-3, 1],
  },
  {
    at: [1085, 914],
    s: 1.25,
    build: [1.15, 0.9],
    head: headcloth(C.boardLight, 1),
    body: C.figure,
    look: [-2, 0],
  },
  {
    at: [1560, 912],
    s: 1.4,
    build: [0.95, 1.15],
    head: headcloth(C.figureShade, 0.6),
    body: C.figure,
    look: [-4, 0],
  },
  { at: [1680, 915], s: 1.28, build: [1.05, 1], body: C.figureShade, look: [-3, 1] },
];
/** The near crowd at the frame's sides, cut off at the waist by the frame. */
const NEAR_CROWD: ReadonlyArray<Onlooker> = [
  {
    at: [30, 1240],
    s: 2.8,
    build: [1.1, 1],
    head: headcloth(C.boardShade, 0.9),
    body: C.figureShade,
    look: [4, 0],
  },
  {
    at: [250, 1260],
    s: 2.45,
    build: [0.95, 1.1],
    head: headcloth(C.stone, 0.4),
    body: C.figure,
    look: [3, -1],
  },
  { at: [1700, 1255], s: 2.6, build: [1.05, 0.95], body: C.figure, look: [-3, -1] },
  {
    at: [1910, 1240],
    s: 2.9,
    build: [0.9, 1.05],
    head: headcloth(C.boardLight, 0.7, C.boardShade),
    body: C.figureShade,
    look: [-4, 0],
  },
];

/** How far the near crowd steps aside as the man walks out through it. */
const NEAR_PART = 420;
/** And the room's crowd, less. */
const ROOM_PART = 260;

/** The far town beyond the roof: each roof's x, width and top. */
const TOWN: ReadonlyArray<readonly [number, number, number]> = [
  [-200, 260, 170],
  [60, 220, 120],
  [300, 300, 200],
  [620, 240, 140],
  [880, 280, 190],
  [1160, 230, 110],
  [1400, 300, 180],
  [1690, 260, 130],
  [1960, 280, 200],
];

/** The specks of sin on the man's garment, in his units: each is lifted off him on "son". */
const MAN_SPECKS = [
  blob(10, -86, 22, 18, 51),
  blob(-16, -56, 16, 13, 52),
  blob(14, -40, 12, 10, 53),
];

/** The house in Capernaum as a scene has it this frame. */
export interface House {
  readonly cam: Camera;
  /** The tiles over the hole: 0 laid, 1 lifted aside. */
  readonly tiles: number;
  /** The bed's way down on its ropes: 0 in the hole, 1 on the floor. */
  readonly lower: number;
  /** Jesus: looking up at the four in the hole 0..1, his near hand held out to the man 0..1, and looking after him as he goes 0..1. */
  readonly lookUp: number;
  readonly reach: number;
  readonly lookAfter: number;
  /** The scarlet specks on the man: 0 on him, 1 lifted off and gone. */
  readonly specks: number;
  /** The man: 0 lying on his bed to 1 standing; his bed 0 flat to 1 rolled on his shoulder; 0..1 walked out left; his step's bob; glad 0..1. */
  readonly rise: number;
  readonly roll: number;
  readonly walk: number;
  readonly bob: number;
  readonly glad: number;
  /** The crowd's wonder as he stands, 0..1. */
  readonly wonder: number;
}

/**
 * The house in Capernaum, cut away so the room shows: the far town under a
 * peach sky, the room's back wall, the roof with the four on it and the room
 * with its crowd, the man and Jesus, and the near crowd at the frame's sides.
 */
export const house = (
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  hand: Hands,
  s: House,
) => {
  sky(ctx, w, h, PEACH);
  multiplane(
    ctx,
    s.cam,
    w,
    h,
    [
      {
        // The far town.
        z: 1.8,
        draw: () =>
          TOWN.forEach(([x, bw, top], i) =>
            piece(
              ctx,
              rectShape(x - bw / 2, top, bw, 1100 - top),
              C.boardShade,
              sub(hand('town'), i),
              {
                role: 'scenery',
                kind: 'cut',
                line: 0,
                torn: 3,
                shadow: 0.4,
              },
            ),
          ),
      },
      {
        // The room's back wall, its window and its door.
        z: 1.25,
        draw: () => {
          piece(ctx, rectShape(60, ROOF_TOP, 1800, 760), C.boardLight, hand('wall'), {
            role: 'scenery',
            kind: 'cut',
            line: 0,
            torn: 3,
          });
          piece(ctx, rounded(1500, 520, 150, 190, 20), C.peachTop, hand('window'), {
            role: 'scenery',
            kind: 'cut',
            line: 4,
          });
          piece(ctx, rounded(300, 720, 170, 320, 16), C.boardDeep, hand('door'), {
            role: 'scenery',
            kind: 'cut',
            line: 4,
          });
        },
      },
      {
        // The roof and the four on it, the room's floor, its crowd, the man and Jesus.
        z: 1,
        lift: 1.3,
        draw: () => {
          room(ctx, hand, s);
          roofTop(ctx, hand, s);
        },
      },
      {
        // The near crowd, at the frame's sides.
        z: 0.8,
        draw: () => onlookers(ctx, hand, NEAR_CROWD, 'near', s.wonder, BED_X, NEAR_PART * s.walk),
      },
    ],
    { rest: [960, 560], haze: C.peachLow, thickness: 0.35 },
  );
};

const PEACH = [
  [0, C.peachTop],
  [0.75, C.peachLow],
  [1, C.peachLow],
] as const;

/**
 * Onlookers, each their own: they look toward (`toward`) as `wonder` turns
 * them, and their brows lift; `part` steps each out toward its own side of
 * the frame, making way.
 */
const onlookers = (
  ctx: CanvasRenderingContext2D,
  hand: Hands,
  crowd: ReadonlyArray<Onlooker>,
  key: string,
  wonder: number,
  toward: number,
  part = 0,
) =>
  crowd.forEach((o, i) => {
    const turn = clamp((toward - o.at[0]) / 500, -1, 1) * 4;
    const x = o.at[0] + (o.at[0] < 960 ? -part : part);
    at(ctx, { x, y: o.at[1], scale: o.s }, () =>
      person(
        ctx,
        {
          body: o.body,
          build: o.build,
          onHead: o.head,
          look: [lerp(o.look[0], turn, wonder), lerp(o.look[1], -1, wonder)],
          browL: 2.5 * wonder,
          browR: 3 * wonder,
          browTilt: 0.2 + 0.2 * wonder,
          mouth: i % 2 === 0 ? 0.5 * wonder : 0,
        },
        sub(hand(key), i),
      ),
    );
  });

/** The bed's centre as it is let down. */
const bedY = (lower: number) => lerp(BED_UP, BED_DOWN, lower);

/** The roof: the slab either side of the hole, its tiles, the four holding the ropes, and the ropes. */
const roofTop = (ctx: CanvasRenderingContext2D, hand: Hands, s: House) => {
  piece(ctx, rectShape(HOUSE_L, ROOF_TOP, HOLE[0] - HOUSE_L, SLAB), C.board, hand('slabL'), {
    role: 'scenery',
    kind: 'cut',
    line: 0,
    torn: 2,
  });
  piece(ctx, rectShape(HOLE[1], ROOF_TOP, HOUSE_R - HOLE[1], SLAB), C.board, hand('slabR'), {
    role: 'scenery',
    kind: 'cut',
    line: 0,
    torn: 2,
  });
  TILES.forEach(([x, [tx, ty]], i) => {
    const k = clamp(s.tiles * 1.4 - i * 0.2);
    at(
      ctx,
      {
        x: lerp(x, tx, k),
        y: lerp(ROOF_TOP + SLAB / 2, ty, k) - 90 * Math.sin(Math.PI * k),
        rot: 0.3 * Math.sin(Math.PI * k),
      },
      () =>
        piece(ctx, TILE, C.board, sub(hand('tile'), i), {
          role: 'scenery',
          kind: 'cut',
          line: 0,
          torn: 2,
        }),
    );
  });
  FRIENDS.forEach((fr, i) => {
    at(ctx, { x: fr.x, y: ROOF_TOP, scale: FRIEND_S }, () =>
      person(
        ctx,
        {
          body: fr.body,
          build: fr.build,
          onHead: fr.head,
          look: [-2 * fr.side, 4],
          nod: 3,
          browTilt: 0.3,
          smile: 0.4 * s.lower,
          ...(fr.side < 0 ? { handR: HOLD_R } : { handL: HOLD_L }),
        },
        sub(hand('friend'), i),
      ),
    );
  });
};

/**
 * The ropes, from each friend's hand down to the bed's end on their side,
 * until he stands: hung behind the room's people (drawn before them), so no
 * rope ever crosses a face, the man's close-up on "son" included.
 */
const ropes = (ctx: CanvasRenderingContext2D, hand: Hands, s: House) => {
  const shown = clamp(1 - 3 * s.rise);
  if (shown <= 0) return;
  const y = bedY(s.lower);
  FRIENDS.forEach((fr, i) =>
    stroke(
      ctx,
      [
        [fr.x - fr.side * FRIEND_HOLD * FRIEND_S, ROOF_TOP + FRIEND_HOLD_Y * FRIEND_S],
        [BED_X + fr.side * (BED_W / 2 - 18 - 14 * (i % 2)), y - 6],
      ],
      { color: C.boardDeep, width: 3, jitter: 0.4, taper: 0, alpha: shown, boil: 'crawl' },
      sub(hand('rope'), i),
    ),
  );
};

/** The man's pose, rewritten every frame. */
const MAN_LOOK: [number, number] = [0, 0];
const MAN_HAND: [number, number] = [0, 0];
const MAN_WASH: [number, number, number] = [0, 0, 0];
const MAN: Person = { look: MAN_LOOK, stains: MAN_SPECKS, washed: MAN_WASH };

/** The room: its walls and floor, the crowd at the back, the bed and the man, and Jesus. */
const room = (ctx: CanvasRenderingContext2D, hand: Hands, s: House) => {
  for (const [x, k] of [
    [HOUSE_L - 40, 'wallL'],
    [HOUSE_R, 'wallR'],
  ] as const)
    piece(ctx, rectShape(x, ROOF_TOP, 40, FLOOR - ROOF_TOP + 10), C.board, hand(k), {
      role: 'scenery',
      kind: 'cut',
      line: 0,
      torn: 2,
    });
  piece(ctx, rectShape(-800, FLOOR, 3500, 600), C.boardShade, hand('floor'), {
    role: 'scenery',
    line: 0,
    torn: 4,
  });
  ropes(ctx, hand, s);
  onlookers(
    ctx,
    hand,
    ROOM_CROWD,
    'crowd',
    s.wonder,
    lerp(BED_X, HIP_X + (WALK_TO - HIP_X) * s.walk, s.rise),
    ROOM_PART * s.walk,
  );

  // Jesus, looking to the man, up at the four, and after the man as he goes.
  const [jx, jy] = JESUS_HOUSE;
  glow(ctx, jx, jy - 240, 330, C.glow, 0.6);
  const up = s.lookUp * (1 - s.reach);
  at(ctx, { x: jx, y: jy, scale: JESUS_HOUSE_S }, () =>
    christ(
      ctx,
      {
        tilt: -0.12 * up - 0.05 * s.reach,
        look: [lerp(lerp(-3, -2, up), -4, s.lookAfter), lerp(1, -4, up)],
        browTilt: 0.2 + 0.15 * up,
        browL: 2 * up,
        browR: 2 * up,
        smile: 0.3 + 0.3 * s.lookAfter,
        handL: [lerp(-30, -104, s.reach), lerp(-58, -104, s.reach)],
        handR: [30, -58],
      },
      hand,
    ),
  );

  // The bed, flat, until he rolls it up.
  const y = bedY(s.lower);
  const flat = 1 - s.roll;
  if (flat > 0.02) {
    if (s.lower >= 1 && s.rise <= 0) ground(ctx, BED_X, FLOOR - 2, BED_W + 40);
    piece(ctx, rounded(BED_X, y, lerp(90, BED_W, flat), BED_H, 12), C.boardDeep, hand('bed'), {
      role: 'scenery',
      kind: 'cut',
      line: 3,
    });
  }

  // The man: lying, sitting up and standing about his hips, then walking out.
  const rise = s.rise;
  const hx = lerp(HIP_X, WALK_TO, s.walk);
  const hy = lerp(y - BED_H / 2 - HIP_LIE, FLOOR - HIP_STAND - s.bob, rise);
  MAN_LOOK[0] = lerp(1, -3 * s.walk + 2 * (1 - s.walk), rise);
  MAN_LOOK[1] = -1 - 2 * s.glad;
  MAN.ground = rise;
  MAN.skin = rise > 0.3 ? C.figure : C.figureShade;
  MAN.eyes = lerp(0.7, 1, Math.max(rise, s.glad));
  MAN.smile = 0.8 * s.glad;
  MAN.browL = 2 + 1.5 * s.glad;
  MAN.browR = 2 + 1.5 * s.glad;
  MAN.browTilt = 0.35;
  MAN.mouth = 0.4 * s.glad * (1 - s.walk);
  // Carrying the rolled bed on his shoulder.
  MAN_HAND[0] = 34;
  MAN_HAND[1] = -132;
  MAN.handR = s.roll > 0.5 ? MAN_HAND : undefined;
  // Once the specks start to lift, the ones in flight stand in for those on him.
  for (let i = 0; i < MAN_WASH.length; i++) MAN_WASH[i] = s.specks > 0 ? 1 : 0;
  at(ctx, { x: hx, y: hy, rot: lerp(LIE, 0, rise) }, () =>
    at(ctx, { x: 0, y: HIP_STAND, scale: MAN_S }, () => person(ctx, MAN, hand('man'))),
  );
  // The specks lift off him and go.
  if (s.specks > 0 && s.specks < 1)
    MAN_SPECKS.forEach((speck, i) => {
      const k = clamp(s.specks * 1.3 - i * 0.1);
      at(ctx, { x: hx, y: hy, rot: LIE }, () =>
        // Up and away from him, in the frame he lies in.
        at(ctx, { x: 90 * k, y: HIP_STAND - 30 * k, scale: MAN_S }, () =>
          piece(ctx, speck, C.scarlet, sub(hand('speck'), i), {
            role: 'figure',
            line: 0,
            shadow: 0.1,
            alpha: 1 - k,
          }),
        ),
      );
    });
  // A blanket over him while he lies there.
  const blanket = clamp(1 - 2.5 * rise);
  if (blanket > 0)
    piece(ctx, rounded(BED_X + 70, y - BED_H / 2 - 16, 220, 46, 16), C.cream, hand('blanket'), {
      role: 'scenery',
      kind: 'cut',
      line: 3,
      alpha: blanket,
    });
  // The bed rolled up and carried on his shoulder.
  if (s.roll > 0) {
    const onShoulder = clamp(2 * s.roll - 1);
    const rx = lerp(BED_X, hx + 30, onShoulder);
    const ry = lerp(y, FLOOR - 172 - s.bob, onShoulder);
    piece(
      ctx,
      rounded(rx, ry, lerp(BED_W, 110, clamp(2 * s.roll)), lerp(BED_H, 44, s.roll), 20),
      C.boardDeep,
      hand('roll'),
      {
        role: 'figure',
        line: 3,
      },
    );
  }
};

// ─── the temple court ────────────────────────────────────────────────────────

/** The court's floor, where the woman stands, Jesus and his scale, and the court framed wide. */
const COURT_FLOOR = 950;
const WOMAN_AT: Pt = [640, COURT_FLOOR];
const WOMAN_S = 2.3;
const JESUS_AT: Pt = [1330, COURT_FLOOR];
const JESUS_S = 2.3;
/** How far left she walks out, off the frame. */
const WOMAN_OUT = -420;

/** The temple court framed wide (`roof` on "woman" and "go", `robe`'s callback). */
export const COURT_WIDE: Camera = { x: 960, y: 560, zoom: 1 };

/** Jesus stooped to write: his body drawn down to this share of its height, and back up as he stands. */
const STOOP: readonly [number, number] = [1.1, 0.62];
/** Where his finger writes in the dust as he stoops, in his units. */
const WRITING_HAND: Pt = [-70, -10];

/** The marks he writes in the dust: each one's start, end and seed (never letters). */
const DUST_MARKS: ReadonlyArray<readonly [Pt, Pt, number]> = [
  [[1040, 962], [1085, 956], 1],
  [[1095, 968], [1120, 958], 2],
  [[1030, 982], [1070, 988], 3],
  [[1080, 986], [1135, 978], 4],
  [[1145, 972], [1175, 966], 5],
];

/** The stones dropped in the dust about her: each one's centre, size and seed. */
const STONES = [
  [430, 962, 24, 17, 61],
  [480, 985, 36, 24, 62],
  [560, 1002, 28, 19, 63],
  [770, 990, 32, 22, 64],
  [840, 962, 24, 17, 65],
  [915, 1012, 38, 25, 66],
  [360, 1020, 30, 20, 67],
] as const;
const STONE_SHAPES = STONES.map(([x, y, bw, bh, seed]) => blob(x, y, bw, bh, seed));

/** Her stains, in her units: each washed out as she is forgiven. */
const WOMAN_STAINS = [
  blob(8, -92, 30, 34, 71),
  blob(-16, -54, 18, 20, 72),
  blob(16, -30, 16, 13, 73),
];
const HER_VEIL = headcloth(C.boardLight, 1);
const HER_VEIL_WHITE = headcloth(C.stone, 1);

/** Those who brought her, going: each one's start and exit x, scale, build and cloth. */
const ACCUSERS: ReadonlyArray<{
  readonly from: number;
  readonly to: number;
  readonly s: number;
  readonly build: readonly [number, number];
  readonly head?: HeadPiece;
  readonly body: string;
}> = [
  {
    from: 330,
    to: -260,
    s: 1.25,
    build: [1.2, 1.1],
    head: headcloth(C.boardDeep, 0.6),
    body: C.figureShade,
  },
  {
    from: 520,
    to: -140,
    s: 1.1,
    build: [0.9, 1.2],
    head: headcloth(C.inkSoft, 0.9, C.boardShade),
    body: C.figure,
  },
  {
    from: 1420,
    to: 2150,
    s: 1.2,
    build: [1.1, 0.95],
    head: headcloth(C.figureShade, 0.4),
    body: C.figure,
  },
  { from: 1640, to: 2260, s: 1.05, build: [0.95, 1.05], body: C.figureShade },
];
const ACCUSER_FLOOR = 905;

/** The temple court as a scene has it this frame. */
export interface Temple {
  readonly cam: Camera;
  /** Those who brought her, walking out 0..1; their step's bob. */
  readonly leave: number;
  readonly leaveBob: number;
  /** The marks he has written in the dust, 0..1. */
  readonly writing: number;
  /** Jesus: 0 stooped to the dust to 1 standing; his mouth as he speaks; where he looks. */
  readonly stand: number;
  readonly speak: number;
  readonly look: Pt;
  /** The woman: walked 0..1 out left, her step's bob, her stains washed 0..1, where she looks, her head bowed 0..1, glad 0..1, and in white 0..1 (the callback). */
  readonly woman: {
    readonly walk: number;
    readonly bob: number;
    readonly washed: number;
    readonly look: Pt;
    readonly bowed: number;
    readonly glad: number;
    readonly white: number;
  };
}

/**
 * The temple court: the sanctuary far off under the peach sky, the
 * colonnade those who brought her walk out through, the court's floor with
 * the stones dropped in the dust and the marks he wrote, the woman
 * screen-left and Jesus screen-right, and a near pillar at the frame's edge.
 */
export const temple = (
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  hand: Hands,
  s: Temple,
) => {
  sky(ctx, w, h, PEACH);
  multiplane(
    ctx,
    s.cam,
    w,
    h,
    [
      {
        // The sanctuary and its courts, far off.
        z: 1.9,
        draw: () => {
          for (const [x, top, bw, k] of [
            [200, 380, 440, 'courtL'],
            [1300, 380, 440, 'courtR'],
          ] as const)
            piece(ctx, rectShape(x, top, bw, 700), mix(C.stone, C.boardShade, 0.35), hand(k), {
              role: 'scenery',
              kind: 'cut',
              line: 0,
              torn: 2,
              shadow: 0.4,
            });
          piece(ctx, rectShape(640, 90, 660, 1000), C.stone, hand('sanctuary'), {
            role: 'scenery',
            kind: 'cut',
            line: 0,
            torn: 2,
            shadow: 0.5,
          });
          piece(
            ctx,
            rectShape(610, 60, 720, 50),
            mix(C.stone, C.boardShade, 0.5),
            hand('cornice'),
            {
              role: 'scenery',
              kind: 'cut',
              line: 0,
              torn: 2,
            },
          );
          piece(ctx, rounded(970, 700, 220, 460, 30), C.boardDeep, hand('porch'), {
            role: 'scenery',
            kind: 'cut',
            line: 0,
          });
        },
      },
      {
        // The colonnade, and those who brought her walking out through it.
        z: 1.3,
        draw: () => {
          piece(ctx, rectShape(-400, 150, 2720, 50), C.boardShade, hand('lintel'), {
            role: 'scenery',
            kind: 'cut',
            line: 0,
            torn: 2,
          });
          for (const [x, k] of [
            [60, 1],
            [380, 2],
            [1540, 3],
            [1860, 4],
          ] as const)
            piece(ctx, rectShape(x - 55, 200, 110, 720), C.boardLight, sub(hand('pillar'), k), {
              role: 'scenery',
              kind: 'cut',
              line: 0,
              torn: 2,
            });
          piece(ctx, rectShape(-400, 860, 2720, 60), C.boardShade, hand('lowWall'), {
            role: 'scenery',
            kind: 'cut',
            line: 0,
            torn: 3,
          });
          ACCUSERS.forEach((a, i) => {
            const x = lerp(a.from, a.to, s.leave);
            const away = Math.sign(a.to - a.from);
            at(
              ctx,
              { x, y: ACCUSER_FLOOR - (i % 2 === 0 ? s.leaveBob : 5 - s.leaveBob), scale: a.s },
              () =>
                person(
                  ctx,
                  {
                    body: a.body,
                    build: a.build,
                    onHead: a.head,
                    look: [3 * away, 1],
                    nod: 3,
                    browTilt: -0.1,
                  },
                  sub(hand('accuser'), i),
                ),
            );
          });
        },
      },
      {
        // The court's floor, the stones and the writing, the woman and Jesus.
        z: 1,
        lift: 1.3,
        draw: () => court(ctx, hand, s),
      },
      {
        // A near pillar at the frame's left edge.
        z: 0.75,
        draw: () =>
          piece(ctx, rectShape(-330, -200, 260, 1500), C.board, hand('nearPillar'), {
            role: 'scenery',
            kind: 'cut',
            line: 0,
            torn: 3,
            shadow: 0.6,
          }),
      },
    ],
    { rest: [960, 560], haze: C.peachLow, thickness: 0.35 },
  );
};

/** Her pose and his, rewritten every frame. */
const HER_LOOK: [number, number] = [0, 0];
const HER_WASH: [number, number, number] = [0, 0, 0];
const HER: Person = { garment: 'robe', look: HER_LOOK, stains: WOMAN_STAINS, washed: HER_WASH };
const HIS_LOOK: [number, number] = [0, 0];
const HIS_BUILD: [number, number] = [1, 1];
const HIS_HAND: [number, number] = [0, 0];
const HIM: Person = { look: HIS_LOOK, build: HIS_BUILD, handL: HIS_HAND, handR: [30, -58] };

const court = (ctx: CanvasRenderingContext2D, hand: Hands, s: Temple) => {
  piece(
    ctx,
    rectShape(-800, COURT_FLOOR - 40, 3500, 700),
    mix(C.board, C.peachLow, 0.35),
    hand('floor'),
    {
      role: 'scenery',
      line: 0,
      torn: 4,
    },
  );
  STONE_SHAPES.forEach((stone, i) => {
    const [x, y, bw] = STONES[i] ?? [0, 0, 0];
    ground(ctx, x, y + 8, bw * 1.3);
    piece(ctx, stone, C.stone, sub(hand('stone'), i), {
      role: 'scenery',
      kind: 'cut',
      line: 0,
      shadow: 0.3,
    });
  });
  DUST_MARKS.forEach(([a, b, k], i) => {
    const drawn = clamp(s.writing * DUST_MARKS.length - i);
    if (drawn <= 0) return;
    stroke(
      ctx,
      [a, [lerp(a[0], b[0], drawn), lerp(a[1], b[1], drawn)]],
      { color: C.boardDeep, width: 4, jitter: 0.6, taper: 0.3, alpha: 0.7, boil: 'none' },
      sub(hand('dust'), k),
    );
  });

  // Jesus: stooped to the dust, writing; standing to speak.
  const stand = s.stand;
  const [jx, jy] = JESUS_AT;
  glow(ctx, jx, jy - 250 + 90 * (1 - stand), 340, C.glow, 0.6);
  HIS_LOOK[0] = s.look[0];
  HIS_LOOK[1] = s.look[1];
  HIS_BUILD[0] = lerp(STOOP[0], 1, stand);
  HIS_BUILD[1] = lerp(STOOP[1], 1, stand);
  HIS_HAND[0] = lerp(WRITING_HAND[0], -30, stand);
  HIS_HAND[1] = lerp(WRITING_HAND[1], -58, stand);
  HIM.tilt = -0.2 * (1 - stand);
  HIM.nod = 6 * (1 - stand);
  HIM.browTilt = 0.2;
  HIM.browL = 1.5 * stand;
  HIM.browR = 1.5 * stand;
  HIM.mouth = s.speak;
  HIM.smile = 0.25 * stand;
  at(ctx, { x: jx, y: jy, scale: JESUS_S }, () => christ(ctx, HIM, hand));

  // The woman, alone where they left her; in white in the callback.
  const wm = s.woman;
  const white = wm.white;
  HER_LOOK[0] = wm.look[0];
  HER_LOOK[1] = wm.look[1];
  for (let i = 0; i < HER_WASH.length; i++) HER_WASH[i] = Math.max(wm.washed, white);
  HER.body = mix(C.stone, C.robe, white);
  HER.shade = mix(C.figureShade, C.robe, white);
  HER.onHead = white > 0.5 ? HER_VEIL_WHITE : HER_VEIL;
  HER.nod = 5 * wm.bowed;
  HER.tilt = 0.08 * wm.bowed;
  HER.browTilt = 0.4 - 0.1 * wm.glad;
  HER.browL = 3 * (1 - wm.bowed);
  HER.browR = 3 * (1 - wm.bowed);
  HER.smile = 0.7 * wm.glad;
  const [wx, wy] = WOMAN_AT;
  at(ctx, { x: lerp(wx, WOMAN_OUT, wm.walk), y: wy - wm.bob, scale: WOMAN_S }, () =>
    person(ctx, HER, hand('woman')),
  );
};

// ─── callbacks ───────────────────────────────────────────────────────────────

/**
 * A callback to `roof` inside one of the three icons (CRAFT rule 8): `draw`
 * draws a set as `roof` framed it, in frame units, and it shows scaled by
 * `k` about the frame's centre onto the icon's centre (0, 0) in the current
 * units, clipped to `clip` (the icon's own shape), at `shown`. It is an
 * `inset`: the set's own shot is the callback's, so the scene breathes as it
 * would without it.
 */
export const recall = (
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  clip: ReadonlyArray<Pt>,
  k: number,
  shown: number,
  draw: () => void,
) => {
  if (shown <= 0) return;
  ctx.save();
  ctx.beginPath();
  tracePath(ctx, clip);
  ctx.clip();
  ctx.globalAlpha *= shown;
  ctx.scale(k, k);
  ctx.translate(-w / 2, -h / 2);
  inset(ctx, draw);
  ctx.restore();
};

/**
 * The court as `roof` leaves it on "go", framed wide, held still: those who
 * brought her gone, Jesus standing, and the woman forgiven, in white (`robe`'s
 * callback).
 */
export const COURT_FORGIVEN: Temple = {
  cam: COURT_WIDE,
  leave: 1,
  leaveBob: 0,
  writing: 1,
  stand: 1,
  speak: 0,
  look: [-4, 0.5],
  woman: { walk: 0, bob: 0, washed: 1, look: [3, 0], bowed: 0, glad: 1, white: 1 },
};

/**
 * The house as `roof` has it on "went", framed there, held still: the man
 * standing, forgiven, carrying his bed out `walk` (0..1) of the way, his step
 * `bob` (`within`'s callback).
 */
export const went = (walk: number, bob: number): House => ({
  cam: WENT,
  tiles: 1,
  lower: 1,
  lookUp: 1,
  reach: 1,
  lookAfter: 1,
  specks: 1,
  rise: 1,
  roll: 1,
  walk,
  bob,
  glad: 1,
  wonder: 1,
});
