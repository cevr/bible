// Upstream: packages/react/src/floating-ui-react/utils/markOthers.ts
//
// While a modal popup is open, everything outside it is hidden from
// assistive tech (`aria-hidden`) and marked `data-base-ui-inert` so outside
// presses can be told apart. Counted per element, so stacked popups undo in
// any order and an element hidden by the page stays hidden.
import { getNodeName, isShadowRoot } from '@floating-ui/utils/dom';

import { ownerDocument } from '../../utils/dom.ts';

type Undo = () => void;

interface MarkOthersOptions {
  ariaHidden?: boolean | undefined;
  mark?: boolean | undefined;
}

const markerName = 'data-base-ui-inert';

let ariaHiddenCounterMap = new WeakMap<Element, number>();
let uncontrolledElementsSet = new WeakSet<Element>();
let markerCounterMap = new WeakMap<Element, number>();
let lockCount = 0;

function unwrapHost(node: Node | null): Element | null {
  if (!node) {
    return null;
  }
  return isShadowRoot(node) ? node.host : unwrapHost(node.parentNode);
}

const correctElements = (parent: HTMLElement, targets: Element[]): Element[] =>
  targets
    .map((target) => {
      if (parent.contains(target)) {
        return target;
      }
      const correctedTarget = unwrapHost(target);
      if (parent.contains(correctedTarget)) {
        return correctedTarget;
      }
      return null;
    })
    .filter((x): x is Element => x != null);

const buildKeepSet = (targets: Element[]): Set<Node> => {
  const keep = new Set<Node>();
  for (const target of targets) {
    let node: Node | null = target;
    while (node && !keep.has(node)) {
      keep.add(node);
      node = node.parentNode;
    }
  }
  return keep;
};

const collectOutsideElements = (
  root: HTMLElement,
  keepElements: Set<Node>,
  stopElements: Set<Node>,
): Element[] => {
  const outside: Element[] = [];
  const walk = (parent: Element | null) => {
    if (!parent || stopElements.has(parent)) {
      return;
    }
    for (const node of Array.from(parent.children)) {
      if (getNodeName(node) === 'script') {
        continue;
      }
      if (keepElements.has(node)) {
        walk(node);
      } else {
        outside.push(node);
      }
    }
  };
  walk(root);
  return outside;
};

function applyAttributeToOthers(
  uncorrectedAvoidElements: Element[],
  body: HTMLElement,
  ariaHidden: boolean,
  mark: boolean,
): Undo {
  const avoidElements = correctElements(body, uncorrectedAvoidElements);
  const markerTargets = mark
    ? collectOutsideElements(body, buildKeepSet(avoidElements), new Set<Node>(avoidElements))
    : [];
  const hiddenElements: Element[] = [];
  const markedElements: Element[] = [];

  if (ariaHidden) {
    const ariaLiveElements = correctElements(
      body,
      Array.from(body.querySelectorAll('[aria-live]')),
    );
    const controlElements = avoidElements.concat(ariaLiveElements);
    const controlTargets = collectOutsideElements(
      body,
      buildKeepSet(controlElements),
      new Set<Node>(controlElements),
    );
    for (const node of controlTargets) {
      const attr = node.getAttribute('aria-hidden');
      const alreadyHidden = attr !== null && attr !== 'false';
      const counterValue = (ariaHiddenCounterMap.get(node) || 0) + 1;
      ariaHiddenCounterMap.set(node, counterValue);
      hiddenElements.push(node);
      if (counterValue === 1 && alreadyHidden) {
        uncontrolledElementsSet.add(node);
      }
      if (!alreadyHidden) {
        node.setAttribute('aria-hidden', 'true');
      }
    }
  }

  if (mark) {
    for (const node of markerTargets) {
      const markerValue = (markerCounterMap.get(node) || 0) + 1;
      markerCounterMap.set(node, markerValue);
      markedElements.push(node);
      if (markerValue === 1) {
        node.setAttribute(markerName, '');
      }
    }
  }

  lockCount += 1;

  return () => {
    for (const element of hiddenElements) {
      const counterValue = (ariaHiddenCounterMap.get(element) || 0) - 1;
      ariaHiddenCounterMap.set(element, counterValue);
      if (!counterValue) {
        if (!uncontrolledElementsSet.has(element)) {
          element.removeAttribute('aria-hidden');
        }
        uncontrolledElementsSet.delete(element);
      }
    }
    if (mark) {
      for (const element of markedElements) {
        const markerValue = (markerCounterMap.get(element) || 0) - 1;
        markerCounterMap.set(element, markerValue);
        if (!markerValue) {
          element.removeAttribute(markerName);
        }
      }
    }
    lockCount -= 1;
    if (!lockCount) {
      ariaHiddenCounterMap = new WeakMap();
      uncontrolledElementsSet = new WeakSet();
      markerCounterMap = new WeakMap();
    }
  };
}

/** Marks (and with `ariaHidden`, hides) every element outside `avoidElements`; returns the undo. */
export function markOthers(avoidElements: Element[], options: MarkOthersOptions = {}): Undo {
  const { ariaHidden = false, mark = true } = options;
  const body = ownerDocument(avoidElements[0]).body;
  return applyAttributeToOthers(avoidElements, body, ariaHidden, mark);
}
