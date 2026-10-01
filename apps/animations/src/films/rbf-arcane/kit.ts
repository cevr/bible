// Painted sets and recurring objects. The same court, house and gift row
// return at their payoffs; the shots own the camera and their spoken cues.
import {
  type Camera,
  type Figure,
  type FigureLight,
  type Frame,
  type Hex,
  type Painting,
  type Plane,
  column,
  crowd,
  drawPainting,
  figure,
  glow,
  house,
  mix,
  motes,
  multiplane,
  unprobed,
  write,
} from '@bible/film/canvas';
import { rng } from '@bible/film/core';
import { brushes } from '../arcane-proto/kit.ts';
import { fonts } from '../righteousness-by-faith/palette.ts';
import { palette as A } from '../arcane-proto/palette.ts';

export const P = {
  ...A,
  cream: '#f5deb8',
  gold: '#f6bc55',
  scarlet: '#a82d35',
  white: '#fff3de',
  sage: '#537967',
  tealDay: '#498f97',
  peach: '#eac08c',
  ink: '#232a36',
} as const;
export const LIGHT: FigureLight = {
  from: -2.2,
  key: P.peach,
  rim: P.sunGlow,
  shade: P.tealDeep,
  depth: 0.4,
};
const BUILT = { side: 1, key: P.peach, shade: P.tealDeep } as const;

export const person = (x: number, y: number, h: number, options: Partial<Figure> = {}): Figure => ({
  x,
  y,
  h,
  dir: 1,
  robe: '#86918b',
  skin: P.skin,
  head: 'cloth',
  cloth: '#a68b68',
  light: LIGHT,
  seed: 19,
  ...options,
});
export const christ = (x = 1220, y = 930, h = 430, options: Partial<Figure> = {}): Figure =>
  person(x, y, h, {
    dir: -1,
    robe: P.white,
    sash: P.gold,
    beard: true,
    hair: P.hair,
    head: 'bare',
    mantle: '#ab6553',
    seed: 37,
    ...options,
  });
export const stains = (amount = 1) => [
  { at: [-0.03, -0.7] as const, r: 0.065 * amount, color: P.scarlet },
  { at: [0.04, -0.4] as const, r: 0.052 * amount, color: P.scarlet },
  { at: [-0.05, -0.21] as const, r: 0.036 * amount, color: P.scarlet },
];
export const paintedCrowd = (seed: number, focus: number, count = 17) =>
  crowd({
    seed,
    count,
    area: [160, 880, 1580, 170],
    heights: [180, 320],
    focus,
    robes: ['#567178', '#936f66', '#746480', '#ae916e'],
    cloths: ['#ceb68f', '#718788', '#af8371'],
    skins: ['#b8785a', '#d69b72', '#946647'],
    light: LIGHT,
    seated: 0,
    gap: 0.45,
  });

