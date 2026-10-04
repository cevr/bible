// The browser player. An app's entry calls `mountPlayer(films)` with its film
// registry. It reads its place from the URL (`Places`, core/api.ts): a film's
// play page is a scrubbable player, its scenes page the look-book, and the
// export page (`?film=<name>&export`) hides the chrome and hands
// `window.__film` to the renderer. Framework-free: the
// lab (`@bible/film/lab`) is its own page, which stages the film and mounts
// this preview under its Solid panels, so the render page never loads Solid.

import type { Film, KnobRead, RenderOptions, ShownEdit } from '../canvas/film.ts';
import type { ProbeSink } from '../canvas/probe.ts';
import type { ExportHandle } from '../core/export-handle.ts';
import { timelineTicks } from '../core/ticks.ts';
import { Effect, Option } from 'effect';
import type { Fiber } from 'effect';
import { Place, parseHref } from '@bible/url-state';
import { Places, filmOfPage, legacyPlace, pageHref } from '../core/api.ts';
import { addressOn, hostOf, monotonicMs, onTraverse } from '../browser/host.ts';
import type { Host } from '../browser/host.ts';
import { BrowserHost } from '../browser/host-browser.ts';
import { Frames } from '../browser/frames.ts';
import { Keys, type KeyPress } from '../browser/keys.ts';
import { Pointer } from '../browser/pointer.ts';
import { composeContact } from './contact.ts';
import { bytesBase64, canvasBase64, canvasLuma, required } from './dom.ts';
import { encodeChunk, encoderChoice } from './encode.ts';
import { composeLookbook, mountLookbook } from './lookbook.ts';
import { narration, narrationNote } from './narration.ts';
import { onTheMs, tInUrl, type TimeInUrl } from './t-in-url.ts';
import { timersOn } from './throttle.ts';
import { lookFrames } from './look-frames.ts';

/** The longest `#t=` in the URL trails the frame shown while it plays. */
const HASH_MS = 250;

/**
 * Every face the page declares (its stylesheets' `@font-face` rules, each
 * unicode-range subset its own face), loaded: text measures true from the
 * first frame whatever families and scripts a film draws (a short's hook and
 * captions are measured once, on the first frame that draws them), and the
 * engine names none of them. A face that will not load fails the page.
 */
const loadFonts = () => Promise.all(Array.from(document.fonts, (face) => face.load()));

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
   * Play at `rate` × (0.25, 0.5, 1). The narration plays only at 1×; at any
   * other rate the clock runs on its own and the audio is paused (muted).
   */
  setRate(rate: number): void;
  /** Repeat `range` while playing (none to stop repeating). */
  setLoop(range: LoopRange | undefined): void;
  /** Draw the frame shown now again. */
  redraw(): void;
  /**
   * Draw the frame at `T` into `ctx` as the preview shows it: its captions
   * and the lab's edits, with `over` (an edit per scene) on top of them. The
   * one spelling of "the frame as the lab shows it": a note's still, the
   * onion and the HEAD layer draw through it.
   */
  renderShown(
    ctx: CanvasRenderingContext2D,
    T: number,
    over?: ReadonlyMap<string, ShownEdit>,
  ): void;
  /**
   * Draw with `edits` (`RenderOptions.edits`) from now on, starting with the
   * frame shown now: none until the lab shows some; the lab holds them, and
   * hands over each change whole.
   */
  showEdits(edits: ReadonlyMap<string, ShownEdit>): void;
  /** Every knob the last frame drawn read, and how (`KnobRead`). */
  knobReads(): ReadonlyArray<KnobRead>;
  /** Called after every frame the preview draws, until the returned function is called. */
  onDraw(listener: (T: number) => void): () => void;
}

/** An app's film registry: each film's name and its loader. */
export type Films = Record<string, () => Promise<Film>>;

/** A page's film, loaded and on the stage: its name, its canvas and the captions switch. */
interface Staged {
  readonly name: string;
  readonly film: Film;
  readonly canvas: HTMLCanvasElement;
  readonly ctx: CanvasRenderingContext2D;
  readonly captions: { on: boolean };
}

/**
 * The film the page at `href` is on: its path's (`/films/<film>/…`), else an
 * export page's `?film=<name>`, else the registry's first.
 */
const filmName = (href: string, films: Films): string =>
  Option.getOrElse(
    Option.orElse(filmOfPage(href), () =>
      Option.fromNullishOr(parseHref(href).searchParams.get('film')),
    ),
    () => Object.keys(films)[0] ?? '',
  );

/**
 * Load the film of the page at `href` (every font the page declares first,
 * so text measures true), title the page, and put the film's canvas on the
 * stage; its captions are on unless an export page says `captions=0`.
 */
