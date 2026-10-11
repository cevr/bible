// Upstream: packages/react/src/utils/useSwipeDismiss.ts,
// packages/react/src/utils/getElementTransform.ts
//
// A swipe's pure geometry, for the toast, which runs its own swipe: how far a
// drag travels in a direction, its damping against the allowed directions,
// and an element's computed translation and scale. Upstream's gesture hook
// around them, which names the file, is left out: no part reads it (the
// sheet's swipe is the browser's own scroll).
import { ownerWindow } from './dom.ts';

export type SwipeDirection = 'up' | 'down' | 'left' | 'right';

/** How far a drag of (`deltaX`, `deltaY`) travels in `direction`. */
export function getDisplacement(direction: SwipeDirection, deltaX: number, deltaY: number) {
  switch (direction) {
    case 'up':
      return -deltaY;
    case 'down':
      return deltaY;
    case 'left':
      return -deltaX;
    case 'right':
      return deltaX;
    default:
      return 0;
  }
}

/**
 * The 2D translation and scale of a computed `transform` value (`matrix(…)`
 * or `matrix3d(…)`); identity for `none` or anything unparsable.
 */
export function parseTransform(transform: string | null | undefined) {
  let translateX = 0;
  let translateY = 0;
  let scale = 1;

  if (transform && transform !== 'none') {
    const matrix = transform.match(/matrix(?:3d)?\(([^)]+)\)/);
    if (matrix?.[1]) {
      const values = matrix[1].split(', ').map(parseFloat);
      if (values.length === 6) {
        translateX = values[4] ?? 0;
        translateY = values[5] ?? 0;
        scale = Math.sqrt((values[0] ?? 1) ** 2 + (values[1] ?? 0) ** 2);
      } else if (values.length === 16) {
        translateX = values[12] ?? 0;
        translateY = values[13] ?? 0;
        scale = values[0] ?? 1;
      }
    }
  }

  return { x: translateX, y: translateY, scale };
}

/**
 * The 2D translation and scale of the element's computed `transform`. The
 * `translate`, `rotate` and `scale` longhands are separate properties and
 * are not reflected in it.
 */
export function getElementTransform(element: HTMLElement, computedStyle?: CSSStyleDeclaration) {
  return parseTransform(
    (computedStyle ?? ownerWindow(element).getComputedStyle(element)).transform,
  );
}

/**
 * Damps movement against the allowed directions: on an allowed axis, travel
 * the wrong way grows with the square root of the distance; on an axis with
 * no allowed direction, all travel does.
 */
export function applyDirectionalDamping(
  deltaX: number,
  deltaY: number,
  directions: ReadonlyArray<SwipeDirection>,
) {
  const allowLeft = directions.includes('left');
  const allowRight = directions.includes('right');
  const allowUp = directions.includes('up');
  const allowDown = directions.includes('down');
  const exponent = (value: number) => Math.sign(value) * Math.abs(value) ** 0.5;
  const dampAxis = (delta: number, allowNegative: boolean, allowPositive: boolean) => {
    if ((!allowNegative && delta < 0) || (!allowPositive && delta > 0)) {
      return exponent(delta);
    }
    return delta;
  };

  const x = allowLeft || allowRight ? dampAxis(deltaX, allowLeft, allowRight) : exponent(deltaX);
  const y = allowUp || allowDown ? dampAxis(deltaY, allowUp, allowDown) : exponent(deltaY);

  return { x, y };
}
