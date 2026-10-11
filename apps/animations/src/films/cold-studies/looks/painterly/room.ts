// The courtroom, painted: a grave old room seen side on, as a stage. Tall
// leaded windows in the back wall let in a cool, even daylight that falls in
// shafts across the dim air; dark panelling runs below them. To the right the
// high bench, a dark carved canopy over it and an oil lamp burning at each
// end, the only warm light in the room. To the left the dock, where the
// accused stands, and between them the table the evidence piles up on. The
// world is 1920 × 1080 units, the wide shot's frame; the camera frames it
// (`court.ts`). Light is cool from the windows, warm from the lamps, and the
// shadow between them is teal.

import { type Box, write } from '@bible/film/canvas';
import { clamp, hash2, lerp } from '@bible/film/core';
import { type Easel, along, curve, glow, oval, paint, poly, pool, rect, shade } from './brush.ts';
import { P, R, SERIF } from './palette.ts';

/** Where the back wall meets the floor. */
export const FLOOR = 930;

/** The tall windows: their left edge, width, top and bottom. */
const WINDOWS: ReadonlyArray<Box> = [
  { x: 330, y: 80, w: 250, h: 600 },
  { x: 800, y: 80, w: 250, h: 600 },
];

/** The lamps on the bench: where their flames burn. */
export const LAMPS: ReadonlyArray<readonly [number, number]> = [
  [1236, 452],
  [1858, 452],
];

/** The bench's top edge, and its front's left. */
export const BENCH = { top: 540, left: 1150 } as const;

/** The dock's top rail. */
export const DOCK = { left: 360, right: 720, top: 782 } as const;

/** The evidence table's top. */
export const TABLE = { left: 770, right: 1070, top: 772 } as const;

/** The paper on the bench front the verdict is stamped on. */
export const WRIT = { x: 1180, y: 552, w: 236, h: 200 } as const;

/** How much cool daylight reaches (x, y) from the windows. */
const daylight = (x: number, y: number) =>
  Math.max(...WINDOWS.map((w) => pool(x, y, w.x + w.w / 2, w.y + w.h * 0.45, 520)));

/** How much warm lamplight reaches (x, y). */
const lamplight = (x: number, y: number) =>
  Math.max(...LAMPS.map(([lx, ly]) => pool(x, y, lx, ly + 30, 430)));

/** The flicker of a lamp's flame: a sum of two slow rates, never the same twice in a second. */
export const flicker = (t: number, k: number) =>
  1 + 0.06 * Math.sin(t * 9.1 + k * 2.3) + 0.04 * Math.sin(t * 15.7 + k);

/** An arched window's outline. */
const arch = (b: Box, inset = 0) => {
  const r = b.w / 2 - inset;
  const pts: Array<[number, number]> = [];
  pts.push([b.x + inset, b.y + b.h - inset]);
  for (let i = 0; i <= 12; i++) {
    const a = Math.PI + (Math.PI * i) / 12;
    pts.push([b.x + b.w / 2 + r * Math.cos(a), b.y + b.w / 2 + r * Math.sin(a) + inset * 0.2]);
  }
  pts.push([b.x + b.w - inset, b.y + b.h - inset]);
  return pts;
};

