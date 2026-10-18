// A figure's render artifacts, read from its head's pixels (`film match`):
// the marks a drawn figure shows that no part of it draws, each a thin line
// of a third colour, at 1:1 only (owner, 2026-10-18, on the RBF v3 cast:
// "theres some artifacts in the render"). Pure: RGBA and the head's masks
// in, marks out.
//
// A thin line of a third colour is a pixel whose colour lies off the blend
// of the two pixels two or three pixels either side of it, across it: an
// antialiased edge between two fills is their blend and reads as nothing,
// and the paper's grain steps too little. The house rim, a band of the fill
// lifted inside the outline, is no sliver (`RIM_MOST`). Each such pixel is classed
// by what lies either side of it:
//
// - `seam`: two fills of the head either side (the light line where two
//   pieces meet with skin or paper showing between);
// - `sliver`: the head's ink on one side and a fill on the other (a fill
//   cut short of the outline, the colour under it showing in the gap);
// - `weather`: one fill both sides, over the face (rain or a stroke laid
//   across it).
//
// No spike past the outline is read: on RBF's frames the light point the
// owner saw at Christ's crown is a sliver inside the outline (read as one),
// and the one line a spike leg read past an outline was the wall's dado
// running behind cold's prosecutor (measured, 2026-10-18).
//
// The pixels of one class join into marks (8-connected); a mark shorter than
// `MARK_SHORTEST` lines is grain or an antialiasing step and is dropped. A
// mark's length is its long axis (from its pixels' second moments), so a
// diagonal streak counts its own length, not its box's.

import { Schema } from 'effect';
import type { Raster } from './raster.ts';

/** What a thin line of a third colour is, by what lies either side of it. */
export const ARTIFACT_KINDS = ['seam', 'sliver', 'weather'] as const;
export type ArtifactKind = (typeof ARTIFACT_KINDS)[number];

/** One artifact: its kind, its box in the crop's pixels, and its length in pixels. */
export const ArtifactMark = Schema.Struct({
  kind: Schema.Literals(ARTIFACT_KINDS),
  box: Schema.Tuple([Schema.Finite, Schema.Finite, Schema.Finite, Schema.Finite]),
  length: Schema.Finite,
});
export type ArtifactMark = typeof ArtifactMark.Type;

/** What the read needs of a head: its crop, the ink (lines, marks and masses), its outline's mask in a box of the crop, and its line's width. */
interface HeadPixels {
  readonly raster: Raster;
  /** 1 where ink: a line, a mark or a mass (a fill as dark as the ink). */
  readonly ink: Uint8Array;
  /** The head inside its outline's outer edge, 1 inside, in the box at (`x0`, `y0`), `bw` × `bh`. */
  readonly head: {
    readonly x0: number;
    readonly y0: number;
    readonly bw: number;
    readonly bh: number;
    readonly mask: Uint8Array;
  };
  /** The face's box in the crop, from the eyes to the chin: weather counts over it only. */
  readonly face: {
    readonly x0: number;
    readonly y0: number;
    readonly x1: number;
    readonly y1: number;
  };
  /** The outline's width in pixels. */
  readonly line: number;
}

/** A pixel off the blend of its two neighbours by more than this (RGB distance) is a third colour. */
const OFF_BLEND = 30;

/**
 * A pixel beside the ink is a sliver only when its luma is this far from
 * the fill's on its other side: the house rim is the fill lifted 20 to 35
 * (measured on RBF's lead, prosecutor and judge), a fill showing in a gap
 * far more.
 */
const RIM_MOST = 45;

/** Two neighbours nearer than this (RGB distance) are one fill. */
const ONE_FILL = 20;

/** How far either side a pixel's neighbours are read, in pixels: a line up to five pixels wide. */
const ACROSS = [2, 3] as const;

/** The directions a line is read across: along a row, a column and both diagonals. */
const WAYS: ReadonlyArray<readonly [number, number]> = [
  [1, 0],
  [0, 1],
  [1, 1],
  [1, -1],
];

/** A mark shorter than this many lines' widths is grain or an antialiasing step. */
const MARK_SHORTEST = 2;

type Rgb = readonly [number, number, number];

const lumaOf = (c: Rgb) => 0.299 * c[0] + 0.587 * c[1] + 0.114 * c[2];

const rgbAt = (r: Raster, i: number): Rgb => [
  r.rgba[i * 4]!,
  r.rgba[i * 4 + 1]!,
  r.rgba[i * 4 + 2]!,
];

