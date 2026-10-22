/**
 * The field's repaint, pixel by pixel (`./field.ts` reads and writes the
 * files). From the painted field it makes the hero's still and the map its
 * wind reads:
 *
 * - `skyMask`: the sky, every pixel the ground cannot reach from the bottom
 *   edge without crossing sky-coloured paint.
 * - `withoutRays`: the left of the sky painted again from the middle of the
 *   same rows, which no ray crosses, so the rays that came from the top left
 *   are gone.
 * - `withoutHillStreaks`: the old rays' edges on the far hills left of the
 *   sun taken out, each edge's colour step spread away to nothing on both sides.
 * - `withSunLight`: the sun's light (`../src/motion/sun.ts`) laid on the sky
 *   as a screen of warm white.
 * - `windMap`: how far each pixel sways, 0 on the ground and at a plant's
 *   foot and rising toward its tip (red), and the sky (green).
 *
 * Every length is in the field's pixels at 3072 wide, scaled to the image.
 */
import { LIGHT, sunLight } from '../src/motion/sun.ts';

/** An image's pixels, four bytes (red, green, blue, alpha) to a pixel. */
export interface Pixels {
  readonly width: number;
  readonly height: number;
  readonly data: Uint8ClampedArray;
}

/** The columns of the sky no ray crosses, as shares of the width. */
const CLEAR_FROM = 0.42;
const CLEAR_TO = 0.62;
/** The last row the clear sky is sky in, as a share of the height. */
const HORIZON = 0.466;
/** The sky is painted again up to this share of the width, then blended over `FEATHER`. */
export const REPAINT_TO = 0.4;
const FEATHER = 48;
/** How far a pixel may stray from the row's sky, toward the light, and still be sky. */
const SKY_TOLERANCE = 0.06;

/** The WebP quality the stills ship at (`./field.ts`). */
export const QUALITY = 0.86;

/** The near plants' band, as shares of the height, and their ink. */
const BAND_TOP = 0.5;
const BAND_BOTTOM = 0.82;
const INK = 0.22;
/** A plant at its tallest, as a share of the height, from its foot. */
const TALLEST = 0.27;

const scaled = (image: Pixels, px: number) => Math.max(1, Math.round((px * image.width) / 3072));

/** A value of an array, 0 past its end. */
export const at = (values: ArrayLike<number>, i: number) => values[i] ?? 0;

const channel = (image: Pixels, i: number, k: number) => at(image.data, i * 4 + k) / 255;

/** The row's sky colour: the median of the clear columns, held below the horizon. */
const rowSky = (image: Pixels) => {
  const { width, height } = image;
  const from = Math.round(CLEAR_FROM * width);
  const to = Math.round(CLEAR_TO * width);
  const last = Math.round(HORIZON * height);
  const sky = new Float32Array(height * 3);
  for (let y = 0; y < height; y++) {
    const row = Math.min(y, last);
    for (let k = 0; k < 3; k++) {
      const values = Array.from({ length: to - from }, (_, x) =>
        channel(image, row * width + from + x, k),
      );
      values.sort((a, b) => a - b);
      sky[y * 3 + k] = at(values, values.length >> 1);
    }
  }
  return sky;
};

/**
 * Whether a pixel is its row's sky, brightened toward the light by any
 * amount: `skyLike(image, sky)(i)`, each row's sky and its line to the light
 * worked out once.
 */
const skyLike = (image: Pixels, sky: Float32Array) => {
  const toLight = Float64Array.from(sky, (b, j) => at(LIGHT, j % 3) - b);
  const along = Float64Array.from({ length: image.height }, (_, y) => {
    const [d0, d1, d2] = [at(toLight, y * 3), at(toLight, y * 3 + 1), at(toLight, y * 3 + 2)];
    return Math.max(d0 * d0 + d1 * d1 + d2 * d2, 1e-6);
  });
  return (i: number) => {
    const y = Math.floor(i / image.width);
    const c0 = channel(image, i, 0) - at(sky, y * 3);
    const c1 = channel(image, i, 1) - at(sky, y * 3 + 1);
    const c2 = channel(image, i, 2) - at(sky, y * 3 + 2);
    const [d0, d1, d2] = [at(toLight, y * 3), at(toLight, y * 3 + 1), at(toLight, y * 3 + 2)];
    const amount = Math.min(0.95, Math.max(0, (c0 * d0 + c1 * d1 + c2 * d2) / at(along, y)));
    return Math.hypot(c0 - amount * d0, c1 - amount * d1, c2 - amount * d2) < SKY_TOLERANCE;
  };
};

