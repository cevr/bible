// A cut-paper person. Feet stand at the origin; the figure is ~440 units tall
// at scale 1. A pose is a handful of angles, so figures can be keyframed like
// any other number.

import { type CutoutStyle, cutout } from './cutout.ts';
import { type Hand, type Pt, ellipseShape, quad, spline, stroke } from './ink.ts';
import { hash2 } from '../core/random.ts';

export interface Pose {
  /** Whole-body lean, radians (+ leans right). */
  lean?: number;
  /** Shoulder angle from straight down, radians (+ swings forward/outward). */
  armL?: number;
  armR?: number;
  /** Elbow bend, radians. */
  elbowL?: number;
  elbowR?: number;
  headTilt?: number;
  /** Vertical squash for breathing/landing, 1 = rest. */
  squash?: number;
}

export type Face = 'calm' | 'sad' | 'joy' | 'shut' | 'none';

export interface Look {
  robe: string;
  skin: string;
  ink: string;
  hair?: string;
  /** Tattered hem and patches. */
  rags?: boolean;
  face?: Face;
  /** Paper grain on the robe. */
  grain?: number;
}

export const STAND: Required<Pose> = {
  lean: 0,
  armL: 0.15,
  armR: 0.15,
  elbowL: 0.1,
  elbowR: 0.1,
  headTilt: 0,
  squash: 1,
};

const HEAD_R = 54;
const NECK_Y = -318;
const HEM_Y = -26;

/** The outline of the robe. */
export const robeShape = (rags: boolean, seed: number): Pt[] => {
  const top: Pt[] = [
    [-58, NECK_Y + 6],
    [-86, NECK_Y + 40],
    [-98, -170],
    [-112, HEM_Y],
  ];
  const hem: Pt[] = [];
  const n = rags ? 9 : 2;
  for (let i = 0; i <= n; i++) {
    const x = -112 + (224 * i) / n;
    const dip = rags ? (i % 2 === 1 ? 26 + hash2(i, seed) * 26 : -4 + hash2(i, seed) * 8) : 0;
    hem.push([x, HEM_Y + dip]);
  }
  const side: Pt[] = [
    [98, -170],
    [86, NECK_Y + 40],
    [58, NECK_Y + 6],
  ];
  return [...spline(top, 8), ...hem, ...spline([[112, HEM_Y], ...side], 8)];
};

const armPath = (side: -1 | 1, shoulder: number, elbow: number): Pt[] => {
  const sx = side * 74;
  const sy = NECK_Y + 44;
  const a = side * shoulder;
  const upper = 120;
  const lower = 110;
  const ex = sx + Math.sin(a) * upper;
  const ey = sy + Math.cos(a) * upper;
  const b = a + side * elbow;
  const hx = ex + Math.sin(b) * lower;
  const hy = ey + Math.cos(b) * lower;
  return spline(
    [
      [sx, sy],
      [ex, ey],
      [hx, hy],
    ],
    10,
  );
};

