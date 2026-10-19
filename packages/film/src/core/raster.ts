// A picture as plain bytes: what a sound's sheet is drawn into
// (`synth/sheet.ts`), what a PNG reads back as (`tools/png.ts`), what a
// figure is measured from (`figure.ts`) and what a match strokes a concept's
// outline over (`match.ts`). Pure.

/** A picture: `width` × `height` pixels of four bytes (red, green, blue, alpha), row by row from the top. */
export interface Raster {
  readonly width: number;
  readonly height: number;
  readonly rgba: Uint8Array;
}

/** A box in a picture's pixels: left, top, right, bottom (the right and bottom edges outside it). */
type RasterBox = readonly [x0: number, y0: number, x1: number, y1: number];

/** `box` held inside a `width` × `height` picture, in whole pixels; empty when it holds none of it. */
const clampBox = (box: RasterBox, width: number, height: number): RasterBox => {
  const x0 = Math.max(0, Math.min(width, Math.floor(Math.min(box[0], box[2]))));
  const y0 = Math.max(0, Math.min(height, Math.floor(Math.min(box[1], box[3]))));
  const x1 = Math.max(x0, Math.min(width, Math.ceil(Math.max(box[0], box[2]))));
  const y1 = Math.max(y0, Math.min(height, Math.ceil(Math.max(box[1], box[3]))));
  return [x0, y0, x1, y1];
};

/** The part of `r` inside `box` (`clampBox`). */
export const cropRaster = (r: Raster, box: RasterBox): Raster => {
  const [x0, y0, x1, y1] = clampBox(box, r.width, r.height);
  const [width, height] = [x1 - x0, y1 - y0];
  const rgba = new Uint8Array(width * height * 4);
  for (let y = 0; y < height; y++)
    rgba.set(
      r.rgba.subarray(((y0 + y) * r.width + x0) * 4, ((y0 + y) * r.width + x1) * 4),
      y * width * 4,
    );
  return { width, height, rgba };
};

/** `r` drawn `factor` times its size, each pixel the bilinear blend of the four it falls between. */
export const scaleRaster = (r: Raster, factor: number): Raster => stretchRaster(r, factor, factor);

/** `r` drawn `fx` times its width and `fy` times its height, each pixel the bilinear blend of the four it falls between. */
export const stretchRaster = (r: Raster, fx: number, fy: number): Raster => {
  const width = Math.max(1, Math.round(r.width * fx));
  const height = Math.max(1, Math.round(r.height * fy));
  const rgba = new Uint8Array(width * height * 4);
  const src = r.rgba;
  // Each column's two source columns (as byte offsets in a row) and its blend, once.
  const left = new Int32Array(width);
  const right = new Int32Array(width);
  const tx = new Float64Array(width);
  for (let x = 0; x < width; x++) {
    const sx = Math.min(r.width - 1, Math.max(0, (x + 0.5) / fx - 0.5));
    const x0 = Math.floor(sx);
    left[x] = x0 * 4;
    right[x] = Math.min(r.width - 1, x0 + 1) * 4;
    tx[x] = sx - x0;
  }
  for (let y = 0; y < height; y++) {
    const sy = Math.min(r.height - 1, Math.max(0, (y + 0.5) / fy - 0.5));
    const y0 = Math.floor(sy);
    const ty = sy - y0;
    const [top, bottom] = [y0 * r.width * 4, Math.min(r.height - 1, y0 + 1) * r.width * 4];
    for (let x = 0; x < width; x++) {
      const [a, b, t] = [left[x]!, right[x]!, tx[x]!];
      const out = (y * width + x) * 4;
      for (let k = 0; k < 4; k++) {
        const upper = src[top + a + k]! * (1 - t) + src[top + b + k]! * t;
        const lower = src[bottom + a + k]! * (1 - t) + src[bottom + b + k]! * t;
        rgba[out + k] = Math.round(upper * (1 - ty) + lower * ty);
      }
    }
  }
  return { width, height, rgba };
};

/** `pictures` one under another, left-aligned, on white. */
export const stackRaster = (pictures: ReadonlyArray<Raster>): Raster => {
  const width = Math.max(1, ...pictures.map((p) => p.width));
  const height = pictures.reduce((s, p) => s + p.height, 0);
  const rgba = new Uint8Array(width * height * 4).fill(255);
  let down = 0;
  for (const p of pictures) {
    for (let y = 0; y < p.height; y++)
      rgba.set(p.rgba.subarray(y * p.width * 4, (y + 1) * p.width * 4), (down + y) * width * 4);
    down += p.height;
  }
  return { width, height, rgba };
};

/**
 * `pictures` side by side on white, `gap` pixels apart and round the edge,
 * each placed down by its own `top` (to the nearest pixel) so the rows they
 * are aligned by meet.
 */
export const besideRaster = (
  pictures: ReadonlyArray<{ readonly raster: Raster; readonly top: number }>,
  gap: number,
): Raster => {
  const lift = Math.max(0, ...pictures.map((p) => p.top));
  const width = gap + pictures.reduce((s, p) => s + p.raster.width + gap, 0);
  const downOf = (top: number) => Math.round(gap + lift - top);
  const height = gap + Math.max(0, ...pictures.map((p) => downOf(p.top) + p.raster.height));
  const rgba = new Uint8Array(width * height * 4).fill(255);
  let left = gap;
  for (const { raster, top } of pictures) {
    const down = downOf(top);
    for (let y = 0; y < raster.height; y++)
      rgba.set(
        raster.rgba.subarray(y * raster.width * 4, (y + 1) * raster.width * 4),
        ((down + y) * width + left) * 4,
      );
    left += raster.width + gap;
  }
  return { width, height, rgba };
};

/** A path to stroke: its points in the picture's pixels, and whether its last point joins its first. */
export interface RasterPath {
  readonly points: ReadonlyArray<readonly [x: number, y: number]>;
  readonly closed: boolean;
}

/** `r` with each of `paths` stroked over it `width` pixels wide in `colour` (red, green, blue), opaque; `r` itself unchanged. */
export const strokeRaster = (
  r: Raster,
  paths: ReadonlyArray<RasterPath>,
  colour: readonly [number, number, number],
  width: number,
): Raster => {
  const rgba = r.rgba.slice();
  const half = width / 2;
  const dot = (cx: number, cy: number) => {
    for (let y = Math.floor(cy - half); y <= Math.ceil(cy + half); y++)
      for (let x = Math.floor(cx - half); x <= Math.ceil(cx + half); x++)
        if (
          x >= 0 &&
          y >= 0 &&
          x < r.width &&
          y < r.height &&
          (x + 0.5 - cx) ** 2 + (y + 0.5 - cy) ** 2 <= half * half
        )
          rgba.set([...colour, 255], (y * r.width + x) * 4);
  };
  for (const { points, closed } of paths) {
    const ends = closed && points.length > 1 ? [...points, points[0]!] : points;
    if (ends.length === 1) dot(...ends[0]!);
    for (let k = 1; k < ends.length; k++) {
      const [[x0, y0], [x1, y1]] = [ends[k - 1]!, ends[k]!];
      const steps = Math.max(1, Math.ceil(Math.hypot(x1 - x0, y1 - y0) / Math.max(0.5, half / 2)));
      for (let s = 0; s <= steps; s++)
        dot(x0 + ((x1 - x0) * s) / steps, y0 + ((y1 - y0) * s) / steps);
    }
  }
  return { width: r.width, height: r.height, rgba };
};
