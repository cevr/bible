// Painted plates, the layers of a parallax still: a plate is drawn once as a
// guide (its masses of value and colour, flat shapes and soft gradients),
// then painted over by brush strokes that take their colour from the guide
// under them, so the plate keeps its design and shows the hand. Coarse
// strokes cover it, finer ones follow its edges (each stroke runs along the
// guide's edges, across its gradient), and a line of hatching may lie in its
// shadows. A plate is painted the first time it is drawn and kept: it is a
// pure function of its declaration, seeded, so every frame and every render
// page paints it alike. What moves (light, air, a breath) is drawn live over
// it, never painted in.

import { noise2, rng } from '../core/random.ts';
import type { Hex } from './colour.ts';
import { offscreen } from './paper.ts';

/** One pass of strokes, from coarse to fine. */
interface BrushLayer {
  /** A stroke's width in plate px. */
  readonly size: number;
  /** One stroke per square this many px a side, placed at random in it. Defaults to 0.8 × `size`. */
  readonly spacing?: number;
  /** A stroke's length, in widths. Defaults to 2.6. */
  readonly length?: number;
  /** How opaque a stroke lays, 0..1. Defaults to 0.85. */
  readonly alpha?: number;
  /**
   * Lay a stroke only where the guide's edge is at least this strong, 0..1:
   * a fine pass that paints the detail and leaves the broad masses to the
   * coarse ones. Defaults to 0, everywhere.
   */
  readonly detail?: number;
}

/** Hand-drawn lines laid in a plate's shadows. */
interface Hatch {
  readonly color: Hex;
  /** The lines' angle, in radians. */
  readonly angle: number;
  /** Space between lines, in plate px. */
  readonly spacing: number;
  /** Lines show where the guide's value is under this, 0..1. */
  readonly below: number;
  readonly alpha: number;
  /** Line width in plate px. Defaults to 1.2. */
  readonly width?: number;
}

/** How a plate is painted over its guide. */
export interface Brush {
  readonly seed: number;
  readonly layers: ReadonlyArray<BrushLayer>;
  /** A stroke's angle where the guide is flat, in radians. Defaults to −0.35. */
  readonly flow?: number;
  /** How far a stroke's value strays from the guide's, ± share. Defaults to 0.08. */
  readonly jitter?: number;
  /** How strongly a stroke shows its bristles, 0..1. Defaults to 0.5. */
  readonly bristle?: number;
  readonly hatch?: Hatch;
}

/** A plate as data: its size, its guide and how it is painted. Declare it once, at module level. */
export interface Painting {
  /** Its size in plate px: the world px a plane draws it at. */
  readonly w: number;
  readonly h: number;
  /** Canvas px per plate px: above 1 for a plate the camera pushes into. Defaults to 1. */
  readonly scale?: number;
  /** The masses, drawn in plate px onto a clear canvas. */
  readonly guide: (ctx: CanvasRenderingContext2D) => void;
  readonly brush: Brush;
  /** Out of focus by this many plate px once painted: a plate nearer or farther than the eye rests. */
  readonly blur?: number;
}

/** Each plate painted, kept while its declaration lives. */
const painted = new WeakMap<Painting, HTMLCanvasElement>();

/** The cell, in canvas px, the guide's edges are measured over. */
const CELL = 4;

/** The guide's edges: per cell, the gradient of its value (alpha-weighted luma). */
interface Edges {
  readonly cols: number;
  readonly rows: number;
  readonly gx: Float32Array;
  readonly gy: Float32Array;
}

