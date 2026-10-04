// Upstream: packages/utils/src/owner.ts, packages/utils/src/shadowDom.ts,
// packages/utils/src/addEventListener.ts, packages/utils/src/mergeCleanups.ts,
// packages/utils/src/empty.ts
//
// The DOM helpers every part shares: the element's document and window,
// shadow-DOM-aware `contains`, `closest` and active element, listeners that
// return their own removal, and cleanups merged into one.
import { getWindow, isElement, isShadowRoot } from '@floating-ui/utils/dom';

export { getWindow as ownerWindow };

export function ownerDocument(node: Element | null | undefined): Document {
  return node?.ownerDocument || document;
}

/** The focused element, looking through open shadow roots. */
export function activeElement(doc: Document): Element | null {
  let element = doc.activeElement;
  while (element?.shadowRoot?.activeElement != null) {
    element = element.shadowRoot.activeElement;
  }
  return element;
}

/** Whether `child` is `parent` or inside it, crossing shadow roots. */
export function contains(parent?: Element | null, child?: Element | null): boolean {
  if (!parent || !child) {
    return false;
  }
  const rootNode = child.getRootNode?.();
  if (parent.contains(child)) {
    return true;
  }
  if (rootNode && isShadowRoot(rootNode)) {
    let next: Element | null = child;
    while (next) {
      if (parent === next) {
        return true;
      }
      next = (next.parentNode as Element | null) || (next as unknown as ShadowRoot).host;
    }
  }
  return false;
}

/** `Element.closest` that walks out of slots and shadow roots. */
export function closest<E extends Element = Element>(
  node: Node | null | undefined,
  selector: string,
): E | null {
  let current: Node | null | undefined = node;
  while (current) {
    if (isElement(current) && current.matches(selector)) {
      return current as E;
    }
    current =
      (current as Element).assignedSlot ??
      current.parentNode ??
      (isShadowRoot(current) ? current.host : null);
  }
  return null;
}

/** The event's innermost target, through shadow roots. */
export function getTarget(event: Event): EventTarget | null {
  if ('composedPath' in event) {
    return event.composedPath()[0] ?? event.target;
  }
  return (event as Event).target;
}

type Listenable = Pick<EventTarget, 'addEventListener' | 'removeEventListener'>;

/** Adds a listener and returns the function that removes it. */
export function addEventListener<E extends Event = Event>(
  target: Listenable,
  type: string,
  listener: (event: E) => void,
  options?: boolean | AddEventListenerOptions,
): () => void {
  target.addEventListener(type, listener as EventListener, options);
  return () => {
    target.removeEventListener(type, listener as EventListener, options);
  };
}

type Cleanup = false | null | undefined | (() => void);

/** One cleanup that runs each given one in order, skipping the empty ones. */
export function mergeCleanups(...cleanups: Cleanup[]): () => void {
  return () => {
    for (const cleanup of cleanups) {
      if (cleanup) {
        cleanup();
      }
    }
  };
}

export function NOOP(): void {}

export const EMPTY_OBJECT: Readonly<Record<string, never>> = Object.freeze({});
export const EMPTY_ARRAY: never[] = Object.freeze([]) as never[];
