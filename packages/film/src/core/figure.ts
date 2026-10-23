// A figure measured from its pixels (`film lab match`): one figure's crop, a
// painted concept or a rig drawn alone, read as the house look draws a
// figure (DIRECTION's K1: flat paper shapes inside one thick warm dark ink
// line, three-mark faces, circle hands) and turned into proportions, each a
// share of the head's outer width (the face's marks, of the eye spacing), so
// a concept and a scene compare whatever their sizes. Pure: RGBA in, numbers
// out.
//
// How it reads a crop:
//
// - The ink is the crop's commonest dark warm colour; a pixel near it, or a
//   dark warm brown within reach of it, is ink. A dark fill (hair, however
//   far its brown lies from the ink) is told from a line by its thickness:
//   what an opening wider than the line keeps is a mass, a fill, and the
//   dark joined to it that is not the ink's own colour is its paper too.
// - Regions are the fills the ink closes (the ink thickened a little first,
//   so a soft spot in a line leaks nothing); a mass is a region of its own,
//   so the line beside dark hair, which is the hair's mass, still closes.
// - The face is the region round the two eyes (a pair of small upright ink
//   ovals on one row, the face either side of them); the head is the face
//   and the hair regions joined to it across one line above the eyes (dark
//   hair round the face, and a lit band painted on it, among them), and its
//   outline: its sides are the silhouette ink's outer edge, never a part's
//   lit value. Hair that blends into the face is the face's own region.
// - The body is the fill most of the band under the chin is: a fill here is
//   what the ink closes and no sharp step of colour splits (a shade's edge
//   steps less than a robe against what it is drawn on), so a table painted
//   across a robe with no line of its own still parts from it. A row of the
//   body is measured where ink closes it at both ends, else it is hidden
//   there. Past a thing drawn across it, the fills below as wide as it and of
//   its colours are the body again.
// - The hem is the lowest row of the body whose bottom line ends near the
//   body's sides (a hand may sit there); a line running on past them is a
//   bench the figure stands behind. The feet are the ink under the hem.
// - An inner rim is a light band just inside the edge of a part of the head
//   (an ear, the hair, the face round them) where that edge is not the
//   figure's silhouette: each band pixel against the part's own fill a band
//   deeper, near it, so a shade across the part does not read as a rim.
// - Hands are round regions beside the body.
// - Shading is a part's fill split in two by colour: the lit and shaded
//   halves' hue, saturation and value, the edge between them (across the
//   line joining their centres), and whether the shade is a colour (its hue
//   moved, or its saturation kept) or a darkening toward grey.
//
// A concept is painted: its numbers are guidance, never a gate. A ratio the
// crop does not show (a hem behind a bench) is left out, and `missing` says
// why.

import { Option, Result, Schema } from 'effect';
import type { Raster } from './raster.ts';
import { ArtifactMark, headArtifacts } from './render-artifacts.ts';

// ---------------------------------------------------------------------------
// What a measure answers

/** A colour as hue (degrees, 0–360), saturation and value (0–1). */
const Hsv = Schema.Struct({
  hue: Schema.Finite,
  saturation: Schema.Finite,
  value: Schema.Finite,
});
type Hsv = typeof Hsv.Type;

/**
 * A part's shading: its lit and shaded fills, the angle of the edge between
 * them (degrees from horizontal, 0–180, rising to the right under 90), and
 * whether the shade is a colour (its hue moved, or its saturation kept) or a
 * darkening toward grey.
 */
export const Shading = Schema.Struct({
  lit: Hsv,
  shade: Hsv,
  edge: Schema.Finite,
  kind: Schema.Literals(['colour', 'grey']),
});
export type Shading = typeof Shading.Type;

/**
 * Each proportion a figure is measured by, each a share of the head's outer
 * width, but `headHeight` (the head's height, with its hair, over its width),
 * `heightInHeads` (the figure's height in head heights) and the face's marks
 * (`FACE_MARKS`), each a share of the eye spacing.
 */
export const RATIOS = [
  'headHeight',
  'outline',
  'jaw',
  'bodyUnderChin',
  'body35',
  'body70',
  'hem',
  'heightInHeads',
  'hand',
  'eyeWidth',
  'eyeHeight',
  'eyeSpacing',
  'eyeBelowCentre',
  'browLength',
  'browAbove',
  'mouthWidth',
  'mouthBelowCentre',
  'feetWidth',
  'feetHeight',
  'interiorInk',
  'innerRim',
] as const;
export type Ratio = (typeof RATIOS)[number];

/**
 * The ratios read against the eye spacing (centre to centre), the traced
 * marks' own measure: the outer width holds the outline's ink, so a heavier
 * line (27 px on RBF's Christ against his concept's 16) widens it about 9%
 * and would shrink every mark by as much on a face drawn the same.
 */
const FACE_MARKS: ReadonlySet<Ratio> = new Set([
  'eyeWidth',
  'eyeHeight',
  'browLength',
  'browAbove',
  'mouthWidth',
]);

/** What each ratio is, as a table names it. */
export const RATIO_LABELS: Readonly<Record<Ratio, string>> = {
  headHeight: 'head height (with hair) / width',
  outline: 'outline width',
  jaw: 'jaw width, 0.2 above the chin',
  bodyUnderChin: 'body width, 0.1 under the chin',
  body35: 'body width, 0.35 under the chin',
  body70: 'body width, 0.7 under the chin',
  hem: 'body width at the hem',
  heightInHeads: 'height in head heights',
  hand: 'hand diameter',
  feetWidth: 'feet, their whole width',
  feetHeight: "feet, their height under the body's lowest row",
  eyeWidth: 'eye width / eye spacing',
  eyeHeight: 'eye height / eye spacing',
  eyeSpacing: 'eye spacing, centre to centre',
  eyeBelowCentre: 'eye centre below head centre',
  browLength: 'brow length / eye spacing',
  browAbove: "brow's top above eye centre / eye spacing",
  mouthWidth: 'mouth width / eye spacing',
  mouthBelowCentre: 'mouth below head centre',
  interiorInk: 'ink on the hair/skin edge, its length',
  innerRim: "light rim inside an inner part's edge (an ear, the hair), its length",
};

/** A ratio and its value. */
const Measured = Schema.Struct({ ratio: Schema.Literals(RATIOS), value: Schema.Finite });
type Measured = typeof Measured.Type;

/** A ratio a crop does not show, and why. */
const Unmeasured = Schema.Struct({ ratio: Schema.Literals(RATIOS), why: Schema.String });
type Unmeasured = typeof Unmeasured.Type;

/** A box in a crop's pixels: left, top, right, bottom. */
export const PixelBox = Schema.Tuple([Schema.Finite, Schema.Finite, Schema.Finite, Schema.Finite]);
export type PixelBox = typeof PixelBox.Type;

/** How many radii a head's outline is read at, evenly round from straight up, clockwise. */
export const HEAD_RADII = 72;

/** A row of the body's outline: its height and its two sides, each a share of the head's width from the head's centre (x right, y down). */
const BodyEdge = Schema.Struct({
  y: Schema.Finite,
  left: Schema.Finite,
  right: Schema.Finite,
});
type BodyEdge = typeof BodyEdge.Type;

/**
 * A figure's outline, each length a share of the head's outer width from the
 * head's centre, so two figures' outlines lie one over the other whatever
 * their sizes: the head's outer radius at each of `HEAD_RADII` angles, the
 * body's sides at rows a twentieth of a head apart (the rows ink closes at
 * both ends), and the feet's box when they show.
 */
export const FigureSilhouette = Schema.Struct({
  head: Schema.Array(Schema.Finite),
  body: Schema.Array(BodyEdge),
  feet: Schema.optionalKey(PixelBox),
});
export type FigureSilhouette = typeof FigureSilhouette.Type;

/** A figure measured: its head's outer box, its ink, each ratio it shows, its outline, its shading, and each ratio it does not show. */
/**
 * A mouth open (a filled shape, its stroke over 0.8 of the head's line: a
 * shout's is about 1.5) or closed (a line, about 0.4 of it).
 */
const MouthPose = Schema.Literals(['open', 'closed']);
type MouthPose = typeof MouthPose.Type;
const MOUTH_OPEN = 0.8;

/**
 * Which way a head faces, read from its marks inside its outline: `turn`,
 * how far the eyes' midpoint sits from the middle of the face's opening on
 * the cheek row just under them, as a share of that opening (0 a front face,
 * + turned to the viewer's right); `roll`, the eye line's slope in degrees
 * (+ the right eye lower); and `eyes`, the eyes' spacing in pixels, which
 * says how finely the roll was read.
 */
const Facing = Schema.Struct({
  turn: Schema.Finite,
  roll: Schema.Finite,
  eyes: Schema.Finite,
});
type Facing = typeof Facing.Type;

/**
 * Where the hair meets the beard (`hairBeardOf`): each part's fill (its
 * median colour) and `edge`, the darkest band between the beard and the fill
 * past it, as a value drop under the darker side (left out where no row of
 * the beard meets fill past it). The house parts them by a dark band or by
 * tone (owner, 2026-10-18: "Jesus's render confuses parts of his hair with
 * his beard, look more closely to the concept").
 */
const HairBeard = Schema.Struct({
  hair: Hsv,
  beard: Hsv,
  edge: Schema.optionalKey(Schema.Finite),
});
export type HairBeard = typeof HairBeard.Type;

export const FigureMeasure = Schema.Struct({
  head: PixelBox,
  ink: Schema.Tuple([Schema.Int, Schema.Int, Schema.Int]),
  ratios: Schema.Array(Measured),
  silhouette: FigureSilhouette,
  headShading: Schema.optionalKey(Shading),
  bodyShading: Schema.optionalKey(Shading),
  /** The face's pose as its mouth shows it: open (a shout) or closed (a line); left out with no mouth. */
  mouth: Schema.optionalKey(MouthPose),
  /** Which way the head faces (`Facing`). */
  facing: Facing,
  /** `open` when the face runs on into the neck with no line at the chin: the head is read down to where the neck starts (left out when a line closes the chin). */
  chin: Schema.optionalKey(Schema.Literal('open')),
  /** The head's render artifacts (`render-artifacts.ts`): thin lines of a third colour inside its outline. */
  artifacts: Schema.Array(ArtifactMark),
  /** Where the hair meets the beard (`HairBeard`); left out with no beard. */
  hairBeard: Schema.optionalKey(HairBeard),
  missing: Schema.Array(Unmeasured),
});
export type FigureMeasure = typeof FigureMeasure.Type;

/** A crop in which no figure reads: no ink, no eyes, or a head whose line is open. */
class FigureUnread extends Schema.TaggedError<FigureUnread>()('FigureUnread', {
  reason: Schema.String,
}) {
  override get message() {
    return `no figure reads in the crop: ${this.reason}`;
  }
}

// ---------------------------------------------------------------------------
// Colour

type Rgb = readonly [number, number, number];

const rgbAt = (r: Raster, i: number): Rgb => [
  r.rgba[i * 4] ?? 0,
  r.rgba[i * 4 + 1] ?? 0,
  r.rgba[i * 4 + 2] ?? 0,
];

const dist = (a: Rgb, b: Rgb): number => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);

/** The square of `dist`. */
const distSq = (a: Rgb, b: Rgb): number => {
  const dr = a[0] - b[0];
  const dg = a[1] - b[1];
  const db = a[2] - b[2];
  return dr * dr + dg * dg + db * db;
};

/** The square of `dist` between pixel `i` of `r` and `c`, read off the bytes. */
const distSqAt = (r: Raster, i: number, c: Rgb): number => {
  const dr = r.rgba[i * 4]! - c[0];
  const dg = r.rgba[i * 4 + 1]! - c[1];
  const db = r.rgba[i * 4 + 2]! - c[2];
  return dr * dr + dg * dg + db * db;
};

/**
 * Two distances' order (-1, 0 or 1) as their squares tell it, and 0 also
 * where the squares lie too near to tell, so the caller asks `dist` itself:
 * squares a billionth apart are far past `Math.hypot`'s error, so where they
 * tell, they tell as `dist` would.
 */
const orderOfSquares = (a: number, b: number): number => {
  // oxlint-disable-next-line film/one-clock-epsilon -- a colour distance's float band, no time
  if (Math.abs(a - b) <= 1e-9 * Math.max(a, b)) return 0;
  return Math.sign(a - b);
};

/** Whether `dist(a, b) < limit`, on the squares unless they lie too near to tell. */
const closerThan = (a: Rgb, b: Rgb, limit: number): boolean => {
  const order = orderOfSquares(distSq(a, b), limit * limit);
  return order < 0 || (order === 0 && dist(a, b) < limit);
};

/** Whether `dist` from pixel `i` of `r` to `c` is under `limit` (or at it, with `orAt`), on the squares unless they lie too near to tell. */
const closerThanAt = (r: Raster, i: number, c: Rgb, limit: number, orAt = false): boolean => {
  const order = orderOfSquares(distSqAt(r, i, c), limit * limit);
  if (order !== 0) return order < 0;
  const d = dist(rgbAt(r, i), c);
  return d < limit || (orAt && d === limit);
};

const lumaOf = (c: Rgb): number => 0.299 * c[0] + 0.587 * c[1] + 0.114 * c[2];

/** `c` as hue, saturation and value. */
export const hsvOf = (c: Rgb): Hsv => {
  const [r, g, b] = [c[0] / 255, c[1] / 255, c[2] / 255];
  const max = Math.max(r, g, b);
  const d = max - Math.min(r, g, b);
  let hue = 0;
  if (d > 0 && max === r) hue = 60 * (((g - b) / d + 6) % 6);
  else if (d > 0 && max === g) hue = 60 * ((b - r) / d + 2);
  else if (d > 0) hue = 60 * ((r - g) / d + 4);
  return { hue, saturation: max === 0 ? 0 : d / max, value: max };
};

