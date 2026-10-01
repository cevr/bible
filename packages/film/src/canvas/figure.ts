// A painted person: the figures of a painted film (planes painted, lit by a
// warm key and a cool shade), drawn whole each frame so they can move. A
// figure is a posed skeleton (standing, walking, seated, kneeling,
// stooping) dressed in a robe that falls from the shoulders to a flared
// hem, sleeves that follow each arm to a hand, a mantle, a sash, a head
// with a face that turns from profile to front, and what covers the head.
// It is built flat in its own colours on a sheet off the page, then lit as
// a painter lights it: a cool shade laid across it away from the light, the
// warm key on the side the light comes from, a hot rim along that edge, and
// a mottle of brush strokes over all, so it sits in the same paint as the
// plates behind it. Every number is in figure units (the standing height is
// 1, the feet at the origin, +x the way the figure faces), so one pose reads
// at any size and either way round.

import { rng } from '../core/random.ts';
import { type Hex, clearOf, mix } from './colour.ts';
import { offscreen } from './paper.ts';
import { probeFace } from './probe.ts';

/** A point in figure units: x forward (the way the figure faces), y down, the feet at 0. */
export type FigurePt = readonly [number, number];

/** How a hand is held: at rest, open palm up, raised palm out, closed, pointing, or holding something. */
export type FigureGrip = 'rest' | 'open' | 'palm' | 'fist' | 'point' | 'hold';

/** One arm: where its hand goes and how it is held. None: it hangs at the side. */
export interface FigureArm {
  /** The hand's place, in figure units. */
  readonly to: FigurePt;
  readonly grip?: FigureGrip;
  /** The hand's angle, in radians, in place of the forearm's line (0 points forward, −π/2 up). */
  readonly angle?: number;
}

/** What covers the head. */
export type FigureHead = 'bare' | 'cloth' | 'veil' | 'turban' | 'helmet' | 'hood';

/** A face's expression: all 0 is calm. */
export interface FigureFace {
  /** The brows, −1 drawn down (cross), +1 raised at the middle (worried, curious, glad). */
  readonly brow?: number;
  /** −1 a frown, +1 a smile. */
  readonly smile?: number;
  /** 0 closed, 1 open in speech or surprise. */
  readonly open?: number;
  /** The eyes, 1 open, 0 shut. */
  readonly eyes?: number;
  /** Where the eyes look, −1..1 each way, in the face's own frame (x forward, y down). */
  readonly look?: readonly [number, number];
}

/** A mark on the robe (a stain, a patch), in figure units. */
export interface FigureMark {
  readonly at: FigurePt;
  readonly r: number;
  readonly color: Hex;
}

/** The light a figure stands in. */
export interface FigureLight {
  /** The direction the light comes from, in radians in the frame (0 from the right, −π/2 from above). */
  readonly from: number;
  /** The warm key on the lit side. */
  readonly key: Hex;
  /** The hot edge where the key grazes the silhouette. */
  readonly rim: Hex;
  /** The cool shade on the far side. */
  readonly shade: Hex;
  /** How strong the shade lies, 0..1. Defaults to 0.55. */
  readonly depth?: number;
  /** The rim's width, in figure units. Defaults to 0.012. */
  readonly rimWidth?: number;
}

export interface Figure {
  /** Where the feet are, in world px. */
  readonly x: number;
  readonly y: number;
  /** The standing height, in world px. */
  readonly h: number;
  /** 1 faces right, −1 left. */
  readonly dir: 1 | -1;
  /** 0 in profile, 1 square to the viewer; between, three-quarter. Defaults to 0.45. */
  readonly turn?: number;
  readonly pose?: 'stand' | 'walk' | 'sit' | 'kneel' | 'stoop';
  /** A walk's phase, in radians: one stride each π. */
  readonly step?: number;
  /** The body leaning forward from the hips, in radians (back for negative). */
  readonly lean?: number;
  /** The head nodding forward (down), in radians; negative looks up. */
  readonly nod?: number;
  /** How broad the figure is, 1 usual. */
  readonly build?: number;
  readonly robe: Hex;
  readonly skin: Hex;
  readonly hair?: Hex;
  /** The head covering and its colour (the robe's, darker, when it names none). */
  readonly head?: FigureHead;
  readonly cloth?: Hex;
  readonly beard?: boolean;
  /** A mantle across the body from the far shoulder. */
  readonly mantle?: Hex;
  readonly sash?: Hex;
  /** A crest on a helmet, a breastplate's colour. */
  readonly crest?: Hex;
  readonly near?: FigureArm;
  readonly far?: FigureArm;
  readonly face?: FigureFace;
  readonly marks?: ReadonlyArray<FigureMark>;
  /** A light in the chest, its colour and strength 0..1 (it shows through the robe). */
  readonly glow?: { readonly color: Hex; readonly amount: number };
  readonly light: FigureLight;
  /** How opaque the whole figure is, 0..1. Defaults to 1. */
  readonly alpha?: number;
  /** The contact shadow's strength under the feet, 0 for none. Defaults to 0.45. */
  readonly shadow?: number;
  /** Seeds the brush mottle and the folds, so two figures are never painted alike. */
  readonly seed?: number;
}

/** The skeleton a pose sets, in figure units. */
interface Bones {
  hip: FigurePt;
  /** The torso's angle from upright, forward positive. */
  bend: number;
  neck: FigurePt;
  head: FigurePt;
  nearShoulder: FigurePt;
  farShoulder: FigurePt;
  /** Hip, knee, foot of each leg. */
  nearLeg: readonly [FigurePt, FigurePt, FigurePt];
  farLeg: readonly [FigurePt, FigurePt, FigurePt];
}

const TORSO = 0.31;
const NECK = 0.05;
const HEAD_RX = 0.058;
const HEAD_RY = 0.068;
const UPPER = 0.165;
const FORE = 0.15;

const rot = (p: FigurePt, a: number): FigurePt => [
  p[0] * Math.cos(a) - p[1] * Math.sin(a),
  p[0] * Math.sin(a) + p[1] * Math.cos(a),
];
const add = (a: FigurePt, b: FigurePt): FigurePt => [a[0] + b[0], a[1] + b[1]];
const lerpPt = (a: FigurePt, b: FigurePt, k: number): FigurePt => [
  a[0] + (b[0] - a[0]) * k,
  a[1] + (b[1] - a[1]) * k,
];

