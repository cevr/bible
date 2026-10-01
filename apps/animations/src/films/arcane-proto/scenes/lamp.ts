// A lamp-lit room at night (Matthew 5:15: a candle on a candlestick gives
// light to all that are in the house). The camera starts high, among the
// roof beams and the moonlit window, and cranes down to the low table where
// one clay lamp burns beside an open scroll and a man bends over it. Two
// lights and nothing else: the lamp, warm and wavering, lighting the man,
// the scroll, the table's edge and the beams' undersides; the moon, cold,
// falling through the window in a shaft full of dust onto the floor. The
// rest is deep shade. Near the lens a water jar and a door post pass, dark.

import {
  type Brush,
  type Painting,
  type Plane,
  drawPainting,
  drawing,
  glow,
  knobCamera,
  mix,
  motes,
  multiplane,
  planePoint,
  shotPath,
  unprobed,
} from '@bible/film/canvas';
import { flicker, rng } from '@bible/film/core';
import { type Shape, brushes, rimmed, tint } from '../kit.ts';
import { palette as P } from '../palette.ts';

/** The lamp's flame, in the world. */
const LAMP = [1000, 694] as const;
/** The window, its left, top, width and height (the arch springs from its top). */
const WINDOW = [300, 150, 250, 330] as const;
/** Where the moonlight lands on the floor: its near corners, far from the window. */
const FLOOR_PATCH = [
  [560, 940],
  [880, 930],
  [1010, 1080],
  [600, 1100],
] as const;

/** The window's opening: an arch over an upright rectangle. */
const opening: Shape = (ctx) => {
  const [x, y, w, h] = WINDOW;
  ctx.moveTo(x, y + h);
  ctx.lineTo(x, y + w / 2);
  ctx.arc(x + w / 2, y + w / 2, w / 2, Math.PI, 0);
  ctx.lineTo(x + w, y + h);
  ctx.closePath();
};

/** The lamp's light on a surface: warm at its heart, nothing a room's width off. */
const lampOn = (ctx: CanvasRenderingContext2D, light: number, reach: number) => {
  const g = ctx.createRadialGradient(LAMP[0], LAMP[1], 0, LAMP[0], LAMP[1], reach);
  g.addColorStop(0, tint(P.fireCore, light));
  g.addColorStop(0.12, tint(P.fire, light * 0.9));
  g.addColorStop(0.4, tint(P.wallLit, light * 0.55));
  g.addColorStop(1, tint(P.wallLit, 0));
  return g;
};