/** Whether every channel of `colours` is a byte, as a pixel's is. */
const allBytes = (colours: ReadonlyArray<Rgb>): boolean =>
  colours.every((c) => c.every((v) => Number.isInteger(v) && v >= 0 && v <= 255));

/** The value at `rank` of one channel of bytes, counted rather than sorted: the same value a sort puts there. */
const byteAtRank = (colours: ReadonlyArray<Rgb>, k: 0 | 1 | 2, rank: number): number => {
  const counts = new Int32Array(256);
  for (const c of colours) counts[c[k]]!++;
  let seen = 0;
  for (let v = 0; v < 256; v++) {
    seen += counts[v]!;
    if (seen > rank) return v;
  }
  return 0;
};

/** The median of each channel: the middle of each channel's sorted values. */
const medianRgb = (colours: ReadonlyArray<Rgb>): Rgb => {
  const rank = Math.floor(colours.length / 2);
  if (allBytes(colours))
    return [
      byteAtRank(colours, 0, rank),
      byteAtRank(colours, 1, rank),
      byteAtRank(colours, 2, rank),
    ];
  const mid = (k: 0 | 1 | 2) => {
    const sorted = colours.map((c) => c[k]).sort((a, b) => a - b);
    return sorted[rank] ?? 0;
  };
  return [mid(0), mid(1), mid(2)];
};

/** `k` centres of `colours` (Lloyd's k-means from seeds spread by luma), each with its share and its spread (the 90th percentile distance of its members), the largest first. */
const clusters = (colours: ReadonlyArray<Rgb>, k: number) => {
  const byLuma = [...colours].sort((a, b) => lumaOf(a) - lumaOf(b));
  let centres: Array<Rgb> = Array.from(
    { length: k },
    (_, j) => byLuma[Math.floor(((j + 0.5) / k) * byLuma.length)] ?? [0, 0, 0],
  );
  let members: Array<Array<Rgb>> = [];
  for (let round = 0; round < 10; round++) {
    members = centres.map(() => []);
    for (const c of colours) {
      let best = 0;
      let nearest = distSq(c, centres[0]!);
      for (let j = 1; j < centres.length; j++) {
        const d = distSq(c, centres[j]!);
        const order = orderOfSquares(d, nearest);
        if (order < 0 || (order === 0 && dist(c, centres[j]!) < dist(c, centres[best]!)))
          [best, nearest] = [j, d];
      }
      members[best]!.push(c);
    }
    centres = members.map((m, j) => (m.length === 0 ? centres[j]! : medianRgb(m)));
  }
  return centres
    .map((centre, j) => {
      const near = (members[j] ?? []).map((c) => dist(c, centre)).sort((a, b) => a - b);
      return {
        centre,
        share: near.length / Math.max(1, colours.length),
        spread: near[Math.floor(near.length * 0.9)] ?? 0,
      };
    })
    .sort((a, b) => b.share - a.share);
};

// ---------------------------------------------------------------------------
// The ink

/** A pixel nearer the ink than this is ink. */
const INK_NEAR = 34;

/**
 * Whether a pixel is a line's lighter streak: a dark saturated warm
 * brown within reach of the ink's colour (a concept's brush varies along a
 * line more than a rig's flat stroke does).
 */
const inkLike = (c: Rgb, ink: Rgb): boolean => {
  if (!closerThan(c, ink, 2.5 * INK_NEAR) || lumaOf(c) >= 100) return false;
  const { hue, saturation } = hsvOf(c);
  return saturation >= 0.5 && hue <= 45;
};

/** The ink: the commonest colour among the crop's dark warm pixels (red well over blue, green not under it: a dark purple robe is no ink), averaged near it. */
const inkOf = (r: Raster): Option.Option<Rgb> => {
  const n = r.width * r.height;
  const bins = new Map<number, number>();
  for (let i = 0; i < n; i++) {
    const c = rgbAt(r, i);
    if (lumaOf(c) >= 60 || c[0] - c[2] < 6 || c[1] < c[2]) continue;
    const key = ((c[0] >> 3) << 10) | ((c[1] >> 3) << 5) | (c[2] >> 3);
    bins.set(key, (bins.get(key) ?? 0) + 1);
  }
  const [best, count] = [...bins].reduce<readonly [number, number]>(
    (top, bin) => (bin[1] > top[1] ? bin : top),
    [-1, 0],
  );
  if (count < 8) return Option.none();
  const centre: Rgb = [
    ((best >> 10) << 3) + 4,
    (((best >> 5) & 31) << 3) + 4,
    ((best & 31) << 3) + 4,
  ];
  const near: Array<Rgb> = [];
  for (let i = 0; i < n; i++) if (closerThanAt(r, i, centre, 14, true)) near.push(rgbAt(r, i));
  const mean = (k: 0 | 1 | 2) => Math.round(near.reduce((s, c) => s + c[k], 0) / near.length);
  return Option.some([mean(0), mean(1), mean(2)]);
};

// ---------------------------------------------------------------------------
// Distance transform: squared Euclidean (Felzenszwalb and Huttenlocher)

const FAR = 1e20;

const edt1 = (f: Float64Array, n: number, d: Float64Array, v: Int32Array, z: Float64Array) => {
  let k = 0;
  v[0] = 0;
  z[0] = -FAR;
  z[1] = FAR;
  const cross = (q: number, p: number) => (f[q]! + q * q - (f[p]! + p * p)) / (2 * q - 2 * p);
  for (let q = 1; q < n; q++) {
    let s = cross(q, v[k]!);
    while (s <= z[k]!) {
      k--;
      s = cross(q, v[k]!);
    }
    k++;
    v[k] = q;
    z[k] = s;
    z[k + 1] = FAR;
  }
  k = 0;
  for (let q = 0; q < n; q++) {
    while (z[k + 1]! < q) k++;
    d[q] = (q - v[k]!) * (q - v[k]!) + f[v[k]!]!;
  }
};

/**
 * The first pass down column `x` of a field of seeds (0) and the rest (FAR):
 * each pixel's squared distance to the nearest seed in its column, found by
 * a walk down and a walk up, which is what the lower envelope gives on it.
 * A column with no seed is left as it is (false), for the envelope.
 */
const columnFromSeeds = (out: Float64Array, w: number, h: number, x: number): boolean => {
  let last = -1;
  for (let y = 0; y < h; y++) {
    const i = y * w + x;
    if (out[i] === 0) last = y;
    else if (last >= 0) out[i] = (y - last) * (y - last);
  }
  if (last < 0) return false;
  let next = -1;
  for (let y = h - 1; y >= 0; y--) {
    const i = y * w + x;
    if (out[i] === 0) next = y;
    else if (next >= 0 && (next - y) * (next - y) < out[i]!) out[i] = (next - y) * (next - y);
  }
  return true;
};

/** Each pixel's squared distance to the nearest pixel where `seed` holds. */
const distanceTo = (w: number, h: number, seed: (i: number) => boolean): Float64Array => {
  const out = new Float64Array(w * h);
  for (let i = 0; i < w * h; i++) out[i] = seed(i) ? 0 : FAR;
  const m = Math.max(w, h);
  const [f, d, v, z] = [
    new Float64Array(m),
    new Float64Array(m),
    new Int32Array(m),
    new Float64Array(m + 1),
  ];
  for (let x = 0; x < w; x++) {
    if (!columnFromSeeds(out, w, h, x)) {
      for (let y = 0; y < h; y++) f[y] = out[y * w + x]!;
      edt1(f, h, d, v, z);
      for (let y = 0; y < h; y++) out[y * w + x] = d[y]!;
    }
  }
  for (let y = 0; y < h; y++) {
    edt1(out.subarray(y * w, y * w + w), w, d, v, z);
    out.set(d.subarray(0, w), y * w);
  }
  return out;
};

// ---------------------------------------------------------------------------
// Components

/** A connected component: its id, pixel count, bounding box, and whether it touches the crop's edge. */
interface Part {
  readonly id: number;
  area: number;
  x0: number;
  y0: number;
  x1: number;
  y1: number;
  border: boolean;
}

interface Labelled {
  /** Each pixel's part, -1 for none. */
  readonly labels: Int32Array;
  readonly parts: ReadonlyArray<Part>;
}

/** The steps to a pixel's neighbours, in the order a flood tries them: four ways, then the diagonals. */
const STEPS_FOUR = { dx: Int32Array.of(1, -1, 0, 0), dy: Int32Array.of(0, 0, 1, -1) };
const STEPS_EIGHT = {
  dx: Int32Array.of(1, -1, 0, 0, 1, 1, -1, -1),
  dy: Int32Array.of(0, 0, 1, -1, 1, -1, 1, -1),
};

/** Every step joins: a part is all its pixels `inside`. */
const ALWAYS = () => true;

/**
 * Floods `part` from `start`: each step to a neighbour unlabelled and
 * `admit`ted takes that neighbour, counted into the part's area, its box and
 * whether it is on the crop's edge. The steps are `dx` and `dy`, tried in
 * their order.
 */
const flood = (
  start: number,
  part: Part,
  size: readonly [number, number],
  steps: { readonly dx: Int32Array; readonly dy: Int32Array },
  admit: (i: number, j: number) => boolean,
  labels: Int32Array,
  stack: Int32Array,
) => {
  const [w, h] = size;
  const { dx, dy } = steps;
  const id = part.id;
  let { area, x0, y0, x1, y1, border } = part;
  let top = 0;
  stack[top++] = start;
  labels[start] = id;
  while (top > 0) {
    const i = stack[--top]!;
    const x = i % w;
    const y = (i - x) / w;
    area++;
    x0 = Math.min(x0, x);
    x1 = Math.max(x1, x);
    y0 = Math.min(y0, y);
    y1 = Math.max(y1, y);
    if (x === 0 || y === 0 || x === w - 1 || y === h - 1) border = true;
    for (let s = 0; s < dx.length; s++) {
      const nx = x + dx[s]!;
      const ny = y + dy[s]!;
      if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
      const j = ny * w + nx;
      if (labels[j] !== -1 || !admit(i, j)) continue;
      labels[j] = id;
      stack[top++] = j;
    }
  }
  Object.assign(part, { area, x0, y0, x1, y1, border });
};

/** The components of the pixels where `inside` holds, 4- or 8-connected, each step between neighbours where `joins` holds. */
const label = (
  w: number,
  h: number,
  inside: (i: number) => boolean,
  eight: boolean,
  joins: (i: number, j: number) => boolean = ALWAYS,
): Labelled => {
  const labels = new Int32Array(w * h).fill(-1);
  const parts: Array<Part> = [];
  const stack = new Int32Array(w * h);
  const steps = eight ? STEPS_EIGHT : STEPS_FOUR;
  const admit =
    (joins === ALWAYS && ((_i: number, j: number) => inside(j))) ||
    ((i: number, j: number) => inside(j) && joins(i, j));
  for (let start = 0; start < w * h; start++) {
    if (labels[start] !== -1 || !inside(start)) continue;
    const part: Part = { id: parts.length, area: 0, x0: w, y0: h, x1: -1, y1: -1, border: false };
    parts.push(part);
    flood(start, part, [w, h], steps, admit, labels, stack);
  }
  return { labels, parts };
};

const widthOf = (p: Part) => p.x1 - p.x0 + 1;
const heightOf = (p: Part) => p.y1 - p.y0 + 1;
const cxOf = (p: Part) => (p.x0 + p.x1) / 2;
const cyOf = (p: Part) => (p.y0 + p.y1) / 2;

// ---------------------------------------------------------------------------
// A crop read: its ink, its masses, its regions and its marks

interface Read {
  readonly r: Raster;
  readonly w: number;
  readonly h: number;
  readonly inkColour: Rgb;
  /** 1 where ink (a line or a mark, never a mass). */
  readonly ink: Uint8Array;
  /** 1 where a mass: a fill as dark as the ink. */
  readonly mass: Uint8Array;
  /** The line's width in whole pixels (`outlineOf` reads the head's finer). */
  readonly line: number;
  /** How far the ink is thickened before the regions are cut, so a soft spot in a line leaks nothing. */
  readonly seal: number;
  readonly regions: Labelled;
  readonly marks: Labelled;
}

/**
 * The line's width, from the length of the ink's runs across each row and
 * down each column, from 3 pixels up (the grain's specks are shorter). Each
 * length is weighed by its ink, with its neighbours a pixel either side (so
 * a line whose width falls between two whole pixels counts once), and the
 * line is the longest peak, no longer than a twelfth of the crop's shorter
 * side, that holds at least half the ink the heaviest such peak does, at the
 * mean of its three lengths by their ink. The longest, because
 * a figure's line is the thickest a frame draws again and again: a rail's
 * or a bench's many thin lines across the crop can hold more ink than the
 * figure's outline, and a mark or a mass spreads its runs over many lengths,
 * so it makes no peak.
 */
const lineWidthOf = (ink: Uint8Array, w: number, h: number): number => {
  const counts = new Map<number, number>();
  const run = (length: number) => {
    if (length >= 3) counts.set(length, (counts.get(length) ?? 0) + 1);
  };
  for (let y = 0; y < h; y++) {
    let length = 0;
    for (let x = 0; x < w; x++) {
      if (ink[y * w + x] === 1) length++;
      else {
        run(length);
        length = 0;
      }
    }
    run(length);
  }
  for (let x = 0; x < w; x++) {
    let length = 0;
    for (let y = 0; y < h; y++) {
      if (ink[y * w + x] === 1) length++;
      else {
        run(length);
        length = 0;
      }
    }
    run(length);
  }
  const inkOfRuns = (length: number) => length * (counts.get(length) ?? 0);
  const around = (k: number) => [k - 1, k, k + 1];
  const weigh = (k: number) => around(k).reduce((sum, j) => sum + inkOfRuns(j), 0);
  // A line is thin against the crop: a twelfth of its shorter side at most (a band of dark across the crop runs longer).
  const most = Math.min(w, h) / 12;
  const heaviest = Math.max(0, ...[...counts.keys()].filter((k) => k <= most).map(weigh));
  const peak = (k: number) => k <= most && weigh(k) >= weigh(k - 1) && weigh(k) >= weigh(k + 1);
  const peaks = [...counts.keys()].filter((k) => peak(k) && weigh(k) >= heaviest / 2);
  const mode = Math.max(3, ...peaks);
  return Math.round(
    around(mode).reduce((sum, j) => sum + j * inkOfRuns(j), 0) / Math.max(1, weigh(mode)),
  );
};

