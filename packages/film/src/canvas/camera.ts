// A camera over a scene's world: (x, y) is the world point at frame centre.

import { Predicate } from 'effect';
import { lerp } from '../core/time.ts';
import type { Clear, Hex } from './colour.ts';
import { raised } from './cutout.ts';
import { sky } from './glow.ts';
import { PLANE_FIBRE, planeFibre } from './fibre.ts';

export interface Camera {
  x: number;
  y: number;
  zoom?: number;
  rot?: number;
}

/**
 * The unmoved frame: the canvas itself (a film's default 1920 × 1080, at its
 * centre, zoom 1). A scene's rest, a `shotPath`'s base and what a push comes
 * back to; a constant, not a knob, since there is nothing to move. Frozen:
 * blend into a camera of your own, never into this one.
 */
export const UNMOVED: Readonly<Camera> = Object.freeze({ x: 960, y: 540, zoom: 1 });

/**
 * Who hears of the cameras a context applies (the lab's knob reads: a knob
 * read before a camera is drawn where the camera puts it), and how many
 * cameras deep it draws now. Only a frame recording its knob reads listens;
 * the pixels are the same either way.
 */
const listeners = new WeakMap<
  CanvasRenderingContext2D,
  (inside: DOMMatrix, aimed: DOMMatrix) => void
>();
const depths = new WeakMap<CanvasRenderingContext2D, number>();

/**
 * Where a scene's frame stands in its breath, and who breathes it. A frame
 * breathes once: through its outermost shot (`camera`, `multiplane`) when it
 * frames one, or, for a scene that draws with no shot of its own, around its
 * whole draw (`outer`), as the outermost transform.
 */
export interface SceneBreath {
  /** How far through its scene the frame is, 0..1. */
  readonly through: number;
  /** The scene's breath: `DRIFT`, or its own (`SceneSpec.drift`). */
  readonly drift: Drift | 0;
  /** Breathe the whole draw, as a scene with no shot of its own; its shots then drift no further. */
  readonly outer: boolean;
  /** The frame the whole draw breathes about the centre of, in px. */
  readonly width: number;
  readonly height: number;
}

/** The breath of the scene drawing on a context now, and whether an outermost shot took it. */
interface Breathing {
  through: number;
  drift: Drift | 0;
  outer: boolean;
  shot: boolean;
}

/** Each context's breathing, made once and rewritten by every scene draw on it. */
const breaths = new WeakMap<CanvasRenderingContext2D, Breathing>();
/** Whether a scene draws on the context now: a camera drawn outside any scene does not breathe. */
const drawing = new WeakSet<CanvasRenderingContext2D>();

/**
 * How far a scene has breathed `through` it (0..1) under its `drift`: 0 at
 * its start and its end, 1 at its middle (`sin(π · through)`), and 0
 * everywhere for a scene held still.
 */
const breathAt = (drift: Drift | 0, through: number): number =>
  drift === 0 ? 0 : Math.sin(Math.PI * Math.min(1, Math.max(0, through)));

/** A breath under this draws as none: a scene's first and last frame sit as framed. */
const STILL_BREATH = 1e-9;

/** Whether a frame at `breath` moves at all: whoever breathes it, it is drawn otherwise than as framed. */
export const breathes = (breath: SceneBreath): boolean =>
  breathAt(breath.drift, breath.through) > STILL_BREATH;

/**
 * Draw one scene's frame `draw` in no camera yet, at `breath`, telling `heard`
 * (when given) the transform inside each outermost camera it applies (a
 * multiplane shot's focal plane, once), as `getTransform` gives it. Returns
 * whether an outermost shot applied: then that shot took the breath, and a
 * frame drawn `outer` must be drawn again without it. Each scene's draw goes
 * through here, and each starts afresh: a draw that threw leaves nothing for
 * the next.
 */