const edgesOf = (data: Uint8ClampedArray, w: number, h: number): Edges => {
  const cols = Math.ceil(w / CELL);
  const rows = Math.ceil(h / CELL);
  const v = new Float32Array(cols * rows);
  for (let cy = 0; cy < rows; cy++)
    for (let cx = 0; cx < cols; cx++) {
      const px = Math.min(w - 1, cx * CELL + 2);
      const py = Math.min(h - 1, cy * CELL + 2);
      const i = (py * w + px) * 4;
      const a = (data[i + 3] ?? 0) / 255;
      const l =
        (0.2126 * (data[i] ?? 0) + 0.7152 * (data[i + 1] ?? 0) + 0.0722 * (data[i + 2] ?? 0)) / 255;
      v[cy * cols + cx] = a * (0.35 + 0.65 * l);
    }
  const at = (x: number, y: number) =>
    v[Math.min(rows - 1, Math.max(0, y)) * cols + Math.min(cols - 1, Math.max(0, x))] ?? 0;
  const gx = new Float32Array(cols * rows);
  const gy = new Float32Array(cols * rows);
  for (let y = 0; y < rows; y++)
    for (let x = 0; x < cols; x++) {
      // Sobel, over a cell's neighbours.
      gx[y * cols + x] =
        (at(x + 1, y - 1) +
          2 * at(x + 1, y) +
          at(x + 1, y + 1) -
          at(x - 1, y - 1) -
          2 * at(x - 1, y) -
          at(x - 1, y + 1)) /
        4;
      gy[y * cols + x] =
        (at(x - 1, y + 1) +
          2 * at(x, y + 1) +
          at(x + 1, y + 1) -
          at(x - 1, y - 1) -
          2 * at(x, y - 1) -
          at(x + 1, y - 1)) /
        4;
    }
  return { cols, rows, gx, gy };
};

/** A stroke as `stroke` lays it. */
interface Stroke {
  x: number;
  y: number;
  angle: number;
  length: number;
  width: number;
  bend: number;
  r: number;
  g: number;
  b: number;
  alpha: number;
}

const rgb = (r: number, g: number, b: number) =>
  `rgb(${Math.round(Math.min(255, Math.max(0, r)))}, ${Math.round(Math.min(255, Math.max(0, g)))}, ${Math.round(Math.min(255, Math.max(0, b)))})`;

/** Points along a stroke's spine, 0..1, bent by `bend` at its middle. */
const spine = (s: Stroke, u: number, across: number): readonly [number, number] => {
  const dx = Math.cos(s.angle);
  const dy = Math.sin(s.angle);
  const along = (u - 0.5) * s.length;
  const off = s.bend * 4 * u * (1 - u) + across;
  return [s.x + dx * along - dy * off, s.y + dy * along + dx * off];
};

/** The samples a stroke's outline takes down each side. */
const SAMPLES = 7;

