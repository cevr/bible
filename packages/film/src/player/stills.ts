// A film's stills: small frames drawn from the code as it stands, the one
// source of stills the studio's pages and the look-book's sheet draw from
// (`lookbook-sheet.ts`; the Scenes tape, `lab/scenes/`). Each still is the
// frame `film.render` draws full size, scaled onto a canvas `width` wide, and
// kept by its frame (a time is drawn once, at the frame it falls in). They are
// drawn one at a time, the page given a turn between them (`turn`), in the
// order they are wanted: the last `want` goes first, so the stills on screen
// are drawn before the rest. A full-size frame costs the page about a
// seventh of a second, so a film's tape fills progressively, never all at
// once. Framework-free.

import { Option } from 'effect';
import type { RenderOptions } from '../canvas/film.ts';

/** What stills are drawn from: a film's frame size, rate and its render. */
interface StillSource {
  readonly width: number;
  readonly height: number;
  readonly fps: number;
  readonly render: (ctx: CanvasRenderingContext2D, T: number, opts?: RenderOptions) => void;
}

/** A film's stills, drawn as they are wanted. */
interface Stills {
  /** A still's size, in canvas px. */
  readonly width: number;
  readonly height: number;
  /** The still at film second `t`, once drawn. */
  readonly at: (t: number) => Option.Option<HTMLCanvasElement>;
  /**
   * Draw `times` next, in the order given, before anything wanted earlier
   * (which is drawn after them); a time already drawn is skipped.
   */
  readonly want: (times: ReadonlyArray<number>) => void;
  /** Hear each still as it is drawn (its film second), until the returned stop. */
  readonly onDrawn: (listener: (t: number) => void) => () => void;
  /** Every still of `times`, in order, once each is drawn; `progress` hears each one land. */
  readonly all: (
    times: ReadonlyArray<number>,
    progress?: (done: number, of: number) => void,
  ) => Promise<ReadonlyArray<HTMLCanvasElement>>;
  /** How many stills have been drawn, and the page ms spent drawing them. */
  readonly drawn: () => { readonly count: number; readonly ms: number };
}

/** How the stills are drawn. */
interface StillsOptions {
  /** A still's width in canvas px; its height keeps the frame's shape. */
  readonly width: number;
  /** Whether the stills carry the film's captions. */
  readonly captions: boolean;
  /** The page's turn between two stills: resolves once the page has had it. */
  readonly turn: () => Promise<unknown>;
  /** The page clock, in ms: what the drawing is timed by. */
  readonly now: () => number;
}

/** A 2D canvas `width` × `height`. */
const canvasOf = (width: number, height: number) => {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (ctx === null) throw new Error('2d context unavailable');
  return { canvas, ctx };
};

/** The stills of `film`, drawn as `options` say. */
export const makeStills = (film: StillSource, options: StillsOptions): Stills => {
  const width = Math.round(options.width);
  const height = Math.round((width * film.height) / film.width);
  /** The frame a time falls in: what a still is kept by. */
  const frameOf = (t: number) => Math.max(0, Math.round(t * film.fps));
  const kept = new Map<number, HTMLCanvasElement>();
  /** The frames still to draw, first first, each with the film second it was wanted at. */
  let queue: ReadonlyArray<{ readonly frame: number; readonly t: number }> = [];
  const listeners = new Set<(t: number) => void>();
  let full = Option.none<{
    readonly ctx: CanvasRenderingContext2D;
    readonly canvas: HTMLCanvasElement;
  }>();
  let running = false;
  let count = 0;
  let ms = 0;

  const draw = (t: number, frame: number) => {
    const began = options.now();
    const frameCanvas = Option.getOrElse(full, () => {
      const made = canvasOf(film.width, film.height);
      full = Option.some(made);
      return made;
    });
    film.render(frameCanvas.ctx, t, { captions: options.captions });
    const still = canvasOf(width, height);
    still.ctx.imageSmoothingQuality = 'high';
    still.ctx.drawImage(frameCanvas.canvas, 0, 0, width, height);
    kept.set(frame, still.canvas);
    count += 1;
    ms += options.now() - began;
    for (const listener of listeners) listener(t);
  };

  /** Draw the queue's head, then the next after the page's turn, until it is empty. */
  const step = (): Promise<void> => {
    const [next, ...rest] = queue;
    if (next === undefined) {
      running = false;
      return Promise.resolve();
    }
    queue = rest;
    if (kept.has(next.frame)) return step();
    draw(next.t, next.frame);
    return options.turn().then(step);
  };
  const run = () => {
    if (running) return;
    running = true;
    void step();
  };

  const want = (times: ReadonlyArray<number>) => {
    const first = times.map((t) => ({ frame: frameOf(t), t })).filter((w) => !kept.has(w.frame));
    const asked = new Set(first.map((w) => w.frame));
    queue = [...first, ...queue.filter((w) => !asked.has(w.frame))];
    run();
  };

  const at = (t: number) => Option.fromUndefinedOr(kept.get(frameOf(t)));

  return {
    width,
    height,
    at,
    want,
    onDrawn: (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    all: (times, progress) =>
      new Promise((resolve) => {
        const frames = times.map(frameOf);
        const left = () => frames.filter((f) => !kept.has(f)).length;
        const settle = () => {
          progress?.(times.length - left(), times.length);
          if (left() > 0) return false;
          stop();
          resolve(frames.map((f) => kept.get(f)).filter((c) => c !== undefined));
          return true;
        };
        const stop = () => listeners.delete(heard);
        const heard = () => {
          settle();
        };
        listeners.add(heard);
        if (!settle()) want(times);
      }),
    drawn: () => ({ count, ms }),
  };
};
