// Upstream: packages/react/src/internals/composite/composite.ts,
// packages/react/src/internals/composite/constants.ts,
// packages/react/src/internals/composite/root/useCompositeRoot.ts (the key logic)
//
// The keys a composite widget (a toggle group) moves
// its roving tab stop with, and the pure step from one highlighted index to
// the next: arrow keys per orientation, Home and End, wrapping at the ends,
// skipping disabled items. Also the scroll that keeps a newly highlighted
// item in view, and the tab stop's fallback when its item goes away. Grid
// navigation is not ported: no part here lays items out in a grid. The parts
// read left to right.
import {
  findNonDisabledListIndex,
  getMaxListIndex,
  getMinListIndex,
  isListIndexDisabled,
} from '../../floating-ui-solid/utils/composite.ts';
import {
  ARROW_DOWN,
  ARROW_LEFT,
  ARROW_RIGHT,
  ARROW_UP,
} from '../../floating-ui-solid/utils/element.ts';

const HOME = 'Home';
const END = 'End';

export const COMPOSITE_KEYS = new Set([ARROW_UP, ARROW_DOWN, ARROW_LEFT, ARROW_RIGHT, HOME, END]);

const MODIFIER_KEYS = ['Shift', 'Control', 'Alt', 'Meta'] as const;

export type CompositeOrientation = 'horizontal' | 'vertical';

type ItemList = ReadonlyArray<HTMLElement | null>;

/** Whether a modifier key is held (a held modifier leaves the key alone). */
export function hasModifierKey(event: Pick<KeyboardEvent, 'getModifierState'>): boolean {
  return MODIFIER_KEYS.some((key) => event.getModifierState(key));
}

export interface CompositeNavigationParameters {
  key: string;
  highlightedIndex: number;
  elements: ItemList;
  orientation: CompositeOrientation;
  loopFocus: boolean;
}

export interface CompositeNavigationResult {
  /** The index to highlight; `-1` (or the current index) when the key moves nothing. */
  index: number;
  /** Whether the key is one the composite acts on (its default is then prevented). */
  handled: boolean;
}

/** The index a navigation key moves the tab stop to. A key the composite does not use is not handled. */
export function getCompositeNavigationIndex(
  params: CompositeNavigationParameters,
): CompositeNavigationResult {
  const { key, highlightedIndex, elements, orientation, loopFocus } = params;
  if (!COMPOSITE_KEYS.has(key)) {
    return { index: highlightedIndex, handled: false };
  }
  const isHomeOrEnd = key === HOME || key === END;
  const minIndex = getMinListIndex(elements);
  const maxIndex = getMaxListIndex(elements);

  const isForwardKey = key === (orientation === 'vertical' ? ARROW_DOWN : ARROW_RIGHT);
  const isBackwardKey = key === (orientation === 'vertical' ? ARROW_UP : ARROW_LEFT);

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
 * The item that should hold the tab stop once its item is gone: the first
 * item that can take focus, else 0 (so an all-disabled composite regains a
 * tab stop as soon as an item is enabled).
 */
export function getFallbackIndex(elements: ItemList): number {
  const index = elements.findIndex(
    (element, i) => element != null && !isListIndexDisabled(elements, i),
  );
  return Math.max(index, 0);
}

/** Scrolls `scrollContainer` the least needed to show `element`, honouring scroll margins and padding. */
export function scrollIntoViewIfNeeded(
  scrollContainer: HTMLElement | null,
  element: HTMLElement | null,
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
    if (overflowsRight) {
      targetX = alignRight;
    } else if (overflowsLeft) {
      targetX = alignLeft;
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
