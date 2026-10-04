// Upstream: packages/react/src/floating-ui-react/safePolygon.ts
//
// Keeps a hover-opened popup open while the pointer travels from the trigger
// to the popup: a triangle from the pointer's exit point to the popup's near
// edge (plus the trough between them) counts as "on the way". Leaving it,
// or resting outside the popup, closes. While a child popup is open the
// parent stays open.
import { isElement } from '@floating-ui/utils/dom';

import { Timeout } from '../utils/timers.ts';
import type { FloatingTreeStore } from './FloatingTreeStore.ts';
import { getNodeChildren } from './utils/nodes.ts';
import { contains, getTarget } from './utils/element.ts';

type Side = 'top' | 'right' | 'bottom' | 'left';

interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface HandleCloseOptions {
  /** Blocks pointer events outside the trigger and popup while travelling between them. */
  blockPointerEvents?: boolean | undefined;
  getScope?: (() => HTMLElement | SVGSVGElement | null) | undefined;
}

export interface HandleCloseContext {
  x: number | null;
  y: number | null;
  placement: string | null;
  elements: { domReference: Element | null; floating: HTMLElement | null };
  onClose: () => void;
  nodeId?: string | undefined;
  tree?: FloatingTreeStore | null | undefined;
  leave?: boolean | undefined;
}

export interface HandleClose {
  (context: HandleCloseContext): (event: MouseEvent) => void;
  __options?: HandleCloseOptions | undefined;
}

export interface SafePolygonOptions extends HandleCloseOptions {}

const CURSOR_SPEED_THRESHOLD = 0.1;
const CURSOR_SPEED_THRESHOLD_SQUARED = CURSOR_SPEED_THRESHOLD * CURSOR_SPEED_THRESHOLD;
const POLYGON_BUFFER = 0.5;

function hasIntersectingEdge(
  pointX: number,
  pointY: number,
  xi: number,
  yi: number,
  xj: number,
  yj: number,
) {
  return yi >= pointY !== yj >= pointY && pointX <= ((xj - xi) * (pointY - yi)) / (yj - yi) + xi;
}

function isPointInQuadrilateral(
  pointX: number,
  pointY: number,
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  x3: number,
  y3: number,
  x4: number,
  y4: number,
) {
  let inside = false;
  if (hasIntersectingEdge(pointX, pointY, x1, y1, x2, y2)) {
    inside = !inside;
  }
  if (hasIntersectingEdge(pointX, pointY, x2, y2, x3, y3)) {
    inside = !inside;
  }
  if (hasIntersectingEdge(pointX, pointY, x3, y3, x4, y4)) {
    inside = !inside;
  }
  if (hasIntersectingEdge(pointX, pointY, x4, y4, x1, y1)) {
    inside = !inside;
  }
  return inside;
}

function isInsideRect(pointX: number, pointY: number, rect: Rect) {
  return (
    pointX >= rect.x &&
    pointX <= rect.x + rect.width &&
    pointY >= rect.y &&
    pointY <= rect.y + rect.height
  );
}

function isInsideAxisAlignedRect(
  pointX: number,
  pointY: number,
  x1: number,
  y1: number,
  x2: number,
  y2: number,
) {
  return (
    pointX >= Math.min(x1, x2) &&
    pointX <= Math.max(x1, x2) &&
    pointY >= Math.min(y1, y2) &&
    pointY <= Math.max(y1, y2)
  );
}

