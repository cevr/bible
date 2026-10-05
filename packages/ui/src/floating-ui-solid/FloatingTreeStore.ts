// Upstream: packages/react/src/floating-ui-react/components/FloatingTreeStore.ts
//
// The nodes of a tree of nested popups, each with its
// parent's id and live context, and an event bus between them.
import type { FloatingContext } from './FloatingRootContext.ts';
import { createEventEmitter, type FloatingEvents } from './utils/event.ts';

export interface FloatingNodeType {
  id: string | undefined;
  parentId: string | null;
  context?: FloatingContext | undefined;
}

export class FloatingTreeStore {
  readonly nodesRef: { current: FloatingNodeType[] } = { current: [] };

  readonly events: FloatingEvents = createEventEmitter();

  addNode(node: FloatingNodeType) {
    this.nodesRef.current.push(node);
  }

  removeNode(node: FloatingNodeType) {
    const index = this.nodesRef.current.indexOf(node);
    if (index !== -1) {
      this.nodesRef.current.splice(index, 1);
    }
  }
}
