// The pixel reads under a cast sheet's measure (`cast-sheet.ts`): the sheet's
// ink rings and the figures they draw, what the ink closes inside a figure,
// its regions of one fill and their colours, the dark fills (hair, a beard)
// apart from the ink, a garment's papers, and two views compared pixel by
// pixel, flipped or not. Pure: RGBA in, numbers out; every loop indexes its
// typed arrays inside their bounds.

import type { Raster } from './raster.ts';
import { scaleRaster } from './raster.ts';

/** A colour: red, green, blue. */
export type Rgb = readonly [number, number, number];

/** A box in a picture's pixels: left, top, right, bottom (the right and bottom edges outside it). */
export type Box = readonly [number, number, number, number];

export const lumaOf = (c: Rgb): number => 0.299 * c[0] + 0.587 * c[1] + 0.114 * c[2];

/** A colour in CIE Lab (D65), for distances the eye reads alike. */
export const labOf = (c: Rgb): Rgb => {
  const lin = (v: number) => {
    const x = v / 255;
    return x <= 0.04045 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4;
  };
  const [R, G, B] = [lin(c[0]), lin(c[1]), lin(c[2])];
  const X = (0.4124 * R + 0.3576 * G + 0.1805 * B) / 0.95047;
  const Y = 0.2126 * R + 0.7152 * G + 0.0722 * B;
  const Z = (0.0193 * R + 0.1192 * G + 0.9505 * B) / 1.08883;
  const f = (t: number) => (t > 216 / 24389 ? Math.cbrt(t) : ((24389 / 27) * t + 16) / 116);
  return [116 * f(Y) - 16, 500 * (f(X) - f(Y)), 200 * (f(Y) - f(Z))];
};

/** ΔE76: the distance of two Lab colours. */
export const deltaE = (a: Rgb, b: Rgb): number => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);

/** A colour as a prompt writes it: `#rrggbb`. */
export const hexOf = (rgb: ReadonlyArray<number>) =>
  `#${rgb.map((v) => v.toString(16).padStart(2, '0')).join('')}`;

/** The hue names a paper takes, each up to its hue's upper bound in degrees. */
const HUES: ReadonlyArray<readonly [number, string]> = [
  [15, 'red'],
  [30, 'orange'],
  [55, 'gold'],
  [70, 'yellow'],
  [165, 'green'],
  [200, 'teal'],
  [250, 'blue'],
  [290, 'violet'],
  [340, 'lilac'],
  [360, 'red'],
];

/** A colour's hue in degrees, 0–360: its red, green and blue as shares, their largest, and its spread over the smallest. */
const hueOf = (r: number, g: number, b: number, max: number, d: number): number =>
  60 * (max === r ? ((g - b) / d + 6) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4);

/** A hue's name at a lightness: a light warm is cream, a dark one brown, a light red pink; very light is pale, very dark deep. */
const hueWords = (name: string, light: number): string => {
  const warm = name === 'orange' || name === 'gold' || name === 'yellow';
  if (warm && light > 0.85) return 'cream';
  if ((warm || name === 'red') && light < 0.45) return 'brown';
  const named = (name === 'red' && light > 0.7 && 'pink') || name;
  return (light > 0.8 && `pale ${named}`) || (light < 0.35 && `deep ${named}`) || named;
};

/** A colour in plain words, for a prompt beside its hex: "cream", "gold", "pale lilac", "deep blue", "brown". */
export const colourWords = (c: Rgb): string => {
  const [r, g, b] = [c[0] / 255, c[1] / 255, c[2] / 255];
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const light = (max + min) / 2;
  const d = max - min;
  const saturation = d === 0 ? 0 : d / (1 - Math.abs(2 * light - 1));
  if (saturation < 0.12)
    return (
      (light > 0.9 && 'white') ||
      (light > 0.7 && 'pale grey') ||
      (light > 0.3 && 'grey') ||
      'near black'
    );
  const hue = hueOf(r, g, b, max, d);
  return hueWords(
    HUES.reduceRight((named, [upTo, word]) => (hue < upTo ? word : named), 'red'),
    light,
  );
};

