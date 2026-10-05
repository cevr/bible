// Upstream: packages/react/src/menu/utils/isKeyboardOpen.ts,
// packages/react/src/menu/utils/findRootOwnerId.ts
//
// Whether a menu opened from the keyboard (arrow keys report
// `list-navigation`; Enter and Space dispatch a click with `detail` 0, a
// mouse click carries 1 or more), and the menu an element belongs to.
import { getParentNode, isHTMLElement, isLastTraversableNode } from '@floating-ui/utils/dom';

import { REASONS } from '../../internals/reasons.ts';

export function isKeyboardClick(reason: string | null, event: Event | undefined): boolean {
  return (
    (reason === REASONS.triggerPress || reason === REASONS.itemPress) &&
    (event as MouseEvent | undefined)?.detail === 0
  );
}

export function isKeyboardOpen(reason: string | null, event: Event | undefined): boolean {
  return reason === REASONS.listNavigation || isKeyboardClick(reason, event);
}

/** The `data-rootownerid` of the menu `node` is inside, if any. */
export function findRootOwnerId(node: Node): string | undefined {
  if (isHTMLElement(node) && node.hasAttribute('data-rootownerid')) {
    return node.getAttribute('data-rootownerid') ?? undefined;
  }
  if (isLastTraversableNode(node)) {
    return undefined;
  }
  return findRootOwnerId(getParentNode(node));
}
