// The mount at dusk (Matthew 5:1–2). A low amber sun sits on the far
// hills across the lake; the crowd sits on the slope in silhouette, each
// figure rimmed on its sun side, their shadows long across the grass; the
// teacher sits on the crest above them, lit full by the last light against
// the cooling eastern sky. The camera pushes slowly up the slope toward him,
// and the planes part: the sky barely moves, the lake slides, the grass at
// the frame's foot sweeps out of the bottom. The light does the rest: shafts
// fan from the sun and dust drifts in them.

import {
  type Hex,
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
  pushInto,
  rays,
  shotPath,
} from '@bible/film/canvas';
import { rng } from '@bible/film/core';
import { type Shape, along, brushes, rimmed, rough, seated, tint, tuft } from '../kit.ts';
import { palette as P } from '../palette.ts';

/** The sun, on the sky's plane. */
const SUN = [560, 574] as const;
/** The sky's depth: so far it all but holds still. */
const SKY_Z = 6;

/** The mount's skyline, left to right: up from the lake shore to the crest the teacher sits on. */
const SLOPE: ReadonlyArray<readonly [number, number]> = [
  [-400, 930],
  [200, 885],
  [600, 830],
  [900, 768],
  [1150, 700],
  [1340, 632],
  [1470, 598],
  [1620, 604],
  [1820, 630],
  [2400, 668],
];
const slopeY = (x: number) => along(SLOPE, x) + rough(x, 4, 5);

/** Where the teacher sits, on the crest. */
const TEACHER = [1462, 594] as const;

/** A cloud: a run of soft lobes heaped along a flat base. */
const cloud =
  (x: number, y: number, w: number, h: number, seed: number): Shape =>
  (ctx) => {
    const r = rng(seed);
    const n = 6 + Math.floor(r() * 4);
    for (let i = 0; i < n; i++) {
      const cx = x - w / 2 + (w * (i + 0.5)) / n + ((r() - 0.5) * w) / n;
      const rr = h * (0.45 + r() * 0.7) * Math.sqrt(Math.sin((Math.PI * (i + 0.5)) / n));
      const cy = y - rr * 0.35;
      ctx.moveTo(cx + rr * 1.9, cy);
      ctx.ellipse(cx, cy, rr * 1.9, rr, 0, 0, Math.PI * 2);
    }
  };

const CLOUDS = [
  [260, 400, 620, 40],
  [900, 318, 820, 44],
  [80, 238, 520, 30],
  [1380, 262, 760, 46],
  [1660, 440, 560, 30],
  [800, 492, 460, 20],
  [1100, 170, 640, 30],
  [1760, 120, 480, 26],
] as const;

const sky: Painting = {
  w: 2400,
  h: 860,
  brush: brushes.sky(11),
  guide: (ctx) => {
    ctx.translate(240, 160);
    const g = ctx.createLinearGradient(0, -160, 0, 700);
    g.addColorStop(0, P.night);
    g.addColorStop(0.3, P.indigo);
    g.addColorStop(0.55, P.plum);
    g.addColorStop(0.72, P.rose);
    g.addColorStop(0.86, P.ember);
    g.addColorStop(1, P.amber);
    ctx.fillStyle = g;
    ctx.fillRect(-240, -160, 2400, 860);
    // The east cools away from the sun.
    const east = ctx.createRadialGradient(2000, 80, 0, 2000, 80, 1300);
    east.addColorStop(0, tint(P.night, 0.95));
    east.addColorStop(0.55, tint(P.indigo, 0.55));
    east.addColorStop(1, tint(P.indigo, 0));
    ctx.fillStyle = east;
    ctx.fillRect(-240, -160, 2400, 860);
    // The west warms toward it.
    const west = ctx.createRadialGradient(SUN[0], SUN[1], 0, SUN[0], SUN[1], 1000);
    west.addColorStop(0, tint(P.sunGlow, 1));
    west.addColorStop(0.12, tint(P.amber, 0.85));
    west.addColorStop(0.4, tint(P.ember, 0.45));
    west.addColorStop(1, tint(P.rose, 0));
    ctx.fillStyle = west;
    ctx.fillRect(-240, -160, 2400, 860);
    // Clouds lit from below, hotter the nearer the sun.
    for (const [i, [x, y, w, h]] of CLOUDS.entries()) {
      const near = Math.min(1, Math.hypot(x - SUN[0], y - SUN[1]) / 1300);
      const lit = near < 0.5 ? P.amber : P.rose;
      rimmed(ctx, cloud(x, y, w, h, 40 + i), near < 0.6 ? P.plum : P.indigo, lit, 0, -h * 0.22);
    }
    // The sun's disc, on the far hills.
    ctx.fillStyle = P.sunCore;
    ctx.beginPath();
    ctx.arc(SUN[0], SUN[1], 34, 0, Math.PI * 2);
    ctx.fill();
  },
};

