// Not in upstream: one owner per press (`press.ts`). The gestures that claim
// a press (a long press, the film lab's drag) are covered in the film lab's
// browser tests (e2e/lab/command/command.dom.test.ts).
import { describe, expect, it } from 'bun:test';

import { claimPress, pressHeldByOther } from './press.ts';

/** A pointer event with only the id the registry reads. */
const lift = (type: 'pointerup' | 'pointercancel', pointerId: number) =>
  Object.assign(new Event(type), { pointerId });

describe('claimPress', () => {
  it('gives a press to its first claim, and refuses every other until the pointer lifts', () => {
    const page = new EventTarget();
    const menu = Symbol('menu');
    const drag = Symbol('drag');
    expect(claimPress(7, menu, page)).toBe(true);
    expect(claimPress(7, menu, page)).toBe(true);
    expect(claimPress(7, drag, page)).toBe(false);
    expect(pressHeldByOther(7, drag)).toBe(true);
    expect(pressHeldByOther(7, menu)).toBe(false);
    page.dispatchEvent(lift('pointerup', 7));
    expect(pressHeldByOther(7, menu)).toBe(false);
    expect(claimPress(7, drag, page)).toBe(true);
    page.dispatchEvent(lift('pointercancel', 7));
    expect(claimPress(7, menu, page)).toBe(true);
    page.dispatchEvent(lift('pointerup', 7));
  });

  it('holds each pointer apart', () => {
    const page = new EventTarget();
    const one = Symbol('one');
    const two = Symbol('two');
    expect(claimPress(1, one, page)).toBe(true);
    expect(claimPress(2, two, page)).toBe(true);
    page.dispatchEvent(lift('pointerup', 1));
    expect(pressHeldByOther(2, one)).toBe(true);
    page.dispatchEvent(lift('pointerup', 2));
    expect(pressHeldByOther(2, one)).toBe(false);
  });
});
