// A camera over a scene's world: (x, y) is the world point at frame centre.

import { lerp } from '../core/time.ts';
import { raised } from './cutout.ts';

export interface Camera {
  x: number;
  y: number;
  zoom?: number;
  rot?: number;
}

/**
 * Who hears of the cameras a context applies (the lab's knob reads: a knob
 * read before a camera is drawn where the camera puts it), and how many
 * cameras deep it draws now. Only a frame recording its knob reads listens;
 * the pixels are the same either way.
 */
const listeners = new WeakMap<CanvasRenderingContext2D, (inside: DOMMatrix) => void>();
const depths = new WeakMap<CanvasRenderingContext2D, number>();

/**
 * Draw `draw` in no camera yet, telling `heard` (when given) the transform
 * inside each outermost camera it applies (a multiplane shot's focal plane,
 * once), as `getTransform` gives it. Each scene's draw goes through here, and
 * each starts afresh: a draw that threw leaves nothing for the next.
 */
export const hearingCameras = (
  ctx: CanvasRenderingContext2D,
  heard: ((inside: DOMMatrix) => void) | undefined,
  draw: () => void,
) => {
  depths.delete(ctx);
  if (heard === undefined) listeners.delete(ctx);
  else listeners.set(ctx, heard);
  draw();
  listeners.delete(ctx);
};

/** Whether `ctx` draws inside a camera now. */
export const insideCamera = (ctx: CanvasRenderingContext2D): boolean => (depths.get(ctx) ?? 0) > 0;

/** Set `ctx` to look through `cam`, onto the transform it has now. */
const aim = (ctx: CanvasRenderingContext2D, cam: Camera, w: number, h: number) => {
  ctx.translate(w / 2, h / 2);
  if (cam.rot !== undefined && cam.rot !== 0) ctx.rotate(cam.rot);
  const z = cam.zoom ?? 1;
  ctx.scale(z, z);
  ctx.translate(-cam.x, -cam.y);
};

/** Tell the listener, if the draw is in no camera yet, what `ctx` looks through now. */
const tell = (ctx: CanvasRenderingContext2D) => {
  if (insideCamera(ctx)) return;
  listeners.get(ctx)?.(ctx.getTransform());
};

/** Draw `draw` a camera deeper (a draw that throws is reset by the next `hearingCameras`). */
const deeper = (ctx: CanvasRenderingContext2D, draw: () => void) => {
  const depth = depths.get(ctx) ?? 0;
  depths.set(ctx, depth + 1);
  draw();
  depths.set(ctx, depth);
};

/** Draw `draw` through `cam`, telling a listener of it when `heard`. */
const shoot = (
  ctx: CanvasRenderingContext2D,
  cam: Camera,
  w: number,
  h: number,
  draw: () => void,
  heard: boolean,
) => {
  ctx.save();
  aim(ctx, cam, w, h);
  if (heard) tell(ctx);
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

/** One leg of a shot: how far along it is (a cue's `f.at`), and where it goes. */
export type ShotStop = readonly [progress: number, to: Camera];

/**
 * A shot as data: from `base`, each stop in turn blends the camera so far
 * toward its `to` by its progress, so a later stop takes over from wherever
 * the earlier ones left it. `shotPath(REST, [[f.at('push'), FACE], [f.at('back'), REST]])`
 * pushes in, then comes back. Written into `out`, a fresh camera by default.
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
  for (const [progress, to] of stops) lerpCamera(out, out, to, progress);
  return out;
};

export const camera = (
  ctx: CanvasRenderingContext2D,
  cam: Camera,
  w: number,
  h: number,
  draw: () => void,
) => shoot(ctx, cam, w, h, draw, true);

/** One plane of a multiplane shot. */
export interface Plane {
  /**
   * Distance from the camera, in units of the focal plane's: 1 moves exactly
   * as `camera` does, 2 is twice as far (half the pan, a fainter zoom),
   * under 1 is nearer and sweeps past faster.
   */
  z: number;
  /**
   * How far this plane stands above the one behind it, as a multiple of a
   * cutout's usual lift: its cutouts cast shadows that long. Defaults to 1.
   */
  lift?: number;
  draw: () => void;
}

export interface Depth {
  /**
   * The world point every plane lines up on while the camera sits on it;
   * planes drift apart as the camera leaves it. Defaults to the frame centre.
   */
  rest?: readonly [number, number];
  /** Paper colour far planes fade into. */
  haze?: string;
  /** How fast they fade: one unit of z past the focal plane shows `1 - e^-haze`. Defaults to 0. */
  thickness?: number;
  /** Blur in px per unit of z away from the focal plane. Defaults to 0. */
  blur?: number;
}

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
  cam: Camera,
  w: number,
  h: number,
  planes: ReadonlyArray<Plane>,
  depth: Depth = {},
) => {
  const [rx, ry] = depth.rest ?? [w / 2, h / 2];
  const thickness = depth.thickness ?? 0;
  const zoom = cam.zoom ?? 1;
  const ordered = [...planes].sort((a, b) => b.z - a.z);
  // The shot, as a listener hears it: the focal plane's camera, once.
  ctx.save();
  aim(ctx, cam, w, h);
  tell(ctx);
  ctx.restore();
  ordered.forEach((plane, i) => {
    const z = Math.max(plane.z, 1e-3);
    const view: Camera = {
      x: rx + (cam.x - rx) / z,
      y: ry + (cam.y - ry) / z,
      zoom: zoom ** (1 / z),
      rot: cam.rot ?? 0,
    };
    const soft = (depth.blur ?? 0) * Math.abs(z - 1);
    ctx.save();
    if (soft > 0.05) ctx.filter = `blur(${soft.toFixed(2)}px)`;
    raised(ctx, plane.lift ?? 1, () => shoot(ctx, view, w, h, plane.draw, false));
    ctx.restore();
    // Haze over everything so far, as thick as the air between this plane
    // and the next nearer one, or the focal plane after the nearest.
    const nearer = ordered[i + 1]?.z ?? 1;
    const veil = 1 - clearance(z, thickness) / clearance(nearer, thickness);
    if (depth.haze !== undefined && veil > 1e-3) {
      ctx.save();
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.globalAlpha *= veil;
      ctx.fillStyle = depth.haze;
      ctx.fillRect(0, 0, ctx.canvas.width, ctx.canvas.height);
      ctx.restore();
    }
  });
};