/** The back wall, its pilasters and cornice, the panelling below, and the floor. */
const walls = (e: Easel) => {
  const W: Box = { x: -200, y: -200, w: 2400, h: FLOOR + 200 };
  paint(e, rect(W), {
    ramp: R.wall,
    box: W,
    seed: 11,
    jitter: 0.09,
    accent: { color: '#4f4a3a', share: 0.05 },
    dir: -1.45,
    size: 26,
    tone: (x, y) =>
      0.12 + 0.62 * daylight(x, y) * (0.55 + 0.45 * clamp(y / 600)) + 0.12 * lamplight(x, y),
  });
  // Pilasters either side of each window: plaster that catches the daylight.
  for (const [i, x] of [250, 640, 1110].entries()) {
    const b: Box = { x, y: 40, w: 60, h: 660 };
    paint(e, rect(b), {
      ramp: R.wall,
      box: b,
      seed: 20 + i,
      dir: -1.57,
      spread: 0.15,
      size: 18,
      tone: (px, py) => 0.2 + 0.5 * daylight(px, py) + 0.25 * clamp((px - x) / 60),
    });
  }
  // The cornice under a ceiling lost in the gloom.
  const top: Box = { x: -200, y: -200, w: 2400, h: 250 };
  paint(e, rect(top), {
    ramp: R.panel,
    box: top,
    seed: 30,
    dir: 0,
    size: 30,
    tone: (_, y) => 0.05 + 0.25 * clamp((y + 50) / 100),
  });
  // The panelling: dark wood, its rails catching the light.
  const wain: Box = { x: -200, y: 690, w: 1400, h: FLOOR - 690 };
  paint(e, rect(wain), {
    ramp: R.panel,
    box: wain,
    seed: 31,
    dir: -1.57,
    spread: 0.12,
    size: 20,
    tone: (x, y) => 0.18 + 0.45 * daylight(x, y - 120) + 0.2 * lamplight(x, y),
  });
  for (let x = -120; x < 1200; x += 170)
    shade(e.ctx, rect({ x: x + 22, y: 722, w: 126, h: 176 }), P.ink, 0.3);
  paint(e, rect({ x: -200, y: 684, w: 1400, h: 18 }), {
    ramp: R.panel,
    box: { x: -200, y: 684, w: 1400, h: 18 },
    seed: 32,
    dir: 0,
    spread: 0.05,
    size: 14,
    tone: (x, y) => 0.45 + 0.4 * daylight(x, y),
  });
  // The floor: boards running away from us, the daylight lying on them.
  const floor: Box = { x: -200, y: FLOOR, w: 2400, h: 400 };
  paint(e, rect(floor), {
    ramp: R.floor,
    box: floor,
    seed: 40,
    dir: 0,
    spread: 0.08,
    size: 30,
    ratio: 0.22,
    tone: (x, y) =>
      0.12 +
      0.3 * clamp((y - FLOOR) / 150) * daylight(x - 260, FLOOR - 200) +
      0.15 * lamplight(x, y - 300),
  });
  for (const w of WINDOWS) {
    const patch = poly([
      [w.x + 250, FLOOR + 18],
      [w.x + w.w + 300, FLOOR + 18],
      [w.x + w.w + 470, FLOOR + 150],
      [w.x + 390, FLOOR + 150],
    ]);
    paint(e, patch, {
      ramp: R.floor,
      box: { x: w.x + 240, y: FLOOR, w: 500, h: 160 },
      seed: 41 + w.x,
      dir: 0,
      size: 22,
      ratio: 0.25,
      tone: (x) => 0.3 - 0.1 * Math.abs(along(x, 0, w.x + 240, 0, w.x + w.w + 470, 0) - 0.5),
    });
  }
};

/** The windows: their dark frames, the glass, and the lead between the panes. */
const windows = (e: Easel) => {
  const { ctx } = e;
  for (const [k, w] of WINDOWS.entries()) {
    const frame = arch({ x: w.x - 22, y: w.y - 22, w: w.w + 44, h: w.h + 44 });
    paint(e, poly(frame), {
      ramp: R.panel,
      box: { x: w.x - 30, y: w.y - 30, w: w.w + 60, h: w.h + 60 },
      seed: 50 + k,
      dir: -1.57,
      size: 14,
      tone: () => 0.3,
    });
    const glass = arch(w);
    paint(e, poly(glass), {
      ramp: R.glass,
      box: w,
      seed: 60 + k,
      dir: -1.2,
      spread: 0.6,
      size: 18,
      jitter: 0.1,
      tone: (x, y) =>
        0.5 +
        0.45 * (1 - clamp((y - w.y) / w.h)) -
        0.12 * Math.abs((x - w.x) / w.w - 0.5) +
        0.12 * (hash2(Math.floor(x / 42), Math.floor(y / 56) + k * 99) - 0.5),
    });
    // The lead and the mullions: dark bars over the glass.
    ctx.save();
    ctx.beginPath();
    poly(glass)(ctx);
    ctx.clip();
    ctx.fillStyle = P.ink;
    for (let x = w.x + 42; x < w.x + w.w; x += 42) ctx.fillRect(x - 1.5, w.y, 3, w.h);
    for (let y = w.y + 56; y < w.y + w.h; y += 56) ctx.fillRect(w.x, y - 1.5, w.w, 3);
    ctx.fillStyle = R.panel[1];
    ctx.fillRect(w.x + w.w / 2 - 7, w.y, 14, w.h);
    ctx.fillRect(w.x, w.y + w.h * 0.62 - 7, w.w, 14);
    ctx.restore();
    // The sill.
    paint(e, rect({ x: w.x - 40, y: w.y + w.h + 6, w: w.w + 80, h: 20 }), {
      ramp: R.wall,
      box: { x: w.x - 40, y: w.y + w.h + 6, w: w.w + 80, h: 20 },
      seed: 70 + k,
      dir: 0,
      size: 12,
      tone: () => 0.7,
    });
  }
};

