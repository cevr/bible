// The v3 court (the Board's `cold.evidence`, `cold.cover` and `title.start`):
// one set drawn in the Board's own pixels (a panel is 1536 × 1024), so a
// scene frames it with a camera (`REST` is the evidence panel's framing) and
// every figure stands where its panel stands it. The house look's paper:
// flat pieces in the film's ink, each creased once at the light's angle, its
// far side the paper's shade (a hue of its own, CRAFT rule 12); cast
// shadows violet on the lilac floor, never grey. The room runs on past the
// panel's edges, up the wall and back to the pews, for `title`'s high wide.
// Its lines (outlines, creases, the crack, the sheets' red scrawl) are the
// backdrop that a title or card covers, never ink that crosses one, so each
// is drawn `unprobed`. The v2 canvas court (`court.ts`) stays for v2 and
// cold-studies. Pure: the same frame draws the same set.

import { type Camera, type Hex, mix, ramp, unprobed } from '@bible/film/canvas';
import { rng } from '@bible/film/core';
import { keyLight, shading } from '../cold-studies/palette.ts';
import { type Pt, boxOf, creaseOf } from '../cold-studies/looks/rive/parts.ts';
import { C } from './kit.ts';

/** The evidence panel's framing: the Board's 1536 wide at the film's 1920, its top trimmed. */
export const REST: Camera = { x: 768, y: 495, zoom: 1.25 };

/** Where every plane lines up while the camera rests on `REST`. */
export const REST_POINT: readonly [number, number] = [REST.x, REST.y];

/** Where the figures stand, in the Board's pixels. */
export const PLACE = {
  /** The lead's feet, behind the dock's front rail. */
  lead: [293, 725],
  /** The prosecutor's feet, behind the table. */
  prosecutor: [748, 800],
  /** The judge's head's centre, behind the bench. */
  judge: [1312, 196],
} as const satisfies Record<string, Pt>;

/** The ink's weight on the set, in the Board's pixels: a little under the figures' silhouette line. */
const LINE = 5;
const LINE_SMALL = 3.5;

/** A paper as the set cuts it: its colour and its crease's far side. */
interface SetPaper {
  readonly color: Hex;
  readonly shade: Hex;
}

/**
 * How far toward its ramp's shade the set's crease falls: the room is lit
 * evenly and stands back, so its far sides are softer than the figures'.
 */
const SET_SHADE = 0.5;

/** `base`'s ramp under the court's key light, its shade softened (`SET_SHADE`). */
const paper = (base: Hex): SetPaper => {
  const r = ramp(base, keyLight, shading);
  return { color: r.base, shade: mix(r.base, r.shade, SET_SHADE) };
};

/** The set's papers. */
const P = {
  wall: paper('#f3e9d5'),
  column: paper('#d9b58f'),
  columnDeep: paper('#c49a72'),
  wainscot: paper('#6fa4a6'),
  wainscotRail: paper('#86b8b6'),
  floor: paper('#efe6ee'),
  wood: paper('#b47a4c'),
  woodLight: paper('#c58d5c'),
  bench: paper('#a8703f'),
  benchTop: paper('#bc8352'),
  chair: paper('#a53f31'),
  frame: paper('#93b5b2'),
  sheet: paper('#fbf6ee'),
  gavel: paper('#8a5332'),
} as const;

/** The violet a cast shadow lays on the floor, and the warm of a light beam. */
const SHADOW: Hex = '#b7a3dc';
const BEAM: Hex = '#fff0bf';

/** A rectangle's corners, clockwise. */
export const box = (x: number, y: number, w: number, h: number): Pt[] => [
  [x, y],
  [x + w, y],
  [x + w, y + h],
  [x, y + h],
];

/** `pts` as the current path. */
const trace = (ctx: CanvasRenderingContext2D, pts: ReadonlyArray<Pt>) => {
  ctx.beginPath();
  pts.forEach(([x, y], i) => (i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y)));
  ctx.closePath();
};

/**
 * One piece of the set: `pts` in `p`'s paper, creased once at the light's
 * angle (`creaseOf`, the rigs' own) unless `flat`, and lined in the ink.
 */