/** A colour's saturation and value, each 0–1. */
interface SaturationValue {
  readonly saturation: number;
  readonly value: number;
}

export const saturationValueOf = (c: Rgb): SaturationValue => {
  const max = Math.max(c[0], c[1], c[2]) / 255;
  const min = Math.min(c[0], c[1], c[2]) / 255;
  return { saturation: max === 0 ? 0 : (max - min) / max, value: max };
};

export const rgbAt = (r: Raster, i: number): Rgb => [
  r.rgba[i * 4]!,
  r.rgba[i * 4 + 1]!,
  r.rgba[i * 4 + 2]!,
];

const median = (xs: Array<number>): number => {
  xs.sort((a, b) => a - b);
  return xs[Math.floor(xs.length / 2)] ?? 0;
};

/** The median colour of the pixels `at` lists in `r`, sampled at most `most` of them evenly. */
const medianColour = (r: Raster, at: ReadonlyArray<number>, most = 4000): Rgb => {
  const step = Math.max(1, Math.floor(at.length / most));
  const ch: [Array<number>, Array<number>, Array<number>] = [[], [], []];
  for (let k = 0; k < at.length; k += step) {
    const i = at[k]!;
    ch[0].push(r.rgba[i * 4]!);
    ch[1].push(r.rgba[i * 4 + 1]!);
    ch[2].push(r.rgba[i * 4 + 2]!);
  }
  return [median(ch[0]), median(ch[1]), median(ch[2])];
};

/** A connected run of pixels: its label, its box and its size. */
interface Component {
  readonly id: number;
  readonly box: Box;
  readonly area: number;
}

/**
 * The connected components of `mask` (1 where in) in a `w` × `h` picture,
 * eight ways or four, and each pixel's label (-1 where out).
 */
interface Labelled {
  readonly components: ReadonlyArray<Component>;
  readonly labels: Int32Array;
}

export const componentsOf = (mask: Uint8Array, w: number, h: number, eight: boolean): Labelled => {
  const labels = new Int32Array(w * h).fill(-1);
  const components: Array<Component> = [];
  const queue = new Int32Array(w * h);
  const steps = eight
    ? [
        [1, 0],
        [-1, 0],
        [0, 1],
        [0, -1],
        [1, 1],
        [1, -1],
        [-1, 1],
        [-1, -1],
      ]
    : [
        [1, 0],
        [-1, 0],
        [0, 1],
        [0, -1],
      ];
  for (let s = 0; s < w * h; s++) {
    if (mask[s] !== 1 || labels[s] !== -1) continue;
    const id = components.length;
    let [x0, y0, x1, y1, area, end] = [w, h, 0, 0, 0, 0];
    labels[s] = id;
    queue[end++] = s;
    for (let q = 0; q < end; q++) {
      const i = queue[q]!;
      const x = i % w;
      const y = (i - x) / w;
      area++;
      x0 = Math.min(x0, x);
      y0 = Math.min(y0, y);
      x1 = Math.max(x1, x + 1);
      y1 = Math.max(y1, y + 1);
      for (const [dx, dy] of steps) {
        const nx = x + dx!;
        const ny = y + dy!;
        if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
        const j = ny * w + nx;
        if (mask[j] === 1 && labels[j] === -1) {
          labels[j] = id;
          queue[end++] = j;
        }
      }
    }
    components.push({ id, box: [x0, y0, x1, y1], area });
  }
  return { components, labels };
};

/** A sheet's ink: a pixel darker than this luma is a line or a mark. */
const INK_LUMA = 75;

/** A figure on a sheet: its body's ink ring, and its box with the marks, hands and feet beside it joined. */
export interface SheetFigure {
  readonly body: Box;
  readonly box: Box;
}