const dist = (a: Rgb, b: Rgb) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);

/** How far `p` lies from the blends of `a` and `b` (the segment between them in RGB). */
const offBlend = (p: Rgb, a: Rgb, b: Rgb): number => {
  const ab = [b[0] - a[0], b[1] - a[1], b[2] - a[2]] as const;
  const ap = [p[0] - a[0], p[1] - a[1], p[2] - a[2]] as const;
  const span = ab[0] * ab[0] + ab[1] * ab[1] + ab[2] * ab[2];
  const t =
    span === 0
      ? 0
      : Math.max(0, Math.min(1, (ap[0] * ab[0] + ap[1] * ab[1] + ap[2] * ab[2]) / span));
  return Math.hypot(ap[0] - t * ab[0], ap[1] - t * ab[1], ap[2] - t * ab[2]);
};

/** Each pixel's class: 0 none, else 1 + its kind's index. */
const KIND_CODE: Readonly<Record<ArtifactKind, number>> = {
  seam: 1,
  sliver: 2,
  weather: 3,
};

/** Whether the crop's pixel (`x`, `y`) lies inside the head's outline. */
const inHead = (head: HeadPixels['head'], x: number, y: number): boolean => {
  const hx = x - head.x0;
  const hy = y - head.y0;
  return hx >= 0 && hy >= 0 && hx < head.bw && hy < head.bh && head.mask[hy * head.bw + hx] === 1;
};

/** The squared RGB distance of the raster's pixels `i` and `j`. */
const distSq = (rgba: Uint8Array, i: number, j: number): number => {
  const dr = rgba[i * 4]! - rgba[j * 4]!;
  const dg = rgba[i * 4 + 1]! - rgba[j * 4 + 1]!;
  const db = rgba[i * 4 + 2]! - rgba[j * 4 + 2]!;
  return dr * dr + dg * dg + db * db;
};

/** A pixel read across one pair of its neighbours: how far off their blend it is, and its class there (0 none). */
interface Across {
  readonly off: number;
  readonly code: number;
}

const NOTHING: Across = { off: 0, code: 0 };

/**
 * The pixel `i` read across its neighbours `i1` and `i2`: a sliver where one
 * is ink and the pixel is no rim's lift of the fill, weather where both are
 * one fill, else a seam; nothing where both are ink or the pixel is near
 * either (a blend lies no farther from it than either end).
 */
const across = (px: HeadPixels, i: number, i1: number, i2: number): Across => {
  const { raster: r, ink } = px;
  const inks = ink[i1]! + ink[i2]!;
  const offSq = OFF_BLEND * OFF_BLEND;
  if (inks === 2 || distSq(r.rgba, i, i1) <= offSq || distSq(r.rgba, i, i2) <= offSq)
    return NOTHING;
  const [p, a, b] = [rgbAt(r, i), rgbAt(r, i1), rgbAt(r, i2)];
  const off = offBlend(p, a, b);
  if (inks === 1) {
    const fill = ink[i1] === 1 ? b : a;
    return Math.abs(lumaOf(p) - lumaOf(fill)) > RIM_MOST
      ? { off, code: KIND_CODE.sliver }
      : NOTHING;
  }
  return { off, code: dist(a, b) < ONE_FILL ? KIND_CODE.weather : KIND_CODE.seam };
};

/** The pixel (`x`, `y`)'s class: by the way across it that it is most off its neighbours' blend, past `OFF_BLEND`. */
const classAt = (px: HeadPixels, x: number, y: number): number => {
  const { width: w, height: h } = px.raster;
  let best: Across = { off: OFF_BLEND, code: 0 };
  for (const k of ACROSS)
    for (const [dx, dy] of WAYS) {
      const [x1, y1, x2, y2] = [x - k * dx, y - k * dy, x + k * dx, y + k * dy];
      const inside =
        Math.min(x1, x2) >= 0 &&
        Math.min(y1, y2) >= 0 &&
        Math.max(x1, x2) < w &&
        Math.max(y1, y2) < h;
      if (!inside) continue;
      const read = across(px, y * w + x, y1 * w + x1, y2 * w + x2);
      if (read.code !== 0 && read.off > best.off) best = read;
    }
  return best.code;
};

