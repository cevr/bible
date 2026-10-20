// Upstream: packages/react/src/floating-ui-react/utils/element.ts,
// packages/react/src/floating-ui-react/utils/constants.ts,
// packages/react/src/floating-ui-react/utils/createAttribute.ts
//
// Element predicates the interactions share: typeable fields, `:focus-visible`,
// and the element inside a popup that takes focus.
import { isHTMLElement } from '@floating-ui/utils/dom';

export const FOCUSABLE_ATTRIBUTE = 'data-base-ui-focusable';
const TYPEABLE_SELECTOR =
  "input:not([type='hidden']):not([disabled])," +
  "[contenteditable]:not([contenteditable='false']),textarea:not([disabled])";
export const ARROW_LEFT = 'ArrowLeft';
export const ARROW_RIGHT = 'ArrowRight';
export const ARROW_UP = 'ArrowUp';
export const ARROW_DOWN = 'ArrowDown';

export function createAttribute(name: string) {
  return `data-base-ui-${name}`;
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

/**
 * A field the user types into (a text input, a textarea, an editable region): the browser
 * shows the ring on one whatever focused it, a click too. A range, a checkbox or any other
 * input pressed rather than typed in is not one.
 */
const TEXT_FIELD_SELECTOR =
  'input:not([type=button],[type=checkbox],[type=radio],[type=range],[type=submit],[type=reset],[type=color],[type=file],[type=image],[type=hidden]),' +
  "textarea,[contenteditable]:not([contenteditable='false'])";

export function isTextField(element: unknown): boolean {
  return isHTMLElement(element) && element.matches(TEXT_FIELD_SELECTOR);
}

export function matchesFocusVisible(element: Element | null) {
  if (!element) {
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
