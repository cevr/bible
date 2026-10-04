// Not in upstream: one owner per press (`press.ts`). The gestures that claim
// a press (a long press, the film lab's drag) are covered in the film lab's
// browser tests (e2e/lab/command/command.dom.test.ts).
import { describe, expect, it } from 'bun:test';

import { claimPress, liftHeldByOther, pressHeldByOther } from './press.ts';

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

  it("tells a lift's handlers who held the press as it lifted, until the pointer presses again", () => {
    const page = new EventTarget();
    const menu = Symbol('menu');
    const drag = Symbol('drag');
    expect(claimPress(9, menu, page)).toBe(true);
    expect(liftHeldByOther(9, drag)).toBe(true);
    // The lift lets the press go (heard in the capture phase); its own handlers still ask.
    page.dispatchEvent(lift('pointerup', 9));
    expect(pressHeldByOther(9, drag)).toBe(false);
    expect([liftHeldByOther(9, drag), liftHeldByOther(9, menu)]).toEqual([true, false]);
    // The next press of that pointer, a plain tap no one claims: its lift is no one's.
    page.dispatchEvent(Object.assign(new Event('pointerdown'), { pointerId: 9 }));
    expect(liftHeldByOther(9, drag)).toBe(false);
    page.dispatchEvent(lift('pointerup', 9));
    expect(liftHeldByOther(9, drag)).toBe(false);
  });

  it('keeps who held a press through every page that hears its lift (the window, then the document)', () => {
    const window = new EventTarget();
    const document = new EventTarget();
    const menu = Symbol('menu');
    const drag = Symbol('drag');
    // A drag once claimed on the window (another pointer), so the window hears lifts too.
    expect(claimPress(30, drag, window)).toBe(true);
    window.dispatchEvent(lift('pointerup', 30));
    // The menu claims pointer 31 on the document; its lift reaches the window first.
    expect(claimPress(31, menu, document)).toBe(true);
    window.dispatchEvent(lift('pointerup', 31));
    document.dispatchEvent(lift('pointerup', 31));
    expect(liftHeldByOther(31, drag)).toBe(true);
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
