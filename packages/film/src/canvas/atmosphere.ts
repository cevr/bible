// The air of a parallax still, drawn live over its painted plates: dust and
// embers drifting through a light (`motes`), and shafts of light fanning
// from a source (`rays`). Each is a pure function of the scene's time and a
// seed: a mote's place is where its drift has carried it by `t`, wrapped in
// its box, so a frame is drawn alike in any order and nothing is carried
// between frames.

import { hash2, noise1 } from '../core/random.ts';
import { type Hex, clearOf } from './colour.ts';
import { glow } from './glow.ts';

/** A field of drifting specks in a box of the world. */
interface Motes {
  readonly seed: number;
  readonly count: number;
  /** The box they drift through, wrapping at its edges: x, y, width, height. */
  readonly box: readonly [number, number, number, number];
  /** A speck's radius, smallest and largest, in px. */
  readonly size: readonly [number, number];
  readonly color: Hex;
  /** How far a speck drifts a second, x and y in px (each speck a little faster or slower). */
  readonly drift: readonly [number, number];
  /** How far a speck sways side to side about its path, in px. */
  readonly sway: number;
  /** How opaque a speck is at its brightest, 0..1. */
  readonly alpha: number;
  /** How much a speck's light wavers, 0..1 (an ember's glow, dust catching the light). */
  readonly twinkle?: number;
  /** The halo about each speck, in its radii; 0 for none. Defaults to 4. */
  readonly halo?: number;
}

/** Wrap `n` into [0, span). */
const wrap = (n: number, span: number) => ((n % span) + span) % span;

/**
 * The specks at `t` seconds: each starts at a seeded place in the box and
 * drifts from it, swaying, fading in and out across its path so the wrap is
 * never seen. Drawn with `screen`: light added to what is under it.
 */
export const motes = (ctx: CanvasRenderingContext2D, t: number, m: Motes) => {
  const [bx, by, bw, bh] = m.box;
  const [vx, vy] = m.drift;
  const [small, large] = m.size;
  const halo = m.halo ?? 4;
  const twinkle = m.twinkle ?? 0.3;
  const core = clearOf(m.color);
  ctx.save();
  ctx.globalCompositeOperation = 'screen';
  for (let i = 0; i < m.count; i++) {
    const u = hash2(i, m.seed);
    const v = hash2(i, m.seed + 1);
    const speed = 0.6 + 0.8 * hash2(i, m.seed + 2);
    const phase = hash2(i, m.seed + 3) * Math.PI * 2;
    const r = small + (large - small) * hash2(i, m.seed + 4) ** 2;
    // Travelled along its path, 0..1 of the box, for the fade across it.
    const along =
      vy !== 0 ? wrap(v * bh + vy * speed * t, bh) / bh : wrap(u * bw + vx * speed * t, bw) / bw;
    const sway = m.sway * Math.sin(t * (0.4 + speed * 0.5) + phase);
    const x = bx + wrap(u * bw + vx * speed * t + sway, bw);
    const y = by + wrap(v * bh + vy * speed * t + sway * 0.4, bh);
    const lit = 1 - twinkle * (0.5 + 0.5 * noise1(t * (1.5 + speed) + phase, m.seed + i));
    const a = m.alpha * lit * Math.sin(Math.PI * along);
    if (a <= 0.004) continue;
    if (halo > 0) glow(ctx, x, y, r * halo, m.color, a * 0.35);
    ctx.globalAlpha = Math.min(1, a);
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, '#ffffff');
    g.addColorStop(0.35, m.color);
    g.addColorStop(1, core);
    ctx.fillStyle = g;
    ctx.fillRect(x - r, y - r, r * 2, r * 2);
  }
  ctx.restore();
};

/** Shafts of light fanning from a source. */
interface Rays {
  readonly seed: number;
  /** Where the light comes from, in the world. */
  readonly from: readonly [number, number];
  /** The fan's middle direction, in radians (0 to the right, π/2 down). */
  readonly angle: number;
  /** How wide the fan opens, in radians. */
  readonly spread: number;
  /** How far a shaft reaches, in px. */
  readonly length: number;
  readonly count: number;
  /** A shaft's width at its far end, in px, at its widest. */
  readonly width: number;
  readonly color: Hex;
  /** How bright a shaft is at its source, 0..1. */
  readonly alpha: number;
  /** How far the shafts sway and breathe over time, 0..1. Defaults to 0.3. */
  readonly sway?: number;
}

/** A shaft's soft body: the same wedge, narrower and brighter, three times over. */
const SOFT = [1, 0.62, 0.3] as const;

/**
 * The shafts at `t` seconds, each a wedge from the source that fades along
 * its length, its edges softened by drawing it narrower again within
 * itself, swaying slowly and brightening and dimming as air moves through
 * it. Drawn with `screen`.
 */
