// The browser player, framework-free. A page with a film on it stages it
// here (`stageFilm`): the render page (`render.ts`, `mountRender`), and the
// studio's pages, which mount the scrubbable preview (`mountPreview`) in
// their Solid shell: the lab (`@bible/film/lab`), and a film's Scenes and
// Play pages (`mountPlay`, lab/play-mount.tsx). So the render page never
// loads Solid, and the studio's pages never load the encoder.

import type { Film, KnobRead, RenderOptions, ShownEdit } from '../canvas/film.ts';
import { timelineTicks } from '../core/ticks.ts';
import { timecode } from '../core/time.ts';
import { Cause, Effect, Option } from 'effect';
import type { Fiber } from 'effect';
import { parseHref } from '@bible/url-state';
import { TIME_EVERY_MS, filmOfPage } from '../core/api.ts';
import { addressOn, monotonicMs, onTraverse } from '../browser/host.ts';
import type { Host } from '../browser/host.ts';
import { makeClock } from '../browser/media-clock.ts';
import { Frames } from '../browser/frames.ts';
import { LONG_PRESS_DELAY, claimPress } from '@bible/ui/press';
import { BY_BUTTON } from '../command/command.ts';
import { type Hub, titledNow } from '../command/hub.ts';
import { Pointer, Surface } from '../browser/pointer.ts';
import { required } from './dom.ts';
import { pictureFacesWait } from './face.ts';
import { narration, narrationNote } from './narration.ts';
import { tInUrl, type TimeInUrl } from './t-in-url.ts';
import { timersOn } from './throttle.ts';
import { legendCommand, legendHtml, ticksCommand, transportCommands } from './transport.ts';
import { makeHud } from './hud.ts';
import { keptText } from '../browser/storage.ts';
import { ViewerStore } from '../browser/storage-browser.ts';
import * as AtomRegistry from 'effect/reactivity/AtomRegistry';

/** How long a tick's name stays after the finger that held it lifts, in ms. */
const TIP_READ_MS = 1500;

/** Whether the viewer shows the ticks on Play (`on`; none or `off`: hidden), kept in this browser. */
const KEPT_TICKS = keptText(ViewerStore, 'film-studio.ticks');

/** Play's HUD: the bar, the shell's header and its tab bar (`player.css` fades them together). */
const HUD_PARTS = '.bar, .sh-header, .sh-pagebar';

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
   * onion and the HEAD layer draw through it. Nothing is drawn until the
   * film's faces have loaded (`drawable`).
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
  /**
   * Whether the preview draws frames: once the faces its film draws in have
   * loaded (`pictureFacesWait`). Until then its bar shows where the film is,
   * and its canvas nothing.
   */
  drawable(): boolean;
  /** Called after every frame the preview draws (none while it is not `drawable`), until the returned function is called. */
  onDraw(listener: (T: number) => void): () => void;
  /**
   * The bar is on a film's Play page, in `part` (the shell's Play part):
   * its HUD fades while the film plays and comes back at the viewer's input,
   * until the returned function is called.
   */
  playOn(part: HTMLElement): () => void;
}

/** An app's film registry: each film's name and its loader. */
export type Films = Record<string, () => Promise<Film>>;

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
  const film = await load();

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
 * The scrubbable preview of a staged film: its bar and timeline, its clock,
 * and its transport, registered as commands with the page's `hub` (whose
 * keymap binds their keys, which the `?` sheet lists). Its legend (the
 * stripes and the ticks) is hidden at rest: in the lab ⌘K or the page's menu
 * shows it (`legendCommand`); on a film's Play page it shows with the ticks,
 * once the viewer turns them on (`ticksCommand`), and the HUD fades while the
 * film plays (`hud.ts`). The lab's transport reads in the scene's time (the
 * header keeps the film's), and its captions are the view menu's and `c`.
 * Its film's faces failing to load fail the page (`fail`: it ends, and says
 * why).
 */
