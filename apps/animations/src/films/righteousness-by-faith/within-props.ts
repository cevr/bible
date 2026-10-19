// The places `within` calls back to, in the Board's pixels, as their beats'
// kept panels lay them out, and the page's hold on the accused's feet. The
// temple court of `woman` (woman.court, woman.told) in its early peach light:
// the sky rose overhead and pale gold low down, its clouds, the far city's
// white houses and the cypresses over the balustrade, the steps up to it, the
// columns, the pale floor with the columns' violet shadows across it, and the
// stones dropped in the dust. The house in Capernaum of `roof` (roof.saw,
// within.bed, roof.went) in the light through its roof: the back wall with its
// doorways and window, the beaten floor, the ceiling's boards and beams round
// the torn hole and the sky in it, the shafts falling through, the ropes, the
// bed, and the bed rolled up. The strip of the page over his feet (`we`), and
// its two halves tearing off them (`arose`).
// Every person in them but Christ is held as a blocked mass (look-props'
// `campMass`, `lyingMass` for the man on his bed) at the cast band's height
// against His, until the cast's kept renders are sheeted and drawn: the woman
// of John 8, the man of Capernaum, the four at the hole, the crowd in the
// house; his bed is held with him, its silhouette alone. The scenery and the
// strip are torn or cut paper with no ink; the stones are props, and the bed a
// held mass, lined in the ink, their lines drawn `unprobed` as every prop's
// are. Pure: the same pose draws the same thing.

import {
  type Hand,
  type Hex,
  type Pt,
  mix,
  probeFace,
  ramp,
  spline,
  sub,
  unprobed,
  wash,
} from '@bible/film/canvas';
import { clamp, lerp } from '@bible/film/core';
import { keyLight, shading, smooth } from '@bible/film/style';
import { type Crease, boxOf, creaseOf } from '@bible/film/style/rig';
import { box, cut } from './court-set.ts';
import { C, piece } from './kit.ts';
import { type CamperName, type CamperPose, bodyOf, stand } from './look-props.ts';
import { type Paper, paper, shafts } from './page-set.ts';
import { type Torn, plane } from './spoke-props.ts';

// ─── the cast's band ─────────────────────────────────────────────────────────

/** Christ's height, His hair to His soles, at scale 1 (`rigs/christ-rig.ts`): the top of the cast's one band. */
export const CHRIST_TALL = 468;

/**
 * Each held person's height to the crown against Christ's, within the cast's
 * one band (character-design.md, "One height band for the cast"): Christ at
 * its top, the rest a little under Him, varied as people are.
 */
export const BAND = {
  woman: 0.93,
  man: 0.97,
  broad: 0.95,
  elder: 0.94,
  tall: 0.99,
  child: 0.64,
} as const;

/** The scale a held body of `who`'s kit stands at to be `band` of Christ's height when He stands at `scale`. */
export const heldScale = (who: CamperName, band: number, scale: number) =>
  (band * CHRIST_TALL * scale) / bodyOf(who).tall;

/** Each of the kit's people's place in the band: the tall men at its top, the women lower, the child well under it. */
const BAND_OF: Readonly<Record<CamperName, number>> = {
  tallBack: BAND.tall,
  tallLeft: BAND.tall,
  broad: BAND.broad,
  climber: BAND.man,
  elder: BAND.elder,
  womanLeft: BAND.woman,
  womanRight: BAND.woman,
  child: BAND.child,
};

/**
 * One of a place's people, held where its panel stands it: its kit body, its
 * feet, its size against the band's where Christ stands (less, farther back),
 * its turn; how far its head tips back to look up (less than 0, down) and
 * its body leans; its hands, Board pixels, where it holds something.
 */
export interface Held {
  readonly who: CamperName;
  readonly at: Pt;
  readonly depth: number;
  readonly facing: number;
  readonly lift?: number;
  readonly lean?: number;
  readonly hands?: readonly [Pt, Pt];
}

/** Board pixel `p` in the units of `h` standing `s` big, leaning: where its hand goes to be there. */
const unitsOf = (h: Held, s: number, p: Pt): Pt => {
  const x = (p[0] - h.at[0]) / s;
  const y = (p[1] - h.at[1]) / s;
  const a = -(h.lean ?? 0);
  return [x * Math.cos(a) - y * Math.sin(a), x * Math.sin(a) + y * Math.cos(a)];
};

/** `h`'s size where Christ stands at `scale`. */
export const heldSize = (h: Held, scale: number) =>
  heldScale(h.who, BAND_OF[h.who], scale) * h.depth;

/** `h`'s pose where Christ stands at `scale`, breathing at `breath`'s phase. */
export const heldPose = (h: Held, scale: number, breath: number): CamperPose => {
  const s = heldSize(h, scale);
  const home = stand(h.who);
  return {
    ...home,
    x: h.at[0],
    y: h.at[1],
    scale: s,
    facing: h.facing,
    lift: h.lift ?? 0,
    lean: h.lean ?? 0,
    breath,
    hands:
      h.hands === undefined ? home.hands : [unitsOf(h, s, h.hands[0]), unitsOf(h, s, h.hands[1])],
  };
};

// ─── a place's planes ────────────────────────────────────────────────────────

/** The Board's panel, Board pixels: what the sun's shafts fan over. */
export const PANEL = { w: 1536, h: 1024 } as const;

/** How far every plane runs past the panel's edges, Board pixels, so the camera can travel and push over it. */
const RUN = { left: -900, right: 2500, top: -900, bottom: 1900 } as const;

/** A sky's heights on the panel, Board pixels, washed over the plane's whole run. */
const skyWash = (ctx: CanvasRenderingContext2D, stops: ReadonlyArray<readonly [number, Hex]>) =>
  wash(
    ctx,
    RUN.left,
    RUN.top,
    RUN.right - RUN.left,
    RUN.bottom - RUN.top,
    stops.map(([y, c]): readonly [number, Hex] => [(y - RUN.top) / (RUN.bottom - RUN.top), c]),
  );

/** A low cloud about (`x`, `y`) its flat foot, `w` wide and `h` high at its crown: three soft heads over a flat base. */
const cloudShape = (x: number, y: number, w: number, h: number): Pt[] => {
  const n = 36;
  const top: Pt[] = [];
  for (let i = 0; i <= n; i++) {
    const u = i / n;
    const heads = 0.4 * Math.abs(Math.sin(u * Math.PI * 3)) + 0.6 * Math.sin(u * Math.PI);
    top.push([x - w / 2 + u * w, y - h * heads]);
  }
  return [...top, [x + w / 2, y], [x - w / 2, y]];
};

