// Upstream: packages/react/src/floating-ui-react/utils/composite.ts
//
// One-dimensional list stepping over a list of item elements: the next
// enabled index in a direction, the first and last enabled indexes, and
// whether an item counts as disabled (hidden, `:disabled`, `disabled`,
// `aria-disabled`). Grid navigation is not ported: no part here lays items
// out in a grid.
import { getComputedStyle } from '@floating-ui/utils/dom';

export function isIndexOutOfListBounds(list: ReadonlyArray<HTMLElement | null>, index: number) {
  return index < 0 || index >= list.length;
}

export function getMinListIndex(list: ReadonlyArray<HTMLElement | null>) {
  return findNonDisabledListIndex(list);
}

export function getMaxListIndex(list: ReadonlyArray<HTMLElement | null>) {
  return findNonDisabledListIndex(list, { decrement: true, startingIndex: list.length });
}

export function findNonDisabledListIndex(
  list: ReadonlyArray<HTMLElement | null>,
  options: { startingIndex?: number | undefined; decrement?: boolean | undefined } = {},
): number {
  const { startingIndex = -1, decrement = false } = options;
  let index = startingIndex;
  do {
    index += decrement ? -1 : 1;
  } while (index >= 0 && index <= list.length - 1 && isListIndexDisabled(list, index));
  return index;
}

export function isListIndexDisabled(list: ReadonlyArray<HTMLElement | null>, index: number) {
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

  return element.hasAttribute('disabled') || element.getAttribute('aria-disabled') === 'true';
}

function isHiddenByStyles(styles: CSSStyleDeclaration) {
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
