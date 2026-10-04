// Upstream: packages/react/src/menu/utils/isKeyboardOpen.ts,
// packages/react/src/menu/utils/findRootOwnerId.ts,
// packages/react/src/menu/utils/stateAttributesMapping.ts
//
// Whether a menu opened from the keyboard (arrow keys report
// `list-navigation`; Enter and Space dispatch a click with `detail` 0, a
// mouse click carries 1 or more), the menu tree an element belongs to, and
// the checked-state attributes of checkbox and radio items.
import { getParentNode, isHTMLElement, isLastTraversableNode } from '@floating-ui/utils/dom';

import type { StateAttributesMapping } from '../../internals/getStateAttributesProps.ts';
import { REASONS } from '../../internals/reasons.ts';
import { type TransitionStatus, transitionStatusMapping } from '../../internals/transitions.ts';

export function isKeyboardClick(reason: string | null, event: Event | undefined): boolean {
  return (
    (reason === REASONS.triggerPress || reason === REASONS.itemPress) &&
    (event as MouseEvent | undefined)?.detail === 0
  );
}

export function isKeyboardOpen(reason: string | null, event: Event | undefined): boolean {
  return reason === REASONS.listNavigation || isKeyboardClick(reason, event);
}

/** The `data-rootownerid` of the menu tree `node` is inside, if any. */
export function findRootOwnerId(node: Node): string | undefined {
  if (isHTMLElement(node) && node.hasAttribute('data-rootownerid')) {
    return node.getAttribute('data-rootownerid') ?? undefined;
  }
  if (isLastTraversableNode(node)) {
    return undefined;
  }
  return findRootOwnerId(getParentNode(node));
}

const CHECKED = { 'data-checked': '' };
const UNCHECKED = { 'data-unchecked': '' };

export const itemMapping: StateAttributesMapping<{
  checked: boolean;
  transitionStatus?: TransitionStatus;
}> = {
  checked(value) {
    return value ? CHECKED : UNCHECKED;
  },
  ...transitionStatusMapping,
};