const readCrop = (r: Raster): Option.Option<Read> =>
  Option.map(inkOf(r), (inkColour) => {
    const { width: w, height: h } = r;
    const n = w * h;
    // Ink proper (near its colour, and no bluer than green: a dark purple robe's shade is no line) gives the line's width and the masses; a line's lighter streaks join it after.
    const strong = new Uint8Array(n);
    const near = new Uint8Array(n);
    for (let i = 0; i < n; i++) {
      const c = rgbAt(r, i);
      strong[i] = closerThan(c, inkColour, INK_NEAR) && c[2] <= c[1] + 6 ? 1 : 0;
      near[i] = strong[i] === 1 || inkLike(c, inkColour) ? 1 : 0;
    }
    const line = lineWidthOf(strong, w, h);
    const half = line / 2;
    // A mass: what an opening wider than the line keeps of the dark, the ink's colour or its streaks. A part is classed by its paper: dark hair a lit band lies on is a fill, never a line, however far its brown lies from the ink.
    const depth = distanceTo(w, h, (i) => near[i] === 0);
    const reach = half * 1.8 + 1;
    const fromCore = distanceTo(w, h, (i) => depth[i]! > reach * reach);
    const cored = (i: number) => near[i] === 1 && fromCore[i]! <= reach * reach;
    // The fill's narrow runs (a strip of hair between the face and the outline, narrower than the opening) are its paper too: what joins a mass through dark that is not the ink's own colour.
    const mass = reachFrom(w, h, cored, (j) => near[j] === 1 && strong[j] === 0);
    const ink = new Uint8Array(n);
    for (let i = 0; i < n; i++) ink[i] = near[i] === 1 && mass[i] === 0 ? 1 : 0;
    const seal = Math.max(1, Math.round(half * 0.4));
    const sealed = distanceTo(w, h, (i) => ink[i] === 1);
    // A mass is a region of its own: where it meets a fill or the ground with no ink between (the line beside dark hair is the hair's), it bars them as a line would.
    const regions = label(
      w,
      h,
      (i) => sealed[i]! > seal * seal,
      false,
      (i, j) => mass[i] === mass[j],
    );
    const marks = label(w, h, (i) => ink[i] === 1, true);
    return { r, w, h, inkColour, ink, mass, line, seal, regions, marks };
  });

/** The region at (x, y), or the nearest one within `reach` pixels along its row or column. */
const regionNear = (read: Read, x: number, y: number, reach: number): Option.Option<Part> => {
  const { w, h, regions } = read;
  for (let d = 0; d <= reach; d++)
    for (const [dx, dy] of [
      [0, d],
      [0, -d],
      [d, 0],
      [-d, 0],
    ] as const) {
      const [nx, ny] = [Math.round(x + dx), Math.round(y + dy)];
      if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
      const id = regions.labels[ny * w + nx]!;
      if (id >= 0) return Option.fromUndefinedOr(regions.parts[id]);
    }
  return Option.none();
};

const STEPS = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
] as const;

/** The first region other than `of` within `span` pixels of (`x`, `y`) in the step (`dx`, `dy`), -1 for none. */
const regionAcross = (
  read: Read,
  of: Part,
  from: readonly [number, number],
  step: readonly [number, number],
  span: number,
): number => {
  const { w, h, regions } = read;
  for (let k = 1; k <= span; k++) {
    const [nx, ny] = [from[0] + step[0] * k, from[1] + step[1] * k];
    if (nx < 0 || ny < 0 || nx >= w || ny >= h) return -1;
    const id = regions.labels[ny * w + nx]!;
    if (id === of.id) return -1;
    if (id >= 0) return id;
  }
  return -1;
};

/** The regions across at most `span` pixels of no region from region `of`'s edge, stepping out four ways. */
const neighbours = (read: Read, of: Part, span: number): ReadonlySet<number> => {
  const found = new Set<number>();
  for (let y = of.y0; y <= of.y1; y++)
    for (let x = of.x0; x <= of.x1; x++) {
      if (read.regions.labels[y * read.w + x] !== of.id) continue;
      for (const step of STEPS) {
        const id = regionAcross(read, of, [x, y], step, span);
        if (id >= 0) found.add(id);
      }
    }
  return found;
};

/** The share of region `p`'s pixels that are a mass (a fill as dark as the ink). */
const massShare = (read: Read, p: Part): number => {
  let [count, all] = [0, 0];
  for (let y = p.y0; y <= p.y1; y++)
    for (let x = p.x0; x <= p.x1; x++) {
      const i = y * read.w + x;
      if (read.regions.labels[i] !== p.id) continue;
      all++;
      if (read.mass[i] === 1) count++;
    }
  return count / Math.max(1, all);
};

/**
 * How much ink lies along a line of pixels, in pixels: each pixel's share of
 * ink, 0 at the fill `beside` and 1 at the ink's own colour, summed. A soft
 * edge counts by its share, so a mark a few pixels across reads to a fraction
 * of one.
 */
const coverage = (read: Read, points: ReadonlyArray<readonly [number, number]>, beside: Rgb) => {
  const far = Math.max(12, dist(beside, read.inkColour));
  let sum = 0;
  for (const [x, y] of points) {
    const at = Math.min(read.h - 1, Math.max(0, y)) * read.w + Math.min(read.w - 1, Math.max(0, x));
    sum += Math.min(1, Math.max(0, (far - dist(rgbAt(read.r, at), read.inkColour)) / (far - 10)));
  }
  return sum;
};

/** A mark's width and height in pixels through its centre, by coverage against the fill to its left. */
const markSize = (read: Read, p: Part) => {
  const [cx, cy] = [Math.round(cxOf(p)), Math.round(cyOf(p))];
  const beside = rgbAt(read.r, cy * read.w + Math.max(0, p.x0 - 3));
  const across = Array.from({ length: widthOf(p) + 4 }, (_, k) => [p.x0 - 2 + k, cy] as const);
  const down = Array.from({ length: heightOf(p) + 4 }, (_, k) => [cx, p.y0 - 2 + k] as const);
  return { width: coverage(read, across, beside), height: coverage(read, down, beside) };
};

/** Mark `p`'s pixels. */
const pixelsOfMark = (read: Read, marks: Labelled, p: Part): Array<readonly [number, number]> => {
  const out: Array<readonly [number, number]> = [];
  for (let y = p.y0; y <= p.y1; y++)
    for (let x = p.x0; x <= p.x1; x++) if (marks.labels[y * read.w + x] === p.id) out.push([x, y]);
  return out;
};

/**
 * The face's marks: what is darker than halfway from the face's fill to the
 * ink, inside the head's box (a brow painted soft is lighter than the ink).
 */
const faceMarks = (read: Read, face: Part, box: PixelBox): Labelled => {
  const fill: Array<Rgb> = [];
  for (let y = face.y0; y <= face.y1; y += 2)
    for (let x = face.x0; x <= face.x1; x += 2)
      if (read.regions.labels[y * read.w + x] === face.id) fill.push(rgbAt(read.r, y * read.w + x));
  const cut = (lumaOf(medianRgb(fill)) + lumaOf(read.inkColour)) / 2;
  const [x0, y0, x1, y1] = box;
  return label(
    read.w,
    read.h,
    (i) => {
      const x = i % read.w;
      const y = (i - x) / read.w;
      return x >= x0 && x <= x1 && y >= y0 && y <= y1 && lumaOf(rgbAt(read.r, i)) < cut;
    },
    true,
  );
};

/** A stroke's length: its pixels' extent along their long axis. */
const axisLength = (read: Read, marks: Labelled, p: Part): number => {
  const points = pixelsOfMark(read, marks, p);
  const [mx, my] = [
    points.reduce((s, [x]) => s + x, 0) / points.length,
    points.reduce((s, [, y]) => s + y, 0) / points.length,
  ];
  let [xx, yy, xy] = [0, 0, 0];
  for (const [x, y] of points)
    [xx, yy, xy] = [xx + (x - mx) ** 2, yy + (y - my) ** 2, xy + (x - mx) * (y - my)];
  const angle = Math.atan2(2 * xy, xx - yy) / 2;
  const along = points.map(([x, y]) => (x - mx) * Math.cos(angle) + (y - my) * Math.sin(angle));
  return Math.max(...along) - Math.min(...along) + 1;
};

/** A stroke's thickness: its area over its length. */
const strokeOf = (read: Read, marks: Labelled, p: Part): number =>
  p.area / axisLength(read, marks, p);

/**
 * The line's width by coverage on the ray from (cx, cy) at `base` + `turn`
 * degrees, where it leaves the face: each half against the fill on its side,
 * none when the ray meets no line inside the crop.
 */
const rayWidth = (
  read: Read,
  centre: readonly [number, number],
  face: Part,
  base: number,
  turn: number,
): Option.Option<number> => {
  const a = ((base + turn) * Math.PI) / 180;
  const [dx, dy] = [Math.cos(a), Math.sin(a)];
  const along = (t: number) =>
    [Math.round(centre[0] + dx * t), Math.round(centre[1] + dy * t)] as const;
  const inCrop = ([x, y]: readonly [number, number]) =>
    x >= 0 && y >= 0 && x < read.w && y < read.h;
  // The last stretch of ink after the face's last pixel on this ray.
  let [start, end] = [-1, -1];
  for (let t = 0; inCrop(along(t)); t++) {
    const [x, y] = along(t);
    const i = y * read.w + x;
    if (read.regions.labels[i] === face.id) [start, end] = [-1, -1];
    else if (read.ink[i] === 1 && end < 0) start = start < 0 ? t : start;
    else if (start >= 0 && end < 0) end = t;
  }
  if (start < 0 || end < 0 || !inCrop(along(end + 3))) return Option.none();
  const [ix, iy] = along(start - 3);
  const [ox, oy] = along(end + 3);
  const insideFill = rgbAt(read.r, iy * read.w + ix);
  const outsideFill = rgbAt(read.r, oy * read.w + ox);
  const middle = Math.round((start + end) / 2);
  const inner = Array.from({ length: middle - (start - 2) }, (_, k) => along(start - 2 + k));
  const outer = Array.from({ length: end + 2 - middle }, (_, k) => along(middle + k));
  // A ray off the normal crosses the line long: near a head's sides and bottom the normal runs along the ray.
  return Option.some(
    (coverage(read, inner, insideFill) + coverage(read, outer, outsideFill)) *
      Math.cos((turn * Math.PI) / 180),
  );
};

/**
 * The outline's width in pixels, by coverage, where the face's line meets
 * the rays from (cx, cy) to the left, the right and below (and 20° either
 * side of each): the median.
 */
const outlineOf = (read: Read, cx: number, cy: number, face: Part): number => {
  const widths = [0, 90, 180]
    .flatMap((base) => [-20, 0, 20].map((turn) => rayWidth(read, [cx, cy], face, base, turn)))
    .flatMap(Option.toArray)
    .sort((a, b) => a - b);
  return widths[Math.floor(widths.length / 2)] ?? read.line;
};

// ---------------------------------------------------------------------------
// The face

/** Whether ink part `p` reads as an eye: small, upright and filled. */
const eyeLike = (p: Part) => {
  const aspect = heightOf(p) / widthOf(p);
  return aspect >= 1.1 && aspect <= 3.6 && p.area >= 0.5 * widthOf(p) * heightOf(p) && p.area >= 6;
};

/** The two eyes and the region round them: the largest pair of eye marks on one row with one region between them and either side of them. */
const eyesOf = (read: Read, marks: ReadonlyArray<Part>) => {
  const eyes = marks.filter(eyeLike);
  let best = Option.none<{ readonly eyes: readonly [Part, Part]; readonly face: Part }>();
  let score = 0;
  for (let i = 0; i < eyes.length; i++)
    for (let j = i + 1; j < eyes.length; j++) {
      const [a, b] = cxOf(eyes[i]!) < cxOf(eyes[j]!) ? [eyes[i]!, eyes[j]!] : [eyes[j]!, eyes[i]!];
      const dx = cxOf(b) - cxOf(a);
      if (Math.max(a.area, b.area) > 2 * Math.min(a.area, b.area)) continue;
      if (Math.abs(cyOf(a) - cyOf(b)) > 0.5 * Math.max(heightOf(a), heightOf(b))) continue;
      if (dx < 1.5 * widthOf(a) || dx > 12 * widthOf(a) || a.area + b.area <= score) continue;
      const between = regionNear(read, (cxOf(a) + cxOf(b)) / 2, (cyOf(a) + cyOf(b)) / 2, 4);
      // The face lies either side of the pair: an ear's line beside the face, between it and the ear, is no eye.
      const left = regionNear(read, a.x0 - read.seal - 2, cyOf(a), 4);
      const right = regionNear(read, b.x1 + read.seal + 2, cyOf(b), 4);
      const face = Option.map(between, (p) => p.id);
      if (
        Option.isNone(face) ||
        [left, right].some((side) => Option.isNone(side) || side.value.id !== face.value)
      )
        continue;
      score = a.area + b.area;
      best = Option.some({ eyes: [a, b] as const, face: read.regions.parts[face.value]! });
    }
  return best;
};

// ---------------------------------------------------------------------------
// An open chin

/**
 * A neck against the face under the eyes: narrower than `NECK_NARROW` of it,
 * never a sliver under `NECK_LEAST` of it (a cheek's last pixels beside a
 * beard), with shoulders under it at least as wide as the face.
 */
const NECK_NARROW = 0.8;
const NECK_LEAST = 0.15;
/** A row's width within this share over the neck's narrowest is the neck: its first such row is where the chin ends. */
const NECK_EVEN = 1.15;