export const hearingCameras = (
  ctx: CanvasRenderingContext2D,
  heard: ((inside: DOMMatrix, aimed: DOMMatrix) => void) | undefined,
  breath: SceneBreath,
  draw: () => void,
): boolean => {
  depths.delete(ctx);
  if (heard === undefined) listeners.delete(ctx);
  else listeners.set(ctx, heard);
  let now = breaths.get(ctx);
  if (now === undefined) {
    now = { through: 0, drift: 0, outer: false, shot: false };
    breaths.set(ctx, now);
  }
  now.through = breath.through;
  now.drift = breath.drift;
  now.outer = breath.outer;
  now.shot = false;
  drawing.add(ctx);
  const b = breathAt(breath.drift, breath.through);
  if (breath.outer && breath.drift !== 0 && b > STILL_BREATH) {
    // The camera a scene with no shot would breathe through, as one transform over its draw.
    const { width: w, height: h } = breath;
    const s = 1 + breath.drift.zoom * b;
    ctx.save();
    ctx.translate(w / 2 - breath.drift.x * b, h / 2);
    ctx.scale(s, s);
    ctx.translate(-w / 2, -h / 2);
    draw();
    ctx.restore();
  } else draw();
  drawing.delete(ctx);
  listeners.delete(ctx);
  return now.shot;
};

/** Whether `ctx` draws inside a camera now. */
export const insideCamera = (ctx: CanvasRenderingContext2D): boolean => (depths.get(ctx) ?? 0) > 0;

/**
 * A film's breath (DIRECTION, "Always breathing, never busy"): each scene's
 * outermost shot pushes in by `zoom` (a share of its zoom: 0.03 is 3 %) and
 * slides right by `x` frame px at the middle of the scene, from the shot as
 * framed at its start and back to it at its end (`sin(π · through)`), so a
 * held shot is never still and every cut and callback lands where it was
 * drawn. `DRIFT` is the one size every film breathes by; a scene may set its
 * own (`SceneSpec.drift`), `0` to hold still.
 */
export interface Drift {
  readonly zoom: number;
  readonly x: number;
}

/** Every scene's drift unless it sets its own: 3 % in scale (CRAFT's 1–3 %) and 24 frame px. */
export const DRIFT: Drift = { zoom: 0.03, x: 24 };

/**
 * How much of the film's breath a shot keeps as `hold` goes 0..1 (a cue's
 * `f.at`): all of it at 0, none at 1. A shot that comes to designed stillness
 * blends to it, so the camera settles on the shot as framed instead of
 * jumping there.
 */
export const driftHeld = (hold: number): number => 1 - Math.min(1, Math.max(0, hold));

/**
 * The camera an outermost shot looks through now: `cam` drifted by `share`
 * (0..1) of its scene's breath, written into `out`. The outermost shot takes
 * the frame's breath, held still or not; one nested in it, or one in a frame
 * breathed whole, drifts no further.
 */
const drifted = (
  ctx: CanvasRenderingContext2D,
  out: Camera,
  cam: Camera,
  share: number,
): Camera => {
  out.x = cam.x;
  out.y = cam.y;
  out.zoom = cam.zoom ?? 1;
  out.rot = cam.rot ?? 0;
  const scene = breaths.get(ctx);
  if (scene === undefined || !drawing.has(ctx) || insideCamera(ctx)) return out;
  scene.shot = true;
  if (scene.outer || share <= 0) return out;
  const breath = breathAt(scene.drift, scene.through);
  if (breath === 0 || scene.drift === 0) return out;
  out.zoom *= 1 + scene.drift.zoom * share * breath;
  out.x += (scene.drift.x * share * breath) / out.zoom;
  return out;
};

/** The drifted camera of the shot drawing now: only the outermost shot drifts, so one at a time. */
const breathing: Camera = { x: 0, y: 0 };

/** Set `ctx` to look through `cam`, onto the transform it has now. */
const aim = (ctx: CanvasRenderingContext2D, cam: Camera, w: number, h: number) => {
  ctx.translate(w / 2, h / 2);
  if (cam.rot !== undefined && cam.rot !== 0) ctx.rotate(cam.rot);
  const z = cam.zoom ?? 1;
  ctx.scale(z, z);
  ctx.translate(-cam.x, -cam.y);
};

/**
 * Tell the listener, if the draw is in no camera yet, what `ctx` is about to
 * look through: `cam`, the shot as it breathes now, and `framed`, the shot as
 * framed before its drift (where a knob camera keeps its target centred).
 */