/** The back wall, the beams over it, the window and the shelf: lit by the lamp at `light`. */
const room =
  (light: number) =>
  (ctx: CanvasRenderingContext2D): void => {
    ctx.translate(300, 420);
    // Plaster over stone, in deep shade.
    const wall = ctx.createLinearGradient(0, -420, 0, 1280);
    wall.addColorStop(0, P.wallShade);
    wall.addColorStop(0.55, mix(P.wall, P.wallShade, 0.7));
    wall.addColorStop(1, P.wallShade);
    ctx.fillStyle = wall;
    ctx.fillRect(-300, -420, 2500, 1700);
    // Its stones, faint in the plaster.
    const r = rng(77);
    ctx.strokeStyle = tint(P.wallShade, 0.6);
    ctx.lineWidth = 3;
    for (let row = 0; row < 16; row++) {
      const y = -380 + row * 82;
      for (let x = -300 + (row % 2) * 70; x < 2200; x += 120 + r() * 80) {
        ctx.beginPath();
        ctx.roundRect(x, y + (r() - 0.5) * 8, 110 + r() * 60, 74, 10);
        unprobed(ctx, () => ctx.stroke());
      }
    }
    // The lamp's light on the wall.
    ctx.fillStyle = lampOn(ctx, light * 0.9, 760);
    ctx.fillRect(-300, -420, 2500, 1700);
    // The beams: heavy dark wood across the top, their undersides warm from the lamp.
    for (const [y, d] of [
      [-360, 70],
      [-200, 80],
      [-30, 92],
    ] as const) {
      ctx.fillStyle = P.wood;
      ctx.fillRect(-300, y, 2500, d);
      const under = ctx.createLinearGradient(0, y + d * 0.6, 0, y + d);
      under.addColorStop(0, tint(P.woodLit, 0));
      under.addColorStop(1, tint(P.woodLit, 0.4 + 0.6 * light));
      ctx.fillStyle = under;
      ctx.fillRect(-300, y, 2500, d);
      ctx.fillStyle = tint(P.wallShade, 0.6);
      ctx.fillRect(-300, y + d, 2500, 14);
    }
    // The window's deep reveal, the night sky and the moon in it.
    const [wx, wy, ww, wh] = WINDOW;
    ctx.save();
    ctx.beginPath();
    opening(ctx);
    ctx.clip();
    const night = ctx.createLinearGradient(0, wy, 0, wy + wh);
    night.addColorStop(0, P.moonDeep);
    night.addColorStop(1, P.moonSky);
    ctx.fillStyle = night;
    ctx.fillRect(wx, wy, ww, wh);
    const moon = ctx.createRadialGradient(
      wx + ww * 0.62,
      wy + 110,
      0,
      wx + ww * 0.62,
      wy + 110,
      160,
    );
    moon.addColorStop(0, tint(P.moon, 0.9));
    moon.addColorStop(0.15, tint(P.moon, 0.5));
    moon.addColorStop(1, tint(P.moon, 0));
    ctx.fillStyle = moon;
    ctx.fillRect(wx, wy, ww, wh);
    ctx.fillStyle = '#f2f6ff';
    ctx.beginPath();
    ctx.arc(wx + ww * 0.62, wy + 110, 26, 0, Math.PI * 2);
    ctx.fill();
    // Far hills under the moon.
    ctx.fillStyle = P.moonDeep;
    ctx.beginPath();
    ctx.moveTo(wx, wy + wh);
    ctx.lineTo(wx, wy + wh - 60);
    ctx.quadraticCurveTo(wx + ww * 0.4, wy + wh - 110, wx + ww, wy + wh - 70);
    ctx.lineTo(wx + ww, wy + wh);
    ctx.fill();
    // The lattice.
    ctx.strokeStyle = P.wood;
    ctx.lineWidth = 9;
    for (let k = 1; k < 3; k++) {
      ctx.beginPath();
      ctx.moveTo(wx + (ww * k) / 3, wy);
      ctx.lineTo(wx + (ww * k) / 3, wy + wh);
      unprobed(ctx, () => ctx.stroke());
    }
    ctx.beginPath();
    ctx.moveTo(wx, wy + wh * 0.55);
    ctx.lineTo(wx + ww, wy + wh * 0.55);
    unprobed(ctx, () => ctx.stroke());
    ctx.restore();
    // The reveal's moonlit edge and sill.
    ctx.strokeStyle = tint(P.moon, 0.7);
    ctx.lineWidth = 8;
    ctx.beginPath();
    opening(ctx);
    unprobed(ctx, () => ctx.stroke());
    ctx.fillStyle = mix(P.moon, P.wall, 0.4);
    ctx.fillRect(wx - 30, wy + wh, ww + 60, 22);
    // The shelf on the right: jars and rolled scrolls, the lamp catching their near sides.
    ctx.fillStyle = P.wood;
    ctx.fillRect(1380, 380, 520, 24);
    rimmed(ctx, (c) => c.rect(1380, 380, 520, 24), P.wood, P.woodLit, 5, -4);
    for (const [x, w, h] of [
      [1410, 70, 110],
      [1500, 90, 150],
      [1610, 60, 90],
      [1700, 110, 70],
      [1830, 50, 120],
    ] as const) {
      rimmed(
        ctx,
        (c) => {
          c.moveTo(x, 380);
          c.quadraticCurveTo(x - w * 0.2, 380 - h * 0.6, x + w * 0.25, 380 - h);
          c.lineTo(x + w * 0.75, 380 - h);
          c.quadraticCurveTo(x + w * 1.2, 380 - h * 0.6, x + w, 380);
          c.closePath();
        },
        P.clayShade,
        mix(P.clay, P.fire, 0.3 * light),
        w * 0.07,
        0,
      );
    }
  };

/** The room's wall: broad strokes, its stones hatched where the shade is deepest. */
const wallBrush: Brush = {
  seed: 501,
  flow: -0.15,
  jitter: 0.12,
  bristle: 0.6,
  layers: [
    { size: 26, length: 2.2, alpha: 0.75 },
    { size: 10, alpha: 0.8, detail: 0.08 },
    { size: 4, alpha: 0.85, detail: 0.28 },
  ],
  hatch: { color: P.night, angle: -1.0, spacing: 8, below: 0.08, alpha: 0.25 },
};

const roomLit: Painting = { w: 2500, h: 1700, brush: wallBrush, guide: room(1) };
const roomDim: Painting = { w: 2500, h: 1700, brush: wallBrush, guide: room(0.35) };

