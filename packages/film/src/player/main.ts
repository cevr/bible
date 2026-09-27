// The browser player. An app's entry calls `mountPlayer(films)` with its film
// registry. Preview mode is a scrubbable player; export mode (`?export`) hides
// the chrome and hands `window.__film` to the renderer.

import type { Film, KnobRead } from '../canvas/film.ts';
import type { ProbeSink } from '../canvas/probe.ts';
import type { Probed } from '../core/schema.ts';
import { timelineTicks } from '../core/ticks.ts';
import { Option } from 'effect';
import { mountLab } from './lab.ts';
import { composeContact } from './contact.ts';
import { type EncoderCheck, encodeChunk, encoderCheck } from './encode.ts';
import { composeLookbook, mountLookbook } from './lookbook.ts';
import { hashFrames, timeFrames } from './timing.ts';

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

/** Bytes as base64: what the export handle hands back across `page.evaluate`. */
const base64 = (bytes: Uint8Array) => bytes.toBase64();

/** A canvas as base64 PNG or JPEG. */
const encode = async (canvas: HTMLCanvasElement, type: 'image/png' | 'image/jpeg') => {
  const blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, type, 0.95));
  if (blob === null) throw new Error('toBlob failed');
  return base64(new Uint8Array(await blob.arrayBuffer()));
};

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
  seek(T: number): void;
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
  /** Called after every frame the preview draws. */
  onDraw(listener: (T: number) => void): void;
}

/**
 * Mount the player for `films` into the page, choosing a film by
 * `?film=<name>`. `&lab` adds the lab: notes on frames (`film lab`).
 */
export const mountPlayer = (films: Record<string, () => Promise<Film>>): void => {
  const params = new URLSearchParams(location.search);
  const name = params.get('film') ?? Object.keys(films)[0] ?? '';
  const exporting = params.has('export');
  const captions = { on: params.get('captions') !== '0' };

  const main = async () => {
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
          return encode(canvas, type);
        },
        probe: (i) => {
          const sink: ProbeSink = { texts: [], inks: [] };
          film.render(ctx, i / film.fps, { captions: captions.on, probe: sink });
          return sink;
        },
        lookbook: async (type = 'image/jpeg') =>
          encode((await composeLookbook(film, { captions: captions.on })).canvas, type),
        encoder: (scale) => encoderCheck(canvas, film.fps, scale),
        encode: async (from, to, scale, share) => {
          const chunk = await encodeChunk(draw, canvas, film.fps, from, to, scale, share);
          const master = base64(chunk.master);
          return chunk.share === undefined ? { master } : { master, share: base64(chunk.share) };
        },
        contact: (frames) => encode(composeContact(draw, canvas, frames), 'image/jpeg'),
        time: (frames) => timeFrames(draw, ctx, frames),
        hash: (frames) => hashFrames(draw, ctx, frames),
      };
      return;
    }
    if (params.has('lookbook')) return mountLookbook(film, name, captions.on);
    const player = preview(film, canvas, ctx, captions);
    if (params.has('lab')) mountLab(player, name);
  };

  main().catch((e: unknown) => {
    document.body.innerHTML = `<pre style="color:#f88;padding:24px;white-space:pre-wrap">${String(e instanceof Error ? (e.stack ?? e.message) : e)}</pre>`;
    throw e;
  });
};

const preview = (
  film: Film,
  canvas: HTMLCanvasElement,
  ctx: CanvasRenderingContext2D,
  captions: { on: boolean },
): Player => {
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
  const q = <T extends Element>(sel: string) => {
    const el = bar.querySelector<T & Element>(sel);
    if (el === null) throw new Error(`missing ${sel}`);
    return el;
  };
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

  const audio = film.audio === undefined ? undefined : new Audio(film.audio);
  const fromHash = Number.parseFloat(location.hash.slice(1));
  let T = Number.isFinite(fromHash) ? Math.min(fromHash, film.duration) : 0;
  let playing = false;
  let wallStart = 0;
  let tStart = 0;
  let rate = 1;
  let loop: LoopRange | undefined;
  /** The narration follows the clock only at 1×. */
  const audible = () => audio !== undefined && rate === 1;
  const listeners: Array<(T: number) => void> = [];
  let reads: KnobRead[] = [];

  const draw = () => {
    reads = [];
    film.render(ctx, T, { captions: captions.on, knobs: reads });
    for (const listener of listeners) listener(T);
    const cur = film.sceneAt(T);
    head.style.left = `${(T / film.duration) * 100}%`;
    const shownRate = rate === 1 ? '' : ` · ${rate}× muted`;
    const shownLoop =
      loop === undefined ? '' : ` · loop ${loop.from.toFixed(2)}–${loop.to.toFixed(2)}`;
    timeEl.textContent = `${T.toFixed(2)} / ${film.duration.toFixed(1)}s · f${Math.round(T * film.fps)}${shownRate}${shownLoop}`;
    sceneEl.textContent = cur.spec.id;
    sayEl.textContent = cur.voice.spoken;
    playBtn.textContent = playing ? '❚❚' : '▶︎';
    history.replaceState(null, '', `${location.search}#${T.toFixed(2)}`);
  };

  const seek = (t: number) => {
    T = Math.max(0, Math.min(film.duration, t));
    tStart = T;
    wallStart = performance.now();
    if (audio !== undefined) audio.currentTime = T;
    draw();
  };

  /** Restart the clock at `T`, and the narration with it when it is audible. */
  const rebase = () => {
    tStart = T;
    wallStart = performance.now();
    if (audio === undefined) return;
    audio.currentTime = T;
    if (playing && audible()) void audio.play();
    else audio.pause();
  };

  const toggle = () => {
    playing = !playing;
    rebase();
    if (playing) requestAnimationFrame(tick);
    draw();
  };

  const tick = () => {
    if (!playing) return;
    T =
      audible() && audio !== undefined && !audio.paused
        ? audio.currentTime
        : tStart + ((performance.now() - wallStart) / 1000) * rate;
    if (loop !== undefined && (T >= loop.to || T < loop.from - 1 / film.fps)) {
      T = loop.from;
      rebase();
    } else if (T >= film.duration) {
      T = film.duration;
      playing = false;
      audio?.pause();
    }
    draw();
    if (playing) requestAnimationFrame(tick);
  };

  track.addEventListener('pointerdown', (e) => {
    const r = track.getBoundingClientRect();
    const move = (ev: PointerEvent) => seek(((ev.clientX - r.left) / r.width) * film.duration);
    move(e);
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', () => window.removeEventListener('pointermove', move), {
      once: true,
    });
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
    },
  };
};