export const cut = (
  ctx: CanvasRenderingContext2D,
  pts: ReadonlyArray<Pt>,
  p: SetPaper,
  opts: { readonly line?: number; readonly flat?: boolean; readonly alpha?: number } = {},
) => {
  ctx.save();
  if (opts.alpha !== undefined) ctx.globalAlpha *= opts.alpha;
  trace(ctx, pts);
  if (opts.flat === true) ctx.fillStyle = p.color;
  else {
    const { start, end, at } = creaseOf(boxOf(pts));
    const g = ctx.createLinearGradient(start[0], start[1], end[0], end[1]);
    g.addColorStop(0, p.color);
    g.addColorStop(at, p.color);
    g.addColorStop(Math.min(1, at + 0.002), p.shade);
    g.addColorStop(1, p.shade);
    ctx.fillStyle = g;
  }
  ctx.fill();
  const line = opts.line ?? LINE;
  if (line > 0) {
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    ctx.lineWidth = line;
    ctx.strokeStyle = C.outline;
    unprobed(ctx, () => ctx.stroke());
  }
  ctx.restore();
};

/** A shadow cast on the floor: `pts` in the floor's violet at `alpha`. */
export const floorShadow = (
  ctx: CanvasRenderingContext2D,
  pts: ReadonlyArray<Pt>,
  alpha: number,
) => {
  ctx.save();
  ctx.globalAlpha *= alpha;
  ctx.fillStyle = SHADOW;
  trace(ctx, pts);
  ctx.fill();
  ctx.restore();
};

/**
 * What an upright thing standing on the floor along `x0..x1` at `y`, `h`
 * tall, casts: a band thrown down and to the right, away from the window.
 */
const thrown = (x0: number, x1: number, y: number, h: number): Pt[] => {
  const dx = 0.5 * h;
  const dy = 0.22 * h;
  return [
    [x0, y],
    [x1, y],
    [x1 + dx, y + dy],
    [x0 + dx, y + dy],
  ];
};

/** A soft contact shadow under feet at `(x, y)`, `rx` wide. */
export const contact = (ctx: CanvasRenderingContext2D, x: number, y: number, rx: number) => {
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(1, 0.26);
  const g = ctx.createRadialGradient(0, 0, 0, 0, 0, rx);
  g.addColorStop(0, `${SHADOW}c0`);
  g.addColorStop(1, `${SHADOW}00`);
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(0, 0, rx, 0, 2 * Math.PI);
  ctx.fill();
  ctx.restore();
};

// ─── the room ────────────────────────────────────────────────────────────────

/** How far the room runs, for `title`'s wide: left, right, up, and down to the pews. */
const ROOM = {
  left: -1300,
  right: 2900,
  top: -700,
  wainscot: 418,
  floor: 715,
  bottom: 1700,
} as const;

/** The pilasters' centres: the panel's four, and the room's on past them. */
const COLUMNS = [-1060, -520, 62, 617, 1087, 1542, 2000, 2470] as const;

/** The window in the left wall, as the panels place it: its frame. */
const WINDOW = { x: 170, y: -10, w: 330, h: 316 } as const;

/** One pilaster at `x`: shaft, capital and base, from the room's top to the wainscot. */
const column = (ctx: CanvasRenderingContext2D, x: number) => {
  const w = 96;
  cut(ctx, box(x - w / 2, ROOM.top, w, ROOM.wainscot - ROOM.top), P.column);
  cut(ctx, box(x - w / 2 - 12, ROOM.top + 8, w + 24, 0), P.column, { line: 0 });
  // The base: two steps wider than the shaft, on the wainscot's rail.
  cut(ctx, box(x - w / 2 - 10, ROOM.wainscot - 58, w + 20, 30), P.columnDeep, { line: LINE_SMALL });
  cut(ctx, box(x - w / 2 - 16, ROOM.wainscot - 28, w + 32, 28), P.columnDeep, { line: LINE_SMALL });
  // The fluting: two shallow grooves down the shaft.
  ctx.save();
  ctx.strokeStyle = `${P.column.shade}`;
  ctx.lineWidth = 6;
  for (const dx of [-18, 18]) {
    ctx.beginPath();
    ctx.moveTo(x + dx, ROOM.top);
    ctx.lineTo(x + dx, ROOM.wainscot - 70);
    unprobed(ctx, () => ctx.stroke());
  }
  ctx.restore();
};

