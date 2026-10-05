// A press followed to its end: every drag on the pages (the player's track,
// the strip's scrub and its cue bars, a knob's handle, the wipe's divider, a
// note's mark) goes through `Pointer`. The press itself is the element's
// own `pointerdown`; from it the drag captures the pointer on that element,
// hears its moves, and ends once: lifted (`pointerup`), or taken by the
// browser (`pointercancel`, as a phone's page pan sends) or let go
// (`lostpointercapture`), so a drag the browser ends never keeps scrubbing.
// The page it listens on is the adapter's (`pointerOn`): the window live
// (`pointer-browser.ts`), a test's own `EventTarget` in a test. It is the one
// place a press is captured and its end heard (`film/host-events-through-adapter`).
//
// One press per surface (`press`): a surface (the strip, a note surface, the
// editor's grips, a wipe's divider) follows one press at a time. A press on
// it while it holds one (a second finger) is not the surface's: its work
// never runs, and the first press goes on to its own end.
//
// One owner per press (`claimPress`, @bible/ui): a finger's press may be a
// long press (a context menu's) until it moves past `LONG_PRESS_MOVE_THRESHOLD`,
// the number the long press gives way at. Only then does the drag claim the
// press and start, and a long press can no longer open; a press the long
// press claimed first (its menu is open) never starts a drag, and its lift
// ends this one as the browser ends one (`end(none)`): ownership governs
// the completion as it does the moves, so nothing acts on that release. A
// press no one claimed (a plain tap) is lifted as before. A mouse's drag
// starts at its first move: a mouse has no long press.

import { LONG_PRESS_MOVE_THRESHOLD, claimPress, liftHeldByOther } from '@bible/ui/press';
import { Context, Effect, Layer, Option, Result } from 'effect';

/** What a drag tells its owner. */
interface DragSteps {
  /** Each move of the pressed pointer. */
  readonly move: (event: PointerEvent) => void;
  /** The press is over, once: lifted (its `pointerup`), or none when the browser ended it. */
  readonly end: (lifted: Option.Option<PointerEvent>) => void;
}

/**
 * What follows one press at a time (`Pointer.press`): a view makes one for
 * each part of the page a press drags on, named as the page names it.
 */
export class Surface {
  readonly name: string;
  constructor(name: string) {
    this.name = name;
  }
}

interface PointerOps {
  /**
   * Follow the press `down` began until it ends: its moves and its end go to
   * `steps`, and the effect is done then. Interrupted, it stops listening
   * and tells nothing more. Call it in the press's own handler, so nothing
   * of the press is missed.
   */
  readonly drag: (down: PointerEvent, steps: DragSteps) => Effect.Effect<void>;
  /**
   * The press `down` on `surface`, taken only while it holds no press:
   * `take` is the press's own work, run at once, and answers the
   * drag to follow (`drag`), which the surface holds until it ends or is
   * interrupted; none, a press with nothing to follow, holds nothing. A
   * press while the surface holds one is not the surface's: `take` never
   * runs. Call it in the press's own handler, as `drag`.
   */
  readonly press: (
    down: PointerEvent,
    surface: Surface,
    take: () => Option.Option<DragSteps>,
  ) => Effect.Effect<void>;
}

export class Pointer extends Context.Service<Pointer, PointerOps>()('@bible/film/browser/Pointer') {
  /** Drags heard on `page`: the window live, a test's `EventTarget` in a test. */
  static readonly layerOn = (page: EventTarget): Layer.Layer<Pointer> =>
    Layer.succeed(Pointer, pointerOn(page));
}

/** Whether `target` can hold a pointer's capture. */
const captures = (target: EventTarget): target is Element => 'setPointerCapture' in target;

/** The drags of the presses on `page`. */
const pointerOn = (page: EventTarget): PointerOps => {
  /** The surfaces following a press now. */
  const holding = new WeakSet<Surface>();
  const drag: PointerOps['drag'] = (down, steps) =>
    Effect.callback<void>((resume) => {
      const id = down.pointerId;
      const held = Option.filter(Option.fromNullishOr(down.currentTarget), captures);
      // A pointer the browser no longer has (lifted already) cannot be captured: the drag still listens.
      Option.map(held, (el) =>
        // oxlint-disable-next-line film/host-events-through-adapter -- Pointer's own: the press it follows
        Result.try(() => el.setPointerCapture(id)),
      );
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
      // A lift completes the drag only when no one else held the press (an open menu's is
      // the menu's): then it ends as one the browser took, and nothing is made of it.
      // oxlint-disable-next-line film/host-events-through-adapter -- Pointer's own: the press's lift
      page.addEventListener(
        'pointerup',
        its((e) => ended(Option.filter(Option.some(e), () => !liftHeldByOther(id, self)))),
        options,
      );
      // oxlint-disable-next-line film/host-events-through-adapter -- Pointer's own: the browser took the press
      page.addEventListener(
        'pointercancel',
        its(() => ended(Option.none())),
        options,
      );
      // oxlint-disable-next-line film/host-events-through-adapter -- Pointer's own: the capture let go
      page.addEventListener(
        'lostpointercapture',
        its(() => ended(Option.none())),
        options,
      );
      return Effect.sync(() => listening.abort());
    });
  return {
    drag,
    press: (down, surface, take) =>
      Effect.suspend(() => {
        if (holding.has(surface)) return Effect.void;
        return Option.match(take(), {
          onNone: () => Effect.void,
          onSome: (steps) => {
            holding.add(surface);
            return Effect.ensuring(
              drag(down, steps),
              Effect.sync(() => holding.delete(surface)),
            );
          },
        });
      }),
  };
};
