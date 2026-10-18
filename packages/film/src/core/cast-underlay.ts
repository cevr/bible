// A cast sheet's underlay: a layout picture the engine draws, never painted,
// sent as a sheet try's last reference when a try faced the wrong way or
// was drawn off the canon. Blank house mannequins on one ground line, each
// the cast's canon of its own heads tall (3.36), each turned to its view's
// slot by where its eyes, nose and feet point, each arm hanging in its
// sleeve down the body's side with its hand a circle at the sleeve's end,
// touching the body (the house hand, CRAFT rule 12): the route copies what
// an underlay draws, so a hand drawn floating free would teach the retry to
// float it, and `sleeveReach` would flag it. The image route takes facing and the
// canon from a picture better than from words: in the prototype's first
// round words alone faced 3 of 9 sheets right, and with this underlay 6 of 7.
// Pure: slots in, RGBA out.

import { CANON_HEADS, type Slot } from './cast-sheet.ts';
import type { Raster } from './raster.ts';

type Rgb = readonly [number, number, number];

const GROUND_PAPER: Rgb = [243, 234, 216];
const GROUND_LINE: Rgb = [226, 212, 188];
const MANNEQUIN: Rgb = [228, 220, 206];
const MANNEQUIN_INK: Rgb = [120, 98, 84];

/** How an underlay is drawn: its size, and the hand's diameter as a share of the head's height. */
interface UnderlaySize {
  readonly width: number;
  readonly height: number;
  /** The kept concept's hand, a share of its head's height (court-12's: about 0.33). */
  readonly hand: number;
}

/** The size the route draws a sheet at: a panel's. */
const UNDERLAY_SIZE: UnderlaySize = { width: 1536, height: 1024, hand: 0.33 };

/** One mannequin: its centre, its turn (−1 profile to the viewer's left … 1 to the right), and whether it is seen from behind. */
interface Pose {
  readonly x: number;
  readonly turn: number;
  readonly back: boolean;
  /** Whether its column draws it: a pose that does not stand (lying, crouching) is left to the layout's words. */
  readonly shown: boolean;
}

/** A slot as a mannequin turns: a three-quarter for left and right (a turnaround's profiles are its third and fifth views). */
const turnOf = (slot: Slot, profile: boolean): number =>
  ({ front: 0, back: 0, free: 0, left: profile ? -1 : -0.6, right: profile ? 1 : 0.6 })[slot];