export const mountPreview = (
  { film, canvas, ctx, captions }: Staged,
  host: Host,
  time: TimeInUrl,
  hub: Hub,
  fail: (why: string) => Effect.Effect<void>,
): Player => {
  const bar = document.createElement('div');
  bar.className = 'bar';
  bar.innerHTML = `
    <div class="row">
      <button class="sh-tool" data-act="play">▶︎</button>
      <span class="time"><span class="tc"></span><span class="of"></span><span class="narration" role="status"></span></span>
      <span class="scene"></span>
      <span class="say"></span>
      <button class="sh-tool" data-act="captions">CC</button>
    </div>
    <div class="track"><div class="head"></div></div>
    <div class="tip" hidden></div>
    <div class="keys" hidden>${legendHtml()}</div>`;
  document.body.append(bar);
  const q = <T extends Element>(sel: string) => required<T>(bar, sel);
  const track = q<HTMLDivElement>('.track');
  const head = q<HTMLDivElement>('.head');
  const timecodeEl = q<HTMLSpanElement>('.tc');
  const lengthEl = q<HTMLSpanElement>('.of');
  const narrationEl = q<HTMLSpanElement>('.narration');
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
  // A lifted finger's name lingers on one hide timer: a name shown since
  // drops it, so an older linger never hides a newer name.
  const tipTimers = timersOn(host);
  let lingering = Option.none<number>();
  const hideLater = () => {
    lingering = Option.some(tipTimers.set(() => (tip.hidden = true), TIP_READ_MS));
  };
  const showTip = (target: EventTarget | null) => {
    const name = target instanceof HTMLElement ? target.dataset['name'] : undefined;
    if (name === undefined) return;
    Option.map(lingering, tipTimers.clear);
    lingering = Option.none();
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
      if (shown) hideLater();
    };
  };

  // The narration says what it can play once it knows (a missing master, a
  // play refused until a click), and the row says it: its own piece, apart
  // from the length the docked phone row hides, and a polite status written
  // only as the narration changes, so a screen reader hears it once (WCAG 4.1.3).
  const voice = narration(film.audio, host, (state) => {
    narrationEl.textContent = narrationNote(state);
    draw();
  });
  let T = Math.min(Math.max(time.at(addressOn(host).href()), 0), film.duration);
  let playing = false;
  let rate = 1;
  /** The play loop, while the film plays (`Frames.loop`). */
  let running = Option.none<Fiber.Fiber<void>>();
  /**
   * The preview's own clock, over the host's monotonic `Clock` (seconds):
   * what T follows off the narration (at any rate but 1×, or with no
   * narration to play). It stands while the film does; a seek or a rate
   * change starts it again from T.
   */
  const nowMs = monotonicMs(host);
  const clock = makeClock(() => nowMs() / 1000);
  let loop: LoopRange | undefined;
  const listeners: Array<(T: number) => void> = [];
  let reads: KnobRead[] = [];
  /**
   * T in the URL (`time`, the page's own place), so a reload lands on this
   * frame (`tInUrl`): written at most every `TIME_EVERY_MS` (the time key's
   * throttle, `core/api.ts`) while T moves, at once
   * when it settles (the end of a scrub, play or pause, the film's end) or
   * jumps (a seek), and held at the frame a lab write was asked at. A frame
   * loop that wrote it every frame cost a history call per frame.
   */
  const url = tInUrl((cause) => time.write(T, cause), TIME_EVERY_MS, timersOn(host));

  /** The lab's edits, drawn over the film's own (`Player.showEdits`). */
  let edits: ReadonlyMap<string, ShownEdit> = new Map();

  /** How the preview draws a frame: its captions and the lab's edits, with `extra` options. */
  const shownOptions = (extra: RenderOptions = {}): RenderOptions => ({
    captions: captions.on,
    edits,
    ...extra,
  });

  /**
   * Whether frames are drawn: once the faces the film draws in have loaded
   * (`pictureFacesWait`), at once when they are in already. Until then the
   * bar shows where the film is, its canvas nothing, so no frame is ever
   * drawn in a fallback face.
   */
  let drawable = false;

  const page = hub.context().page;
  /** The film's Play page the bar is on (the shell's part, `Player.playOn`), where the HUD fades and the ticks are the viewer's. */
  let playPage = Option.none<HTMLElement>();
  const onPlay = () => Option.isSome(playPage);
  /** Whether the keyboard's focus is on one of the HUD's controls (the bar, the header, the tab bar): they stay while it is. */
  const focusHeld = () =>
    Option.match(Option.fromNullishOr(document.activeElement), {
      onNone: () => false,
      onSome: (el) => el.matches(':focus-visible') && el.closest(HUD_PARTS) !== null,
    });
  const hud = makeHud(
    (shown) => {
      bar.dataset['hud'] = shown ? 'shown' : 'hidden';
    },
    timersOn(host),
    focusHeld,
  );
  bar.dataset['hud'] = 'shown';

  const draw = () => {
    if (drawable) {
      reads = [];
      film.render(ctx, T, shownOptions({ knobs: reads }));
      // As they stand at this frame: a listener that stops listening skips none of the rest.
      for (const listener of [...listeners]) listener(T);
    }
    const cur = film.sceneAt(T);
    head.style.left = `${(T / film.duration) * 100}%`;
    const shownRate = rate === 1 ? '' : ` · ${rate}× muted`;
    const shownLoop =
      loop === undefined
        ? ''
        : ` · loop ${timecode(loop.from, film.fps)}–${timecode(loop.to, film.fps)}`;
    // The lab's transport is in the scene's time, the header's timecode the film's; elsewhere the film's.
    const [at, length] =
      page === 'lab' ? [Math.max(T - cur.start, 0), cur.dur] : [T, film.duration];
    timecodeEl.textContent = timecode(at, film.fps);
    lengthEl.textContent = ` / ${timecode(length, film.fps)}${shownRate}${shownLoop}`;
    sceneEl.textContent = cur.spec.id;
    sayEl.textContent = cur.voice.spoken;
    playBtn.textContent = playing ? '❚❚' : '▶︎';
    // On Play the line is the captions' alone while they show (`player.css`).
    bar.dataset['captions'] = captions.on ? 'on' : 'off';
    if (onPlay()) hud.playing(playing);
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
   * Restart the clock at `T`, and the narration with it at 1× (it follows the
   * clock only there; any other rate mutes it). A narration that cannot play
   * is not asked to (`narration.ts`).
   */
  const rebase = () => {
    clock.seek(T);
    if (playing) clock.play();
    else clock.pause();
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
    T = (rate === 1 ? voice.playingAt() : undefined) ?? clock.time();
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

  // A press on the track is told by how it ends. Lifted where it was put
  // down (no drag claimed it: a mouse that never moved, a finger within the
  // long press's slop), it is a tap: a jump there, a step Back walks across a
  // scene. Moved, it is a drag: it scrubs from its first move, following the
  // URL in place, and settles where it ends, lifted or taken by the browser
  // (a page pan); its press and its release enter nothing in history. The
  // track follows one press at a time (`TRACK`): a second finger put down
  // while the first holds it neither scrubs, nor jumps, nor names a tick.
  const TRACK = new Surface('track');
  track.addEventListener('pointerdown', (e) => {
    const r = track.getBoundingClientRect();
    const tAt = (ev: PointerEvent) => ((ev.clientX - r.left) / r.width) * film.duration;
    let dragged = false;
    const move = (ev: PointerEvent) => {
      dragged = true;
      scrub(tAt(ev));
    };
    Effect.runForkWith(host)(
      Pointer.use((pointer) =>
        pointer.press(e, TRACK, () => {
          const letGo = holdTick(e);
          return Option.some({
            move,
            end: (lifted: Option.Option<PointerEvent>) => {
              letGo();
              if (dragged) url.settled();
              else Option.map(lifted, () => seek(tAt(e)));
            },
          });
        }),
      ),
    );
  });
  playBtn.addEventListener('click', toggle);
  // The captions' button, on the player's pages; the lab's captions are the view menu's and `c` (UR2-12).
  const captionsBtn = q<HTMLButtonElement>('[data-act="captions"]');
  if (page === 'lab') captionsBtn.remove();
  captionsBtn.addEventListener('click', () => {
    captions.on = !captions.on;
    draw();
  });
  // The transport, as the page's commands: its keys are the page's keymap's.
  hub.commands.register(
    ...transportCommands(page, {
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
  // The lab's transport steps a frame at a time by touch too (AA-8): the
  // frame keys' own commands, as a pair beside play. Its legend, hidden at
  // rest, is ⌘K's and the page's menu's (the keys are the `?` sheet's).
  if (page === 'lab') {
    const keysLine = q<HTMLDivElement>('.keys');
    hub.commands.register(
      legendCommand({
        shown: () => !keysLine.hidden,
        toggle: () => {
          keysLine.hidden = !keysLine.hidden;
        },
      }),
    );
    const step = (id: string, glyph: string, label: string) => {
      const button = document.createElement('button');
      button.className = 'sh-tool';
      button.dataset['act'] = id;
      button.textContent = glyph;
      button.setAttribute('aria-label', label);
      // Named again whenever the keys change, so a key rebound in `?` reads as rebound.
      const name = () => {
        button.title = titledNow(hub, label, id);
      };
      name();
      hub.subscribe(name);
      button.addEventListener('click', () => hub.invokeId(id, BY_BUTTON));
      return button;
    };
    playBtn.after(
      step('play.frame-previous', '◀', 'Previous frame'),
      step('play.frame-next', '▶', 'Next frame'),
    );
  }
  // The picture: a click plays or pauses; on Play a finger's tap while it
  // plays shows or hides the HUD instead (its ❚❚ pauses), as a phone's
  // players do. Any other input on Play shows the HUD (`hud.ts`, `playOn`).
  let pressedBy = 'mouse';
  canvas.addEventListener('pointerdown', (e) => {
    pressedBy = e.pointerType;
  });
  canvas.addEventListener('click', () => {
    if (onPlay() && playing && pressedBy !== 'mouse') hud.toggle();
    else toggle();
  });
  /**
   * The bar on Play, in `part` (the shell's Play part, the whole window):
   * the HUD hears the viewer there, the page's own elements, and the keys
   * through the page's keymap, until the returned stop. A pointer moved or
   * pressed shows it, but a finger on the picture, whose tap toggles it; so
   * does any command the page runs (a key, a menu, ⌘K), and the keyboard's
   * focus landing on a control (Tab onto a faded one). The focus leaving a
   * control restarts a shown HUD's wait and never shows it: a tap moves the
   * focus before its click, and its meaning never depends on where the
   * focus was.
   */
  const playOn = (part: HTMLElement): (() => void) => {
    const listening = new AbortController();
    const options = { capture: true, signal: listening.signal };
    const pointed = (e: PointerEvent) => {
      if (e.target === canvas && e.pointerType !== 'mouse') return;
      hud.wake();
    };
    part.addEventListener('pointermove', pointed, options);
    part.addEventListener('pointerdown', pointed, options);
    part.addEventListener(
      'focusin',
      (e) => {
        if (e.target instanceof Element && e.target.matches(':focus-visible')) hud.wake();
      },
      options,
    );
    part.addEventListener('focusout', () => hud.focusLeft(), options);
    const unheard = hub.receipts(() => hud.wake());
    playPage = Option.some(part);
    draw();
    return () => {
      listening.abort();
      unheard();
      playPage = Option.none();
      hud.playing(false);
    };
  };
  if (page === 'player') {
    // A film's ticks (hundreds of them) are off on Play until the viewer turns
    // them on (⋯ → Show the ticks), kept in this browser; their legend shows with them.
    const ticksKept = AtomRegistry.make();
    ticksKept.mount(KEPT_TICKS);
    const ticksShown = () => Option.contains(ticksKept.get(KEPT_TICKS), 'on');
    const showTicks = () => {
      bar.dataset['ticks'] = ticksShown() ? 'on' : 'off';
    };
    showTicks();
    hub.commands.register(
      ticksCommand({
        shown: ticksShown,
        toggle: () => {
          ticksKept.set(KEPT_TICKS, ticksShown() ? 'off' : 'on');
          showTicks();
        },
        here: onPlay,
      }),
    );
  }
  // The first frame: at once when the film's faces are in, else once they
  // have loaded (the bar stands meanwhile). A face that will not load fails
  // the page, as a film that will not load does: the film stops, and the
  // page ends and says why in its place (`fail`).
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
      clock.rate(r);
      rebase();
      draw();
    },
    setLoop: (range) => {
      loop = range === undefined || range.to <= range.from ? undefined : range;
      draw();
    },
    redraw: draw,
    renderShown: (into, at, over = new Map()) => {
      if (drawable) film.render(into, at, shownOptions({ edits: new Map([...edits, ...over]) }));
    },
    drawable: () => drawable,
    showEdits: (next) => {
      edits = next;
      draw();
    },
    knobReads: () => reads,
    playOn,
    onDraw: (listener) => {
      listeners.push(listener);
      return () => {
        const at = listeners.indexOf(listener);
        if (at >= 0) listeners.splice(at, 1);
      };
    },
  };
};