/**
 * The man at the table, bent over the scroll, one shape: his back and hood
 * rising to the hood's peak, the hood's edge falling over his brow, his face
 * in profile under it (brow, nose, lips, beard), his chest and the near arm
 * reaching down to the page.
 */
const reader: Shape = (ctx) => {
  ctx.moveTo(1660, 900);
  ctx.quadraticCurveTo(1680, 700, 1560, 590);
  ctx.quadraticCurveTo(1500, 530, 1430, 512);
  ctx.quadraticCurveTo(1370, 505, 1336, 548);
  // The hood's edge over the brow, then the face.
  ctx.quadraticCurveTo(1326, 566, 1334, 574);
  ctx.lineTo(1322, 600);
  ctx.lineTo(1330, 606);
  ctx.quadraticCurveTo(1328, 620, 1338, 626);
  ctx.quadraticCurveTo(1330, 646, 1352, 660);
  // The chest, and the arm down to the hand on the scroll.
  ctx.quadraticCurveTo(1330, 680, 1290, 700);
  ctx.lineTo(1258, 708);
  ctx.lineTo(1262, 728);
  ctx.quadraticCurveTo(1330, 724, 1400, 700);
  ctx.lineTo(1380, 900);
  ctx.closePath();
};

/** Where the lamp finds his face under the hood. */
const FACE = [1346, 598] as const;

/** The floor the table stands on, and the moon's patch on it. */
const floor = (ctx: CanvasRenderingContext2D, light: number) => {
  const g = ctx.createLinearGradient(0, 880, 0, 1140);
  g.addColorStop(0, mix(P.wood, P.wallShade, 0.3));
  g.addColorStop(1, P.wallShade);
  ctx.fillStyle = g;
  ctx.fillRect(400, 880, 1500, 260);
  ctx.fillStyle = lampOn(ctx, light * 0.6, 600);
  ctx.fillRect(400, 880, 1500, 260);
};

/** The table, the scroll, the lamp's clay body and the man behind them, by the lamp at `light`. */
const table =
  (light: number) =>
  (ctx: CanvasRenderingContext2D): void => {
    ctx.translate(-400, -380);
    floor(ctx, light);
    // The man: in the night's teal but for the lamp along his front: hood's edge, face, arm.
    const body = mix(P.tealDeep, P.wallShade, 0.3);
    rimmed(ctx, reader, body, tint(P.fire, 0.5 + 0.5 * light), 12, 5);
    ctx.save();
    ctx.beginPath();
    reader(ctx);
    ctx.clip();
    const face = ctx.createRadialGradient(FACE[0] - 20, FACE[1] + 10, 0, FACE[0], FACE[1], 46);
    face.addColorStop(0, tint(P.skinLit, 0.5 + 0.5 * light));
    face.addColorStop(0.6, tint(SKIN_TURN, 0.6));
    face.addColorStop(1, tint(SKIN_TURN, 0));
    ctx.fillStyle = face;
    ctx.fillRect(FACE[0] - 60, FACE[1] - 60, 120, 120);
    ctx.restore();
    // His hands on the scroll.
    for (const x of [1150, 1262]) {
      rimmed(
        ctx,
        (c) => c.ellipse(x, 716, 24, 11, 0.1, 0, Math.PI * 2),
        P.skin,
        mix(P.skinLit, P.fireCore, 0.4 * light),
        6,
        -3,
      );
    }
    // The table: its top in the lamp's light, its front in shade, its legs.
    ctx.fillStyle = P.wood;
    ctx.fillRect(810, 740, 80, 150);
    ctx.fillRect(1440, 740, 80, 150);
    const top = ctx.createLinearGradient(0, 718, 0, 745);
    top.addColorStop(0, mix(P.woodLit, P.fire, 0.4 * light));
    top.addColorStop(1, P.woodLit);
    ctx.fillStyle = top;
    ctx.beginPath();
    ctx.moveTo(770, 745);
    ctx.lineTo(830, 718);
    ctx.lineTo(1520, 718);
    ctx.lineTo(1560, 745);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = mix(P.wood, P.wallShade, 0.3);
    ctx.fillRect(770, 745, 790, 30);
    ctx.fillStyle = lampOn(ctx, light * 0.7, 380);
    ctx.fillRect(770, 718, 790, 60);
    // The table's shadow on the floor.
    ctx.fillStyle = tint(P.wallShade, 0.7);
    ctx.beginPath();
    ctx.ellipse(1180, 900, 420, 26, 0, 0, Math.PI * 2);
    ctx.fill();
    // The scroll, open, its rolled ends either side.
    const sheet = ctx.createLinearGradient(1060, 0, 1300, 0);
    sheet.addColorStop(0, mix('#efd9a8', P.fireCore, 0.4 * light));
    sheet.addColorStop(1, '#b58f62');
    ctx.fillStyle = sheet;
    ctx.beginPath();
    ctx.moveTo(1060, 736);
    ctx.lineTo(1082, 712);
    ctx.lineTo(1290, 712);
    ctx.lineTo(1300, 736);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = tint(P.wood, 0.5);
    ctx.lineWidth = 2;
    for (let k = 0; k < 6; k++) {
      ctx.beginPath();
      ctx.moveTo(1094 - k * 2, 716 + k * 3.4);
      ctx.lineTo(1170 - k * 2, 716 + k * 3.4);
      ctx.moveTo(1190 - k * 2, 716 + k * 3.4);
      ctx.lineTo(1276 + k * 2, 716 + k * 3.4);
      unprobed(ctx, () => ctx.stroke());
    }
    for (const x of [1062, 1300]) {
      ctx.fillStyle = '#8a6440';
      ctx.beginPath();
      ctx.ellipse(x, 724, 12, 15, 0, 0, Math.PI * 2);
      ctx.fill();
    }
    // The lamp's clay body, its spout toward the scroll.
    rimmed(
      ctx,
      (c) => {
        c.moveTo(LAMP[0] - 62, 718);
        c.quadraticCurveTo(LAMP[0] - 52, 692, LAMP[0] - 6, 696);
        c.lineTo(LAMP[0], 704);
        c.quadraticCurveTo(LAMP[0] + 56, 692, LAMP[0] + 60, 718);
        c.closePath();
      },
      P.clayShade,
      mix(P.clay, P.fireCore, 0.5 * light),
      0,
      5,
    );
  };