/** The legs a pose stands on: hip, knee and foot for each. */
interface Legs {
  hip: FigurePt;
  near: Bones['nearLeg'];
  far: Bones['farLeg'];
}

const legsOf = (pose: NonNullable<Figure['pose']>, step: number): Legs => {
  if (pose === 'sit') {
    const hip: FigurePt = [-0.04, -0.27];
    return {
      hip,
      near: [hip, [0.18, -0.28], [0.2, 0]],
      far: [hip, [0.17, -0.29], [0.15, 0]],
    };
  }
  if (pose === 'kneel') {
    const hip: FigurePt = [-0.02, -0.3];
    return {
      hip,
      near: [hip, [0.14, -0.27], [0.16, 0]],
      far: [hip, [0.0, -0.03], [-0.22, -0.01]],
    };
  }
  if (pose === 'walk') {
    const s = Math.sin(step);
    const lift = Math.max(0, Math.cos(step)) * 0.04;
    const hip: FigurePt = [0, -0.5 + Math.abs(Math.cos(step)) * 0.012];
    const nearFoot: FigurePt = [0.13 * s, 0];
    const farFoot: FigurePt = [-0.13 * s, -lift];
    return {
      hip,
      near: [hip, [0.07 * s + 0.02, -0.26], nearFoot],
      far: [hip, [-0.07 * s + 0.03, -0.26 - lift * 0.5], farFoot],
    };
  }
  const hip: FigurePt = [0, pose === 'stoop' ? -0.46 : -0.5];
  const bent = pose === 'stoop' ? 0.06 : 0;
  return {
    hip,
    near: [hip, [0.02 + bent, -0.25], [0.03, 0]],
    far: [hip, [-0.01 + bent, -0.25], [-0.04, 0]],
  };
};

/** The skeleton for `f`'s pose. */
const bonesOf = (f: Figure, turn: number): Bones => {
  const pose = f.pose ?? 'stand';
  const legs = legsOf(pose, f.step ?? 0);
  const bend = (pose === 'stoop' ? 0.85 : 0) + (f.lean ?? 0);
  const neck = add(legs.hip, rot([0, -TORSO], bend));
  const head = add(neck, rot([0.012, -NECK - HEAD_RY * 0.75], bend * 0.6 + (f.nod ?? 0) * 0.5));
  const sw = (0.04 + 0.06 * turn) * (f.build ?? 1);
  const shoulder = add(legs.hip, rot([0, -TORSO + 0.035], bend));
  return {
    hip: legs.hip,
    bend,
    neck,
    head,
    nearShoulder: add(shoulder, rot([-sw, 0.004], bend)),
    farShoulder: add(shoulder, rot([sw * 0.8, -0.004], bend)),
    nearLeg: legs.near,
    farLeg: legs.far,
  };
};

/**
 * The elbow of an arm from `s` reaching for `to`: two bones, the elbow bent
 * down and back, the hand pulled in to the arm's reach when it is past it.
 */
interface ArmBones {
  elbow: FigurePt;
  hand: FigurePt;
}

const elbowOf = (s: FigurePt, to: FigurePt): ArmBones => {
  const dx = to[0] - s[0];
  const dy = to[1] - s[1];
  const reach = UPPER + FORE - 1e-3;
  const d = Math.min(reach, Math.max(0.04, Math.hypot(dx, dy)));
  const a = Math.atan2(dy, dx);
  const hand: FigurePt = [s[0] + Math.cos(a) * d, s[1] + Math.sin(a) * d];
  const cos = (UPPER * UPPER + d * d - FORE * FORE) / (2 * UPPER * d);
  const inner = Math.acos(Math.min(1, Math.max(-1, cos)));
  // Bend so the elbow drops: the side whose elbow lies lower.
  const e1: FigurePt = [s[0] + Math.cos(a + inner) * UPPER, s[1] + Math.sin(a + inner) * UPPER];
  const e2: FigurePt = [s[0] + Math.cos(a - inner) * UPPER, s[1] + Math.sin(a - inner) * UPPER];
  const lower = e1[1] >= e2[1] ? e1 : e2;
  // Reaching forward, the elbow drops below; reaching back or up, it stays behind.
  const behind = e1[0] < e2[0] ? e1 : e2;
  const elbow = to[1] < s[1] - 0.05 ? behind : lower;
  return { elbow, hand };
};

/** A tapered limb through `pts`, `widths` wide at each, its ends rounded, added to the path as one closed shape. */
const limb = (
  ctx: CanvasRenderingContext2D,
  pts: ReadonlyArray<FigurePt>,
  widths: ReadonlyArray<number>,
) => {
  const n = pts.length;
  const side = (i: number, sign: number): FigurePt => {
    const p = pts[i] ?? [0, 0];
    const prev = pts[Math.max(0, i - 1)] ?? p;
    const next = pts[Math.min(n - 1, i + 1)] ?? p;
    const a = Math.atan2(next[1] - prev[1], next[0] - prev[0]);
    const w = ((widths[i] ?? 0.04) / 2) * sign;
    return [p[0] - Math.sin(a) * w, p[1] + Math.cos(a) * w];
  };
  /** A point past `i` along the limb's end, by half its width there. */
  const cap = (i: number, j: number): FigurePt => {
    const p = pts[i] ?? [0, 0];
    const q = pts[j] ?? p;
    const d = Math.hypot(p[0] - q[0], p[1] - q[1]) || 1;
    const w = (widths[i] ?? 0.04) * 0.7;
    return [p[0] + ((p[0] - q[0]) / d) * w, p[1] + ((p[1] - q[1]) / d) * w];
  };
  const first = side(0, 1);
  ctx.moveTo(first[0], first[1]);
  for (let i = 1; i < n; i++) {
    const p = side(i, 1);
    ctx.lineTo(p[0], p[1]);
  }
  const end = cap(n - 1, n - 2);
  const endR = side(n - 1, -1);
  ctx.quadraticCurveTo(end[0], end[1], endR[0], endR[1]);
  for (let i = n - 2; i >= 0; i--) {
    const p = side(i, -1);
    ctx.lineTo(p[0], p[1]);
  }
  const start = cap(0, 1);
  ctx.quadraticCurveTo(start[0], start[1], first[0], first[1]);
  ctx.closePath();
};