const boxArea = (b: Box) => (b[2] - b[0]) * (b[3] - b[1]);

/** An ink ring whose box is under this share of the largest one's is a part (a hand, a foot), never a figure of its own. */
const BODY_SHARE = 0.15;

/**
 * The `count` figures on a sheet, left to right: its `count` largest ink
 * rings by box, each at least `BODY_SHARE` of the largest, each joined by the
 * smaller ink nearest it (a hand, a foot, a mark) within six tenths of its
 * width. A sheet with fewer figures than `count` answers fewer; `found`
 * counts every ring that big, so a sheet that draws more is said.
 */
/** The figures a sheet's measure reads, and how many it found. */
interface SheetFigures {
  readonly figures: ReadonlyArray<SheetFigure>;
  /** Every ink ring big enough to be a figure, read or not. */
  readonly found: number;
}

export const figuresOf = (r: Raster, count: number): SheetFigures => {
  const { width: w, height: h } = r;
  const { components } = componentsOf(inkByLuma(r), w, h, true);
  const largest = [...components].sort((a, b) => boxArea(b.box) - boxArea(a.box));
  const least = BODY_SHARE * boxArea(largest[0]?.box ?? [0, 0, 0, 0]);
  const big = largest.filter((c) => boxArea(c.box) >= least);
  const bodies = big.slice(0, count).sort((a, b) => a.box[0] - b.box[0]);
  const boxes = bodies.map((b): [number, number, number, number] => [...b.box]);
  for (const c of components) {
    if (bodies.includes(c) || c.area <= 40) continue;
    const cx = (c.box[0] + c.box[2]) / 2;
    let best = -1;
    let gap = Number.POSITIVE_INFINITY;
    bodies.forEach((b, k) => {
      const g = cx < b.box[0] ? b.box[0] - cx : cx > b.box[2] ? cx - b.box[2] : 0;
      if (g < gap) [best, gap] = [k, g];
    });
    const body = bodies[best];
    const into = boxes[best];
    if (body === undefined || into === undefined || gap > 0.6 * (body.box[2] - body.box[0]))
      continue;
    into[0] = Math.min(into[0], c.box[0]);
    into[1] = Math.min(into[1], c.box[1]);
    into[2] = Math.max(into[2], c.box[2]);
    into[3] = Math.max(into[3], c.box[3]);
  }
  const figures = bodies.map((b, k) => ({ body: b.box, box: boxes[k] ?? b.box }));
  return { figures, found: big.length } satisfies SheetFigures;
};

/**
 * A sheet laid on white paper: each pixel's colour weighed by its alpha over
 * white. The route can answer with the paper left out, every pixel round
 * the figures transparent and its colour one no eye sees; read as it is,
 * that colour is as dark as ink and joins every figure into one.
 */
export const opaqueOf = (r: Raster): Raster => {
  const rgba = Uint8Array.from(r.rgba);
  for (let i = 0; i < rgba.length; i += 4) {
    const a = (rgba[i + 3] ?? 255) / 255;
    for (let c = 0; c < 3; c++) rgba[i + c] = Math.round(a * (rgba[i + c] ?? 255) + (1 - a) * 255);
    rgba[i + 3] = 255;
  }
  return { width: r.width, height: r.height, rgba };
};

/** A sheet's ink by its darkness alone: 1 darker than a line's luma. */
export const inkByLuma = (r: Raster): Uint8Array => {
  const ink = new Uint8Array(r.width * r.height);
  for (let i = 0; i < ink.length; i++) ink[i] = lumaOf(rgbAt(r, i)) < INK_LUMA ? 1 : 0;
  return ink;
};