/** One stroke: a tapered, bent body, and its bristles a little lighter and darker within it. */
const stroke = (ctx: CanvasRenderingContext2D, s: Stroke, bristle: number, seed: number) => {
  ctx.globalAlpha = s.alpha;
  ctx.fillStyle = rgb(s.r, s.g, s.b);
  ctx.beginPath();
  for (let i = 0; i <= SAMPLES; i++) {
    const u = i / SAMPLES;
    const half = (s.width / 2) * Math.sqrt(Math.sin(Math.PI * (0.06 + 0.88 * u)));
    const [x, y] = spine(s, u, half);
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  for (let i = SAMPLES; i >= 0; i--) {
    const u = i / SAMPLES;
    const half = (s.width / 2) * Math.sqrt(Math.sin(Math.PI * (0.06 + 0.88 * u)));
    const [x, y] = spine(s, u, -half);
    ctx.lineTo(x, y);
  }
  ctx.closePath();
  ctx.fill();
  if (bristle <= 0 || s.width < 3) return;
  const r = rng(seed);
  ctx.lineWidth = Math.max(0.6, s.width * 0.09);
  for (let k = 0; k < 3; k++) {
    const across = (r() - 0.5) * s.width * 0.7;
    const lift = r() > 0.5 ? 1.16 : 0.84;
    ctx.globalAlpha = s.alpha * bristle * (0.25 + 0.25 * r());
    ctx.strokeStyle = rgb(s.r * lift, s.g * lift, s.b * lift);
    const from = 0.08 + r() * 0.2;
    const to = 0.72 + r() * 0.2;
    ctx.beginPath();
    for (let i = 0; i <= 4; i++) {
      const [x, y] = spine(s, from + ((to - from) * i) / 4, across);
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.stroke();
  }
};

/** What a layer lays its strokes by, read once per layer. */
interface LayerRead {
  readonly data: Uint8ClampedArray;
  readonly w: number;
  readonly h: number;
  readonly edges: Edges;
  readonly brush: Brush;
  readonly size: number;
  readonly length: number;
  readonly alpha: number;
  readonly detail: number;
}

/** The stroke a layer lays at (`x`, `y`), drawing six numbers from `r`; none outside the guide or off its detail. */
const strokeAt = (l: LayerRead, x: number, y: number, r: () => number): Stroke | undefined => {
  const [rl, rw, rb, rj, rt, ra] = [r(), r(), r(), r(), r(), r()];
  const px = Math.min(l.w - 1, Math.max(0, Math.floor(x)));
  const py = Math.min(l.h - 1, Math.max(0, Math.floor(y)));
  const i = (py * l.w + px) * 4;
  if ((l.data[i + 3] ?? 0) < 128) return undefined;
  const { edges, brush, size } = l;
  const cell =
    Math.min(edges.rows - 1, Math.floor(py / CELL)) * edges.cols +
    Math.min(edges.cols - 1, Math.floor(px / CELL));
  const ex = edges.gx[cell] ?? 0;
  const ey = edges.gy[cell] ?? 0;
  const strength = Math.min(1, Math.hypot(ex, ey) * 4);
  if (strength < l.detail) return undefined;
  // Along the edge where there is one; with the flow, wandering, where the guide is flat.
  const wander = (brush.flow ?? -0.35) + noise2(x / (size * 9), y / (size * 9), brush.seed) * 0.7;
  const angle = strength > 0.06 ? Math.atan2(ey, ex) + Math.PI / 2 : wander;
  const jitter = brush.jitter ?? 0.08;
  const f = 1 + jitter * (rj * 2 - 1);
  const warm = jitter * (rt - 0.5) * 30;
  return {
    x,
    y,
    angle,
    // Short across an edge's bend: a long stroke there would overshoot the shape it follows.
    length: size * l.length * (0.7 + 0.6 * rl) * (1 - 0.6 * Math.min(1, strength * 2)),
    width: size * (0.75 + 0.5 * rw),
    bend: (rb - 0.5) * size * 0.9,
    r: (l.data[i] ?? 0) * f + warm,
    g: (l.data[i + 1] ?? 0) * f,
    b: (l.data[i + 2] ?? 0) * f - warm,
    alpha: l.alpha * (0.8 + 0.2 * ra),
  };
};

/** Shuffle `xs` in place by `r`. */
const shuffle = <A>(xs: A[], r: () => number) => {
  for (let k = xs.length - 1; k > 0; k--) {
    const j = Math.floor(r() * (k + 1));
    const a = xs[k];
    const b = xs[j];
    if (a !== undefined && b !== undefined) {
      xs[k] = b;
      xs[j] = a;
    }
  }
};

/** Paint `layer`'s strokes over the canvas from the guide's pixels and edges. */
const paintLayer = (
  ctx: CanvasRenderingContext2D,
  read: Omit<LayerRead, 'size' | 'length' | 'alpha' | 'detail'>,
  layer: BrushLayer,
  scale: number,
  index: number,
) => {
  const l: LayerRead = {
    ...read,
    size: layer.size * scale,
    length: layer.length ?? 2.6,
    alpha: layer.alpha ?? 0.85,
    detail: layer.detail ?? 0,
  };
  const spacing = (layer.spacing ?? layer.size * 0.8) * scale;
  const r = rng(l.brush.seed * 7919 + index * 104729);
  const strokes: Stroke[] = [];
  for (let gy = 0; gy < l.h; gy += spacing)
    for (let gx = 0; gx < l.w; gx += spacing) {
      const s = strokeAt(l, gx + r() * spacing, gy + r() * spacing, r);
      if (s !== undefined) strokes.push(s);
    }
  // Laid in a shuffled order, so no pass shows its rows.
  shuffle(strokes, r);
  ctx.save();
  ctx.lineCap = 'round';
  const bristle = l.brush.bristle ?? 0.5;
  strokes.forEach((s, k) => stroke(ctx, s, bristle, l.brush.seed + index * 65537 + k));
  ctx.restore();
};

/** Lines across the plate at the hatch's angle, drawn only where the guide is in shadow. */
const hatchOver = (
  ctx: CanvasRenderingContext2D,
  data: Uint8ClampedArray,
  w: number,
  h: number,
  hatch: Hatch,
  scale: number,
  seed: number,
) => {
  const dx = Math.cos(hatch.angle);
  const dy = Math.sin(hatch.angle);
  const spacing = hatch.spacing * scale;
  const reach = Math.hypot(w, h);
  const step = 3 * scale;
  ctx.save();
  ctx.strokeStyle = hatch.color;
  ctx.lineWidth = (hatch.width ?? 1.2) * scale;
  ctx.lineCap = 'round';
  const r = rng(seed);
  const shaded = (x: number, y: number) => {
    if (x < 0 || y < 0 || x >= w || y >= h) return false;
    const i = (Math.floor(y) * w + Math.floor(x)) * 4;
    if ((data[i + 3] ?? 0) < 128) return false;
    const l =
      (0.2126 * (data[i] ?? 0) + 0.7152 * (data[i + 1] ?? 0) + 0.0722 * (data[i + 2] ?? 0)) / 255;
    return l < hatch.below;
  };
  for (let off = -reach; off < reach; off += spacing * (0.8 + 0.4 * r())) {
    const ox = w / 2 - dy * off;
    const oy = h / 2 + dx * off;
    const lineSeed = Math.floor(r() * 1e6);
    ctx.globalAlpha = hatch.alpha * (0.6 + 0.4 * r());
    let down = false;
    ctx.beginPath();
    for (let s = -reach / 2; s < reach / 2; s += step) {
      const wob = noise2(s / (40 * scale), off / spacing, lineSeed) * 1.6 * scale;
      const x = ox + dx * s - dy * wob;
      const y = oy + dy * s + dx * wob;
      const on = shaded(x, y) && noise2(s / (60 * scale), off, lineSeed + 1) > -0.35;
      if (on && !down) ctx.moveTo(x, y);
      else if (on) ctx.lineTo(x, y);
      down = on;
    }
    ctx.stroke();
  }
  ctx.restore();
};

/**
 * The plate painted: its guide drawn at its scale, painted over by each of
 * its brush's layers in turn, hatched, and blurred if it is out of focus.
 * Made the first time it is asked for and kept while the declaration lives.
 */
const paintingOf = (p: Painting): HTMLCanvasElement => {
  const have = painted.get(p);
  if (have !== undefined) return have;
  const scale = p.scale ?? 1;
  const w = Math.ceil(p.w * scale);
  const h = Math.ceil(p.h * scale);
  const guide = offscreen(w, h);
  guide.ctx.scale(scale, scale);
  p.guide(guide.ctx);
  const data = guide.ctx.getImageData(0, 0, w, h).data;
  const edges = edgesOf(data, w, h);
  const plate = offscreen(w, h);
  // The guide itself under the strokes, so nothing shows between them.
  plate.ctx.drawImage(guide.c, 0, 0);
  const read = { data, w, h, edges, brush: p.brush };
  p.brush.layers.forEach((layer, i) => paintLayer(plate.ctx, read, layer, scale, i));
  if (p.brush.hatch !== undefined)
    hatchOver(plate.ctx, data, w, h, p.brush.hatch, scale, p.brush.seed + 31);
  let made = plate.c;
  if (p.blur !== undefined && p.blur > 0) {
    const soft = offscreen(w, h);
    soft.ctx.filter = `blur(${(p.blur * scale).toFixed(2)}px)`;
    soft.ctx.drawImage(plate.c, 0, 0);
    made = soft.c;
  }
  painted.set(p, made);
  return made;
};

/** Draw the painted plate with its top left at (`x`, `y`), at its size in plate px. */
export const drawPainting = (ctx: CanvasRenderingContext2D, p: Painting, x: number, y: number) =>
  ctx.drawImage(paintingOf(p), x, y, p.w, p.h);
