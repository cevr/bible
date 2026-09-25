// The text probe: `film check` asks a render to report every line of text it
// draws, as a box in canvas pixels, so collisions are measured instead of
// spotted. A probe is attached to one context for one draw; with none
// attached, drawing text costs a single WeakMap lookup and records nothing.
// It only reads the context (its transform, `measureText`), so a probed frame
// is pixel for pixel the frame it would have been.

import type { Point, TextBox } from '../core/schema.ts';

/** Where text drawn into a context lands on screen, and whose it is. */
export interface Probe {
  readonly boxes: TextBox[];
  /** The scene drawing. */
  readonly scene: string;
  /** Screen offset of the layer the context draws into (a pan transition). */
  readonly dx: number;
  /** Opacity the layer is composited at (a fade or wipe transition). */
  readonly alpha: number;
}

const probes = new WeakMap<CanvasRenderingContext2D, Probe>();

/** Run `draw` with `probe` recording the text drawn into `ctx`; without a probe, just draw. */
export const probing = (
  ctx: CanvasRenderingContext2D,
  probe: Probe | undefined,
  draw: () => void,
) => {
  if (probe === undefined) return draw();
  probes.set(ctx, probe);
  draw();
  probes.delete(ctx);
};

/** The probe attached to `ctx`, if a check is recording it. */
export const probeOf = (ctx: CanvasRenderingContext2D): Probe | undefined => probes.get(ctx);

/**
 * Record a line of text drawn in the current transform's space: the box
 * `[left, left + width] × [top, top + height]`, mapped through the transform
 * (its bounding box, for a rotated context), at opacity `alpha`.
 */
export const recordText = (
  ctx: CanvasRenderingContext2D,
  probe: Probe,
  text: string,
  left: number,
  top: number,
  width: number,
  height: number,
  alpha: number,
) => {
  const m = ctx.getTransform();
  const map = (px: number, py: number): Point => [
    m.a * px + m.c * py + m.e + probe.dx,
    m.b * px + m.d * py + m.f,
  ];
  const corners: [Point, Point, Point, Point] = [
    map(left, top),
    map(left + width, top),
    map(left + width, top + height),
    map(left, top + height),
  ];
  const xs = corners.map((c) => c[0]);
  const ys = corners.map((c) => c[1]);
  const x = Math.min(...xs);
  const y = Math.min(...ys);
  probe.boxes.push({
    text,
    scene: probe.scene,
    x,
    y,
    w: Math.max(...xs) - x,
    h: Math.max(...ys) - y,
    corners,
    alpha: alpha * probe.alpha,
  });
};

/** How far a line of text reaches above and below its baseline, in the context's font. */
export const textExtent = (ctx: CanvasRenderingContext2D, text: string) => {
  const m = ctx.measureText(text);
  return { ascent: m.actualBoundingBoxAscent, descent: m.actualBoundingBoxDescent };
};

/**
 * Declare the plate a line of text sits on (a torn tag, a caption plate), in
 * the current transform's space. A plate hides what is under it as surely as
 * the text does, so the check measures it as that text: recorded under the
 * same words, a line and its plate never collide with each other. Does nothing
 * unless a check is probing `ctx`.
 */
export const probePlate = (
  ctx: CanvasRenderingContext2D,
  text: string,
  left: number,
  top: number,
  width: number,
  height: number,
) => {
  const probe = probeOf(ctx);
  if (probe === undefined) return;
  recordText(ctx, probe, text, left, top, width, height, ctx.globalAlpha);
};
