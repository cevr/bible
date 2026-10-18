// The page's player as the studio's tools reach it: the page loaded again at
// the frame it shows (`reloadHere`), through the page's reload gate, so a
// write the film's code does not import (a take's audio and timings, which
// the player fetches once) lands on the frame it left; and the frame at a
// time as PNG bytes (`playerStill`), once the film's faces are in.

import { Effect, Option, Schema } from 'effect';
import type { Player } from '../player/main.ts';
import { type Host, reloadAtAddress } from '../browser/host.ts';

/** No PNG of the frame: its footage would not decode, or the canvas gave none. */
class NoStill extends Schema.TaggedError<NoStill>()('NoStill', {
  T: Schema.Finite,
  why: Schema.String,
}) {
  override get message() {
    return `no still of ${this.T.toFixed(2)}s: ${this.why}`;
  }
}

/** Done once `player` draws frames: at once when its faces are in, else when the first frame lands. */
const drawable = (player: Player): Effect.Effect<void> =>
  Effect.callback<void>((resume) => {
    if (player.drawable()) return resume(Effect.void);
    const off = player.onDraw(() => {
      off();
      resume(Effect.void);
    });
    return Effect.sync(off);
  });

/**
 * The page loaded again at the frame `player` shows, on the page's `host`
 * (its address bar and its loads): the time held there, then the reload once
 * the address bar has it (`reloadAtAddress`). The reload gate runs it.
 */
export const reloadHere = (player: Player, host: Host): Effect.Effect<void> =>
  Effect.sync(() => player.holdT()).pipe(
    Effect.andThen(reloadAtAddress),
    Effect.provideContext(host),
  );

/** The frame at film second `T` as `player` paints it, as PNG bytes: once it is painted, a talk's after its footage decodes. */
export const playerStill = (player: Player, T: number): Effect.Effect<Uint8Array, NoStill> =>
  drawable(player).pipe(
    Effect.andThen(
      Effect.mapError(player.renderShown(player.ctx, T), (missing) =>
        NoStill.make({ T, why: missing.message }),
      ),
    ),
    Effect.flatMap(() =>
      Effect.callback<Blob, NoStill>((resume) =>
        player.canvas.toBlob((blob) =>
          resume(
            Effect.fromOption(Option.fromNullishOr(blob), () =>
              NoStill.make({ T, why: 'the canvas gave no image' }),
            ),
          ),
        ),
      ),
    ),
    Effect.flatMap((blob) => Effect.promise(() => blob.arrayBuffer())),
    Effect.map((buffer) => new Uint8Array(buffer)),
  );
