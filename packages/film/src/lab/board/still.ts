// A panel's note still: the panel as the Board shows it (its try, or its card
// set by the engine at its mark), the sketch drawn over it, at the film's
// size, as a PNG's bytes. It is the third reference a tweak sends the image
// route (`film board tweak`), and the still every note list shows.

import { Effect, Option } from 'effect';
import type { Film } from '../../canvas/film.ts';
import type { SketchItem } from '../../core/sketch.ts';
import { paintSketch } from '../../canvas/sketch.ts';
import type { PickedPanel } from './context.tsx';
import { BOARD_PAPER, paintImage, paintText } from '../../canvas/board.ts';

/** The panel `p` with `items` drawn on it, as PNG bytes (none when the canvas gives none); `image` loads the try. */
export const stillOf = (
  film: Film,
  p: PickedPanel,
  items: ReadonlyArray<SketchItem>,
  image: (file: string) => Option.Option<HTMLImageElement>,
  T: number,
): Effect.Effect<Uint8Array> =>
  Effect.gen(function* () {
    const canvas = document.createElement('canvas');
    canvas.width = film.width;
    canvas.height = film.height;
    const painted = Option.map(Option.fromNullishOr(canvas.getContext('2d')), (ctx) => {
      ctx.fillStyle = BOARD_PAPER;
      ctx.fillRect(0, 0, film.width, film.height);
      Option.match(Option.fromUndefinedOr(p.panel.text), {
        onSome: (text) => {
          // The card as it reads once its words are all in: a second past its last word.
          paintText(
            ctx,
            film,
            p.beat.placed,
            text,
            p.panel.at,
            p.at,
            Math.max(T, p.beat.end - 0.01),
          );
        },
        onNone: () =>
          Option.map(
            Option.flatMap(p.tried, (t) => image(t.file)),
            (img) => paintImage(ctx, img, film.width, film.height),
          ),
      });
      paintSketch(ctx, items, film.width, film.height);
    });
    if (Option.isNone(painted)) return new Uint8Array();
    const blob = yield* Effect.callback<Option.Option<Blob>>((resume) =>
      canvas.toBlob((b) => resume(Effect.succeed(Option.fromNullishOr(b))), 'image/png'),
    );
    if (Option.isNone(blob)) return new Uint8Array();
    const buffer = yield* Effect.promise(() => blob.value.arrayBuffer());
    return new Uint8Array(buffer);
  });
