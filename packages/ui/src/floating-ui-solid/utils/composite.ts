// Upstream: packages/react/src/floating-ui-react/utils/composite.ts
//
// One-dimensional list stepping over a list of item elements: the next
// enabled index in a direction, stopping or wrapping at the ends, and whether
// an item counts as disabled (hidden, `:disabled`, `aria-disabled`). Grid
// navigation is not ported: no part here lays items out in a grid.
//
// `reachDisabled` keeps items marked disabled (`disabled`, `aria-disabled`)
// reachable, as a menu's are; hidden and natively `:disabled` items are
// skipped either way.
import { getComputedStyle } from '@floating-ui/utils/dom';

export function isIndexOutOfListBounds(list: ReadonlyArray<HTMLElement | null>, index: number) {
  return index < 0 || index >= list.length;
}

export function getMinListIndex(list: ReadonlyArray<HTMLElement | null>, reachDisabled = false) {
  return findNonDisabledListIndex(list, { reachDisabled });
}

export function getMaxListIndex(list: ReadonlyArray<HTMLElement | null>, reachDisabled = false) {
  return findNonDisabledListIndex(list, {
    decrement: true,
    startingIndex: list.length,
    reachDisabled,
  });
}

export interface ListStepOptions {
  decrement: boolean;
  loopFocus: boolean;
  reachDisabled?: boolean | undefined;
  minIndex: number;
  maxIndex: number;
}

/** The index one step from `currentIndex`, and whether the step wrapped around. */
export function getNextListIndex(
  list: ReadonlyArray<HTMLElement | null>,
  currentIndex: number,
  options: ListStepOptions,
): { index: number; wrapped: boolean } {
  const { decrement, loopFocus, reachDisabled, minIndex, maxIndex } = options;
  const step = () =>
    findNonDisabledListIndex(list, { startingIndex: currentIndex, decrement, reachDisabled });

  let index: number;
  let wrapped = false;

  if (!loopFocus) {
    index = decrement ? Math.max(minIndex, step()) : Math.min(maxIndex, step());
  } else if (decrement ? currentIndex <= minIndex : currentIndex >= maxIndex) {
    index = decrement ? maxIndex : minIndex;
    wrapped = true;
  } else {
    index = step();
  }

  return { index: isIndexOutOfListBounds(list, index) ? -1 : index, wrapped };
}

export function findNonDisabledListIndex(
  list: ReadonlyArray<HTMLElement | null>,
  options: {
    startingIndex?: number | undefined;
    decrement?: boolean | undefined;
    reachDisabled?: boolean | undefined;
  } = {},
): number {
  const { startingIndex = -1, decrement = false, reachDisabled = false } = options;
  let index = startingIndex;
  do {
    index += decrement ? -1 : 1;
  } while (
    index >= 0 &&
    index <= list.length - 1 &&
    isListIndexDisabled(list, index, reachDisabled)
  );
  return index;
}

export function isListIndexDisabled(
  list: ReadonlyArray<HTMLElement | null>,
  index: number,
  reachDisabled = false,
) {
  const element = list[index];
  if (!element) {
    return false;
  }

  if (!isElementVisible(element)) {
    return true;
  }

  if (element.matches(':disabled')) {
    return true;
  }

  return (
    !reachDisabled &&
    (element.hasAttribute('disabled') || element.getAttribute('aria-disabled') === 'true')
  );
}

export function isHiddenByStyles(styles: CSSStyleDeclaration) {
  return styles.visibility === 'hidden' || styles.visibility === 'collapse';
}

export function isElementVisible(
  element: Element | null,
  styles: CSSStyleDeclaration | null = element ? getComputedStyle(element) : null,
) {
  if (!element || !element.isConnected || !styles || isHiddenByStyles(styles)) {
    return false;
  }
  if (typeof element.checkVisibility === 'function') {
    return element.checkVisibility();
  }
  return styles.display !== 'none' && styles.display !== 'contents';
}