/** A cypress standing at (`x`, `foot`), `tall` and `wide`: a narrow flame of dark green, round at its foot, its tip a point. */
const cypressShape = (x: number, foot: number, tall: number, wide: number): Pt[] =>
  spline(
    [
      [x - 0.42 * wide, foot],
      [x - 0.5 * wide, foot - 0.3 * tall],
      [x - 0.36 * wide, foot - 0.7 * tall],
      [x, foot - tall],
      [x + 0.36 * wide, foot - 0.7 * tall],
      [x + 0.5 * wide, foot - 0.3 * tall],
      [x + 0.42 * wide, foot],
    ],
    6,
  );

// ─── the temple court (woman.court, woman.told) ──────────────────────────────

/** The court's sky at its heights on the panel: rose overhead, peach, pale gold low behind the city. */
const TEMPLE_SKY: ReadonlyArray<readonly [number, Hex]> = [
  [-300, '#dca6a8'],
  [60, '#ebb9a9'],
  [200, '#f4d0b3'],
  [320, '#f8e2c4'],
];

/** Its clouds, each its foot's middle, its width and its height: long and low, cream lit from below. */
const CLOUDS: ReadonlyArray<readonly [number, number, number, number]> = [
  [-200, 60, 360, 40],
  [330, 120, 380, 46],
  [930, 70, 300, 38],
  [1330, 150, 340, 42],
  [1820, 100, 360, 40],
];
const CLOUD: Torn = { color: '#f6d9c8', rim: '#fcebdf' };

/** Where the court's far ground meets the balustrade: the houses' and the cypresses' feet. */
const SKYLINE = 334;

/** The far city's houses, left to right: each its left edge, its roof's height and its width; the white cubes the panels draw over the balustrade. */
const HOUSES: ReadonlyArray<readonly [number, number, number]> = [
  [-200, 250, 120],
  [40, 236, 90],
  [120, 262, 70],
  [180, 210, 110],
  [300, 248, 80],
  [370, 228, 70],
  [560, 286, 60],
  [610, 270, 80],
  [700, 292, 70],
  [1080, 250, 90],
  [1160, 214, 100],
  [1260, 258, 70],
  [1330, 236, 110],
  [1450, 266, 80],
  [1530, 230, 90],
  [1640, 250, 100],
];
/** A house's lit face and its shaded side, and its windows: dark slots softened by the haze. */
const HOUSE = paper('#eed7c4', 0.6);
const WINDOW: Hex = '#c9aeab';

/** The cypresses over the balustrade, as the panels place them: each its foot's middle, its height and its width. */
const CYPRESSES: ReadonlyArray<readonly [number, number, number]> = [
  [-240, 150, 30],
  [95, 150, 30],
  [390, 120, 26],
  [445, 175, 32],
  [580, 110, 24],
  [625, 150, 30],
  [830, 95, 22],
  [1265, 165, 30],
  [1320, 125, 26],
  [1495, 180, 34],
  [1700, 140, 28],
];
const CYPRESS = paper('#7f9c8c', 0.6);

/** The far plane: the sky, its clouds, the city's houses and the cypresses over them. */
export const templeFar = (ctx: CanvasRenderingContext2D, hand: Hand) => {
  skyWash(ctx, TEMPLE_SKY);
  CLOUDS.forEach(([x, y, w, h], i) => plane(ctx, cloudShape(x, y, w, h), CLOUD, sub(hand, i)));
  for (const [x, top, w] of HOUSES) {
    const side = 0.24 * w;
    cut(
      ctx,
      box(x, top, w, SKYLINE - top),
      { color: HOUSE.color, shade: HOUSE.color },
      {
        line: 0,
        flat: true,
      },
    );
    cut(
      ctx,
      box(x + w - side, top, side, SKYLINE - top),
      { color: HOUSE.shade, shade: HOUSE.shade },
      {
        line: 0,
        flat: true,
      },
    );
    ctx.save();
    ctx.fillStyle = WINDOW;
    ctx.fillRect(x + 0.22 * w, top + 0.3 * (SKYLINE - top), 0.12 * w, 0.16 * (SKYLINE - top));
    ctx.restore();
  }
  for (const [x, tall, wide] of CYPRESSES) {
    const pts = cypressShape(x, SKYLINE + 4, tall, wide);
    cut(ctx, pts, { color: CYPRESS.color, shade: CYPRESS.color }, { line: 0, flat: true });
    // Its far side in shade: the half away from the light.
    ctx.save();
    ctx.beginPath();
    ctx.rect(x + 0.06 * wide, SKYLINE - tall - 10, wide, tall + 20);
    ctx.clip();
    cut(ctx, pts, { color: CYPRESS.shade, shade: CYPRESS.shade }, { line: 0, flat: true });
    ctx.restore();
  }
};

/** The balustrade across the court: its rail's top, its foot, its posts' spacing and width. */
const RAIL = { top: 312, under: 334, foot: 438, base: 462, every: 175, post: 30 } as const;
const STONE_PALE = paper('#f1dfcc', 0.5);
const STONE_POST = paper('#ead3c0', 0.5);
const STONE_RECESS: Hex = '#e2c8ba';

/** The three steps down from the balustrade's foot to the floor: each its riser's top, the riser's height and the tread's. */
const STEPS: ReadonlyArray<readonly [number, number, number]> = [
  [462, 16, 14],
  [492, 16, 14],
  [522, 16, 14],
];
/** Where the floor starts, below the last tread. */
export const TEMPLE_FLOOR = 552;
const TREAD = paper('#f3e2d1', 0.4);
const RISER = paper('#e3cabb', 0.5);

/** A column: its middle, its foot, its shaft's width; its plinth two blocks under it, each wider. */
interface Column {
  readonly x: number;
  readonly foot: number;
  readonly wide: number;
}
/** The columns standing on the balustrade's platform, between the near ones (woman.court, woman.told). */
const FAR_COLUMNS: ReadonlyArray<Column> = [
  { x: 255, foot: 468, wide: 112 },
  { x: 1300, foot: 468, wide: 112 },
];
/** The near columns at the frame's two edges, standing on the floor. */
const NEAR_COLUMNS: ReadonlyArray<Column> = [
  { x: 30, foot: 650, wide: 156 },
  { x: 1506, foot: 650, wide: 156 },
];
const COLUMN = paper('#efdcc7', 0.6);