/** Where an open chin ends (its row), a pixel of the face above it, and a plug across the neck under it that walls the head's outer read off from the neck. */
interface OpenChin {
  readonly chin: number;
  readonly seed: number;
  readonly plug: readonly [number, number, number, number];
}

/** Row `y`'s extent of the runs of region `id` that overlap `[x0, x1]`, or none. */
const spanOn = (
  read: Read,
  id: number,
  y: number,
  x0: number,
  x1: number,
): Option.Option<readonly [number, number]> => {
  const { w, regions } = read;
  const of = (x: number) => x >= 0 && x < w && regions.labels[y * w + x] === id;
  let [lo, hi] = [-1, -1];
  for (let x = Math.max(0, x0); x <= Math.min(w - 1, x1); x++) {
    if (!of(x)) continue;
    let [l, r] = [x, x];
    while (of(l - 1)) l--;
    while (of(r + 1)) r++;
    [lo, hi] = [lo < 0 ? l : Math.min(lo, l), Math.max(hi, r)];
    x = r;
  }
  return lo < 0 ? Option.none() : Option.some([lo, hi] as const);
};

/**
 * Where an open chin ends: the face's fill followed down from under the eyes,
 * a row at a time, through the runs joined to the row above, narrows to a
 * neck and widens again to the shoulders, so no line closes the chin. The
 * chin ends at the neck's first row as narrow as the neck. None when the
 * face's fill ends, as a line under the chin ends it, or never narrows to a
 * neck and widens again to the face's width within 1.2 of that width.
 */
const openChinOf = (
  read: Read,
  face: Part,
  eyes: readonly [Part, Part],
): Option.Option<OpenChin> => {
  const [a, b] = eyes;
  const top = Math.ceil(Math.max(a.y1, b.y1) + read.seal + read.line);
  const first = spanOn(read, face.id, top, Math.floor(a.x0), Math.ceil(b.x1));
  if (Option.isNone(first)) return Option.none();
  const across = first.value[1] - first.value[0] + 1;
  const spans: Array<readonly [number, number]> = [];
  let span = first.value;
  for (let y = top; y < read.h && y <= top + 2.5 * across; y++) {
    const next = spanOn(read, face.id, y, span[0], span[1]);
    if (Option.isNone(next)) break;
    span = next.value;
    spans.push(span);
  }
  const widths = spans.map(([lo, hi]) => hi - lo + 1);
  const reach = Math.min(widths.length, Math.ceil(1.2 * across));
  const narrowest = widths.slice(0, reach).reduce((m, v, k) => (v < widths[m]! ? k : m), 0);
  const neck = widths[narrowest] ?? across;
  const widens = widths
    .slice(narrowest, narrowest + Math.ceil(1.2 * across))
    .some((v) => v >= across);
  if (neck >= NECK_NARROW * across || neck < NECK_LEAST * across || !widens) return Option.none();
  let chin = narrowest;
  while (chin > 0 && widths[chin - 1]! <= NECK_EVEN * neck) chin--;
  // The plug spans the neck's fill and the unfilled band between it and the line on either side.
  const [lo, hi] = spans[chin]!;
  const pad = read.line + read.seal;
  return Option.some({
    chin: top + chin,
    seed: top * read.w + first.value[0],
    plug: [lo - pad, top + chin, hi + pad, top + chin + read.line] as const,
  });
};

/**
 * The read with the face cut from the neck at row `chin`: the face's fill
 * above it, flooded from `seed` under the eyes, is a region of its own, and
 * the rest (the neck and what joins it) keeps the face's old region, its box
 * read again.
 */
const cutAtChin = (read: Read, face: Part, seed: number, chin: number) => {
  const { w, h } = read;
  const old = read.regions.labels;
  const labels = Int32Array.from(old, (id) => (id === face.id ? -1 : id));
  const cut: Part = {
    id: read.regions.parts.length,
    area: 0,
    x0: w,
    y0: h,
    x1: -1,
    y1: -1,
    border: false,
  };
  flood(
    seed,
    cut,
    [w, h],
    STEPS_FOUR,
    (_i, j) => j < chin * w && old[j] === face.id,
    labels,
    new Int32Array(w * h),
  );
  const rest: Part = { id: face.id, area: 0, x0: w, y0: h, x1: -1, y1: -1, border: false };
  for (let i = 0; i < labels.length; i++) {
    if (labels[i] !== -1 || old[i] !== face.id) continue;
    labels[i] = face.id;
    const [x, y] = [i % w, Math.floor(i / w)];
    rest.area++;
    rest.x0 = Math.min(rest.x0, x);
    rest.y0 = Math.min(rest.y0, y);
    rest.x1 = Math.max(rest.x1, x);
    rest.y1 = Math.max(rest.y1, y);
    rest.border ||= x === 0 || y === 0 || x === w - 1 || y === h - 1;
  }
  const parts = [...read.regions.parts.map((p) => (p.id === face.id ? rest : p)), cut];
  return { read: { ...read, regions: { labels, parts } }, face: cut };
};

// ---------------------------------------------------------------------------
// Shading

interface Pixel {
  readonly c: Rgb;
  readonly x: number;
  readonly y: number;
}

/** How far a shade's hue turned from its lit fill's, in degrees (0–180). */
const hueTurn = (lit: Hsv, shade: Hsv): number =>
  Math.abs(((shade.hue - lit.hue + 540) % 360) - 180);

/**
 * The least chroma (the spread of a colour's channels, 0..1) at which one
 * 8-bit step of a channel turns its hue by no more than the 15° a shade's
 * turn is judged by (a hue moves 60° across the whole spread, so 4/255).
 * Under it a colour has no hue (a grey, black), and its hue reads nothing.
 */
const HUED = 4 / 255;

/** Whether `c` has a hue to turn: its chroma at least `HUED`. */
const hued = (c: Hsv): boolean => c.saturation * c.value >= HUED;

/**
 * Whether a shade is a darkening toward grey (its saturation drained to
 * under 0.6 of the lit fill's, and its hue turned under 15° or none left to
 * turn: a grey, black) or a colour (the house's rule: a shade's hue moves
 * toward the light's complement, its saturation kept).
 */
export const shadeKind = (lit: Hsv, shade: Hsv): Shading['kind'] =>
  shade.saturation < 0.6 * lit.saturation && (!hued(shade) || hueTurn(lit, shade) < 15)
    ? 'grey'
    : 'colour';

/**
 * A part's shading from its fill's pixels: past the strays (a mark, a soft
 * edge: far from the fill's median), split in two by colour, the lighter
 * half lit. None when one tone fills it.
 */
const shadingOf = (all: ReadonlyArray<Pixel>): Option.Option<Shading> => {
  const median = medianRgb(all.map((p) => p.c));
  const pixels = all.filter((p) => closerThan(p.c, median, 70));
  if (pixels.length < 40) return Option.none();
  const [first, second] = clusters(
    pixels.map((p) => p.c),
    2,
  );
  if (first === undefined || second === undefined) return Option.none();
  // One tone (the paper's grain alone) is no shade, nor is a sliver of either side.
  if (dist(first.centre, second.centre) < 12 || second.share < 0.08) return Option.none();
  const [litC, shadeC] =
    hsvOf(first.centre).value >= hsvOf(second.centre).value
      ? [first.centre, second.centre]
      : [second.centre, first.centre];
  const nearer = (p: Pixel, c: Rgb, other: Rgb) => {
    const order = orderOfSquares(distSq(p.c, c), distSq(p.c, other));
    return order < 0 || (order === 0 && dist(p.c, c) <= dist(p.c, other));
  };
  const lit = pixels.filter((p) => nearer(p, litC, shadeC));
  const shade = pixels.filter((p) => !nearer(p, litC, shadeC));
  const centre = (ps: ReadonlyArray<Pixel>) =>
    [
      ps.reduce((s, p) => s + p.x, 0) / ps.length,
      ps.reduce((s, p) => s + p.y, 0) / ps.length,
    ] as const;
  const [lx, ly] = centre(lit);
  const [sx, sy] = centre(shade);
  // The edge runs across the line from the lit side's centre to the shade's; y grows down, so negate it.
  const across = (Math.atan2(-(sy - ly), sx - lx) * 180) / Math.PI;
  const edge = (((across + 90) % 180) + 180) % 180;
  const [litHsv, shadeHsv] = [hsvOf(litC), hsvOf(shadeC)];
  return Option.some({ lit: litHsv, shade: shadeHsv, edge, kind: shadeKind(litHsv, shadeHsv) });
};

/** Every other pixel of the regions `ids` in rows `y0` to `y1`. */
const pixelsOf = (read: Read, ids: ReadonlySet<number>, y0: number, y1: number): Array<Pixel> => {
  const out: Array<Pixel> = [];
  for (let y = Math.max(0, Math.round(y0)); y <= Math.min(read.h - 1, Math.round(y1)); y++)
    for (let x = y % 2; x < read.w; x += 2)
      if (ids.has(read.regions.labels[y * read.w + x]!))
        out.push({ c: rgbAt(read.r, y * read.w + x), x, y });
  return out;
};

/** Row `y`'s leftmost and rightmost pixel of the regions `ids`, or none. */
const rowExtent = (read: Read, ids: ReadonlySet<number>, y: number) => {
  const row = Math.round(y);
  let [lo, hi] = [-1, -1];
  if (row >= 0 && row < read.h)
    for (let x = 0; x < read.w; x++)
      if (ids.has(read.regions.labels[row * read.w + x]!)) {
        if (lo < 0) lo = x;
        hi = x;
      }
  return lo < 0 ? Option.none<readonly [number, number]>() : Option.some([lo, hi] as const);
};

// ---------------------------------------------------------------------------
// The body

/**
 * How far apart two neighbouring pixels may be and still be one fill: a
 * fill's grain and the edge of its shade step less, a fill and what it is
 * drawn against more.
 */
const STEP = 40;

/** The fills: what the ink does not bar, split where neighbouring pixels step `STEP` or more apart. */
const fillsOf = (read: Read): Labelled => {
  const open = (i: number) => read.regions.labels[i]! >= 0;
  const step = (i: number, j: number) => closerThanAt(read.r, i, rgbAt(read.r, j), STEP);
  return label(read.w, read.h, open, false, step);
};

/** A row of the body: its extent, and whether ink closes it at both ends (else it is hidden there). */
interface BodyRow {
  readonly y: number;
  readonly lo: number;
  readonly hi: number;
  readonly closed: boolean;
}

/** Each row of the fills `ids` from `y0` down: its extent, and whether ink lies within `gap` past both ends. */
const bodyRows = (
  read: Read,
  fills: Labelled,
  ids: ReadonlySet<number>,
  y0: number,
  gap: number,
) => {
  const rows: Array<BodyRow> = [];
  const inkNear = (y: number, from: number, step: 1 | -1) => {
    for (let k = 1; k <= gap; k++) {
      const x = from + k * step;
      if (x < 0 || x >= read.w) return false;
      if (read.ink[y * read.w + x] === 1) return true;
    }
    return false;
  };
  for (let y = Math.max(0, Math.round(y0)); y < read.h; y++) {
    let [lo, hi] = [-1, -1];
    for (let x = 0; x < read.w; x++)
      if (ids.has(fills.labels[y * read.w + x]!)) {
        if (lo < 0) lo = x;
        hi = x;
      }
    if (lo >= 0) rows.push({ y, lo, hi, closed: inkNear(y, lo, -1) && inkNear(y, hi, 1) });
  }
  return rows;
};

/** The median colour of every fourth pixel of fill `p`. */
const colourOf = (read: Read, fills: Labelled, p: Part): Rgb => {
  const colours: Array<Rgb> = [];
  for (let y = p.y0; y <= p.y1; y += 2)
    for (let x = p.x0; x <= p.x1; x += 2)
      if (fills.labels[y * read.w + x] === p.id) colours.push(rgbAt(read.r, y * read.w + x));
  return medianRgb(colours);
};

/** The widest row closed at both ends within `depth` pixels above the body's lowest row. */
const widestNear = (rows: ReadonlyArray<BodyRow>, depth: number): BodyRow | undefined => {
  const bottom = rows.at(-1);
  return bottom === undefined
    ? undefined
    : rows
        .filter((q) => q.closed && q.y >= bottom.y - depth)
        .reduce<BodyRow | undefined>(
          (m, q) => (m === undefined || q.hi - q.lo > m.hi - m.lo ? q : m),
          undefined,
        );
};

/** How far the ink of row `y` runs on past `lo` to the left and past `hi` to the right, in pixels. */
const lineRuns = (read: Read, y: number, lo: number, hi: number): readonly [number, number] => {
  const runs = (from: number, step: 1 | -1) => {
    let x = from + step;
    while (x >= 0 && x < read.w && read.ink[y * read.w + x] === 1) x += step;
    return Math.abs(x - from) - 1;
  };
  return [runs(lo, -1), runs(hi, 1)];
};

// ---------------------------------------------------------------------------
// The measure

const unread = (reason: string) => Result.fail(FigureUnread.make({ reason }));

/** Where the measure keeps each ratio it reads, and why each it cannot is missing. */
interface Sink {
  readonly put: (ratio: Ratio, value: number) => void;
  readonly lacks: (ratio: Ratio, why: string) => void;
}

/** The head as read: its eyes and face, its hair, its outer box and its line. */
interface Head {
  readonly a: Part;
  readonly b: Part;
  readonly face: Part;
  readonly eyeY: number;
  /** How far across the ink one region's neighbour may lie. */
  readonly span: number;
  /** The smallest mark past the grain's specks. */
  readonly speck: number;
  readonly hair: ReadonlyArray<Part>;
  readonly headIds: ReadonlySet<number>;
  /** The hair regions as dark as the ink. */
  readonly masses: ReadonlySet<number>;
  /** How far a fill stops inside the outline's outer edge. */
  readonly rim: number;
  readonly hx0: number;
  readonly hy0: number;
  readonly hx1: number;
  readonly hy1: number;
  readonly W: number;
  readonly H: number;
  readonly cx: number;
  readonly cy: number;
  /** The head's line width in pixels, by coverage. */
  readonly outline: number;
  /** The head inside its outline's outer edge (`outerOf`). */
  readonly outer: Outer;
  /** Whether a line closes the chin, or the face runs on into the neck (`openChinOf`). */
  readonly chin: 'closed' | 'open';
}

