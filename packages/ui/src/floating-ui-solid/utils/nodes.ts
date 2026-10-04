// Upstream: packages/react/src/floating-ui-react/utils/nodes.ts
//
// Queries over a floating tree's nodes.
import type { FloatingNodeType } from '../FloatingTreeStore.ts';

/** The open descendants of a node (all descendants with `onlyOpenChildren` false). */
export function getNodeChildren(
  nodes: Array<FloatingNodeType>,
  id: string | undefined,
  onlyOpenChildren = true,
): Array<FloatingNodeType> {
  const directChildren = nodes.filter((node) => node.parentId === id);
  return directChildren.flatMap((child) => [
    ...(!onlyOpenChildren || child.context?.open ? [child] : []),
    ...getNodeChildren(nodes, child.id, onlyOpenChildren),
  ]);
}

/** A node's ancestors, nearest first. */
export function getNodeAncestors(nodes: Array<FloatingNodeType>, id: string | undefined) {
  let allAncestors: Array<FloatingNodeType> = [];
  let currentParentId = nodes.find((node) => node.id === id)?.parentId;
  while (currentParentId) {
    const parentId: string = currentParentId;
    const currentNode = nodes.find((node) => node.id === parentId);
    currentParentId = currentNode?.parentId;
    if (currentNode) {
      allAncestors = allAncestors.concat(currentNode);
    }
  }
  return allAncestors;
}