const tableLit: Painting = {
  w: 1500,
  h: 760,
  scale: 1.4,
  brush: brushes.figure(601, P.night),
  guide: table(1),
};
const tableDim: Painting = {
  w: 1500,
  h: 760,
  scale: 1.4,
  brush: brushes.figure(601, P.night),
  guide: table(0.3),
};

/** Near the lens: a water jar on the left, a door post and its hanging on the right. */
const near: Painting = {
  w: 2600,
  h: 1700,
  blur: 12,
  brush: { seed: 701, flow: 1.4, layers: [{ size: 40, alpha: 0.7 }] },
  guide: (ctx) => {
    ctx.translate(400, 400);
    rimmed(
      ctx,
      (c) => {
        c.moveTo(440, 1300);
        c.quadraticCurveTo(300, 1000, 540, 860);
        c.lineTo(560, 800);
        c.lineTo(700, 800);
        c.lineTo(720, 860);
        c.quadraticCurveTo(940, 1000, 800, 1300);
        c.closePath();
      },
      P.clayShade,
      P.wallLit,
      -16,
      4,
    );
    rimmed(
      ctx,
      (c) => {
        c.rect(1640, -400, 140, 1700);
        c.moveTo(1500, -400);
        c.quadraticCurveTo(1560, 300, 1490, 1300);
        c.lineTo(1660, 1300);
        c.lineTo(1660, -400);
        c.closePath();
      },
      P.wood,
      P.woodLit,
      14,
      0,
    );
  },
};

/** The lamp's flame: a small leaning teardrop, white at its root, that wavers with the flicker. */
const flame = (ctx: CanvasRenderingContext2D, t: number, light: number) => {
  const [x, y] = LAMP;
  const h = 40 + 16 * light;
  const lean = 5 * Math.sin(t * 2.7) + 3 * Math.sin(t * 6.1);
  const g = ctx.createLinearGradient(x, y + 4, x, y - h);
  g.addColorStop(0, P.fireCore);
  g.addColorStop(0.5, P.fire);
  g.addColorStop(1, tint(P.fireDeep, 0));
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.moveTo(x - 10, y + 2);
  ctx.quadraticCurveTo(x - 12, y - h * 0.4, x + lean, y - h);
  ctx.quadraticCurveTo(x + 12, y - h * 0.4, x + 10, y + 2);
  ctx.closePath();
  ctx.fill();
};

/** The red of skin where the lamp's light turns to shade. */
const SKIN_TURN = '#b8443a' as const;

/** The depths the room stands at: the back wall and the table. */
const WALL_Z = 2.2;
const TABLE_Z = 1.2;

/**
 * The moon's shaft, joined across the depths on screen: from the window's
 * opening, where the wall's plane puts it, to the patch on the floor, where
 * the table's plane puts it, so it stays fixed to both as the camera cranes.
 * Soft, brightest at the window, the dust turning in it.
 */
