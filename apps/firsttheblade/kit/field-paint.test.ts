import { describe, expect, test } from 'bun:test';

import {
  HILL_STREAKS,
  type Pixels,
  at,
  skyMask,
  windMap,
  withSunLight,
  withoutHillStreaks,
  withoutRays,
} from './field-paint.ts';

const WIDTH = 96;
const HEIGHT = 64;
/** The field in small: sky above this row, land below. */
const LAND_FROM = 32;

type Colour = readonly [number, number, number];

const SKY: Colour = [186, 201, 219];
const LAND: Colour = [67, 119, 66];
const INK: Colour = [20, 30, 25];
const RAY: Colour = [250, 245, 230];

/** The bare field's colour in a row: sky above the land, land below. */
const bare = (y: number) => {
  if (y < LAND_FROM) return SKY;
  return LAND;
};

/** A small field: sky, land, and whatever else `paint` lays on it. */
const field = (paint: (x: number, y: number) => Colour | false = () => false): Pixels => {
  const data = new Uint8ClampedArray(WIDTH * HEIGHT * 4);
  for (let y = 0; y < HEIGHT; y++)
    for (let x = 0; x < WIDTH; x++) {
      const laid = paint(x, y);
      const colour = laid || bare(y);
      data.set([...colour, 255], (y * WIDTH + x) * 4);
    }
  return { width: WIDTH, height: HEIGHT, data };
};

const pixel = (image: Pixels, x: number, y: number) =>
  Array.from(image.data.subarray((y * WIDTH + x) * 4, (y * WIDTH + x) * 4 + 3));

const sum = (values: ReadonlyArray<number>) => values.reduce((s, v) => s + v, 0);

/** The sky as `skyMask` should find it: every row above the land. */
const skyRows = Uint8Array.from({ length: WIDTH * HEIGHT }, (_, i) =>
  Number(i < LAND_FROM * WIDTH),
);

describe('the field’s repaint', () => {
  test('finds the sky down to the land, and keeps a sky-coloured fleck in the land as land', () => {
    const fleck = field((x, y) => x >= 20 && x < 22 && y >= 45 && y < 47 && SKY);
    const sky = skyMask(fleck);
    expect(at(sky, 5 * WIDTH + 10)).toBe(1);
    expect(at(sky, 31 * WIDTH + 90)).toBe(1);
    expect(at(sky, 40 * WIDTH + 10)).toBe(0);
    expect(at(sky, 45 * WIDTH + 20)).toBe(0);
  });

  test('paints the left of the sky again from its clear middle, so a ray there is gone', () => {
    const rayed = field((x, y) => y < LAND_FROM && Math.abs(x - y) < 3 && x < 30 && RAY);
    const cleared = withoutRays(rayed, skyRows);
    expect(pixel(rayed, 10, 10)).toEqual([...RAY]);
    expect(pixel(cleared, 10, 10)).toEqual([...SKY]);
    expect(pixel(cleared, 50, 50)).toEqual([...LAND]);
  });

  test('lays the sun’s light on the sky only, strongest near the sun', () => {
    const lit = withSunLight(field(), skyRows);
    const near = sum(pixel(lit, 80, 28)) - sum([...SKY]);
    const far = sum(pixel(lit, 5, 5)) - sum([...SKY]);
    expect(near).toBeGreaterThan(far);
    expect(far).toBeGreaterThanOrEqual(0);
    expect(pixel(lit, 80, 40)).toEqual([...LAND]);
  });

  test('maps the wind: a plant sways most toward its tip and not at its foot, the land not at all', () => {
    const plant = field((x, y) => x >= 48 && x < 51 && y >= 34 && INK);
    const wind = windMap(plant, skyRows);
    const sway = (x: number, y: number) => at(wind.data, (y * WIDTH + x) * 4);
    const air = (x: number, y: number) => at(wind.data, (y * WIDTH + x) * 4 + 1);
    expect(sway(49, 37)).toBeGreaterThan(100);
    expect(sway(49, 37)).toBeGreaterThan(sway(49, 48));
    expect(sway(49, 51)).toBeLessThan(40);
    expect(sway(10, 45)).toBe(0);
    expect(air(10, 5)).toBe(255);
    expect(air(10, 60)).toBe(0);
  });
});