/** The daylight falling through the air, a shaft from each window, and the dust that hangs in it. */
export const shafts = (e: Easel, t: number) => {
  const { ctx } = e;
  ctx.save();
  ctx.globalCompositeOperation = 'screen';
  for (const w of WINDOWS) {
    const g = ctx.createLinearGradient(w.x, w.y, w.x + 320, FLOOR);
    g.addColorStop(0, 'rgba(190,214,200,0.30)');
    g.addColorStop(0.55, 'rgba(150,180,170,0.14)');
    g.addColorStop(1, 'rgba(120,150,140,0)');
    ctx.fillStyle = g;
    ctx.beginPath();
    poly([
      [w.x + 20, w.y + 60],
      [w.x + w.w - 10, w.y + 40],
      [w.x + w.w + 470, FLOOR + 150],
      [w.x + 390, FLOOR + 150],
    ])(ctx);
    ctx.fill();
  }
  ctx.restore();
  // Dust: soft motes drifting slowly down through the light.
  for (let i = 0; i < 36; i++) {
    const w = WINDOWS[i % WINDOWS.length] ?? { x: 0, y: 0, w: 0, h: 0 };
    const u = hash2(i, 7);
    const v = (hash2(i, 13) + t * (0.012 + 0.01 * hash2(i, 3))) % 1;
    const x = w.x + 60 + u * 300 + v * 280 + 14 * Math.sin(t * 0.7 + i);
    const y = w.y + 80 + v * 700;
    glow(ctx, x, y, 8 + 8 * hash2(i, 5), '#d8e4d4', 0.35);
  }
};

/** The back of the room: walls, windows, floor. */
export const backdrop = (e: Easel) => {
  walls(e);
  windows(e);
};

/** The canopy behind the bench: dark carved wood, rising over the judge. */
export const canopy = (e: Easel, t: number) => {
  const pts: ReadonlyArray<readonly [number, number]> = [
    [1270, BENCH.top],
    [1270, 150],
    [1340, 90],
    [1560, 40],
    [1780, 90],
    [1850, 150],
    [1850, BENCH.top],
  ];
  paint(e, poly(pts), {
    ramp: R.wood,
    box: { x: 1260, y: 30, w: 600, h: BENCH.top - 30 },
    seed: 80,
    accent: { color: '#2c3f3e', share: 0.06 },
    dir: -1.57,
    spread: 0.1,
    size: 18,
    // The lamps' warmth spread across the carved wood, so the judge's dark robe stands against it.
    tone: (x, y) =>
      0.1 +
      0.42 * lamplight(x, y + 60) * flicker(t, 0) +
      0.38 * pool(x, y, 1600, 470, 560) +
      0.06 * daylight(x, y),
  });
  // Fluting: the carving's grooves.
  for (let x = 1300; x < 1830; x += 46)
    shade(e.ctx, rect({ x, y: 170, w: 14, h: BENCH.top - 190 }), P.ink, 0.35);
};