export const rays = (ctx: CanvasRenderingContext2D, t: number, r: Rays) => {
  const [sx, sy] = r.from;
  const sway = r.sway ?? 0.3;
  const clear = clearOf(r.color);
  ctx.save();
  ctx.globalCompositeOperation = 'screen';
  for (let i = 0; i < r.count; i++) {
    const place = r.count === 1 ? 0.5 : i / (r.count - 1);
    const jitter = hash2(i, r.seed) - 0.5;
    const angle =
      r.angle +
      r.spread * (place - 0.5 + jitter / Math.max(1, r.count)) +
      sway * 0.04 * noise1(t * 0.15 + i * 3.1, r.seed);
    const width = r.width * (0.35 + 0.65 * hash2(i, r.seed + 1));
    const breath = 1 - sway * (0.5 + 0.5 * noise1(t * 0.35 + i * 1.7, r.seed + 2));
    const length = r.length * (0.6 + 0.4 * hash2(i, r.seed + 3));
    const ex = sx + Math.cos(angle) * length;
    const ey = sy + Math.sin(angle) * length;
    const nx = -Math.sin(angle);
    const ny = Math.cos(angle);
    const g = ctx.createLinearGradient(sx, sy, ex, ey);
    g.addColorStop(0, r.color);
    g.addColorStop(1, clear);
    ctx.fillStyle = g;
    for (const k of SOFT) {
      ctx.globalAlpha = (r.alpha * breath * (0.5 + 0.5 * hash2(i, r.seed + 4))) / SOFT.length;
      const half = (width * k) / 2;
      ctx.beginPath();
      ctx.moveTo(sx + nx * half * 0.05, sy + ny * half * 0.05);
      ctx.lineTo(ex + nx * half, ey + ny * half);
      ctx.lineTo(ex - nx * half, ey - ny * half);
      ctx.lineTo(sx - nx * half * 0.05, sy - ny * half * 0.05);
      ctx.closePath();
      ctx.fill();
    }
  }
  ctx.restore();
};

/** Rain falling through a box of the world. */
interface Rain {
  readonly seed: number;
  readonly count: number;
  /** The box it falls through, wrapping: x, y, width, height. */
  readonly box: readonly [number, number, number, number];
  /** How far it slants from straight down, in radians (positive leans to the right). */
  readonly slant: number;
  /** How fast a drop falls, px a second. */
  readonly speed: number;
  /** A streak's length and width, in px. */
  readonly length: number;
  readonly width: number;
  readonly color: Hex;
  readonly alpha: number;
}

/**
 * The rain at `t` seconds: thin streaks, each falling from a seeded place
 * along the slant and wrapping in its box, nearer ones (by their seed)
 * longer and brighter. Drawn with `screen`, so it lights what it falls past.
 */
export const rain = (ctx: CanvasRenderingContext2D, t: number, r: Rain) => {
  const [bx, by, bw, bh] = r.box;
  const dx = Math.sin(r.slant);
  const dy = Math.cos(r.slant);
  ctx.save();
  ctx.globalCompositeOperation = 'screen';
  ctx.fillStyle = r.color;
  for (let i = 0; i < r.count; i++) {
    const near = 0.4 + 0.6 * hash2(i, r.seed + 2);
    const fall = r.speed * near * t + hash2(i, r.seed + 1) * bh;
    const y = by + wrap(fall, bh);
    const x = bx + wrap(hash2(i, r.seed) * bw + dx * fall, bw);
    const len = r.length * near;
    const half = (r.width * near) / 2;
    ctx.globalAlpha = r.alpha * near * Math.sin((Math.PI * (y - by)) / bh);
    ctx.beginPath();
    ctx.moveTo(x - dy * half, y + dx * half);
    ctx.lineTo(x - dx * len, y - dy * len);
    ctx.lineTo(x + dy * half, y - dx * half);
    ctx.closePath();
    ctx.fill();
  }
  ctx.restore();
};

/** A night sky's stars, in a box of the world. */
interface Stars {
  readonly seed: number;
  readonly count: number;
  readonly box: readonly [number, number, number, number];
  /** A star's radius, smallest and largest, in px. */
  readonly size: readonly [number, number];
  readonly color: Hex;
  readonly alpha: number;
}

/** The stars at `t` seconds: each at a seeded place, the larger few haloed, all twinkling slowly. */
export const stars = (ctx: CanvasRenderingContext2D, t: number, s: Stars) => {
  const [bx, by, bw, bh] = s.box;
  const [small, large] = s.size;
  ctx.save();
  ctx.globalCompositeOperation = 'screen';
  ctx.fillStyle = s.color;
  for (let i = 0; i < s.count; i++) {
    const big = hash2(i, s.seed + 2) ** 3;
    const r = small + (large - small) * big;
    const x = bx + hash2(i, s.seed) * bw;
    const y = by + hash2(i, s.seed + 1) * bh;
    const a = s.alpha * (0.55 + 0.45 * noise1(t * 0.8 + i * 1.3, s.seed + 3));
    if (big > 0.4) glow(ctx, x, y, r * 6, s.color, a * 0.4);
    ctx.globalAlpha = a;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
};
