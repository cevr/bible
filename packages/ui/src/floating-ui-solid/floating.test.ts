// Upstream: packages/react/src/floating-ui-react/utils/composite.test.ts,
// packages/react/src/floating-ui-react/safePolygon.test.ts,
// packages/react/src/floating-ui-react/utils/nodes.test.ts
//
// The floating layer's pure parts, without a DOM: list index stepping over
// disabled items, the hover delays, the floating tree's node queries, and
// the safe polygon's geometry against stand-in elements. Upstream's DOM
// cases (visibility styles, shadow roots) run in the browser tests instead.
import { describe, expect, it } from 'bun:test';

import { FloatingTreeStore } from './FloatingTreeStore.ts';
import { getNodeAncestors, getNodeChildren } from './utils/nodes.ts';
import { getDelay, isClickLikeOpenEvent, isHoverOpenEvent } from './hooks/useHoverShared.ts';
import { safePolygon } from './safePolygon.ts';
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

describe('hover delays', () => {
  it('reads a number or an open/close pair, and skips the delay for touch', () => {
    expect(getDelay(100, 'open')).toBe(100);
    expect(getDelay({ open: 50, close: 200 }, 'close')).toBe(200);
    expect(getDelay(() => ({ open: 30 }), 'open', 'mouse')).toBe(30);
    expect(getDelay(100, 'open', 'touch')).toBe(0);
  });

  it('classifies the event that opened the popup', () => {
    expect(isHoverOpenEvent('mouseenter')).toBe(true);
    expect(isHoverOpenEvent('mousedown')).toBe(false);
    expect(isClickLikeOpenEvent('click', false)).toBe(true);
    expect(isClickLikeOpenEvent('mouseenter', true)).toBe(true);
    expect(isClickLikeOpenEvent('mouseenter', false)).toBe(false);
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

/** An element stand-in: a box, and `contains` by identity. */
function box(left: number, top: number, width: number, height: number): HTMLElement {
  const rect = {
    x: left,
    y: top,
    left,
    top,
    width,
    height,
    right: left + width,
    bottom: top + height,
  };
  const element = {
    getBoundingClientRect: () => rect,
    contains: (other: unknown) => other === element,
    getRootNode: () => null,
  };
  return element as unknown as HTMLElement;
}

function move(clientX: number, clientY: number, target: unknown = null): MouseEvent {
  return {
    type: 'mousemove',
    clientX,
    clientY,
    relatedTarget: null,
    composedPath: () => [target],
  } as unknown as MouseEvent;
}

describe('safePolygon', () => {
  // Trigger at 0..10 x 0..10, popup to its right at 20..120 x 0..100.
  const domReference = box(0, 0, 10, 10);
  const floating = box(20, 0, 100, 100);

  const setup = () => {
    let closed = 0;
    const handler = safePolygon()({
      x: 10,
      y: 5,
      placement: 'right',
      elements: { domReference, floating },
      onClose: () => {
        closed += 1;
      },
    });
    return { handler, closed: () => closed };
  };

  it('stays open while the pointer crosses the gap towards the popup', () => {
    const { handler, closed } = setup();
    handler(move(15, 5));
    expect(closed()).toBe(0);
  });

  it('closes when the pointer leaves away from the popup', () => {
    const { handler, closed } = setup();
    handler(move(-5, 5));
    expect(closed()).toBe(1);
  });

  it('closes once the pointer, having landed on the popup, leaves it elsewhere', () => {
    const { handler, closed } = setup();
    handler(move(50, 50, floating));
    expect(closed()).toBe(0);
    handler(move(200, 300));
    expect(closed()).toBe(1);
  });

  it('keeps a parent open while a child node is open', () => {
    const tree = new FloatingTreeStore();
    tree.addNode({ id: 'root', parentId: null });
    tree.addNode({
      id: 'child',
      parentId: 'root',
      context: {
        open: true,
        nodeId: 'child',
        placement: null,
        elements: { floating: null, domReference: null },
        dataRef: { current: {} },
      },
    });
    let closed = 0;
    const handler = safePolygon()({
      x: 10,
      y: 5,
      placement: 'right',
      elements: { domReference, floating },
      nodeId: 'root',
      tree,
      onClose: () => {
        closed += 1;
      },
    });
    handler(move(-5, 5));
    expect(closed).toBe(0);
  });

  it('carries blockPointerEvents for the hover interactions to read', () => {
    expect(safePolygon({ blockPointerEvents: true }).__options?.blockPointerEvents).toBe(true);
    expect(safePolygon().__options?.blockPointerEvents).toBe(false);
  });
});
