// Upstream: packages/react/src/internals/composite/composite.ts,
// packages/react/src/internals/composite/constants.ts,
// packages/react/src/internals/composite/root/useCompositeRoot.ts (the key logic)
//
// The keys a composite widget (a toggle group) moves its roving tab stop
// with, and the pure step from one highlighted index to the next: the left
// and right arrows, Home and End, wrapping at the ends, skipping disabled and
// hidden items. Also the scroll that keeps a newly highlighted item in view,
// and the tab stop's fallback when its item goes away. Vertical and grid
// navigation are not ported: the one composite here lays its items out in a
// row, read left to right.
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

type ItemList = ReadonlyArray<HTMLElement | null>;

/** Whether a modifier key is held (a held modifier leaves the key alone). */
export function hasModifierKey(event: Pick<KeyboardEvent, 'getModifierState'>): boolean {
  return MODIFIER_KEYS.some((key) => event.getModifierState(key));
}

export interface CompositeNavigationParameters {
  key: string;
  highlightedIndex: number;
  elements: ItemList;
}

interface CompositeNavigationResult {
  /** The index to highlight; `-1` (or the current index) when the key moves nothing. */
  index: number;
  /** Whether the key is one the composite acts on (its default is then prevented). */
  handled: boolean;
}

/** The index a navigation key moves the tab stop to. A key the composite does not use is not handled. */
export function getCompositeNavigationIndex(
  params: CompositeNavigationParameters,
): CompositeNavigationResult {
  const { key, highlightedIndex, elements } = params;
  if (!COMPOSITE_KEYS.has(key)) {
    return { index: highlightedIndex, handled: false };
  }
  const isHomeOrEnd = key === HOME || key === END;
  const minIndex = getMinListIndex(elements);
  const maxIndex = getMaxListIndex(elements);

  const isForwardKey = key === ARROW_RIGHT;
  const isBackwardKey = key === ARROW_LEFT;

  let nextIndex = highlightedIndex;
  if (key === HOME) {
    nextIndex = minIndex;
  } else if (key === END) {
    nextIndex = maxIndex;
  }

  if (nextIndex === highlightedIndex && (isForwardKey || isBackwardKey)) {
    if (nextIndex === maxIndex && isForwardKey) {
      nextIndex = minIndex;
    } else if (nextIndex === minIndex && isBackwardKey) {
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

/**
 * Scrolls `scrollContainer` along its row the least needed to show `element`,
 * honouring scroll margins and padding.
 */
export function scrollIntoViewIfNeeded(
  scrollContainer: HTMLElement | null,
  element: HTMLElement | null,
): void {
  if (!scrollContainer || !element || !element.scrollTo) {
    return;
  }

  let targetX = scrollContainer.scrollLeft;
  const isOverflowingX = scrollContainer.clientWidth < scrollContainer.scrollWidth;

  if (isOverflowingX) {
    const offsetLeft = getOffset(scrollContainer, element);
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

  scrollContainer.scrollTo({ left: targetX, top: scrollContainer.scrollTop, behavior: 'auto' });
}

function getOffset(ancestor: HTMLElement, element: HTMLElement) {
  let result = 0;
  let current = element;
  while (current.offsetParent) {
    result += current.offsetLeft;
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
    scrollMarginRight: parseFloat(styles.scrollMarginRight) || 0,
    scrollMarginLeft: parseFloat(styles.scrollMarginLeft) || 0,
    scrollPaddingRight: parseFloat(styles.scrollPaddingRight) || 0,
    scrollPaddingLeft: parseFloat(styles.scrollPaddingLeft) || 0,
  };
}