/** The far shore, under the sun: low hills against the brightest sky. */
const shoreY = (x: number) => 606 + rough(x, 9, 10) - Math.max(0, 300 - Math.abs(x - 140)) * 0.08;
/** The hills beyond the mount, rising into the cool east. */
const rangeY = (x: number) =>
  612 -
  Math.max(0, x - 760) * 0.06 -
  90 * Math.exp(-(((x - 1760) / 240) ** 2)) -
  46 * Math.exp(-(((x - 1240) / 170) ** 2)) +
  rough(x, 2, 12);

const far: Painting = {
  w: 2400,
  h: 460,
  brush: brushes.far(21),
  guide: (ctx) => {
    ctx.translate(240, -470);
    // The range beyond the mount, cool and hazed.
    const rg = ctx.createLinearGradient(0, 470, 0, 660);
    rg.addColorStop(0, mix(P.hillFar, P.rose, 0.35));
    rg.addColorStop(1, P.hillFar);
    ctx.fillStyle = rg;
    ctx.beginPath();
    ctx.moveTo(700, 700);
    for (let x = 700; x <= 2200; x += 20) ctx.lineTo(x, rangeY(x));
    ctx.lineTo(2200, 940);
    ctx.lineTo(700, 940);
    ctx.fill();
    // The lake, the sky again in it, and the sun's road across it.
    const lake = ctx.createLinearGradient(0, 600, 0, 930);
    lake.addColorStop(0, P.lakeLit);
    lake.addColorStop(0.35, P.rose);
    lake.addColorStop(1, P.lake);
    ctx.fillStyle = lake;
    ctx.fillRect(-240, 604, 2000, 330);
    const road = ctx.createLinearGradient(SUN[0], 610, SUN[0], 900);
    road.addColorStop(0, tint(P.sunCore, 0.95));
    road.addColorStop(0.5, tint(P.amber, 0.5));
    road.addColorStop(1, tint(P.amber, 0));
    ctx.fillStyle = road;
    const r = rng(77);
    for (let y = 612; y < 900; y += 5 + r() * 6) {
      const spread = 18 + (y - 610) * 0.35;
      const w = spread * (0.4 + r() * 0.9);
      ctx.fillRect(SUN[0] - w / 2 + (r() - 0.5) * spread, y, w, 2 + r() * 2);
    }
    // The far shore, dark against the sun, its edge burning.
    rimmed(
      ctx,
      (c) => {
        c.moveTo(-240, 640);
        for (let x = -240; x <= 1500; x += 16) c.lineTo(x, shoreY(x));
        c.lineTo(1500, 640);
        c.closePath();
      },
      P.plum,
      P.ember,
      0,
      3,
    );
  },
};

/** The near shore below the mount: a strip of dark land, olive trees, rocks. */
const shore: Painting = {
  w: 1700,
  h: 330,
  brush: brushes.far(31),
  guide: (ctx) => {
    ctx.translate(300, -650);
    const lineY = (x: number) => 780 + rough(x, 6, 8) + x * 0.02;
    const g = ctx.createLinearGradient(0, 760, 0, 980);
    g.addColorStop(0, P.grass);
    g.addColorStop(1, P.grassShade);
    rimmed(
      ctx,
      (c) => {
        c.moveTo(-300, 980);
        for (let x = -300; x <= 1400; x += 16) c.lineTo(x, lineY(x));
        c.lineTo(1400, 980);
        c.closePath();
      },
      g,
      P.ember,
      4,
      3,
    );
    // Olive trees: low round crowns on crooked trunks, rimmed on the sun side.
    const r = rng(5);
    for (const x of [-120, 40, 110, 380, 470, 820, 1010]) {
      const y = lineY(x);
      const s = 26 + r() * 22;
      rimmed(
        ctx,
        (c) => {
          c.moveTo(x - 3, y);
          c.lineTo(x - 2, y - s * 0.8);
          c.lineTo(x + 3, y - s * 0.8);
          c.lineTo(x + 4, y);
          c.closePath();
          for (let k = 0; k < 5; k++) {
            const cx = x + (r() - 0.5) * s * 1.4;
            const cy = y - s * (0.9 + r() * 0.6);
            const rr = s * (0.35 + r() * 0.3);
            c.moveTo(cx + rr, cy);
            c.ellipse(cx, cy, rr, rr * 0.75, 0, 0, Math.PI * 2);
          }
        },
        P.crowd,
        P.ember,
        3,
        1,
      );
    }
  },
};

