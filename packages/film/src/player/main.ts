// The browser player, framework-free. A page with a film on it stages it
// here (`stageFilm`): the render page (`render.ts`, `mountRender`), and the
// studio's pages, which mount the scrubbable preview (`mountPreview`) in
// their Solid shell: the lab (`@bible/film/lab`), and a film's studio
// (`mountFilmStudio`, lab/film-studio/mount.tsx). So the render page never
// loads Solid, and the studio's pages never load the encoder.

import type { ClockReads, Film, RenderOptions } from '../canvas/film.ts';
import type { FilmUnloadable } from './narrated.ts';
import { Cause, Effect, Option, Scope } from 'effect';
import type { Fiber } from 'effect';
import { parseHref } from '@bible/url-state';
import { TIME_EVERY_MS, filmOfPage } from '../core/api.ts';
import { type Ask, newestAsked } from '../core/asked.ts';
import { addressOn, monotonicMs, onTraverse } from '../browser/host.ts';
import type { Host } from '../browser/host.ts';
import {
  type FootageFrameMissing,
  type FootageShown,
  paintedIfNewest,
  readsFootage,
} from '../browser/footage.ts';
import { makeClock } from '../browser/media-clock.ts';
import { Frames } from '../browser/frames.ts';
import type { Hub } from '../command/hub.ts';
import { pictureFacesWait } from './face.ts';
import { narration } from './narration.ts';
import { tInUrl, type TimeInUrl } from './t-in-url.ts';
import { timersOn } from './throttle.ts';

/** What the lab drives: the preview's clock, its canvas and its timeline. */
export interface Player {
  readonly film: Film;
  readonly canvas: HTMLCanvasElement;
  readonly ctx: CanvasRenderingContext2D;
  readonly captions: { on: boolean };
  /** Film seconds shown now. */
  now(): number;
  /** Show `T` and settle there (`#t=` written at once). */
  seek(T: number): void;
  /** Show `T` as a drag passes through it; the drag ends with `settle`. */
  scrub(T: number): void;
  /** T has settled where it is: `#t=` is written at once. */
  settle(): void;
  /**
   * A lab write is on its way, and its reload will follow: `#t=` is written
   * now and held at this frame until T next settles, so the reload lands on
   * the frame the write was made at.
   */
  holdT(): void;
  pause(): void;
  play(): void;
  playing(): boolean;
  /**
   * Draw the frame at `T` into `ctx` as the preview shows it, with its
   * captions: the one spelling of "the frame as the studio shows it", which a
   * note's still draws through. Nothing is drawn until the
   * film's faces have loaded (`drawable`); a frame that reads footage (a
   * talk's) is drawn once the host has decoded it. It resolves once the frame
   * is painted, so a reader of `ctx`'s canvas after it reads this frame; a
   * frame whose footage will not decode fails, never drawn black. A surface
   * that asks again before a frame lands passes `ask`
   * (one of its `newestAsked`, `core/asked.ts`): a frame no longer the newest asked for paints
   * nothing and fails nothing.
   */
  renderShown(
    ctx: CanvasRenderingContext2D,
    T: number,
    ask?: Ask,
  ): Effect.Effect<void, FootageFrameMissing>;
  /**
   * Whether the preview draws frames: once the faces its film draws in have
   * loaded (`pictureFacesWait`). Until then its canvas shows nothing.
   */
  drawable(): boolean;
  /**
   * Hear the names each frame drawn reads off its scenes' clocks
   * (`RenderOptions.clock`), from the frame shown now (drawn again, heard)
   * until `stop`: the studio's code view lights a read of the clock only
   * while the frame read it. `reads` is the last frame drawn heard's. A
   * frame drawn while no one hears records nothing.
   */
  hearClock(): { readonly reads: () => ClockReads; readonly stop: () => void };
  /** Called after every frame the preview draws (none while it is not `drawable`), until the returned function is called. */
  onDraw(listener: (T: number) => void): () => void;
  /**
   * Called with the time shown each time the preview shows it (every move:
   * a seek, a scrub, play), drawn or not: before the film's faces load no
   * frame is drawn, yet T moves. Until the returned function is called.
   */
  onMove(listener: (T: number) => void): () => void;
}

