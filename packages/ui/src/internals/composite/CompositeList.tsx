// Upstream: packages/react/src/internals/composite/list/CompositeList.tsx,
// packages/react/src/internals/composite/list/useCompositeListItem.ts,
// packages/react/src/internals/composite/list/CompositeListContext.ts
//
// The registry of a list's items (menu items, a toggle group's toggles): each
// item registers its element, and gets its index, its position among the
// connected items in document order. The list
// keeps `elementsRef` (for list navigation) and `labelsRef` (for typeahead)
// in index order. Registrations made in one tick are applied together on
// the next microtask; a move of items in the DOM re-sorts them.
import type { JSX } from '@solidjs/web';
import { type Accessor, createContext, createSignal, onCleanup, useContext } from 'solid-js';

/** Each registered item's element and its index. */
export type CompositeIndexMap = Map<Element, number>;

interface CompositeListRegistration {
  label: string | null | undefined;
}

interface CompositeListContextValue {
  register: (node: Element, registration: CompositeListRegistration) => void;
  unregister: (node: Element) => void;
  subscribeMapChange: (fn: (map: CompositeIndexMap) => void) => () => void;
}

const CompositeListContext = createContext<CompositeListContextValue>({
  register: () => {},
  unregister: () => {},
  subscribeMapChange: () => () => {},
});

interface CompositeListItemEntry {
  index: number;
  element: HTMLElement;
  registration: CompositeListRegistration;
}

interface CompositeListProps {
  children?: JSX.Element;
  /** The items' elements by index: list navigation's `listRef`. */
  elementsRef: { current: Array<HTMLElement | null> };
  /** The items' labels by index: typeahead's `listRef`. */
  labelsRef?: { current: Array<string | null> } | undefined;
  onMapChange?: ((map: CompositeIndexMap) => void) | undefined;
}

function sortByDocumentPosition(a: Element, b: Element) {
  // Adjacent siblings first: compareDocumentPosition scans siblings, quadratic over a long flat list.
  if (a.nextElementSibling === b) {
    return -1;
  }
  if (b.nextElementSibling === a) {
    return 1;
  }
  return a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1;
}

function getCommonAncestor(firstNode: Element, lastNode: Element) {
  let ancestor = firstNode.parentElement;
  while (ancestor && !ancestor.contains(lastNode)) {
    ancestor = ancestor.parentElement;
  }
  return ancestor;
}

function hasMovedNode(entries: MutationRecord[]) {
  for (const entry of entries) {
    for (const node of Array.from(entry.removedNodes)) {
      if (node.isConnected) {
        return true;
      }
    }
  }
  return false;
}

/** The connected items in document order, each with its index there. */
function getSnapshot(map: Map<Element, CompositeListRegistration>) {
  const items: CompositeListItemEntry[] = [];
  map.forEach((registration, node) => {
    if (node.isConnected) {
      items.push({ index: -1, element: node as HTMLElement, registration });
    }
  });
  items.sort((a, b) => sortByDocumentPosition(a.element, b.element));
  items.forEach((item, index) => {
    item.index = index;
  });
  return items;
}

export function CompositeList(props: CompositeListProps): JSX.Element {
  const map = new Map<Element, CompositeListRegistration>();
  const listeners = new Set<(map: CompositeIndexMap) => void>();
  let scheduled = false;
  let disposed = false;
  let previousItems: readonly CompositeListItemEntry[] | null = null;
  let mutationObserver: MutationObserver | null = null;

  const syncRefs = (items: readonly CompositeListItemEntry[]) => {
    const nextMap: CompositeIndexMap = new Map();
    props.elementsRef.current.length = 0;
    if (props.labelsRef) {
      props.labelsRef.current.length = 0;
    }
    for (const item of items) {
      nextMap.set(item.element, item.index);
      props.elementsRef.current[item.index] = item.element;
      if (props.labelsRef) {
        props.labelsRef.current[item.index] =
          item.registration.label !== undefined
            ? item.registration.label
            : item.element.textContent;
      }
    }
    return nextMap;
  };

  const observe = (sortedNodes: HTMLElement[]) => {
    mutationObserver?.disconnect();
    mutationObserver = null;
    if (typeof MutationObserver !== 'function' || sortedNodes.length < 2) {
      return;
    }
    const observer = new MutationObserver((entries) => {
      // Only a move (a node removed and re-added in one batch) can reorder the rest.
      if (!hasMovedNode(entries)) {
        return;
      }
      let previous: Element | null = null;
      for (const node of sortedNodes) {
        if (!node.isConnected) {
          continue;
        }
        if (previous && sortByDocumentPosition(previous, node) > 0) {
          observer.disconnect();
          schedule();
          return;
        }
        previous = node;
      }
    });
    mutationObserver = observer;
    // A reorder inverts at least one adjacent pair; watching each pair's common parent sees it.
    const roots = new Set<Element>();
    sortedNodes.forEach((node, i) => {
      const previous = sortedNodes[i - 1];
      const root = previous ? getCommonAncestor(previous, node) : null;
      if (root) {
        roots.add(root);
      }
    });
    roots.forEach((root) => observer.observe(root, { childList: true }));
  };

  const flush = () => {
    scheduled = false;
    if (disposed) {
      return;
    }
    const items = getSnapshot(map);
    const nextMap = syncRefs(items);
    const prev = previousItems;
    const changed =
      !prev ||
      prev.length !== items.length ||
      items.some((item, index) => {
        const p = prev[index];
        return !p || item.index !== p.index || item.element !== p.element;
      });
    observe(items.map((item) => item.element));
    previousItems = items;
    if (!changed) {
      return;
    }
    listeners.forEach((listener) => listener(nextMap));
    props.onMapChange?.(nextMap);
  };

  function schedule() {
    if (scheduled) {
      return;
    }
    scheduled = true;
    queueMicrotask(flush);
  }

  onCleanup(() => {
    disposed = true;
    mutationObserver?.disconnect();
    props.elementsRef.current = [];
    if (props.labelsRef) {
      props.labelsRef.current = [];
    }
  });

  const value: CompositeListContextValue = {
    register(node, registration) {
      map.set(node, registration);
      schedule();
    },
    unregister(node) {
      map.delete(node);
      schedule();
    },
    subscribeMapChange(fn) {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
  };

  return <CompositeListContext value={value}>{props.children}</CompositeListContext>;
}

interface UseCompositeListItemParameters {
  /** The typeahead label; the element's text when not given. */
  label?: string | null | undefined;
}

interface UseCompositeListItemReturnValue {
  /** Pass to the item element's `ref`. */
  ref: (node: HTMLElement | null) => void;
  index: Accessor<number>;
}

/** Registers an item in the enclosing `CompositeList`; its index follows its document position. */
export function useCompositeListItem(
  params: UseCompositeListItemParameters = {},
): UseCompositeListItemReturnValue {
  const { register, unregister, subscribeMapChange } = useContext(CompositeListContext);
  const [internalIndex, setInternalIndex] = createSignal(-1, { ownedWrite: true });
  let node: Element | null = null;

  const unsubscribe = subscribeMapChange((map) => {
    const i = node ? map.get(node) : null;
    if (i != null) {
      setInternalIndex(i);
    }
  });

  onCleanup(() => {
    unsubscribe();
    if (node) {
      unregister(node);
      node = null;
    }
  });

  return {
    ref(element) {
      if (node) {
        unregister(node);
      }
      node = element;
      if (element) {
        register(element, {
          get label() {
            return params.label;
          },
        });
      }
    },
    index: internalIndex,
  };
}