/** The window: its frame, the teal day beyond it (sky, a far city, cypresses), its sill. */
const window_ = (ctx: CanvasRenderingContext2D) => {
  const { x, y, w, h } = WINDOW;
  cut(ctx, box(x, y, w, h), P.frame);
  const ix = x + 22;
  const iy = y + 22;
  const iw = w - 44;
  const ih = h - 44;
  ctx.save();
  trace(ctx, box(ix, iy, iw, ih));
  ctx.clip();
  const sky = ctx.createLinearGradient(0, iy, 0, iy + ih);
  sky.addColorStop(0, '#8fcbe8');
  sky.addColorStop(1, '#e4f3f6');
  ctx.fillStyle = sky;
  ctx.fillRect(ix, iy, iw, ih);
  // A cloud, the far city's blocks, and the cypresses before them.
  ctx.fillStyle = '#f6fbfb';
  ctx.beginPath();
  ctx.ellipse(ix + 60, iy + 70, 48, 16, 0, 0, 2 * Math.PI);
  ctx.ellipse(ix + 95, iy + 62, 30, 20, 0, 0, 2 * Math.PI);
  ctx.fill();
  ctx.fillStyle = '#9fb3dc';
  for (const [bx, bw, bh] of [
    [70, 60, 90],
    [125, 80, 120],
    [200, 50, 70],
  ] as const)
    ctx.fillRect(ix + bx, iy + ih - bh, bw, bh);
  ctx.fillStyle = '#4f9a8f';
  for (const [cx, ch, cw] of [
    [40, 110, 16],
    [250, 170, 22],
    [278, 120, 16],
    [62, 70, 11],
  ] as const) {
    ctx.beginPath();
    ctx.ellipse(ix + cx, iy + ih - ch / 2, cw, ch / 2, 0, 0, 2 * Math.PI);
    ctx.fill();
  }
  ctx.restore();
  ctx.save();
  ctx.lineWidth = LINE;
  ctx.strokeStyle = C.outline;
  trace(ctx, box(ix, iy, iw, ih));
  unprobed(ctx, () => ctx.stroke());
  ctx.restore();
  cut(ctx, box(x - 14, y + h - 6, w + 28, 22), P.frame, { line: LINE_SMALL });
};

/** The wainscot: its rail and the panels let into it, round the room. */
const wainscot = (ctx: CanvasRenderingContext2D) => {
  cut(
    ctx,
    box(ROOM.left, ROOM.wainscot, ROOM.right - ROOM.left, ROOM.floor - ROOM.wainscot),
    P.wainscot,
    {
      flat: true,
    },
  );
  cut(ctx, box(ROOM.left, ROOM.wainscot, ROOM.right - ROOM.left, 22), P.wainscotRail, {
    line: LINE_SMALL,
    flat: true,
  });
  ctx.save();
  ctx.strokeStyle = P.wainscot.shade;
  ctx.lineWidth = 5;
  for (let x = ROOM.left + 40; x < ROOM.right - 300; x += 400) {
    unprobed(ctx, () =>
      ctx.strokeRect(x, ROOM.wainscot + 60, 340, ROOM.floor - ROOM.wainscot - 110),
    );
  }
  ctx.restore();
};

/** The light through the window: warm beams falling down and to the right, over the wall and the floor. */
const beams = (ctx: CanvasRenderingContext2D) => {
  ctx.save();
  for (const [x0, w, a] of [
    [-40, 90, 0.42],
    [120, 70, 0.32],
    [250, 120, 0.26],
  ] as const) {
    const g = ctx.createLinearGradient(x0, -200, x0 + 760, 1000);
    g.addColorStop(0, `${BEAM}ff`);
    g.addColorStop(1, `${BEAM}00`);
    ctx.globalAlpha = a;
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.moveTo(x0, -200);
    ctx.lineTo(x0 + w, -200);
    ctx.lineTo(x0 + w + 760, 1000);
    ctx.lineTo(x0 + 760, 1000);
    ctx.closePath();
    ctx.fill();
  }
  ctx.restore();
};

/** The back of the room: wall, window, pilasters and wainscot. Behind everything. */
export const backWall = (ctx: CanvasRenderingContext2D) => {
  ctx.fillStyle = P.wall.color;
  ctx.fillRect(ROOM.left, ROOM.top - 400, ROOM.right - ROOM.left, ROOM.wainscot - ROOM.top + 400);
  window_(ctx);
  for (const x of COLUMNS) column(ctx, x);
  wainscot(ctx);
};

/** The crack across the floor from the dock's foot (paid off in `court`). */
const CRACK: ReadonlyArray<Pt> = [
  [352, 830],
  [395, 862],
  [418, 855],
  [455, 902],
  [492, 915],
  [520, 948],
  [545, 952],
  [590, 1010],
];