/** A head as a mask in a box of the crop: 1 inside its outline's outer edge. */
interface Outer {
  readonly x0: number;
  readonly y0: number;
  readonly bw: number;
  readonly bh: number;
  readonly mask: Uint8Array;
}

/** A light region not the head's and at least this share of the face's area is no ear: it lies off the head. An ear is about a twentieth of a face; a hand a quarter. */
const FOREIGN_FILL = 0.2;

/**
 * The head inside its outline's outer edge, in a box round the face `reach`
 * pixels wide each way: what the ground off the head, walled by the ink and
 * the masses, does not reach from the box's edge or from a light fill larger
 * than an ear that is not the head's (`FOREIGN_FILL`: a robe or a chair the
 * ink walls in is off the head still), opened by a line (so a line that runs on
 * from the head, a neck's or a robe's, is not the head), and the part of it
 * joined to the face. Its regions `ids` are the head; a dark fill the grain
 * specks with ink is no region, but the ground cannot reach it past the
 * outline, so it is the head too.
 */
const outerOf = (
  read: Read,
  face: Part,
  ids: ReadonlySet<number>,
  reach: number,
  plug: Option.Option<readonly [number, number, number, number]>,
): Outer => {
  const x0 = Math.max(0, Math.floor(face.x0 - reach));
  const y0 = Math.max(0, Math.floor(face.y0 - reach));
  const bw = Math.min(read.w, Math.ceil(face.x1 + reach) + 1) - x0;
  const bh = Math.min(read.h, Math.ceil(face.y1 + reach) + 1) - y0;
  const at = (i: number) => (y0 + Math.floor(i / bw)) * read.w + x0 + (i % bw);
  const plugged = Option.match(plug, {
    onNone: () => () => false,
    onSome:
      ([px0, py0, px1, py1]) =>
      (i: number) => {
        const [x, y] = [x0 + (i % bw), y0 + Math.floor(i / bw)];
        return x >= px0 && x <= px1 && y >= py0 && y <= py1;
      },
  });
  // A light fill not the head's and larger than an ear (the robe under it, a chair behind it, a hand raised beside it) is off the head however the ink walls it in; a dark one is its hair or beard.
  const foreign = (j: number) => {
    const id = read.regions.labels[j]!;
    return (
      id >= 0 &&
      read.mass[j] === 0 &&
      !ids.has(id) &&
      read.regions.parts[id]!.area >= FOREIGN_FILL * face.area
    );
  };
  const ground = (i: number) => {
    const j = at(i);
    return (
      !plugged(i) &&
      (foreign(j) || (!ids.has(read.regions.labels[j]!) && read.ink[j] === 0 && read.mass[j] === 0))
    );
  };
  const onBoxEdge = (i: number) => {
    const [x, y] = [i % bw, Math.floor(i / bw)];
    return x === 0 || y === 0 || x === bw - 1 || y === bh - 1;
  };
  const outside = reachFrom(
    bw,
    bh,
    (i) => (ground(i) && onBoxEdge(i)) || (!plugged(i) && foreign(at(i))),
    ground,
  );
  const fromOutside = distanceTo(bw, bh, (i) => outside[i] === 1);
  const deep = (i: number) => fromOutside[i]! > read.line * read.line;
  const core = reachFrom(bw, bh, (i) => deep(i) && read.regions.labels[at(i)] === face.id, deep);
  const fromCore = distanceTo(bw, bh, (i) => core[i] === 1);
  const mask = new Uint8Array(bw * bh);
  const near = (read.line + 1) * (read.line + 1);
  for (let i = 0; i < bw * bh; i++) mask[i] = outside[i] === 0 && fromCore[i]! <= near ? 1 : 0;
  return { x0, y0, bw, bh, mask };
};

/** The top row of a head's outer mask, in the crop's pixels. */
const outerTop = (outer: Outer): number => {
  const first = outer.mask.indexOf(1);
  return outer.y0 + Math.floor(Math.max(0, first) / outer.bw);
};

/**
 * The head's sides: on each of its rows `y0` to `y1`, from the head's own
 * regions `ids` (its dark fills among them) outward, inside the outer mask,
 * through at most one outline's width of what is not the head's (ink, its
 * seams, a speck of grain, a dark fill as good as a line here): the
 * silhouette ink's outer edge. A lit band of hair inside that ink, or a dark fill
 * whose edge no region marks, moves neither side; an ear, a region of its
 * own past the face's line, stops the walk, so a head is as wide as its
 * skull and cheeks, never its ears; and a line the outline runs on into
 * along a row (a chair's frame, a shoulder's) is not the head.
 */
const outerSides = (
  read: Read,
  outer: Outer,
  ids: ReadonlySet<number>,
  y0: number,
  y1: number,
): readonly [number, number] => {
  const outline = Math.ceil(1.5 * read.line + 2 * read.seal);
  const grain = read.line * read.line;
  const inMask = (x: number, y: number) =>
    x >= outer.x0 &&
    x < outer.x0 + outer.bw &&
    outer.mask[(y - outer.y0) * outer.bw + x - outer.x0] === 1;
  /** From (`x`, `y`) on the head, the last column the walk `dx` reaches. */
  const walk = (x: number, y: number, dx: number) => {
    let [edge, run] = [x, 0];
    for (let nx = x + dx; nx >= 0 && nx < read.w && inMask(nx, y); nx += dx) {
      const i = y * read.w + nx;
      const id = read.regions.labels[i]!;
      if (ids.has(id)) run = 0;
      else if (id >= 0 && read.mass[i] === 0 && read.regions.parts[id]!.area >= grain) break;
      else run++;
      if (run > outline) break;
      edge = nx;
    }
    return edge;
  };
  let [lo, hi] = [Infinity, -Infinity];
  for (
    let y = Math.max(Math.round(y0), outer.y0);
    y < Math.min(Math.round(y1), outer.y0 + outer.bh);
    y++
  ) {
    const row = y * read.w;
    let [first, last] = [-1, -1];
    for (let x = 0; x < read.w; x++)
      if (ids.has(read.regions.labels[row + x]!)) {
        if (first < 0) first = x;
        last = x;
      }
    if (first < 0) continue;
    lo = Math.min(lo, walk(first, y, -1));
    hi = Math.max(hi, walk(last, y, 1));
  }
  return [lo, hi + 1];
};

/** The regions that meet region `of` with no ink between: a part painted on it. */
const touching = (read: Read, of: Part): ReadonlySet<number> => {
  const { w, h, regions } = read;
  const found = new Set<number>();
  for (let y = of.y0; y <= of.y1; y++)
    for (let x = of.x0; x <= of.x1; x++) {
      if (regions.labels[y * w + x] !== of.id) continue;
      for (const [dx, dy] of STEPS) {
        const [nx, ny] = [x + dx, y + dy];
        if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
        const id = regions.labels[ny * w + nx]!;
        if (id >= 0 && id !== of.id) found.add(id);
      }
    }
  return found;
};

/**
 * Hair: the regions across one line from the face, above the eyes, within
 * the head's reach. Dark hair is a mass round the face, its crown and its
 * beard one fill when no ink parts them, so a mass that rises past the
 * face's top is hair however far down it runs; a lit band painted on it
 * (meeting it with no ink between) is the hair's too.
 */
const hairOf = (read: Read, face: Part, eyeY: number, span: number): Array<Part> => {
  const fw = widthOf(face);
  const near = (p: Part) =>
    p.x0 >= face.x0 - 0.35 * fw && p.x1 <= face.x1 + 0.35 * fw && p.y0 >= face.y0 - 0.9 * fw;
  const above = (p: Part) =>
    (widthOf(p) >= 0.3 * fw || p.y1 < face.y0 + 0.15 * heightOf(face)) &&
    cyOf(p) < eyeY &&
    p.y1 < eyeY + 0.5 * fw;
  const dark = (p: Part) => massShare(read, p) > 0.5;
  const fits = (p: Part) => !p.border && p.area >= read.line * read.line && near(p);
  const first = [...neighbours(read, face, span)]
    .map((id) => read.regions.parts[id]!)
    .filter((p) => fits(p) && (above(p) || (dark(p) && p.y0 < face.y0)));
  const taken = new Set([face.id, ...first.map((p) => p.id)]);
  const painted = [...new Set(first.filter(dark).flatMap((p) => [...touching(read, p)]))]
    .map((id) => read.regions.parts[id]!)
    .filter((p) => !taken.has(p.id) && fits(p) && above(p));
  return [...first, ...painted];
};

/** A side of the head's outer edge: a mass (dark hair) reaches the outline itself, a fill stops `rim` inside it. */
const sideOf = (
  parts: ReadonlyArray<Part>,
  masses: ReadonlySet<number>,
  rim: number,
  pick: (p: Part) => number,
  outward: number,
  best: (...v: Array<number>) => number,
) => {
  const edge = best(...parts.map(pick));
  const at = parts.find((p) => pick(p) === edge);
  return edge + (at !== undefined && masses.has(at.id) ? 0 : outward * rim);
};

/** The head: the face round the two eyes, the hair joined to it, its outer box and its line. */
const headOf = (
  given: Read,
): Result.Result<{ readonly head: Head; readonly read: Read }, FigureUnread> => {
  const { line, seal } = given;
  // Marks: ink parts small against the crop, past the grain's specks, that touch no crop edge.
  const speck = (line * line) / 4;
  const marks = given.marks.parts.filter(
    (p) => !p.border && p.area >= speck && p.area < 0.01 * given.w * given.h,
  );
  const eyes = eyesOf(given, marks);
  if (Option.isNone(eyes))
    return unread('no pair of eyes (two small upright ink ovals on one row)');
  const [a, b] = eyes.value.eyes;
  const open = openChinOf(given, eyes.value.face, [a, b]);
  const { read, face } = Option.match(open, {
    onNone: () => ({ read: given, face: eyes.value.face }),
    onSome: ({ chin, seed }) => cutAtChin(given, eyes.value.face, seed, chin),
  });
  if (face.border) return unread("the head's outline is open: its fill reaches the crop's edge");
  const eyeY = (cyOf(a) + cyOf(b)) / 2;
  const span = Math.ceil(line + 2 * seal + 3);
  const hair = hairOf(read, face, eyeY, span);
  const rim = seal + line;
  const masses = new Set(hair.filter((p) => massShare(read, p) > 0.5).map((p) => p.id));
  const parts = [face, ...hair];
  // The head's own dark fills: hair, and the locks or the beard that meet the face with no ink between, however low they hang.
  const dark = new Set([
    ...parts.map((p) => p.id),
    ...[...touching(read, face)].filter((id) => massShare(read, read.regions.parts[id]!) > 0.5),
  ]);
  // The parts' box only sizes the search: the head's sides are its silhouette's.
  const across =
    sideOf(parts, masses, rim, (p) => p.x1, 1, Math.max) +
    1 -
    sideOf(parts, masses, rim, (p) => p.x0, -1, Math.min);
  const outer = outerOf(
    read,
    face,
    dark,
    1.2 * across,
    Option.map(open, (o) => o.plug),
  );
  const hy0 = outerTop(outer);
  // An open chin has no line under it: the head ends where the neck starts.
  const hy1 = face.y1 + 1 + ((Option.isNone(open) && rim) || 0);
  const [hx0, hx1] = outerSides(read, outer, dark, hy0, hy1);
  const [cx, cy] = [(hx0 + hx1) / 2, (hy0 + hy1) / 2];
  const head: Head = {
    a,
    b,
    face,
    eyeY,
    span,
    speck,
    hair,
    headIds: new Set([face.id, ...hair.map((p) => p.id)]),
    masses,
    rim,
    hx0,
    hy0,
    hx1,
    hy1,
    W: hx1 - hx0,
    H: hy1 - hy0,
    cx,
    cy,
    outline: outlineOf(read, cx, eyeY, face),
    outer,
    chin: Option.match(open, { onNone: () => 'closed' as const, onSome: () => 'open' as const }),
  };
  return Result.succeed({ head, read });
};

/** A brow over `eye`: the stroke over it nearest its column, never `taken` (one brow to an eye). */
const browOver = (
  read: Read,
  soft: Labelled,
  inHead: ReadonlyArray<Part>,
  eye: Part,
  eyeTop: number,
  W: number,
  taken: Option.Option<Part>,
): Option.Option<Part> => {
  const free = (p: Part) => Option.match(taken, { onNone: () => true, onSome: (t) => t !== p });
  const over = (p: Part) =>
    p.y1 < eyeTop + 0.3 * heightOf(eye) &&
    cyOf(p) > eyeTop - 0.35 * W &&
    Math.abs(cxOf(p) - cxOf(eye)) < widthOf(eye) + 0.1 * W;
  return Option.fromUndefinedOr(
    inHead
      .filter(
        (p) => free(p) && over(p) && axisLength(read, soft, p) > 1.5 * strokeOf(read, soft, p),
      )
      .sort((p, q) => Math.abs(cxOf(p) - cxOf(eye)) - Math.abs(cxOf(q) - cxOf(eye)))[0],
  );
};

