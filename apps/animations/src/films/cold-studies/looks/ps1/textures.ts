// The ps1 world's textures, every one made here from seeded noise, as small
// as the console's video memory kept them (16 to 64 texels a side) and read
// nearest-neighbour, so each texel shows as a hard square on screen: wood
// grain, cut stone, floor planks, cloth, the accused's stained tunic, paper
// and card. Made once per WebGL context (`rig.ts`); nothing here reads time.

import { hash2, lerp } from '@bible/film/core';
import { DataTexture, NearestFilter, RepeatWrapping, RGBAFormat, UnsignedByteType } from 'three';

type Rgb = readonly [number, number, number];

const hex = (h: string): Rgb => {
  const n = Number.parseInt(h.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
};

const mixRgb = (a: Rgb, b: Rgb, t: number): Rgb => [
  lerp(a[0], b[0], t),
  lerp(a[1], b[1], t),
  lerp(a[2], b[2], t),
];

/** Value noise that tiles every `period` cells: hard-edged enough for a 32-texel texture. */
const tiled = (x: number, y: number, period: number, seed: number): number => {
  const xi = Math.floor(x);
  const yi = Math.floor(y);
  const fx = x - xi;
  const fy = y - yi;
  const at = (i: number, j: number) =>
    hash2((((i % period) + period) % period) + seed * 131, ((j % period) + period) % period);
  const sx = fx * fx * (3 - 2 * fx);
  const sy = fy * fy * (3 - 2 * fy);
  const top = lerp(at(xi, yi), at(xi + 1, yi), sx);
  const bottom = lerp(at(xi, yi + 1), at(xi + 1, yi + 1), sx);
  return lerp(top, bottom, sy);
};

/** A `size`-texel square texture, each texel `paint(x, y)` (rgb, alpha 255 unless given). */
const texture = (
  size: number,
  paint: (x: number, y: number) => Rgb | readonly [number, number, number, number],
): DataTexture => {
  const data = new Uint8Array(size * size * 4);
  for (let y = 0; y < size; y++)
    for (let x = 0; x < size; x++) {
      const c = paint(x, y);
      const i = ((size - 1 - y) * size + x) * 4;
      data[i] = Math.round(c[0]);
      data[i + 1] = Math.round(c[1]);
      data[i + 2] = Math.round(c[2]);
      data[i + 3] = c.length === 4 ? c[3] : 255;
    }
  const t = new DataTexture(data, size, size, RGBAFormat, UnsignedByteType);
  t.magFilter = NearestFilter;
  t.minFilter = NearestFilter;
  t.wrapS = RepeatWrapping;
  t.wrapT = RepeatWrapping;
  t.generateMipmaps = false;
  t.needsUpdate = true;
  return t;
};

/** Four steps between `dark` and `light`: the few tones a hand-made texture kept. */
const posterise = (dark: Rgb, light: Rgb, v: number): Rgb =>
  mixRgb(dark, light, Math.round(Math.min(Math.max(v, 0), 1) * 3) / 3);

/** Planks laid along x, `rows` to the tile, each its own tone, with grain and a dark seam. */
const planks = (size: number, rows: number, dark: string, light: string, seed: number) => {
  const [d, l] = [hex(dark), hex(light)];
  const tall = size / rows;
  return texture(size, (x, y) => {
    const row = Math.floor(y / tall);
    const inRow = y - row * tall;
    if (inRow === 0) return mixRgb(d, [0, 0, 0], 0.35);
    const shift = Math.floor(hash2(row, seed) * size);
    const xx = (x + shift) % size;
    // A butt joint once along each plank.
    if (xx === Math.floor(size * 0.5)) return mixRgb(d, [0, 0, 0], 0.2);
    const tone = 0.25 + 0.4 * hash2(row + 7, seed);
    const grain = Math.sin((inRow + 2.2 * tiled(xx / 6, row, size / 6, seed)) * 1.9);
    return posterise(
      d,
      l,
      tone + 0.22 * grain + 0.15 * (tiled(xx / 3, y / 3, size / 3, seed + 3) - 0.5),
    );
  });
};

/** Cut stone in courses, each block its own tone, a speckle, mortar lines. */
const stone = (size: number, dark: string, light: string, seed: number) => {
  const [d, l] = [hex(dark), hex(light)];
  const bh = size / 4;
  const bw = size / 2;
  return texture(size, (x, y) => {
    const course = Math.floor(y / bh);
    const xo = (x + (course % 2) * (bw / 2)) % size;
    const block = Math.floor(xo / bw);
    if (y % bh === 0 || xo % bw === 0) return mixRgb(d, [20, 20, 30], 0.4);
    const tone = 0.35 + 0.35 * hash2(course * 7 + block, seed);
    const speck = hash2(x * 31 + y, seed + 9) > 0.86 ? -0.25 : 0;
    const chip = y % bh === 1 || xo % bw === 1 ? 0.18 : 0;
    return posterise(d, l, tone + speck + chip + 0.2 * (tiled(x / 4, y / 4, size / 4, seed) - 0.5));
  });
};

/** A twill weave: diagonal ribs a texel apart, and a little slub. */
const weave = (size: number, dark: string, light: string, seed: number) => {
  const [d, l] = [hex(dark), hex(light)];
  return texture(size, (x, y) => {
    const rib = (x + y) % 3 === 0 ? -0.22 : (x + y) % 3 === 1 ? 0.08 : 0;
    return posterise(d, l, 0.6 + rib + 0.3 * (tiled(x / 4, y / 2, size / 4, seed) - 0.5));
  });
};

/** The accused's tunic: pale cloth with scarlet blots soaked in (scarlet is sin, on the one who carries it). */
const tunic = (size: number, seed: number) => {
  const cloth: [Rgb, Rgb] = [hex('#8f8a7c'), hex('#e2dccb')];
  const scarlet = hex('#ce0914');
  const deep = hex('#7c0610');
  const blots: ReadonlyArray<readonly [number, number, number]> = [
    [0.22, 0.38, 0.11],
    [0.31, 0.62, 0.07],
    [0.68, 0.3, 0.09],
    [0.6, 0.72, 0.13],
    [0.84, 0.55, 0.06],
  ];
  return texture(size, (x, y) => {
    const rib = (x + y) % 3 === 0 ? -0.2 : 0;
    const base = posterise(
      cloth[0],
      cloth[1],
      0.62 + rib + 0.3 * (tiled(x / 4, y / 3, size / 4, seed) - 0.5),
    );
    for (const [bx, by, r] of blots) {
      const dx = x / size - bx;
      const dy = y / size - by;
      const edge = r * (0.75 + 0.5 * tiled(x / 3, y / 3, size / 3, seed + 5));
      const d = Math.hypot(dx, dy * 0.8);
      if (d < edge * 0.55) return deep;
      if (d < edge) return scarlet;
    }
    return base;
  });
};

/** A sheet of evidence: paper with grey lines of writing, too small to read. */
const paper = (size: number, seed: number) => {
  const [white, line] = [hex('#e8e6dc'), hex('#7c7f88')];
  return texture(size, (x, y) => {
    if (x < 3 || x >= size - 3 || y < 3) return white;
    const row = Math.floor((y - 3) / 3);
    const onLine = (y - 3) % 3 === 0;
    const length = size - 6 - Math.floor(hash2(row, seed) * size * 0.4);
    return onLine && x < length && hash2(x >> 1, row + seed) > 0.18 ? line : white;
  });
};

/** A file box: card, a pale label, a dark hand-hole. */
const cardboard = (size: number, seed: number) => {
  const [d, l] = [hex('#7a5a36'), hex('#b48a58')];
  const label = hex('#ddd6c0');
  return texture(size, (x, y) => {
    const u = x / size;
    const v = y / size;
    if (u > 0.3 && u < 0.7 && v > 0.55 && v < 0.75) return label;
    if (u > 0.4 && u < 0.6 && v > 0.2 && v < 0.3) return hex('#3a2a18');
    return posterise(d, l, 0.55 + 0.25 * (tiled(x / 3, y / 5, size / 3, seed) - 0.5));
  });
};

export interface Textures {
  readonly bench: DataTexture;
  readonly pew: DataTexture;
  readonly floor: DataTexture;
  readonly wall: DataTexture;
  readonly carpet: DataTexture;
  readonly robe: DataTexture;
  readonly tunic: DataTexture;
  readonly coat: DataTexture;
  readonly paper: DataTexture;
  readonly box: DataTexture;
  readonly desk: DataTexture;
}

/** Every texture the world wears, made fresh for one context. */
export const textures = (): Textures => ({
  bench: planks(32, 4, '#3e2a1c', '#7a5636', 11),
  pew: planks(32, 4, '#4a3524', '#8a6644', 12),
  floor: planks(64, 4, '#5c4a3a', '#a08a70', 13),
  wall: stone(64, '#5d6672', '#a6aeb6', 14),
  carpet: weave(16, '#2c4a4a', '#4f7a74', 15),
  robe: weave(16, '#121318', '#3a3d48', 16),
  tunic: tunic(64, 17),
  coat: weave(16, '#2d3c5c', '#5a6e94', 18),
  paper: paper(32, 19),
  box: cardboard(32, 20),
  desk: planks(32, 2, '#4a3020', '#8c6440', 21),
});