export const drawFigure = (ctx: CanvasRenderingContext2D, pose: Pose, look: Look, hand: Hand) => {
  const p = { ...STAND, ...pose };
  const rags = look.rags ?? false;
  ctx.save();
  ctx.rotate(p.lean);
  ctx.scale(1, p.squash);
  const sub = (k: number): Hand => ({ boil: hand.boil, seed: hand.seed + k });
  const paper: Omit<CutoutStyle, 'color'> = {
    torn: 2.5,
    rim: 3,
    shadow: 0.55,
    grain: look.grain ?? 0.7,
  };

  // Feet.
  cutout(ctx, ellipseShape(-40, -14, 30, 14), { ...paper, color: look.ink, rim: 2 }, sub(1));
  cutout(ctx, ellipseShape(40, -14, 30, 14), { ...paper, color: look.ink, rim: 2 }, sub(2));

  // Back arm, robe, front arm — the far arm tucks behind the body.
  const armL = armPath(-1, p.armL, p.elbowL);
  const armR = armPath(1, p.armR, p.elbowR);
  const sleeve = (path: Pt[], k: number) => {
    stroke(
      ctx,
      path,
      { color: look.robe, width: 40, jitter: 0.8, taper: 0.05, pressure: 0.1 },
      sub(k),
    );
    const handPt = path[path.length - 1] ?? [0, 0];
    cutout(
      ctx,
      ellipseShape(handPt[0], handPt[1], 17, 17, 20),
      { ...paper, color: look.skin, rim: 2, shadow: 0.3 },
      sub(k + 1),
    );
  };
  sleeve(armL, 10);
  cutout(ctx, robeShape(rags, hand.seed), { ...paper, color: look.robe }, sub(3));
  if (rags) {
    // Patches and a tear or two.
    cutout(
      ctx,
      [
        [-60, -200],
        [-20, -206],
        [-16, -160],
        [-58, -156],
      ],
      { ...paper, color: look.ink, alpha: 0.18, rim: 0, shadow: 0 },
      sub(4),
    );
    cutout(
      ctx,
      [
        [20, -110],
        [66, -118],
        [70, -70],
        [26, -64],
      ],
      { ...paper, color: look.ink, alpha: 0.15, rim: 0, shadow: 0 },
      sub(5),
    );
    stroke(
      ctx,
      quad([30, -260], [44, -236], [36, -210]),
      { color: look.ink, width: 3, alpha: 0.6 },
      sub(6),
    );
  }
  sleeve(armR, 12);

  // Head.
  ctx.save();
  ctx.translate(0, NECK_Y);
  ctx.rotate(p.headTilt);
  const cy = -HEAD_R + 6;
  cutout(ctx, ellipseShape(0, cy, HEAD_R, HEAD_R * 1.04), { ...paper, color: look.skin }, sub(20));
  if (look.hair !== undefined) {
    const hair: Pt[] = [
      ...spline(
        [
          [-HEAD_R - 4, cy + 4],
          [-HEAD_R + 6, cy - 40],
          [0, cy - HEAD_R - 6],
          [HEAD_R - 6, cy - 40],
          [HEAD_R + 4, cy + 4],
        ],
        8,
      ),
      [HEAD_R - 10, cy - 18],
      [0, cy - 34],
      [-HEAD_R + 10, cy - 18],
    ];
    cutout(ctx, hair, { ...paper, color: look.hair, rim: 0, shadow: 0.2 }, sub(21));
  }
  drawFace(ctx, look.face ?? 'calm', cy, look.ink, sub(30));
  ctx.restore();
  ctx.restore();
};

const drawFace = (
  ctx: CanvasRenderingContext2D,
  face: Face,
  cy: number,
  ink: string,
  hand: Hand,
) => {
  if (face === 'none') return;
  const ey = cy + 4;
  const eye = (x: number, k: number) => {
    if (face === 'shut' || face === 'joy') {
      const up = face === 'joy' ? -1 : 1;
      stroke(
        ctx,
        quad([x - 9, ey], [x, ey + 7 * up * -1], [x + 9, ey]),
        { color: ink, width: 4.5, jitter: 0.4 },
        { ...hand, seed: hand.seed + k },
      );
    } else {
      ctx.fillStyle = ink;
      ctx.beginPath();
      ctx.ellipse(x, ey, 5.5, 7, 0, 0, Math.PI * 2);
      ctx.fill();
    }
  };
  eye(-19, 1);
  eye(19, 2);
  const my = cy + 26;
  const curve = face === 'joy' ? 9 : face === 'sad' ? -7 : 3;
  stroke(
    ctx,
    quad([-11, my], [0, my + curve], [11, my]),
    { color: ink, width: 4, jitter: 0.4 },
    { ...hand, seed: hand.seed + 3 },
  );
  // Cheeks.
  ctx.save();
  ctx.globalAlpha = 0.28;
  ctx.fillStyle = '#e0736a';
  for (const x of [-32, 32]) {
    ctx.beginPath();
    ctx.ellipse(x, cy + 18, 10, 6, 0, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
};