const moonShaft = (
  ctx: CanvasRenderingContext2D,
  t: number,
  on: (z: number, p: readonly [number, number]) => readonly [number, number],
) => {
  const [x, y, w, h] = WINDOW;
  const top = [on(WALL_Z, [x, y + 60]), on(WALL_Z, [x + w, y + 30])] as const;
  const sill = on(WALL_Z, [x, y + h]);
  const patch = FLOOR_PATCH.map((p) => on(TABLE_Z, p));
  const [, , far, near] = patch;
  if (far === undefined || near === undefined) return;
  const beam = (c: CanvasRenderingContext2D) => {
    c.beginPath();
    c.moveTo(...top[0]);
    c.lineTo(...top[1]);
    c.lineTo(...far);
    c.lineTo(...near);
    c.lineTo(...sill);
    c.closePath();
  };
  ctx.save();
  ctx.globalCompositeOperation = 'screen';
  ctx.filter = 'blur(14px)';
  const g = ctx.createLinearGradient(top[0][0], top[0][1], far[0], far[1]);
  g.addColorStop(0, tint(P.moon, 0.4));
  g.addColorStop(0.6, tint(P.moon, 0.16));
  g.addColorStop(1, tint(P.moon, 0.1));
  ctx.fillStyle = g;
  beam(ctx);
  ctx.fill();
  // The patch it lays on the floor.
  ctx.fillStyle = tint(P.moon, 0.42);
  ctx.beginPath();
  for (const [i, p] of patch.entries()) {
    if (i === 0) ctx.moveTo(...p);
    else ctx.lineTo(...p);
  }
  ctx.closePath();
  ctx.fill();
  ctx.filter = 'none';
  beam(ctx);
  ctx.clip();
  motes(ctx, t, {
    seed: 41,
    count: 170,
    box: [0, 0, 1920, 1080],
    size: [0.8, 2.4],
    color: P.moon,
    drift: [6, 10],
    sway: 16,
    alpha: 0.85,
    twinkle: 0.7,
    halo: 2.5,
  });
  ctx.restore();
};

export const lamp = drawing({
  drift: 0,
  timeline: {
    crane: { at: 'start', until: { at: 'end' }, ease: 'inOutSine' },
  },
  knobs: {
    high: [930, 330],
    highZoom: 1.18,
    low: [1010, 640],
    lowZoom: 1.24,
  },
  draw: (f) => {
    const { ctx, w, h, t } = f;
    const cam = shotPath(knobCamera(f.knob('high'), f.knob('highZoom')), [
      [f.at('crane'), knobCamera(f.knob('low'), f.knob('lowZoom'))],
    ]);
    const light = flicker(t, 7, 2.2);
    const lit = 0.55 + 0.45 * light;
    const planes: Plane[] = [
      {
        z: WALL_Z,
        draw: () => {
          drawPainting(ctx, roomDim, -300, -420);
          ctx.save();
          ctx.globalAlpha = lit;
          drawPainting(ctx, roomLit, -300, -420);
          ctx.restore();
        },
      },
      {
        z: TABLE_Z,
        draw: () => {
          drawPainting(ctx, tableDim, 400, 380);
          ctx.save();
          ctx.globalAlpha = lit;
          drawPainting(ctx, tableLit, 400, 380);
          ctx.restore();
          ctx.save();
          ctx.globalCompositeOperation = 'screen';
          glow(ctx, LAMP[0], LAMP[1] - 12, 520, P.fireDeep, 0.22 + 0.18 * light);
          glow(ctx, LAMP[0], LAMP[1] - 12, 120, P.fire, 0.5 + 0.3 * light);
          ctx.restore();
          flame(ctx, t, light);
          motes(ctx, t, {
            seed: 43,
            count: 30,
            box: [LAMP[0] - 300, LAMP[1] - 400, 600, 500],
            size: [0.6, 1.6],
            color: P.fire,
            drift: [3, -6],
            sway: 12,
            alpha: 0.7,
            twinkle: 0.6,
            halo: 3,
          });
        },
      },
      { z: 0.62, draw: () => drawPainting(ctx, near, -400, -400) },
    ];
    multiplane(ctx, cam, w, h, planes, {
      drift: 0,
      fibre: 0,
      thickness: 0.08,
      haze: [
        [0, '#0d1424'],
        [1, '#1a1a26'],
      ],
    });
    moonShaft(ctx, t, (z, p) => planePoint(cam, z, p, w, h));
  },
});