export const mass = (ctx: CanvasRenderingContext2D, color: Hex, draw: () => void) => {
  ctx.fillStyle = color;
  ctx.beginPath();
  draw();
  ctx.fill();
};
export const oval = (
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  rx: number,
  ry: number,
  color: Hex,
) => mass(ctx, color, () => ctx.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2));
export const tree = (ctx: CanvasRenderingContext2D, x: number, y: number, scale = 1) => {
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(scale, scale);
  mass(ctx, P.wood, () => {
    ctx.moveTo(-16, 0);
    ctx.lineTo(-8, -160);
    ctx.lineTo(-80, -240);
    ctx.lineTo(-68, -251);
    ctx.lineTo(4, -195);
    ctx.lineTo(66, -290);
    ctx.lineTo(78, -281);
    ctx.lineTo(14, -158);
    ctx.lineTo(27, 0);
    ctx.closePath();
  });
  for (const [cx, cy, r] of [
    [-72, -260, 95],
    [28, -320, 104],
    [98, -261, 91],
    [0, -235, 113],
  ])
    oval(ctx, cx ?? 0, cy ?? 0, r ?? 90, (r ?? 90) * 0.65, P.sage);
  oval(ctx, -60, -290, 72, 28, '#9eab76');
  ctx.restore();
};
export const tablets = (
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  scale = 1,
  color: Hex = P.gold,
) => {
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(scale, scale);
  for (const sx of [-53, 7]) {
    mass(ctx, '#998b74', () => {
      ctx.roundRect(sx, -65, 47, 115, [24, 24, 4, 4]);
    });
    ctx.fillStyle = color;
    for (let j = 0; j < 5; j++) ctx.fillRect(sx + 10, -25 + j * 13, 27, 3);
  }
  ctx.restore();
};
export const cross = (
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  scale = 1,
  color: Hex = P.wood,
) => {
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(scale, scale);
  ctx.fillStyle = color;
  ctx.fillRect(-18, -300, 36, 300);
  ctx.fillRect(-105, -222, 210, 30);
  ctx.restore();
};
export const heart = (ctx: CanvasRenderingContext2D, x: number, y: number, scale = 1) => {
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(scale, scale);
  mass(ctx, P.gold, () => {
    ctx.moveTo(0, 55);
    ctx.bezierCurveTo(-110, -10, -73, -90, 0, -45);
    ctx.bezierCurveTo(73, -90, 110, -10, 0, 55);
  });
  tablets(ctx, 0, -3, 0.48, P.white);
  ctx.restore();
};
export const robe = (
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  scale = 1,
  color: Hex = P.white,
) => {
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(scale, scale);
  mass(ctx, color, () => {
    ctx.moveTo(-28, -62);
    ctx.lineTo(-78, -28);
    ctx.lineTo(-55, 10);
    ctx.lineTo(-30, -9);
    ctx.lineTo(-49, 63);
    ctx.quadraticCurveTo(0, 77, 49, 63);
    ctx.lineTo(30, -9);
    ctx.lineTo(55, 10);
    ctx.lineTo(78, -28);
    ctx.lineTo(28, -62);
    ctx.quadraticCurveTo(0, -39, -28, -62);
  });
  ctx.fillStyle = P.peach;
  ctx.fillRect(-3, -35, 6, 87);
  ctx.restore();
};
export const wordLight = (ctx: CanvasRenderingContext2D, x: number, y: number, scale = 1) => {
  glow(ctx, x, y, 125 * scale, P.gold, 0.6);
  oval(ctx, x, y, 56 * scale, 35 * scale, P.gold);
  mass(ctx, P.gold, () => {
    ctx.moveTo(x - 20 * scale, y + 22 * scale);
    ctx.lineTo(x - 39 * scale, y + 53 * scale);
    ctx.lineTo(x + 1 * scale, y + 31 * scale);
  });
  ctx.fillStyle = P.white;
  ctx.fillRect(x - 25 * scale, y - 5 * scale, 50 * scale, 6 * scale);
};
export const gifts = (
  ctx: CanvasRenderingContext2D,
  lit: readonly [number, number, number],
  alpha = 1,
  y = 205,
) => {
  ctx.save();
  ctx.globalAlpha *= alpha;
  for (let i = 0; i < 3; i++) {
    const x = 650 + i * 310;
    const a = lit[i] ?? 0;
    oval(ctx, x, y, 110, 94, mix(P.tealDeep, P.gold, 0.23 * a));
    if (a > 0) glow(ctx, x, y, 148, P.gold, a * 0.6);
    ctx.save();
    ctx.globalAlpha *= 0.38 + 0.62 * a;
    if (i === 0) wordLight(ctx, x, y, 0.9);
    else if (i === 1) robe(ctx, x, y, 0.9);
    else heart(ctx, x, y, 0.9);
    ctx.restore();
  }
  ctx.restore();
};
export const inscription = (
  f: Frame,
  text: string,
  x: number,
  y: number,
  size = 62,
  progress = 1,
  alpha = 1,
  hollow = 0,
  color: Hex = P.cream,
) => {
  write(
    f.ctx,
    text,
    x,
    y,
    { family: fonts.display, size, weight: 600, color, align: 'center' },
    f.hand(text),
    { progress, alpha, boil: 0, outline: hollow, fill: hollow > 0 ? 0 : 1 },
  );
};
export const bed = (ctx: CanvasRenderingContext2D, x: number, y: number, scale = 1, roll = 0) => {
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(scale, scale);
  ctx.fillStyle = P.wood;
  ctx.fillRect(-220, 18, 440, 17);
  ctx.fillStyle = '#b99770';
  ctx.fillRect(-215, -12, 430 * (1 - roll), 35);
  oval(ctx, 214 - 400 * roll, 4, 14 + 22 * roll, 19, '#d4b68c');
  ctx.restore();
};
export const sleeping = (
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  scale = 1,
  clean = 0,
) => {
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(scale, scale);
  oval(ctx, 0, -10, 180, 40, mix('#797d7c', P.white, clean));
  oval(ctx, -165, -35, 31, 37, P.skin);
  oval(ctx, -176, -43, 27, 15, P.hair);
  ctx.fillStyle = P.ink;
  ctx.fillRect(-183, -36, 12, 3);
  if (clean < 1) oval(ctx, 20, -21, 25 * (1 - clean), 18 * (1 - clean), P.scarlet);
  ctx.restore();
};
export const bench = (ctx: CanvasRenderingContext2D, warm = 0) => {
  const g = ctx.createLinearGradient(900, 560, 1600, 950);
  g.addColorStop(0, mix('#815f48', P.gold, warm));
  g.addColorStop(1, P.tealDeep);
  ctx.fillStyle = g;
  ctx.fillRect(980, 670, 650, 270);
  ctx.fillStyle = P.peach;
  ctx.fillRect(953, 651, 708, 22);
  ctx.fillStyle = '#b08d62';
  for (let i = 0; i < 3; i++) ctx.fillRect(1010 + i * 200, 720, 160, 164);
};
export const papers = (ctx: CanvasRenderingContext2D, progress: number) => {
  ctx.save();
  for (let i = 0; i < 8; i++) {
    ctx.save();
    ctx.translate(430 + (i % 3) * 5, 958 - i * 4 - 110 * (1 - progress));
    ctx.rotate(((i % 3) - 1) * 0.035);
    ctx.fillStyle = i % 2 ? P.cream : P.peach;
    ctx.fillRect(0, -28, 220, 28);
    ctx.fillStyle = '#796b5d';
    ctx.fillRect(15, -22, 85, 1.5);
    ctx.fillRect(15, -15, 130, 1.5);
    ctx.restore();
  }
  ctx.restore();
};
export const judge = (progress: number, lean = 0): Figure => {
  const angle = -0.8 + progress * 0.8;
  return person(1390, 847, 495, {
    pose: 'sit',
    robe: P.ink,
    head: 'bare',
    beard: true,
    lean,
    near: {
      to: [
        (1450 - 85 * Math.cos(angle) - 1390) / 495,
        (545 + 67 * progress - 85 * Math.sin(angle) - 847) / 495,
      ],
      grip: 'hold',
    },
  });
};
export const gavel = (ctx: CanvasRenderingContext2D, progress: number) => {
  ctx.save();
  ctx.translate(1450, 545 + 67 * progress);
  ctx.rotate(-0.8 + progress * 0.8);
  ctx.fillStyle = P.woodLit;
  ctx.fillRect(-110, -7, 150, 14);
  ctx.fillStyle = P.wood;
  ctx.fillRect(10, -40, 42, 78);
  ctx.restore();
};
export const loom = (ctx: CanvasRenderingContext2D, progress: number) => {
  ctx.fillStyle = P.woodLit;
  ctx.fillRect(640, 330, 30, 500);
  ctx.fillRect(1250, 330, 30, 500);
  ctx.fillRect(620, 330, 690, 30);
  ctx.fillStyle = P.gold;
  for (let i = 0; i < 30; i++) ctx.fillRect(682 + i * 18, 365, 3, 425);
  ctx.fillStyle = P.white;
  for (let i = 0; i < 28; i++) ctx.fillRect(680, 780 - i * 14, Math.min(550, 550 * progress), 6);
  robe(ctx, 960, 590, 2.1 * progress);
};