/** One column: its shaft from above the frame down to its plinth, lit on the light's side and shaded on the far one, the plinth's two blocks. */
const column = (ctx: CanvasRenderingContext2D, c: Column) => {
  const { x, foot, wide } = c;
  const low = 0.18 * wide;
  const high = 0.16 * wide;
  const blocks: ReadonlyArray<readonly [number, number, number]> = [
    [foot - low, low, 1.5 * wide],
    [foot - low - high, high, 1.3 * wide],
    [RUN.top, foot - low - high - RUN.top, wide],
  ];
  for (const [top, tall, w] of blocks) {
    cut(
      ctx,
      box(x - w / 2, top, w, tall),
      { color: COLUMN.color, shade: COLUMN.color },
      {
        line: 0,
        flat: true,
      },
    );
    const shade = 0.36 * w;
    cut(
      ctx,
      box(x + w / 2 - shade, top, shade, tall),
      { color: COLUMN.shade, shade: COLUMN.shade },
      {
        line: 0,
        flat: true,
      },
    );
  }
};

/** The wall's plane: the balustrade, the columns on its platform, the steps down from it, the sun's shafts over them. */
export const templeWall = (ctx: CanvasRenderingContext2D) => {
  const flat = (p: Paper, pts: ReadonlyArray<Pt>, which: 'color' | 'shade' = 'color') =>
    cut(ctx, pts, { color: p[which], shade: p[which] }, { line: 0, flat: true });
  const width = RUN.right - RUN.left;
  // The balustrade: its recessed panels, its posts, its rail with the shade under its lip, its base.
  flat(STONE_POST, box(RUN.left, RAIL.under, width, RAIL.foot - RAIL.under));
  ctx.save();
  ctx.fillStyle = STONE_RECESS;
  for (let x = RUN.left; x < RUN.right; x += RAIL.every)
    ctx.fillRect(
      x + RAIL.post + 14,
      RAIL.under + 12,
      RAIL.every - RAIL.post - 28,
      RAIL.foot - RAIL.under - 24,
    );
  ctx.restore();
  for (let x = RUN.left; x < RUN.right; x += RAIL.every) {
    flat(STONE_POST, box(x, RAIL.under, RAIL.post, RAIL.foot - RAIL.under));
    flat(
      STONE_POST,
      box(x + 0.6 * RAIL.post, RAIL.under, 0.4 * RAIL.post, RAIL.foot - RAIL.under),
      'shade',
    );
  }
  flat(STONE_PALE, box(RUN.left, RAIL.top, width, RAIL.under - RAIL.top));
  flat(STONE_PALE, box(RUN.left, RAIL.under - 5, width, 5), 'shade');
  flat(STONE_PALE, box(RUN.left, RAIL.foot, width, RAIL.base - RAIL.foot));
  for (const c of FAR_COLUMNS) column(ctx, c);
  // The steps down to the floor, each riser in a little shade under its lit tread.
  for (const [top, riser, tread] of STEPS) {
    flat(RISER, box(RUN.left, top, width, riser));
    flat(TREAD, box(RUN.left, top + riser, width, tread));
  }
  shafts(ctx, PANEL.w, PANEL.h);
};

/** The floor's pale stone, a little warmer far off. */
const FLOOR_WASH: ReadonlyArray<readonly [number, Hex]> = [
  [0, '#edd6c4'],
  [0.25, '#f2dfcd'],
  [1, '#f5e6d7'],
];
/** The violet the columns' shadows lay on the floor (the court's, `court-set.ts`): at the back, and faded at the front. */
const COLUMN_SHADOW = { color: '#b7a3dc', back: 0.3, front: 0.1 } as const;
/** The columns' shadows across the floor: each where it leaves the floor's back edge, its width there and at the frame's foot; thrown down and to the right, away from the sun. */
const SHADOW_BANDS: ReadonlyArray<readonly [number, number, number]> = [
  [-420, 70, 150],
  [60, 60, 130],
  [560, 55, 120],
  [1040, 60, 130],
  [1480, 70, 150],
];
/** How far right a shadow runs for each pixel it comes down the floor toward us. */
const THROW = 1.4;

/** The stones they dropped, as woman.told leaves them in the dust between the two: each its middle, its half-width and half-height. */
const STONES: ReadonlyArray<readonly [number, number, number, number]> = [
  [700, 868, 22, 15],
  [770, 905, 18, 13],
  [650, 930, 20, 14],
  [845, 884, 17, 12],
  [905, 935, 21, 14],
  [395, 955, 19, 13],
];
const STONE = paper('#9d8d88', 0.6);
/** The stones' ink: the set's small line. */
const STONE_LINE = 3.5;

/** A stone about (`x`, `y`), `rx` by `ry`: rounded over its top, flattened where it sits in the dust. */
const stoneShape = (x: number, y: number, rx: number, ry: number): Pt[] =>
  Array.from({ length: 18 }, (_, i): Pt => {
    const t = (i / 18) * 2 * Math.PI;
    const s = Math.sin(t);
    return [
      x + rx * Math.cos(t) * (1 + 0.07 * Math.sin(3 * t + x)),
      y + ry * s * (s > 0 ? 0.4 : 1),
    ];
  });

/** The floor's plane: the pale stone from the steps' foot, the columns' shadows across it, the stones in the dust. */
export const templeFloor = (ctx: CanvasRenderingContext2D) => {
  const y0 = TEMPLE_FLOOR;
  wash(ctx, RUN.left, y0, RUN.right - RUN.left, RUN.bottom - y0, FLOOR_WASH);
  const y1 = PANEL.h + 60;
  for (const [x0, back, front] of SHADOW_BANDS) {
    const dx = THROW * (y1 - y0);
    ctx.save();
    const g = ctx.createLinearGradient(0, y0, 0, y1);
    g.addColorStop(0, `${COLUMN_SHADOW.color}${alphaHex(COLUMN_SHADOW.back)}`);
    g.addColorStop(1, `${COLUMN_SHADOW.color}${alphaHex(COLUMN_SHADOW.front)}`);
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.moveTo(x0, y0);
    ctx.lineTo(x0 + back, y0);
    ctx.lineTo(x0 + dx + front, y1);
    ctx.lineTo(x0 + dx, y1);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }
  for (const [x, y, rx, ry] of STONES) {
    ctx.save();
    ctx.globalAlpha *= 0.5;
    ctx.fillStyle = COLUMN_SHADOW.color;
    ctx.beginPath();
    ctx.ellipse(x + 0.35 * rx, y + 0.5 * ry, 1.2 * rx, 0.45 * ry, 0, 0, 2 * Math.PI);
    ctx.fill();
    ctx.restore();
    cut(ctx, stoneShape(x, y, rx, ry), STONE, { line: STONE_LINE });
  }
};