/** The face's marks: the eyes' size and place, the brows over them, the mouth under them, and whether that is open. */
const faceRatios = (read: Read, head: Head, sink: Sink): Option.Option<MouthPose> => {
  const { a, b, W } = head;
  const [sa, sb] = [markSize(read, a), markSize(read, b)];
  // A mark against the eye spacing (`FACE_MARKS`); the spacing and the marks' places against the head.
  const spacing = cxOf(b) - cxOf(a);
  const put = (ratio: Ratio, pixels: number) =>
    sink.put(ratio, pixels / (FACE_MARKS.has(ratio) ? spacing : W));
  put('eyeWidth', (sa.width + sb.width) / 2);
  put('eyeHeight', (sa.height + sb.height) / 2);
  put('eyeSpacing', spacing);
  put('eyeBelowCentre', head.eyeY - head.cy);
  const soft = faceMarks(read, head.face, [head.hx0, head.hy0, head.hx1, head.hy1]);
  const holds = (p: Part, eye: Part) =>
    soft.labels[Math.round(cyOf(eye)) * read.w + Math.round(cxOf(eye))] === p.id;
  const inHead = soft.parts.filter(
    (p) => p.area >= head.speck && p.area < 0.05 * W * W && !holds(p, a) && !holds(p, b),
  );
  const eyeTop = Math.min(a.y0, b.y0);
  const leftBrow = browOver(read, soft, inHead, a, eyeTop, W, Option.none());
  const rightBrow = browOver(read, soft, inHead, b, eyeTop, W, leftBrow);
  const brows = [
    ...Option.toArray(Option.map(leftBrow, (brow) => ({ brow, eye: a }))),
    ...Option.toArray(Option.map(rightBrow, (brow) => ({ brow, eye: b }))),
  ];
  if (brows.length === 0) {
    sink.lacks('browLength', 'no brow over either eye');
    sink.lacks('browAbove', 'no brow over either eye');
  } else {
    put('browLength', brows.reduce((s, p) => s + axisLength(read, soft, p.brow), 0) / brows.length);
    put('browAbove', brows.reduce((s, p) => s + cyOf(p.eye) - p.brow.y0, 0) / brows.length);
  }
  const under = (p: Part) =>
    p.y0 > Math.max(a.y1, b.y1) && cxOf(p) > cxOf(a) - widthOf(a) && cxOf(p) < cxOf(b) + widthOf(b);
  return Option.match(
    Option.fromUndefinedOr(inHead.filter(under).sort((p, q) => widthOf(q) - widthOf(p))[0]),
    {
      onNone: () => {
        sink.lacks('mouthWidth', 'no mark under the eyes');
        sink.lacks('mouthBelowCentre', 'no mark under the eyes');
        return Option.none();
      },
      onSome: (mouth) => {
        put('mouthWidth', markSize(read, mouth).width);
        put('mouthBelowCentre', cyOf(mouth) - head.cy);
        const open = strokeOf(read, soft, mouth) > MOUTH_OPEN * head.outline;
        return Option.some<MouthPose>(open ? 'open' : 'closed');
      },
    },
  );
};

/**
 * The face's box, from the eyes: half an eye line out either side of them,
 * half one above, and an eye line and a half below them (the mouth and the
 * chin). Read from the eyes, not the face's fill, which may run on into a
 * headcloth or a neck of its colour.
 */
const faceBoxOf = (head: Head) => {
  const { a, b } = head;
  const span = cxOf(b) - cxOf(a);
  return {
    x0: a.x0 - 0.5 * span,
    y0: Math.min(a.y0, b.y0) - 0.5 * span,
    x1: b.x1 + 0.5 * span,
    y1: Math.max(a.y1, b.y1) + 1.5 * span,
  };
};

/** Which way the head faces (`Facing`): the eyes in the face's opening under them, and the eye line's slope. */
const facingOf = (read: Read, head: Head): Facing => {
  const { a, b, outer } = head;
  const eyesX = (cxOf(a) + cxOf(b)) / 2;
  // The face's opening on the cheek row just under the eyes: from between the
  // eyes out to the last skin before the hair, the ink, the head's edge, or a
  // fill that is not skin (a headcloth, a veil, a hood the house look draws
  // with no ink between it and the face) either side.
  const y = Math.min(read.h - 1, Math.round(Math.max(a.y1, b.y1) + 0.5 * heightOf(a)));
  const hairIds = new Set(head.hair.map((p) => p.id));
  const open = (x: number) => {
    const [ox, oy] = [x - outer.x0, y - outer.y0];
    if (
      ox < 0 ||
      oy < 0 ||
      ox >= outer.bw ||
      oy >= outer.bh ||
      outer.mask[oy * outer.bw + ox] !== 1
    )
      return false;
    const i = y * read.w + x;
    return read.ink[i] === 0 && read.mass[i] === 0 && !hairIds.has(read.regions.labels[i]!);
  };
  const skin = skinOf(read, head);
  // A run of non-skin as wide as the line ends the skin: one shorter is the paper's grain.
  const ends = Math.max(2, Math.round(read.line));
  // The skin's edge on a side: the last skin before a run of non-skin, or the
  // opening's own end when what lies past the skin is narrower than a light
  // rim (`RIM_MOST_OF_HEAD`), which is the face's own paper lit at its edge.
  const edge = (step: 1 | -1) => {
    let [at, x, onSkin] = [Math.round(eyesX), Math.round(eyesX), true];
    while (x + step >= 0 && x + step < read.w && open(x + step)) {
      x += step;
      if (onSkin && skin(rgbAt(read.r, y * read.w + x))) at = x;
      else if (onSkin && Math.abs(x - at) >= ends) onSkin = false;
    }
    return Math.abs(x - at) <= RIM_MOST_OF_HEAD * head.W ? x : at;
  };
  const [lo, hi] = [edge(-1), edge(1)];
  const turn = hi > lo ? (eyesX - (lo + hi + 1) / 2) / (hi - lo + 1) : 0;
  const roll = (Math.atan2(cyOf(b) - cyOf(a), cxOf(b) - cxOf(a)) * 180) / Math.PI;
  return { turn, roll, eyes: Math.hypot(cxOf(b) - cxOf(a), cyOf(b) - cyOf(a)) };
};

/** How far a colour may lie from the lit skin and still be it: the paper's grain. */
const SKIN_LIT = 36;
/** The widest light rim along a face's edge, as a share of the head's width: what lies past the skin and is narrower is the rim. */
const RIM_MOST_OF_HEAD = 0.1;
/** How far a face's shade may lie from its lit skin: the house shade turns the hue and darkens it this far at most. */
const SKIN_SHADE = 90;

/**
 * Whether a colour is the face's skin: the lit skin (the face's colour
 * between the eyes, where nothing but skin lies) give or take its grain
 * (`SKIN_LIT`), or a shade of it, darker and near it (`SKIN_SHADE`). A
 * headcloth or a veil lighter than the skin, or far from it, is not; on the
 * RBF farmer the cream cloth lies 60 from his skin and lighter. A light rim
 * at the face's edge is not skin by colour; `facingOf` takes it by its width.
 */
const skinOf = (read: Read, head: Head): ((c: Rgb) => boolean) => {
  const { a, b, face } = head;
  const [x0, x1] = [Math.min(a.x1, b.x1) + 1, Math.max(a.x0, b.x0) - 1];
  const [y0, y1] = [Math.max(a.y0, b.y0), Math.min(a.y1, b.y1)];
  const between: Array<Rgb> = [];
  for (let y = y0; y <= y1; y++)
    for (let x = x0; x <= x1; x++) {
      const i = y * read.w + x;
      if (read.regions.labels[i] === face.id && read.ink[i] === 0 && read.mass[i] === 0)
        between.push(rgbAt(read.r, i));
    }
  // Eyes that touch leave nothing between them: the face's colour on the eye line is the skin then.
  const lit = medianRgb(
    between.length > 0
      ? between
      : pixelsOf(read, new Set([face.id]), head.eyeY, head.eyeY + 0.1 * head.W).map((p) => p.c),
  );
  const luma = lumaOf(lit);
  return (c) => {
    const d = dist(c, lit);
    return d <= SKIN_LIT || (d <= SKIN_SHADE && lumaOf(c) < luma - 8);
  };
};

/** A beard reads when this share of the band under the mouth, between the eyes' outer edges and off the outline, is neither skin nor ink; a band with no pixel inside the head (it falls below the chin) reads none. */
const BEARD_SHARE = 0.3;
/** Each side's edge is read when the beard meets fill past it on this many rows. */
const EDGE_ROWS = 3;

/**
 * Where the hair meets the beard (`HairBeard`), or none when no beard reads.
 * The hair is the head's fill above the cheek (from the head's top to half
 * an eye spacing under the eyes), the beard the band from 0.8 to 2.2 eye
 * spacings under the eyes between the eyes' outer edges: each off the ink,
 * the skin and the outline's own width inside the head's edge, its median
 * colour. The edge walks each beard row out from the eyes' outer edge on
 * each side, through the beard to the fill past it (a row that meets the
 * cheek's skin first holds no edge): at each step, how far the darkest pixel
 * within a line of it lies under the darker of the fills a line either side;
 * the row's edge is the largest, a side's the median of its rows, the
 * head's the larger side's.
 */
const hairBeardOf = (read: Read, head: Head): Option.Option<HairBeard> => {
  const { a, b, outer } = head;
  const spacing = cxOf(b) - cxOf(a);
  const skin = skinOf(read, head);
  const off = Math.ceil(head.outline);
  const inside = (x: number, y: number) => {
    const [ox, oy] = [x - outer.x0, y - outer.y0];
    return (
      ox >= 0 && oy >= 0 && ox < outer.bw && oy < outer.bh && outer.mask[oy * outer.bw + ox] === 1
    );
  };
  // A pixel the outline's width inside the head's edge: the ink's soft side is neither part.
  const deep = (x: number, y: number) =>
    inside(x, y) &&
    inside(x - off, y) &&
    inside(x + off, y) &&
    inside(x, y - off) &&
    inside(x, y + off);
  const fillIn = (x0: number, x1: number, y0: number, y1: number) => {
    const fill: Array<Rgb> = [];
    let all = 0;
    for (let y = Math.max(0, Math.round(y0)); y <= Math.min(read.h - 1, Math.round(y1)); y++)
      for (let x = Math.max(0, Math.round(x0)); x <= Math.min(read.w - 1, Math.round(x1)); x++) {
        if (!deep(x, y)) continue;
        all++;
        const i = y * read.w + x;
        const c = rgbAt(read.r, i);
        if (read.ink[i] === 0 && !skin(c)) fill.push(c);
      }
    return { fill, all };
  };
  const [beardTop, beardBottom] = [head.eyeY + 0.8 * spacing, head.eyeY + 2.2 * spacing];
  const hair = fillIn(outer.x0, outer.x0 + outer.bw - 1, outer.y0, head.eyeY + 0.5 * spacing);
  const beard = fillIn(a.x0, b.x1, beardTop, beardBottom);
  if (hair.fill.length === 0 || beard.all === 0 || beard.fill.length < BEARD_SHARE * beard.all)
    return Option.none();
  const line = Math.max(2, Math.round(read.line));
  const valueAt = (x: number, y: number) => hsvOf(rgbAt(read.r, y * read.w + x)).value;
  const rowEdge = (y: number, x0: number, step: 1 | -1): Option.Option<number> => {
    const values: Array<number> = [];
    for (let x = x0; deep(x, y); x += step) {
      if (skin(rgbAt(read.r, y * read.w + x))) return Option.none();
      values.push(valueAt(x, y));
    }
    const mean = (i0: number, i1: number) =>
      values.slice(i0, i1).reduce((s, v) => s + v, 0) / (i1 - i0);
    let edge = 0;
    for (let i = 2 * line; i + 2 * line <= values.length; i++) {
      const darkest = Math.min(...values.slice(i - line, i + line));
      edge = Math.max(
        edge,
        Math.min(mean(i - 2 * line, i - line), mean(i + line, i + 2 * line)) - darkest,
      );
    }
    return values.length < 4 * line ? Option.none() : Option.some(edge);
  };
  const sideEdge = (x0: number, step: 1 | -1): Option.Option<number> => {
    const rows: Array<number> = [];
    for (let y = Math.max(0, Math.round(beardTop)); y <= Math.min(read.h - 1, beardBottom); y++)
      rows.push(...Option.toArray(rowEdge(y, Math.round(x0), step)));
    rows.sort((p, q) => p - q);
    return Option.filter(
      Option.fromUndefinedOr(rows[Math.floor(rows.length / 2)]),
      () => rows.length >= EDGE_ROWS,
    );
  };
  const edges = [...Option.toArray(sideEdge(a.x0, -1)), ...Option.toArray(sideEdge(b.x1, 1))];
  return Option.some({
    hair: hsvOf(medianRgb(hair.fill)),
    beard: hsvOf(medianRgb(beard.fill)),
    ...((edges.length > 0 && { edge: Math.max(...edges) }) || {}),
  });
};

/**
 * The head's inner parts: the face, the hair and what lies across one line
 * from either (an ear), within a third of a head of the head's box.
 */
const innerParts = (read: Read, head: Head): Array<Part> => {
  const { hair, face, span } = head;
  const reach = 0.3 * head.W;
  const within = (p: Part) =>
    p.x0 >= head.hx0 - reach &&
    p.x1 <= head.hx1 + reach &&
    p.y0 >= head.hy0 - reach &&
    p.y1 <= head.hy1;
  return [
    ...new Set([
      face.id,
      ...hair.flatMap((p) => [p.id, ...neighbours(read, p, span)]),
      ...neighbours(read, face, span),
    ]),
  ]
    .map((id) => read.regions.parts[id]!)
    .filter((p) => !p.border && p.area >= read.line * read.line && within(p));
};

/** The hair's own line, the light rim inside the inner parts, and the head's outline: its radii. */
const hairRatios = (read: Read, head: Head, sink: Sink, rims: boolean): Array<number> => {
  const { hair, masses, W, span } = head;
  const lightHair = hair.filter((p) => !masses.has(p.id));
  if (hair.length > 0 && lightHair.length === 0)
    sink.lacks('interiorInk', 'the hair is as dark as the ink, so a line along it does not show');
  else
    sink.put(
      'interiorInk',
      interiorInk(read, head.face, new Set(lightHair.map((p) => p.id)), span) / W,
    );
  // A light rim inside the edges of the head's inner parts (an ear, the hair): the concept paints none.
  if (rims) sink.put('innerRim', innerRim(read, innerParts(read, head), W) / W);
  else sink.lacks('innerRim', 'a lean read reads no rims');
  return headRadii(head.outer, [head.cx, head.cy], W, span);
};

