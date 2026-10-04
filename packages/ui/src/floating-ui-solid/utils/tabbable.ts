// Upstream: packages/react/src/floating-ui-react/utils/tabbable.ts
//
// Which elements take focus, and which of those the Tab key reaches, in DOM
// order through slots and open shadow roots. Base UI's own reading of the
// HTML focus rules (inert, hidden, closed <details>, named radio groups), so
// the `tabbable` package is not needed.
import { getComputedStyle, getNodeName, isHTMLElement, isShadowRoot } from '@floating-ui/utils/dom';

import { activeElement, contains, ownerDocument } from '../../utils/dom.ts';
import { isElementVisible } from './composite.ts';

export type FocusableElement = HTMLElement | SVGElement;

const CANDIDATE_SELECTOR =
  'a[href],button,input,select,textarea,summary,details,iframe,object,embed,[tabindex],[contenteditable]:not([contenteditable="false"]),audio[controls],video[controls]';

function getParentElement(element: Element) {
  const assignedSlot = (element as Element & { assignedSlot?: HTMLSlotElement | null })
    .assignedSlot;
  if (assignedSlot) {
    return assignedSlot;
  }
  if (element.parentElement) {
    return element.parentElement;
  }
  const rootNode = element.getRootNode();
  return isShadowRoot(rootNode) ? rootNode.host : null;
}

function getDetailsSummary(details: Element) {
  for (const child of Array.from(details.children)) {
    if (getNodeName(child) === 'summary') {
      return child;
    }
  }
  return null;
}

function isWithinOpenDetailsSummary(element: Element, details: Element) {
  const summary = getDetailsSummary(details);
  return !!summary && (element === summary || contains(summary, element));
}

function isFocusableCandidate(element: Element | null): element is FocusableElement {
  const nodeName = element ? getNodeName(element) : '';
  return (
    element != null &&
    element.matches(CANDIDATE_SELECTOR) &&
    (nodeName !== 'summary' ||
      (element.parentElement != null &&
        getNodeName(element.parentElement) === 'details' &&
        getDetailsSummary(element.parentElement) === element)) &&
    (nodeName !== 'details' || getDetailsSummary(element) == null) &&
    (nodeName !== 'input' || (element as HTMLInputElement).type !== 'hidden')
  );
}

function isVisibleInTabbableTree(element: Element, isAncestor: boolean) {
  const styles = getComputedStyle(element);
  if (!isAncestor) {
    return isElementVisible(element, styles);
  }
  return styles.display !== 'none';
}

function isFocusableElement(element: Element | null): element is FocusableElement {
  if (!isFocusableCandidate(element) || !element.isConnected || element.matches(':disabled')) {
    return false;
  }
  for (let current: Element | null = element; current; current = getParentElement(current)) {
    const isAncestor = current !== element;
    const isSlot = getNodeName(current) === 'slot';
    if (current.hasAttribute('inert')) {
      return false;
    }
    if (
      (isAncestor &&
        getNodeName(current) === 'details' &&
        !(current as HTMLDetailsElement).open &&
        !isWithinOpenDetailsSummary(element, current)) ||
      current.hasAttribute('hidden') ||
      (!isSlot && !isVisibleInTabbableTree(current, isAncestor))
    ) {
      return false;
    }
  }
  return true;
}

function getTabIndex(element: FocusableElement) {
  const tabIndex = element.tabIndex;
  if (tabIndex < 0) {
    const nodeName = getNodeName(element);
    if (
      nodeName === 'details' ||
      nodeName === 'audio' ||
      nodeName === 'video' ||
      (isHTMLElement(element) && element.isContentEditable)
    ) {
      return 0;
    }
  }
  return tabIndex;
}

function getNamedRadioInput(element: FocusableElement) {
  if (getNodeName(element) !== 'input') {
    return null;
  }
  const input = element as HTMLInputElement;
  return input.type === 'radio' && input.name !== '' ? input : null;
}

function isTabbableRadio(element: FocusableElement, candidates: FocusableElement[]) {
  const input = getNamedRadioInput(element);
  if (!input) {
    return true;
  }
  const checkedRadio = candidates.find((candidate) => {
    const radio = getNamedRadioInput(candidate);
    return radio?.name === input.name && radio.form === input.form && radio.checked;
  });
  if (checkedRadio) {
    return checkedRadio === input;
  }
  return (
    candidates.find((candidate) => {
      const radio = getNamedRadioInput(candidate);
      return radio?.name === input.name && radio.form === input.form;
    }) === input
  );
}