/** The pixels a flood reaches from its seeds through the pixels `open` lets it into. */
const flood = (
  width: number,
  height: number,
  seeds: ReadonlyArray<number>,
  open: (i: number) => boolean,
) => {
  const reached = new Uint8Array(width * height);
  const stack: Array<number> = [];
  const visit = (i: number) => {
    if (reached[i] === 0 && open(i)) {
      reached[i] = 1;
      stack.push(i);
    }
  };
  seeds.forEach(visit);
  while (stack.length > 0) {
    const i = stack.pop() ?? 0;
    const x = i % width;
    if (x > 0) visit(i - 1);
    if (x < width - 1) visit(i + 1);
    if (i >= width) visit(i - width);
    if (i < width * (height - 1)) visit(i + width);
  }
  return reached;
};

/**
 * The sky: 1 where the painting is sky, 0 on the land. The land is what a
 * flood from the bottom edge reaches through paint that is not sky; the sky
 * is the rest that a flood from the top edge reaches, so a sky-coloured
 * highlight inside a plant stays land.
 */
export const skyMask = (image: Pixels) => {
  const { width, height } = image;
  const isSky = skyLike(image, rowSky(image));
  const bottom = Array.from({ length: width }, (_, x) => (height - 1) * width + x);
  const ground = flood(width, height, bottom, (i) => i >= (height - 1) * width || !isSky(i));
  const top = Array.from({ length: width }, (_, x) => x);
  return flood(width, height, top, (i) => ground[i] === 0);
};

/** The painting with the left of its sky painted again from the clear middle of the same rows. */
export const withoutRays = (image: Pixels, sky: Uint8Array) => {
  const { width, height } = image;
  const out = new Uint8ClampedArray(image.data);
  const from = Math.round(CLEAR_FROM * width);
  const span = Math.round(CLEAR_TO * width) - from;
  const last = Math.round(HORIZON * height);
  const to = Math.round(REPAINT_TO * width);
  const feather = scaled(image, FEATHER);
  for (let y = 0; y < height; y++) {
    // Below the horizon the clear columns are hills, so the row is read from as far above it.
    const row = Math.max(0, y - 2 * Math.max(0, y - last));
    for (let x = 0; x < to + feather; x++) {
      const i = y * width + x;
      if (sky[i] === 0) continue;
      const m = x % (2 * span);
      const sx = from + Math.min(m, 2 * span - 1 - m);
      const j = row * width + sx;
      const w = Math.min(1, Math.max(0, 1 - (x - to) / feather));
      for (let k = 0; k < 3; k++)
        out[i * 4 + k] = w * at(image.data, j * 4 + k) + (1 - w) * at(image.data, i * 4 + k);
    }
  }
  return { width, height, data: out };
};

/** One old ray's edge on a far hill, in the field's pixels at 3072 wide. */
interface HillStreak {
  /** The edge from its top end to its bottom end: x, y, x, y. */
  readonly line: readonly [number, number, number, number];
  /** Red, green and blue on the edge's upper-right side minus its lower-left side. */
  readonly step: readonly [number, number, number];
  /** The hill's colour at the edge: the mean of its two sides. */
  readonly hill: readonly [number, number, number];
}

/**
 * The old rays' edges on the far hills left of the sun, measured off
 * `kit/art/field.webp`: each line set where the step across it is largest and
 * then on the middle of its rise, each step the trimmed mean of the colour
 * differences 3 to 9 px either side along the line, each hill colour the
 * medians 6 to 30 px either side. The edges of one ray are not one line: the
 * ray was painted a hill at a time.
 */
export const HILL_STREAKS: ReadonlyArray<HillStreak> = [
  { line: [439.5, 980.6, 522.7, 1087.2], step: [17, 9.5, -4.1], hill: [182.5, 213, 225.5] },
  { line: [960.6, 1005.6, 1046.3, 1076.9], step: [-10.5, -6.6, 3.6], hill: [176, 209.5, 229] },
  { line: [1038, 1070.9, 1091.6, 1127.3], step: [-7.6, -5.9, 2.5], hill: [144.5, 189.5, 220.5] },
  { line: [1288.1, 1068.3, 1350.3, 1133.3], step: [0.6, 1.2, 3.4], hill: [176, 210, 232] },
];
/** How far to each side an edge's step is spread, fading to nothing: far wider than the eye reads a step. */
const STREAK_FADE = 150;
/** How far past each end of an edge its lift fades out. */
const STREAK_TAPER = 24;
/** The edge's hill: pixels within this many levels of its colour in every channel, fading out over `STREAK_HILL_SOFT` more. */
const STREAK_HILL = 20;
const STREAK_HILL_SOFT = 16;
/** The rise's shape is read in bins this wide (px at 3072), `STREAK_REACH` each way. */
const STREAK_BIN = 0.25;
const STREAK_REACH = 8;