export function safePolygon(options: SafePolygonOptions = {}): HandleClose {
  const { blockPointerEvents = false } = options;
  const timeout = new Timeout();

  const fn: HandleClose = ({ x, y, placement, elements, onClose, nodeId, tree }) => {
    const side = placement?.split('-')[0] as Side | undefined;
    let hasLanded = false;
    let lastX: number | null = null;
    let lastY: number | null = null;
    let lastCursorTime = typeof performance !== 'undefined' ? performance.now() : 0;

    function isCursorMovingSlowly(nextX: number, nextY: number) {
      const currentTime = performance.now();
      const elapsedTime = currentTime - lastCursorTime;
      if (lastX === null || lastY === null || elapsedTime === 0) {
        lastX = nextX;
        lastY = nextY;
        lastCursorTime = currentTime;
        return false;
      }
      const deltaX = nextX - lastX;
      const deltaY = nextY - lastY;
      const distanceSquared = deltaX * deltaX + deltaY * deltaY;
      const thresholdSquared = elapsedTime * elapsedTime * CURSOR_SPEED_THRESHOLD_SQUARED;
      lastX = nextX;
      lastY = nextY;
      lastCursorTime = currentTime;
      return distanceSquared < thresholdSquared;
    }

    function close() {
      timeout.clear();
      onClose();
    }

    return function onMouseMove(event: MouseEvent) {
      timeout.clear();

      const domReference = elements.domReference;
      const floating = elements.floating;
      if (!domReference || !floating || side == null || x == null || y == null) {
        return;
      }

      const { clientX, clientY } = event;
      const target = getTarget(event) as Element | null;
      const isLeave = event.type === 'mouseleave';
      const isOverFloatingEl = contains(floating, target);
      const isOverReferenceEl = contains(domReference, target);

      if (isOverFloatingEl) {
        hasLanded = true;
        if (!isLeave) {
          return;
        }
      }

      if (isOverReferenceEl) {
        hasLanded = false;
        if (!isLeave) {
          hasLanded = true;
          return;
        }
      }

      if (isLeave && isElement(event.relatedTarget) && contains(floating, event.relatedTarget)) {
        return;
      }

      const hasOpenChildNode = () =>
        Boolean(tree && getNodeChildren(tree.nodesRef.current, nodeId).length > 0);

      const closeIfNoOpenChild = () => {
        if (!hasOpenChildNode()) {
          close();
        }
      };

      if (hasOpenChildNode()) {
        return;
      }

      const refRect = domReference.getBoundingClientRect();
      const rect = floating.getBoundingClientRect();
      const cursorLeaveFromRight = x > rect.right - rect.width / 2;
      const cursorLeaveFromBottom = y > rect.bottom - rect.height / 2;
      const isFloatingWider = rect.width > refRect.width;
      const isFloatingTaller = rect.height > refRect.height;
      const left = (isFloatingWider ? refRect : rect).left;
      const right = (isFloatingWider ? refRect : rect).right;
      const top = (isFloatingTaller ? refRect : rect).top;
      const bottom = (isFloatingTaller ? refRect : rect).bottom;

      // Leaving the trigger on the side away from the popup.
      if (
        (side === 'top' && y >= refRect.bottom - 1) ||
        (side === 'bottom' && y <= refRect.top + 1) ||
        (side === 'left' && x >= refRect.right - 1) ||
        (side === 'right' && x <= refRect.left + 1)
      ) {
        closeIfNoOpenChild();
        return;
      }

      // The gap between trigger and popup (an offset) counts as on the way.
      let isInsideTroughRect = false;
      switch (side) {
        case 'top':
          isInsideTroughRect = isInsideAxisAlignedRect(
            clientX,
            clientY,
            left,
            refRect.top + 1,
            right,
            rect.bottom - 1,
          );
          break;
        case 'bottom':
          isInsideTroughRect = isInsideAxisAlignedRect(
            clientX,
            clientY,
            left,
            rect.top + 1,
            right,
            refRect.bottom - 1,
          );
          break;
        case 'left':
          isInsideTroughRect = isInsideAxisAlignedRect(
            clientX,
            clientY,
            rect.right - 1,
            bottom,
            refRect.left + 1,
            top,
          );
          break;
        case 'right':
          isInsideTroughRect = isInsideAxisAlignedRect(
            clientX,
            clientY,
            refRect.right - 1,
            bottom,
            rect.left + 1,
            top,
          );
          break;
        default:
      }

      if (isInsideTroughRect) {
        return;
      }

      if (hasLanded && !isInsideRect(clientX, clientY, refRect)) {
        closeIfNoOpenChild();
        return;
      }

      if (!isLeave && isCursorMovingSlowly(clientX, clientY)) {
        closeIfNoOpenChild();
        return;
      }

      let isInsidePolygon = false;

      switch (side) {
        case 'top':
        case 'bottom': {
          const cursorXOffset = isFloatingWider ? POLYGON_BUFFER / 2 : POLYGON_BUFFER * 4;
          const cursorPointOneX = isFloatingWider
            ? x + cursorXOffset
            : cursorLeaveFromRight
              ? x + cursorXOffset
              : x - cursorXOffset;
          const cursorPointTwoX = isFloatingWider
            ? x - cursorXOffset
            : cursorLeaveFromRight
              ? x + cursorXOffset
              : x - cursorXOffset;
          const isTop = side === 'top';
          const cursorPointY = isTop ? y + POLYGON_BUFFER + 1 : y - POLYGON_BUFFER;
          const near = isTop ? rect.bottom - POLYGON_BUFFER : rect.top + POLYGON_BUFFER;
          const far = isTop ? rect.top : rect.bottom;
          const commonYLeft = cursorLeaveFromRight ? near : isFloatingWider ? near : far;
          const commonYRight = cursorLeaveFromRight ? (isFloatingWider ? near : far) : near;
          isInsidePolygon = isPointInQuadrilateral(
            clientX,
            clientY,
            cursorPointOneX,
            cursorPointY,
            cursorPointTwoX,
            cursorPointY,
            rect.left,
            commonYLeft,
            rect.right,
            commonYRight,
          );
          break;
        }
        case 'left':
        case 'right': {
          const cursorYOffset = isFloatingTaller ? POLYGON_BUFFER / 2 : POLYGON_BUFFER * 4;
          const cursorPointOneY = isFloatingTaller
            ? y + cursorYOffset
            : cursorLeaveFromBottom
              ? y + cursorYOffset
              : y - cursorYOffset;
          const cursorPointTwoY = isFloatingTaller
            ? y - cursorYOffset
            : cursorLeaveFromBottom
              ? y + cursorYOffset
              : y - cursorYOffset;
          const isLeft = side === 'left';
          const cursorPointX = isLeft ? x + POLYGON_BUFFER + 1 : x - POLYGON_BUFFER;
          const near = isLeft ? rect.right - POLYGON_BUFFER : rect.left + POLYGON_BUFFER;
          const far = isLeft ? rect.left : rect.right;
          const commonXTop = cursorLeaveFromBottom ? near : isFloatingTaller ? near : far;
          const commonXBottom = cursorLeaveFromBottom ? (isFloatingTaller ? near : far) : near;
          isInsidePolygon = isLeft
            ? isPointInQuadrilateral(
                clientX,
                clientY,
                commonXTop,
                rect.top,
                commonXBottom,
                rect.bottom,
                cursorPointX,
                cursorPointOneY,
                cursorPointX,
                cursorPointTwoY,
              )
            : isPointInQuadrilateral(
                clientX,
                clientY,
                cursorPointX,
                cursorPointOneY,
                cursorPointX,
                cursorPointTwoY,
                commonXTop,
                rect.top,
                commonXBottom,
                rect.bottom,
              );
          break;
        }
        default:
      }

      if (!isInsidePolygon) {
        closeIfNoOpenChild();
      } else if (!hasLanded) {
        timeout.start(40, closeIfNoOpenChild);
      }
    };
  };

  fn.__options = { ...options, blockPointerEvents };
  return fn;
}