/** The near plane: the two columns at the frame's edges, standing on the floor. */
export const templeNear = (ctx: CanvasRenderingContext2D) => {
  for (const c of NEAR_COLUMNS) column(ctx, c);
};

// ─── the house in Capernaum (roof.saw, within.bed, roof.went) ────────────────

/** Where the room's floor meets its back wall. */
export const ROOM_FLOOR = 770;
/** Where its ceiling meets the back wall: the back beam's top and foot. */
const CEILING = { beam: 296, foot: 332 } as const;

/** The back wall's plaster, paler high up where the light from the hole falls on it. */
const ROOM_WALL: ReadonlyArray<readonly [number, Hex]> = [
  [CEILING.foot, '#ebcea8'],
  [560, '#e3c29a'],
  [ROOM_FLOOR, '#d8b38b'],
];
/** The floor's beaten earth: darker at the wall, paler toward us under the light. */
const ROOM_GROUND: ReadonlyArray<readonly [number, Hex]> = [
  [0, '#d9b996'],
  [0.3, '#e6caa8'],
  [1, '#efd9bd'],
];
/** The ceiling's boards between the beams, in the shade of the roof. */
const ROOM_CEILING: Hex = '#d4ae88';
/** The beams: the room's violet, a lit face and its shaded side. */
const BEAM = paper('#9d7fa6', 0.6);

/** An opening in the room: its left, its top, its width and height. */
interface Opening {
  readonly x: number;
  readonly y: number;
  readonly w: number;
  readonly h: number;
}
/** The doorway at the back right, the town beyond it; the small window beside it; the dark doorway at the back left. */
const DOOR: Opening = { x: 868, y: 402, w: 144, h: ROOM_FLOOR - 402 };
const WINDOW_RIGHT: Opening = { x: 1282, y: 424, w: 64, h: 82 };
const DOOR_LEFT: Opening = { x: 172, y: 390, w: 78, h: 186 };
/** The day beyond the doorway: its sky, the town's pale houses, a cypress; and the dark of the inner room. */
const OUTSIDE: ReadonlyArray<readonly [number, Hex]> = [
  [0, '#f5d6bd'],
  [1, '#fae9d4'],
];
const TOWN = paper('#e8d0c1', 0.5);
const INNER: Hex = '#b9958a';
/** An opening's frame: its posts' and lintel's width, in the wall's shade. */
const FRAME = { wide: 14, color: '#c8a283' } as const;

/** The beams across the ceiling, each a quad: the back beam over the wall and the four that run back to it from the frame's corners. */
const BEAMS: ReadonlyArray<ReadonlyArray<Pt>> = [
  [
    [RUN.left, CEILING.beam],
    [RUN.right, CEILING.beam],
    [RUN.right, CEILING.foot],
    [RUN.left, CEILING.foot],
  ],
  [
    [-300, -40],
    [-300, 50],
    [448, CEILING.foot],
    [448, CEILING.beam],
  ],
  [
    [-300, 150],
    [-300, 214],
    [262, CEILING.foot],
    [262, CEILING.beam],
  ],
  [
    [1820, -90],
    [1820, -6],
    [1176, CEILING.foot],
    [1176, CEILING.beam],
  ],
  [
    [1820, 92],
    [1820, 156],
    [1344, CEILING.foot],
    [1344, CEILING.beam],
  ],
];

/** The hole they opened in the roof: its middle, its half-width and half-height, and how ragged its torn edge is. */
const HOLE = { x: 735, y: 116, rx: 456, ry: 132 } as const;
/** The hole's torn edge, all the way round. */
export const HOLE_EDGE: ReadonlyArray<Pt> = Array.from({ length: 96 }, (_, i): Pt => {
  const a = (i / 96) * 2 * Math.PI;
  const r =
    1 + 0.035 * Math.sin(5 * a + 1) + 0.022 * Math.sin(11 * a + 2) + 0.012 * Math.sin(23 * a);
  return [HOLE.x + HOLE.rx * r * Math.cos(a), HOLE.y + HOLE.ry * r * Math.sin(a)];
});
/** The sky in the hole: lavender high, rose, pale peach down at the roof's edge; its two clouds. */
const HOLE_SKY: ReadonlyArray<readonly [number, Hex]> = [
  [-40, '#cdaac8'],
  [110, '#efbdb1'],
  [250, '#f8dbc2'],
];
const HOLE_CLOUDS: ReadonlyArray<readonly [number, number, number, number]> = [
  [560, 92, 260, 36],
  [1010, 150, 220, 30],
];
/** The roof's torn edge round the hole: its broken paper lit from the sky, and how wide. */
const RIM = { color: '#f6e2c6', wide: 9 } as const;

/** `pts` as the current path, closed. */
const tracePts = (ctx: CanvasRenderingContext2D, pts: ReadonlyArray<Pt>) => {
  pts.forEach(([x, y], i) => (i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y)));
  ctx.closePath();
};

/** The hole's edge as the current path. */
export const traceHole = (ctx: CanvasRenderingContext2D) => {
  ctx.beginPath();
  tracePts(ctx, HOLE_EDGE);
};

/** One opening in the back wall: what lies beyond it, then its frame. */
const opening = (ctx: CanvasRenderingContext2D, o: Opening, beyond: () => void) => {
  ctx.save();
  ctx.beginPath();
  ctx.rect(o.x, o.y, o.w, o.h);
  ctx.clip();
  beyond();
  ctx.restore();
  const f = FRAME.wide;
  ctx.save();
  ctx.fillStyle = FRAME.color;
  ctx.fillRect(o.x - f, o.y - f, f, o.h + f);
  ctx.fillRect(o.x - f, o.y - f, o.w + 2 * f, f);
  ctx.fillRect(o.x + o.w, o.y - f, f, o.h + f);
  ctx.restore();
};