const smoothstep = (t: number) => {
  const u = Math.min(1, Math.max(0, t));
  return u * u * (3 - 2 * u);
};

/** A pixel's share of an edge's hill: 1 near its colour, 0 off it. */
const onHill = (image: Pixels, i: number, hill: HillStreak['hill']) => {
  const off = Math.max(...hill.map((h, k) => Math.abs(at(image.data, i * 4 + k) - h)));
  return 1 - smoothstep((off - STREAK_HILL) / STREAK_HILL_SOFT);
};

/** An edge's geometry in an image: its ends, length, along and across (up and right) in image pixels. */
const streakLine = (image: Pixels, streak: HillStreak) => {
  const s = image.width / 3072;
  const [x0, y0, x1, y1] = [
    streak.line[0] * s,
    streak.line[1] * s,
    streak.line[2] * s,
    streak.line[3] * s,
  ];
  const length = Math.hypot(x1 - x0, y1 - y0);
  const dx = (x1 - x0) / length;
  const dy = (y1 - y0) / length;
  return { s, x0, y0, x1, y1, length, dx, dy, nx: dy, ny: -dx };
};

/**
 * How an edge rises across, per channel, from -0.5 on its lower-left side to
 * 0.5 on its upper-right, read off the image's own pixels on its hill: the
 * median of each bin, smoothed, then made to rise only (the mean of a running
 * maximum from the left and a running minimum from the right, which leans
 * neither way).
 */
const riseOf = (image: Pixels, streak: HillStreak) => {
  const { width, height } = image;
  const g = streakLine(image, streak);
  const count = Math.round((2 * STREAK_REACH) / STREAK_BIN) + 1;
  const bins = Array.from({ length: 3 }, () => Array.from({ length: count }, (): number[] => []));
  const reach = (STREAK_REACH + 1) * g.s;
  for (
    let y = Math.max(0, Math.floor(Math.min(g.y0, g.y1) - reach));
    y <= Math.min(height - 1, Math.max(g.y0, g.y1) + reach);
    y++
  )
    for (
      let x = Math.max(0, Math.floor(Math.min(g.x0, g.x1) - reach));
      x <= Math.min(width - 1, Math.max(g.x0, g.x1) + reach);
      x++
    ) {
      const t = (x - g.x0) * g.dx + (y - g.y0) * g.dy;
      const d = ((x - g.x0) * g.nx + (y - g.y0) * g.ny) / g.s;
      const i = y * width + x;
      if (t < 0 || t > g.length || Math.abs(d) > STREAK_REACH || onHill(image, i, streak.hill) < 1)
        continue;
      const bin = Math.round((d + STREAK_REACH) / STREAK_BIN);
      for (let k = 0; k < 3; k++) bins[k]?.[bin]?.push(at(image.data, i * 4 + k));
    }
  return bins.map((channel, k) => {
    const medians = channel.map((values) => {
      if (values.length === 0) return Number.NaN;
      const sorted = values.toSorted((a, b) => a - b);
      return at(sorted, sorted.length >> 1);
    });
    const smooth = medians.map((_, b) => {
      const near = medians.slice(Math.max(0, b - 2), b + 3).filter((v) => !Number.isNaN(v));
      return near.reduce((sum, v) => sum + v, 0) / Math.max(1, near.length);
    });
    const ends = (from: number) =>
      (at(smooth, from) + at(smooth, from + 4) + at(smooth, from + 8)) / 3;
    const low = ends(0);
    const high = ends(count - 9);
    const step = at(streak.step, k);
    // A channel that barely steps has no rise to read: a straight ramp 2 px each way.
    const shares = smooth.map((v, b) => {
      const d = -STREAK_REACH + b * STREAK_BIN;
      if (Math.abs(high - low) < 2 || Math.abs(step) < 2)
        return Math.max(-0.5, Math.min(0.5, d / 4));
      if (b < 4) return -0.5;
      if (b > count - 5) return 0.5;
      return Math.max(-0.5, Math.min(0.5, (v - (low + high) / 2) / (high - low)));
    });
    const up = shares.map((_, b) => Math.max(...shares.slice(0, b + 1)));
    const down = shares.map((_, b) => Math.min(...shares.slice(b)));
    return shares.map((_, b) => (at(up, b) + at(down, b)) / 2);
  });
};

