// The browser player, framework-free. The render page (an app's `index.html`,
// `?film=<name>&export`) calls `mountRender(films)`: the film with no chrome,
// and `window.__film` for the renderer. The studio's pages with a film on
// them stage it here (`stageFilm`) and mount the scrubbable preview
// (`mountPreview`) in their Solid shell: the lab (`@bible/film/lab`), and a
// film's Scenes and Play pages (`mountPlay`, lab/play-mount.tsx). So the
// render page never loads Solid.

import type { Film, KnobRead, RenderOptions, ShownEdit } from '../canvas/film.ts';
import type { ProbeSink } from '../canvas/probe.ts';
import type { ExportHandle } from '../core/export-handle.ts';
import { timelineTicks } from '../core/ticks.ts';
import { timecode } from '../core/time.ts';
import { Effect, Option } from 'effect';
import type { Fiber } from 'effect';
import { parseHref } from '@bible/url-state';
import { filmOfPage } from '../core/api.ts';
import { addressOn, hostOf, monotonicMs, onTraverse } from '../browser/host.ts';
import type { Host } from '../browser/host.ts';
import { BrowserHost } from '../browser/host-browser.ts';
import { Frames } from '../browser/frames.ts';
import { LONG_PRESS_DELAY, claimPress } from '@bible/ui/press';
import { BY_BUTTON } from '../command/command.ts';
import type { Hub } from '../command/hub.ts';
import { chordLabel } from '../command/keymap.ts';
import { Pointer } from '../browser/pointer.ts';
import { composeContact } from './contact.ts';
import { bytesBase64, canvasBase64, canvasLuma, required } from './dom.ts';
import { encodeChunk, encoderChoice } from './encode.ts';
import { composeLookbook } from './lookbook.ts';
import { narration, narrationNote } from './narration.ts';
import { tInUrl, type TimeInUrl } from './t-in-url.ts';
import { timersOn } from './throttle.ts';
import { lookFrames } from './look-frames.ts';
import { legendCommand, transportCommands } from './transport.ts';

/** The longest `#t=` in the URL trails the frame shown while it plays. */
const HASH_MS = 250;

/** How long a tick's name stays after the finger that held it lifts, in ms. */
const TIP_READ_MS = 1500;

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
  document.body.innerHTML = `<pre style="color:var(--state-findings);padding:24px;white-space:pre-wrap">${String(e instanceof Error ? (e.stack ?? e.message) : e)}</pre>`;
};

/**
 * Mount the render page for `films` (`?film=<name>&export`): the film
 * staged with no chrome and no UI face, drawing only the film's own faces,
 * and the handle the renderer drives on `window.__film`.
 */
