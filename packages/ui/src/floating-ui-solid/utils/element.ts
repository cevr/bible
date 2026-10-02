// Upstream: packages/react/src/floating-ui-react/utils/element.ts,
// packages/react/src/floating-ui-react/utils/constants.ts,
// packages/react/src/floating-ui-react/utils/createAttribute.ts
//
// Element predicates the interactions share: typeable fields, interactive
// elements, `:focus-visible`, and the element inside a popup that takes focus.
import { isElement, isHTMLElement } from '@floating-ui/utils/dom';

import { activeElement, closest, contains, getTarget } from '../../utils/dom.ts';
import { platform } from '../../utils/platform.ts';
import type { PopupTriggerMap } from '../../utils/popups/popupTriggerMap.ts';

export { activeElement, closest, contains, getTarget };

export const FOCUSABLE_ATTRIBUTE = 'data-base-ui-focusable';
export const ACTIVE_KEY = 'active';
export const SELECTED_KEY = 'selected';
export const TYPEABLE_SELECTOR =
  "input:not([type='hidden']):not([disabled])," +
  "[contenteditable]:not([contenteditable='false']),textarea:not([disabled])";
export const ARROW_LEFT = 'ArrowLeft';
export const ARROW_RIGHT = 'ArrowRight';
export const ARROW_UP = 'ArrowUp';
export const ARROW_DOWN = 'ArrowDown';

/** The tooltip trigger's attribute for a trigger that may not open its popup. */
export const TRIGGER_DISABLED_ATTRIBUTE = 'data-trigger-disabled';

export function createAttribute(name: string) {
  return `data-base-ui-${name}`;
}

export function isTargetInsideEnabledTrigger(
  target: EventTarget | null,
  triggerElements: PopupTriggerMap,
) {
  if (!isElement(target)) {
    return false;
  }
  const targetElement = target as Element;
  if (triggerElements.hasElement(targetElement)) {
    return !targetElement.hasAttribute(TRIGGER_DISABLED_ATTRIBUTE);
  }
  for (const [, trigger] of triggerElements.entries()) {
    if (contains(trigger, targetElement)) {
      return !trigger.hasAttribute(TRIGGER_DISABLED_ATTRIBUTE);
    }
  }
  return false;
}

export function isEventTargetWithin(event: Event, node: Node | null | undefined) {
  if (node == null) {
    return false;
  }
  if ('composedPath' in event) {
    return event.composedPath().includes(node);
  }
  const target = (event as Event).target;
  return target != null && node.contains(target as Node);
}

export function isRootElement(element: Element): boolean {
  return element.matches('html,body');
}

export function isTypeableElement(element: unknown): boolean {
  return isHTMLElement(element) && element.matches(TYPEABLE_SELECTOR);
}

export function isInteractiveElement(element: Element | null) {
  return (
    closest(
      element,
      `button,a[href],[role="button"],select,[tabindex]:not([tabindex="-1"]),${TYPEABLE_SELECTOR}`,
    ) != null
  );
}

export function isTypeableCombobox(element: Element | null) {
  if (!element) {
    return false;
  }
  return element.getAttribute('role') === 'combobox' && isTypeableElement(element);
}

export function matchesFocusVisible(element: Element | null) {
  if (!element || platform.env.jsdom) {
    return true;
  }
  try {
    return element.matches(':focus-visible');
  } catch {
    return true;
  }
}

/** The element inside a popup that takes focus: the one marked focusable, else the popup. */
export function getFloatingFocusElement(
  floatingElement: HTMLElement | null | undefined,
): HTMLElement | null {
  if (!floatingElement) {
    return null;
  }
  return floatingElement.hasAttribute(FOCUSABLE_ATTRIBUTE)
    ? floatingElement
    : floatingElement.querySelector<HTMLElement>(`[${FOCUSABLE_ATTRIBUTE}]`) || floatingElement;
}