/** One seated listener in the crowd. */
interface Listener {
  readonly seat: Parameters<typeof seated>[0];
  readonly cloth: Hex;
}

/** The sun on a listener's edge. */
const RIM = mix(P.amber, P.ember, 0.35);

const CLOTHS = [P.crowd, P.crowdMid, P.madder, P.woad, P.ochre, P.crowd] as const;

/** The crowd, row by row down the slope, the far rows first; none closer than a gap below the crest. */
const CROWD: ReadonlyArray<Listener> = (() => {
  const r = rng(1931);
  const out: Listener[] = [];
  for (let row = 0; row < 7; row++) {
    const below = 26 + row * 44 + row * row * 4;
    const h = 44 + row * 9;
    for (let x = -60 + r() * 40; x < 1300 - row * 30; x += h * (0.62 + r() * 0.5)) {
      if (x > 1180 - row * 70 && row < 2) continue;
      // Gaps between the groups the crowd sits in.
      if (Math.sin(x * 0.011 + row * 1.9) + Math.sin(x * 0.027 + row) > 1.1) continue;
      out.push({
        seat: {
          x,
          y: slopeY(x) + below + (r() - 0.5) * 10,
          h: h * (0.85 + r() * 0.3),
          dir: 1,
          cloth: r() > 0.45,
          lean: (r() - 0.3) * 0.12,
        },
        cloth: mix(
          CLOTHS[Math.floor(r() * CLOTHS.length)] ?? P.crowd,
          P.hillMid,
          0.42 - row * 0.06,
        ),
      });
    }
  }
  return out;
})();

const slope: Painting = {
  w: 2700,
  h: 820,
  brush: brushes.near(51, P.night),
  guide: (ctx) => {
    ctx.translate(350, -470);
    // The grass: lit along the crest, deepening down the slope and away from the sun.
    const g = ctx.createLinearGradient(500, 600, 1100, 1300);
    g.addColorStop(0, P.grassLit);
    g.addColorStop(0.3, P.grass);
    g.addColorStop(1, P.grassShade);
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.moveTo(-350, 1300);
    for (let x = -350; x <= 2350; x += 12) ctx.lineTo(x, slopeY(x));
    ctx.lineTo(2350, 1300);
    ctx.fill();
    // The shade on the slope's east face, past the crest.
    ctx.save();
    ctx.clip();
    const east = ctx.createLinearGradient(1460, 0, 2000, 0);
    east.addColorStop(0, tint(P.grassShade, 0));
    east.addColorStop(0.4, tint(P.grassShade, 0.85));
    ctx.fillStyle = east;
    ctx.fillRect(1460, 560, 900, 740);
    ctx.restore();
    // The skyline's grass catching the last light.
    const r = rng(8);
    for (let x = -350; x < 1700; x += 7 + r() * 9) {
      const lit = x < 1470 ? 1 : 0.35;
      tuft(ctx, x, slopeY(x) + 6, 16 + r() * 18, 2, r, P.grass, lit > 0.5 ? P.amber : P.rose);
    }
    // Long shadows: every listener's, thrown up the slope away from the sun.
    ctx.fillStyle = tint(P.grassShade, 0.55);
    for (const { seat } of CROWD) {
      ctx.beginPath();
      ctx.ellipse(
        seat.x + seat.h * 0.9,
        seat.y - seat.h * 0.03,
        seat.h * 1.1,
        seat.h * 0.12,
        -0.18,
        0,
        Math.PI * 2,
      );
      ctx.fill();
    }
    // The crowd, rimmed on the side the sun is.
    for (const { seat, cloth } of CROWD) {
      const rim = seat.h * 0.035;
      rimmed(ctx, seated(seat), cloth, RIM, rim, rim * 0.25);
    }
  },
};

