// A look's still, composed in the page (`film look`): the frame just drawn on
// `canvas`, cropped and scaled as the view asks (`viewBox`, core/easel.ts),
// in greys for `value`, and in greys blurred for `squint`. The blur reads
// past the still's edges, so the region is first laid on a sheet padded by
// its own edge pixels, stretched outward (clamp to edge): the edges blur
// into themselves, never into the transparent margin, and the still keeps
// no halo or seam.

import { Array as Arr, Option, Result } from 'effect';
import { type StillView, viewBox } from '../core/easel.ts';

/** A 2D canvas `width` × `height`, or the page's failure. */
const sheet = (width: number, height: number) => {
  const made = document.createElement('canvas');
  made.width = width;
  made.height = height;
  const ctx = made.getContext('2d');
  if (ctx === null) throw new Error('2d context unavailable');
  ctx.imageSmoothingQuality = 'high';
  return { canvas: made, ctx };
};

/** How many blur radii the padding holds: a Gaussian reads about three. */
const PAD_RADII = 3;

/** The frame on `canvas` shown as `view` asks: the canvas itself when the view changes nothing. */
export const composeStill = (canvas: HTMLCanvasElement, view: StillView): HTMLCanvasElement => {
  const box = Result.getOrThrow(viewBox(view, canvas.width, canvas.height));
  const whole = box.sw === canvas.width && box.sh === canvas.height;
  if (whole && box.dw === box.sw && !box.grey) return canvas;
  const pad = Math.ceil(box.blur * PAD_RADII);
  // The region at its size, its edges stretched outward over the padding.
  const laid = sheet(box.dw + 2 * pad, box.dh + 2 * pad);
  laid.ctx.drawImage(canvas, box.sx, box.sy, box.sw, box.sh, pad, pad, box.dw, box.dh);
  if (pad > 0) {
    const w = box.dw + 2 * pad;
    // Left and right columns first, then the top and bottom rows across them (the corners too).
    laid.ctx.drawImage(laid.canvas, pad, pad, 1, box.dh, 0, pad, pad, box.dh);
    laid.ctx.drawImage(
      laid.canvas,
      pad + box.dw - 1,
      pad,
      1,
      box.dh,
      pad + box.dw,
      pad,
      pad,
      box.dh,
    );
    laid.ctx.drawImage(laid.canvas, 0, pad, w, 1, 0, 0, w, pad);
    laid.ctx.drawImage(laid.canvas, 0, pad + box.dh - 1, w, 1, 0, pad + box.dh, w, pad);
  }
  const still = sheet(box.dw, box.dh);
  const filters = [
    ...Arr.filter(['grayscale(1)'], () => box.grey),
    ...Arr.filter([`blur(${box.blur}px)`], () => box.blur > 0),
  ];
  still.ctx.filter = Option.getOrElse(
    Option.liftPredicate(filters.join(' '), (f) => f !== ''),
    () => 'none',
  );
  still.ctx.drawImage(laid.canvas, -pad, -pad);
  return still.canvas;
};
