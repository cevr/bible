// A panel note's still: the try the owner marked up, covering the frame as
// the film's 16:9 picture crops it, his marks painted over it as the sketch
// surface drew them, at the film's size, as a PNG's bytes. It is the
// reference a tweak sends the image route (`film board tweak`), and the
// still every note list shows. A still whose try will not load is refused,
// so no note names a try its still lacks.

import { Effect, Option } from 'effect';
import { BOARD_PAPER, paintImage } from '../../canvas/board.ts';
import { paintSketch } from '../../canvas/sketch.ts';
import type { SketchItem } from '../../core/sketch.ts';

/** The size a still is painted at when no staged film says its own: the films' 16:9 frame. */
export const STILL_SIZE = { w: 1920, h: 1080 } as const;

/** The image at `url`, once it has loaded; why not, in words. */
const loaded = (url: string): Effect.Effect<HTMLImageElement, string> =>
  Effect.callback<HTMLImageElement, string>((resume) => {
    const img = new Image();
    img.onload = () => resume(Effect.succeed(img));
    img.onerror = () => resume(Effect.fail(`its try's picture did not load (${url})`));
    img.src = url;
  });

/** The try at `url` with `items` painted over it, `size` big, as PNG bytes. */
export const panelStill = (
  url: string,
  items: ReadonlyArray<SketchItem>,
  size: { readonly w: number; readonly h: number },
): Effect.Effect<Uint8Array, string> => frameStill(Option.some(url), items, size);

/**
 * A frame's still: the picture at `url` (a try, a frame the player painted)
 * covering the frame, else the board's paper, with `items` painted over it,
 * `size` big, as PNG bytes.
 */
export const frameStill = (
  url: Option.Option<string>,
  items: ReadonlyArray<SketchItem>,
  size: { readonly w: number; readonly h: number },
): Effect.Effect<Uint8Array, string> =>
  Effect.gen(function* () {
    const img = yield* Effect.transposeOption(Option.map(url, loaded));
    const canvas = document.createElement('canvas');
    canvas.width = size.w;
    canvas.height = size.h;
    const ctx = yield* Effect.fromOption(Option.fromNullishOr(canvas.getContext('2d'))).pipe(
      Effect.mapError(() => 'the page gives no 2D canvas'),
    );
    ctx.fillStyle = BOARD_PAPER;
    ctx.fillRect(0, 0, size.w, size.h);
    Option.map(img, (i) => paintImage(ctx, i, size.w, size.h));
    paintSketch(ctx, items, size.w, size.h);
    const blob = yield* Effect.callback<Option.Option<Blob>>((resume) =>
      canvas.toBlob((b) => resume(Effect.succeed(Option.fromNullishOr(b))), 'image/png'),
    );
    const png = yield* Effect.fromOption(blob).pipe(
      Effect.mapError(() => 'the canvas gave no PNG'),
    );
    return new Uint8Array(yield* Effect.promise(() => png.arrayBuffer()));
  });