/** The back wall's plane: the plaster, the doorway with the town beyond it, the window, the dark doorway to the inner room. */
export const roomWall = (ctx: CanvasRenderingContext2D) => {
  wash(
    ctx,
    RUN.left,
    CEILING.beam,
    RUN.right - RUN.left,
    ROOM_FLOOR - CEILING.beam + 40,
    ROOM_WALL.map(([y, c]): readonly [number, Hex] => [
      (y - CEILING.beam) / (ROOM_FLOOR + 40 - CEILING.beam),
      c,
    ]),
  );
  opening(ctx, DOOR, () => {
    wash(ctx, DOOR.x, DOOR.y, DOOR.w, DOOR.h, OUTSIDE);
    cut(
      ctx,
      box(DOOR.x - 10, DOOR.y + 150, 70, 220),
      { color: TOWN.color, shade: TOWN.color },
      { line: 0, flat: true },
    );
    cut(
      ctx,
      box(DOOR.x + 70, DOOR.y + 120, 90, 250),
      { color: TOWN.shade, shade: TOWN.shade },
      { line: 0, flat: true },
    );
    const tree = cypressShape(DOOR.x + 62, DOOR.y + 190, 120, 24);
    cut(ctx, tree, { color: CYPRESS.color, shade: CYPRESS.color }, { line: 0, flat: true });
  });
  opening(ctx, WINDOW_RIGHT, () =>
    wash(ctx, WINDOW_RIGHT.x, WINDOW_RIGHT.y, WINDOW_RIGHT.w, WINDOW_RIGHT.h, OUTSIDE),
  );
  opening(ctx, DOOR_LEFT, () => {
    ctx.fillStyle = INNER;
    ctx.fillRect(DOOR_LEFT.x, DOOR_LEFT.y, DOOR_LEFT.w, DOOR_LEFT.h);
  });
};

/** The floor's plane: the beaten earth from the wall's foot toward us. */
export const roomFloor = (ctx: CanvasRenderingContext2D) =>
  wash(ctx, RUN.left, ROOM_FLOOR, RUN.right - RUN.left, RUN.bottom - ROOM_FLOOR, ROOM_GROUND);

/** The sky in the hole and its clouds: what the four are seen against. */
export const holeSky = (ctx: CanvasRenderingContext2D, hand: Hand) => {
  ctx.save();
  traceHole(ctx);
  ctx.clip();
  skyWash(ctx, HOLE_SKY);
  HOLE_CLOUDS.forEach(([x, y, w, h], i) => plane(ctx, cloudShape(x, y, w, h), CLOUD, sub(hand, i)));
  ctx.restore();
};

/** The ceiling round the hole: its boards and its beams everywhere but the hole, then the hole's torn edge lit from the sky. */
export const roomCeiling = (ctx: CanvasRenderingContext2D) => {
  ctx.save();
  ctx.beginPath();
  ctx.rect(RUN.left, RUN.top, RUN.right - RUN.left, RUN.bottom - RUN.top);
  tracePts(ctx, HOLE_EDGE);
  ctx.clip('evenodd');
  ctx.fillStyle = ROOM_CEILING;
  ctx.fillRect(RUN.left, RUN.top, RUN.right - RUN.left, CEILING.beam - RUN.top);
  for (const quad of BEAMS)
    cut(ctx, quad, { color: BEAM.color, shade: BEAM.color }, { line: 0, flat: true });
  // Each beam's underside in shade: a strip along its lower edge.
  for (const quad of BEAMS) {
    const [, , c, d] = quad;
    if (c === undefined || d === undefined) continue;
    cut(
      ctx,
      [d, c, [c[0], c[1] - 10], [d[0], d[1] - 10]],
      { color: BEAM.shade, shade: BEAM.shade },
      {
        line: 0,
        flat: true,
      },
    );
  }
  ctx.save();
  ctx.lineJoin = 'round';
  ctx.strokeStyle = RIM.color;
  ctx.lineWidth = RIM.wide;
  traceHole(ctx);
  unprobedStroke(ctx);
  ctx.restore();
  ctx.restore();
};

/** The light falling through the hole onto the floor: each shaft's foot on the floor, its width there, and its light. */
const HOLE_SHAFTS: ReadonlyArray<readonly [number, number, number]> = [
  [520, 170, 0.16],
  [760, 210, 0.2],
  [1010, 150, 0.14],
];
/** The shafts' warm white. */
const SHAFT: Hex = '#fff4e2';

/** The light from the hole: soft shafts from its lower edge down to the floor, strongest at the hole. */
export const holeShafts = (ctx: CanvasRenderingContext2D) => {
  for (const [x, w, a] of HOLE_SHAFTS) {
    const top = HOLE.y + 0.8 * HOLE.ry;
    const x0 = HOLE.x + (x - HOLE.x) * 0.55;
    const g = ctx.createLinearGradient(0, top, 0, ROOM_FLOOR + 160);
    g.addColorStop(0, `${SHAFT}${alphaHex(a)}`);
    g.addColorStop(1, `${SHAFT}00`);
    ctx.save();
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.moveTo(x0 - 0.3 * w, top);
    ctx.lineTo(x0 + 0.3 * w, top);
    ctx.lineTo(x + w / 2, ROOM_FLOOR + 160);
    ctx.lineTo(x - w / 2, ROOM_FLOOR + 160);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }
};

/** The ropes they let the bed down by: their rope colour and its ink, widths, Board pixels. */
const ROPE = { color: '#d8b98f', ink: 6, wide: 3.5 } as const;

/** A rope from `a` to `b`, slack by `sag` at its middle: a plain cord, lined. */
export const rope = (ctx: CanvasRenderingContext2D, a: Pt, b: Pt, sag: number, ink: Hex) => {
  const mid: Pt = [(a[0] + b[0]) / 2 + 0.3 * sag, (a[1] + b[1]) / 2 + sag];
  ctx.save();
  ctx.lineCap = 'round';
  for (const [color, width] of [
    [ink, ROPE.ink],
    [ROPE.color, ROPE.wide],
  ] as const) {
    ctx.strokeStyle = color;
    ctx.lineWidth = width;
    ctx.beginPath();
    ctx.moveTo(a[0], a[1]);
    ctx.quadraticCurveTo(mid[0], mid[1], b[0], b[1]);
    unprobedStroke(ctx);
  }
  ctx.restore();
};

/**
 * The man's bed, held with him (a blocked mass: its silhouette, no cloth):
 * its two ends, the pallet's top, the frame's depth under it and its legs';
 * the pillow at its head, where it starts, how wide, how high it rises.
 */
export const BED = {
  left: 420,
  right: 1000,
  top: 790,
  frame: 46,
  leg: 34,
  pillow: { x: 436, w: 236, rise: 40 },
} as const;
const BED_PAPER = paper('#cdb39a', 0.6);
/** The held bed's ink, as wide as a held person's. */
const BED_LINE = 5;

