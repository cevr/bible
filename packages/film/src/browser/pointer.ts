// A press followed to its end: every drag on the pages (the player's track,
// the strip's scrub and its cue bars, a knob's handle, the wipe's divider, a
// note's mark) goes through `Pointer.drag`. The press itself is the element's
// own `pointerdown`; from it the drag captures the pointer on that element,
// hears its moves, and ends once: lifted (`pointerup`), or taken by the
// browser (`pointercancel`, as a phone's page pan sends) or let go
// (`lostpointercapture`), so a drag the browser ends never keeps scrubbing.
// The page it listens on is the adapter's (`pointerOn`): the window live
// (`pointer-browser.ts`), a test's own `EventTarget` in a test.
//
// One owner per press (`claimPress`, @bible/ui): a finger's press may be a
// long press (a context menu's) until it moves past `LONG_PRESS_MOVE_THRESHOLD`,
// the number the long press gives way at. Only then does the drag claim the
// press and start, and a long press can no longer open; a press the long
// press claimed first (its menu is open) never starts a drag, though its
// lift still ends this one. A mouse's drag starts at its first move: a mouse
// has no long press.

import { LONG_PRESS_MOVE_THRESHOLD, claimPress } from '@bible/ui/press';
import { Context, Effect, Layer, Option, Result } from 'effect';

/** What a drag tells its owner. */
interface DragSteps {
  /** Each move of the pressed pointer. */
  readonly move: (event: PointerEvent) => void;
  /** The press is over, once: lifted (its `pointerup`), or none when the browser ended it. */
  readonly end: (lifted: Option.Option<PointerEvent>) => void;
}

interface PointerOps {
  /**
   * Follow the press `down` began until it ends: its moves and its end go to
   * `steps`, and the effect is done then. Interrupted, it stops listening
   * and tells nothing more. Call it in the press's own handler, so nothing
   * of the press is missed.
   */
  readonly drag: (down: PointerEvent, steps: DragSteps) => Effect.Effect<void>;
}

export class Pointer extends Context.Service<Pointer, PointerOps>()('@bible/film/browser/Pointer') {
  /** Drags heard on `page`: the window live, a test's `EventTarget` in a test. */
  static readonly layerOn = (page: EventTarget): Layer.Layer<Pointer> =>
    Layer.succeed(Pointer, pointerOn(page));
}

/** Whether `target` can hold a pointer's capture. */
const captures = (target: EventTarget): target is Element => 'setPointerCapture' in target;

/** The drags of the presses on `page`. */
const pointerOn = (page: EventTarget): PointerOps => ({
  drag: (down, steps) =>
    Effect.callback<void>((resume) => {
      const id = down.pointerId;
      const held = Option.filter(Option.fromNullishOr(down.currentTarget), captures);
      // A pointer the browser no longer has (lifted already) cannot be captured: the drag still listens.
      Option.map(held, (el) => Result.try(() => el.setPointerCapture(id)));
      const listening = new AbortController();
      const options = { signal: listening.signal };
      /** Whether `e` is of this press's pointer. */
      const ours = (e: Event): e is PointerEvent => 'pointerId' in e && e.pointerId === id;
      /** `f`, for this press's pointer only. */
      const its = (f: (e: PointerEvent) => void) => (e: Event) => {
        if (ours(e)) f(e);
      };
      const ended = (lifted: Option.Option<PointerEvent>) => {
        listening.abort();
        steps.end(lifted);
        resume(Effect.void);
      };
      // A finger's drag starts once it has moved past the long press's threshold and holds the press.
      const self = Symbol('drag');
      let started = down.pointerType !== 'touch';
      const past = (e: PointerEvent) =>
        Math.abs(e.clientX - down.clientX) > LONG_PRESS_MOVE_THRESHOLD ||
        Math.abs(e.clientY - down.clientY) > LONG_PRESS_MOVE_THRESHOLD;
      page.addEventListener(
        'pointermove',
        its((e) => {
          started = started || (past(e) && claimPress(id, self, page));
          if (started) steps.move(e);
        }),
        options,
      );
      page.addEventListener(
        'pointerup',
        its((e) => ended(Option.some(e))),
        options,
      );
      page.addEventListener(
        'pointercancel',
        its(() => ended(Option.none())),
        options,
      );
      page.addEventListener(
        'lostpointercapture',
        its(() => ended(Option.none())),
        options,
      );
      return Effect.sync(() => listening.abort());
    }),
});
