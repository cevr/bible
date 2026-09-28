// The probe: `film check` asks a render to report every line of text it
// draws, as a box in canvas pixels, and every mark of ink (a brush stroke's
// centre line, a cutout's outline, a text's plate), so collisions are
// measured instead of spotted. A probe is attached to one context for one
// draw; with none attached, drawing costs a single WeakMap lookup and records
// nothing. It only reads the context (its transform, its opacity,
// `measureText`), so a probed frame is pixel for pixel the frame it would have
// been.

import type { InkMark, Point, TextBox } from '../core/schema.ts';

/** What one probed frame collects: text and ink, in the order drawn. */
export interface ProbeSink {
  readonly texts: TextBox[];
  readonly inks: InkMark[];
}

/** Where text and ink drawn into a context land on screen, and whose they are. */
export interface Probe {
  readonly sink: ProbeSink;
  /** The scene drawing. */
  readonly scene: string;
  /** Screen offset of the layer the context draws into (a pan transition). */
  readonly dx: number;
  /** Opacity the layer is composited at (a fade or wipe transition). */
  readonly alpha: number;
  /** The `order` of the plate the text drawn now sits on (inside `probePlate`). */
  readonly plate?: number;
}

const probes = new WeakMap<CanvasRenderingContext2D, Probe>();

/**
 * Run `draw` with `probe` recording the text drawn into `ctx`; without a
 * probe, just draw. The probe comes off even when `draw` throws, so a failed
 * frame's probe never records the next frame.
 */
export const probing = (
  ctx: CanvasRenderingContext2D,
  probe: Probe | undefined,
  draw: () => void,
) => {
  if (probe === undefined) return draw();
  probes.set(ctx, probe);
  try {
    draw();
  } finally {
    probes.delete(ctx);
  }
};

/** The probe attached to `ctx`, if a check is recording it. */
export const probeOf = (ctx: CanvasRenderingContext2D): Probe | undefined => probes.get(ctx);

/**
 * Draw without recording: for marks the frame clips to a shape (hatching),
 * whose drawn path is not where the ink shows.
 */
export const unprobed = (ctx: CanvasRenderingContext2D, draw: () => void) => {
  const probe = probes.get(ctx);
  if (probe === undefined) return draw();
  probes.delete(ctx);
  try {
    draw();
  } finally {
    probes.set(ctx, probe);
  }
};

/** When the next record lands in the frame's drawing order. */
const nextOrder = (sink: ProbeSink) => sink.texts.length + sink.inks.length;

/** `ctx`'s transform, then the layer's offset: where a point in the current space lands on screen. */
const screen = (ctx: CanvasRenderingContext2D, probe: Probe) => {
  const m = ctx.getTransform();
  return (px: number, py: number): Point => [
    m.a * px + m.c * py + m.e + probe.dx,
    m.b * px + m.d * py + m.f,
  ];
};

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
  hand?: number,
) => {
  const map = screen(ctx, probe);
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
  const box: TextBox = {
    text,
    scene: probe.scene,
    x,
    y,
    w: Math.max(...xs) - x,
    h: Math.max(...ys) - y,
    corners,
    alpha: alpha * probe.alpha,
    order: nextOrder(probe.sink),
  };
  const handed = hand === undefined ? box : { ...box, hand };
  probe.sink.texts.push(probe.plate === undefined ? handed : { ...handed, on: probe.plate });
};

/** A recorded path keeps a point every this many pixels (in its own space) at most. */
const INK_STEP = 6;

/**
 * Record a mark of ink drawn in the current transform's space: a stroke's
 * centre line `path` `width` wide, or a fill's or plate's outline, at opacity
 * `alpha`. The path is thinned to a point every few pixels; its ends stay.
 * `marks` are the seeds of the hands whose lines of text the stroke marks on
 * purpose.
 */