export const mountRender = (films: Films): void => {
  const host = hostOf(BrowserHost.layer);
  stageFilm(films, addressOn(host).href())
    .then((staged) => {
      document.body.classList.add('export');
      window.__film = exportHandle(staged, host);
    })
    .catch((e: unknown) => {
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

/**
 * The scrubbable preview of a staged film: its bar and timeline, its clock,
 * and its transport, registered as commands with the page's `hub` (whose
 * keymap binds their keys; the bar's legend says the keys bound now). The
 * legend is hidden at rest (UR-114, `legendCommand`): on the player's own
 * page `?` or the bar's ? button shows it, in the lab ⌘K or the page's menu.
 */
export const mountPreview = (
  { film, canvas, ctx, captions }: Staged,
  host: Host,
  time: TimeInUrl,
  hub: Hub,
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
    <div class="keys" hidden><span class="bound"></span> · striped = narration estimated, not recorded · ticks: <i class="k-mark"></i>mark <i class="k-cue"></i>cue <i class="k-effect"></i>sound <i class="k-act"></i>music act (hover or long-press for the name)</div>`;
  document.body.append(bar);
  const q = <T extends Element>(sel: string) => required<T>(bar, sel);
  const track = q<HTMLDivElement>('.track');
  const head = q<HTMLDivElement>('.head');
  const timeEl = q<HTMLSpanElement>('.time');
  const sceneEl = q<HTMLSpanElement>('.scene');
  const sayEl = q<HTMLSpanElement>('.say');
  const playBtn = q<HTMLButtonElement>('[data-act="play"]');
  const tip = q<HTMLDivElement>('.tip');

  const hue = (i: number) => `hsl(${(i * 47) % 360} var(--scene-sat) var(--scene-light))`;
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
    el.dataset['name'] = `${tick.name} · ${timecode(tick.at, film.fps)}`;
    el.dataset['tick'] = tick.name;
    el.style.left = pct(tick.at);
    if (tick.kind === 'cue') el.style.width = pct(tick.dur);
    track.insertBefore(el, head);
  }
  // A tick's name: shown while a mouse is over it, or once a finger has held
  // it (UR-115) as long as a long press takes, without moving off into a
  // scrub (the press stays free until a drag claims it, `@bible/ui/press`).
  const showTip = (target: EventTarget | null) => {
    const name = target instanceof HTMLElement ? target.dataset['name'] : undefined;
    if (name === undefined) return;
    const t = target instanceof HTMLElement ? target.getBoundingClientRect() : undefined;
    const b = bar.getBoundingClientRect();
    tip.textContent = name;
    tip.hidden = false;
    tip.style.left = `${(t?.left ?? 0) + (t?.width ?? 0) / 2 - b.left}px`;
    tip.style.top = `${track.offsetTop - 26}px`;
  };
  track.addEventListener('pointerover', (e) => {
    if (e.pointerType === 'mouse') showTip(e.target);
  });
  track.addEventListener('pointerout', (e) => {
    if (e.pointerType === 'mouse') tip.hidden = true;
  });
  // A finger held on a tick (not a mouse, which hovers) names it as the
  // long press would open a menu: the press is claimed for the name, so it
  // scrubs no further; lifted, the name stays a moment to be read.
  const TICK_NAME = Symbol('tick-name');
  const tipTimers = timersOn(host);
  const holdTick = (e: PointerEvent): (() => void) => {
    const held = e.target;
    const named = held instanceof HTMLElement && held.dataset['name'] !== undefined;
    if (e.pointerType === 'mouse' || !named) return () => undefined;
    let shown = false;
    const timer = tipTimers.set(() => {
      shown = claimPress(e.pointerId, TICK_NAME, document);
      if (shown) showTip(held);
    }, LONG_PRESS_DELAY);
    return () => {
      tipTimers.clear(timer);
      if (shown) tipTimers.set(() => (tip.hidden = true), TIP_READ_MS);
    };
  };

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
      loop === undefined
        ? ''
        : ` · loop ${timecode(loop.from, film.fps)}–${timecode(loop.to, film.fps)}`;
    timeEl.textContent = `${timecode(T, film.fps)} / ${timecode(film.duration, film.fps)}${shownRate}${shownLoop}${narrationNote(voice.state())}`;
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
    const letGo = holdTick(e);
    Effect.runForkWith(host)(
      Pointer.use((pointer) =>
        pointer.drag(e, {
          move,
          end: () => {
            letGo();
            url.settled();
          },
        }),
      ),
    );
  });
  playBtn.addEventListener('click', toggle);
  q<HTMLButtonElement>('[data-act="captions"]').addEventListener('click', () => {
    captions.on = !captions.on;
    draw();
  });
  canvas.addEventListener('click', toggle);
  // The transport, as the page's commands: its keys are the page's keymap's.
  hub.commands.register(
    ...transportCommands({
      toggle,
      stepFrames: (frames) => seek(T + frames / film.fps),
      nextScene: () => {
        const cur = film.sceneAt(T);
        seek((film.placed[cur.index + 1] ?? cur).start);
      },
      previousScene: () => {
        const cur = film.sceneAt(T);
        seek(T - cur.start > 0.5 ? cur.start : (film.placed[cur.index - 1] ?? cur).start);
      },
      toggleCaptions: () => {
        captions.on = !captions.on;
        draw();
      },
    }),
  );
  hub.refine((now) => ({ ...now, playing }));
  // The legend says the keys bound now: a rebound key reads as rebound.
  const bound = q<HTMLSpanElement>('.bound');
  const keyOf = (id: string) =>
    hub
      .keysOf(id)
      .slice(0, 1)
      .map((k) => chordLabel(k, hub.mac))[0] ?? '—';
  const legend = () => {
    bound.textContent = [
      `${keyOf('play.toggle')} play`,
      `${keyOf('play.frame-previous')}/${keyOf('play.frame-next')} frame (shift: 10)`,
      `${keyOf('play.scene-previous')} ${keyOf('play.scene-next')} scene`,
      `${keyOf('view.captions')} captions`,
    ].join(' · ');
  };
  legend();
  hub.subscribe(legend);
  // The legend, hidden at rest; on the player's own page the bar's ? button is a phone's way to it.
  const keysLine = q<HTMLDivElement>('.keys');
  const page = hub.context().page;
  const legendButton = document.createElement('button');
  legendButton.dataset['act'] = 'legend';
  legendButton.textContent = '?';
  legendButton.title = 'Show or hide the keys and the legend';
  const toggleLegend = () => {
    keysLine.hidden = !keysLine.hidden;
    legendButton.setAttribute('aria-expanded', String(!keysLine.hidden));
  };
  // The lab's transport steps a frame at a time by touch too (AA-8): the
  // frame keys' own commands, as a pair beside play.
  if (page === 'lab') {
    const step = (id: string, glyph: string, label: string) => {
      const button = document.createElement('button');
      button.dataset['act'] = id;
      button.textContent = glyph;
      button.setAttribute('aria-label', label);
      button.title = `${label} (${keyOf(id)})`;
      button.addEventListener('click', () => hub.invokeId(id, BY_BUTTON));
      return button;
    };
    playBtn.after(
      step('play.frame-previous', '◀', 'Previous frame'),
      step('play.frame-next', '▶', 'Next frame'),
    );
  }
  if (page === 'player') {
    legendButton.setAttribute('aria-expanded', 'false');
    legendButton.addEventListener('click', toggleLegend);
    q<HTMLDivElement>('.row').append(legendButton);
  }
  hub.commands.register(
    legendCommand(page, { shown: () => !keysLine.hidden, toggle: toggleLegend }),
  );
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