/** The far hills at half the master's width: sky above its row 450, the first streak's hill below. */
const HILLS_WIDTH = 1536;
const HILLS_HEIGHT = 600;
const HILLS_SKY = 450;
const TREE: Colour = [60, 110, 70];
const [first] = HILL_STREAKS;

/** Where a pixel lies against the first streak, in the master's pixels: along it from its top end, and across (up and right). */
const against = (x: number, y: number) => {
  const [x0, y0, x1, y1] = first?.line ?? [0, 0, 0, 0];
  const length = Math.hypot(x1 - x0, y1 - y0);
  const dx = (x1 - x0) / length;
  const dy = (y1 - y0) / length;
  const mx = x * 2 - x0;
  const my = y * 2 - y0;
  return { along: mx * dx + my * dy, across: mx * dy - my * dx, length };
};

/** A pixel of the streaked hills: sky, the tree, or the hill with half the step either side of the edge. */
const hillsColour = (
  x: number,
  y: number,
  hill: readonly [number, number, number],
  step: readonly [number, number, number],
): Colour => {
  if (y < HILLS_SKY) return SKY;
  if (x >= 270 && x < 290 && y >= 500 && y < 520) return TREE;
  const { along, across, length } = against(x, y);
  const side = Number(along >= 0 && along <= length) * (Math.sign(across) / 2);
  const lifted = (k: 0 | 1 | 2) => Math.round(hill[k] + side * step[k]);
  return [lifted(0), lifted(1), lifted(2)];
};

/** The first streak as the painting has it: its hill a step lighter (as measured) up and right of the edge, a tree beside it. */
const streaked = (): Pixels => {
  const hill = first?.hill ?? [0, 0, 0];
  const step = first?.step ?? [0, 0, 0];
  const data = new Uint8ClampedArray(HILLS_WIDTH * HILLS_HEIGHT * 4);
  for (let y = 0; y < HILLS_HEIGHT; y++)
    for (let x = 0; x < HILLS_WIDTH; x++)
      data.set([...hillsColour(x, y, hill, step), 255], (y * HILLS_WIDTH + x) * 4);
  return { width: HILLS_WIDTH, height: HILLS_HEIGHT, data };
};

const hillsSky = Uint8Array.from({ length: HILLS_WIDTH * HILLS_HEIGHT }, (_, i) =>
  Number(i < HILLS_SKY * HILLS_WIDTH),
);

const hillPixel = (image: Pixels, x: number, y: number) =>
  Array.from(image.data.subarray((y * HILLS_WIDTH + x) * 4, (y * HILLS_WIDTH + x) * 4 + 3));

/** Red, green and blue 6 master px up-right of the first streak's middle minus 6 px down-left. */
const stepAcross = (image: Pixels) => {
  const [x0, y0, x1, y1] = first?.line ?? [0, 0, 0, 0];
  const length = Math.hypot(x1 - x0, y1 - y0);
  const nx = (y1 - y0) / length;
  const ny = -(x1 - x0) / length;
  const side = (sign: number) =>
    hillPixel(
      image,
      Math.round(((x0 + x1) / 2 + sign * 6 * nx) / 2),
      Math.round(((y0 + y1) / 2 + sign * 6 * ny) / 2),
    );
  const up = side(1);
  const down = side(-1);
  return up.map((v, k) => v - at(down, k));
};

describe('the far hills without the old rays’ edges', () => {
  test('takes a streak’s step off its hill, so no edge is left across it', () => {
    const painted = streaked();
    const lifted = withoutHillStreaks(painted, hillsSky);
    expect(at(stepAcross(painted), 0)).toBeGreaterThanOrEqual(16);
    for (const k of [0, 1, 2]) expect(Math.abs(at(stepAcross(lifted), k))).toBeLessThanOrEqual(1);
  });

  test('leaves the sky, a tree beside the streak and the land far from it as they were', () => {
    const painted = streaked();
    const lifted = withoutHillStreaks(painted, hillsSky);
    expect(hillPixel(lifted, 230, 440)).toEqual(hillPixel(painted, 230, 440));
    expect(hillPixel(lifted, 280, 510)).toEqual([...TREE]);
    expect(hillPixel(lifted, 1000, 575)).toEqual(hillPixel(painted, 1000, 575));
  });
});
