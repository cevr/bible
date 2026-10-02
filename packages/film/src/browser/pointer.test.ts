// A drag follows its press: it captures the pointer on the pressed element,
// hears that pointer's moves (not another finger's), and ends once, lifted
// or ended by the browser (a cancel, a lost capture); after its end, and once
// interrupted, it hears nothing more.

import { describe, expect, test } from 'bun:test';
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

/** A pointer event of `type`, for pointer `id` at `x`. */
const pointer = (type: string, id: number, x = 0) =>
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- Bun has no PointerEvent; the drag reads only these fields
  Object.assign(new Event(type, { bubbles: true }), { pointerId: id, clientX: x }) as PointerEvent;

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
    element,
    moves,
    ends,
    press: (id: number) => element.dispatchEvent(pointer('pointerdown', id)),
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
});