/** The frame, its legs and the pallet with the raised head: one blocked silhouette. */
export const bedMass = (ctx: CanvasRenderingContext2D) => {
  const { left, right, top, frame, leg, pillow } = BED;
  const base = top + frame;
  const pts: Pt[] = [
    [left, base],
    [left, top],
    ...spline(
      [
        [pillow.x, top],
        [pillow.x + 0.2 * pillow.w, top - pillow.rise],
        [pillow.x + 0.75 * pillow.w, top - 0.8 * pillow.rise],
        [pillow.x + pillow.w, top - 6],
      ],
      6,
    ),
    [right, top - 6],
    [right, base],
    [right - 30, base],
    [right - 30, base + leg],
    [right - 66, base + leg],
    [right - 66, base],
    [left + 66, base],
    [left + 66, base + leg],
    [left + 30, base + leg],
    [left + 30, base],
  ];
  cut(ctx, pts, BED_PAPER, { line: BED_LINE });
};

/** The four ropes' ties on the bed, where each comes down: two at its head, two at its foot. */
export const TIES: readonly [Pt, Pt, Pt, Pt] = [
  [438, 792],
  [466, 787],
  [954, 787],
  [982, 792],
];

// ─── the house's people, held ────────────────────────────────────────────────

/**
 * The four who carry him, at the hole in the roof (within.bed, roof.saw):
 * their heads and shoulders over its edge, looking down, their hands on the
 * torn edge where they hold the ropes; left to right, each turned and leaning
 * in toward the bed below.
 */
export const BEARERS: ReadonlyArray<Held> = [
  {
    who: 'tallBack',
    at: [424, 452],
    depth: 0.62,
    facing: 0.5,
    lift: -0.6,
    lean: 0.1,
    hands: [
      [380, 199],
      [470, 222],
    ],
  },
  {
    who: 'elder',
    at: [600, 466],
    depth: 0.62,
    facing: 0.3,
    lift: -0.6,
    lean: 0.05,
    hands: [
      [540, 236],
      [668, 241],
    ],
  },
  {
    who: 'broad',
    at: [836, 470],
    depth: 0.62,
    facing: -0.3,
    lift: -0.6,
    lean: -0.05,
    hands: [
      [770, 240],
      [905, 236],
    ],
  },
  {
    who: 'climber',
    at: [1024, 456],
    depth: 0.62,
    facing: -0.5,
    lift: -0.6,
    lean: -0.1,
    hands: [
      [1052, 224],
      [1100, 204],
    ],
  },
];

/** The ropes, each from the bearer's hand that holds it to its tie: the outer two men's at the bed's head and foot, the inner two's beside them. */
export const ROPES: ReadonlyArray<readonly [Pt, Pt]> = [
  [[380, 199], TIES[0]],
  [[540, 236], TIES[1]],
  [[905, 236], TIES[2]],
  [[1052, 224], TIES[3]],
];

/**
 * The crowd that fills the house behind the bed (within.bed), farthest row
 * first: a row under the back wall, smaller, and a nearer one; their heads
 * between the hole's light and the bed, their feet hidden behind it.
 */
export const CROWD: ReadonlyArray<Held> = [
  { who: 'tallBack', at: [372, 774], depth: 0.52, facing: 0.3 },
  { who: 'womanLeft', at: [458, 778], depth: 0.52, facing: 0.2 },
  { who: 'elder', at: [548, 776], depth: 0.52, facing: 0.1 },
  { who: 'broad', at: [646, 778], depth: 0.52, facing: 0 },
  { who: 'womanRight', at: [738, 778], depth: 0.52, facing: -0.1 },
  { who: 'tallLeft', at: [826, 774], depth: 0.52, facing: -0.2 },
  { who: 'tallLeft', at: [1070, 774], depth: 0.52, facing: -0.3 },
  { who: 'climber', at: [1190, 778], depth: 0.52, facing: -0.4 },
  { who: 'womanRight', at: [1290, 780], depth: 0.52, facing: -0.4 },
  { who: 'broad', at: [324, 792], depth: 0.62, facing: 0.4 },
  { who: 'child', at: [414, 796], depth: 0.62, facing: 0.3 },
  { who: 'womanLeft', at: [500, 794], depth: 0.62, facing: 0.2 },
  { who: 'tallLeft', at: [596, 790], depth: 0.62, facing: 0.1 },
  { who: 'elder', at: [694, 794], depth: 0.62, facing: 0 },
  { who: 'womanRight', at: [784, 794], depth: 0.62, facing: -0.2 },
  { who: 'child', at: [868, 798], depth: 0.62, facing: -0.2 },
];

/** Those who stand at the room's two sides, nearer, round the bed and Him: beside the bed's head on the left, and behind Him on the right. */
export const SIDES: ReadonlyArray<Held> = [
  { who: 'tallLeft', at: [150, 866], depth: 0.86, facing: 0.5 },
  { who: 'womanLeft', at: [282, 884], depth: 0.86, facing: 0.4 },
  { who: 'broad', at: [1262, 832], depth: 0.78, facing: -0.5 },
  { who: 'elder', at: [1418, 838], depth: 0.78, facing: -0.5 },
  { who: 'womanRight', at: [1340, 862], depth: 0.82, facing: -0.45 },
];

/** The heads nearest us, at the frame's two edges, cut by it: the room seen past the backs of the crowd. */
export const NEAR: ReadonlyArray<Held> = [
  { who: 'broad', at: [70, 1640], depth: 1.8, facing: 0.6 },
  { who: 'elder', at: [1530, 1330], depth: 1.6, facing: -0.7 },
  { who: 'womanRight', at: [1390, 1660], depth: 1.8, facing: -0.6 },
];

/** The paper a held person is blocked in, its crease and its ink, as look-props' `campMass` blocks the camp's (one muted warm, its shade turned toward the light's complement). */
const MASS = ramp('#a58a7c', keyLight, shading);
const MASS_TURN: Crease = { at: 0.62, soft: 0.05 };
const MASS_LINE = 5;

/** `pts`, closed, filled with the mass's paper, creased at the light (`campMass`'s). */
const massCut = (ctx: CanvasRenderingContext2D, pts: ReadonlyArray<Pt>) => {
  const { start, end, at } = creaseOf(boxOf(pts), MASS_TURN);
  const soft = MASS_TURN.soft ?? 0;
  const g = ctx.createLinearGradient(start[0], start[1], end[0], end[1]);
  g.addColorStop(0, MASS.base);
  g.addColorStop(clamp(at - soft / 2), MASS.base);
  g.addColorStop(clamp(at + soft / 2), MASS.shade);
  g.addColorStop(1, MASS.shade);
  ctx.beginPath();
  tracePts(ctx, pts);
  ctx.fillStyle = g;
  ctx.fill();
};

