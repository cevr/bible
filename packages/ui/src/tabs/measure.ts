// Upstream: packages/react/src/utils/getCssDimensions.ts,
// packages/react/src/utils/getElementTransform.ts,
// packages/react/src/tabs/indicator/TabsIndicator.tsx (the measuring helpers)
//
// Where the active tab sits inside its tab list, for the indicator's CSS
// variables: the CSS size (untransformed), and the offset from the list's
// padding box. The layout offset (`offsetLeft`/`offsetTop`) is immune to
// transforms but whole-pixel; the rect offset is sub-pixel but warped by a
// rotation, skew or flip. The rect offset is used when the two agree, after
// taking out the tab's own translation (so the indicator follows a tab's
// local animation).
import { round } from '@floating-ui/utils';
import {
  getComputedStyle,
  getParentNode,
  isHTMLElement,
  isLastTraversableNode,
} from '@floating-ui/utils/dom';

import { ownerWindow } from '../utils/dom.ts';

/** `offsetLeft`/`offsetTop` round to whole pixels; the error compounds up the offset parents. */
const MAX_LAYOUT_ROUNDING_ERROR = 2;

export interface ActiveTabMeasurement {
  left: number;
  right: number;
  top: number;
  bottom: number;
  width: number;
  height: number;
}

/** The element's CSS width and height, falling back to its offset size when they disagree. */
export function getCssDimensions(element: Element): { width: number; height: number } {
  const css = getComputedStyle(element);
  let width = parseFloat(css.width) || 0;
  let height = parseFloat(css.height) || 0;
  const hasOffset = isHTMLElement(element);
  const offsetWidth = hasOffset ? element.offsetWidth : width;
  const offsetHeight = hasOffset ? element.offsetHeight : height;
  if (round(width) !== offsetWidth || round(height) !== offsetHeight) {
    width = offsetWidth;
    height = offsetHeight;
  }
  return { width, height };
}

/** The 2D translation and scale in the element's computed `transform` matrix. */
export function getElementTransform(element: HTMLElement, computedStyle?: CSSStyleDeclaration) {
  const transform = (computedStyle ?? ownerWindow(element).getComputedStyle(element)).transform;
  let x = 0;
  let y = 0;
  let scale = 1;
  if (transform && transform !== 'none') {
    const matrix = transform.match(/matrix(?:3d)?\(([^)]+)\)/);
    const values = matrix?.[1]?.split(', ').map(parseFloat) ?? [];
    if (values.length === 6) {
      x = values[4] ?? 0;
      y = values[5] ?? 0;
      const a = values[0] ?? 1;
      const b = values[1] ?? 0;
      scale = Math.sqrt(a * a + b * b);
    } else if (values.length === 16) {
      x = values[12] ?? 0;
      y = values[13] ?? 0;
      scale = values[0] ?? 1;
    }
  }
  return { x, y, scale };
}

/** The tab's offset inside the list in its layout, net of scrolling between them. */
function getLayoutOffset(element: HTMLElement, ancestor: HTMLElement) {
  const elementOffset = getCumulativeOffset(element);
  const ancestorOffset = getCumulativeOffset(ancestor);
  let left = elementOffset.left - ancestorOffset.left - ancestor.clientLeft;
  let top = elementOffset.top - ancestorOffset.top - ancestor.clientTop;
  // A scroll container between the tab and the list moves the tab on screen
  // without moving its layout slot; the list's own scroll is left in, since
  // the indicator scrolls with it.
  let node: Node | null = getParentNode(element);
  while (isHTMLElement(node) && node !== ancestor && !isLastTraversableNode(node)) {
    left -= node.scrollLeft;
    top -= node.scrollTop;
    node = getParentNode(node);
  }
  return { left, top };
}

function getCumulativeOffset(element: HTMLElement) {
  let left = 0;
  let top = 0;
  let current: HTMLElement | null = element;
  while (current != null) {
    left += current.offsetLeft;
    top += current.offsetTop;
    const offsetParent = current.offsetParent as HTMLElement | null;
    if (offsetParent != null) {
      left += offsetParent.clientLeft;
      top += offsetParent.clientTop;
    }
    current = offsetParent;
  }
  return { left, top };
}

/** The tab's own translation: its `transform` matrix plus the `translate` longhand. */
function getActiveTabTranslation(element: HTMLElement) {
  const computedStyle = ownerWindow(element).getComputedStyle(element);
  const { x, y } = getElementTransform(element, computedStyle);
  let translateX = x;
  let translateY = y;
  const { translate } = computedStyle;
  if (translate && translate !== 'none') {
    const parts = translate.split(' ');
    translateX += resolveTranslateLength(parts[0], element.offsetWidth);
    translateY += resolveTranslateLength(parts[1], element.offsetHeight);
  }
  return { x: translateX, y: translateY };
}

/** One `translate` component in pixels; anything but a number or percentage is none. */
function resolveTranslateLength(value: string | undefined, referenceSize: number): number {
  if (!value) {
    return 0;
  }
  const numeric = parseFloat(value);
  if (!Number.isFinite(numeric)) {
    return 0;
  }
  return value.endsWith('%') ? (numeric / 100) * referenceSize : numeric;
}

/** The active tab's position and size inside the tab list. */
export function measureActiveTab(
  activeTab: HTMLElement,
  tabsList: HTMLElement,
): ActiveTabMeasurement {
  const { width, height } = getCssDimensions(activeTab);
  const { width: listWidth, height: listHeight } = getCssDimensions(tabsList);
  const tabRect = activeTab.getBoundingClientRect();
  const listRect = tabsList.getBoundingClientRect();
  const scaleX = listWidth > 0 ? listRect.width / listWidth : 1;
  const scaleY = listHeight > 0 ? listRect.height / listHeight : 1;

  const layout = getLayoutOffset(activeTab, tabsList);
  let left = layout.left;
  let top = layout.top;

  const rectLeft =
    (tabRect.left - listRect.left) / scaleX + tabsList.scrollLeft - tabsList.clientLeft;
  const rectTop = (tabRect.top - listRect.top) / scaleY + tabsList.scrollTop - tabsList.clientTop;

  // A list scaled to zero gives NaN or Infinity here, which fails the check
  // and keeps the layout offset.
  const translation = getActiveTabTranslation(activeTab);
  if (
    Math.abs(rectLeft - translation.x - left) <= MAX_LAYOUT_ROUNDING_ERROR &&
    Math.abs(rectTop - translation.y - top) <= MAX_LAYOUT_ROUNDING_ERROR
  ) {
    left = rectLeft;
    top = rectTop;
  }

  return {
    left,
    top,
    width,
    height,
    right: tabsList.scrollWidth - left - width,
    bottom: tabsList.scrollHeight - top - height,
  };
}
