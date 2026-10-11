// Upstream: packages/react/src/floating-ui-react/utils/markOthers.ts
//
// While a modal popup is open, everything outside it is hidden from
// assistive tech (`aria-hidden`, or `inert`, which also keeps a script's
// focus and find in page out, as React Aria's sheet does) and marked
// `data-base-ui-inert` so outside presses can be told apart. Counted per
// element and per attribute, so stacked popups undo in any order and an
// element hidden by the page stays hidden.
import { getNodeName, isShadowRoot } from '@floating-ui/utils/dom';

import { ownerDocument } from '../../utils/dom.ts';

type Undo = () => void;

interface MarkOthersOptions {
  ariaHidden?: boolean | undefined;
  /** Hide them with `inert` in place of `aria-hidden`. */
  inert?: boolean | undefined;
  mark?: boolean | undefined;
}

type ControlAttribute = 'aria-hidden' | 'inert';

const markerName = 'data-base-ui-inert';

const newCounters = () => ({
  'aria-hidden': new WeakMap<Element, number>(),
  inert: new WeakMap<Element, number>(),
});
const newUncontrolled = () => ({
  'aria-hidden': new WeakSet<Element>(),
  inert: new WeakSet<Element>(),
});

let controlCounters = newCounters();
let uncontrolledElements = newUncontrolled();
let markerCounterMap = new WeakMap<Element, number>();
let lockCount = 0;

/** Whether `node` is hidden by `attribute` already (the page's own, or another popup's). */
const hiddenBy = (node: Element, attribute: ControlAttribute) => {
  const value = node.getAttribute(attribute);
  return attribute === 'inert' ? value !== null : value !== null && value !== 'false';
};

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
  controlAttribute: ControlAttribute | null,
  mark: boolean,
): Undo {
  const avoidElements = correctElements(body, uncorrectedAvoidElements);
  const markerTargets = mark
    ? collectOutsideElements(body, buildKeepSet(avoidElements), new Set<Node>(avoidElements))
    : [];
  const hiddenElements: Element[] = [];
  const markedElements: Element[] = [];
  const counters = controlAttribute ? controlCounters[controlAttribute] : null;
  const uncontrolled = controlAttribute ? uncontrolledElements[controlAttribute] : null;

  if (controlAttribute && counters && uncontrolled) {
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
      const alreadyHidden = hiddenBy(node, controlAttribute);
      const counterValue = (counters.get(node) || 0) + 1;
      counters.set(node, counterValue);
      hiddenElements.push(node);
      if (counterValue === 1 && alreadyHidden) {
        uncontrolled.add(node);
      }
      if (!alreadyHidden) {
        node.setAttribute(controlAttribute, controlAttribute === 'inert' ? '' : 'true');
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
    if (controlAttribute) {
      // Read again: the last undo of all may have started the counts afresh.
      const liveCounters = controlCounters[controlAttribute];
      const liveUncontrolled = uncontrolledElements[controlAttribute];
      for (const element of hiddenElements) {
        const counterValue = (liveCounters.get(element) || 0) - 1;
        liveCounters.set(element, counterValue);
        if (!counterValue) {
          if (!liveUncontrolled.has(element)) {
            element.removeAttribute(controlAttribute);
          }
          liveUncontrolled.delete(element);
        }
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
      controlCounters = newCounters();
      uncontrolledElements = newUncontrolled();
      markerCounterMap = new WeakMap();
    }
  };
}

/**
 * Marks (and with `ariaHidden` or `inert`, hides) every element outside
 * `avoidElements`; returns the undo.
 */
export function markOthers(avoidElements: Element[], options: MarkOthersOptions = {}): Undo {
  const { ariaHidden = false, inert = false, mark = true } = options;
  const body = ownerDocument(avoidElements[0]).body;
  const controlAttribute = inert ? 'inert' : ariaHidden ? 'aria-hidden' : null;
  return applyAttributeToOthers(avoidElements, body, controlAttribute, mark);
}