/** The bench's front: a high wall of panelled wood, lit by its lamps, and its cornice. */
export const bench = (e: Easel, t: number) => {
  const front: Box = {
    x: BENCH.left,
    y: BENCH.top,
    w: 2000 - BENCH.left,
    h: FLOOR - BENCH.top + 10,
  };
  const warm = (x: number, y: number) => lamplight(x, y) * flicker(t, 1);
  paint(e, rect(front), {
    ramp: R.wood,
    box: front,
    seed: 90,
    accent: { color: '#2c3f3e', share: 0.06 },
    dir: -1.57,
    spread: 0.1,
    size: 22,
    tone: (x, y) =>
      0.1 +
      0.55 * warm(x, y) * (1 - 0.6 * clamp((y - BENCH.top) / 300)) +
      0.12 * daylight(x - 300, y),
  });
  for (let x = BENCH.left + 40; x < 1960; x += 190) {
    shade(e.ctx, rect({ x, y: BENCH.top + 70, w: 150, h: 290 }), P.ink, 0.32);
    paint(e, rect({ x: x + 2, y: BENCH.top + 66, w: 146, h: 8 }), {
      ramp: R.wood,
      box: { x, y: BENCH.top + 60, w: 150, h: 16 },
      seed: 91 + x,
      dir: 0,
      size: 10,
      tone: (px, py) => 0.3 + 0.6 * warm(px, py - 60),
    });
  }
  // The cornice the judge's hands rest on.
  const lip: Box = { x: BENCH.left - 24, y: BENCH.top - 14, w: 2000, h: 34 };
  paint(e, rect(lip), {
    ramp: R.wood,
    box: lip,
    seed: 92,
    dir: 0,
    spread: 0.05,
    size: 14,
    tone: (x, y) => 0.25 + 0.7 * warm(x, y - 60),
  });
  shade(e.ctx, rect({ x: BENCH.left - 24, y: BENCH.top + 20, w: 2000, h: 16 }), P.ink, 0.5);
};

/** A lamp on the bench: brass foot, glass chimney, its flame and the warm air round it. */
export const lamps = (e: Easel, t: number) => {
  const { ctx } = e;
  for (const [k, [x, y]] of LAMPS.entries()) {
    const fl = flicker(t, k);
    glow(ctx, x, y + 10, 560 * fl, P.lamp, 0.5);
    glow(ctx, x, y, 200 * fl, P.lamp, 0.35);
    paint(
      e,
      curve([
        [x - 30, BENCH.top - 12],
        [x - 22, y + 50],
        [x - 34, y + 34],
        [x - 10, y + 22],
        [x + 10, y + 22],
        [x + 34, y + 34],
        [x + 22, y + 50],
        [x + 30, BENCH.top - 12],
      ]),
      {
        ramp: R.brass,
        box: { x: x - 40, y: y + 15, w: 80, h: BENCH.top - y },
        seed: 100 + k,
        dir: -1.57,
        size: 8,
        tone: (px) => 0.35 + 0.5 * clamp((px - x + 30) / 60),
      },
    );
    // The chimney: thin glass holding the flame.
    ctx.save();
    ctx.globalAlpha = 0.55;
    ctx.fillStyle = R.glass[3];
    ctx.beginPath();
    curve([
      [x - 13, y + 24],
      [x - 18, y - 8],
      [x - 9, y - 48],
      [x + 9, y - 48],
      [x + 18, y - 8],
      [x + 13, y + 24],
    ])(ctx);
    ctx.fill();
    ctx.restore();
    ctx.fillStyle = P.lamp;
    ctx.beginPath();
    oval(x, y - 4, 6 * fl, 15 * fl)(ctx);
    ctx.fill();
    ctx.fillStyle = P.flame;
    ctx.beginPath();
    oval(x, y - 2, 3, 9 * fl)(ctx);
    ctx.fill();
    glow(ctx, x, y - 6, 90 * fl, P.flame, 0.6);
  }
};

