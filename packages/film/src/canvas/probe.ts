// The probe: `film check` asks a render to report every line of text it
// draws, as a box in canvas pixels, and every mark of ink (a brush stroke's
// centre line, a cutout's outline, a text's plate), so collisions are
// measured instead of spotted. A probe is attached to one context for one
// draw; with none attached, drawing costs a single WeakMap lookup and records
// nothing. It only reads the context (its transform, its opacity,
// `measureText`), so a probed frame is pixel for pixel the frame it would have
// been.

import { insidePolygon } from '../core/polygon.ts';
import type { FaceMark, HandMark, InkMark, Point, TextBox } from '../core/schema.ts';

/** What one probed frame collects: text and ink, in the order drawn, and faces and hands when asked. */
export interface ProbeSink {
  readonly texts: TextBox[];
  readonly inks: InkMark[];
  /** Given, every face `probeFace` declares lands here (the look pass's `FaceSmall`). */
  readonly faces?: FaceMark[];
  /** Given, every hand `probeHand` declares lands here (the look pass's `HandJump`, `HandFar`, `HandHidden`). */
  readonly hands?: HandMark[];
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
  /** Set while the caption line draws: what it records is tagged `caption`. */
  readonly caption?: true;
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

/** Canvas pixels per unit of the current space: `sqrt(|det|)` of `ctx`'s transform. */
const scaleOf = (ctx: CanvasRenderingContext2D) => {
  const m = ctx.getTransform();
  return Math.sqrt(Math.abs(m.a * m.d - m.b * m.c));
};

/** `record` tagged as the caption's, when the caption line is drawing. */
const tagged = <A extends object>(probe: Probe, record: A): A | (A & { readonly caption: true }) =>
  probe.caption === true ? { ...record, caption: true } : record;

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
    scale: scaleOf(ctx),
  };
  const handed = hand === undefined ? box : { ...box, hand };
  probe.sink.texts.push(
    tagged(probe, probe.plate === undefined ? handed : { ...handed, on: probe.plate }),
  );
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
  const scale = scaleOf(ctx);
  const mark: InkMark = {
    kind,
    scene: probe.scene,
    points: kept,
    width: width * scale,
    x,
    y,
    w: Math.max(...xs) - x,
    h: Math.max(...ys) - y,
    alpha: alpha * probe.alpha,
    order: nextOrder(probe.sink),
    scale,
  };
  probe.sink.inks.push(tagged(probe, marks === undefined ? mark : { ...mark, marks }));
};

/**
 * Declare a face centred on (x, y), `height` tall, in the current transform's
 * space: a kit's person calls it for its head, so `film check` measures the
 * face on screen (`FaceSmall`) rather than a reader guessing it from a still.
 * Records only when a probe that collects faces is attached; draws nothing.
 */
export const probeFace = (ctx: CanvasRenderingContext2D, x: number, y: number, height: number) => {
  const probe = probes.get(ctx);
  const faces = probe?.sink.faces;
  if (probe === undefined || faces === undefined) return;
  const [sx, sy] = screen(ctx, probe)(x, y);
  faces.push({
    scene: probe.scene,
    x: sx,
    y: sy,
    size: height * scaleOf(ctx),
    alpha: ctx.globalAlpha * probe.alpha,
  });
};

/**
 * Whether a probe that collects hands is attached to `ctx`: a kit asks before
 * working out where its hands are, so a frame nobody probes pays one lookup.
 */
export const probesHands = (ctx: CanvasRenderingContext2D): boolean =>
  probes.get(ctx)?.sink.hands !== undefined;

/** One floating hand a kit's person declares to `probeHand`, in the current transform's space. */
export interface HandSeen {
  readonly side: 'far' | 'near';
  /** The shoulder it floats round. */
  readonly shoulder: Point;
  /** Where the hand is now. */
  readonly at: Point;
  /** Where it works (its rest, when it has no work). */
  readonly to: Point;
  /** Its length, wrist to fingertips. */
  readonly size: number;
  /** The figure's reach: the farthest from its shoulder a hand may work. */
  readonly radius: number;
  /** How far it has travelled from its rest to its work, 0 to 1. */
  readonly reach: number;
  /** Whether the hand is drawn over its own body (after it), not behind it. */
  readonly over: boolean;
  /**
   * The body's silhouette, one shape or several (garment, head), in the same
   * space; asked only while a probe collects hands, so an unprobed frame
   * builds none.
   */
  readonly body: () => ReadonlyArray<ReadonlyArray<Point>>;
}

/**
 * Declare a hand: a kit's person calls it for both of its hands every frame,
 * at work or at rest, so `film check` follows each hand frame to frame
 * (`HandJump`), sees one sent past its figure's reach (`HandFar`) and one lost
 * behind its own body (`HandHidden`) from the kit's own numbers rather than a
 * reader spotting any of them in a still. Records only when a probe that
 * collects hands is attached; draws nothing.
 */
export const probeHand = (ctx: CanvasRenderingContext2D, hand: HandSeen) => {
  const probe = probes.get(ctx);
  const hands = probe?.sink.hands;
  if (probe === undefined || hands === undefined) return;
  const map = screen(ctx, probe);
  const scale = scaleOf(ctx);
  const [x, y] = map(hand.at[0], hand.at[1]);
  const [sx, sy] = map(hand.shoulder[0], hand.shoulder[1]);
  const [tx, ty] = map(hand.to[0], hand.to[1]);
  hands.push({
    scene: probe.scene,
    side: hand.side,
    x,
    y,
    sx,
    sy,
    tx,
    ty,
    size: hand.size * scale,
    radius: hand.radius * scale,
    reach: Math.min(1, Math.max(0, hand.reach)),
    inside: hand.body().some((shape) => insidePolygon(shape, hand.at)),
    over: hand.over,
    alpha: ctx.globalAlpha * probe.alpha,
  });
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
