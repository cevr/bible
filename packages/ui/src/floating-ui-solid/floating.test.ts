// Upstream: packages/react/src/floating-ui-react/utils/composite.test.ts,
// packages/react/src/floating-ui-react/utils/nodes.test.ts
//
// The floating layer's pure parts, without a DOM: list index stepping over
// disabled items and the floating tree's node queries. Upstream's DOM cases
// (visibility styles, shadow roots) run in the browser tests instead.
import { describe, expect, it } from 'bun:test';

import { FloatingTreeStore } from './FloatingTreeStore.ts';
import { getNodeAncestors, getNodeChildren } from './utils/nodes.ts';
import {
  findNonDisabledListIndex,
  getMaxListIndex,
  getMinListIndex,
  getNextListIndex,
  isListIndexDisabled,
} from './utils/composite.ts';

const list = (n: number): Array<HTMLElement | null> => Array.from({ length: n }, () => null);

describe('composite list indexes', () => {
  it('finds the first and last enabled index', () => {
    expect(getMinListIndex(list(4), [0])).toBe(1);
    expect(getMaxListIndex(list(4), [3, 2])).toBe(1);
    expect(getMinListIndex(list(3), (index) => index < 2)).toBe(2);
  });

  it('steps past disabled items and stops at the ends without loopFocus', () => {
    const options = { loopFocus: false, allowEscape: false, minIndex: 0, maxIndex: 3 };
    expect(
      getNextListIndex(list(4), 0, { ...options, decrement: false, disabledIndices: [1] }),
    ).toEqual({ index: 2, wrapped: false });
    expect(getNextListIndex(list(4), 3, { ...options, decrement: false })).toEqual({
      index: 3,
      wrapped: false,
    });
    expect(getNextListIndex(list(4), 0, { ...options, decrement: true })).toEqual({
      index: 0,
      wrapped: false,
    });
  });

  it('wraps with loopFocus, or escapes to -1 with allowEscape', () => {
    const options = { loopFocus: true, minIndex: 0, maxIndex: 3 };
    expect(
      getNextListIndex(list(4), 3, { ...options, allowEscape: false, decrement: false }),
    ).toEqual({ index: 0, wrapped: true });
    expect(
      getNextListIndex(list(4), 0, { ...options, allowEscape: false, decrement: true }),
    ).toEqual({ index: 3, wrapped: true });
    expect(
      getNextListIndex(list(4), 3, { ...options, allowEscape: true, decrement: false }),
    ).toEqual({ index: -1, wrapped: false });
  });

  it('reads disabled indices as a list or a predicate', () => {
    expect(isListIndexDisabled(list(3), 1, [1])).toBe(true);
    expect(isListIndexDisabled(list(3), 1, (index) => index === 1)).toBe(true);
    expect(isListIndexDisabled(list(3), 2, [1])).toBe(false);
    expect(findNonDisabledListIndex(list(5), { startingIndex: 0, amount: 2 })).toBe(2);
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