/** The dock the accused stands in: a waist-high box of dark wood, its rail worn pale. */
export const dock = (e: Easel, t: number) => {
  const front: Box = {
    x: DOCK.left,
    y: DOCK.top,
    w: DOCK.right - DOCK.left,
    h: FLOOR - DOCK.top + 60,
  };
  paint(e, rect(front), {
    ramp: R.wood,
    box: front,
    seed: 110,
    dir: -1.57,
    spread: 0.1,
    size: 18,
    tone: (x, y) =>
      0.12 + 0.25 * along(x, y, DOCK.left, 0, DOCK.right, 0) + 0.2 * daylight(x, y - 300),
  });
  for (let x = DOCK.left + 26; x < DOCK.right - 60; x += 112)
    shade(e.ctx, rect({ x, y: DOCK.top + 46, w: 86, h: 150 }), P.ink, 0.3);
  const rail: Box = { x: DOCK.left - 14, y: DOCK.top - 12, w: DOCK.right - DOCK.left + 28, h: 26 };
  paint(e, rect(rail), {
    ramp: R.wood,
    box: rail,
    seed: 111,
    dir: 0,
    spread: 0.05,
    size: 12,
    tone: (x, y) =>
      0.3 +
      0.3 * along(x, 0, DOCK.left, 0, DOCK.right, 0) +
      0.25 * lamplight(x - 500, y - 300) * flicker(t, 1),
  });
};

/** The evidence table. */
export const table = (e: Easel) => {
  for (const x of [TABLE.left + 20, TABLE.right - 44]) {
    const leg: Box = { x, y: TABLE.top, w: 24, h: FLOOR - TABLE.top + 70 };
    paint(e, rect(leg), {
      ramp: R.wood,
      box: leg,
      seed: 120 + x,
      dir: -1.57,
      size: 10,
      tone: () => 0.22,
    });
  }
  const top: Box = { x: TABLE.left, y: TABLE.top, w: TABLE.right - TABLE.left, h: 22 };
  paint(e, rect(top), {
    ramp: R.wood,
    box: top,
    seed: 122,
    dir: 0,
    size: 12,
    tone: (x) => 0.3 + 0.35 * along(x, 0, TABLE.left, 0, TABLE.right, 0),
  });
};

/** One piece of evidence: a ledger or a bundle of papers, its width, thickness and where it lands. */
interface Exhibit {
  readonly ledger: boolean;
  readonly w: number;
  readonly h: number;
  readonly x: number;
  readonly rot: number;
}

/** The evidence: nine pieces, ledgers and bundles, each its own size and turn. */
export const EXHIBITS: ReadonlyArray<Exhibit> = Array.from({ length: 9 }, (_, i) => ({
  ledger: hash2(i, 41) > 0.45,
  w: 150 + 60 * hash2(i, 42),
  h: 16 + 14 * hash2(i, 43),
  x: 918 + (hash2(i, 44) - 0.5) * 40,
  rot: (hash2(i, 45) - 0.5) * 0.09,
}));

/** The evidence on the table: each piece `fall(i)` of the way down (0 not yet thrown, 1 landed). */
export const evidence = (e: Easel, fall: (i: number) => number) => {
  let y = TABLE.top;
  for (const [i, x] of EXHIBITS.entries()) {
    const k = fall(i);
    const rest = y - x.h / 2;
    y -= x.h - 2;
    if (k <= 0) continue;
    const cy = lerp(rest - 700, rest, k);
    const rot = x.rot + (1 - k) * (hash2(i, 46) - 0.5) * 1.2;
    const { ctx } = e;
    ctx.save();
    ctx.translate(x.x, cy);
    ctx.rotate(rot);
    const b: Box = { x: -x.w / 2, y: -x.h / 2, w: x.w, h: x.h };
    const view = { x: -2000, y: -2000, w: 4000, h: 4000 };
    if (x.ledger) {
      paint({ ctx, view, px: e.px }, rect(b), {
        ramp: R.panel,
        box: b,
        seed: 130 + i,
        dir: 0,
        size: 9,
        tone: (px) => 0.25 + 0.45 * clamp((px + x.w / 2) / x.w),
      });
      // The leaves' edge between the boards.
      paint(
        { ctx, view, px: e.px },
        rect({ x: -x.w / 2 + 8, y: -x.h / 2 + 5, w: x.w - 12, h: x.h - 10 }),
        {
          ramp: R.paper,
          box: b,
          seed: 140 + i,
          dir: 0,
          spread: 0.02,
          size: 8,
          ratio: 0.2,
          tone: (px) => 0.14 + 0.32 * clamp((px + x.w / 2) / x.w),
        },
      );
    } else {
      paint({ ctx, view, px: e.px }, rect(b), {
        ramp: R.paper,
        box: b,
        seed: 150 + i,
        dir: 0,
        spread: 0.04,
        size: 8,
        ratio: 0.2,
        tone: (px, py) => 0.16 + 0.34 * clamp((px + x.w / 2) / x.w) - 0.1 * clamp(py / x.h + 0.5),
      });
      // The sheets' edges, and the tape round the bundle.
      ctx.fillStyle = 'rgba(40,30,22,0.45)';
      for (let k = 1; k < 4; k++) ctx.fillRect(-x.w / 2, -x.h / 2 + (k * x.h) / 4, x.w, 1.5);
      ctx.fillStyle = R.coat[1];
      ctx.fillRect(-6, -x.h / 2, 12, x.h);
    }
    ctx.restore();
  }
};