/** The fill most of the band under the chin is, -1 for none. */
const dominantFill = (read: Read, fills: Labelled, head: Head): number => {
  const { W, cx, hy1, headIds } = head;
  const votes = new Map<number, number>();
  const [x0, x1] = [Math.max(0, Math.round(cx - 0.4 * W)), Math.min(read.w - 1, cx + 0.4 * W)];
  for (let y = Math.round(hy1 + 0.05 * W); y <= Math.min(read.h - 1, hy1 + 0.35 * W); y += 2)
    for (let x = x0; x <= x1; x += 2) {
      const id = fills.labels[y * read.w + x]!;
      if (id >= 0 && !headIds.has(read.regions.labels[y * read.w + x]!))
        votes.set(id, (votes.get(id) ?? 0) + 1);
    }
  const [dominant] = [...votes].reduce<readonly [number, number]>(
    (top, v) => (v[1] > top[1] ? v : top),
    [-1, 0],
  );
  return dominant;
};

/** The body's own colours: the main cluster of its fill and any other a sixth of it or more. */
const ownColours = (
  read: Read,
  fills: Labelled,
  rows: ReadonlyArray<BodyRow>,
  dominant: number,
): Array<Rgb> =>
  clusters(
    rows.flatMap((row) =>
      Array.from({ length: Math.floor((row.hi - row.lo) / 3) }, (_, k) => row.lo + 3 * k)
        .filter((x) => fills.labels[row.y * read.w + x] === dominant)
        .map((x) => rgbAt(read.r, row.y * read.w + x)),
    ),
    3,
  )
    .filter((c, k) => k === 0 || c.share >= 0.15)
    .map((c) => c.centre);

/**
 * Whether a closed fill under row `lineY`, at the body's middle, is as wide
 * as the body's lowest row or wider: a thing in front of the body (a rail's
 * top, a table's), where a hem has the ground and the feet under it.
 */
const frontUnder = (read: Read, bottom: BodyRow, lineY: number, gap: number) =>
  Option.match(
    regionNear(read, (bottom.lo + bottom.hi) / 2, lineY + read.line + read.seal + 1, gap),
    {
      onNone: () => false,
      onSome: (p) => !p.border && widthOf(p) >= bottom.hi - bottom.lo + 1,
    },
  );

/**
 * Whether the body's lowest row is its hem: a line runs under it, across
 * its span, and ends near its sides (a hand may sit there) short of the
 * crop's edge, with no closed fill as wide as the body under it. A line
 * that runs on, or one with such a fill under it, is a thing drawn across
 * the body.
 */
const hemmed = (read: Read, rows: ReadonlyArray<BodyRow>, W: number, gap: number) => {
  const bottom = rows.at(-1);
  const base = widestNear(rows, 0.15 * W);
  if (bottom === undefined || base === undefined) return false;
  let [lineY, most] = [-1, 0];
  for (let y = bottom.y + 1; y <= Math.min(read.h - 1, bottom.y + gap); y++) {
    let count = 0;
    for (let x = bottom.lo; x <= bottom.hi; x++) count += read.ink[y * read.w + x]!;
    if (count > most) [lineY, most] = [y, count];
  }
  if (lineY < 0 || most < 0.8 * (bottom.hi - bottom.lo + 1)) return false;
  const [left, right] = lineRuns(read, lineY, bottom.lo, bottom.hi);
  const [x0, x1] = [bottom.lo - left, bottom.hi + right];
  const ends = Math.max(base.lo - x0, x1 - base.hi) <= 0.6 * W && x0 > 0 && x1 < read.w - 1;
  return ends && !frontUnder(read, bottom, lineY, gap);
};

/** The fills under the body's lowest row as wide as it and of its colours: the body again past a thing drawn across it. */
const fillsBelow = (
  read: Read,
  fills: Labelled,
  ids: ReadonlySet<number>,
  rows: ReadonlyArray<BodyRow>,
  own: ReadonlyArray<Rgb>,
  W: number,
): Array<Part> => {
  const last = rows.at(-1);
  if (last === undefined) return [];
  const wide = rows.filter((q) => q.closed).at(-1);
  const span = wide === undefined ? W : wide.hi - wide.lo + 1;
  const under = (p: Part) =>
    p.y0 > last.y &&
    p.y0 <= last.y + 0.6 * W &&
    p.x1 >= last.lo - 0.2 * W &&
    p.x0 <= last.hi + 0.2 * W;
  return fills.parts.filter(
    (p) =>
      !ids.has(p.id) &&
      !p.border &&
      under(p) &&
      widthOf(p) >= 0.5 * span &&
      own.some((t) => dist(colourOf(read, fills, p), t) < 45),
  );
};

/** The body's rows, from the chin down, joined past each thing drawn across it. */
const bodyRowsOf = (read: Read, fills: Labelled, dominant: number, head: Head, gap: number) => {
  const ids = new Set([dominant]);
  const own = ownColours(read, fills, bodyRows(read, fills, ids, head.hy1, gap), dominant);
  let rows = bodyRows(read, fills, ids, head.hy1, gap);
  // A thing drawn across the body (a table) cuts it: below, the fills as wide as it and of its colours are the body again, even where the thing's line seems to end at the body's sides.
  for (;;) {
    const below = fillsBelow(read, fills, ids, rows, own, head.W);
    if (below.length === 0) break;
    for (const p of below) ids.add(p.id);
    rows = bodyRows(read, fills, ids, head.hy1, gap);
  }
  return { rows, ids };
};

/** The body's width a share of a head under the chin, where ink closes that row. */
const bodyWidths = (rows: ReadonlyArray<BodyRow>, head: Head, edge: number, sink: Sink) => {
  for (const [ratio, depth] of [
    ['bodyUnderChin', 0.1],
    ['body35', 0.35],
    ['body70', 0.7],
  ] as const) {
    const row = rows.find((q) => q.y === Math.round(head.hy1 + depth * head.W));
    if (row?.closed === true) sink.put(ratio, (row.hi - row.lo + 1 + 2 * edge) / head.W);
    else
      sink.lacks(ratio, `the body does not show, or is hidden, ${depth} of a head under the chin`);
  }
};

/** The body's shade, from every other pixel of its rows. */
const bodyShadingOf = (
  read: Read,
  fills: Labelled,
  ids: ReadonlySet<number>,
  rows: ReadonlyArray<BodyRow>,
) => {
  const pixels: Array<Pixel> = [];
  for (const row of rows)
    for (let x = row.lo + (row.y % 2); x <= row.hi; x += 2)
      if (ids.has(fills.labels[row.y * read.w + x]!))
        pixels.push({ c: rgbAt(read.r, row.y * read.w + x), x, y: row.y });
  return shadingOf(pixels);
};

/** The body's outline: a closed row every twentieth of a head, its sides from the head's centre in head widths. */
const bodyEdgesOf = (rows: ReadonlyArray<BodyRow>, head: Head, edge: number): Array<BodyEdge> => {
  const every = Math.max(1, Math.round(0.05 * head.W));
  const first = rows[0]?.y ?? 0;
  return rows
    .filter((row) => row.closed && (row.y - first) % every === 0)
    .map((row) => ({
      y: (row.y - head.cy) / head.W,
      left: (row.lo - edge - head.cx) / head.W,
      right: (row.hi + 1 + edge - head.cx) / head.W,
    }));
};

/** The feet's lowest row: the rows of ink under the hem, within its span, run on from its lowest row. */
const footOf = (read: Read, bottom: BodyRow, base: BodyRow, outline: number): number => {
  const inked = (y: number) => {
    for (let x = base.lo - Math.round(outline); x <= base.hi + outline; x++)
      if (x >= 0 && x < read.w && read.ink[y * read.w + x] === 1) return true;
    return false;
  };
  let foot = bottom.y;
  while (foot + 1 < read.h && inked(foot + 1)) foot++;
  return foot;
};

/** The feet's ink box: the rows from `from` to `foot`, within a third of a head of the hem's span; none when there is no ink. */
const feetInk = (read: Read, base: BodyRow, from: number, foot: number, W: number) => {
  const [lo, hi] = [
    Math.max(0, Math.round(base.lo - W / 3)),
    Math.min(read.w - 1, Math.round(base.hi + W / 3)),
  ];
  let [fx0, fx1] = [read.w, -1];
  for (let y = from; y <= foot; y++)
    for (let x = lo; x <= hi; x++)
      if (read.ink[y * read.w + x] === 1) [fx0, fx1] = [Math.min(fx0, x), Math.max(fx1, x)];
  return fx1 < 0 ? Option.none() : Option.some([fx0, fx1] as const);
};

/** The hem, the figure's height and the feet under the hem, when the body's lowest row is its hem. */
const feetRatios = (
  read: Read,
  rows: ReadonlyArray<BodyRow>,
  head: Head,
  gap: number,
  sink: Sink,
): Option.Option<PixelBox> => {
  const { W } = head;
  const bottom = rows.at(-1)!;
  const base = widestNear(rows, 0.15 * W);
  if (!hemmed(read, rows, W, gap) || base === undefined) {
    sink.lacks('hem', 'a line runs on past the body at its lowest row: it stands behind something');
    for (const ratio of ['heightInHeads', 'feetWidth', 'feetHeight'] as const)
      sink.lacks(ratio, 'its feet are hidden');
    return Option.none();
  }
  sink.put('hem', (base.hi - base.lo + 1 + 2 * (read.seal + head.outline)) / W);
  const foot = footOf(read, bottom, base, head.outline);
  sink.put('heightInHeads', (foot + 1 - head.hy0) / head.H);
  // The feet's width: the ink of the rows past the hem's line.
  const ink = feetInk(read, base, bottom.y + gap + 1, foot, W);
  if (Option.isNone(ink)) {
    // Feet a fifth of a head tall would reach past the crop's edge: the frame cuts them, not the drawing.
    const why =
      bottom.y + gap + 0.2 * W >= read.h
        ? "its feet would lie past the crop's edge"
        : 'no feet under the hem';
    sink.lacks('feetWidth', why);
    sink.lacks('feetHeight', why);
    return Option.none();
  }
  const [fx0, fx1] = ink.value;
  sink.put('feetWidth', (fx1 + 1 - fx0) / W);
  sink.put('feetHeight', (foot + 1 - bottom.y) / W);
  return Option.some([
    (fx0 - head.cx) / W,
    (bottom.y - head.cy) / W,
    (fx1 + 1 - head.cx) / W,
    (foot + 1 - head.cy) / W,
  ] as const);
};

const BODY_RATIOS = [
  'bodyUnderChin',
  'body35',
  'body70',
  'hem',
  'heightInHeads',
  'feetWidth',
  'feetHeight',
] as const;

/** The body as read: its shade, its outline, the feet's box, and its lowest row. */
interface BodyRead {
  /** The body's shade, read when asked: a lean read leaves it. */
  readonly shading: () => Option.Option<Shading>;
  readonly edges: ReadonlyArray<BodyEdge>;
  readonly feet: Option.Option<PixelBox>;
  readonly lowest: number;
}

/** The body: the fill most of the band under the chin is, and the fills of its colours a thing drawn across it cuts off below. */
const bodyOf = (read: Read, head: Head, sink: Sink): BodyRead => {
  const fills = fillsOf(read);
  const dominant = dominantFill(read, fills, head);
  if (dominant < 0 || fills.parts[dominant]!.border) {
    const why = dominant < 0 ? 'no body under the chin' : "the body's fill reaches the crop's edge";
    for (const ratio of BODY_RATIOS) sink.lacks(ratio, why);
    return { shading: () => Option.none(), edges: [], feet: Option.none(), lowest: read.h };
  }
  const gap = read.line + 2;
  const { rows, ids } = bodyRowsOf(read, fills, dominant, head, gap);
  const edge = read.seal + head.outline;
  bodyWidths(rows, head, edge, sink);
  return {
    shading: () => bodyShadingOf(read, fills, ids, rows),
    edges: bodyEdgesOf(rows, head, edge),
    feet: feetRatios(read, rows, head, gap, sink),
    lowest: rows.at(-1)!.y,
  };
};

/** Hands: round regions beside the body, between the head's top and the body's lowest row. */
const handRatios = (read: Read, head: Head, lowest: number, sink: Sink) => {
  const { W } = head;
  const handLike = (p: Part) => {
    const d = (widthOf(p) + heightOf(p)) / 2;
    const aspect = widthOf(p) / heightOf(p);
    const round = p.area / ((Math.PI / 4) * widthOf(p) * heightOf(p));
    return aspect > 0.8 && aspect < 1.25 && round > 0.85 && d > 0.15 * W && d < 0.8 * W;
  };
  const hands = read.regions.parts.filter(
    (p) =>
      !head.headIds.has(p.id) &&
      !p.border &&
      p.y0 > head.hy0 &&
      p.y1 < lowest + 0.3 * W &&
      handLike(p),
  );
  if (hands.length === 0) sink.lacks('hand', 'no round hand beside the body');
  else
    sink.put(
      'hand',
      hands.reduce((s, p) => s + (widthOf(p) + heightOf(p)) / 2 + 2 * head.rim, 0) /
        hands.length /
        W,
    );
};

/** A figure read without its light rims, its shading, its render artifacts or its hair and beard: what a cast sheet's view needs when no concept is held to it. */
export type FigureRead = Omit<
  FigureMeasure,
  'headShading' | 'bodyShading' | 'artifacts' | 'hairBeard'
>;

