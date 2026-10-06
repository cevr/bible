// Upstream: packages/react/src/floating-ui-react/utils/composite.test.ts,
// packages/react/src/floating-ui-react/utils/nodes.test.ts
//
// The floating layer's pure parts, without a DOM: list index stepping and the
// floating tree's node queries. Whether an item counts as disabled reads the
// DOM, so the browser tests cover it (menu.test.ts reaches aria-disabled
// items; toggle.test.ts skips a disabled toggle).
import { describe, expect, it } from 'bun:test';

import { FloatingTreeStore } from './FloatingTreeStore.ts';
import { getNodeAncestors, getNodeChildren } from './utils/nodes.ts';
import { getNextListIndex } from './utils/composite.ts';

const list = (n: number): Array<HTMLElement | null> => Array.from({ length: n }, () => null);

describe('composite list indexes', () => {
  it('stops at the ends without loopFocus', () => {
    const options = { loopFocus: false, minIndex: 0, maxIndex: 3 };
    expect(getNextListIndex(list(4), 3, { ...options, decrement: false })).toEqual({
      index: 3,
      wrapped: false,
    });
    expect(getNextListIndex(list(4), 0, { ...options, decrement: true })).toEqual({
      index: 0,
      wrapped: false,
    });
  });

  it('wraps with loopFocus', () => {
    const options = { loopFocus: true, minIndex: 0, maxIndex: 3 };
    expect(getNextListIndex(list(4), 3, { ...options, decrement: false })).toEqual({
      index: 0,
      wrapped: true,
    });
    expect(getNextListIndex(list(4), 0, { ...options, decrement: true })).toEqual({
      index: 3,
      wrapped: true,
    });
  });
});

describe('floating tree', () => {
  it('lists open children (or all with onlyOpenChildren false) and ancestors', () => {
    const open = (value: boolean) => ({
      open: value,
      nodeId: undefined,
      placement: null,
      elements: { floating: null, domReference: null },
      dataRef: { current: {} },
    });
    const tree = new FloatingTreeStore();
    tree.addNode({ id: 'root', parentId: null, context: open(true) });
    tree.addNode({ id: 'a', parentId: 'root', context: open(true) });
    tree.addNode({ id: 'b', parentId: 'root', context: open(false) });
    tree.addNode({ id: 'a1', parentId: 'a', context: open(true) });
    const ids = (nodes: Array<{ id: string | undefined }>) => nodes.map((node) => node.id);
    expect(ids(getNodeChildren(tree.nodesRef.current, 'root'))).toEqual(['a', 'a1']);
    expect(ids(getNodeChildren(tree.nodesRef.current, 'root', false))).toEqual(['a', 'a1', 'b']);
    expect(ids(getNodeAncestors(tree.nodesRef.current, 'a1'))).toEqual(['a', 'root']);
  });
});