function getComposedChildren(container: ParentNode): Element[] {
  if (isHTMLElement(container) && getNodeName(container) === 'slot') {
    const assigned = (container as HTMLSlotElement).assignedElements({ flatten: true });
    if (assigned.length > 0) {
      return assigned;
    }
  }
  if (isHTMLElement(container) && container.shadowRoot) {
    return Array.from(container.shadowRoot.children);
  }
  return Array.from(container.children);
}

function appendCandidates(container: ParentNode, list: FocusableElement[]) {
  for (const child of getComposedChildren(container)) {
    if (isFocusableCandidate(child)) {
      list.push(child);
    }
    appendCandidates(child, list);
  }
}

function appendMatchingElements(container: ParentNode, selector: string, list: HTMLElement[]) {
  for (const child of getComposedChildren(container)) {
    if (isHTMLElement(child) && child.matches(selector)) {
      list.push(child);
    }
    appendMatchingElements(child, selector, list);
  }
}

export function isTabbable(element: Element | null): element is FocusableElement {
  return isFocusableElement(element) && getTabIndex(element) >= 0;
}

export function focusable(container: Element): FocusableElement[] {
  const candidates: FocusableElement[] = [];
  appendCandidates(container, candidates);
  return candidates.filter(isFocusableElement);
}

export function tabbable(container: Element): FocusableElement[] {
  const candidates = focusable(container);
  return candidates.filter(
    (element) => getTabIndex(element) >= 0 && isTabbableRadio(element, candidates),
  );
}

function getTabbableIn(container: HTMLElement, dir: 1 | -1): FocusableElement | undefined {
  const list = tabbable(container);
  const len = list.length;
  if (len === 0) {
    return undefined;
  }
  const active = activeElement(ownerDocument(container)) as FocusableElement;
  const index = list.indexOf(active);
  const nextIndex = index === -1 ? (dir === 1 ? 0 : len - 1) : index + dir;
  return list[nextIndex];
}

export function getNextTabbable(referenceElement: Element | null): FocusableElement | null {
  return (
    getTabbableIn(ownerDocument(referenceElement).body, 1) || (referenceElement as FocusableElement)
  );
}

export function getPreviousTabbable(referenceElement: Element | null): FocusableElement | null {
  return (
    getTabbableIn(ownerDocument(referenceElement).body, -1) ||
    (referenceElement as FocusableElement)
  );
}

/** The tabbable element before or after `referenceElement` in the document, skipping `exclude`. */
export function getTabbableNearElement(
  referenceElement: Element | null,
  direction: 1 | -1,
  exclude?: Element | null,
): FocusableElement | null {
  if (!referenceElement) {
    return null;
  }
  const list: FocusableElement[] = [];
  appendCandidates(ownerDocument(referenceElement).body, list);
  const index = list.indexOf(referenceElement as FocusableElement);
  if (index === -1) {
    return null;
  }
  const candidates = list.filter(isFocusableElement);
  for (let offset = 1; offset < list.length; offset += 1) {
    const element = list[(index + direction * offset + list.length) % list.length];
    if (!element) {
      continue;
    }
    if (
      !contains(exclude, element) &&
      isTabbable(element) &&
      isTabbableRadio(element, candidates)
    ) {
      return element;
    }
  }
  return list[index] ?? null;
}

/** Whether focus moved to somewhere outside `container` (the listener's element by default). */
export function isOutsideEvent(event: FocusEvent, container?: Element | null) {
  const containerElement = container || (event.currentTarget as Element);
  const relatedTarget = event.relatedTarget as HTMLElement | null;
  return !relatedTarget || !contains(containerElement, relatedTarget);
}

/** Takes every tabbable element inside `container` out of the tab order, remembering its tabindex. */
export function disableFocusInside(container: HTMLElement) {
  for (const element of tabbable(container)) {
    (element as HTMLElement).dataset['tabindex'] = element.getAttribute('tabindex') || '';
    element.setAttribute('tabindex', '-1');
  }
}

/** Restores the tabindex `disableFocusInside` remembered. */
export function enableFocusInside(container: HTMLElement) {
  const elements: HTMLElement[] = [];
  appendMatchingElements(container, '[data-tabindex]', elements);
  for (const element of elements) {
    const tabindex = element.dataset['tabindex'];
    delete element.dataset['tabindex'];
    if (tabindex) {
      element.setAttribute('tabindex', tabindex);
    } else {
      element.removeAttribute('tabindex');
    }
  }
}
