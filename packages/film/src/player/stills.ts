// A film's stills: small frames drawn from the code as it stands, the one
// source of stills the studio's pages and the look-book's sheet draw from
// (`lookbook-sheet.ts`; the Scenes tape, `lab/scenes/`). Each still is the
// frame `film.render` draws full size, scaled onto a canvas `width` wide, and
// kept by its frame (a time is drawn once, at the frame it falls in). They are
// drawn one at a time, the page given a turn between them (`turn`), in the
// order they are wanted: the last `want` goes first, so the stills on screen
// are drawn before the rest. A full-size frame costs the page about a
// seventh of a second, so a film's tape fills progressively, never all at
// once. The first waits for the faces the film draws in
// (`pictureFacesWait`), so no still is drawn in a fallback face; a face that
// will not load leaves the stills undrawn and says so: `ready` and every
// `all` waiting reject with why. A film that reads footage (a talk) has each
// still's footage decoded first (`footageAt`); a frame the host cannot
// decode stops the stills the same way, never drawn black. Framework-free.

import { Effect, Option } from 'effect';
import type { Context } from 'effect';
import type { Film, RenderOptions } from '../canvas/film.ts';
import { type Footage, type FootageShown, footageAt, readsFootage } from '../browser/footage.ts';
import { pictureFacesWait } from './face.ts';

/** What stills are drawn from: a film's frame size, rate, the footage its frames read, and its render. */
interface StillSource extends Pick<Film, 'footageAt'> {
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
  /**
   * Once the faces the film draws in have loaded (at once with none to wait
   * for); rejects with why when one will not load, and no still is drawn.
   */
  readonly ready: () => Promise<void>;
  /**
   * Every still of `times`, in order, once each is drawn; `progress` hears
   * each one land. Rejects when the film's faces will not load (`ready`).
   */
  readonly all: (
    times: ReadonlyArray<number>,
    progress?: (done: number, of: number) => void,
  ) => Promise<ReadonlyArray<HTMLCanvasElement>>;
  /** How many stills have been drawn, and the page ms spent drawing them. */
  readonly drawn: () => { readonly count: number; readonly ms: number };
  /**
   * Draw no more, for good: the queue emptied, the drawing halted at the
   * next turn, and any later `want` a no-op. What its page calls as it is
   * left, so a film's stills stop costing a page that no longer shows them.
   */
  readonly stop: () => void;
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
  /** The page's footage: what decodes the frames a talk's stills read. */
  readonly footage: Context.Context<Footage>;
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
  let stopped = false;
  let count = 0;
  let ms = 0;

  /** Why the stills stopped drawing: a frame's footage the host could not decode. */
  let failed = Option.none<unknown>();
  const failures = new Set<(why: unknown) => void>();

  const draw = (t: number, frame: number, shown: FootageShown) => {
    const began = options.now();
    const frameCanvas = Option.getOrElse(full, () => {
      const made = canvasOf(film.width, film.height);
      full = Option.some(made);
      return made;
    });
    film.render(frameCanvas.ctx, t, { captions: options.captions, ...shown });
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
    if (next === undefined || stopped) {
      running = false;
      return Promise.resolve();
    }
    queue = rest;
    if (kept.has(next.frame)) return step();
    if (!readsFootage(film)) {
      draw(next.t, next.frame, {});
      return options.turn().then(step);
    }
    return Effect.runPromiseWith(options.footage)(footageAt(film, next.t)).then(
      (shown) => {
        if (!stopped) draw(next.t, next.frame, shown);
        return options.turn().then(step);
      },
      (why: unknown) => {
        running = false;
        failed = Option.some(why);
        for (const failure of failures) failure(why);
      },
    );
  };
  /** The load of the faces the film draws in, asked once: none when there are none to wait for. */
  let faces = Option.none<Option.Option<Promise<void>>>();
  const facesLoad = () =>
    Option.getOrElse(faces, () => {
      const load = Option.map(pictureFacesWait(document.fonts), (wait) => Effect.runPromise(wait));
      faces = Option.some(load);
      return load;
    });
  const ready = () => Option.getOrElse(facesLoad(), () => Promise.resolve());
  const run = () => {
    if (running || Option.isSome(failed)) return;
    running = true;
    Option.match(facesLoad(), {
      onNone: () => void step(),
      // A face that will not load draws nothing; `ready` and `all` say why.
      onSome: (load) =>
        void load.then(step, () => {
          running = false;
        }),
    });
  };

  const want = (times: ReadonlyArray<number>) => {
    if (stopped) return;
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
    ready,
    all: (times, progress) =>
      new Promise((resolve, reject) => {
        const frames = times.map(frameOf);
        const left = () => frames.filter((f) => !kept.has(f)).length;
        const settle = () => {
          progress?.(times.length - left(), times.length);
          if (left() > 0) return false;
          stop();
          resolve(frames.map((f) => kept.get(f)).filter((c) => c !== undefined));
          return true;
        };
        const stop = () => {
          listeners.delete(heard);
          failures.delete(fail);
        };
        const heard = () => {
          settle();
        };
        // A frame whose footage will not decode ends the wait with why.
        const fail = (why: unknown) => {
          stop();
          reject(why);
        };
        listeners.add(heard);
        if (settle()) return;
        if (Option.isSome(failed)) return fail(failed.value);
        failures.add(fail);
        want(times);
        // A face that will not load draws none of them: the wait ends with why.
        ready().catch((why: unknown) => {
          stop();
          reject(why);
        });
      }),
    drawn: () => ({ count, ms }),
    stop: () => {
      stopped = true;
      queue = [];
      listeners.clear();
      failures.clear();
    },
  };
};