/** Each pixel of a head classed (`KIND_CODE`): each pixel inside its outline that is not ink, by `classAt`. */
const classify = (px: HeadPixels): Uint8Array => {
  const { width: w, height: h } = px.raster;
  const kinds = new Uint8Array(w * h);
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++)
      if (px.ink[y * w + x] === 0 && inHead(px.head, x, y)) kinds[y * w + x] = classAt(px, x, y);
  return kinds;
};

/** A mark's pixels gathered: their count, sums for their moments, and their box. */
interface Gathered {
  readonly code: number;
  n: number;
  sx: number;
  sy: number;
  sxx: number;
  syy: number;
  sxy: number;
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

/** The long axis of a mark's pixels: a line `L` long has a variance of `L² / 12` along it. */
const lengthOf = (g: Gathered): number => {
  const [mx, my] = [g.sx / g.n, g.sy / g.n];
  const vxx = g.sxx / g.n - mx * mx + 1 / 12;
  const vyy = g.syy / g.n - my * my + 1 / 12;
  const vxy = g.sxy / g.n - mx * my;
  const major = (vxx + vyy) / 2 + Math.sqrt(((vxx - vyy) / 2) ** 2 + vxy * vxy);
  return Math.sqrt(12 * major);
};

/** A mark begun: no pixels yet, its box empty. */
const begun = (code: number, w: number, h: number): Gathered => ({
  code,
  n: 0,
  sx: 0,
  sy: 0,
  sxx: 0,
  syy: 0,
  sxy: 0,
  x0: w,
  y0: h,
  x1: -1,
  y1: -1,
});

/** The pixel (`x`, `y`) added to the mark `g`: its count, moments and box. */
const add = (g: Gathered, x: number, y: number): void => {
  g.n++;
  g.sx += x;
  g.sy += y;
  g.sxx += x * x;
  g.syy += y * y;
  g.sxy += x * y;
  g.x0 = Math.min(g.x0, x);
  g.y0 = Math.min(g.y0, y);
  g.x1 = Math.max(g.x1, x);
  g.y1 = Math.max(g.y1, y);
};

/** The mark of `kinds`' class at `start`: its 8-connected run, each pixel marked `seen`. */
const grow = (
  kinds: Uint8Array,
  w: number,
  h: number,
  start: number,
  seen: Uint8Array,
  stack: Int32Array,
): Gathered => {
  const code = kinds[start]!;
  const g = begun(code, w, h);
  let top = 0;
  stack[top++] = start;
  seen[start] = 1;
  while (top > 0) {
    const i = stack[--top]!;
    const [x, y] = [i % w, Math.floor(i / w)];
    add(g, x, y);
    for (let ny = Math.max(0, y - 1); ny <= Math.min(h - 1, y + 1); ny++)
      for (let nx = Math.max(0, x - 1); nx <= Math.min(w - 1, x + 1); nx++) {
        const j = ny * w + nx;
        if (seen[j] === 1 || kinds[j] !== code) continue;
        seen[j] = 1;
        stack[top++] = j;
      }
  }
  return g;
};

/** The marks of each class: 8-connected runs of one class's pixels. */
const gather = (px: HeadPixels, kinds: Uint8Array): ReadonlyArray<Gathered> => {
  const { width: w, height: h } = px.raster;
  const seen = new Uint8Array(w * h);
  const stack = new Int32Array(w * h);
  const marks: Array<Gathered> = [];
  for (let start = 0; start < w * h; start++)
    if (kinds[start] !== 0 && seen[start] === 0) marks.push(grow(kinds, w, h, start, seen, stack));
  return marks;
};

const KINDS_BY_CODE: ReadonlyArray<ArtifactKind> = ['seam', 'seam', 'sliver', 'weather'];

/**
 * The head's artifacts: each thin line of a third colour inside its outline,
 * `MARK_SHORTEST` lines long or longer, weather only over the face (rain
 * across a headcloth or a robe is the weather's own).
 */
export const headArtifacts = (px: HeadPixels): ReadonlyArray<ArtifactMark> =>
  gather(px, classify(px)).flatMap((g): ReadonlyArray<ArtifactMark> => {
    const kind = KINDS_BY_CODE[g.code]!;
    const length = lengthOf(g);
    const [cx, cy] = [g.sx / g.n, g.sy / g.n];
    const { face } = px;
    const offFace = cx < face.x0 || cx > face.x1 || cy < face.y0 || cy > face.y1;
    if (length < MARK_SHORTEST * px.line || (kind === 'weather' && offFace)) return [];
    return [{ kind, box: [g.x0, g.y0, g.x1 + 1, g.y1 + 1], length }];
  });
