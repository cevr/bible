// The lab's onion skin, framework-free: the frames around the one shown
// (`film.render` into an offscreen canvas), at half the film's size, keeping
// only their ink where the frame shown has none (what moved: darker than the
// frame on a light page, lighter on a dark one), warm before and cool after,
// fainter the further away. The lab's Motion panel owns the layer it paints
// into and when it paints; this module only paints, each ghost read once its
// frame is painted (a talk's once its footage decodes).

import { Effect, Semaphore } from 'effect';
import type { FootageFrameMissing } from '../browser/footage.ts';
import type { Player } from './main.ts';

/** A pixel whose brightness moved by less than this (0–255) did not move: paper grain, boil. */
const MOVED = 38;
/** The onion skin draws at this fraction of the film's size. */
export const ONION_SCALE = 0.5;
const BEFORE: readonly [number, number, number] = [226, 84, 70];
const AFTER: readonly [number, number, number] = [60, 150, 230];

/** How many frames either side the onion ghosts, and how many frames apart. */
interface OnionSpread {
  readonly count: number;
  readonly spacing: number;
}

const canvas2d = (w: number, h: number) => {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const ctx = c.getContext('2d', { willReadFrequently: true });
  if (ctx === null) throw new Error('2d context unavailable');
  return { c, ctx };
};

const brightness = (d: Uint8ClampedArray, i: number) =>
  0.299 * (d[i] ?? 0) + 0.587 * (d[i + 1] ?? 0) + 0.114 * (d[i + 2] ?? 0);

/** Each pixel's brightness in `d`, written into `into` (one entry per pixel). */
const brightnessInto = (into: Float64Array, d: Uint8ClampedArray) => {
  for (let p = 0, i = 0; p < into.length; p++, i += 4) into[p] = brightness(d, i);
};

/** Ink is darker than the page on paper (1), lighter on a night sky (-1). */
const inkSign = (now: Float64Array) => {
  let sum = 0;
  for (let p = 0; p < now.length; p += 97) sum += now[p] ?? 0;
  return sum / Math.ceil(now.length / 97) > 110 ? 1 : -1;
};

/**
 * Paint into `o`, in `color`, the ink `px` has where `now` (the frame shown,
 * as brightness per pixel) has none, at `strength`; a pixel an earlier,
 * stronger ghost holds keeps it.
 */
const ghostInto = (
  o: Uint8ClampedArray,
  now: Float64Array,
  px: Uint8ClampedArray,
  light: number,
  strength: number,
  color: readonly [number, number, number],
) => {
  const [r, g, bl] = color;
  for (let p = 0, i = 0; i < o.length; p++, i += 4) {
    const moved = light * ((now[p] ?? 0) - brightness(px, i));
    if (moved < MOVED) continue;
    const alpha = Math.round(255 * strength * Math.min(1, (moved - MOVED) / 60 + 0.35));
    if (alpha <= (o[i + 3] ?? 0)) continue;
    o[i] = r;
    o[i + 1] = g;
    o[i + 2] = bl;
    o[i + 3] = alpha;
  }
};

/** The layer the onion paints into, `ONION_SCALE` × the film's size: a canvas's context. */
interface OnionLayer<D extends { readonly data: Uint8ClampedArray }> {
  createImageData(w: number, h: number): D;
  putImageData(data: D, dx: number, dy: number): void;
  clearRect(x: number, y: number, w: number, h: number): void;
}

/** Paints `player`'s onion skin into a layer `ONION_SCALE` × the film's size. */
interface OnionPainter {
  /**
   * Paint the onion into `into`, once each frame it ghosts is painted (a
   * talk's after its footage decodes). One paint at a time; a paint asked for
   * while another runs wins, and the other paints nothing. A ghost whose
   * footage will not decode takes the onion off `into` (none is better than
   * one of another frame), and the paint fails with why.
   */
  paint<D extends { readonly data: Uint8ClampedArray }>(
    into: OnionLayer<D>,
    spread: OnionSpread,
  ): Effect.Effect<void, FootageFrameMissing>;
}

/** What of the player the onion reads: the film's size and pace, the frame shown, and frames drawn as shown. */
type OnionPlayer = Pick<Player, 'canvas' | 'now' | 'renderShown'> & {
  readonly film: Pick<Player['film'], 'width' | 'height' | 'fps' | 'duration'>;
};

export const makeOnion = (player: OnionPlayer): OnionPainter => {
  const { film } = player;
  const w = Math.round(film.width * ONION_SCALE);
  const h = Math.round(film.height * ONION_SCALE);
  const ghost = canvas2d(film.width, film.height);
  const small = canvas2d(w, h);
  /**
   * The frame shown, as brightness per pixel: computed once per paint rather
   * than again for every ghost. The buffer is reused; its values are this
   * paint's only.
   */
  const nowBrightness = new Float64Array(w * h);

  /** `canvas` at the onion's size, as pixels. */
  const pixelsOf = (canvas: HTMLCanvasElement) => {
    small.ctx.clearRect(0, 0, w, h);
    small.ctx.drawImage(canvas, 0, 0, w, h);
    return small.ctx.getImageData(0, 0, w, h).data;
  };

  /** The frame at `T`, at the onion's size, as pixels: read once it is painted. */
  const pixelsAt = (T: number) =>
    Effect.map(player.renderShown(ghost.ctx, T), () => pixelsOf(ghost.c));

  /** One paint at a time: the ghost and the small canvas are shared. */
  const one = Semaphore.makeUnsafe(1);
  /** The paints asked for: only the last one paints. */
  let asked = 0;

  return {
    paint: (into, { count, spacing }) => {
      asked += 1;
      const mine = asked;
      const current = () => mine === asked;
      return one.withPermits(1)(
        Effect.gen(function* () {
          if (!current()) return;
          const T = player.now();
          brightnessInto(nowBrightness, pixelsOf(player.canvas));
          const now = nowBrightness;
          const light = inkSign(now);
          const out = into.createImageData(w, h);
          // Farthest first, so the nearest ghost ends on top.
          for (let k = count; k >= 1; k--) {
            const strength = 0.9 * (1 - (k - 1) / (count + 1));
            for (const dir of [-1, 1]) {
              const at = T + (dir * k * spacing) / film.fps;
              if (at < 0 || at > film.duration) continue;
              const ghosted = yield* pixelsAt(at);
              if (!current()) return;
              ghostInto(out.data, now, ghosted, light, strength, dir < 0 ? BEFORE : AFTER);
            }
          }
          into.putImageData(out, 0, 0);
        }).pipe(
          Effect.catchTag('FootageFrameMissing', (missing) =>
            Effect.suspend(() => {
              // A paint no longer the last asked for leaves the layer to the one that is.
              if (!current()) return Effect.void;
              into.clearRect(0, 0, w, h);
              return Effect.fail(missing);
            }),
          ),
        ),
      );
    },
  };
};