/** The verdict's size as it is stamped: a press past full, and back. */
export const STAMP_POP = [
  [0, 1.6],
  [0.5, 0.92, 'inCubic'],
  [1, 1, 'outQuad'],
] as const;

/** The writ on the bench front, warmed as the verdict is stamped on it (`stamp` 0 not yet, 1 down). */
export const writ = (e: Easel, t: number, stamp: number) => {
  const { ctx } = e;
  const { x, y, w, h } = WRIT;
  const sheet = curve(
    [
      [x, y - 14],
      [x + w, y - 14],
      [x + w + 6, y + h * 0.6],
      [x + w - 4, y + h],
      [x + w * 0.5, y + h - 10],
      [x + 6, y + h + 4],
      [x - 4, y + h * 0.5],
    ],
    0.6,
  );
  paint(e, sheet, {
    ramp: R.paper,
    box: { x: x - 10, y: y - 20, w: w + 20, h: h + 30 },
    seed: 160,
    dir: -1.4,
    spread: 0.2,
    size: 10,
    tone: (px, py) =>
      0.14 + 0.34 * lamplight(px, py) * flicker(t, 0) - 0.1 * clamp((py - y - h * 0.6) / (h * 0.4)),
  });
  // Its script: lines of a clerk's hand, too small to read.
  ctx.fillStyle = 'rgba(40,30,22,0.5)';
  for (let k = 0; k < 13; k++) {
    const ly = y + 14 + k * 13;
    if (k > 1 && k < 10) continue;
    const len = (w - 40) * (0.55 + 0.45 * hash2(k, 161));
    ctx.fillRect(x + 20, ly, len, 2.4);
  }
  if (stamp > 0) glow(ctx, x + w / 2, y + h * 0.5, 320, '#e9c46a', 0.5 * stamp);
};

/**
 * The verdict stamped on the writ in gold leaf: `stamp` 0 not yet, 1 down;
 * `pop` its size as it lands. Drawn over the lamps' light, so its paint stays
 * the one gold the oil pass lays leaf on (leaf is lit by its own sheen).
 */
export const verdict = (
  e: Easel,
  stamp: number,
  pop: number,
  hand: Parameters<typeof write>[5],
) => {
  if (stamp <= 0) return;
  const { ctx } = e;
  const cx = WRIT.x + WRIT.w / 2;
  const cy = WRIT.y + WRIT.h * 0.5;
  ctx.save();
  ctx.translate(cx, cy);
  ctx.scale(pop, pop);
  ctx.rotate(-0.05);
  // The verdict struck in gold leaf, between two gilt rules.
  ctx.globalAlpha = clamp(stamp * 3);
  ctx.fillStyle = P.gold;
  ctx.fillRect(-108, -50, 216, 6);
  ctx.fillRect(-108, 34, 216, 6);
  ctx.globalAlpha = 1;
  write(
    ctx,
    'Righteous',
    0,
    18,
    { family: SERIF, size: 54, weight: 700, color: P.gold, align: 'center' },
    hand,
    {
      boil: 0,
      alpha: clamp(stamp * 3),
    },
  );
  ctx.restore();
};