/** The floor: pale lilac, the crack, and the beams' warmth on it. */
export const floor = (ctx: CanvasRenderingContext2D) => {
  const g = ctx.createLinearGradient(0, ROOM.floor, 0, ROOM.bottom);
  g.addColorStop(0, P.floor.color);
  g.addColorStop(1, '#e6dcef');
  ctx.fillStyle = g;
  ctx.fillRect(ROOM.left, ROOM.floor, ROOM.right - ROOM.left, ROOM.bottom - ROOM.floor);
  // The skirting where the wainscot meets the floor.
  ctx.save();
  ctx.strokeStyle = C.outline;
  ctx.lineWidth = LINE_SMALL;
  ctx.beginPath();
  ctx.moveTo(ROOM.left, ROOM.floor);
  ctx.lineTo(ROOM.right, ROOM.floor);
  unprobed(ctx, () => ctx.stroke());
  ctx.strokeStyle = '#6f64a2';
  ctx.lineWidth = 3;
  ctx.lineJoin = 'miter';
  ctx.beginPath();
  CRACK.forEach(([x, y], i) => (i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y)));
  unprobed(ctx, () => ctx.stroke());
  ctx.restore();
  beams(ctx);
};

// ─── the furniture ───────────────────────────────────────────────────────────

/** The dock: its posts and rails, the lead behind them. */
const DOCK = { x0: 55, x1: 530, top: 590, foot: 825 } as const;

/** The dock's shadow on the floor, thrown away from the window. */
export const dockShadow = (ctx: CanvasRenderingContext2D) =>
  floorShadow(ctx, thrown(DOCK.x0, DOCK.x1, DOCK.foot, DOCK.foot - DOCK.top), 0.42);

/** The dock's front: two capped posts, the top and bottom rails and the balusters between. */
export const dock = (ctx: CanvasRenderingContext2D) => {
  const { x0, x1, top, foot } = DOCK;
  const rail = 640;
  for (let x = 140; x < 470; x += 54) cut(ctx, box(x, rail, 22, 120), P.wood, { line: LINE_SMALL });
  cut(ctx, box(x0 + 40, rail - 20, x1 - x0 - 80, 28), P.woodLight);
  cut(ctx, box(x0 + 40, 760, x1 - x0 - 80, 34), P.wood);
  cut(ctx, box(x0, foot - 34, x1 - x0, 34), P.wood);
  for (const x of [x0, x1 - 64]) {
    cut(ctx, box(x + 6, top + 22, 52, foot - top - 22), P.wood);
    cut(ctx, box(x, top, 64, 30), P.woodLight);
  }
};

/** The table: its top, its front and its legs, the prosecutor behind it. */
const TABLE = { x0: 552, x1: 1025, top: 600, foot: 865 } as const;

export const tableShadow = (ctx: CanvasRenderingContext2D) => {
  floorShadow(ctx, thrown(TABLE.x0 + 20, TABLE.x0 + 50, TABLE.foot, 260), 0.38);
  floorShadow(ctx, thrown(TABLE.x1 - 60, TABLE.x1 - 30, TABLE.foot, 260), 0.38);
  floorShadow(ctx, thrown(TABLE.x0 + 30, TABLE.x1 - 30, TABLE.foot - 40, 200), 0.18);
};

export const table = (ctx: CanvasRenderingContext2D) => {
  const { x0, x1, top, foot } = TABLE;
  for (const x of [x0 + 20, x1 - 60]) cut(ctx, box(x, top + 40, 34, foot - top - 40), P.wood);
  cut(ctx, box(x0, top, x1 - x0, 14), P.woodLight, { line: LINE_SMALL });
  cut(ctx, box(x0, top + 12, x1 - x0, 40), P.wood);
};

/** The table's top, where a sheet lies: y, and its stack's place. */
export const TABLE_TOP = TABLE.top + 2;
export const STACK: Pt = [650, TABLE.top - 2];

/** The bench: the judge's high desk, its rim, its face and the panel let into it. */
const BENCH = { x0: 975, x1: 1640, top: 375, foot: 825 } as const;

export const benchShadow = (ctx: CanvasRenderingContext2D) =>
  floorShadow(ctx, thrown(BENCH.x0, BENCH.x1, BENCH.foot, 300), 0.3);