export const recordInk = (
  ctx: CanvasRenderingContext2D,
  probe: Probe,
  kind: InkMark['kind'],
  path: ReadonlyArray<Point>,
  width: number,
  alpha: number,
  marks?: ReadonlyArray<number>,
) => {
  const first = path[0];
  if (first === undefined) return;
  const map = screen(ctx, probe);
  const kept: Point[] = [map(first[0], first[1])];
  let last = first;
  for (let i = 1; i < path.length; i++) {
    const p = path[i];
    if (p === undefined) continue;
    if (i < path.length - 1 && Math.hypot(p[0] - last[0], p[1] - last[1]) < INK_STEP) continue;
    kept.push(map(p[0], p[1]));
    last = p;
  }
  const xs = kept.map((c) => c[0]);
  const ys = kept.map((c) => c[1]);
  const x = Math.min(...xs);
  const y = Math.min(...ys);
  const m = ctx.getTransform();
  const mark: InkMark = {
    kind,
    scene: probe.scene,
    points: kept,
    width: width * Math.sqrt(Math.abs(m.a * m.d - m.b * m.c)),
    x,
    y,
    w: Math.max(...xs) - x,
    h: Math.max(...ys) - y,
    alpha: alpha * probe.alpha,
    order: nextOrder(probe.sink),
  };
  probe.sink.inks.push(marks === undefined ? mark : { ...mark, marks });
};

/** How far a line of text reaches above and below its baseline, in the context's font. */
export const textExtent = (ctx: CanvasRenderingContext2D, text: string) => {
  const m = ctx.measureText(text);
  return { ascent: m.actualBoundingBoxAscent, descent: m.actualBoundingBoxDescent };
};

/** A plate's box in its own space: the rectangle around `shape`. */
const boundsOf = (shape: ReadonlyArray<Point>) => {
  let left = Infinity;
  let top = Infinity;
  let right = -Infinity;
  let bottom = -Infinity;
  for (const [x, y] of shape) {
    left = Math.min(left, x);
    top = Math.min(top, y);
    right = Math.max(right, x);
    bottom = Math.max(bottom, y);
  }
  return { left, top, width: right - left, height: bottom - top };
};

/**
 * Declare the plate `shape` (the points the scene passes to `piece` or
 * `cutout`, in the current transform's space) and draw what sits on it. A
 * plate hides what is under it as surely as text does, so the check measures
 * it as text, the box around `shape`, and as ink (a `plate`), so a stroke
 * drawn before it is known to be hidden under it. The lines `draw` writes are
 * recorded as on this plate, so they never collide with it; any other text
 * over the plate does. The plate is named by the lines it carries. Without a
 * probe on `ctx`, this only draws.
 */
export const probePlate = (
  ctx: CanvasRenderingContext2D,
  shape: ReadonlyArray<Point>,
  draw: () => void,
) => {
  const probe = probeOf(ctx);
  if (probe === undefined) return draw();
  const alpha = ctx.globalAlpha;
  recordInk(ctx, probe, 'plate', shape, 0, alpha);
  const at = probe.sink.texts.length;
  const box = boundsOf(shape);
  recordText(ctx, probe, '', box.left, box.top, box.width, box.height, alpha);
  const recorded = probe.sink.texts[at];
  if (recorded === undefined) return draw();
  probes.set(ctx, { ...probe, plate: recorded.order });
  try {
    draw();
  } finally {
    probes.set(ctx, probe);
  }
  const words = probe.sink.texts.filter((t) => t.on === recorded.order).map((t) => t.text);
  probe.sink.texts[at] = {
    ...recorded,
    text: words.length > 0 ? words.join(' / ') : '(empty plate)',
  };
};

/** A plate's rectangle as ink: it hides the strokes drawn before it. */
export const recordPlate = (
  ctx: CanvasRenderingContext2D,
  probe: Probe,
  left: number,
  top: number,
  width: number,
  height: number,
  alpha: number,
) =>
  recordInk(
    ctx,
    probe,
    'plate',
    [
      [left, top],
      [left + width, top],
      [left + width, top + height],
      [left, top + height],
    ],
    0,
    alpha,
  );