export type Setting =
  | 'court'
  | 'temple'
  | 'roof'
  | 'hall'
  | 'garden'
  | 'town'
  | 'desert'
  | 'creation'
  | 'cross'
  | 'sanctuary'
  | 'field'
  | 'city'
  | 'page';
interface PaintedSet {
  sky: Painting;
  back: Painting;
  ground: Painting;
  fore: Painting;
}
const sets = new Map<Setting, PaintedSet>();
const interiors = new Set<Setting>(['court', 'temple', 'roof', 'hall', 'sanctuary']);
const architecture = (ctx: CanvasRenderingContext2D, setting: Setting) => {
  if (interiors.has(setting)) {
    ctx.fillStyle = setting === 'roof' ? '#4d6667' : P.tealDeep;
    ctx.fillRect(-240, 260, 2400, 720);
    const g = ctx.createLinearGradient(250, 350, 1700, 1000);
    g.addColorStop(0, P.peach);
    g.addColorStop(1, '#657b78');
    ctx.fillStyle = g;
    ctx.fillRect(-240, 330, 2400, 610);
    for (const x of [200, 670, 1140, 1610]) {
      ctx.fillStyle = P.tealDay;
      ctx.fillRect(x, 410, 175, 305);
      glow(ctx, x + 80, 450, 230, P.gold, 0.23);
      column(ctx, { x: x - 38, y: 940, w: 72, h: 630, stone: '#aa9c83', light: BUILT });
    }
    if (setting === 'roof') {
      ctx.fillStyle = P.wood;
      ctx.fillRect(-240, 330, 2400, 38);
      ctx.clearRect(575, 250, 380, 121);
    }
    if (setting === 'hall') {
      ctx.fillStyle = '#998465';
      ctx.fillRect(720, 935, 570, 35);
      ctx.fillStyle = P.wood;
      ctx.fillRect(770, 910, 470, 25);
      ctx.fillStyle = P.wood;
      ctx.fillRect(790, 725, 380, 210);
    }
    return;
  }
  if (setting === 'town' || setting === 'city') {
    const r = rng(881);
    for (let i = 0; i < 14; i++)
      house(ctx, {
        x: -180 + i * 165,
        y: 870 + (i % 3) * 42,
        w: 170,
        h: 130 + r() * 210,
        side: 40,
        wall: mix(P.peach, P.tealDay, r() * 0.45),
        light: BUILT,
        openings: [{ u: 0.32, v: 0.45, w: 0.22, h: 0.4, arch: true, lamp: P.gold }],
      });
    return;
  }
  const r = rng(59);
  for (let layer = 0; layer < 3; layer++)
    mass(
      ctx,
      mix(P.tealDeep, setting === 'desert' ? P.peach : P.tealDay, 0.72 - layer * 0.22),
      () => {
        ctx.moveTo(-240, 1200);
        for (let x = -240; x <= 2160; x += 50)
          ctx.lineTo(x, 640 + layer * 105 + 55 * Math.sin(x * 0.004 + layer) + r() * 18);
        ctx.lineTo(2160, 1200);
        ctx.closePath();
      },
    );
  if (setting === 'garden') {
    tree(ctx, 250, 965, 1.3);
    tree(ctx, 1580, 910, 0.9);
  }
  if (setting === 'field') {
    house(ctx, {
      x: 1450,
      y: 795,
      w: 270,
      h: 220,
      side: 50,
      wall: P.peach,
      light: BUILT,
      openings: [{ u: 0.3, v: 0.28, w: 0.3, h: 0.4, lamp: P.gold }],
    });
    tree(ctx, 1600, 1000, 1.15);
  }
  if (setting === 'desert')
    for (const x of [170, 560, 1520])
      mass(ctx, '#9c7962', () => {
        ctx.moveTo(x - 100, 830);
        ctx.lineTo(x, 690);
        ctx.lineTo(x + 100, 830);
        ctx.closePath();
      });
};
const setOf = (setting: Setting): PaintedSet => {
  const existing = sets.get(setting);
  if (existing) return existing;
  const sky: Painting = {
    w: 2400,
    h: 1400,
    brush: brushes.sky(73),
    guide: (ctx) => {
      ctx.translate(240, 160);
      const g = ctx.createLinearGradient(0, -160, 0, 1080);
      g.addColorStop(0, setting === 'cross' ? P.indigo : P.tealDeep);
      g.addColorStop(0.45, setting === 'cross' ? P.rose : P.tealDay);
      g.addColorStop(0.74, setting === 'cross' ? P.ember : P.peach);
      g.addColorStop(1, P.cream);
      ctx.fillStyle = g;
      ctx.fillRect(-240, -160, 2400, 1400);
      oval(ctx, 420, 490, 73, 73, P.sunCore);
    },
  };
  const back: Painting = {
    w: 2400,
    h: 1400,
    brush: brushes.far(33),
    guide: (ctx) => {
      ctx.translate(240, 160);
      architecture(ctx, setting);
    },
  };
  const ground: Painting = {
    w: 2400,
    h: 1400,
    brush: brushes.near(88, P.tealDeep),
    guide: (ctx) => {
      ctx.translate(240, 160);
      const g = ctx.createLinearGradient(0, 790, 0, 1200);
      g.addColorStop(0, setting === 'desert' ? '#c99b6c' : '#928f76');
      g.addColorStop(1, P.tealDeep);
      ctx.fillStyle = g;
      ctx.fillRect(-240, 940, 2400, 350);
      const r = rng(902);
      for (let i = 0; i < 80; i++) {
        ctx.fillStyle = i % 2 ? '#ad9f7f' : '#6c7f76';
        ctx.fillRect(r() * 2200 - 200, 955 + r() * 250, 28 + r() * 120, 2 + r() * 5);
      }
    },
  };
  const fore: Painting = {
    w: 2400,
    h: 1400,
    brush: brushes.far(62),
    blur: 3,
    guide: (ctx) => {
      ctx.translate(240, 160);
      const r = rng(301);
      for (const x of [-160, 30, 1890, 2100])
        for (let i = 0; i < 10; i++)
          mass(ctx, P.tealDeep, () => {
            ctx.moveTo(x + i * 10, 1240);
            ctx.lineTo(x + i * 10 - 12 - r() * 22, 1080 - r() * 110);
            ctx.lineTo(x + i * 10 + 8, 1240);
            ctx.closePath();
          });
    },
  };
  const set = { sky, back, ground, fore };
  sets.set(setting, set);
  return set;
};
export const stage = (f: Frame, setting: Setting, cam: Camera, actors: () => void, air = true) => {
  const { ctx, w, h, t } = f;
  const set = setOf(setting);
  const planes: Plane[] = [
    { z: 7, draw: () => drawPainting(ctx, set.sky, -240, -160) },
    { z: 3, draw: () => drawPainting(ctx, set.back, -240, -160) },
    { z: 1.8, draw: () => drawPainting(ctx, set.ground, -240, -160) },
    { z: 1, draw: actors },
    { z: 0.65, draw: () => drawPainting(ctx, set.fore, -240, -160) },
  ];
  multiplane(ctx, cam, w, h, planes, {
    fibre: 0,
    thickness: 0.08,
    haze: [
      [0, P.tealDeep],
      [0.5, P.peach],
      [1, P.tealDeep],
    ],
  });
  if (air)
    motes(ctx, t, {
      seed: 127,
      count: 30,
      box: [0, 180, 1920, 860],
      size: [0.8, 2.1],
      color: P.sunGlow,
      drift: [4, -2],
      sway: 12,
      alpha: 0.3,
      halo: 2,
    });
};
export const line = (
  ctx: CanvasRenderingContext2D,
  points: ReadonlyArray<readonly [number, number]>,
  color: Hex,
  width = 3,
) => {
  unprobed(ctx, () => {
    ctx.strokeStyle = color;
    ctx.lineWidth = width;
    ctx.beginPath();
    for (const [i, p] of points.entries())
      if (i === 0) ctx.moveTo(p[0], p[1]);
      else ctx.lineTo(p[0], p[1]);
    ctx.stroke();
  });
};
export { figure };

/** The landing's rooftop, shared by the answer and the clear end. */
export const rooftop = (ctx: CanvasRenderingContext2D, turn: number) => {
  house(ctx, {
    x: 940,
    y: 985,
    w: 540,
    h: 245,
    side: 65,
    wall: P.peach,
    light: BUILT,
    openings: [
      { u: 0.24, v: 0.3, w: 0.17, h: 0.5, lamp: P.gold },
      { u: 0.66, v: 0.3, w: 0.17, h: 0.5, lamp: P.gold },
    ],
  });
  figure(
    ctx,
    person(1110, 807.5, 250, {
      pose: 'sit',
      robe: P.white,
      cloth: P.white,
      dir: 1,
      turn: 0.3 + 0.3 * turn,
      near: { to: [0.15, -0.38], grip: 'rest' },
      face: { smile: 0.5 },
    }),
  );
  figure(
    ctx,
    christ(1240, 810.2, 260, {
      pose: 'sit',
      dir: -1,
      turn: 0.3 + 0.3 * turn,
      face: { smile: 0.4 },
    }),
  );
};