/** The figure in `crop` read, its rims read or not, with what the full measure reads on from. */
const readWith = (crop: Raster, rims: boolean) => {
  const maybe = readCrop(crop);
  if (Option.isNone(maybe)) return unread('no dark warm ink in it');
  return Result.map(headOf(maybe.value), ({ head, read }) => {
    const found = new Map<Ratio, number>();
    const missing: Array<Unmeasured> = [];
    const sink: Sink = {
      put: (ratio, value) => found.set(ratio, value),
      lacks: (ratio, why) => missing.push({ ratio, why }),
    };
    const { W } = head;
    sink.put('headHeight', head.H / W);
    sink.put('outline', head.outline / W);
    // The jaw is the face's: hair hanging beside it (a crown that runs on into the beard) is no jaw.
    Option.match(rowExtent(read, new Set([head.face.id]), head.hy1 - 0.2 * W), {
      onNone: () => sink.lacks('jaw', 'no head 0.2 of a head above the chin'),
      onSome: ([lo, hi]) => sink.put('jaw', (hi - lo + 1 + 2 * head.rim) / W),
    });
    const mouth = faceRatios(read, head, sink);
    const radii = hairRatios(read, head, sink, rims);
    const body = bodyOf(read, head, sink);
    handRatios(read, head, body.lowest, sink);
    const figure: FigureRead = {
      head: [head.hx0, head.hy0, head.hx1, head.hy1] as const,
      ink: read.inkColour,
      ratios: RATIOS.flatMap((ratio) => {
        const value = found.get(ratio);
        return value === undefined ? [] : [{ ratio, value }];
      }),
      silhouette: {
        head: radii,
        body: body.edges,
        ...Option.match(body.feet, { onNone: () => ({}), onSome: (feet) => ({ feet }) }),
      },
      ...Option.match(mouth, { onNone: () => ({}), onSome: (pose) => ({ mouth: pose }) }),
      facing: facingOf(read, head),
      ...((head.chin === 'open' && { chin: 'open' as const }) || {}),
      missing,
    };
    return { figure, read, head, body };
  });
};

/** The head's render artifacts: thin lines of a third colour inside its outline, the outline's own colour only (a dark brown fill, hair or a beard, is a fill here, so a gap between it and the line shows). */
const artifactsOf = (read: Read, head: Head) => {
  const inkColoured = new Uint8Array(read.ink.length);
  for (let i = 0; i < inkColoured.length; i++)
    inkColoured[i] = closerThanAt(read.r, i, read.inkColour, INK_NEAR) ? 1 : 0;
  return headArtifacts({
    raster: read.r,
    ink: inkColoured,
    head: head.outer,
    face: faceBoxOf(head),
    line: read.line,
  });
};

/** Read the figure in `crop` lean: every ratio but its light rims, with no shading and no render artifacts. */
export const readFigure = (crop: Raster): Result.Result<FigureRead, FigureUnread> =>
  Result.map(readWith(crop, false), (r) => r.figure);

/** Measure the figure in `crop`: one figure, with a little room round it. */
export const measureFigure = (crop: Raster): Result.Result<FigureMeasure, FigureUnread> =>
  Result.map(readWith(crop, true), ({ figure, read, head, body }) => {
    // The head's shade: the face's skin from just under the eyes to the chin, both read from the eyes (`faceBoxOf`). The face's region runs on, with no line between, into a fill of another paper (a headcloth hanging to the shoulder, a veil), which is no shade of the skin.
    const skin = skinOf(read, head);
    const chin = Math.min(head.hy1, faceBoxOf(head).y1);
    const headShading = shadingOf(
      pixelsOf(read, new Set([head.face.id]), head.eyeY + 0.1 * head.W, chin).filter((p) =>
        skin(p.c),
      ),
    );
    const { mouth, facing, missing, ...lines } = figure;
    return {
      ...lines,
      ...Option.match(headShading, { onNone: () => ({}), onSome: (s) => ({ headShading: s }) }),
      ...Option.match(body.shading(), { onNone: () => ({}), onSome: (s) => ({ bodyShading: s }) }),
      ...Option.match(Option.fromUndefinedOr(mouth), {
        onNone: () => ({}),
        onSome: (pose) => ({ mouth: pose }),
      }),
      facing,
      artifacts: artifactsOf(read, head),
      ...Option.match(hairBeardOf(read, head), {
        onNone: () => ({}),
        onSome: (hairBeard) => ({ hairBeard }),
      }),
      missing,
    };
  });

/**
 * What a walk from the pixels `seed` picks reaches in a `w` × `h` picture,
 * stepping four ways into pixels `admit` lets in, at most `most` steps from
 * a seed: 1 where reached.
 */
const reachFrom = (
  w: number,
  h: number,
  seed: (i: number) => boolean,
  admit: (j: number) => boolean,
  most = Number.POSITIVE_INFINITY,
): Uint8Array => {
  const reached = new Uint8Array(w * h);
  const steps = new Int32Array(w * h);
  // Each pixel is queued once, when it is first reached.
  const queue = new Int32Array(w * h);
  let end = 0;
  for (let i = 0; i < w * h; i++)
    if (seed(i)) {
      reached[i] = 1;
      queue[end++] = i;
    }
  for (let q = 0; q < end; q++) {
    const i = queue[q]!;
    if (steps[i]! >= most) continue;
    const x = i % w;
    const y = (i - x) / w;
    for (let s = 0; s < STEPS.length; s++) {
      const nx = x + STEPS[s]![0];
      const ny = y + STEPS[s]![1];
      if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
      const j = ny * w + nx;
      if (reached[j] === 1 || !admit(j)) continue;
      reached[j] = 1;
      steps[j] = steps[i]! + 1;
      queue[end++] = j;
    }
  }
  return reached;
};

/**
 * The head's outer radius at each of `HEAD_RADII` angles from its centre,
 * clockwise from straight up, as shares of its width `W`: out along each ray
 * through the head's outer mask (`outerOf`), its last pixel before a run off
 * it longer than two lines' crossing (`span`), and half a pixel past it.
 */
const headRadii = (
  outer: Outer,
  centre: readonly [number, number],
  W: number,
  span: number,
): Array<number> => {
  const [cx, cy] = centre;
  const { x0, y0, bw, bh, mask } = outer;
  const reach = 1.2 * W;
  const inHead = (x: number, y: number) =>
    x >= 0 && y >= 0 && x < bw && y < bh && mask[y * bw + x] === 1;
  return Array.from({ length: HEAD_RADII }, (_, k) => {
    const angle = (2 * Math.PI * k) / HEAD_RADII;
    const [dx, dy] = [Math.sin(angle), -Math.cos(angle)];
    let [last, gap] = [0, 0];
    for (let t = 0; t <= reach && gap <= 2 * span; t += 0.5) {
      if (inHead(Math.round(cx + dx * t) - x0, Math.round(cy + dy * t) - y0)) [last, gap] = [t, 0];
      else gap += 0.5;
    }
    return (last + 0.5) / W;
  });
};

/** A band lighter than its part's fill by this much luma (0–255) is a rim; the house rim is 20 to 25 lighter. */
const RIM_LIFT = 10;

/**
 * The face's marks for the rim: the small ink parts, apart from every line;
 * a small ring round a region of its own (an ear's line) is a line.
 */
const smallMarks = (read: Read, W: number): ((i: number) => boolean) => {
  const { regions, line } = read;
  const rings = (m: Part) =>
    regions.parts.some(
      (p) =>
        !p.border &&
        p.area >= line * line &&
        p.x0 > m.x0 &&
        p.x1 < m.x1 &&
        p.y0 > m.y0 &&
        p.y1 < m.y1,
    );
  const small = new Set(
    read.marks.parts.filter((p) => p.area < 0.05 * W * W && !rings(p)).map((p) => p.id),
  );
  return (i) => small.has(read.marks.labels[i]!);
};

/** How near each pixel is to the silhouette's dark, to an inner line, and to a face's mark. */
interface RimMaps {
  readonly nearOuter: Float64Array;
  readonly nearInner: Float64Array;
  readonly nearMark: Float64Array;
}

/**
 * The rim's distance maps: the silhouette's dark is the dark pixels reached
 * from the ground (what touches the crop's edge, and the seal's width beside
 * it, which the regions leave out) through dark pixels within three lines;
 * an inner line is dark the silhouette's walk does not reach and no mark.
 */
const rimMaps = (read: Read, W: number): RimMaps => {
  const { w, h, regions, line, seal } = read;
  const ground = new Set(regions.parts.filter((p) => p.border).map((p) => p.id));
  const darkest = lumaOf(read.inkColour) + 40;
  const dark = (i: number) =>
    read.ink[i] === 1 || read.mass[i] === 1 || lumaOf(rgbAt(read.r, i)) <= darkest;
  const nearGround = distanceTo(w, h, (i) => ground.has(regions.labels[i]!));
  const edge = (seal + 1.5) ** 2;
  const reached = reachFrom(w, h, (i) => nearGround[i]! <= edge, dark, 3 * line + seal);
  const isMark = smallMarks(read, W);
  return {
    nearOuter: distanceTo(w, h, (i) => reached[i] === 1 && dark(i)),
    nearInner: distanceTo(w, h, (i) => reached[i] === 0 && dark(i) && !isMark(i)),
    nearMark: distanceTo(w, h, isMark),
  };
};

/** One part's box for the rim: its own pixels, its depth inside its edge, and the crop's index of each. */
interface PartBox {
  readonly bw: number;
  readonly bh: number;
  readonly at: (x: number, y: number) => number;
  readonly own: (x: number, y: number) => boolean;
  readonly deepAt: (x: number, y: number) => number;
}

/** The box of `part` with room for its edge, so its own distances need no whole frame. */
const partBox = (read: Read, part: Part): PartBox => {
  const { w, h, regions } = read;
  const [x0, y0] = [Math.max(0, part.x0 - 1), Math.max(0, part.y0 - 1)];
  const [bw, bh] = [Math.min(w, part.x1 + 2) - x0, Math.min(h, part.y1 + 2) - y0];
  const at = (x: number, y: number) => (y0 + y) * w + x0 + x;
  const own = (x: number, y: number) =>
    x >= 0 && y >= 0 && x < bw && y < bh && regions.labels[at(x, y)] === part.id;
  const depth = distanceTo(bw, bh, (j) => !own(j % bw, Math.floor(j / bw)));
  const deepAt = (x: number, y: number) =>
    Math.sqrt(depth[Math.min(bh - 1, Math.max(0, y)) * bw + Math.min(bw - 1, Math.max(0, x))]!);
  return { bw, bh, at, own, deepAt };
};

/** Inward from (`x`, `y`): up the depth's slope, at most a band and two pixels, to the part's deepest pixel on the way. */
const inwardOf = (box: PartBox, x: number, y: number, band: number): Option.Option<number> => {
  const { own, deepAt, at } = box;
  const [gx, gy] = [deepAt(x + 1, y) - deepAt(x - 1, y), deepAt(x, y + 1) - deepAt(x, y - 1)];
  const norm = Math.hypot(gx, gy);
  if (norm === 0) return Option.none();
  let [qx, qy] = [x, y];
  for (let k = 1; k <= band + 2; k++) {
    const [sx, sy] = [Math.round(x + (gx / norm) * k), Math.round(y + (gy / norm) * k)];
    if (!own(sx, sy) || deepAt(sx, sy) < deepAt(qx, qy)) break;
    [qx, qy] = [sx, sy];
  }
  return deepAt(qx, qy) < deepAt(x, y) + 1.5 ? Option.none() : Option.some(at(qx, qy));
};

/** Whether (`x`, `y`) of a part's box is a rim pixel: in the band, nearer an inner line than the silhouette or a mark, and lighter than the part further in. */
const rimPixel = (
  read: Read,
  box: PartBox,
  maps: RimMaps,
  band: number,
  x: number,
  y: number,
): boolean => {
  const d = box.deepAt(x, y);
  if (!box.own(x, y) || d < 1.5 || d > band) return false;
  const i = box.at(x, y);
  if (maps.nearInner[i]! >= maps.nearOuter[i]! || maps.nearMark[i]! <= maps.nearInner[i]!)
    return false;
  return Option.match(inwardOf(box, x, y, band), {
    onNone: () => false,
    onSome: (j) => lumaOf(rgbAt(read.r, i)) - lumaOf(rgbAt(read.r, j)) > RIM_LIFT,
  });
};

/**
 * The length, in pixels, of light rim inside the edges of `parts` (each a
 * region of the head) where the edge is a line between two parts: a pixel
 * of a part between 1.5 px and a band (0.05 of the head's width `W`) inside
 * its edge whose luma is `RIM_LIFT` over its part's further in, a band on
 * (or at the part's deepest, for a thin part) along the line from the edge
 * (so a shade that crosses the part is the same on both), counted over the
 * band's width. Not counted: a band pixel nearer the silhouette than to any
 * inner line (the house rims the outside), and one nearer a face's mark (an
 * eye, a brow, the mouth) than to a line between parts.
 */
const innerRim = (read: Read, parts: ReadonlyArray<Part>, W: number): number => {
  const band = Math.max(3, Math.round(0.05 * W));
  const maps = rimMaps(read, W);
  let count = 0;
  for (const part of parts) {
    const box = partBox(read, part);
    for (let y = 0; y < box.bh; y++)
      for (let x = 0; x < box.bw; x++) if (rimPixel(read, box, maps, band, x, y)) count++;
  }
  return count / Math.max(1, band - 1.5);
};

/** The length, in pixels, of the line between the face and the hair regions `hairIds`: its ink pixels over the line's width. */
const interiorInk = (
  read: Read,
  face: Part,
  hairIds: ReadonlySet<number>,
  span: number,
): number => {
  if (hairIds.size === 0) return 0;
  const { w, h, ink, regions } = read;
  const nearFace = distanceTo(w, h, (i) => regions.labels[i] === face.id);
  const nearHair = distanceTo(w, h, (i) => hairIds.has(regions.labels[i]!));
  const within = span * span;
  let count = 0;
  for (let i = 0; i < w * h; i++)
    if (ink[i] === 1 && nearFace[i]! <= within && nearHair[i]! <= within) count++;
  return count / Math.max(1, read.line);
};