/**
 * An app's film registry: each film's name and its load, which gives the
 * film with what it holds while it draws (its Rive rigs, `loadRigs`) in the
 * scope it runs in: whoever runs the load owns their lifetime, closing that
 * scope frees them, and stopping the load stops it where it is, releasing
 * what it had acquired.
 */
export type Films = Record<string, Effect.Effect<Film, FilmUnloadable, Scope.Scope>>;

/** A page's film, loaded and on the stage: its name, its stage and canvas, and the captions switch. */
export interface Staged {
  readonly name: string;
  readonly film: Film;
  /** The element the canvas stands in, which a page places. */
  readonly stage: HTMLElement;
  readonly canvas: HTMLCanvasElement;
  readonly ctx: CanvasRenderingContext2D;
  readonly captions: { on: boolean };
}

/**
 * The film the page at `href` is on: its path's (`/films/<film>/…`, a film's
 * export page on the lab among them), else the PreviewServer's render page's
 * `?film=<name>`, else the registry's first.
 */
const filmName = (href: string, films: Films): string =>
  Option.getOrElse(
    Option.orElse(filmOfPage(href), () =>
      Option.fromNullishOr(parseHref(href).searchParams.get('film')),
    ),
    () => Object.keys(films)[0] ?? '',
  );

/**
 * Load the film of the page at `href` (its loader gives it with the faces it
 * draws in asked for, `narratedFilms`; what draws it waits for them,
 * `pictureFacesWait`, so text measures true from the first frame: a short's
 * hook and captions are measured once, on the first frame that draws them),
 * and put the film's canvas on the stage, undrawn; its captions are on
 * unless an export page says `captions=0`. The page's title is the shell's
 * (`page-shell.tsx`).
 */
export const stageFilm = async (films: Films, href: string): Promise<Staged> => {
  const name = filmName(href, films);
  const captions = { on: parseHref(href).searchParams.get('captions') !== '0' };
  const load = films[name];
  if (load === undefined)
    throw new Error(`unknown film "${name}"; have ${Object.keys(films).join(', ')}`);
  // The page's own scope, never closed: the staged film's rigs live as long as the page.
  const film = await Effect.runPromise(Scope.provide(load, Scope.makeUnsafe()));

  const canvas = document.createElement('canvas');
  canvas.width = film.width;
  canvas.height = film.height;
  const ctx = canvas.getContext('2d');
  if (ctx === null) throw new Error('2d context unavailable');
  const stage = document.createElement('div');
  stage.className = 'stage';
  stage.append(canvas);
  document.body.append(stage);
  return { name, film, stage, canvas, ctx, captions };
};

/**
 * The scrubbable preview of a staged film: its clock and its narration, its
 * picture a click plays or pauses. The page that mounts it keys its
 * transport and draws its timeline (the film's studio). Its film's faces
 * failing to load fail the page (`fail`: it ends, and says why).
 */
