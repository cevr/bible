// The browser player. An app's entry calls `mountPlayer(films)` with its film
// registry. Preview mode is a scrubbable player; export mode (`?export`) hides
// the chrome and hands `window.__film` to the renderer. Framework-free: the
// lab (`@bible/film/lab`) is its own page, which stages the film and mounts
// this preview under its Solid panels, so the render page never loads Solid.

import type { Film, KnobRead } from '../canvas/film.ts';
import type { ProbeSink } from '../canvas/probe.ts';
import type { Probed } from '../core/schema.ts';
import { timelineTicks } from '../core/ticks.ts';
import { Option } from 'effect';
import { composeContact } from './contact.ts';
import { bytesBase64, canvasBase64, required } from './dom.ts';
import { type EncoderCheck, encodeChunk, encoderCheck } from './encode.ts';
import { composeLookbook, mountLookbook } from './lookbook.ts';
import { narration, narrationNote } from './narration.ts';
import { labUrl } from './pages.ts';
import { tInUrl } from './t-in-url.ts';
import { hashFrames, timeFrames } from './timing.ts';

/** The longest `#T` in the URL trails the frame shown while it plays. */
const HASH_MS = 250;

const FONTS = [
  '400 40px "Fraunces"',
  '700 40px "Fraunces"',
  'italic 400 40px "Fraunces"',
  '400 40px "Inter"',
  '600 40px "Inter"',
  '400 40px "EB Garamond"',
  'italic 400 40px "EB Garamond"',
  '400 40px "Frank Ruhl Libre"',
  '400 40px "Gaegu"',
  '700 40px "Gaegu"',
];

export interface ExportHandle {
  readonly width: number;
  readonly height: number;
  readonly fps: number;
  readonly duration: number;
  readonly frames: number;
  readonly audio: string | undefined;
  /** Draw frame `i` and return it encoded. */
  frame(i: number, type?: 'image/png' | 'image/jpeg'): Promise<string>;
  /** Draw frame `i` with the probe on: every line of text and mark of ink it draws, in canvas pixels. */
  probe(i: number): Probed;
  /** Compose the film's look-book (`composeLookbook`) and return it encoded. */
  lookbook(type?: 'image/png' | 'image/jpeg'): Promise<string>;
  /** Whether the film can be encoded here at `scale` (`encoderCheck`). */
  encoder(scale: number): Promise<EncoderCheck>;
  /**
   * Frames `[from, to)` encoded as an H.264 MP4 at `scale` (`encodeChunk`), and
   * with `share` a small copy beside it, each as base64.
   */
  encode(
    from: number,
    to: number,
    scale: number,
    share: boolean,
  ): Promise<{ readonly master: string; readonly share?: string }>;
  /** `frames` tiled into the contact sheet (`composeContact`), as a base64 JPEG. */
  contact(frames: ReadonlyArray<number>): Promise<string>;
  /** Milliseconds each of `frames` takes to draw, raster included (`timeFrames`). */
  time(frames: ReadonlyArray<number>): ReadonlyArray<number>;
  /** A hash of each of `frames`' pixels (`hashFrames`). */
  hash(frames: ReadonlyArray<number>): ReadonlyArray<string>;
}

declare global {
  interface Window {
    __film?: ExportHandle;
  }
}

/** A span of film seconds playback repeats: `from` to `to`. */
export interface LoopRange {
  readonly from: number;
  readonly to: number;
}

/** What the lab drives: the preview's clock, its canvas and its timeline. */
export interface Player {
  readonly film: Film;
  readonly canvas: HTMLCanvasElement;
  readonly ctx: CanvasRenderingContext2D;
  readonly captions: { on: boolean };
  /** The panel under the canvas, and the timeline in it. */
  readonly bar: HTMLDivElement;
  readonly track: HTMLDivElement;
  /** Film seconds shown now. */
  now(): number;
  /** Show `T` and settle there (`#T` written at once). */
  seek(T: number): void;
  /** Show `T` as a drag passes through it; the drag ends with `settle`. */
  scrub(T: number): void;
  /** T has settled where it is: `#T` is written at once. */
  settle(): void;
  /**
   * A lab write is on its way, and its reload will follow: `#T` is written
   * now and held at this frame until T next settles, so the reload lands on
   * the frame the write was made at.
   */
  holdT(): void;
  pause(): void;
  play(): void;
  playing(): boolean;
  /**
   * Play at `rate` × (0.25, 0.5, 1). The narration plays only at 1×; at any
   * other rate the clock runs on its own and the audio is paused (muted).
   */
  setRate(rate: number): void;
  /** Repeat `range` while playing (none to stop repeating). */
  setLoop(range: LoopRange | undefined): void;
  /** Draw the frame shown now again: after the lab previews an edit. */
  redraw(): void;
  /** Every knob the last frame drawn read, and how (`KnobRead`). */
  knobReads(): ReadonlyArray<KnobRead>;
  /** Called after every frame the preview draws, until the returned function is called. */
  onDraw(listener: (T: number) => void): () => void;
}