/**
 * The man lying on his bed, held as a blocked mass (within.bed): his kit
 * body (the broad one); his trunk's length from his hip to his shoulders and
 * its depth at his chest and his hips; his legs' length from his hip, lying
 * along the pallet, and how high their top stands over it along them (shares
 * of his hips' depth, from his hip to past his feet: his thighs, his knees,
 * his shins, his toes standing up, his heels); how far his head sits forward
 * of his trunk's line and out from his shoulders against its own height;
 * his kit units.
 */
const LYING = {
  body: 'climber',
  trunk: 72,
  chest: 76,
  hips: 56,
  legs: 185,
  shins: [
    [0, 0.98],
    [0.25, 0.78],
    [0.5, 0.62],
    [0.78, 0.5],
    [0.93, 0.7],
    [1, 0.42],
    [1.03, 0.1],
  ],
  forward: 0.1,
  neck: 0.32,
} as const;

/**
 * How the man lies: his hip on the pallet (where his trunk turns as it rises)
 * and his size; how far his trunk is raised from lying flat and his head
 * above his trunk (radians); his hands on the bed, Board pixels; his ink
 * against the house figure line.
 */
export interface LyingPose {
  readonly hip: Pt;
  readonly scale: number;
  readonly rise: number;
  readonly head: number;
  readonly hands: readonly [Pt, Pt];
  readonly line: number;
}

/** Where the man's hip lies at `x` for his size `scale`: as high over the pallet as half his hips' depth. */
export const hipOn = (x: number, scale: number): Pt => [x, BED.top - 0.5 * LYING.hips * scale];

/**
 * The man as a blocked mass lying on his back on the pallet, his trunk raised
 * from his hip: his legs along the pallet, his trunk and his head under one
 * ink round the three, sunk into the pallet where they lie on it (cut at its
 * top, so the bed's own line runs under him); his hands free circles each
 * lined round, pressing at the bed; no face, no cloth. The head is declared
 * to the check as the face's place.
 */
export const lyingMass = (ctx: CanvasRenderingContext2D, p: LyingPose) => {
  const b = bodyOf(LYING.body);
  const { trunk, chest, hips, legs } = LYING;
  const pallet = (BED.top - p.hip[1]) / p.scale;
  const along: Pt = [-Math.cos(p.rise), -Math.sin(p.rise)];
  const up: Pt = [Math.sin(p.rise), -Math.cos(p.rise)];
  const on = (a: number, c: number): Pt => [a * along[0] + c * up[0], a * along[1] + c * up[1]];
  const thighs = spline(
    LYING.shins.map(([x, k]): Pt => [x * legs, pallet - k * hips]),
    6,
  );
  const legsShape: Pt[] = [...thighs, [1.03 * legs, pallet + 10], [-0.2 * hips, pallet + 10]];
  const body = spline(
    [
      on(-0.3 * hips, -0.5 * hips),
      on(0.5 * trunk, -0.5 * chest),
      on(trunk, -0.42 * chest),
      on(trunk + 0.2 * chest, 0),
      on(0.9 * trunk, 0.5 * chest),
      on(0.4 * trunk, 0.5 * chest),
      on(-0.1 * hips, 0.48 * hips),
    ],
    5,
  );
  const lift = p.rise + p.head;
  const crown: Pt = [-Math.cos(lift), -Math.sin(lift)];
  const across: Pt = [Math.sin(lift), -Math.cos(lift)];
  const [nx, ny] = on(trunk, LYING.forward * chest);
  const mid: Pt = [nx + LYING.neck * b.head * crown[0], ny + LYING.neck * b.head * crown[1]];
  const head = Array.from({ length: 40 }, (_, i): Pt => {
    const t = (i / 40) * 2 * Math.PI;
    const a = (b.head / 2) * Math.sin(t);
    const c = (b.wide / 2) * Math.cos(t);
    return [mid[0] + a * crown[0] + c * across[0], mid[1] + a * crown[1] + c * across[1]];
  });
  const r = 0.17 * b.wide;
  const hands = p.hands.map(([x, y]) => {
    const hx = (x - p.hip[0]) / p.scale;
    const hy = (y - p.hip[1]) / p.scale;
    return Array.from({ length: 28 }, (_, i): Pt => {
      const t = (i / 28) * 2 * Math.PI;
      return [hx + r * Math.cos(t), hy + r * Math.sin(t)];
    });
  });
  ctx.save();
  ctx.translate(p.hip[0], p.hip[1]);
  ctx.scale(p.scale, p.scale);
  ctx.lineJoin = 'round';
  ctx.strokeStyle = C.outline;
  ctx.lineWidth = 2 * MASS_LINE * p.line;
  // Sunk into the pallet: all of him above its top, a little short of its line.
  ctx.save();
  ctx.beginPath();
  ctx.rect(-4 * legs, -4 * legs, 8 * legs, 4 * legs + pallet - 2 / p.scale);
  ctx.clip();
  for (const part of [legsShape, body, head]) {
    ctx.beginPath();
    tracePts(ctx, part);
    unprobedStroke(ctx);
  }
  for (const part of [legsShape, body, head]) massCut(ctx, part);
  ctx.restore();
  for (const hand of hands) {
    ctx.beginPath();
    tracePts(ctx, hand);
    unprobedStroke(ctx);
    massCut(ctx, hand);
  }
  probeFace(ctx, mid[0], mid[1], 0.7 * b.head);
  ctx.restore();
};

/** Where the man's head is as he lies in `p`, Board pixels: what eyes on him rest on. */
export const lyingHead = (p: LyingPose): Pt => {
  const b = bodyOf(LYING.body);
  const lift = p.rise + p.head;
  const a = LYING.trunk;
  const c = LYING.forward * LYING.chest;
  const x = -a * Math.cos(p.rise) + c * Math.sin(p.rise) - LYING.neck * b.head * Math.cos(lift);
  const y = -a * Math.sin(p.rise) - c * Math.cos(p.rise) - LYING.neck * b.head * Math.sin(lift);
  return [p.hip[0] + p.scale * x, p.hip[1] + p.scale * y];
};

/** The held bed's shadow on the floor, under its frame, `amount` of it. */
export const bedShadow = (ctx: CanvasRenderingContext2D, ink: Hex, amount = 1) => {
  if (amount <= 0) return;
  const { left, right, top, frame, leg } = BED;
  ctx.save();
  ctx.globalAlpha *= 0.35 * amount;
  ctx.fillStyle = ink;
  ctx.beginPath();
  ctx.ellipse(
    (left + right) / 2 + 30,
    top + frame + leg,
    (right - left) / 2 + 30,
    18,
    0,
    0,
    2 * Math.PI,
  );
  ctx.fill();
  ctx.restore();
};

