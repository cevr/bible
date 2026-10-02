// Animation frames: the player's play loop, the review's synced loop and the
// lab's paints (the compare layer's, the onion's) all run on `Frames`. Each
// is built on one primitive, a callback asked for on the next frame (`Ask`):
// live it is the browser's `requestAnimationFrame` (`frames-browser.ts`), so a
// step or a paint runs inside the frame's own callback, and a whole loop is
// one wait of its fiber, not one per frame; in a test it is 16 ms of the
// `Clock` the layer is built with (`Frames.layerClock`), so `TestClock.adjust`
// moves the frames on.

import { Clock, Context, Effect, Layer, Option } from 'effect';
import type { Scope } from 'effect';

interface FramesOps {
  /** One animation frame: done when it comes, with its time in ms. */
  readonly next: Effect.Effect<number>;
  /**
   * Run `step` on each frame, with the frame's time, until it answers false;
   * interrupted, no further frame is asked for.
   */
  readonly loop: (step: (at: number) => boolean) => Effect.Effect<void>;
  /**
   * A paint run at most once a frame: the function returned asks for one on
   * the next frame, and asking again before it runs asks for nothing more. A
   * paint still asked for when the scope closes is not run.
   */
  readonly coalesce: (paint: () => void) => Effect.Effect<() => void, never, Scope.Scope>;
}

/** Ask for `run` on the next frame, with the frame's time: the answer takes the ask back. */
export type Ask = (run: (at: number) => void) => () => void;

/** The frames `ask` gives. */
const framesOver = (ask: Ask): FramesOps => ({
  next: Effect.callback<number>((resume) => {
    const cancel = ask((at) => resume(Effect.succeed(at)));
    return Effect.sync(cancel);
  }),
  loop: (step) =>
    Effect.callback<void>((resume) => {
      // Interrupted during a step (the step stopped its own loop), no next frame is asked for.
      let stopped = false;
      let cancel = ask(function frame(at) {
        const more = step(at);
        if (stopped) return;
        if (more) cancel = ask(frame);
        else resume(Effect.void);
      });
      return Effect.sync(() => {
        stopped = true;
        cancel();
      });
    }),
  coalesce: (paint) =>
    Effect.gen(function* () {
      let asked = Option.none<() => void>();
      yield* Effect.addFinalizer(() => Effect.sync(() => Option.map(asked, (cancel) => cancel())));
      return () => {
        if (Option.isSome(asked)) return;
        asked = Option.some(
          ask(() => {
            asked = Option.none();
            paint();
          }),
        );
      };
    }),
});

/** How long a frame is on a test's clock, in ms. */
const FRAME_MS = 16;

export class Frames extends Context.Service<Frames, FramesOps>()('@bible/film/browser/Frames') {
  /** The frames `ask` gives (the live adapter's: the browser's animation frames). */
  static readonly layerOver = (ask: Ask): Layer.Layer<Frames> =>
    Layer.succeed(Frames, framesOver(ask));
  /**
   * A frame every 16 ms of the `Clock` the layer is built with: a test moves
   * them on with `TestClock.adjust`.
   */
  static readonly layerClock: Layer.Layer<Frames> = Layer.effect(
    Frames,
    Effect.map(Effect.context<never>(), (context) =>
      framesOver((run) =>
        Effect.runCallbackWith(context)(
          Effect.flatMap(Effect.andThen(Effect.sleep(FRAME_MS), Clock.currentTimeMillis), (at) =>
            Effect.sync(() => run(at)),
          ),
        ),
      ),
    ),
  );
}