/** An app's film registry: each film's name and its loader. */
export type Films = Record<string, () => Promise<Film>>;

/** A page's film, loaded and on the stage: its name, its canvas and the captions switch. */
export interface Staged {
  readonly name: string;
  readonly film: Film;
  readonly canvas: HTMLCanvasElement;
  readonly ctx: CanvasRenderingContext2D;
  readonly captions: { on: boolean };
}

/** The film a page names (`?film=<name>`), else the registry's first. */
export const filmName = (films: Films): string =>
  new URLSearchParams(location.search).get('film') ?? Object.keys(films)[0] ?? '';

export { labUrl, lookbookUrl } from './pages.ts';

/**
 * Load the page's film (its fonts first, so text measures true), title the
 * page, and put the film's canvas on the stage.
 */
export const stageFilm = async (films: Films): Promise<Staged> => {
  const params = new URLSearchParams(location.search);
  const name = filmName(films);
  const captions = { on: params.get('captions') !== '0' };
  const load = films[name];
  if (load === undefined)
    throw new Error(`unknown film "${name}"; have ${Object.keys(films).join(', ')}`);
  await Promise.all([
    ...FONTS.map((f) => document.fonts.load(f, 'Aaα')),
    document.fonts.load('400 40px "Frank Ruhl Libre"', 'א'),
  ]);
  const film = await load();
  document.title = film.title;

  const canvas = document.createElement('canvas');
  canvas.width = film.width;
  canvas.height = film.height;
  const ctx = canvas.getContext('2d');
  if (ctx === null) throw new Error('2d context unavailable');
  const stage = document.createElement('div');
  stage.className = 'stage';
  stage.append(canvas);
  document.body.append(stage);
  return { name, film, canvas, ctx, captions };
};

/** A page that could not start: the error, in place of the page. */
export const showFailure = (e: unknown): void => {
  document.body.innerHTML = `<pre style="color:#f88;padding:24px;white-space:pre-wrap">${String(e instanceof Error ? (e.stack ?? e.message) : e)}</pre>`;
};

/**
 * Mount the player for `films` into the page, choosing a film by
 * `?film=<name>`: the scrubbable preview, `&lookbook` the film's look-book,
 * `&export` the handle the renderer drives. The lab is its own page
 * (`labUrl`); an old `&lab` link goes there.
 */
export const mountPlayer = (films: Films): void => {
  const params = new URLSearchParams(location.search);
  const exporting = params.has('export');
  if (params.has('lab') && !params.has('lookbook') && !exporting) {
    location.replace(`${labUrl(filmName(films))}${location.hash}`);
    return;
  }

  const main = async () => {
    const { name, film, canvas, ctx, captions } = await stageFilm(films);

    if (exporting) {
      document.body.classList.add('export');
      const draw = (i: number) => film.render(ctx, i / film.fps, { captions: captions.on });
      window.__film = {
        width: film.width,
        height: film.height,
        fps: film.fps,
        duration: film.duration,
        frames: Math.ceil(film.duration * film.fps),
        audio: film.audio,
        frame: (i, type = 'image/png') => {
          draw(i);
          return canvasBase64(canvas, type);
        },
        probe: (i) => {
          const sink: ProbeSink = { texts: [], inks: [] };
          film.render(ctx, i / film.fps, { captions: captions.on, probe: sink });
          return sink;
        },
        lookbook: async (type = 'image/jpeg') =>
          canvasBase64((await composeLookbook(film, { captions: captions.on })).canvas, type),
        encoder: (scale) => encoderCheck(canvas, film.fps, scale),
        encode: async (from, to, scale, share) => {
          const chunk = await encodeChunk(draw, canvas, film.fps, from, to, scale, share);
          const master = bytesBase64(chunk.master);
          return chunk.share === undefined
            ? { master }
            : { master, share: bytesBase64(chunk.share) };
        },
        contact: (frames) => canvasBase64(composeContact(draw, canvas, frames), 'image/jpeg'),
        time: (frames) => timeFrames(draw, ctx, frames),
        hash: (frames) => hashFrames(draw, ctx, frames),
      };
      return;
    }
    if (params.has('lookbook')) return mountLookbook(film, name, captions.on);
    mountPreview({ name, film, canvas, ctx, captions });
  };

  main().catch((e: unknown) => {
    showFailure(e);
    throw e;
  });
};

