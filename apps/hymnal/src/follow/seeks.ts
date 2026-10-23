/**
 * The seeks the player asks of its playback, counted, so the follow hears a
 * seek of any size (it ends a hand pause, `follower.ts`), not only one that
 * moves the place further than the follow clock's slack. The player asks its
 * playback for a seek only when the reader seeks (the full player's scrubber,
 * the lock screen), and again while the device has not landed one.
 */

import { Effect, Layer, SubscriptionRef } from 'effect';
import * as Atom from 'effect/reactivity/Atom';

import { Playback } from '~/player/player';

/** The app's count of seeks, from 0 at launch. */
export const seeks = Effect.runSync(SubscriptionRef.make(0));

/** The count as an atom, for the page's follow. */
export const seekCount = Atom.subscriptionRef(seeks);

/** `playback`, with each seek asked of it counted in `count` before the seek is asked. */
export const counted = (
  playback: Layer.Layer<Playback>,
  count: SubscriptionRef.SubscriptionRef<number> = seeks,
): Layer.Layer<Playback> =>
  Layer.effect(Playback)(
    Effect.gen(function* () {
      const api = yield* Playback;
      return Playback.of({
        ...api,
        seek: (ms) =>
          Effect.andThen(
            SubscriptionRef.update(count, (n) => n + 1),
            api.seek(ms),
          ),
      });
    }),
  ).pipe(Layer.provide(playback));
