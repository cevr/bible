// The bold look's courtroom: a flat poster world assembled as it is named,
// then cut like a title sequence. Four shots, each cut on a cue's first
// frame (so on its mark):
//
// - the wide, from the first frame to `bow`: the room slams together on
//   "Imagine standing in a courtroom" (the floor, the wall, the bench, the
//   judge, the accused, each on its own share of the span from the scene's
//   start to {evidence}), then the evidence drops, file on file, into a
//   tower beside the accused;
// - the accused's face, from `bow` ("You did it."): a face filling nearly
//   half the frame, the head going down, the evidence looming at the edge;
// - the judge from below, from `lean` ("And the judge looks at you and
//   says,"), from where the accused stands, so he looks into the lens: he
//   leans in, raises the gavel and brings it down;
// - the verdict, from `stamp`, cut on the gavel's blow: the wide again, a
//   hollow gold stamp slammed across the bench, the frame jolted, and the
//   accused's head coming up (`lift`).
//
// The camera never holds: each shot pushes in at its own slow rate.

import { type TextStyle, measure, write } from '@bible/film/canvas';
import { type Key, clamp, keys, lerp, rng } from '@bible/film/core';
import type { CourtFrame } from '../../scenes/court.ts';
import { FACE, INK, bar, disc, frame, poly, rect } from './flat.ts';

/** Where the floor meets the wall: everyone stands on it. */
const FLOOR = 880;
/** The accused: feet on the floor, screen left, facing the bench. */
const ACCUSED = { x: 450, y: FLOOR } as const;
/** The judge's head, behind the bench. */
const JUDGE = { x: 1190, y: 350 } as const;
/** The bench's face and its rim. */
const BENCH = { x: 860, y: 520, w: 660, h: FLOOR - 520 } as const;
/** The gavel's block on the rim, and the judge's hand that holds it (the pivot). */
const BLOCK = { x: 1330, y: 490 } as const;
const GRIP = { x: 1425, y: 420 } as const;

/** The evidence: files dropped one on another, each its own width and set. */
const FILES = (() => {
  const r = rng(1844);
  return Array.from({ length: 15 }, (_, i) => ({
    w: 210 + r() * 60,
    dx: (r() - 0.5) * 34,
    tab: 0.15 + r() * 0.55,
    dark: i % 2 === 0,
  }));
})();
const FILE_H = 40;
const STACK_X = 695;

/** The gavel's raise across its cue: up, down hard, a small bounce, at rest. */
const SWING: ReadonlyArray<Key> = [
  [0, 0],
  [0.373, 1],
  [0.627, 0, 'inCubic'],
  [0.797, 0.14, 'outQuad'],
  [1, 0],
];

/** A camera: the world point at the frame's centre, how far in, and how far off square. */
interface Shot {
  readonly x: number;
  readonly y: number;
  readonly zoom: number;
  readonly tilt: number;
}

/** The accused at rest, bowed, or lifting to the verdict. */
interface Pose {
  readonly bow: number;
  readonly lift: number;
  readonly breath: number;
}

/** A disc's cap: the arc from `a0` to `a1` closed by its chord. */
const cap = (
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  r: number,
  a0: number,
  a1: number,
  color: string,
) => {
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.arc(x, y, r, a0, a1);
  ctx.closePath();
  ctx.fill();
};

/** An ellipse, flat (an eye that narrows as it closes). */
const oval = (
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  rx: number,
  ry: number,
  color: string,
) => {
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.ellipse(x, y, rx, Math.max(0.5, ry), 0, 0, Math.PI * 2);
  ctx.fill();
};