/** A channel's share of an edge's step at `d` px across it (in the master's pixels), read off its rise. */
const riseAt = (rise: ReadonlyArray<number>, d: number) => {
  const f = Math.min(1, Math.max(0, (d + STREAK_REACH) / (2 * STREAK_REACH))) * (rise.length - 1);
  const b = Math.floor(f);
  return at(rise, b) + (f - b) * (at(rise, Math.min(rise.length - 1, b + 1)) - at(rise, b));
};

/** Adds one edge's lift to `delta` (three channels a pixel): its step times its rise, faded off. */
const liftStreak = (image: Pixels, sky: Uint8Array, streak: HillStreak, delta: Float32Array) => {
  const { width, height } = image;
  const g = streakLine(image, streak);
  const rise = riseOf(image, streak);
  const fade = STREAK_FADE * g.s;
  const taper = STREAK_TAPER * g.s;
  const reach = fade + taper;
  const top = Math.max(0, Math.floor(Math.min(g.y0, g.y1) - reach));
  const bottom = Math.min(height - 1, Math.ceil(Math.max(g.y0, g.y1) + reach));
  const left = Math.max(0, Math.floor(Math.min(g.x0, g.x1) - reach));
  const right = Math.min(width - 1, Math.ceil(Math.max(g.x0, g.x1) + reach));
  for (let y = top; y <= bottom; y++)
    for (let x = left; x <= right; x++) {
      const i = y * width + x;
      const t = (x - g.x0) * g.dx + (y - g.y0) * g.dy;
      const d = (x - g.x0) * g.nx + (y - g.y0) * g.ny;
      const past = Math.max(-t, t - g.length, 0);
      if (sky[i] === 1 || Math.abs(d) > fade || past > taper) continue;
      const weight =
        (1 - smoothstep(Math.abs(d) / fade)) *
        (1 - smoothstep(past / taper)) *
        onHill(image, i, streak.hill);
      for (let k = 0; k < 3; k++)
        delta[i * 3 + k] =
          at(delta, i * 3 + k) + riseAt(rise[k] ?? [], d / g.s) * weight * at(streak.step, k);
    }
};

/**
 * The painting with the old rays' edges on its far hills taken out: each
 * edge's step, half taken off its lighter side and half given to its darker
 * side, following the edge's own rise across and fading to nothing
 * `STREAK_FADE` px away and `STREAK_TAPER` px past its ends, so no edge is
 * left and no band is made. Only the edge's own hill moves; the sky, the
 * trees and the other hills keep every pixel.
 */
export const withoutHillStreaks = (image: Pixels, sky: Uint8Array) => {
  const { width, height } = image;
  const delta = new Float32Array(width * height * 3);
  for (const streak of HILL_STREAKS) liftStreak(image, sky, streak, delta);
  const out = new Uint8ClampedArray(image.data);
  for (let i = 0; i < width * height; i++)
    for (let k = 0; k < 3; k++)
      out[i * 4 + k] = Math.round(at(image.data, i * 4 + k) - at(delta, i * 3 + k));
  return { width, height, data: out };
};

/** The painting with the sun's light screened over its sky. */
export const withSunLight = (image: Pixels, sky: Uint8Array) => {
  const { width, height } = image;
  const out = new Uint8ClampedArray(image.data);
  for (let y = 0; y < height; y++)
    for (let x = 0; x < width; x++) {
      const i = y * width + x;
      if (sky[i] === 0) continue;
      const a = sunLight((x + 0.5) / width, (y + 0.5) / height);
      for (let k = 0; k < 3; k++) {
        const c = at(image.data, i * 4 + k) / 255;
        out[i * 4 + k] = 255 * (1 - (1 - c) * (1 - a * at(LIGHT, k)));
      }
    }
  return { width, height, data: out };
};

/** A square grown around every set pixel, `r` pixels each way. */
export const grown = (width: number, height: number, mask: Uint8Array, r: number) => {
  const across = new Uint8Array(width * height);
  const out = new Uint8Array(width * height);
  const span = (get: (n: number) => number, set: (n: number) => void, length: number) => {
    let last = -Infinity;
    for (let n = 0; n < length; n++) {
      if (get(n)) last = n;
      if (n - last <= r) set(n);
    }
    last = Infinity;
    for (let n = length - 1; n >= 0; n--) {
      if (get(n)) last = n;
      if (last - n <= r) set(n);
    }
  };
  for (let y = 0; y < height; y++)
    span(
      (x) => at(mask, y * width + x),
      (x) => (across[y * width + x] = 1),
      width,
    );
  for (let x = 0; x < width; x++)
    span(
      (y) => at(across, y * width + x),
      (y) => (out[y * width + x] = 1),
      height,
    );
  return out;
};