const tell = (ctx: CanvasRenderingContext2D, cam: Camera, framed: Camera, w: number, h: number) => {
  if (insideCamera(ctx)) return;
  const heard = listeners.get(ctx);
  if (heard === undefined) return;
  ctx.save();
  aim(ctx, cam, w, h);
  const inside = ctx.getTransform();
  ctx.restore();
  ctx.save();
  aim(ctx, framed, w, h);
  const aimed = ctx.getTransform();
  ctx.restore();
  heard(inside, aimed);
};

/** Draw `draw` a camera deeper (a draw that throws is reset by the next `hearingCameras`). */
const deeper = (ctx: CanvasRenderingContext2D, draw: () => void) => {
  const depth = depths.get(ctx) ?? 0;
  depths.set(ctx, depth + 1);
  draw();
  depths.set(ctx, depth);
};

/**
 * Draw `draw` as a picture inside the scene's frame (a callback shown in an
 * icon, a picture in picture): whatever it frames (`camera`, `multiplane`) is
 * the inset's own shot, never the scene's outermost, so it takes none of the
 * scene's breath and the scene breathes as it would without it. The caller
 * places, scales and clips the inset first.
 */
export const inset = (ctx: CanvasRenderingContext2D, draw: () => void) => deeper(ctx, draw);

/** Draw `draw` through `cam`, telling a listener of it (as framed before its drift, `framed`) when given. */
const shoot = (
  ctx: CanvasRenderingContext2D,
  cam: Camera,
  w: number,
  h: number,
  draw: () => void,
  framed: Camera | undefined,
) => {
  if (framed !== undefined) tell(ctx, cam, framed, w, h);
  ctx.save();
  aim(ctx, cam, w, h);
  deeper(ctx, draw);
  ctx.restore();
};

/**
 * A resting camera from its knobs: where it looks (a point knob `<name>`), how
 * close (a number knob `<name>Zoom`) and, for a framing that leans, its turn
 * (`<name>Rot`): `knobCamera(f.knob('face'), f.knob('faceZoom'))`. The lab
 * reads that pair as a camera's target and gives it a reticle, so a framing
 * moves like any other knob.
 */
export const knobCamera = (
  [x, y]: readonly [number, number],
  zoom: number,
  rot?: number,
): Camera => (rot === undefined ? { x, y, zoom } : { x, y, zoom, rot });

/**
 * A held framing that keeps pushing in while it is on screen: `cam`, its zoom
 * grown by `by` (a number knob, `1.12` for an eighth closer) as `k` goes 0..1
 * (the hold's cue):
 * `pushOn(knobCamera(f.knob('face'), f.knob('faceZoom')), f.knob('pushOn'), f.at('hold'))`.
 * A fresh camera; `cam` is not written.
 */
export const pushOn = (cam: Camera, by: number, k: number): Camera => ({
  ...cam,
  zoom: (cam.zoom ?? 1) * lerp(1, by, k),
});

/**
 * `out` part way from camera `a` to `b` at `t` (0 is `a`, 1 is `b`), every
 * field blended, a missing zoom read as 1 and a missing turn as 0. `out` may
 * be `a`: each field is read before it is written.
 */
export const lerpCamera = (out: Camera, a: Camera, b: Camera, t: number): Camera => {
  out.x = lerp(a.x, b.x, t);
  out.y = lerp(a.y, b.y, t);
  out.zoom = lerp(a.zoom ?? 1, b.zoom ?? 1, t);
  out.rot = lerp(a.rot ?? 0, b.rot ?? 0, t);
  return out;
};

/** Below this change of zoom (as a log ratio) a push is a pan: `pushInto` blends it straight. */
const PAN_ONLY = 1e-3;

/**
 * `out` part way from camera `a` to `b` at `t`, as a push (or a pull) moves
 * through the world: the zoom grows by a constant ratio (`za·(zb/za)^t`) and
 * the one world point that sits at the same place on screen in both framings
 * holds still there, so what the shot pushes into slides straight to where
 * `b` frames it and never swings out of the frame on the way, however deep
 * the push. A straight blend of centre and zoom (`lerpCamera`) runs the zoom
 * fastest at the start and throws a deep push's target far off frame before
 * it comes back. The turn blends straight. Where the zoom barely changes, it
 * is `lerpCamera`. `out` may be `a`: each field is read before it is written.
 */
