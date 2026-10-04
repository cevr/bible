// A drag follows its press: it captures the pointer on the pressed element,
// hears that pointer's moves (not another finger's), and ends once, lifted
// or ended by the browser (a cancel, a lost capture); after its end, and once
// interrupted, it hears nothing more. A finger's press another holds (an open
// menu's long press) tells neither its moves nor its lift; a plain tap lifts.

import { describe, expect, test } from 'bun:test';
import { claimPress } from '@bible/ui/press';
import { Effect, Fiber, Option } from 'effect';
import { hostOf } from './host.ts';
import { Pointer } from './pointer.ts';

/** An element that can hold a pointer's capture: the ids it was asked to capture. */
class Pressable extends EventTarget {
  readonly captured: Array<number> = [];
  setPointerCapture(id: number) {
    this.captured.push(id);
  }
}

/** A pointer event of `type`, for pointer `id` at `x`, of a mouse unless said. */
const pointer = (type: string, id: number, x = 0, pointerType = 'mouse') =>
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- Bun has no PointerEvent; the drag reads only these fields
  Object.assign(new Event(type, { bubbles: true }), {
    pointerId: id,
    clientX: x,
    clientY: 0,
    pointerType,
  }) as PointerEvent;

/**
 * A page with one pressable element: pressing it begins a drag, as a page's
 * own `pointerdown` handler does; the moves and the end the drag told.
 */
const page = () => {
  const window = new EventTarget();
  const element = new Pressable();
  const host = hostOf(Pointer.layerOn(window));
  const moves: Array<number> = [];
  const ends: Array<Option.Option<number>> = [];
  let drag = Option.none<Fiber.Fiber<void>>();
  element.addEventListener('pointerdown', (e) => {
    // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- dispatched by `press` below
    const down = e as PointerEvent;
    drag = Option.some(
      Effect.runForkWith(host)(
        Pointer.use((p) =>
          p.drag(down, {
            move: (ev) => moves.push(ev.clientX),
            end: (lifted) => ends.push(Option.map(lifted, (ev) => ev.clientX)),
          }),
        ),
      ),
    );
  });
  return {
    window,
    element,
    moves,
    ends,
    press: (id: number) => element.dispatchEvent(pointer('pointerdown', id)),
    /** A finger presses the element, at x 0. */
    touch: (id: number) => element.dispatchEvent(pointer('pointerdown', id, 0, 'touch')),
    /** The browser sends `type` for pointer `id` at `x`: to the window, where a drag hears it. */
    send: (type: string, id: number, x = 0) => window.dispatchEvent(pointer(type, id, x)),
    done: () =>
      Option.match(drag, {
        onNone: () => false,
        onSome: (f) => Option.isSome(Option.fromNullishOr(f.pollUnsafe())),
      }),
    interrupt: () => Option.map(drag, (f) => Effect.runFork(Fiber.interrupt(f))),
  };
};

describe('Pointer.drag', () => {
  test("captures the pointer, hears its moves (not another's), and ends once, lifted", () => {
    const p = page();
    p.press(7);
    expect(p.element.captured).toEqual([7]);
    p.send('pointermove', 7, 10);
    p.send('pointermove', 8, 99);
    p.send('pointermove', 7, 20);
    expect(p.done()).toBe(false);
    p.send('pointerup', 7, 25);
    p.send('pointermove', 7, 30);
    p.send('pointerup', 7, 35);
    expect(p.moves).toEqual([10, 20]);
    expect(p.ends).toEqual([Option.some(25)]);
    expect(p.done()).toBe(true);
  });

  for (const ended of ['pointercancel', 'lostpointercapture'])
    test(`ends once on ${ended}, not lifted, and hears nothing after`, () => {
      const p = page();
      p.press(3);
      p.send('pointermove', 3, 10);
      p.send(ended, 4);
      expect(p.ends).toEqual([]);
      p.send(ended, 3);
      p.send('pointermove', 3, 50);
      p.send('pointerup', 3, 50);
      expect(p.moves).toEqual([10]);
      expect(p.ends).toEqual([Option.none()]);
      expect(p.done()).toBe(true);
    });

  test('interrupted, it hears nothing more and tells no end', () => {
    const p = page();
    p.press(1);
    p.interrupt();
    p.send('pointermove', 1, 10);
    p.send('pointerup', 1, 10);
    expect(p.moves).toEqual([]);
    expect(p.ends).toEqual([]);
  });

  test("a finger's press the long press holds (its menu open) tells neither its moves nor its lift", () => {
    const p = page();
    p.touch(21);
    // The long press's delay ends: it claims the press and its menu opens.
    expect(claimPress(21, Symbol('menu'), p.window)).toBe(true);
    // The finger slides 30 px and lifts, over the menu.
    p.send('pointermove', 21, 30);
    p.send('pointerup', 21, 30);
    expect(p.moves).toEqual([]);
    expect(p.ends).toEqual([Option.none()]);
    expect(p.done()).toBe(true);
  });

  test("a finger's plain tap is lifted, and its drag past the threshold is told whole", () => {
    const tap = page();
    tap.touch(22);
    tap.send('pointermove', 22, 4);
    tap.send('pointerup', 22, 4);
    expect([tap.moves, tap.ends]).toEqual([[], [Option.some(4)]]);
    const drag = page();
    drag.touch(23);
    drag.send('pointermove', 23, 30);
    drag.send('pointerup', 23, 40);
    expect([drag.moves, drag.ends]).toEqual([[30], [Option.some(40)]]);
  });
});
