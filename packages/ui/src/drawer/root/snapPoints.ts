// Upstream: packages/react/src/drawer/root/useDrawerSnapPoints.ts
//
// Snap points as plain numbers. A snap point is how much of the drawer
// shows: a number up to 1 is a fraction of the viewport's height, a larger
// number is pixels, and a string is `px` or `rem`. Each resolves to a height
// (clamped to what the popup and viewport allow) and the offset the popup is
// pushed down by to show only that height. Points that resolve within a
// pixel of each other collapse to the last one listed.
import { clamp } from '../../utils/clamp.ts';

export type DrawerSnapPoint = number | string;

export interface ResolvedDrawerSnapPoint {
  value: DrawerSnapPoint;
  height: number;
  offset: number;
}

/**
 * The vertical swipe movement for a snap point: the raw movement, damped with
 * a square root once the drag overshoots the fully open edge (`baseOffset +
 * movement < 0`), so the popup resists travelling past it.
 */
export function getSnapPointSwipeMovement(baseOffset: number, movementValue: number): number {
  const nextOffset = baseOffset + movementValue;
  if (nextOffset >= 0) {
    return movementValue;
  }
  return -Math.sqrt(-nextOffset) - baseOffset;
}

/** The height a snap point shows in a viewport this tall, or `null` when it does not resolve. */
export function resolveSnapPointValue(
  snapPoint: DrawerSnapPoint,
  viewportHeight: number,
  rootFontSize: number,
): number | null {
  if (!Number.isFinite(viewportHeight) || viewportHeight <= 0) {
    return null;
  }
  if (typeof snapPoint === 'number') {
    if (!Number.isFinite(snapPoint)) {
      return null;
    }
    return snapPoint <= 1 ? clamp(snapPoint, 0, 1) * viewportHeight : snapPoint;
  }
  const trimmed = snapPoint.trim();
  if (trimmed.endsWith('px')) {
    const value = Number.parseFloat(trimmed);
    return Number.isFinite(value) ? value : null;
  }
  if (trimmed.endsWith('rem')) {
    const value = Number.parseFloat(trimmed);
    return Number.isFinite(value) ? value * rootFontSize : null;
  }
  return null;
}

/** The index of the value closest to `target` (the first on a tie), or `-1` when empty. */
export function closestSnapPointIndex(values: ReadonlyArray<number>, target: number): number {
  let closestIndex = -1;
  let closestDistance = Infinity;
  values.forEach((value, index) => {
    const distance = Math.abs(value - target);
    if (distance < closestDistance) {
      closestDistance = distance;
      closestIndex = index;
    }
  });
  return closestIndex;
}

export interface SnapPointMeasurements {
  viewportHeight: number;
  popupHeight: number;
  rootFontSize: number;
}

/** Resolves the snap points against the measured popup and viewport. */
export function resolveSnapPoints(
  snapPoints: ReadonlyArray<DrawerSnapPoint> | undefined,
  { viewportHeight, popupHeight, rootFontSize }: SnapPointMeasurements,
): ResolvedDrawerSnapPoint[] {
  if (!snapPoints || snapPoints.length === 0 || viewportHeight <= 0 || popupHeight <= 0) {
    return [];
  }
  const maxHeight = Math.min(popupHeight, viewportHeight);
  const resolved: ResolvedDrawerSnapPoint[] = [];
  for (const value of snapPoints) {
    const height = resolveSnapPointValue(value, viewportHeight, rootFontSize);
    if (height === null) {
      continue;
    }
    const clampedHeight = clamp(height, 0, maxHeight);
    resolved.push({
      value,
      height: clampedHeight,
      offset: Math.max(0, popupHeight - clampedHeight),
    });
  }
  if (resolved.length <= 1) {
    return resolved;
  }
  // The last of near-equal points wins; the order is kept.
  const deduped: ResolvedDrawerSnapPoint[] = [];
  const seenHeights: number[] = [];
  for (let index = resolved.length - 1; index >= 0; index -= 1) {
    const point = resolved[index];
    if (!point || seenHeights.some((height) => Math.abs(height - point.height) <= 1)) {
      continue;
    }
    seenHeights.push(point.height);
    deduped.push(point);
  }
  return deduped.reverse();
}

/**
 * The resolved point for the active snap point: the point with that value,
 * else the point closest to the height it resolves to.
 */
export function resolveActiveSnapPoint(
  activeSnapPoint: DrawerSnapPoint | null,
  resolvedSnapPoints: ReadonlyArray<ResolvedDrawerSnapPoint>,
  { viewportHeight, popupHeight, rootFontSize }: SnapPointMeasurements,
): ResolvedDrawerSnapPoint | undefined {
  if (activeSnapPoint === null) {
    return undefined;
  }
  const exactMatch = resolvedSnapPoints.find((point) => Object.is(point.value, activeSnapPoint));
  if (exactMatch) {
    return exactMatch;
  }
  const height = resolveSnapPointValue(activeSnapPoint, viewportHeight, rootFontSize);
  if (height === null) {
    return undefined;
  }
  const clampedHeight = clamp(height, 0, Math.min(popupHeight, viewportHeight));
  return resolvedSnapPoints[
    closestSnapPointIndex(
      resolvedSnapPoints.map((point) => point.height),
      clampedHeight,
    )
  ];
}
