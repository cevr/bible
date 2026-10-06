// Upstream: packages/react/src/internals/composite/composite.ts,
// packages/react/src/internals/composite/constants.ts,
// packages/utils/src/isElementDisabled.ts,
// packages/react/src/internals/composite/root/useCompositeRoot.ts (the key logic)
//
// The keys a composite widget (a toggle group) moves
// its roving tab stop with, and the pure step from one highlighted index to
// the next: arrow keys per orientation (swapped in right-to-left), Home and
// End, wrapping at the ends, skipping disabled items. Also the scroll that
// keeps a newly highlighted item in view, and the tab stop's fallback when its
// item goes away. Grid navigation is not ported: no part here lays items out
// in a grid.
import { isHTMLElement } from '@floating-ui/utils/dom';

import type { TextDirection } from '../DirectionContext.ts';
import {
  findNonDisabledListIndex,
  getMaxListIndex,
  getMinListIndex,
  isIndexOutOfListBounds,
  isListIndexDisabled,
} from '../../floating-ui-solid/utils/composite.ts';

export {
  findNonDisabledListIndex,
  getMaxListIndex,
  getMinListIndex,
  isIndexOutOfListBounds,
  isListIndexDisabled,
};

/** Marks the item that should hold the tab stop when the composite first registers its items. */
export const ACTIVE_COMPOSITE_ITEM = 'data-composite-item-active';

export const ARROW_UP = 'ArrowUp';
export const ARROW_DOWN = 'ArrowDown';
export const ARROW_LEFT = 'ArrowLeft';
export const ARROW_RIGHT = 'ArrowRight';
export const HOME = 'Home';
export const END = 'End';

export const COMPOSITE_KEYS = new Set([ARROW_UP, ARROW_DOWN, ARROW_LEFT, ARROW_RIGHT, HOME, END]);

const MODIFIER_KEYS = ['Shift', 'Control', 'Alt', 'Meta'] as const;

export type CompositeOrientation = 'horizontal' | 'vertical' | 'both';

type ItemList = ReadonlyArray<HTMLElement | null>;

/** Whether the element is a text input or textarea, whose caret the arrow keys move. */
export function isNativeInput(
  element: EventTarget,
): element is HTMLElement & (HTMLInputElement | HTMLTextAreaElement) {
  if (
    isHTMLElement(element) &&
    element.tagName === 'INPUT' &&
    (element as HTMLInputElement).selectionStart != null
  ) {
    return true;
  }
  return isHTMLElement(element) && element.tagName === 'TEXTAREA';
}

export function isElementDisabled(element: HTMLElement | null): boolean {
  return (
    element == null ||
    element.hasAttribute('disabled') ||
    element.getAttribute('aria-disabled') === 'true'
  );
}

/** Whether a modifier key is held (a held modifier leaves the key alone). */
export function hasModifierKey(event: Pick<KeyboardEvent, 'getModifierState'>): boolean {
  return MODIFIER_KEYS.some((key) => event.getModifierState(key));
}

/** The forward and backward keys for an orientation and direction. */
export function getNavigationKeys(orientation: CompositeOrientation, direction: TextDirection) {
  const rtl = direction === 'rtl';
  const horizontalForward = rtl ? ARROW_LEFT : ARROW_RIGHT;
  const horizontalBackward = rtl ? ARROW_RIGHT : ARROW_LEFT;
  return {
    horizontalForward,
    horizontalBackward,
    forward: orientation === 'vertical' ? ARROW_DOWN : horizontalForward,
    backward: orientation === 'vertical' ? ARROW_UP : horizontalBackward,
  };
}

export interface CompositeNavigationParameters {
  key: string;
  highlightedIndex: number;
  elements: ItemList;
  orientation: CompositeOrientation;
  direction: TextDirection;
  loopFocus: boolean;
  enableHomeAndEndKeys: boolean;
}

export interface CompositeNavigationResult {
  /** The index to highlight; `-1` (or the current index) when the key moves nothing. */
  index: number;
  /** Whether the key is one the composite acts on (its default is then prevented). */
  handled: boolean;
}

/**
 * The index a navigation key moves the tab stop to. A key the composite does
 * not use (or Home/End without `enableHomeAndEndKeys`) is not handled.
 */
export function getCompositeNavigationIndex(
  params: CompositeNavigationParameters,
): CompositeNavigationResult {
  const { key, highlightedIndex, elements, orientation, loopFocus } = params;
  const isHomeOrEnd = key === HOME || key === END;
  if (!COMPOSITE_KEYS.has(key) || (!params.enableHomeAndEndKeys && isHomeOrEnd)) {
    return { index: highlightedIndex, handled: false };
  }
  const keys = getNavigationKeys(orientation, params.direction);
  const minIndex = getMinListIndex(elements);
  const maxIndex = getMaxListIndex(elements);

  const isForwardKey =
    (orientation !== 'vertical' && key === keys.horizontalForward) ||
    (orientation !== 'horizontal' && key === ARROW_DOWN);
  const isBackwardKey =
    (orientation !== 'vertical' && key === keys.horizontalBackward) ||
    (orientation !== 'horizontal' && key === ARROW_UP);

  let nextIndex = highlightedIndex;
  if (key === HOME) {
    nextIndex = minIndex;
  } else if (key === END) {
    nextIndex = maxIndex;
  }

  if (nextIndex === highlightedIndex && (isForwardKey || isBackwardKey)) {
    if (loopFocus && nextIndex === maxIndex && isForwardKey) {
      nextIndex = minIndex;
    } else if (loopFocus && nextIndex === minIndex && isBackwardKey) {
      nextIndex = maxIndex;
    } else {
      nextIndex = findNonDisabledListIndex(elements, {
        startingIndex: nextIndex,
        decrement: isBackwardKey,
      });
    }
  }

  return { index: nextIndex, handled: isHomeOrEnd || isForwardKey || isBackwardKey };
}