/** The teacher on the crest, seated on a rock: robe lit by the sun, a madder mantle, one hand lifted. */
const teacher: Painting = {
  w: 260,
  h: 240,
  scale: 2,
  brush: brushes.figure(61, P.night),
  guide: (ctx) => {
    ctx.translate(-TEACHER[0] + 130, -TEACHER[1] + 190);
    const [x, y] = TEACHER;
    const h = 136;
    // The rock.
    rimmed(
      ctx,
      (c) => {
        c.moveTo(x - 74, y + 40);
        c.quadraticCurveTo(x - 70, y - 6, x - 24, y - 8);
        c.quadraticCurveTo(x + 40, y - 14, x + 72, y + 6);
        c.lineTo(x + 84, y + 40);
        c.closePath();
      },
      P.grassShade,
      P.amber,
      5,
      4,
    );
    // The robe, in its own shade but for the band the low sun lights down its front.
    rimmed(
      ctx,
      seated({ x, y, h, dir: -1, lean: 0.06 }),
      P.robeShade,
      P.robeLit,
      h * 0.13,
      h * 0.01,
    );
    // The mantle, over the near shoulder and across the lap.
    rimmed(
      ctx,
      (c) => {
        c.moveTo(x + h * 0.16, y - h * 0.62);
        c.quadraticCurveTo(x - h * 0.02, y - h * 0.7, x - h * 0.12, y - h * 0.58);
        c.quadraticCurveTo(x - h * 0.2, y - h * 0.3, x - h * 0.38, y - h * 0.16);
        c.quadraticCurveTo(x - h * 0.42, y - h * 0.04, x - h * 0.3, y);
        c.lineTo(x + h * 0.06, y);
        c.quadraticCurveTo(x + h * 0.02, y - h * 0.3, x + h * 0.16, y - h * 0.62);
        c.closePath();
      },
      P.mantleShade,
      P.mantle,
      h * 0.03,
      0,
    );
    // The forearm lifted, the hand open toward the crowd.
    rimmed(
      ctx,
      (c) => {
        c.moveTo(x - h * 0.05, y - h * 0.5);
        c.quadraticCurveTo(x - h * 0.2, y - h * 0.5, x - h * 0.28, y - h * 0.6);
        c.quadraticCurveTo(x - h * 0.33, y - h * 0.68, x - h * 0.31, y - h * 0.72);
        c.quadraticCurveTo(x - h * 0.26, y - h * 0.72, x - h * 0.23, y - h * 0.64);
        c.quadraticCurveTo(x - h * 0.16, y - h * 0.56, x - h * 0.02, y - h * 0.42);
        c.closePath();
      },
      P.skinShade,
      P.skinLit,
      h * 0.03,
      h * 0.01,
    );
    // The head in profile: lit down the face, the hair and beard dark behind and below it.
    const hx = x - h * 0.05;
    const hy = y - h * 0.79;
    ctx.fillStyle = P.hair;
    ctx.beginPath();
    ctx.ellipse(hx + h * 0.02, hy - h * 0.005, h * 0.1, h * 0.112, 0, 0, Math.PI * 2);
    ctx.moveTo(hx - h * 0.08, hy + h * 0.04);
    ctx.quadraticCurveTo(hx - h * 0.07, hy + h * 0.17, hx + h * 0.02, hy + h * 0.15);
    ctx.quadraticCurveTo(hx + h * 0.08, hy + h * 0.1, hx + h * 0.06, hy + h * 0.02);
    ctx.fill();
    rimmed(
      ctx,
      (c) => {
        c.moveTo(hx - h * 0.02, hy - h * 0.09);
        c.quadraticCurveTo(hx - h * 0.1, hy - h * 0.06, hx - h * 0.095, hy);
        c.lineTo(hx - h * 0.115, hy + h * 0.03);
        c.lineTo(hx - h * 0.09, hy + h * 0.045);
        c.quadraticCurveTo(hx - h * 0.06, hy + h * 0.06, hx - h * 0.02, hy + h * 0.05);
        c.quadraticCurveTo(hx + h * 0.02, hy, hx - h * 0.02, hy - h * 0.09);
        c.closePath();
      },
      P.skin,
      P.skinLit,
      h * 0.035,
      0,
    );
  },
};