/** Fill the path built by `shape` in `color`. */
const fillShape = (
  ctx: CanvasRenderingContext2D,
  color: string | CanvasGradient,
  shape: () => void,
) => {
  ctx.fillStyle = color;
  ctx.beginPath();
  shape();
  ctx.fill();
};

/** A hand at `p`, pointing along `a`, held as `grip`: a mitten with a thumb, the size of the face. */
const handShape = (
  ctx: CanvasRenderingContext2D,
  p: FigurePt,
  a: number,
  grip: FigureGrip,
  skin: Hex,
  shade: Hex,
) => {
  const s = 0.05;
  ctx.save();
  ctx.translate(p[0], p[1]);
  ctx.rotate(a);
  ctx.scale(s, s);
  const body = () => {
    if (grip === 'fist' || grip === 'hold') {
      ctx.ellipse(0.45, 0, 0.55, 0.5, 0, 0, Math.PI * 2);
      return;
    }
    if (grip === 'point') {
      ctx.ellipse(0.35, 0.05, 0.5, 0.45, 0, 0, Math.PI * 2);
      ctx.moveTo(0.6, -0.2);
      ctx.quadraticCurveTo(1.6, -0.32, 1.7, -0.12);
      ctx.quadraticCurveTo(1.6, 0.02, 0.7, 0.08);
      ctx.closePath();
      return;
    }
    // Rest, open and palm: the flat of the hand and its fingers together, tapering.
    const long = grip === 'rest' ? 1.25 : 1.5;
    ctx.moveTo(-0.1, -0.4);
    ctx.quadraticCurveTo(long * 0.6, -0.55, long, -0.25);
    ctx.quadraticCurveTo(long + 0.18, 0, long, 0.22);
    ctx.quadraticCurveTo(long * 0.6, 0.48, -0.1, 0.4);
    ctx.closePath();
  };
  fillShape(ctx, skin, body);
  // The thumb, out from the palm's near side.
  if (grip !== 'fist') {
    const open = grip === 'open' || grip === 'palm' ? 1 : 0.4;
    fillShape(ctx, skin, () => {
      ctx.moveTo(0.1, 0.3);
      ctx.quadraticCurveTo(0.5, 0.55 + 0.35 * open, 0.95, 0.5 + 0.35 * open);
      ctx.quadraticCurveTo(1.0, 0.36 + 0.2 * open, 0.55, 0.15);
      ctx.closePath();
    });
  }
  // The fingers' parting, a little shade between them.
  if (grip === 'open' || grip === 'palm' || grip === 'rest') {
    ctx.fillStyle = shade;
    ctx.globalAlpha *= 0.45;
    for (const off of [-0.12, 0.08]) {
      ctx.beginPath();
      ctx.ellipse(1.05, off, 0.32, 0.025, 0, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  ctx.restore();
};

/** The head: skull and jaw, the face turned by `turn`, the nose at the front edge in profile. */
const headShape = (ctx: CanvasRenderingContext2D, turn: number) => {
  ctx.ellipse(0, 0, HEAD_RX * (0.92 + 0.08 * turn), HEAD_RY, 0, 0, Math.PI * 2);
  // The jaw, forward and down.
  const jx = HEAD_RX * 0.35 * (1 - turn);
  ctx.moveTo(jx + HEAD_RX * 0.62, HEAD_RY * 0.35);
  ctx.ellipse(jx, HEAD_RY * 0.42, HEAD_RX * 0.66, HEAD_RY * 0.55, 0, 0, Math.PI * 2);
  // The nose, standing off the profile, sinking into the face as it turns.
  const front = HEAD_RX * (0.95 - 0.95 * turn);
  if (turn < 0.9) {
    ctx.moveTo(front, -HEAD_RY * 0.05);
    ctx.lineTo(front + HEAD_RX * 0.32 * (1 - turn), HEAD_RY * 0.32);
    ctx.lineTo(front - HEAD_RX * 0.05, HEAD_RY * 0.4);
    ctx.closePath();
  }
};

/** The features over the skin: brows, eyes, the nose's shade, the mouth; drawn only when the head is large enough to read them. */
const features = (
  ctx: CanvasRenderingContext2D,
  turn: number,
  face: FigureFace,
  ink: Hex,
  skin: Hex,
  detail: number,
) => {
  const brow = face.brow ?? 0;
  const eyes = face.eyes ?? 1;
  const [lx, ly] = face.look ?? [0, 0];
  const front = HEAD_RX * (0.95 - 0.95 * turn);
  // Eye places: the far eye near the nose, the near one back across the face.
  const nearEye = HEAD_RX * (0.42 - 0.8 * turn) + front * 0.25;
  const farEye = front * 0.75 + HEAD_RX * 0.38 * turn;
  const ey = -HEAD_RY * 0.05;
  const eyeW = HEAD_RX * 0.2;
  const show = [nearEye, ...(turn > 0.22 ? [farEye] : [])];
  for (const [i, ex] of show.entries()) {
    const far = i === 1;
    const squash = far ? 0.55 + 0.45 * turn : 1;
    // The eye socket's shade.
    ctx.globalAlpha = 0.35;
    fillShape(ctx, mix(skin, ink, 0.45), () =>
      ctx.ellipse(ex, ey - HEAD_RY * 0.02, eyeW * 1.3 * squash, eyeW * 0.85, 0, 0, Math.PI * 2),
    );
    ctx.globalAlpha = 1;
    // The eye: an almond, closing to a lid line.
    const open = Math.max(0.12, eyes);
    fillShape(ctx, ink, () =>
      ctx.ellipse(
        ex + lx * eyeW * 0.3,
        ey + ly * eyeW * 0.2,
        eyeW * 0.62 * squash,
        eyeW * 0.42 * open,
        0,
        0,
        Math.PI * 2,
      ),
    );
    if (detail > 0.5 && eyes > 0.4) {
      ctx.globalAlpha = 0.85;
      fillShape(ctx, '#fff6e6', () =>
        ctx.arc(
          ex + lx * eyeW * 0.3 + eyeW * 0.18,
          ey + ly * eyeW * 0.2 - eyeW * 0.12,
          eyeW * 0.13,
          0,
          Math.PI * 2,
        ),
      );
      ctx.globalAlpha = 1;
    }
    // The brow: raised at the middle (toward the nose) when worried or glad.
    const by = ey - HEAD_RY * 0.27;
    const lift = HEAD_RY * 0.09 * brow;
    fillShape(ctx, mix(ink, skin, 0.15), () => {
      const xa = ex - eyeW * 0.85 * squash;
      const xb = ex + eyeW * 0.85 * squash;
      // The near eye's inner end is forward (toward the nose), the far eye's back.
      const y1 = far ? by - lift : by;
      const y2 = far ? by : by - lift;
      ctx.moveTo(xa, y1);
      ctx.quadraticCurveTo((xa + xb) / 2, Math.min(y1, y2) - HEAD_RY * 0.05, xb, y2);
      ctx.lineTo(xb, y2 + HEAD_RY * 0.055);
      ctx.quadraticCurveTo(
        (xa + xb) / 2,
        Math.min(y1, y2) + HEAD_RY * 0.01,
        xa,
        y1 + HEAD_RY * 0.05,
      );
      ctx.closePath();
    });
  }
  // The nose's underside, and the mouth.
  const mx = front * 0.55 + HEAD_RX * 0.05 * turn;
  ctx.globalAlpha = 0.4;
  fillShape(ctx, mix(skin, ink, 0.5), () =>
    ctx.ellipse(
      front * 0.8 + HEAD_RX * 0.02,
      HEAD_RY * 0.36,
      HEAD_RX * 0.14,
      HEAD_RY * 0.05,
      0,
      0,
      Math.PI * 2,
    ),
  );
  ctx.globalAlpha = 1;
  const smile = face.smile ?? 0;
  const open = face.open ?? 0;
  const my = HEAD_RY * 0.6;
  const mw = HEAD_RX * (0.22 + 0.16 * turn);
  fillShape(ctx, mix(ink, '#7a2a24', 0.35), () => {
    ctx.moveTo(mx - mw, my - smile * HEAD_RY * 0.06);
    ctx.quadraticCurveTo(mx, my + smile * HEAD_RY * 0.08, mx + mw, my - smile * HEAD_RY * 0.06);
    ctx.quadraticCurveTo(
      mx,
      my + HEAD_RY * (0.035 + 0.16 * open) + smile * HEAD_RY * 0.08,
      mx - mw,
      my - smile * HEAD_RY * 0.06,
    );
    ctx.closePath();
  });
};

/** What covers the head, drawn over the skull; `under` draws what falls behind the head first. */
const covering = (
  ctx: CanvasRenderingContext2D,
  kind: FigureHead,
  turn: number,
  color: Hex,
  hair: Hex,
  crest: Hex,
  under: boolean,
) => {
  const rx = HEAD_RX;
  const ry = HEAD_RY;
  const face = rx * (0.55 - 0.5 * turn);
  if (kind === 'cloth' || kind === 'veil' || kind === 'hood') {
    const long = kind === 'veil' ? 0.34 : kind === 'hood' ? 0.16 : 0.22;
    if (under) {
      // The fall behind the shoulders.
      fillShape(ctx, color, () => {
        ctx.moveTo(face - rx * 0.1, -ry * 0.9);
        ctx.quadraticCurveTo(-rx * 1.6, -ry * 1.3, -rx * 1.5, ry * 0.4);
        ctx.quadraticCurveTo(-rx * 1.9, long * 0.6, -rx * 2.1, long);
        ctx.lineTo(rx * 0.9, long * 0.75);
        ctx.quadraticCurveTo(rx * 0.6, ry * 1.2, face + rx * 0.2, ry * 0.4);
        ctx.closePath();
      });
      return;
    }
    // Over the crown and down beside the face, leaving the face open.
    fillShape(ctx, color, () => {
      ctx.moveTo(face + rx * 0.45, -ry * 0.25);
      ctx.quadraticCurveTo(face + rx * 0.3, -ry * 1.28, -rx * 0.3, -ry * 1.2);
      ctx.quadraticCurveTo(-rx * 1.35, -ry * 1.05, -rx * 1.25, ry * 0.2);
      ctx.quadraticCurveTo(-rx * 1.2, ry * 1.1, -rx * 0.5, ry * 1.25);
      ctx.lineTo(face - rx * 0.55, ry * 0.9);
      ctx.quadraticCurveTo(face - rx * 0.35, ry * 0.0, face + rx * 0.45, -ry * 0.25);
      ctx.closePath();
    });
    // The band across the brow.
    if (kind === 'cloth') {
      ctx.globalAlpha = 0.55;
      fillShape(ctx, mix(color, '#000000', 0.35), () => {
        ctx.moveTo(face + rx * 0.45, -ry * 0.45);
        ctx.quadraticCurveTo(-rx * 0.3, -ry * 0.75, -rx * 1.3, -ry * 0.45);
        ctx.lineTo(-rx * 1.3, -ry * 0.3);
        ctx.quadraticCurveTo(-rx * 0.3, -ry * 0.6, face + rx * 0.45, -ry * 0.32);
        ctx.closePath();
      });
      ctx.globalAlpha = 1;
    }
    return;
  }
  if (under) return;
  if (kind === 'turban') {
    fillShape(ctx, color, () => {
      ctx.ellipse(-rx * 0.1, -ry * 0.72, rx * 1.12, ry * 0.62, -0.08, 0, Math.PI * 2);
    });
    ctx.globalAlpha = 0.4;
    for (const k of [0, 1, 2])
      fillShape(ctx, mix(color, '#000000', 0.4), () => {
        const y = -ry * (0.48 + k * 0.28);
        ctx.ellipse(-rx * 0.1, y, rx * (1.05 - k * 0.18), ry * 0.04, -0.1 + k * 0.08, 0, Math.PI);
      });
    ctx.globalAlpha = 1;
    return;
  }
  if (kind === 'helmet') {
    fillShape(ctx, color, () => {
      ctx.ellipse(-rx * 0.08, -ry * 0.35, rx * 1.08, ry * 0.85, 0, Math.PI, Math.PI * 2);
      ctx.lineTo(-rx * 1.3, ry * 0.25);
      ctx.lineTo(-rx * 0.6, ry * 0.15);
      ctx.closePath();
    });
    // The crest, front to back over the crown.
    fillShape(ctx, crest, () => {
      ctx.moveTo(rx * 0.7, -ry * 0.9);
      ctx.quadraticCurveTo(0, -ry * 1.9, -rx * 1.3, -ry * 1.05);
      ctx.quadraticCurveTo(-rx * 0.4, -ry * 1.35, rx * 0.7, -ry * 0.9);
      ctx.closePath();
    });
    return;
  }
  // Bare: the hair over the crown and the back of the head.
  fillShape(ctx, hair, () => {
    ctx.moveTo(face + rx * 0.35, -ry * 0.45);
    ctx.quadraticCurveTo(face + rx * 0.1, -ry * 1.18, -rx * 0.4, -ry * 1.05);
    ctx.quadraticCurveTo(-rx * 1.2, -ry * 0.85, -rx * 1.0, ry * 0.25);
    ctx.quadraticCurveTo(-rx * 0.7, ry * 0.65, -rx * 0.35, ry * 0.45);
    ctx.quadraticCurveTo(-rx * 0.5, -ry * 0.3, face + rx * 0.35, -ry * 0.45);
    ctx.closePath();
  });
};

/** The two sheets a figure is built and lit on, grown as a larger figure needs them. */
let sheets: { a: ReturnType<typeof offscreen>; b: ReturnType<typeof offscreen> } | undefined;

const sheetsFor = (w: number, h: number) => {
  if (sheets === undefined || sheets.a.c.width < w || sheets.a.c.height < h) {
    const W = Math.max(w, sheets?.a.c.width ?? 0);
    const H = Math.max(h, sheets?.a.c.height ?? 0);
    sheets = { a: offscreen(W, H), b: offscreen(W, H) };
  }
  return sheets;
};

/** The brush mottle laid over every figure: short strokes, lighter and darker, once. */
let mottleTile: HTMLCanvasElement | undefined;
const mottle = () => {
  if (mottleTile !== undefined) return mottleTile;
  const { c, ctx } = offscreen(256, 256);
  const r = rng(4242);
  for (let i = 0; i < 900; i++) {
    const x = r() * 256;
    const y = r() * 256;
    const a = -0.9 + (r() - 0.5) * 1.2;
    const len = 6 + r() * 14;
    const w = 2 + r() * 4;
    ctx.globalAlpha = 0.25 + r() * 0.35;
    ctx.fillStyle = r() > 0.5 ? '#ffffff' : '#000000';
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(a);
    ctx.beginPath();
    ctx.ellipse(0, 0, len / 2, w / 2, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }
  mottleTile = c;
  return c;
};

/** The figure's extent in figure units: what its sheet must hold. */
const BOX = { x0: -0.62, y0: -1.38, x1: 0.62, y1: 0.06 } as const;

/** The most canvas px a figure's sheet is built at, along its height. */
const MAX_SHEET = 1800;

const dress = (
  ctx: CanvasRenderingContext2D,
  f: Figure,
  b: Bones,
  turn: number,
  robe: Hex,
  robeDeep: Hex,
  cloth: Hex,
  head: FigureHead,
  r: () => number,
) => {
  const shoulderW = 0.075 * (f.build ?? 1);
  const pose = f.pose ?? 'stand';
  // The robe: the torso, the thighs when seated or kneeling, and the skirt to the hem.
  fillShape(ctx, robe, () => {
    const hipW = 0.08 + 0.03 * turn;
    limb(ctx, [b.hip, lerpPt(b.hip, b.neck, 0.55), b.neck], [hipW * 2, shoulderW * 2.1, 0.07]);
    if (pose === 'sit' || pose === 'kneel') {
      for (const leg of [b.farLeg, b.nearLeg]) limb(ctx, [leg[0], leg[1]], [0.14, 0.11]);
      // The cloth from the knees down over the shins.
      const kn = b.nearLeg[1];
      const ft = b.nearLeg[2];
      ctx.moveTo(kn[0] - 0.06, kn[1] - 0.03);
      ctx.lineTo(kn[0] + 0.07, kn[1] - 0.02);
      ctx.lineTo(ft[0] + 0.07, ft[1] - 0.02);
      ctx.lineTo(ft[0] - 0.1, ft[1] - 0.02);
      ctx.closePath();
      if (pose === 'kneel') {
        const bk = b.farLeg[1];
        const bf = b.farLeg[2];
        limb(ctx, [bk, bf], [0.11, 0.07]);
      }
    } else {
      const hem = 0.025;
      const nf = b.nearLeg[2];
      const ff = b.farLeg[2];
      const front = Math.max(nf[0], ff[0]) + 0.09 + 0.03 * turn;
      const back = Math.min(nf[0], ff[0]) - 0.08 - 0.03 * turn;
      const sway = pose === 'walk' ? Math.sin(f.step ?? 0) * 0.02 : 0;
      ctx.moveTo(b.hip[0] - hipW, b.hip[1] - 0.02);
      ctx.quadraticCurveTo(back + 0.02, (b.hip[1] - hem) / 2, back - sway, -hem);
      ctx.quadraticCurveTo((back + front) / 2, 0.008, front - sway, -hem);
      ctx.quadraticCurveTo(front - 0.03, (b.hip[1] - hem) / 2, b.hip[0] + hipW, b.hip[1] - 0.02);
      ctx.closePath();
    }
  });
  // Folds: long soft shadows falling from the waist, and one highlight.
  if (pose !== 'sit' && pose !== 'kneel') {
    const n = 3 + Math.floor(r() * 2);
    for (let i = 0; i < n; i++) {
      const u = (i + 0.5) / n - 0.5;
      const x0 = b.hip[0] + u * 0.12;
      const x1 = x0 + u * 0.12 + (r() - 0.5) * 0.03;
      ctx.globalAlpha = 0.18 + r() * 0.14;
      fillShape(ctx, robeDeep, () => {
        ctx.moveTo(x0 - 0.004, b.hip[1] + 0.06);
        ctx.quadraticCurveTo(x1 - 0.02, b.hip[1] * 0.4, x1 - 0.016, -0.02);
        ctx.lineTo(x1 + 0.016, -0.02);
        ctx.quadraticCurveTo(x1 + 0.006, b.hip[1] * 0.4, x0 + 0.004, b.hip[1] + 0.06);
        ctx.closePath();
      });
    }
    ctx.globalAlpha = 1;
  }
  // The marks on the robe.
  for (const m of f.marks ?? []) {
    ctx.save();
    ctx.globalCompositeOperation = 'source-atop';
    fillShape(ctx, m.color, () => {
      const rr = rng(Math.round(m.at[0] * 1000 + m.at[1] * 7000));
      // An uneven brush blot, with a short run below it: never a flower.
      for (let k = 0; k < 11; k++) {
        const angle = (k / 11) * Math.PI * 2 + (rr() - 0.5) * 0.24;
        const radius = m.r * (0.46 + rr() * 0.58);
        const x = m.at[0] + Math.cos(angle) * radius;
        const y = m.at[1] + Math.sin(angle) * radius * 1.12;
        if (k === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.closePath();
      ctx.moveTo(m.at[0] - m.r * 0.12, m.at[1] + m.r * 0.6);
      ctx.lineTo(m.at[0] + m.r * 0.02, m.at[1] + m.r * 1.48);
      ctx.lineTo(m.at[0] + m.r * 0.18, m.at[1] + m.r * 0.55);
      ctx.closePath();
    });
    ctx.restore();
  }
  // The mantle: from the far shoulder across the chest to the near hip, and down.
  if (f.mantle !== undefined) {
    const m = f.mantle;
    ctx.save();
    ctx.globalCompositeOperation = 'source-atop';
    fillShape(ctx, m, () => {
      const s = b.farShoulder;
      const hp = b.hip;
      ctx.moveTo(s[0] + 0.03, s[1] - 0.02);
      ctx.quadraticCurveTo(hp[0] + 0.06, (s[1] + hp[1]) / 2, hp[0] - 0.02, hp[1] + 0.04);
      ctx.lineTo(hp[0] - 0.16, hp[1] + 0.3);
      ctx.lineTo(hp[0] - 0.2, 0.05);
      ctx.lineTo(hp[0] - 0.3, 0.05);
      ctx.lineTo(b.nearShoulder[0] - 0.08, b.nearShoulder[1]);
      ctx.quadraticCurveTo(s[0] - 0.05, s[1] - 0.06, s[0] + 0.03, s[1] - 0.02);
      ctx.closePath();
    });
    ctx.restore();
  }
  if (f.sash !== undefined) {
    ctx.save();
    ctx.globalCompositeOperation = 'source-atop';
    const hp = b.hip;
    fillShape(ctx, f.sash, () => {
      ctx.moveTo(hp[0] - 0.14, hp[1] - 0.03);
      ctx.quadraticCurveTo(hp[0], hp[1] - 0.008, hp[0] + 0.14, hp[1] - 0.05);
      ctx.lineTo(hp[0] + 0.14, hp[1] - 0.012);
      ctx.quadraticCurveTo(hp[0], hp[1] + 0.03, hp[0] - 0.14, hp[1] + 0.008);
      ctx.closePath();
      // Its end hanging at the front.
      ctx.moveTo(hp[0] + 0.03, hp[1]);
      ctx.lineTo(hp[0] + 0.06, hp[1] + 0.2);
      ctx.lineTo(hp[0] + 0.03, hp[1] + 0.21);
      ctx.lineTo(hp[0] + 0.005, hp[1] + 0.01);
      ctx.closePath();
    });
    ctx.restore();
  }
  // The breastplate of a soldier.
  if (head === 'helmet') {
    ctx.save();
    ctx.globalCompositeOperation = 'source-atop';
    fillShape(ctx, cloth, () =>
      limb(
        ctx,
        [lerpPt(b.hip, b.neck, 0.3), lerpPt(b.hip, b.neck, 0.92)],
        [0.17 + 0.03 * turn, 0.16],
      ),
    );
    ctx.restore();
  }
};

/** Build the figure flat, in its own colours, in figure units on `ctx`. */
const build = (ctx: CanvasRenderingContext2D, f: Figure, turn: number, detail: number) => {
  const b = bonesOf(f, turn);
  const robe = f.robe;
  const robeDeep = mix(robe, f.light.shade, 0.35);
  const skin = f.skin;
  const hair = f.hair ?? '#2a1d1c';
  const cloth = f.cloth ?? mix(robe, '#000000', 0.2);
  const ink = mix(hair, '#000000', 0.35);
  const head = f.head ?? 'bare';
  const r = rng(f.seed ?? 7);
  const shoulderW = 0.075 * (f.build ?? 1);
  // Behind all: what hangs from the head behind the shoulders.
  ctx.save();
  ctx.translate(b.head[0], b.head[1]);
  ctx.rotate(b.bend * 0.6 + (f.nod ?? 0));
  covering(ctx, head, turn, cloth, hair, f.crest ?? '#a3262a', true);
  ctx.restore();
  // The far arm, behind the body.
  const arm = (s: FigurePt, a: FigureArm | undefined, far: boolean) => {
    const rest: FigurePt = add(s, rot([far ? 0.05 : 0.02, 0.29], b.bend * 0.3));
    const to = a?.to ?? rest;
    const { elbow, hand } = elbowOf(s, to);
    const sleeve = far ? robeDeep : robe;
    fillShape(ctx, sleeve, () =>
      limb(ctx, [s, elbow, lerpPt(elbow, hand, 0.82)], [shoulderW * 1.05, 0.062, 0.078]),
    );
    const angle = a?.angle ?? Math.atan2(hand[1] - elbow[1], hand[0] - elbow[0]);
    handShape(
      ctx,
      hand,
      angle,
      a?.grip ?? 'rest',
      far ? mix(skin, f.light.shade, 0.25) : skin,
      ink,
    );
  };
  arm(b.farShoulder, f.far, true);
  // The legs under the robe: only the feet show.
  for (const leg of [b.farLeg, b.nearLeg]) {
    const foot = leg[2];
    fillShape(ctx, mix(skin, '#3a2a22', 0.45), () =>
      ctx.ellipse(foot[0] + 0.025, foot[1] - 0.012, 0.045, 0.016, 0, 0, Math.PI * 2),
    );
  }
  dress(ctx, f, b, turn, robe, robeDeep, cloth, head, r);
  // The neck and head.
  fillShape(ctx, mix(skin, f.light.shade, 0.2), () =>
    limb(ctx, [b.neck, add(b.head, [0, HEAD_RY * 0.4])], [0.045, 0.04]),
  );
  ctx.save();
  ctx.translate(b.head[0], b.head[1]);
  ctx.rotate(b.bend * 0.6 + (f.nod ?? 0));
  fillShape(ctx, skin, () => headShape(ctx, turn));
  if (head === 'bare' || head === 'helmet' || head === 'turban') {
    // The ear, back of the cheek.
    const ex = -HEAD_RX * 0.15 - HEAD_RX * 0.25 * (1 - turn);
    if (turn < 0.85)
      fillShape(ctx, mix(skin, ink, 0.18), () =>
        ctx.ellipse(ex, HEAD_RY * 0.05, HEAD_RX * 0.18, HEAD_RY * 0.24, 0.2, 0, Math.PI * 2),
      );
  }
  if (f.beard === true)
    fillShape(ctx, hair, () => {
      const jx = HEAD_RX * 0.35 * (1 - turn);
      ctx.moveTo(-HEAD_RX * 0.55, HEAD_RY * 0.1);
      ctx.quadraticCurveTo(-HEAD_RX * 0.45, HEAD_RY * 0.95, jx, HEAD_RY * 1.12);
      ctx.quadraticCurveTo(
        jx + HEAD_RX * 0.75,
        HEAD_RY * 0.95,
        jx + HEAD_RX * 0.72,
        HEAD_RY * 0.42,
      );
      ctx.quadraticCurveTo(jx + HEAD_RX * 0.3, HEAD_RY * 0.78, jx, HEAD_RY * 0.75);
      ctx.quadraticCurveTo(-HEAD_RX * 0.2, HEAD_RY * 0.6, -HEAD_RX * 0.55, HEAD_RY * 0.1);
      ctx.closePath();
    });
  if (detail > 0.15) features(ctx, turn, f.face ?? {}, ink, skin, detail);
  covering(
    ctx,
    head,
    turn,
    head === 'helmet' ? '#8a8172' : cloth,
    hair,
    f.crest ?? '#a3262a',
    false,
  );
  ctx.restore();
  // The near arm, over the body.
  arm(b.nearShoulder, f.near, false);
  // The light in the chest.
  if (f.glow !== undefined && f.glow.amount > 0) {
    const c = lerpPt(b.hip, b.neck, 0.68);
    const g = ctx.createRadialGradient(c[0], c[1], 0, c[0], c[1], 0.16);
    g.addColorStop(0, f.glow.color);
    g.addColorStop(1, clearOf(f.glow.color));
    ctx.save();
    ctx.globalCompositeOperation = 'source-atop';
    ctx.globalAlpha = Math.min(1, f.glow.amount);
    ctx.fillStyle = g;
    ctx.fillRect(c[0] - 0.2, c[1] - 0.2, 0.4, 0.4);
    ctx.restore();
  }
};

/**
 * Draw figure `f` on `ctx` under its current transform: built flat on a
 * sheet at the resolution it lands at on screen, lit (shade, key, rim,
 * mottle), then laid down with its contact shadow under it.
 */
export const figure = (ctx: CanvasRenderingContext2D, f: Figure) => {
  if ((f.alpha ?? 1) <= 0.002 || f.h <= 0) return;
  const turn = Math.min(1, Math.max(0, f.turn ?? 0.45));
  const m = ctx.getTransform();
  const onScreen = Math.hypot(m.a, m.b) * f.h;
  const res = Math.min(MAX_SHEET, Math.max(24, onScreen));
  const bw = BOX.x1 - BOX.x0;
  const bh = BOX.y1 - BOX.y0;
  const W = Math.ceil(bw * res);
  const H = Math.ceil(bh * res);
  const { a, b } = sheetsFor(W, H);
  // Built in figure units, flipped to face its way.
  a.ctx.setTransform(1, 0, 0, 1, 0, 0);
  a.ctx.globalCompositeOperation = 'source-over';
  a.ctx.globalAlpha = 1;
  a.ctx.clearRect(0, 0, W, H);
  a.ctx.setTransform(res * f.dir, 0, 0, res, (f.dir > 0 ? -BOX.x0 : BOX.x1) * res, -BOX.y0 * res);
  build(a.ctx, f, turn, Math.min(1, (onScreen - 60) / 300));
  a.ctx.setTransform(1, 0, 0, 1, 0, 0);
  // The light's direction on the sheet, and the cool shade away from it.
  const L = f.light;
  const lx = Math.cos(L.from);
  const ly = Math.sin(L.from);
  const cx = W / 2;
  const cy = H * 0.55;
  const span = Math.max(W, H) * 0.32;
  a.ctx.globalCompositeOperation = 'source-atop';
  const shade = a.ctx.createLinearGradient(
    cx + lx * span,
    cy + ly * span,
    cx - lx * span,
    cy - ly * span,
  );
  const depth = L.depth ?? 0.55;
  shade.addColorStop(0, clearOf(L.shade));
  shade.addColorStop(0.45, clearOf(L.shade));
  shade.addColorStop(0.62, L.shade);
  shade.addColorStop(1, L.shade);
  a.ctx.globalAlpha = depth;
  a.ctx.fillStyle = shade;
  a.ctx.fillRect(0, 0, W, H);
  const key = a.ctx.createLinearGradient(cx + lx * span, cy + ly * span, cx, cy);
  key.addColorStop(0, L.key);
  key.addColorStop(1, clearOf(L.key));
  a.ctx.globalAlpha = 0.32;
  a.ctx.fillStyle = key;
  a.ctx.fillRect(0, 0, W, H);
  // The brush's mottle.
  const tile = mottle();
  const seed = f.seed ?? 7;
  a.ctx.globalAlpha = 0.1;
  for (let ty = -((seed * 37) % 256); ty < H; ty += 256)
    for (let tx = -((seed * 91) % 256); tx < W; tx += 256) a.ctx.drawImage(tile, tx, ty);
  // The rim: the silhouette less itself moved away from the light, filled hot.
  const rim = (L.rimWidth ?? 0.012) * res;
  b.ctx.setTransform(1, 0, 0, 1, 0, 0);
  b.ctx.globalAlpha = 1;
  b.ctx.globalCompositeOperation = 'source-over';
  b.ctx.clearRect(0, 0, W, H);
  b.ctx.drawImage(a.c, 0, 0, W, H, 0, 0, W, H);
  b.ctx.globalCompositeOperation = 'destination-out';
  b.ctx.drawImage(a.c, 0, 0, W, H, -lx * rim, -ly * rim, W, H);
  b.ctx.globalCompositeOperation = 'source-in';
  b.ctx.fillStyle = L.rim;
  b.ctx.fillRect(0, 0, W, H);
  a.ctx.globalCompositeOperation = 'source-atop';
  a.ctx.globalAlpha = 0.9;
  a.ctx.drawImage(b.c, 0, 0, W, H, 0, 0, W, H);
  a.ctx.globalAlpha = 1;
  a.ctx.globalCompositeOperation = 'source-over';
  // Laid down: the contact shadow, then the figure.
  ctx.save();
  ctx.globalAlpha *= f.alpha ?? 1;
  const sh = f.shadow ?? 0.45;
  if (sh > 0) {
    const g = ctx.createRadialGradient(f.x, f.y, 0, f.x, f.y, f.h * 0.2);
    g.addColorStop(0, L.shade);
    g.addColorStop(1, clearOf(L.shade));
    ctx.save();
    ctx.globalAlpha *= sh;
    ctx.translate(f.x, f.y);
    ctx.scale(1, 0.22);
    ctx.translate(-f.x, -f.y);
    ctx.fillStyle = g;
    ctx.fillRect(f.x - f.h * 0.2, f.y - f.h * 0.2, f.h * 0.4, f.h * 0.4);
    ctx.restore();
  }
  const k = f.h / res;
  ctx.drawImage(a.c, 0, 0, W, H, f.x + BOX.x0 * f.h, f.y + BOX.y0 * f.h, W * k, H * k);
  const head = figurePoint(f, 'head');
  probeFace(ctx, head[0], head[1], HEAD_RY * 2 * f.h);
  ctx.restore();
};

/** Where the head, chest, or a local point lands in the world. An arm target is not its clamped hand endpoint. */
export const figurePoint = (
  f: Figure,
  p: 'head' | 'chest' | FigurePt,
): readonly [number, number] => {
  const turn = Math.min(1, Math.max(0, f.turn ?? 0.45));
  const b = bonesOf(f, turn);
  const local = p === 'head' ? b.head : p === 'chest' ? lerpPt(b.hip, b.neck, 0.68) : p;
  return [f.x + local[0] * f.h * f.dir, f.y + local[1] * f.h];
};

/** A crowd to scatter: where its feet stand, how many, how they vary. */
export interface CrowdSpec {
  readonly seed: number;
  readonly count: number;
  /** The ground they stand on: x, y (the far edge), width, depth, in world px. */
  readonly area: readonly [number, number, number, number];
  /** A figure's height at the far edge and the near one: nearer is taller. */
  readonly heights: readonly [number, number];
  /** The x the crowd turns toward. */
  readonly focus: number;
  readonly robes: ReadonlyArray<Hex>;
  readonly cloths: ReadonlyArray<Hex>;
  readonly skins: ReadonlyArray<Hex>;
  readonly light: FigureLight;
  /** The share that sit, 0..1. Defaults to 0. */
  readonly seated?: number;
  /** How close two may stand, in their heights. Defaults to 0.22. */
  readonly gap?: number;
}

/**
 * A crowd scattered over its ground with no rows: each figure thrown at
 * random and kept only clear of those already standing (by its own size,
 * nearer ones needing more room), each with its own height, cloth, head
 * covering, turn and hands, turned toward the focus. Far first, so they
 * draw back to front.
 */
export const crowd = (s: CrowdSpec): ReadonlyArray<Figure> => {
  const r = rng(s.seed);
  const [ax, ay, aw, ad] = s.area;
  const placed: Array<{ x: number; y: number; h: number }> = [];
  const gap = s.gap ?? 0.22;
  for (let tries = 0; placed.length < s.count && tries < s.count * 40; tries++) {
    const x = ax + r() * aw;
    const v = r();
    const y = ay + v * ad;
    const h = (s.heights[0] + (s.heights[1] - s.heights[0]) * v) * (0.88 + r() * 0.2);
    const clear = placed.every((p) => {
      const need = gap * (p.h + h) * 0.5;
      return Math.hypot((p.x - x) / need, ((p.y - y) * 2.6) / need) > 1;
    });
    if (clear) placed.push({ x, y, h });
  }
  placed.sort((p, q) => p.y - q.y);
  const pick = <A>(xs: ReadonlyArray<A>, fallback: A) =>
    xs[Math.floor(r() * xs.length)] ?? fallback;
  const heads: ReadonlyArray<FigureHead> = [
    'cloth',
    'cloth',
    'bare',
    'veil',
    'cloth',
    'bare',
    'hood',
  ];
  return placed.map((p, i): Figure => {
    const dir: 1 | -1 = s.focus >= p.x ? 1 : -1;
    const head = pick(heads, 'cloth');
    const sit = r() < (s.seated ?? 0);
    const gesture = r();
    const near: FigureArm | undefined =
      gesture < 0.15
        ? { to: [0.12, -0.62], grip: 'rest' }
        : gesture < 0.25
          ? { to: [0.2, -0.85], grip: 'palm', angle: -1.4 }
          : undefined;
    const far: FigureArm | undefined =
      gesture > 0.8 ? { to: [0.1, -0.68], grip: 'rest' } : undefined;
    return {
      x: p.x,
      y: p.y,
      h: p.h,
      dir,
      turn: 0.15 + r() * 0.6,
      pose: sit ? 'sit' : 'stand',
      lean: (r() - 0.4) * 0.12,
      nod: (r() - 0.6) * 0.3,
      build: 0.9 + r() * 0.25,
      robe: pick(s.robes, '#7a6a5a'),
      cloth: pick(s.cloths, '#6a5a4a'),
      skin: pick(s.skins, '#b8785a'),
      head,
      beard: head !== 'veil' && r() > 0.5,
      near,
      far,
      light: s.light,
      seed: s.seed * 31 + i,
      shadow: 0.35,
    };
  });
};
