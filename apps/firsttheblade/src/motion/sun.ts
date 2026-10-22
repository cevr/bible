/**
 * The field's light, and where it comes from: the sun low on the right
 * horizon. The field's still bakes this light in (`kit/field.ts`) and the
 * hero's shimmer plays along the same rays (`./shaders.ts`), so the moving
 * light and the still one fan out from one place: the owner's revise of
 * 2026-10-21 was the painted rays coming from the top left while the sun sat
 * at the right. The stills that ship are the ones he approved by name
 * (`kit/approved-stills.json`).
 *
 * Positions are the painting's, `u` across its width and `v` down its height
 * (both 0 to 1); distances are in widths, so a circle is round on the 3:2
 * painting.
 */

/** The painting's width over its height. */
export const ASPECT = 1.5;

/** The sun's disc: its centre and radius, read off the painting. */
export const SUN = { u: 0.868, v: 0.459, radius: 0.047 } as const;

/** One ray: its direction from the sun (radians, 0 is to the right, a negative angle points up) and how wide and strong it is. */
export interface Ray {
  readonly angle: number;
  readonly width: number;
  readonly strength: number;
}

/** The rays the sun throws across the sky, fanning up and to the left. */
export const RAYS: ReadonlyArray<Ray> = [
  { angle: -3.02, width: 0.035, strength: 0.13 },
  { angle: -2.86, width: 0.05, strength: 0.16 },
  { angle: -2.66, width: 0.04, strength: 0.12 },
  { angle: -2.47, width: 0.06, strength: 0.15 },
  { angle: -2.24, width: 0.045, strength: 0.11 },
  { angle: -1.98, width: 0.055, strength: 0.12 },
  { angle: -1.62, width: 0.04, strength: 0.09 },
  { angle: -1.2, width: 0.05, strength: 0.08 },
];

/** How far the glow around the disc reaches, and how strong it is at the disc's edge. */
export const GLOW = { reach: 0.09, strength: 0.24 } as const;

/** How far the rays reach before they fade to half, in widths. */
export const RAY_REACH = 0.42;

/** The light's colour, a warm white (linear in 0 to 1 per channel). */
export const LIGHT: readonly [number, number, number] = [1, 0.965, 0.88];

/** The distance from the sun's centre, in widths, and the direction to it. */
export const fromTheSun = (u: number, v: number) => {
  const du = u - SUN.u;
  const dv = (v - SUN.v) / ASPECT;
  return { distance: Math.hypot(du, dv), angle: Math.atan2(dv, du) };
};

/** A ray's share of the light in a direction: a soft band around its angle. */
const rayAt = (ray: Ray, angle: number) => {
  const off = Math.atan2(Math.sin(angle - ray.angle), Math.cos(angle - ray.angle)) / ray.width;
  return ray.strength * Math.exp(-off * off);
};

/** The rays' light in a direction, before it fades with distance. */
export const raysToward = (angle: number) => RAYS.reduce((sum, ray) => sum + rayAt(ray, angle), 0);

/** How much of the sun's light falls at a point, 0 (none) to 1. */
export const sunLight = (u: number, v: number) => {
  const { distance, angle } = fromTheSun(u, v);
  const beyond = Math.max(0, distance - SUN.radius);
  const glow = GLOW.strength * Math.exp(-beyond / GLOW.reach);
  const rays = raysToward(angle) * Math.exp((-beyond / RAY_REACH) * Math.LN2);
  return Math.min(1, glow + rays);
};