/** The grass at the frame's foot, near and out of focus, with a few anemones in it. */
const fore: Painting = {
  w: 3000,
  h: 620,
  blur: 3,
  brush: brushes.far(71),
  guide: (ctx) => {
    ctx.translate(560, -800);
    const r = rng(12);
    const clump = (x0: number, x1: number, y: number) => {
      for (let x = x0; x < x1; x += 10 + r() * 14)
        tuft(ctx, x, y + 120 + r() * 60, 140 + r() * 160, 3, r, P.grassShade, P.ember);
    };
    clump(-560, 420, 920);
    clump(1560, 2440, 940);
    // Anemones: the lilies of the field.
    for (const [x, y] of [
      [80, 960],
      [240, 1010],
      [-140, 990],
      [1700, 1000],
      [1880, 970],
    ] as const) {
      ctx.fillStyle = P.mantle;
      ctx.beginPath();
      ctx.ellipse(x, y, 14, 10, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = P.amber;
      ctx.beginPath();
      ctx.ellipse(x - 5, y - 4, 6, 4, 0, 0, Math.PI * 2);
      ctx.fill();
    }
  },
};

export const mount = drawing({
  drift: 0,
  timeline: {
    push: { at: 'start', until: { at: 'end' }, ease: 'inOutSine' },
  },
  knobs: {
    wide: [960, 540],
    wideZoom: 1,
    close: [1250, 560],
    closeZoom: 1.42,
  },
  draw: (f) => {
    const { ctx, w, h, t } = f;
    const cam = shotPath(knobCamera(f.knob('wide'), f.knob('wideZoom')), [
      [f.at('push'), knobCamera(f.knob('close'), f.knob('closeZoom')), pushInto],
    ]);
    const breath = 1 + 0.006 * Math.sin(t * 1.4);
    const planes: Plane[] = [
      { z: SKY_Z, draw: () => drawPainting(ctx, sky, -240, -160) },
      {
        z: 4,
        draw: () => {
          drawPainting(ctx, far, -240, 470);
          motes(ctx, t, {
            seed: 3,
            count: 70,
            box: [SUN[0] - 110, 612, 220, 200],
            size: [0.7, 1.8],
            color: P.sunCore,
            drift: [7, 0],
            sway: 0,
            alpha: 0.9,
            twinkle: 1,
            halo: 2,
          });
        },
      },
      { z: 2.4, draw: () => drawPainting(ctx, shore, -300, 650) },
      {
        z: 1.4,
        draw: () => {
          drawPainting(ctx, slope, -350, 470);
          ctx.save();
          ctx.translate(TEACHER[0], TEACHER[1]);
          ctx.scale(1, breath);
          ctx.translate(-TEACHER[0], -TEACHER[1]);
          drawPainting(ctx, teacher, TEACHER[0] - 130, TEACHER[1] - 190);
          ctx.restore();
        },
      },
      {
        z: 1,
        draw: () =>
          motes(ctx, t, {
            seed: 17,
            count: 90,
            box: [-200, 150, 2300, 900],
            size: [0.8, 2.4],
            color: P.sunGlow,
            drift: [9, -4],
            sway: 22,
            alpha: 0.65,
            twinkle: 0.6,
            halo: 3,
          }),
      },
      { z: 0.55, draw: () => drawPainting(ctx, fore, -560, 800) },
    ];
    multiplane(ctx, cam, w, h, planes, {
      drift: 0,
      fibre: 0,
      thickness: 0.1,
      haze: [
        [0, '#2c2550'],
        [0.5, '#c96a58'],
        [0.6, '#e58a5e'],
        [1, '#4a2c4a'],
      ],
    });
    // The sun's shafts, fanned from where the sky plane puts it on screen.
    const [sx, sy] = planePoint(cam, SKY_Z, SUN, w, h);
    rays(ctx, t, {
      seed: 5,
      from: [sx, sy],
      angle: 0.1,
      spread: 0.75,
      length: 2400,
      count: 9,
      width: 520,
      color: P.amber,
      alpha: 0.34,
    });
    ctx.save();
    ctx.globalCompositeOperation = 'screen';
    glow(ctx, sx, sy, 520, P.sunGlow, 0.45);
    ctx.restore();
  },
});
