// Upstream: packages/react/src/internals/composite/root/CompositeRoot.test.tsx (the key cases)
//
// The pure step of a composite's roving tab stop: which index a key moves to.
// Items here are placeholders (null elements); skipping a disabled item reads
// the DOM, so the browser tests cover it (toggle.test.ts, "skips a disabled
// toggle with the arrows").
import { describe, expect, it } from 'bun:test';

import {
  type CompositeNavigationParameters,
  getCompositeNavigationIndex,
  getNavigationKeys,
  hasModifierKey,
} from './composite.ts';

const items = (n: number) => Array.from({ length: n }, () => null);

const step = (overrides: Partial<CompositeNavigationParameters>) =>
  getCompositeNavigationIndex({
    key: 'ArrowRight',
    highlightedIndex: 0,
    elements: items(4),
    orientation: 'horizontal',
    direction: 'ltr',
    loopFocus: true,
    enableHomeAndEndKeys: false,
    ...overrides,
  });

describe('getCompositeNavigationIndex', () => {
  it('moves along a horizontal composite with the left and right arrows', () => {
    expect(step({ key: 'ArrowRight' })).toEqual({ index: 1, handled: true });
    expect(step({ key: 'ArrowLeft', highlightedIndex: 2 })).toEqual({ index: 1, handled: true });
  });

  it('ignores the cross-axis arrows', () => {
    expect(step({ key: 'ArrowDown' }).handled).toBe(false);
    expect(step({ key: 'ArrowUp' }).handled).toBe(false);
  });

  it('moves along a vertical composite with the up and down arrows only', () => {
    expect(step({ orientation: 'vertical', key: 'ArrowDown' }).index).toBe(1);
    expect(step({ orientation: 'vertical', key: 'ArrowUp', highlightedIndex: 2 }).index).toBe(1);
    expect(step({ orientation: 'vertical', key: 'ArrowRight' }).handled).toBe(false);
  });

  it('takes both axes when the orientation is both', () => {
    expect(step({ orientation: 'both', key: 'ArrowDown' }).index).toBe(1);
    expect(step({ orientation: 'both', key: 'ArrowRight' }).index).toBe(1);
  });

  it('swaps the horizontal arrows in right-to-left', () => {
    expect(step({ direction: 'rtl', key: 'ArrowLeft' }).index).toBe(1);
    expect(step({ direction: 'rtl', key: 'ArrowRight', highlightedIndex: 2 }).index).toBe(1);
    expect(getNavigationKeys('horizontal', 'rtl')).toMatchObject({
      forward: 'ArrowLeft',
      backward: 'ArrowRight',
    });
  });

  it('wraps at the ends when looping, and stops there when not', () => {
    expect(step({ key: 'ArrowRight', highlightedIndex: 3 }).index).toBe(0);
    expect(step({ key: 'ArrowLeft', highlightedIndex: 0 }).index).toBe(3);
    expect(step({ key: 'ArrowRight', highlightedIndex: 3, loopFocus: false }).index).toBe(4);
    expect(step({ key: 'ArrowLeft', highlightedIndex: 0, loopFocus: false }).index).toBe(-1);
  });

  it('moves to the first and last items on Home and End only when enabled', () => {
    expect(step({ key: 'End' }).handled).toBe(false);
    expect(step({ key: 'End', enableHomeAndEndKeys: true })).toEqual({ index: 3, handled: true });
    expect(step({ key: 'Home', highlightedIndex: 3, enableHomeAndEndKeys: true }).index).toBe(0);
  });

  it('ignores keys a composite does not use', () => {
    expect(step({ key: 'a' })).toEqual({ index: 0, handled: false });
    expect(step({ key: 'PageDown' }).handled).toBe(false);
  });
});

describe('hasModifierKey', () => {
  const event = (held: ReadonlyArray<string>) => ({
    getModifierState: (key: string) => held.includes(key),
  });

  it('is true while any modifier is held', () => {
    expect(hasModifierKey(event([]))).toBe(false);
    expect(hasModifierKey(event(['Shift']))).toBe(true);
    expect(hasModifierKey(event(['Meta']))).toBe(true);
  });
});