export const pushInto = (out: Camera, a: Camera, b: Camera, t: number): Camera => {
  const za = a.zoom ?? 1;
  const zb = b.zoom ?? 1;
  const ratio = Math.log(zb / za);
  if (!(Math.abs(ratio) > PAN_ONLY)) return lerpCamera(out, a, b, t);
  const z = za * Math.exp(ratio * t);
  // The fixed point, and how far from it the centre stands, shrinking as the zoom grows.
  const px = (zb * b.x - za * a.x) / (zb - za);
  const py = (zb * b.y - za * a.y) / (zb - za);
  const k = za / z;
  const ax = a.x;
  const ay = a.y;
  out.rot = lerp(a.rot ?? 0, b.rot ?? 0, t);
  out.x = px - (px - ax) * k;
  out.y = py - (py - ay) * k;
  out.zoom = z;
  return out;
};

/** How a shot's leg blends the camera toward its stop: `lerpCamera` (straight) or `pushInto`. */
type CameraBlend = (out: Camera, a: Camera, b: Camera, t: number) => Camera;

/**
 * One leg of a shot: how far along it is (a cue's `f.at`), where it goes, and
 * how it gets there (`lerpCamera` unless it names `pushInto`, for a deep push
 * that must keep its target in frame).
 */
type ShotStop =
  | readonly [progress: number, to: Camera]
  | readonly [progress: number, to: Camera, blend: CameraBlend];

/**
 * A shot as data: from `base`, each stop in turn blends the camera so far
 * toward its `to` by its progress, so a later stop takes over from wherever
 * the earlier ones left it. `shotPath(REST, [[f.at('push'), FACE], [f.at('back'), REST]])`
 * pushes in, then comes back; `[f.at('through'), ICON, pushInto]` pushes
 * deep into ICON with it in frame all the way. Written into `out`, a fresh
 * camera by default.
 */
export const shotPath = (
  base: Camera,
  stops: ReadonlyArray<ShotStop>,
  out: Camera = { x: 0, y: 0 },
): Camera => {
  out.x = base.x;
  out.y = base.y;
  out.zoom = base.zoom ?? 1;
  out.rot = base.rot ?? 0;
  for (const [progress, to, blend = lerpCamera] of stops) blend(out, out, to, progress);
  return out;
};

/**
 * Draw `draw` through `cam`. The outermost camera of a scene drifts over it
 * by the film's breath, taking `drift` of it (0..1: all of it by default,
 * `0` holds the shot as framed, the stillness a scene designs).
 */
export const camera = (
  ctx: CanvasRenderingContext2D,
  cam: Camera,
  w: number,
  h: number,
  draw: () => void,
  drift = 1,
) => shoot(ctx, drifted(ctx, breathing, cam, drift), w, h, draw, cam);

/** One plane of a multiplane shot. */
interface Plane {
  /**
   * Distance from the camera, in units of the focal plane's: 1 moves exactly
   * as `camera` does, 2 is twice as far (half the pan, a fainter zoom),
   * under 1 is nearer and sweeps past faster.
   */
  z: number;
  /**
   * How far this plane stands above the one behind it, as a multiple of a
   * cutout's usual lift: its cutouts cast shadows that long. Defaults to
   * its nearness, `planeLift(z)`: a near plane casts long soft shadows, a far
   * one short crisp ones.
   */
  lift?: number;
  draw: () => void;
}

/** The lowest and highest a plane stands by default, so no shadow shrinks to a hairline or floods the frame. */
export const PLANE_LIFT_MIN = 0.4;
export const PLANE_LIFT_MAX = 2.5;

/** How high a plane at `z` stands over the sheet behind it: its nearness, 1 / z, within bounds. */
const planeLift = (z: number) =>
  Math.min(PLANE_LIFT_MAX, Math.max(PLANE_LIFT_MIN, 1 / Math.max(z, 1e-3)));