/** The mask with its gaps narrower than `2r` closed. */
const closed = (width: number, height: number, mask: Uint8Array, r: number) =>
  grown(
    width,
    height,
    grown(width, height, mask, r).map((m) => 1 - m),
    r,
  ).map((m) => 1 - m);

/** A box blur, three times over, which is near enough a Gaussian. */
export const blurred = (width: number, height: number, field: Float32Array, r: number) => {
  let f = field;
  const pass = (
    src: Float32Array,
    step: number,
    length: number,
    lines: number,
    lineStep: number,
  ) => {
    const out = new Float32Array(src.length);
    for (let l = 0; l < lines; l++) {
      const read = (n: number) =>
        at(src, l * lineStep + Math.min(length - 1, Math.max(0, n)) * step);
      let sum = 0;
      for (let n = -r; n <= r; n++) sum += read(n);
      for (let n = 0; n < length; n++) {
        out[l * lineStep + n * step] = sum / (2 * r + 1);
        sum += read(n + r + 1) - read(n - r);
      }
    }
    return out;
  };
  for (let k = 0; k < 3; k++) f = pass(pass(f, 1, width, height, width), width, height, width, 1);
  return f;
};

/** The near plants: their ink, and all the ink closes off from the land around them. */
export const plantMask = (image: Pixels) => {
  const { width, height } = image;
  const top = Math.round(BAND_TOP * height);
  const bottom = Math.round(BAND_BOTTOM * height);
  const ink = new Uint8Array(width * height);
  for (let y = top; y < bottom; y++)
    for (let x = 0; x < width; x++) {
      const i = y * width + x;
      const luma =
        0.299 * channel(image, i, 0) + 0.587 * channel(image, i, 1) + 0.114 * channel(image, i, 2);
      if (luma < INK) ink[i] = 1;
    }
  const wall = grown(width, height, ink, scaled(image, 3));
  const edges = Array.from({ length: width }, (_, x) => [
    top * width + x,
    (bottom - 1) * width + x,
  ]).flat();
  const land = flood(width, height, edges, (i) => {
    const y = Math.floor(i / width);
    return y >= top && y < bottom && wall[i] === 0;
  });
  const plants = new Uint8Array(width * height);
  for (let i = top * width; i < bottom * width; i++) plants[i] = 1 - at(land, i);
  return closed(width, height, plants, scaled(image, 20));
};

/** Each column's foot: the lowest plant pixel near it, or -1 where no plant stands. */
const feet = (width: number, height: number, plants: Uint8Array, reach: number) => {
  const lowest = Array.from({ length: width }, (_, x) => {
    for (let y = height - 1; y >= 0; y--) if (plants[y * width + x]) return y;
    return -1;
  });
  return lowest.map((_, x) =>
    Math.max(...lowest.slice(Math.max(0, x - reach), Math.min(width, x + reach + 1))),
  );
};

/**
 * The wind's map, as pixels: red, how far a pixel sways (0 at a plant's foot,
 * rising to 1 at the tallest plant's tip, and carried a little past each
 * plant's edge so the paint around it moves with it); green, the sky.
 */
export const windMap = (image: Pixels, sky: Uint8Array) => {
  const { width, height } = image;
  const plants = plantMask(image);
  const foot = feet(width, height, plants, scaled(image, 40));
  const carried = grown(width, height, plants, scaled(image, 12));
  const tallest = TALLEST * height;
  const sway = new Float32Array(width * height);
  for (let y = 0; y < height; y++)
    for (let x = 0; x < width; x++) {
      const i = y * width + x;
      const base = at(foot, x);
      if (carried[i] === 0 || base < 0) continue;
      sway[i] = Math.min(1, Math.max(0, (base - y) / tallest)) ** 1.5;
    }
  const soft = blurred(width, height, sway, scaled(image, 6));
  const air = blurred(width, height, Float32Array.from(sky), scaled(image, 4));
  const data = new Uint8ClampedArray(width * height * 4);
  for (let i = 0; i < width * height; i++) {
    data[i * 4] = Math.round(at(soft, i) * 255);
    data[i * 4 + 1] = Math.round(at(air, i) * 255);
    data[i * 4 + 3] = 255;
  }
  return { width, height, data };
};
