// A contact shadow (DIRECTION, "Contact shadow"): where a figure stands on the
// ground, a soft warm ellipse darkens the sheet under its feet, so it stands
// on the world rather than floating over it. The shadow touches the ground,
// so no plane's height stretches it.

/** A warm dark, the same as a cutout's cast shadow, as r, g, b. */
export const GROUND_TINT: readonly [number, number, number] = [40, 28, 16];

/** How dark the shadow is at its heart, 0..1: within the 15–30 % the direction asks. */
export const GROUND_ALPHA = 0.28;

/** How flat the ellipse lies: its height over its width. */
export const GROUND_FLAT = 0.12;

export interface GroundStyle {
  /** The shadow's colour, as r, g, b: `GROUND_TINT` by default. */
  readonly tint?: readonly [number, number, number];
  /** How dark its heart is, 0..1: `GROUND_ALPHA` by default. */
  readonly alpha?: number;
}

/** One unit-radius gradient per context, tint and darkness, made once and reused every frame. */
const gradients = new WeakMap<
  CanvasRenderingContext2D,
  Map<readonly [number, number, number], Map<number, CanvasGradient>>
>();

const unitGradient = (
  ctx: CanvasRenderingContext2D,
  tint: readonly [number, number, number],
  alpha: number,
) => {
  let byTint = gradients.get(ctx);
  if (byTint === undefined) {
    byTint = new Map();
    gradients.set(ctx, byTint);
  }
  let byAlpha = byTint.get(tint);
  if (byAlpha === undefined) {
    byAlpha = new Map();
    byTint.set(tint, byAlpha);
  }
  const cached = byAlpha.get(alpha);
  if (cached !== undefined) return cached;
  const [r, g, b] = tint;
  const made = ctx.createRadialGradient(0, 0, 0, 0, 0, 1);
  made.addColorStop(0, `rgba(${r}, ${g}, ${b}, ${alpha})`);
  made.addColorStop(0.55, `rgba(${r}, ${g}, ${b}, ${alpha * 0.4})`);
  made.addColorStop(1, `rgba(${r}, ${g}, ${b}, 0)`);
  byAlpha.set(alpha, made);
  return made;
};

/**
 * The contact shadow under something standing at (x, y), `w` wide: a flat
 * warm ellipse, darkest under the feet and gone at its rim. Fade it with the
 * context's `globalAlpha`.
 */
export const ground = (
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  style: GroundStyle = {},
) => {
  if (w <= 0) return;
  const rx = w / 2;
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(rx, rx * GROUND_FLAT);
  ctx.fillStyle = unitGradient(ctx, style.tint ?? GROUND_TINT, style.alpha ?? GROUND_ALPHA);
  ctx.fillRect(-1, -1, 2, 2);
  ctx.restore();
};