export const mountPreview = (
  { film, canvas, ctx, captions }: Staged,
  host: Host,
  time: TimeInUrl,
  hub: Hub,
  fail: (why: string) => Effect.Effect<void>,
): Player => {
  // The narration's state redraws the frame shown as it changes (a master
  // loaded, a play refused until a click).
  const voice = narration(film.audio, host, () => draw());
  let T = Math.min(Math.max(time.at(addressOn(host).href()), 0), film.duration);
  let playing = false;
  /** The play loop, while the film plays (`Frames.loop`). */
  let running = Option.none<Fiber.Fiber<void>>();
  /**
   * The preview's own clock, over the host's monotonic `Clock` (seconds):
   * what T follows off the narration (with no narration to play). It stands
   * while the film does; a seek starts it again from T.
   */
  const nowMs = monotonicMs(host);
  const clock = makeClock(() => nowMs() / 1000);
  /** Hears every frame drawn. */
  const drawnTo = listenersOf();
  /** Hears the time each time it is shown, drawn or not (no frame is drawn until the faces load). */
  const movedTo = listenersOf();
  /** How many `hearClock`s hear the frames drawn: while any does, each records the names it reads off its clock. */
  let hearers = 0;
  /** The names the last frame drawn heard read off its scenes' clocks. */
  let heard: ClockReads = { cues: new Map(), marks: new Map() };
  /**
   * T in the URL (`time`, the page's own place), so a reload lands on this
   * frame (`tInUrl`): written at most every `TIME_EVERY_MS` (the time key's
   * throttle, `core/api.ts`) while T moves, at once
   * when it settles (the end of a scrub, play or pause, the film's end) or
   * jumps (a seek), and held at the frame a lab write was asked at. A frame
   * loop that wrote it every frame cost a history call per frame.
   */
  const url = tInUrl((cause) => time.write(T, cause), TIME_EVERY_MS, timersOn(host));

  /** How the preview draws a frame: its captions, with `extra` options. */
  const shownOptions = (extra: RenderOptions = {}): RenderOptions => ({
    captions: captions.on,
    ...extra,
  });

  /**
   * Whether frames are drawn: once the faces the film draws in have loaded
   * (`pictureFacesWait`), at once when they are in already. Until then the
   * canvas shows nothing, so no frame is ever drawn in a fallback face.
   */
  let drawable = false;

  /**
   * The frames of footage the preview asks for: a decode that lands after a
   * later ask draws nothing and says nothing, so the newest wins and the
   * preview drops frames rather than showing an old one late, as `<video>`
   * would.
   */
  const previewAsks = newestAsked();
  /**
   * Frame `at`'s footage decoded, then `paint` given it, while it is the
   * newest frame asked for. A frame that will not decode is never drawn
   * black: the film stops, and the page says why in its place (`fail`), as
   * it does for a face that will not load.
   */
  const withFootage = (at: number, paint: (shown: FootageShown) => void) =>
    Effect.runForkWith(host)(
      paintedIfNewest(film, at, paint, previewAsks.ask()).pipe(
        Effect.catchTag('FootageFrameMissing', (missing) =>
          Effect.logWarning(
            `player.footage.missing source=${missing.source} at=${missing.at} why=${missing.why}`,
          ).pipe(
            Effect.andThen(
              Effect.sync(() => {
                if (playing) toggle();
              }),
            ),
            Effect.andThen(fail(missing.message)),
          ),
        ),
      ),
    );
  /** Frame `at` drawn as the preview shows it, and what it reads off its clocks while heard. */
  const paintShown = (at: number, shown: FootageShown) => {
    const clock: ClockReads | undefined =
      hearers > 0 ? { cues: new Map(), marks: new Map() } : undefined;
    film.render(ctx, at, shownOptions({ clock, ...shown }));
    if (clock !== undefined) heard = clock;
    drawnTo.call(at);
  };

  const draw = () => {
    if (drawable && !readsFootage(film)) paintShown(T, {});
    else if (drawable) {
      const at = T;
      withFootage(at, (shown) => paintShown(at, shown));
    }
    movedTo.call(T);
    url.moved();
  };

  /** Show `t`, as a drag passes through it: `#t=` follows at most every `TIME_EVERY_MS`. */
  const scrub = (t: number) => {
    T = Math.max(0, Math.min(film.duration, t));
    clock.seek(T);
    voice.seek(T);
    draw();
  };

  /** Jump to `t`: `#t=` is written at once, as a jump. */
  const seek = (t: number) => {
    scrub(t);
    url.jumped();
  };

  // Back or Forward shows the frame the entry landed on keeps, as the lab
  // shows its pick: the URL is already there, so a write still waiting with
  // the frame before is dropped rather than written over it.
  onTraverse(host, (href) => {
    scrub(time.at(href));
    url.landed();
  });

  /**
   * Restart the clock at `T`, and the narration with it. A narration that
   * cannot play is not asked to (`narration.ts`).
   */
  const rebase = () => {
    clock.seek(T);
    if (playing) clock.play();
    else clock.pause();
    voice.seek(T);
    if (playing) voice.play(() => T);
    else voice.pause();
  };

  const toggle = () => {
    playing = !playing;
    // Play at the film's last frame starts it over.
    if (playing && T >= film.duration - 1 / film.fps) T = 0;
    rebase();
    Option.map(running, (frames) => frames.interruptUnsafe());
    running = Option.none();
    if (playing) running = Option.some(Effect.runForkWith(host)(Frames.use((f) => f.loop(tick))));
    draw();
    url.settled();
  };

  /** One frame of play: the frame at the clock's time, and whether play goes on. */
  const tick = (): boolean => {
    if (!playing) return false;
    T = voice.playingAt() ?? clock.time();
    if (T >= film.duration) {
      T = film.duration;
      playing = false;
      voice.pause();
    }
    draw();
    if (!playing) url.settled();
    return playing;
  };

  hub.refine((now) => ({ ...now, playing }));
  // The picture: a click plays or pauses.
  canvas.addEventListener('click', () => toggle());
  // The first frame: at once when the film's faces are in, else once they
  // have loaded. A face that will not load fails the page, as a film that
  // will not load does: the film stops, and the page ends and says why in
  // its place (`fail`).
  Option.match(pictureFacesWait(document.fonts), {
    onNone: () => {
      drawable = true;
    },
    onSome: (wait) => {
      Effect.runForkWith(host)(
        wait.pipe(
          Effect.andThen(
            Effect.sync(() => {
              drawable = true;
              draw();
            }),
          ),
          Effect.catchCause((cause) =>
            Effect.andThen(
              Effect.sync(() => {
                if (playing) toggle();
              }),
              fail(Cause.pretty(cause)),
            ),
          ),
        ),
      );
    },
  });
  draw();
  return {
    film,
    canvas,
    ctx,
    captions,
    now: () => T,
    seek,
    scrub,
    settle: () => url.settled(),
    holdT: () => url.held(),
    pause: () => {
      if (playing) toggle();
    },
    play: () => {
      if (!playing) toggle();
    },
    playing: () => playing,
    renderShown: (into, at, ask = newestAsked().ask()) =>
      Effect.suspend(() => {
        if (!drawable) return Effect.void;
        return paintedIfNewest(
          film,
          at,
          (footage) => film.render(into, at, shownOptions(footage)),
          ask,
        ).pipe(Effect.provideContext(host));
      }),
    drawable: () => drawable,
    hearClock: () => {
      hearers += 1;
      // The frame shown now was drawn unheard: drawn again, so a still frame is heard too.
      if (hearers === 1) draw();
      let stopped = false;
      return {
        reads: () => heard,
        stop: () => {
          if (stopped) return;
          stopped = true;
          hearers -= 1;
        },
      };
    },
    onDraw: drawnTo.add,
    onMove: movedTo.add,
  };
};

/** Listeners of T: each heard until its returned stop. */
const listenersOf = () => {
  const all: Array<(T: number) => void> = [];
  return {
    /** Call each with `T`, as they stand now: a listener that stops listening skips none of the rest. */
    call: (T: number) => {
      for (const listener of [...all]) listener(T);
    },
    add: (listener: (T: number) => void): (() => void) => {
      all.push(listener);
      return () => {
        const at = all.indexOf(listener);
        if (at >= 0) all.splice(at, 1);
      };
    },
  };
};