/** What a walk from the picture's border reaches without crossing ink: 1 outside every closed shape. */
export const outsideOf = (r: Raster, ink: Uint8Array): Uint8Array => {
  const { width: w, height: h } = r;
  const open = new Uint8Array(w * h);
  for (let i = 0; i < w * h; i++) open[i] = ink[i] === 1 ? 0 : 1;
  const { labels } = componentsOf(open, w, h, false);
  const border = new Set<number>();
  for (let x = 0; x < w; x++) border.add(labels[x]!).add(labels[(h - 1) * w + x]!);
  for (let y = 0; y < h; y++) border.add(labels[y * w]!).add(labels[y * w + w - 1]!);
  const outside = new Uint8Array(w * h);
  for (let i = 0; i < w * h; i++) outside[i] = border.has(labels[i]!) && labels[i]! >= 0 ? 1 : 0;
  return outside;
};

/** A region of one fill inside a figure: its box, its size, its pixels' median colour, and its pixels. */
export interface Region {
  readonly box: Box;
  readonly area: number;
  readonly colour: Rgb;
  readonly pixels: ReadonlyArray<number>;
}

/** The regions `mask` (1 where in) holds, four-connected, each with its median colour; the ones under `least` pixels left out. */
export const regionsOf = (r: Raster, mask: Uint8Array, least: number): ReadonlyArray<Region> => {
  const { components, labels } = componentsOf(mask, r.width, r.height, false);
  const pixels: Array<Array<number>> = components.map(() => []);
  for (let i = 0; i < labels.length; i++) if (labels[i]! >= 0) pixels[labels[i]!]!.push(i);
  return components
    .filter((c) => c.area >= least)
    .map((c) => ({
      box: c.box,
      area: c.area,
      colour: medianColour(r, pixels[c.id]!),
      pixels: pixels[c.id]!,
    }));
};

/** A garment's paper: its colour, its Lab and its share of the garment. */
interface Paper {
  readonly rgb: Rgb;
  readonly lab: Rgb;
  readonly share: number;
}

/** Four colour clusters of the pixels `at` lists (k-means in Lab, seeded by lightness quartiles), the ones over 4 % of them, largest first. */
export const papersOf = (r: Raster, at: ReadonlyArray<number>): ReadonlyArray<Paper> => {
  if (at.length < 50) return [];
  const step = Math.max(1, Math.floor(at.length / 3000));
  const pts: Array<{ rgb: Rgb; lab: Rgb }> = [];
  for (let k = 0; k < at.length; k += step) {
    const rgb = rgbAt(r, at[k]!);
    pts.push({ rgb, lab: labOf(rgb) });
  }
  const sorted = [...pts].sort((a, b) => a.lab[0] - b.lab[0]);
  let centres: Array<Rgb> = [0.12, 0.38, 0.62, 0.88].map(
    (q) => sorted[Math.floor(q * (sorted.length - 1))]!.lab,
  );
  let assign = new Int32Array(pts.length);
  for (let it = 0; it < 10; it++) {
    assign = Int32Array.from(pts, (p) => {
      let best = 0;
      centres.forEach((c, k) => {
        if (deltaE(p.lab, c) < deltaE(p.lab, centres[best]!)) best = k;
      });
      return best;
    });
    centres = centres.map((c, k) => {
      const mine = pts.filter((_, i) => assign[i] === k);
      if (mine.length === 0) return c;
      const mean = (d: number) => mine.reduce((s, p) => s + p.lab[d]!, 0) / mine.length;
      return [mean(0), mean(1), mean(2)];
    });
  }
  return centres
    .map((lab, k) => {
      const mine = pts.filter((_, i) => assign[i] === k);
      const mean = (d: number) =>
        Math.round(mine.reduce((s, p) => s + p.rgb[d]!, 0) / Math.max(1, mine.length));
      return { rgb: [mean(0), mean(1), mean(2)] as const, lab, share: mine.length / pts.length };
    })
    .filter((p) => p.share > 0.04)
    .sort((a, b) => b.share - a.share);
};

/**
 * Which side of a garment is lit: each row's outer sixth on either side,
 * its median Lab, and the rows that vote left or right (by two levels of
 * lightness or more). The house shade turns a cloth toward violet, never
 * toward yellow, so a row whose darker side is yellower than its lighter
 * one by more than `SHADE_YELLOWER` is two papers (a gold sash at one edge),
 * not light and shade, and does not vote.
 */