/** The accused: a garment of the deep slate, the scarlet stain on it, a face turned to the bench. */
const accused = (ctx: CanvasRenderingContext2D, p: Pose) => {
  const sway = p.breath * 4;
  const body: ReadonlyArray<readonly [number, number]> = [
    [-118, -372 + sway],
    [-82, -410 + sway],
    [82, -410 + sway],
    [118, -372 + sway],
    [156, 0],
    [-156, 0],
  ];
  poly(ctx, body, INK.deep);
  // The stain: one scarlet disc, cut off by the garment's edge.
  ctx.save();
  ctx.beginPath();
  for (const [i, [x, y]] of body.entries()) {
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.closePath();
  ctx.clip();
  disc(ctx, 70, -250, 88, INK.scarlet);
  ctx.restore();

  // The hands, floating at the hips: down and in as the head goes down.
  const fall = 26 * p.bow * (1 - p.lift);
  disc(ctx, -158 + 20 * p.bow, -178 + fall + sway, 24, INK.face);
  disc(ctx, 168 - 24 * p.bow, -170 + fall + sway, 24, INK.face);

  // The head turns down about the neck as it bows, and comes up at the verdict.
  const down = p.bow * (1 - p.lift);
  ctx.save();
  ctx.translate(0, -420 + sway);
  ctx.rotate(0.32 * down - 0.06 * p.lift);
  ctx.translate(14 * down, -78 + 24 * down);
  const r = 90;
  disc(ctx, 0, 0, r, INK.face);
  // The hair: swept back over the crown, the face turned out of it toward the bench.
  cap(ctx, -2, -2, r + 5, Math.PI * 0.75, Math.PI * 1.6, INK.ink);
  // Eyes toward the bench; narrowed to slits when the head is down, wide at the verdict.
  const open = lerp(lerp(0.1, 0.028, down), 0.12, p.lift);
  for (const ex of [0.16, 0.56]) oval(ctx, ex * r, 0.12 * r, 0.085 * r, open * r, INK.ink);
  // The brows: their inner ends raised, more so when bowed.
  const worry = 0.12 + 0.18 * down - 0.1 * p.lift;
  bar(ctx, 0.04 * r, -0.08 * r, 0.3 * r, (-0.08 - worry) * r - 0.04 * r, 0.06 * r, INK.ink);
  bar(ctx, 0.44 * r, (-0.08 - worry) * r - 0.04 * r, 0.7 * r, -0.1 * r, 0.06 * r, INK.ink);
  // The mouth: a short bar, opening to a round "o" at the verdict.
  if (p.lift > 0.5) oval(ctx, 0.4 * r, 0.52 * r, 0.07 * r, 0.09 * r * p.lift, INK.ink);
  else rect(ctx, 0.28 * r, 0.5 * r, 0.24 * r, 0.055 * r, INK.ink);
  ctx.restore();
};

/** The judge, behind the bench: an ink robe, two bands, a heavy brow; leaning in by `lean`. */
const judge = (ctx: CanvasRenderingContext2D, lean: number, breath: number) => {
  const { x, y } = JUDGE;
  const lx = -16 * lean;
  const ly = 18 * lean + breath * 2;
  poly(
    ctx,
    [
      [x - 150 + lx, y + 86 + ly],
      [x + 150 + lx, y + 86 + ly],
      [x + 210, y + 260],
      [x - 210, y + 260],
    ],
    INK.ink,
  );
  rect(ctx, x - 22 + lx, y + 72 + ly, 16, 54, INK.face);
  rect(ctx, x + 6 + lx, y + 72 + ly, 16, 54, INK.face);
  // The head comes toward the one he looks at as he leans.
  const r = 84 * (1 + 0.1 * lean);
  const hx = x + lx;
  const hy = y + ly;
  disc(ctx, hx, hy, r, INK.face);
  cap(ctx, hx, hy - 4, r + 3, Math.PI * 1.17, Math.PI * 1.83, INK.ink);
  // Eyes on you (the accused is the viewer): down a little as he leans.
  for (const ex of [-0.34, 0.34])
    oval(ctx, hx + ex * r, hy + (0.08 + 0.05 * lean) * r, 0.085 * r, 0.1 * r, INK.ink);
  // Heavy brows, level and grave, lifting a touch as he leans in: attention, not anger.
  const brow = hy - (0.2 + 0.05 * lean) * r;
  rect(ctx, hx - 0.56 * r, brow - 0.05 * r, 0.4 * r, 0.1 * r, INK.ink);
  rect(ctx, hx + 0.16 * r, brow - 0.05 * r, 0.4 * r, 0.1 * r, INK.ink);
  rect(ctx, hx - 0.15 * r, hy + 0.5 * r, 0.3 * r, 0.06 * r, INK.ink);
};

/** The gavel at `raise` (0 down on its block, 1 high), in the judge's floating hand. */
const gavel = (ctx: CanvasRenderingContext2D, raise: number, lean: number) => {
  const gx = GRIP.x - 10 * lean;
  const gy = GRIP.y + 12 * lean - 40 * raise;
  const rest = Math.atan2(BLOCK.y - 22 - gy, BLOCK.x - gx);
  const a = rest + 1.75 * raise;
  const len = Math.hypot(BLOCK.y - 22 - gy, BLOCK.x - gx);
  const hx = gx + Math.cos(a) * len;
  const hy = gy + Math.sin(a) * len;
  bar(ctx, gx, gy, hx, hy, 14, INK.ink);
  ctx.save();
  ctx.translate(hx, hy);
  ctx.rotate(a + Math.PI / 2);
  rect(ctx, -62, -26, 124, 52, INK.ink);
  rect(ctx, -62, -8, 124, 6, INK.panel);
  ctx.restore();
  disc(ctx, gx, gy, 27, INK.face);
};

/** The room's pieces as they slam together over the opening: each 0→1. */
interface Built {
  readonly floor: number;
  readonly wall: number;
  readonly bench: number;
  readonly judge: number;
  readonly accused: number;
}

/** The whole room, in the world's own units (1920 × 1080 at a zoom of 1). */
const room = (f: CourtFrame, built: Built) => {
  const { ctx } = f;
  const breath = Math.sin(f.t * 2.3);
  const lean = f.at('lean');
  const raise = f.keys('gavel', SWING);

  // The floor wipes in from the left; the wall drops from above.
  rect(ctx, -1200, FLOOR, 4300 * built.floor, 900, INK.deep);
  const wallY = lerp(-1100, 0, built.wall);
  // The court's half of the frame is one slate field to the right edge and past it.
  rect(ctx, 800, -400 + wallY, 2400, FLOOR + 400, INK.slate);
  for (const x of [880, 1440]) rect(ctx, x, -400 + wallY, 60, FLOOR + 400, INK.deep);

  // The judge rises behind the bench; the bench rises from the floor.
  const judgeY = lerp(560, 0, built.judge);
  const benchY = lerp(700, 0, built.bench);
  ctx.save();
  ctx.beginPath();
  ctx.rect(-2000, -2000, 6000, 2000 + BENCH.y + benchY);
  ctx.clip();
  ctx.translate(0, judgeY);
  if (built.judge > 0) {
    judge(ctx, lean, breath);
    gavel(ctx, raise, lean);
  }
  ctx.restore();
  ctx.save();
  ctx.translate(0, benchY);
  rect(ctx, BENCH.x, BENCH.y, BENCH.w, BENCH.h + 400, INK.ink);
  rect(ctx, BENCH.x - 34, BENCH.y - 26, BENCH.w + 68, 38, INK.panel);
  for (const i of [0, 1, 2]) rect(ctx, BENCH.x + 40 + i * 205, BENCH.y + 70, 170, 240, INK.panel);
  rect(ctx, BLOCK.x - 48, BLOCK.y - 4, 96, 16, INK.deep);
  ctx.restore();

  // The evidence, file on file, each dropping from above the frame and stopping dead.
  FILES.forEach((file, i) => {
    const k = f.stagger('drop', i, FILES.length);
    if (k <= 0) return;
    const y = FLOOR - (i + 1) * FILE_H + lerp(-1200, 0, k);
    const x = STACK_X + file.dx - file.w / 2;
    rect(ctx, x, y, file.w, FILE_H - 3, file.dark ? INK.ink : INK.panel);
    rect(ctx, x + file.w * file.tab, y + 10, 46, 14, INK.bone);
  });

  // The accused slides in from the left.
  const ax = ACCUSED.x + lerp(-800, 0, built.accused);
  ctx.save();
  ctx.translate(ax, ACCUSED.y);
  accused(ctx, { bow: f.at('bow'), lift: f.at('lift'), breath });
  ctx.restore();
};

/** The verdict: a hollow gold stamp slammed across the bench, its letters cut as outlines. */
const stamp = (f: CourtFrame) => {
  const { ctx } = f;
  const k = f.at('stamp');
  if (k <= 0) return;
  ctx.save();
  ctx.translate(BENCH.x + BENCH.w / 2, BENCH.y + 190);
  ctx.rotate(-0.09);
  const s = lerp(1.7, 1, k);
  ctx.scale(s, s);
  const type: TextStyle = {
    family: FACE,
    size: 156,
    weight: 700,
    color: INK.gold,
    align: 'center',
    tracking: 0.01,
  };
  const W = measure(ctx, 'RIGHTEOUS', type) + 140;
  const H = 250;
  frame(ctx, -W / 2, -H / 2, W, H, 22, INK.gold);
  write(ctx, 'RIGHTEOUS', 0, 56, type, f.hand('verdict'), { boil: 0, outline: 10, fill: 0 });
  ctx.restore();
};

export const court = (f: CourtFrame) => {
  const { ctx, w, h, t } = f;
  // The opening's span, from the first frame to {evidence}: the room's pieces land on its shares.
  const open = clamp(t / f.mark('evidence'));
  const built: Built = {
    floor: keys(open, [
      [0, 0],
      [0.16, 1, 'outCubic'],
    ]),
    wall: keys(open, [
      [0.08, 0],
      [0.26, 1, 'outExpo'],
    ]),
    bench: keys(open, [
      [0.18, 0],
      [0.36, 1, 'outExpo'],
    ]),
    judge: keys(open, [
      [0.3, 0],
      [0.46, 1, 'outCubic'],
    ]),
    accused: keys(open, [
      [0.4, 0],
      [0.58, 1, 'outExpo'],
    ]),
  };

  const bow = f.cue('bow');
  const lean = f.cue('lean');
  const slam = f.cue('stamp');
  // Each shot pushes in from its cut at its own rate (a share of its zoom a second).
  const pushed = (zoom: number, rate: number, cut: number) => zoom * Math.exp(rate * (t - cut));
  // The wide is square to the room; the close shots lean off it, the poster's diagonal.
  const shot: Shot =
    t < bow.start
      ? { x: 1000, y: 560, zoom: pushed(1, 0.012, 0), tilt: 0 }
      : t < lean.start
        ? {
            x: ACCUSED.x + 150,
            y: ACCUSED.y - 480,
            zoom: pushed(2.45, 0.035, bow.start),
            tilt: -0.07,
          }
        : t < slam.start
          ? { x: JUDGE.x + 100, y: JUDGE.y + 80, zoom: pushed(2.1, 0.03, lean.start), tilt: 0.09 }
          : { x: 1010, y: 590, zoom: pushed(1.1, 0.02, slam.start), tilt: -0.035 };
  // The blow jolts the frame down and the lift lets it back.
  const jolt = 16 * (f.at('stamp') - f.at('lift'));

  rect(ctx, 0, 0, w, h, INK.bone);
  ctx.save();
  ctx.translate(w / 2, h / 2 + jolt);
  ctx.rotate(shot.tilt);
  ctx.scale(shot.zoom, shot.zoom);
  ctx.translate(-shot.x, -shot.y);
  room(f, built);
  stamp(f);
  ctx.restore();
};