const inEllipse = (x: number, y: number, cx: number, cy: number, rx: number, ry: number) =>
  ((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2 <= 1;

/** A mannequin's frame: its head's size and the rows its head, chin and hem sit on. */
interface Frame {
  readonly h: number;
  readonly hw: number;
  readonly hcy: number;
  readonly chin: number;
  readonly hem: number;
  readonly ground: number;
  readonly t: number;
  readonly shoulder: number;
  readonly hemHalf: number;
}

const frameOf = (p: Pose, ground: number, h: number): Frame => {
  const top = ground - CANON_HEADS * h;
  const t = Math.abs(p.turn);
  return {
    h,
    hw: 0.84 * h,
    hcy: top + h / 2,
    chin: top + h * 0.96,
    hem: ground - 0.1 * h,
    ground,
    t,
    shoulder: (0.4 - 0.1 * t) * h,
    hemHalf: (0.5 - 0.12 * t) * h,
  };
};

/** The head, and the nose on its facing side (a three-quarter's just inside the contour, a profile's past it). */
const inHead = (p: Pose, f: Frame, x: number, y: number) => {
  if (inEllipse(x, y, p.x, f.hcy, f.hw / 2, f.h / 2)) return true;
  if (p.turn === 0 || p.back) return false;
  const nx = p.x + Math.sign(p.turn) * (f.hw / 2) * (f.t === 1 ? 1 : 0.94);
  return inEllipse(x, y, nx, f.hcy + 0.08 * f.h, 0.09 * f.h, 0.07 * f.h);
};

/** The body: from the chin to the hem, narrower turned, its shoulders rounded. */
const inBody = (p: Pose, f: Frame, x: number, y: number) => {
  if (y < f.chin || y > f.hem) return false;
  const half = f.shoulder + (f.hemHalf - f.shoulder) * ((y - f.chin) / (f.hem - f.chin));
  const knee = f.chin + 0.25 * f.h;
  const round = y < knee ? Math.sqrt(Math.max(0, 1 - ((knee - y) / (0.25 * f.h)) ** 2)) : 1;
  return Math.abs(x - p.x) <= half * (0.75 + 0.25 * round);
};

/** Whether (x, y) lies within `r` of the segment from (ax, ay) to (bx, by). */
const inCapsule = (
  x: number,
  y: number,
  ax: number,
  ay: number,
  bx: number,
  by: number,
  r: number,
) => {
  const [dx, dy] = [bx - ax, by - ay];
  const k = Math.max(0, Math.min(1, ((x - ax) * dx + (y - ay) * dy) / (dx * dx + dy * dy)));
  return (x - ax - k * dx) ** 2 + (y - ay - k * dy) ** 2 <= r * r;
};

/**
 * The arms: each a sleeve hanging from the shoulder down the body's side to
 * its hand, a circle at the sleeve's end whose ring lies on the body's side
 * (a profile's near arm only, hanging over the body). The sleeve is a hand's
 * width, so the circle reads as the hand at its end.
 */
const inArms = (p: Pose, f: Frame, x: number, y: number, handShare: number) => {
  const r = (handShare * f.h) / 2;
  const handY = f.chin + 0.5 * (f.hem - f.chin);
  const sides = f.t === 1 ? [Math.sign(p.turn)] : [-1, 1];
  return sides.some((side) => {
    const reach = f.t === 1 ? 0.1 * f.h : (f.shoulder + f.hemHalf) / 2;
    const [sx, sy] = [p.x + side * (f.t === 1 ? 0 : f.shoulder - r), f.chin + 0.12 * f.h];
    const hx = p.x + side * reach;
    return inCapsule(x, y, sx, sy, hx, handY - 1.2 * r, r) || inEllipse(x, y, hx, handY, r, r);
  });
};

/** The feet, pointing the way it faces. */
const inFeet = (p: Pose, f: Frame, x: number, y: number) => {
  const dir = Math.sign(p.turn);
  return [-1, 1].some((side) => {
    const fx = p.back
      ? p.x + side * 0.28 * f.h
      : p.x + side * (0.28 - 0.18 * f.t) * f.h + dir * 0.18 * f.h * f.t;
    const rx = p.back ? 0.12 * f.h : (0.14 + 0.1 * f.t) * f.h;
    return inEllipse(x, y, fx, f.ground - 0.06 * f.h, rx, 0.07 * f.h);
  });
};

/** Whether (x, y) lies inside a mannequin: off its box at once, else its head, body, arms or feet. */
const inside = (p: Pose, f: Frame, x: number, y: number, handShare: number) =>
  p.shown &&
  y >= f.hcy - f.h &&
  y <= f.ground &&
  Math.abs(x - p.x) <= 1.2 * f.h &&
  (inHead(p, f, x, y) || inBody(p, f, x, y) || inArms(p, f, x, y, handShare) || inFeet(p, f, x, y));

/** Whether (x, y) is one of a mannequin's eyes: two from the front, one in profile, none from behind. */
const eyeAt = (p: Pose, x: number, y: number, ground: number, h: number) => {
  if (p.back) return false;
  const hw = 0.84 * h;
  const ey = ground - CANON_HEADS * h + h * 0.52;
  const r = 0.045 * h;
  const s = Math.sign(p.turn);
  const centres =
    p.turn === 0
      ? [p.x - 0.2 * hw, p.x + 0.2 * hw]
      : Math.abs(p.turn) === 1
        ? [p.x + s * 0.3 * hw]
        : [p.x + s * 0.05 * hw, p.x + s * 0.34 * hw];
  return centres.some((cx) => inEllipse(x, y, cx, ey, r, r * 1.3));
};

/** The ink line's half width, in pixels. */
const EDGE = 3;

/** Whether a masked pixel lies within `EDGE` of the mask's edge or the picture's: the outline, and the arm's own line where it lies over the body. */
const edgeAt = (mask: Uint8Array, W: number, H: number, x: number, y: number) => {
  for (let dy = -EDGE; dy <= EDGE; dy++)
    for (let dx = -EDGE; dx <= EDGE; dx++) {
      const [nx, ny] = [x + dx, y + dy];
      if (nx < 0 || ny < 0 || nx >= W || ny >= H || mask[ny * W + nx] === 0) return true;
    }
  return false;
};

/** A sheet's views as its underlay draws them: each view's slot, left to right; the views turned to full profile (a turnaround's third and fifth); the views it draws (those that stand). */
interface UnderlayViews {
  readonly slots: ReadonlyArray<Slot>;
  readonly profiles: ReadonlyArray<number>;
  readonly shown: ReadonlyArray<number>;
}

/**
 * The underlay of a sheet whose views face `slots`, left to right: one
 * mannequin per view shown, evenly spaced, on one ground line; a view not
 * shown leaves its column empty. Views named in `profiles` turn to full
 * profile, the rest of a side's to three-quarter.
 */
export const mannequinUnderlay = (
  { slots, profiles, shown }: UnderlayViews,
  size: UnderlaySize = UNDERLAY_SIZE,
): Raster => {
  const { width: W, height: H } = size;
  const ground = Math.round(0.91 * H);
  const step = W / slots.length;
  // A view's column holds its body and both arms (out to about 0.6 of a head each side).
  const h = Math.min((0.8 * H) / CANON_HEADS, step / 2.1);
  const poses: ReadonlyArray<Pose> = slots.map((slot, k) => ({
    x: step * (k + 0.5),
    turn: turnOf(slot, profiles.includes(k + 1)),
    back: slot === 'back',
    shown: shown.includes(k + 1),
  }));
  const column = (x: number) => Math.min(poses.length - 1, Math.max(0, Math.floor(x / step)));
  const nearest = (x: number) => poses[column(x)]!;
  const frames = poses.map((p) => frameOf(p, ground, h));
  const mask = new Uint8Array(W * H);
  const arms = new Uint8Array(W * H);
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      const [p, f] = [nearest(x), frames[column(x)]!];
      mask[y * W + x] = inside(p, f, x, y, size.hand) ? 1 : 0;
      arms[y * W + x] = mask[y * W + x] === 1 && inArms(p, f, x, y, size.hand) ? 1 : 0;
    }
  const colourAt = (x: number, y: number): Rgb => {
    if (mask[y * W + x] === 0) return y >= ground && y < ground + 3 ? GROUND_LINE : GROUND_PAPER;
    const inked =
      edgeAt(mask, W, H, x, y) ||
      (arms[y * W + x] === 1 && edgeAt(arms, W, H, x, y)) ||
      eyeAt(nearest(x), x, y, ground, h);
    return inked ? MANNEQUIN_INK : MANNEQUIN;
  };
  const rgba = new Uint8Array(W * H * 4);
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      const [r, g, b] = colourAt(x, y);
      const i = (y * W + x) * 4;
      rgba[i] = r;
      rgba[i + 1] = g;
      rgba[i + 2] = b;
      rgba[i + 3] = 255;
    }
  return { width: W, height: H, rgba };
};