export const bench = (ctx: CanvasRenderingContext2D) => {
  const { x0, x1, top, foot } = BENCH;
  cut(ctx, box(x0 + 10, top + 30, x1 - x0 - 10, foot - top - 30), P.bench);
  cut(ctx, box(x0 + 100, top + 80, x1 - x0 - 200, foot - top - 130), P.bench, { line: LINE_SMALL });
  cut(ctx, box(x0, top, x1 - x0, 36), P.benchTop);
};

/** The bench's top, where the judge's hands rest and the gavel lies. */
export const BENCH_TOP = BENCH.top;

/** The judge's chair: its red back over his shoulders, behind him. */
export const chair = (ctx: CanvasRenderingContext2D) => {
  cut(ctx, box(1392, 168, 112, 220), P.wood);
  cut(ctx, box(1406, 182, 84, 200), P.chair, { line: LINE_SMALL });
};

/** The gavel's block on the bench, where it strikes. */
export const BLOCK: Pt = [1066, 372];

export const block = (ctx: CanvasRenderingContext2D) =>
  cut(ctx, box(BLOCK[0] - 34, BLOCK[1] - 6, 68, 12), P.gavel, { line: LINE_SMALL });

/**
 * The gavel, its grip (where the hand closes) at the origin and its head
 * 62 along its handle, turned `rot` (0: the head to the left of the grip).
 */
export const gavel = (ctx: CanvasRenderingContext2D, grip: Pt, rot: number) => {
  ctx.save();
  ctx.translate(grip[0], grip[1]);
  ctx.rotate(rot);
  cut(ctx, box(-62, -5, 74, 10), P.gavel, { line: LINE_SMALL });
  cut(ctx, box(-82, -20, 34, 40), P.gavel);
  ctx.restore();
};

// ─── the evidence ────────────────────────────────────────────────────────────

/** One sheet of evidence, scribbled over in flat scarlet: no letters, no numbers, no drips. */
export const sheet = (
  ctx: CanvasRenderingContext2D,
  at: { readonly x: number; readonly y: number; readonly rot: number },
  seed: number,
  flat = 0.32,
) => {
  ctx.save();
  ctx.translate(at.x, at.y);
  ctx.rotate(at.rot);
  // A sheet lying on the table is seen shallow: `flat` of its depth.
  ctx.scale(1, flat);
  cut(ctx, box(-66, -46, 132, 92), P.sheet, {
    line: LINE_SMALL / flat > 8 ? 3 : LINE_SMALL,
    flat: true,
  });
  const r = rng(seed);
  ctx.strokeStyle = C.scarlet;
  ctx.lineWidth = 4;
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  for (const row of [-18, 12]) {
    ctx.beginPath();
    let x = -46 + r() * 8;
    ctx.moveTo(x, row);
    while (x < 40) {
      x += 9 + r() * 5;
      ctx.lineTo(x, row + (r() < 0.5 ? -12 : 10));
    }
    unprobed(ctx, () => ctx.stroke());
  }
  ctx.restore();
};

/** The sheets of the stack, bottom first: where each lies on the table, as laid. */
export const STACK_SHEETS = (() => {
  const r = rng(2026);
  return Array.from({ length: 9 }, (_, i) => ({
    x: STACK[0] + (r() - 0.5) * 14,
    y: STACK[1] - i * 7,
    rot: (r() - 0.5) * 0.12,
  }));
})();

/** The two sheets laid out flat along the table, past the stack. */
export const LAID_SHEETS = [
  { x: 790, y: TABLE.top + 6, rot: 0.03 },
  { x: 905, y: TABLE.top + 2, rot: -0.04 },
] as const;

// ─── the back of the room ────────────────────────────────────────────────────

/** The pews, nearest the camera in `title`'s wide: two banks either side of the aisle, three rows. */
export const pews = (ctx: CanvasRenderingContext2D) => {
  for (const [row, y] of [1110, 1250, 1390].entries()) {
    const reach = 140 * row;
    for (const [x0, x1] of [
      [-760 - reach, 600 - reach * 0.3],
      [960 + reach * 0.3, 2320 + reach],
    ] as const) {
      cut(ctx, box(x0, y, x1 - x0, 120), P.wood);
      cut(ctx, box(x0 - 6, y - 12, x1 - x0 + 12, 24), P.woodLight, { line: LINE_SMALL });
      for (const x of [x0 - 4, x1 - 40]) cut(ctx, box(x, y - 54, 44, 190), P.woodLight);
    }
  }
};
