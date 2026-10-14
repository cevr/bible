// A panel's note still: the panel as the Board shows it (its try, or its card
// set by the engine at its mark), the sketch drawn over it, at the film's
// size, as a PNG's bytes. It is the third reference a tweak sends the image
// route (`film board tweak`), and the still every note list shows. A still
// that cannot show its panel (the try's image will not load, the card will
// not set) is refused, so no note names a try its still lacks.

import { Effect, Option, Schema } from 'effect';
import type { Film } from '../../canvas/film.ts';
import type { SketchItem } from '../../core/sketch.ts';
import { paintSketch } from '../../canvas/sketch.ts';
import type { PickedPanel } from './context.tsx';
import { BOARD_PAPER, paintImage, paintText } from '../../canvas/board.ts';

/** A still that could not be made: why, in words. */
export class StillUnmade extends Schema.TaggedError<StillUnmade>()('StillUnmade', {
  reason: Schema.String,
}) {
  override get message() {
    return `the panel's still was not made: ${this.reason}`;
  }
}

/** The panel `p` with `items` drawn on it, as PNG bytes; `load` waits for a try's image. */
export const stillOf = (
  film: Film,
  p: PickedPanel,
  items: ReadonlyArray<SketchItem>,
  load: (file: string) => Effect.Effect<HTMLImageElement, StillUnmade>,
  T: number,
): Effect.Effect<Uint8Array, StillUnmade> =>
  Effect.gen(function* () {
    const canvas = document.createElement('canvas');
    canvas.width = film.width;
    canvas.height = film.height;
    const ctx = yield* Effect.fromOption(Option.fromNullishOr(canvas.getContext('2d'))).pipe(
      Effect.mapError(() => StillUnmade.make({ reason: 'the page gives no 2D canvas' })),
    );
    ctx.fillStyle = BOARD_PAPER;
    ctx.fillRect(0, 0, film.width, film.height);
    yield* Option.match(Option.fromUndefinedOr(p.panel.text), {
      // The card as it reads once its words are all in: a second past its last word.
      onSome: (text) =>
        Effect.mapError(
          Effect.fromResult(
            paintText(
              ctx,
              film,
              p.beat.placed,
              text,
              p.panel.at,
              p.at,
              Math.max(T, p.beat.end - 0.01),
            ),
          ),
          (reason) => StillUnmade.make({ reason }),
        ),
      onNone: () =>
        Effect.flatMap(
          Effect.fromOption(p.tried).pipe(
            Effect.mapError(() =>
              StillUnmade.make({ reason: `panel ${p.panel.id} has no try yet` }),
            ),
          ),
          (t) => Effect.map(load(t.file), (img) => paintImage(ctx, img, film.width, film.height)),
        ),
    });
    paintSketch(ctx, items, film.width, film.height);
    const blob = yield* Effect.callback<Option.Option<Blob>>((resume) =>
      canvas.toBlob((b) => resume(Effect.succeed(Option.fromNullishOr(b))), 'image/png'),
    );
    const png = yield* Effect.fromOption(blob).pipe(
      Effect.mapError(() => StillUnmade.make({ reason: 'the canvas gave no PNG' })),
    );
    return new Uint8Array(yield* Effect.promise(() => png.arrayBuffer()));
  });