/** The scrubbable preview of a staged film: its bar and timeline, its clock, its keys. */
export const mountPreview = ({ film, canvas, ctx, captions }: Staged): Player => {
  const bar = document.createElement('div');
  bar.className = 'bar';
  bar.innerHTML = `
    <div class="row">
      <button data-act="play">▶︎</button>
      <span class="time"></span>
      <span class="scene"></span>
      <span class="say"></span>
      <button data-act="captions">CC</button>
    </div>
    <div class="track"><div class="head"></div></div>
    <div class="tip" hidden></div>
    <div class="keys">space play · ←/→ frame (shift: 1s) · [ ] scene · c captions · striped = narration estimated, not recorded · ticks: <i class="k-mark"></i>mark <i class="k-cue"></i>cue <i class="k-effect"></i>sound <i class="k-act"></i>music act (hover for the name)</div>`;
  document.body.append(bar);
  const q = <T extends Element>(sel: string) => required<T>(bar, sel);
  const track = q<HTMLDivElement>('.track');
  const head = q<HTMLDivElement>('.head');
  const timeEl = q<HTMLSpanElement>('.time');
  const sceneEl = q<HTMLSpanElement>('.scene');
  const sayEl = q<HTMLSpanElement>('.say');
  const playBtn = q<HTMLButtonElement>('[data-act="play"]');
  const tip = q<HTMLDivElement>('.tip');

  const hue = (i: number) => `hsl(${(i * 47) % 360} 30% 30%)`;
  for (const p of film.placed) {
    const seg = document.createElement('div');
    seg.className = `seg${p.voice.duration > 0 && !p.voice.recorded ? ' estimated' : ''}`;
    seg.style.left = `${(p.start / film.duration) * 100}%`;
    seg.style.width = `${(p.dur / film.duration) * 100}%`;
    seg.style.backgroundColor = hue(p.index);
    seg.innerHTML = `<span>${p.spec.id}</span>`;
    track.append(seg);
  }

  // Marks, cue spans, sound effects and music acts, from the same placements the render uses.
  const pct = (secs: number) => `${(secs / film.duration) * 100}%`;
  for (const tick of timelineTicks(film.placed, Option.fromNullishOr(film.sound))) {
    const el = document.createElement('div');
    el.className = `tick ${tick.kind}`;
    el.dataset['name'] = `${tick.name} · ${tick.at.toFixed(2)}s`;
    el.dataset['tick'] = tick.name;
    el.style.left = pct(tick.at);
    if (tick.kind === 'cue') el.style.width = pct(tick.dur);
    track.insertBefore(el, head);
  }
  track.addEventListener('pointerover', (e) => {
    const name = e.target instanceof HTMLElement ? e.target.dataset['name'] : undefined;
    if (name === undefined) return;
    const t = e.target instanceof HTMLElement ? e.target.getBoundingClientRect() : undefined;
    const b = bar.getBoundingClientRect();
    tip.textContent = name;
    tip.hidden = false;
    tip.style.left = `${(t?.left ?? 0) + (t?.width ?? 0) / 2 - b.left}px`;
    tip.style.top = `${track.offsetTop - 26}px`;
  });
  track.addEventListener('pointerout', () => {
    tip.hidden = true;
  });

  // The narration says what it can play once it knows (a missing master, a
  // play refused until a click), and the time line says it.
  const voice = narration(film.audio, undefined, () => draw());
  const fromHash = Number.parseFloat(location.hash.slice(1));
  let T = Number.isFinite(fromHash) ? Math.min(fromHash, film.duration) : 0;
  let playing = false;
  let wallStart = 0;
  let tStart = 0;
  let rate = 1;
  let loop: LoopRange | undefined;
  const listeners: Array<(T: number) => void> = [];
  let reads: KnobRead[] = [];
  /**
   * `#T` in the URL, so a reload lands on this frame (`tInUrl`): written at
   * most every HASH_MS while T moves, at once when it settles (a seek, the end
   * of a scrub, play or pause, the film's end), and held at the frame a lab
   * write was asked at. A frame loop that wrote it every frame cost a history
   * call per frame.
   */
  const url = tInUrl(
    () => history.replaceState(null, '', `${location.search}#${T.toFixed(2)}`),
    HASH_MS,
  );

  const draw = () => {
    reads = [];
    film.render(ctx, T, { captions: captions.on, knobs: reads });
    for (const listener of listeners) listener(T);
    const cur = film.sceneAt(T);
    head.style.left = `${(T / film.duration) * 100}%`;
    const shownRate = rate === 1 ? '' : ` · ${rate}× muted`;
    const shownLoop =
      loop === undefined ? '' : ` · loop ${loop.from.toFixed(2)}–${loop.to.toFixed(2)}`;
    timeEl.textContent = `${T.toFixed(2)} / ${film.duration.toFixed(1)}s · f${Math.round(T * film.fps)}${shownRate}${shownLoop}${narrationNote(voice.state())}`;
    sceneEl.textContent = cur.spec.id;
    sayEl.textContent = cur.voice.spoken;
    playBtn.textContent = playing ? '❚❚' : '▶︎';
    url.moved();
  };

  /** Show `t`, as a drag passes through it: `#T` follows at most every HASH_MS. */
  const scrub = (t: number) => {
    T = Math.max(0, Math.min(film.duration, t));
    tStart = T;
    wallStart = performance.now();
    voice.seek(T);
    draw();
  };

  /** Show `t`, and settle there: `#T` is written at once. */
  const seek = (t: number) => {
    scrub(t);
    url.settled();
  };

  /**
   * Restart the clock at `T`, and the narration with it at 1× (it follows the
   * clock only there; any other rate mutes it). A narration that cannot play
   * is not asked to (`narration.ts`).
   */
  const rebase = () => {
    tStart = T;
    wallStart = performance.now();
    voice.seek(T);
    if (playing && rate === 1) voice.play();
    else voice.pause();
  };

  const toggle = () => {
    playing = !playing;
    rebase();
    if (playing) requestAnimationFrame(tick);
    draw();
    url.settled();
  };

  const tick = () => {
    if (!playing) return;
    T =
      (rate === 1 ? voice.playingAt() : undefined) ??
      tStart + ((performance.now() - wallStart) / 1000) * rate;
    if (loop !== undefined && (T >= loop.to || T < loop.from - 1 / film.fps)) {
      T = loop.from;
      rebase();
    } else if (T >= film.duration) {
      T = film.duration;
      playing = false;
      voice.pause();
    }
    draw();
    if (!playing) url.settled();
    if (playing) requestAnimationFrame(tick);
  };

  track.addEventListener('pointerdown', (e) => {
    const r = track.getBoundingClientRect();
    const move = (ev: PointerEvent) => scrub(((ev.clientX - r.left) / r.width) * film.duration);
    move(e);
    window.addEventListener('pointermove', move);
    window.addEventListener(
      'pointerup',
      () => {
        window.removeEventListener('pointermove', move);
        url.settled();
      },
      { once: true },
    );
  });
  playBtn.addEventListener('click', toggle);
  q<HTMLButtonElement>('[data-act="captions"]').addEventListener('click', () => {
    captions.on = !captions.on;
    draw();
  });
  canvas.addEventListener('click', toggle);
  window.addEventListener('keydown', (e) => {
    // Typing in a field (the lab's note composer) is not a player key.
    if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
    const step = e.shiftKey ? 1 : 1 / film.fps;
    const cur = film.sceneAt(T);
    if (e.key === ' ') toggle();
    else if (e.key === 'ArrowRight') seek(T + step);
    else if (e.key === 'ArrowLeft') seek(T - step);
    else if (e.key === ']') seek((film.placed[cur.index + 1] ?? cur).start);
    else if (e.key === '[')
      seek(T - cur.start > 0.5 ? cur.start : (film.placed[cur.index - 1] ?? cur).start);
    else if (e.key === 'c') {
      captions.on = !captions.on;
      draw();
    } else return;
    e.preventDefault();
  });
  draw();
  return {
    film,
    canvas,
    ctx,
    captions,
    bar,
    track,
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
    setRate: (r) => {
      rate = r;
      rebase();
      draw();
    },
    setLoop: (range) => {
      loop = range === undefined || range.to <= range.from ? undefined : range;
      draw();
    },
    redraw: draw,
    knobReads: () => reads,
    onDraw: (listener) => {
      listeners.push(listener);
      return () => {
        const at = listeners.indexOf(listener);
        if (at >= 0) listeners.splice(at, 1);
      };
    },
  };
};
