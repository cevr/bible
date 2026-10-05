// Upstream: packages/react/src/floating-ui-react/components/FloatingTree.tsx
//
// Nested popups form a tree, so a press inside a child popup is not
// "outside" its parent and Escape closes only the innermost one. Each popup
// registers a node with its parent's id; the tree also carries events
// between them (a menu item's press reaches its menu as `close`). Each menu
// starts its own tree; no part here nests a popup in a menu.
import type { JSX } from '@solidjs/web';
import { createContext, createUniqueId, onCleanup, untrack, useContext } from 'solid-js';

import type { FloatingContext } from './FloatingRootContext.ts';
import { type FloatingNodeType, FloatingTreeStore } from './FloatingTreeStore.ts';

export { type FloatingNodeType, FloatingTreeStore } from './FloatingTreeStore.ts';
export { getNodeAncestors, getNodeChildren } from './utils/nodes.ts';

const FloatingNodeContext = createContext<{ id: string | undefined } | null>(null);
const FloatingTreeContext = createContext<FloatingTreeStore | null>(null);

/** The id of the nearest enclosing popup's node, if any. */
export function useFloatingParentNodeId(): string | null {
  return useContext(FloatingNodeContext)?.id || null;
}

export function useFloatingTree(externalTree?: FloatingTreeStore): FloatingTreeStore | null {
  const contextTree = useContext(FloatingTreeContext);
  return externalTree ?? contextTree;
}

/** Registers a node for the current popup in the enclosing tree and returns its id. */
export function useFloatingNodeId(externalTree?: FloatingTreeStore): string {
  const id = createUniqueId();
  const tree = useFloatingTree(externalTree);
  const parentId = useFloatingParentNodeId();
  const node: FloatingNodeType = { id, parentId };
  tree?.addNode(node);
  onCleanup(() => tree?.removeNode(node));
  return id;
}

/** Sets the node's live context, so the tree sees its open state and elements. */
export function setFloatingNodeContext(
  tree: FloatingTreeStore | null,
  nodeId: string | undefined,
  context: FloatingContext,
) {
  const node = tree?.nodesRef.current.find((n) => n.id === nodeId);
  if (node) {
    node.context = context;
  }
}

export function FloatingNode(props: { id: string | undefined; children?: JSX.Element }) {
  const value = {
    get id() {
      return props.id;
    },
  };
  return <FloatingNodeContext value={value}>{props.children}</FloatingNodeContext>;
}

export function FloatingTree(props: {
  externalTree?: FloatingTreeStore | undefined;
  children?: JSX.Element;
}) {
  // The tree is created once per root; a later `externalTree` is not swapped in.
  const tree = untrack(() => props.externalTree) ?? new FloatingTreeStore();
  return <FloatingTreeContext value={tree}>{props.children}</FloatingTreeContext>;
}