export const stageFilm = async (films: Films, href: string): Promise<Staged> => {
  const name = filmName(href, films);
  const captions = { on: parseHref(href).searchParams.get('captions') !== '0' };
  const load = films[name];
  if (load === undefined)
    throw new Error(`unknown film "${name}"; have ${Object.keys(films).join(', ')}`);
  await loadFonts();
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

/** The play page's time: `#t=`, in film seconds. */
const playTime = (name: string, host: Host): TimeInUrl => {
  const address = addressOn(host);
  return {
    at: (href) =>
      Option.getOrElse(
        Option.flatMap(Place.decode(Places.play, href), (v) => v.hash.t),
        () => 0,
      ),
    write: (T) => address.replace(pageHref.play(name, Option.some(onTheMs(T)))),
  };
};

/**
 * Mount the player for `films` into the page: a film's scenes (its
 * look-book, `/films/<film>/scenes`), its preview (`/films/<film>/play#t=`),
 * or, with `?film=<name>&export`, the handle the renderer drives. A link
 * whose old form the server could not see (a bare `#<seconds>`) is replaced
 * by its place first.
 */
export const mountPlayer = (films: Films): void => {
  const host = hostOf(BrowserHost.layer);
  const address = addressOn(host);
  Option.map(legacyPlace(address.href()), address.replace);
  const href = address.href();
  const exporting = parseHref(href).searchParams.has('export');
  const lookbook = [Places.scenes, Places.scene].some((place) =>
    Option.isSome(Place.decode(place, href)),
  );

  const main = async () => {
    const staged = await stageFilm(films, href);
    const { name, film, captions } = staged;

    if (exporting) {
      document.body.classList.add('export');
      window.__film = exportHandle(staged, host);
      return;
    }
    if (lookbook) return mountLookbook(film, name, captions.on, host);
    mountPreview(staged, host, playTime(name, host));
  };

  main().catch((e: unknown) => {
    showFailure(e);
    throw e;
  });
};

/**
 * The handle the tools drive a staged film through (`ExportHandle`,
 * core/export-handle.ts). Every draw is timed the same way (`drawn`): the
 * frame drawn, then rastered by a one-pixel read before the clock stops, so
 * the canvas's recorded drawing is paid for in the draw and not later by
 * whatever reads the canvas next (an encoder, `toBlob`).
 */
const exportHandle = ({ film, canvas, ctx, captions }: Staged, host: Host): ExportHandle => {
  /** The page clock in ms (`monotonicMs`): what every draw and encode is timed by. */
  const nowMs = monotonicMs(host);
  const draw = (i: number) => film.render(ctx, i / film.fps, { captions: captions.on });
  /** Draw frame `i` and raster it: the ms it took. */
  const drawn = (i: number) => {
    const began = nowMs();
    draw(i);
    ctx.getImageData(0, 0, 1, 1);
    return nowMs() - began;
  };
  return {
    info: {
      width: film.width,
      height: film.height,
      fps: film.fps,
      duration: film.duration,
      frames: Math.ceil(film.duration * film.fps),
      audio: film.audio,
    },
    frame: (i, type) => {
      draw(i);
      return canvasBase64(canvas, type);
    },
    probe: (i) => {
      const sink: ProbeSink = { texts: [], inks: [] };
      film.render(ctx, i / film.fps, { captions: captions.on, probe: sink });
      return sink;
    },
    lookbook: async (type) =>
      canvasBase64((await composeLookbook(film, { captions: captions.on })).canvas, type),
    encoder: (scale, share, candidates) =>
      encoderChoice(canvas, film.fps, scale, share, candidates),
    encode: async (from, to, scale, share, encoder) => {
      const began = nowMs();
      let drawing = 0;
      const chunk = await encodeChunk(
        (i) => {
          drawing += drawn(i);
        },
        canvas,
        film.fps,
        from,
        to,
        scale,
        share,
        encoder,
      );
      const master = bytesBase64(chunk.master);
      const copy = chunk.share === undefined ? {} : { share: bytesBase64(chunk.share) };
      return { master, ...copy, timing: { draw: drawing, page: nowMs() - began } };
    },
    contact: (frames) => canvasBase64(composeContact(draw, canvas, frames), 'image/jpeg'),
    look: (frames, w, h) => {
      const shot = lookFrames(
        (i, probe) => film.render(ctx, i / film.fps, { captions: false, probe }),
        canvas,
        frames,
        w,
        h,
      );
      return { thumbs: bytesBase64(shot.thumbs), faces: shot.faces, hands: shot.hands };
    },
    luma: (i, area) => {
      draw(i);
      return canvasLuma(canvas, area);
    },
    drawTimes: (frames) => frames.map(drawn),
  };
};

/** The scrubbable preview of a staged film: its bar and timeline, its clock, its keys. */
export const mountPreview = (
  { film, canvas, ctx, captions }: Staged,
  host: Host,
  time: TimeInUrl,
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
  const voice = narration(film.audio, host, () => draw());
  let T = Math.min(Math.max(time.at(addressOn(host).href()), 0), film.duration);
  let playing = false;
  let wallStart = 0;
  let tStart = 0;
  let rate = 1;
  /** The play loop, while the film plays (`Frames.loop`). */
  let running = Option.none<Fiber.Fiber<void>>();
  /** The page clock's monotonic time in ms: the host's `Clock`. */
  const nowMs = monotonicMs(host);
  let loop: LoopRange | undefined;
  const listeners: Array<(T: number) => void> = [];
  let reads: KnobRead[] = [];
  /**
   * T in the URL (`time`, the page's own place), so a reload lands on this
   * frame (`tInUrl`): written at most every HASH_MS while T moves, at once
   * when it settles (a seek, the end of a scrub, play or pause, the film's
   * end), and held at the frame a lab write was asked at. A frame loop that
   * wrote it every frame cost a history call per frame.
   */
  const url = tInUrl(() => time.write(T), HASH_MS, timersOn(host));

  /** The lab's edits, drawn over the film's own (`Player.showEdits`). */
  let edits: ReadonlyMap<string, ShownEdit> = new Map();

  /** How the preview draws a frame: its captions and the lab's edits, with `extra` options. */
  const shownOptions = (extra: RenderOptions = {}): RenderOptions => ({
    captions: captions.on,
    edits,
    ...extra,
  });

  const draw = () => {
    reads = [];
    film.render(ctx, T, shownOptions({ knobs: reads }));
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

  /** Show `t`, as a drag passes through it: `#t=` follows at most every HASH_MS. */
  const scrub = (t: number) => {
    T = Math.max(0, Math.min(film.duration, t));
    tStart = T;
    wallStart = nowMs();
    voice.seek(T);
    draw();
  };

  /** Show `t`, and settle there: `#t=` is written at once. */
  const seek = (t: number) => {
    scrub(t);
    url.settled();
  };

  // Back or Forward shows the frame the entry landed on keeps, as the lab
  // shows its pick: the URL is already there, so a write still waiting with
  // the frame before is dropped rather than written over it.
  onTraverse(host, (href) => {
    scrub(time.at(href));
    url.landed();
  });

  /**
   * Restart the clock at `T`, and the narration with it at 1× (it follows the
   * clock only there; any other rate mutes it). A narration that cannot play
   * is not asked to (`narration.ts`).
   */
  const rebase = () => {
    tStart = T;
    wallStart = nowMs();
    voice.seek(T);
    if (playing && rate === 1) voice.play(() => T);
    else voice.pause();
  };

  const toggle = () => {
    playing = !playing;
    // Play at the film's last frame starts it over: from its loop's start, in a loop.
    if (playing && T >= film.duration - 1 / film.fps) T = loop === undefined ? 0 : loop.from;
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
    T =
      (rate === 1 ? voice.playingAt() : undefined) ??
      tStart + ((nowMs() - wallStart) / 1000) * rate;
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
    return playing;
  };

  // A drag on the track scrubs; it settles where it ends, lifted or taken by the browser (a page pan).
  track.addEventListener('pointerdown', (e) => {
    const r = track.getBoundingClientRect();
    const move = (ev: PointerEvent) => scrub(((ev.clientX - r.left) / r.width) * film.duration);
    move(e);
    Effect.runForkWith(host)(
      Pointer.use((pointer) => pointer.drag(e, { move, end: () => url.settled() })),
    );
  });
  playBtn.addEventListener('click', toggle);
  q<HTMLButtonElement>('[data-act="captions"]').addEventListener('click', () => {
    captions.on = !captions.on;
    draw();
  });
  canvas.addEventListener('click', toggle);
  // Typing in a field (the lab's note composer, the microphone picker) is not a player key.
  const playerKey = (e: KeyPress): boolean => {
    if (e.typing) return false;
    const step = e.shift ? 1 : 1 / film.fps;
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
    } else return false;
    return true;
  };
  Effect.runForkWith(host)(Keys.use((keys) => keys.listen(playerKey)));
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
    renderShown: (into, at, over = new Map()) =>
      film.render(into, at, shownOptions({ edits: new Map([...edits, ...over]) })),
    showEdits: (next) => {
      edits = next;
      draw();
    },
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
