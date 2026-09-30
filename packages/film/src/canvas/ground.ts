// A contact shadow (DIRECTION, "Contact shadow"): where a figure stands on the
// ground, a soft warm ellipse darkens the sheet under its feet, so it stands
// on the world rather than floating over it. The shadow touches the ground,
// so no plane's height stretches it. Its gradient is one unit gradient per
// context (`unitGradient`), placed by the transform.

import { unitGradient } from './glow.ts';

/** A warm dark, the same as a cutout's cast shadow, as r, g, b. */
export const GROUND_TINT: readonly [number, number, number] = [40, 28, 16];

/** How dark the shadow is at its heart, 0..1: within the 15–30 % the direction asks. */
export const GROUND_ALPHA = 0.28;

/** How flat the ellipse lies: its height over its width. */
export const GROUND_FLAT = 0.12;

/** The shadow's gradient at unit radius: darkest at its heart, gone at its rim. */
const shadowGradient = (ctx: CanvasRenderingContext2D, [r, g, b]: typeof GROUND_TINT) => {
  const made = ctx.createRadialGradient(0, 0, 0, 0, 0, 1);
  made.addColorStop(0, `rgba(${r}, ${g}, ${b}, ${GROUND_ALPHA})`);
  made.addColorStop(0.55, `rgba(${r}, ${g}, ${b}, ${GROUND_ALPHA * 0.4})`);
  made.addColorStop(1, `rgba(${r}, ${g}, ${b}, 0)`);
  return made;
};

/**
 * The contact shadow under something standing at (x, y), `w` wide: a flat
 * warm ellipse, darkest under the feet and gone at its rim. Fade it with the
 * context's `globalAlpha`.
 */
export const ground = (ctx: CanvasRenderingContext2D, x: number, y: number, w: number) => {
  if (w <= 0) return;
  const rx = w / 2;
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(rx, rx * GROUND_FLAT);
  ctx.fillStyle = unitGradient(ctx, 'ground', '', shadowGradient, GROUND_TINT);
  ctx.fillRect(-1, -1, 2, 2);
  ctx.restore();
};
