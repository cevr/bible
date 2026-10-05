// Upstream: packages/react/src/toast/utils/isRenderableNode.ts,
// packages/react/src/toast/utils/focusVisible.ts
//
// Small helpers the toast parts share: deciding whether a part has content
// worth rendering, whether focus is visible, and the toast id generator.
import { matchesFocusVisible } from '../floating-ui-solid/utils/element.ts';

export { matchesFocusVisible as isFocusVisible };

/** Whether a JSX value renders anything: `null`, `undefined`, booleans and `''` do not. */
export function isRenderableNode(node: unknown): boolean {
  if (node == null || typeof node === 'boolean' || node === '') {
    return false;
  }
  if (Array.isArray(node)) {
    return node.some(isRenderableNode);
  }
  return true;
}

let toastIdCounter = 0;

/** A fresh toast id, unique within the page. */
export function generateToastId(): string {
  toastIdCounter += 1;
  return `toast-${toastIdCounter}`;
}
