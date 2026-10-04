// Upstream: packages/react/src/toast/utils/resolvePromiseOptions.ts,
// packages/react/src/toast/utils/isRenderableNode.ts,
// packages/react/src/toast/utils/focusVisible.ts
//
// Small helpers the toast parts share: turning a promise toast's state
// option into update options, deciding whether a part has content worth
// rendering, and the toast id generator.
import { matchesFocusVisible } from '../floating-ui-solid/utils/element.ts';
import type { ToastManagerUpdateOptions } from './types.ts';

export { matchesFocusVisible as isFocusVisible };

export function resolvePromiseOptions<T, Data extends object>(
  options:
    | string
    | ToastManagerUpdateOptions<Data>
    | ((result: T) => string | ToastManagerUpdateOptions<Data>),
  result?: T,
): ToastManagerUpdateOptions<Data> {
  if (typeof options === 'string') {
    return { description: options };
  }

  if (typeof options === 'function') {
    const resolvedOptions = options(result as T);
    return typeof resolvedOptions === 'string' ? { description: resolvedOptions } : resolvedOptions;
  }

  return options;
}

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