/** The bed's middle, Board pixels: what it gathers in about as he takes it up. */
const BED_MIDDLE: Pt = [
  (BED.left + BED.right) / 2,
  BED.top + (BED.frame + BED.leg - BED.pillow.rise) / 2,
];
/** The bed's length and height, its pillow to its feet. */
const BED_SIZE: Pt = [BED.right - BED.left, BED.pillow.rise + BED.frame + BED.leg];

/**
 * The held bed `k` of the way gathered up (roof.went): drawn in about its
 * middle toward `to`, down to `size` (the roll it becomes); gone once
 * gathered, the roll in his arms in its place.
 */
export const bedGathered = (ctx: CanvasRenderingContext2D, k: number, to: Pt, size: Pt) => {
  if (k >= 1) return;
  ctx.save();
  ctx.translate(lerp(BED_MIDDLE[0], to[0], k), lerp(BED_MIDDLE[1], to[1], k));
  ctx.scale(lerp(1, size[0] / BED_SIZE[0], k), lerp(1, size[1] / BED_SIZE[1], k));
  ctx.translate(-BED_MIDDLE[0], -BED_MIDDLE[1]);
  bedMass(ctx);
  ctx.restore();
};

/** The bed rolled up, held with him (a blocked mass: its silhouette): about `c`, `long` and `thick`, turned `tilt`. */
export const rollMass = (
  ctx: CanvasRenderingContext2D,
  c: Pt,
  long: number,
  thick: number,
  tilt: number,
) => {
  const r = thick / 2;
  const half = long / 2 - r;
  const end = (x: number, from: number): Pt[] =>
    Array.from({ length: 13 }, (_, i): Pt => {
      const a = from + (i / 12) * Math.PI;
      return [x + r * Math.cos(a), r * Math.sin(a)];
    });
  const cos = Math.cos(tilt);
  const sin = Math.sin(tilt);
  const pts = [...end(half, -Math.PI / 2), ...end(-half, Math.PI / 2)].map(([x, y]): Pt => [
    c[0] + x * cos - y * sin,
    c[1] + x * sin + y * cos,
  ]);
  cut(ctx, pts, BED_PAPER, { line: BED_LINE });
};

/** Where each rope's end hangs once the bed is down and its ties are loosed (roof.went): drawn up short, swinging under the hand that holds it, in the order of `ROPES`. */
export const SLACK: readonly [Pt, Pt, Pt, Pt] = [
  [372, 318],
  [552, 340],
  [896, 344],
  [1062, 326],
];

// ─── the page holding his feet (`we`, `arose`) ───────────────────────────────

/**
 * The page holding his feet (`we`): a strip of it torn up and laid across
 * both his feet, pinning them to it, from his feet's middle, Board pixels:
 * whole, and as the two halves it tears into between his feet as they come
 * free (the far one first), each about its own middle.
 */
const HOLD: ReadonlyArray<Pt> = [
  [-78, -22],
  [-40, -28],
  [0, -25],
  [38, -29],
  [78, -21],
  [80, 9],
  [36, 7],
  [-36, 10],
  [-80, 8],
];
const HOLD_HALVES: readonly [ReadonlyArray<Pt>, ReadonlyArray<Pt>] = [
  [
    [-78, -22],
    [-40, -28],
    [0, -25],
    [3, -16],
    [-2, -8],
    [2, 0],
    [-1, 9],
    [-36, 10],
    [-80, 8],
  ],
  [
    [0, -25],
    [38, -29],
    [78, -21],
    [80, 9],
    [36, 7],
    [-1, 9],
    [2, 0],
    [-2, -8],
    [3, -16],
  ],
];
const HALF_MIDDLE: Pt = [40, -9];

/**
 * How the halves fly as the strip tears: how far out, how high they lift,
 * how far they fall back, how far they turn; when they have gone (shares of
 * the tear); the shadow the strip lays on the page, lifted off it.
 */
const TEAR_OFF = {
  out: 46,
  lift: 40,
  fall: 52,
  turn: 0.85,
  gone: [0.45, 1],
  shadow: 0.85,
} as const;
/** The strip's paper: the page's own, turned up to the light, so paler than the sheet it lies on. */
const HOLD_PAPER: Hex = mix(C.cream, C.peachTop, 0.1);

/**
 * The page over his feet, his feet's middle at `feet`: a strip of it laid
 * across both, holding them fast; `tear` of the way torn, split between his
 * feet and its halves flown off to the sides and fallen, gone.
 */
export const hold = (ctx: CanvasRenderingContext2D, feet: Pt, tear: number, hand: Hand) => {
  const strip = (pts: ReadonlyArray<Pt>, h: Hand, alpha: number) =>
    piece(ctx, pts, HOLD_PAPER, h, {
      role: 'scenery',
      kind: 'torn',
      shadow: TEAR_OFF.shadow,
      alpha,
    });
  const [fx, fy] = feet;
  if (tear <= 0) {
    strip(
      HOLD.map(([x, y]): Pt => [fx + x, fy + y]),
      hand,
      1,
    );
    return;
  }
  const shown = 1 - smooth(TEAR_OFF.gone[0], TEAR_OFF.gone[1], tear);
  if (shown <= 0) return;
  HOLD_HALVES.forEach((half, j) => {
    const side = j === 0 ? -1 : 1;
    const [hx, hy] = [side * HALF_MIDDLE[0], HALF_MIDDLE[1]];
    const mx = fx + hx + side * TEAR_OFF.out * tear;
    const my = fy + hy - TEAR_OFF.lift * tear + TEAR_OFF.fall * tear * tear;
    const a = side * TEAR_OFF.turn * tear;
    const cos = Math.cos(a);
    const sin = Math.sin(a);
    strip(
      half.map(([x, y]): Pt => {
        const dx = x - hx;
        const dy = y - hy;
        return [mx + dx * cos - dy * sin, my + dx * sin + dy * cos];
      }),
      sub(hand, 1 + j),
      shown,
    );
  });
};

/** A stroke of the current path, not recorded as ink over a face (a prop's own line). */
const unprobedStroke = (ctx: CanvasRenderingContext2D) => unprobed(ctx, () => ctx.stroke());

/** `a` (0..1) as two hex digits, for a colour's alpha. */
const alphaHex = (a: number) =>
  Math.round(Math.min(1, Math.max(0, a)) * 255)
    .toString(16)
    .padStart(2, '0');