interface LitVotes {
  readonly left: number;
  readonly right: number;
}

const SHADE_YELLOWER = 6;

const medianLab = (r: Raster, part: ReadonlyArray<number>): Rgb => {
  const labs = part.map((i) => labOf(rgbAt(r, i)));
  return [
    median(labs.map((l) => l[0])),
    median(labs.map((l) => l[1])),
    median(labs.map((l) => l[2])),
  ];
};

export const litSideOf = (r: Raster, rows: ReadonlyArray<ReadonlyArray<number>>): LitVotes => {
  let [left, right] = [0, 0];
  for (const row of rows) {
    if (row.length < 12) continue;
    const xs = [...row].sort((a, b) => a - b);
    const cut = Math.max(3, Math.floor(xs.length / 6));
    const [l, rr] = [medianLab(r, xs.slice(0, cut)), medianLab(r, xs.slice(xs.length - cut))];
    const [lit, dark] = l[0] >= rr[0] ? [l, rr] : [rr, l];
    if (dark[2] - lit[2] > SHADE_YELLOWER) continue;
    if (l[0] > rr[0] + 2) left++;
    else if (rr[0] > l[0] + 2) right++;
  }
  return { left, right };
};

/**
 * The mean luma difference of `a` against `b`, both scaled to one height and
 * one width, `b` flipped left to right or not: near nothing flipped is a
 * mirror; less unflipped than flipped, the two face the same way.
 */
export const pairDiff = (a: Raster, b: Raster, flip: boolean): number => {
  const H = 300;
  const sa = scaleRaster(a, H / a.height);
  const sb = scaleRaster(b, H / b.height);
  const w = Math.min(sa.width, sb.width);
  let [sum, n] = [0, 0];
  for (let y = 0; y < Math.min(sa.height, sb.height); y++)
    for (let x = 0; x < w; x++) {
      const ia = y * sa.width + Math.round((x * (sa.width - 1)) / Math.max(1, w - 1));
      const xs = Math.round((x * (sb.width - 1)) / Math.max(1, w - 1));
      const ib = y * sb.width + (flip ? sb.width - 1 - xs : xs);
      sum += Math.abs(lumaOf(rgbAt(sa, ia)) - lumaOf(rgbAt(sb, ib)));
      n++;
    }
  return sum / Math.max(1, n);
};

/** The label `labels` gives the first pixel down the column band that `ok` admits, scanning rows `from` to `to` (either way), columns nearest `cx` first within `half`. */
export const firstLabelIn = (
  labels: Int32Array,
  w: number,
  scan: { readonly from: number; readonly to: number; readonly cx: number; readonly half: number },
  ok: (id: number) => boolean,
): number => {
  const dir = scan.to >= scan.from ? 1 : -1;
  for (let y = Math.round(scan.from); dir * (y - scan.to) <= 0; y += dir)
    for (let d = 0; d <= scan.half; d++)
      for (const x of d === 0
        ? [Math.round(scan.cx)]
        : [Math.round(scan.cx - d), Math.round(scan.cx + d)]) {
        const id = labels[y * w + x];
        if (x >= 0 && x < w && id !== undefined && id >= 0 && ok(id)) return id;
      }
  return -1;
};

/**
 * The share of the ring round a region, `near` to `depth` steps out from it
 * (four-connected), that `test` admits: what a region meets just past its
 * own edge, the soft pixels on that edge left out.
 */
