// Upstream: packages/utils/src/clamp.ts
//
// Keeps a number within `[min, max]`; the bounds default to the safe integer range.
export function clamp(
  value: number,
  min: number = Number.MIN_SAFE_INTEGER,
  max: number = Number.MAX_SAFE_INTEGER,
): number {
  return Math.max(min, Math.min(value, max));
}