/**
 * The item that should hold the tab stop once its item is gone: the active
 * item when it can take focus, else the first item that can, else 0 (so an
 * all-disabled composite regains a tab stop as soon as an item is enabled).
 */
export function getFallbackIndex(elements: ItemList): number {
  let fallbackIndex = -1;
  for (let index = 0; index < elements.length; index += 1) {
    const element = elements[index];
    if (!element || isListIndexDisabled(elements, index)) {
      continue;
    }
    if (element.hasAttribute(ACTIVE_COMPOSITE_ITEM)) {
      return index;
    }
    if (fallbackIndex === -1) {
      fallbackIndex = index;
    }
  }
  return Math.max(fallbackIndex, 0);
}

/** Scrolls `scrollContainer` the least needed to show `element`, honouring scroll margins and padding. */
export function scrollIntoViewIfNeeded(
  scrollContainer: HTMLElement | null,
  element: HTMLElement | null,
  direction: TextDirection,
  orientation: CompositeOrientation,
): void {
  if (!scrollContainer || !element || !element.scrollTo) {
    return;
  }

  let targetX = scrollContainer.scrollLeft;
  let targetY = scrollContainer.scrollTop;

  const isOverflowingX = scrollContainer.clientWidth < scrollContainer.scrollWidth;
  const isOverflowingY = scrollContainer.clientHeight < scrollContainer.scrollHeight;

  if (isOverflowingX && orientation !== 'vertical') {
    const offsetLeft = getOffset(scrollContainer, element, 'left');
    const container = getStyles(scrollContainer);
    const item = getStyles(element);
    const overflowsRight =
      offsetLeft + element.offsetWidth + item.scrollMarginRight >
      scrollContainer.scrollLeft + scrollContainer.clientWidth - container.scrollPaddingRight;
    const overflowsLeft =
      offsetLeft - item.scrollMarginLeft < scrollContainer.scrollLeft + container.scrollPaddingLeft;
    const alignRight =
      offsetLeft +
      element.offsetWidth +
      item.scrollMarginRight -
      scrollContainer.clientWidth +
      container.scrollPaddingRight;
    const alignLeft = offsetLeft - item.scrollMarginLeft - container.scrollPaddingLeft;

    // The edge checked first is the one the reading direction runs toward.
    if (direction === 'ltr') {
      if (overflowsRight) {
        targetX = alignRight;
      } else if (overflowsLeft) {
        targetX = alignLeft;
      }
    } else if (overflowsLeft) {
      targetX = alignLeft;
    } else if (overflowsRight) {
      targetX = alignRight;
    }
  }

  if (isOverflowingY && orientation !== 'horizontal') {
    const offsetTop = getOffset(scrollContainer, element, 'top');
    const container = getStyles(scrollContainer);
    const item = getStyles(element);

    if (offsetTop - item.scrollMarginTop < scrollContainer.scrollTop + container.scrollPaddingTop) {
      targetY = offsetTop - item.scrollMarginTop - container.scrollPaddingTop;
    } else if (
      offsetTop + element.offsetHeight + item.scrollMarginBottom >
      scrollContainer.scrollTop + scrollContainer.clientHeight - container.scrollPaddingBottom
    ) {
      targetY =
        offsetTop +
        element.offsetHeight +
        item.scrollMarginBottom -
        scrollContainer.clientHeight +
        container.scrollPaddingBottom;
    }
  }

  scrollContainer.scrollTo({ left: targetX, top: targetY, behavior: 'auto' });
}

function getOffset(ancestor: HTMLElement, element: HTMLElement, side: 'left' | 'top') {
  const propName = side === 'left' ? 'offsetLeft' : 'offsetTop';
  let result = 0;
  let current = element;
  while (current.offsetParent) {
    result += current[propName];
    if (current.offsetParent === ancestor) {
      break;
    }
    current = current.offsetParent as HTMLElement;
  }
  return result;
}

function getStyles(element: HTMLElement) {
  const styles = getComputedStyle(element);
  return {
    scrollMarginTop: parseFloat(styles.scrollMarginTop) || 0,
    scrollMarginRight: parseFloat(styles.scrollMarginRight) || 0,
    scrollMarginBottom: parseFloat(styles.scrollMarginBottom) || 0,
    scrollMarginLeft: parseFloat(styles.scrollMarginLeft) || 0,
    scrollPaddingTop: parseFloat(styles.scrollPaddingTop) || 0,
    scrollPaddingRight: parseFloat(styles.scrollPaddingRight) || 0,
    scrollPaddingBottom: parseFloat(styles.scrollPaddingBottom) || 0,
    scrollPaddingLeft: parseFloat(styles.scrollPaddingLeft) || 0,
  };
}