export const ringShareOf = (
  r: Raster,
  region: Region,
  ring: { readonly near: number; readonly depth: number },
  test: (i: number) => boolean,
): number => {
  const { width: w, height: h } = r;
  const { depth } = ring;
  const [x0, y0, x1, y1] = region.box;
  const bx0 = Math.max(0, x0 - depth);
  const by0 = Math.max(0, y0 - depth);
  const bw = Math.min(w - 1, x1 + depth) - bx0 + 1;
  const bh = Math.min(h - 1, y1 + depth) - by0 + 1;
  const dist = new Int16Array(bw * bh).fill(-1);
  const queue = new Int32Array(bw * bh);
  let [head, tail] = [0, 0];
  for (const i of region.pixels) {
    const k = (Math.floor(i / w) - by0) * bw + ((i % w) - bx0);
    if (dist[k] === -1) {
      dist[k] = 0;
      queue[tail++] = k;
    }
  }
  let [admitted, total] = [0, 0];
  while (head < tail) {
    const k = queue[head++]!;
    const d = dist[k]!;
    const [x, y] = [k % bw, Math.floor(k / bw)];
    if (d >= ring.near) {
      total++;
      if (test((by0 + y) * w + bx0 + x)) admitted++;
    }
    if (d === depth) continue;
    for (const [dx, dy] of FOUR) {
      const [nx, ny] = [x + dx, y + dy];
      if (nx < 0 || ny < 0 || nx >= bw || ny >= bh || dist[ny * bw + nx] !== -1) continue;
      dist[ny * bw + nx] = d + 1;
      queue[tail++] = ny * bw + nx;
    }
  }
  return total === 0 ? 0 : admitted / total;
};

const FOUR: ReadonlyArray<readonly [number, number]> = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
];

/** How long an arc of the circle of `radius` round (`x`, `y`), two pixels wide, `labels` gives `id`: where a thing joined to it crosses that circle. */
export const arcOf = (
  labels: Int32Array,
  w: number,
  circle: { readonly x: number; readonly y: number; readonly radius: number },
  id: number,
): number => {
  const h = labels.length / w;
  const reach = Math.ceil(circle.radius + 2);
  let n = 0;
  for (
    let y = Math.max(0, Math.floor(circle.y - reach));
    y <= Math.min(h - 1, circle.y + reach);
    y++
  )
    for (
      let x = Math.max(0, Math.floor(circle.x - reach));
      x <= Math.min(w - 1, circle.x + reach);
      x++
    ) {
      const d = Math.hypot(x - circle.x, y - circle.y);
      if (d >= circle.radius && d < circle.radius + 2 && labels[y * w + x] === id) n++;
    }
  return n / 2;
};

/**
 * The label `labels` gives the first pixel `ok` admits down the columns of a
 * band, columns nearest `cx` first, each column walked from `from` until it
 * meets `ink` after something else: what lies under a mark inside one
 * outline. Ink at a column's top (the mark itself) is passed over.
 */
export const firstLabelInside = (
  labels: Int32Array,
  ink: Uint8Array,
  w: number,
  scan: { readonly from: number; readonly to: number; readonly cx: number; readonly half: number },
  ok: (id: number) => boolean,
): number => {
  for (let d = 0; d <= scan.half; d++)
    for (const x of d === 0
      ? [Math.round(scan.cx)]
      : [Math.round(scan.cx - d), Math.round(scan.cx + d)]) {
      if (x < 0 || x >= w) continue;
      const id = firstInColumn(labels, ink, w, x, scan, ok);
      if (id >= 0) return id;
    }
  return -1;
};

/** One column of `firstLabelInside`'s walk: the first label `ok` admits before ink met after something else, -1 when none. */
const firstInColumn = (
  labels: Int32Array,
  ink: Uint8Array,
  w: number,
  x: number,
  scan: { readonly from: number; readonly to: number },
  ok: (id: number) => boolean,
): number => {
  const h = labels.length / w;
  let past = false;
  for (let y = Math.max(0, Math.round(scan.from)); y <= scan.to && y < h; y++) {
    const i = y * w + x;
    if (ink[i] === 1 && past) return -1;
    past = past || ink[i] !== 1;
    const id = labels[i] ?? -1;
    if (ink[i] !== 1 && id >= 0 && ok(id)) return id;
  }
  return -1;
};