interface Depth {
  /**
   * The world point every plane lines up on while the camera sits on it;
   * planes drift apart as the camera leaves it. Defaults to the frame centre.
   */
  rest?: readonly [number, number];
  /**
   * What far planes fade into: a colour over the whole frame, or a sky of
   * stops top to bottom (`sky`'s [position 0..1, colour]), so the air can
   * glow at the horizon and thin overhead.
   */
  haze?: string | ReadonlyArray<readonly [number, Hex | Clear]>;
  /** How fast they fade: one unit of z past the focal plane shows `1 - e^-haze`. Defaults to 0. */
  thickness?: number;
  /** Blur in px per unit of z away from the focal plane. Defaults to 0. */
  blur?: number;
  /**
   * How strongly the paper's fibre is laid over the backdrop (the farthest
   * plane and all behind it), in that plane's own space, 0..1. Defaults to
   * `PLANE_FIBRE`; nearer planes' cutouts carry the fibre in their faces.
   */
  fibre?: number;
  /** How much of the film's breath the shot takes over its scene, 0..1: all of it by default, `0` held as framed. */
  drift?: number;
}

/** The drifted camera of the multiplane shot drawing now, rewritten by each (a plane may hold a shot of its own). */
const planing: Camera = { x: 0, y: 0 };

/**
 * The camera a plane at depth `z` is drawn through when the shot looks
 * through `cam`, written into `out`: its pan from `rest` divided by `z` and
 * its zoom the `z`-th root of the shot's, so the focal plane (`z` 1) moves
 * with the shot, a far plane barely moves and a near one sweeps past. The
 * turn is the shot's. Pure; `out` may be `cam`.
 */
export const planeView = (
  out: Camera,
  cam: Camera,
  z: number,
  rest: readonly [number, number],
): Camera => {
  const d = Math.max(z, 1e-3);
  const [rx, ry] = rest;
  out.x = rx + (cam.x - rx) / d;
  out.y = ry + (cam.y - ry) / d;
  out.zoom = (cam.zoom ?? 1) ** (1 / d);
  out.rot = cam.rot ?? 0;
  return out;
};

/** How much of a plane at `z` shows through the haze in front of it. */
const clearance = (z: number, thickness: number) => Math.exp(-thickness * Math.max(0, z - 1));

/**
 * A multiplane shot: each plane drawn under the camera from its own distance,
 * farthest first, so a pan or push shows depth. Far planes fade into the
 * paper and soften; nearer planes cast longer shadows on what lies beneath.
 * Everything draws into `ctx` itself, so the probe and the lab see every
 * plane where it lands.
 */
export const multiplane = (
  ctx: CanvasRenderingContext2D,
  framed: Camera,
  w: number,
  h: number,
  planes: ReadonlyArray<Plane>,
  depth: Depth = {},
) => {
  // The shot as it breathes now, in the module's scratch camera, read out
  // before any plane draws: a plane may hold a shot of its own, which rewrites it.
  const cam: Camera = { ...drifted(ctx, planing, framed, depth.drift ?? 1) };
  const rest = depth.rest ?? [w / 2, h / 2];
  const haze = depth.haze;
  const thickness = depth.thickness ?? 0;
  const ordered = [...planes].sort((a, b) => b.z - a.z);
  // The shot, as a listener hears it: the focal plane's camera, once.
  tell(ctx, cam, framed, w, h);
  ordered.forEach((plane, i) => {
    const z = Math.max(plane.z, 1e-3);
    const view = planeView({ x: 0, y: 0 }, cam, z, rest);
    const soft = (depth.blur ?? 0) * Math.abs(z - 1);
    ctx.save();
    if (soft > 0.05) ctx.filter = `blur(${soft.toFixed(2)}px)`;
    raised(ctx, plane.lift ?? planeLift(z), () => shoot(ctx, view, w, h, plane.draw, undefined));
    ctx.restore();
    // The backdrop's paper grain, fixed to it: it slides with the backdrop's pan.
    if (i === 0) planeFibre(ctx, view, w, h, depth.fibre ?? PLANE_FIBRE);
    // Haze over everything so far, as thick as the air between this plane
    // and the next nearer one, or the focal plane after the nearest.
    const nearer = ordered[i + 1]?.z ?? 1;
    const veil = 1 - clearance(z, thickness) / clearance(nearer, thickness);
    if (haze !== undefined && veil > 1e-3) {
      ctx.save();
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.globalAlpha *= veil;
      if (Predicate.isString(haze)) {
        ctx.fillStyle = haze;
        ctx.fillRect(0, 0, ctx.canvas.width, ctx.canvas.height);
      } else sky(ctx, ctx.canvas.width, ctx.canvas.height, haze);
      ctx.restore();
    }
  });
};
