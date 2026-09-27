// The lab's motion tools: onion skin, speed, and loops. None of them draws on
// the film canvas. The onion skin renders the frames around the one shown
// (`film.render` into an offscreen canvas), keeps only its ink where the
// frame shown has none (what moved: darker than the frame on a light page,
// lighter on a dark one), and paints it on a layer above the film: warm
// before, cool after, fainter the further away. Speed and loops
// drive the player's clock (`Player.setRate`, `Player.setLoop`); the
// narration plays only at 1×.

import type { SceneSpec } from '../canvas/film.ts';
import { Result } from 'effect';
import { type Placed, sceneOf } from '../core/layout.ts';
import type { Editor } from './lab-edit.ts';
import { el, required } from './dom.ts';
import type { LoopRange, Player } from './main.ts';
import type { LabView, ViewStore } from './view-state.ts';

/** The rates the lab plays at. */
const RATES: ReadonlyArray<number> = [0.25, 0.5, 1];
/** A cue shorter than this loops with this much film either side, or there is nothing to watch. */
const SHORT_CUE = 0.2;
const CUE_PAD = 0.4;
/** A pixel whose brightness moved by less than this (0–255) did not move: paper grain, boil. */
const MOVED = 38;
/** The onion skin draws at this fraction of the film's size. */
const ONION_SCALE = 0.5;
const BEFORE: readonly [number, number, number] = [226, 84, 70];
const AFTER: readonly [number, number, number] = [60, 150, 230];

type LoopSource =
  | { readonly kind: 'cue'; readonly scene: string; readonly name: string }
  | { readonly kind: 'ab' };

/** Speed, loop and onion as the page left them, kept through the reload a write causes. */
type MotionView = Pick<LabView, 'rate' | 'loop' | 'onion'>;

const canvas2d = (w: number, h: number, className = '') => {
  const c = el('canvas', className);
  c.width = w;
  c.height = h;
  const ctx = c.getContext('2d', { willReadFrequently: true });
  if (ctx === null) throw new Error('2d context unavailable');
  return { c, ctx };
};

const brightness = (d: Uint8ClampedArray, i: number) =>
  0.299 * (d[i] ?? 0) + 0.587 * (d[i + 1] ?? 0) + 0.114 * (d[i + 2] ?? 0);

/** A whole-number field from 1 to `max`, `fallback` when it is empty or not a number. */
const whole = (value: string, fallback: number, max: number) =>
  Math.max(1, Math.min(max, Math.round(Number(value) || fallback)));

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

/**
 * Mount the motion tools: a section in the lab panel and the onion layer,
 * which `pin` keeps over the film canvas.
 */
export const mountMotion = (
  player: Player,
  panel: HTMLElement,
  pin: (layer: HTMLElement) => void,
  selectedCue: Editor['selectedCue'],
  view: ViewStore,
): void => {
  const { film } = player;
  const section = el('section', 'lab-motion');
  section.innerHTML = `
    <header><strong>Motion</strong><span class="lab-motion-status"></span></header>
    <div class="lab-motion-row">
      <button type="button" data-act="onion" title="ghost the frames around this one: warm before, cool after">Onion</button>
      <label>± <input type="number" data-field="count" min="1" max="4" step="1" value="2"></label>
      <label>every <input type="number" data-field="spacing" min="1" max="15" step="1" value="3"> f</label>
    </div>
    <div class="lab-motion-row" data-role="rates">
      <span class="lab-edit-key">speed</span>
    </div>
    <div class="lab-motion-row">
      <span class="lab-edit-key">loop</span>
      <button type="button" data-act="loop-cue" title="loop the selected cue's span">cue</button>
      <button type="button" data-act="a" title="set A to this frame">A</button>
      <button type="button" data-act="b" title="set B to this frame">B</button>
      <button type="button" data-act="loop-off">off</button>
    </div>`;
  const edit = panel.querySelector('.lab-edit');
  if (edit === null) panel.prepend(section);
  else edit.after(section);
  const q = <T extends Element>(sel: string) => required<T>(section, sel);
  const status = q<HTMLSpanElement>('.lab-motion-status');
  const onionBtn = q<HTMLButtonElement>('[data-act="onion"]');
  const countIn = q<HTMLInputElement>('[data-field="count"]');
  const spacingIn = q<HTMLInputElement>('[data-field="spacing"]');
  const say = (text: string) => {
    status.textContent = text;
  };

  // ── Speed. ──
  const rates = q<HTMLDivElement>('[data-role="rates"]');
  const setRate = (r: number) => {
    player.setRate(r);
    for (const other of rateBtns) other.classList.toggle('on', other.dataset['rate'] === String(r));
    say(r === 1 ? '' : `${r}×: narration muted`);
    view.patch({ rate: r });
  };
  const rateBtns = RATES.map((r) => {
    const b = el('button', r === 1 ? 'on' : '', `${r}×`);
    b.type = 'button';
    b.dataset['rate'] = String(r);
    b.addEventListener('click', () => setRate(r));
    rates.append(b);
    return b;
  });

  // ── Loops: the selected cue's span, or A to B. ──
  let a: number | undefined;
  let b: number | undefined;
  let source: LoopSource | undefined;
  const placedOf = (scene: string): Placed<SceneSpec> | undefined =>
    Result.getOrUndefined(sceneOf(film.placed, scene));
  /** The span a source loops now: a cue follows its own edits. */
  const rangeOf = (s: LoopSource): LoopRange | undefined => {
    if (s.kind === 'ab')
      return a !== undefined && b !== undefined && b > a ? { from: a, to: b } : undefined;
    const p = placedOf(s.scene);
    const cue = film.cuesOf(s.scene).get(s.name);
    if (p === undefined || cue === undefined) return undefined;
    const pad = cue.dur < SHORT_CUE ? CUE_PAD : 0;
    return {
      from: Math.max(0, p.start + cue.start - pad),
      to: Math.min(film.duration, p.start + cue.end + pad),
    };
  };
  let looping: LoopRange | undefined;
  const applyLoop = () => {
    const next = source === undefined ? undefined : rangeOf(source);
    if (next?.from === looping?.from && next?.to === looping?.to) return;
    looping = next;
    player.setLoop(next);
  };
  /** Loop `s` from now on, and keep it through a reload. */
  const setSource = (s: LoopSource | undefined) => {
    source = s;
    applyLoop();
    if (s?.kind === 'ab' && a !== undefined && b !== undefined)
      view.patch({ loop: { kind: 'ab', from: a, to: b } });
    else if (s?.kind === 'cue') view.patch({ loop: s });
    else view.patch({ loop: undefined });
  };
  const startLoop = (s: LoopSource) => {
    setSource(s);
    if (looping === undefined) return;
    player.seek(looping.from);
    player.play();
  };
  q<HTMLButtonElement>('[data-act="loop-cue"]').addEventListener('click', () => {
    const cue = selectedCue();
    if (cue === undefined) return say('select a cue on the strip first');
    startLoop({ kind: 'cue', scene: cue.scene, name: cue.name });
    say(`looping ${cue.name}`);
  });
  q<HTMLButtonElement>('[data-act="a"]').addEventListener('click', () => {
    a = player.now();
    say(`A ${a.toFixed(2)}${b === undefined ? '' : ` · B ${b.toFixed(2)}`}`);
    if (b !== undefined && b > a) startLoop({ kind: 'ab' });
  });
  q<HTMLButtonElement>('[data-act="b"]').addEventListener('click', () => {
    b = player.now();
    if (a === undefined || b <= a) return say(`B ${b.toFixed(2)}: set A before it`);
    say(`looping A ${a.toFixed(2)} – B ${b.toFixed(2)}`);
    startLoop({ kind: 'ab' });
  });
  q<HTMLButtonElement>('[data-act="loop-off"]').addEventListener('click', () => {
    a = undefined;
    b = undefined;
    setSource(undefined);
    say('');
  });

  // ── Onion skin. ──
  const w = Math.round(film.width * ONION_SCALE);
  const h = Math.round(film.height * ONION_SCALE);
  const onion = canvas2d(w, h, 'lab-onion');
  onion.c.hidden = true;
  pin(onion.c);
  const ghost = canvas2d(film.width, film.height);
  const small = canvas2d(w, h);
  /**
   * The frame shown, as brightness per pixel: computed once per paint rather
   * than again for every ghost. The buffer is reused; its values are this
   * paint's only.
   */
  const nowBrightness = new Float64Array(w * h);
  let onionOn = false;
  let pending = false;

  /** The frame at `T`, at the onion's size, as pixels. */
  const pixelsAt = (T: number | undefined) => {
    if (T !== undefined) film.render(ghost.ctx, T, { captions: player.captions.on });
    small.ctx.clearRect(0, 0, w, h);
    small.ctx.drawImage(T === undefined ? player.canvas : ghost.c, 0, 0, w, h);
    return small.ctx.getImageData(0, 0, w, h).data;
  };

  const paintOnion = () => {
    pending = false;
    if (!onionOn || player.playing()) {
      onion.c.hidden = true;
      return;
    }
    const count = whole(countIn.value, 2, 4);
    const spacing = whole(spacingIn.value, 3, 15);
    const T = player.now();
    brightnessInto(nowBrightness, pixelsAt(undefined));
    const now = nowBrightness;
    const light = inkSign(now);
    const out = onion.ctx.createImageData(w, h);
    // Farthest first, so the nearest ghost ends on top.
    for (let k = count; k >= 1; k--) {
      const strength = 0.9 * (1 - (k - 1) / (count + 1));
      for (const dir of [-1, 1]) {
        const at = T + (dir * k * spacing) / film.fps;
        if (at < 0 || at > film.duration) continue;
        ghostInto(out.data, now, pixelsAt(at), light, strength, dir < 0 ? BEFORE : AFTER);
      }
    }
    onion.ctx.putImageData(out, 0, 0);
    onion.c.hidden = false;
  };
  const scheduleOnion = () => {
    if (pending) return;
    pending = true;
    requestAnimationFrame(paintOnion);
  };
  const keepOnion = () =>
    view.patch({
      onion: {
        on: onionOn,
        count: whole(countIn.value, 2, 4),
        spacing: whole(spacingIn.value, 3, 15),
      },
    });
  const setOnion = (on: boolean) => {
    onionOn = on;
    onionBtn.classList.toggle('on', onionOn);
    keepOnion();
    scheduleOnion();
  };
  onionBtn.addEventListener('click', () => setOnion(!onionOn));
  for (const input of [countIn, spacingIn])
    input.addEventListener('change', () => {
      keepOnion();
      scheduleOnion();
    });

  player.onDraw(() => {
    if (source !== undefined) applyLoop();
    if (onionOn) scheduleOnion();
  });

  // ── The view the page was in before a write reloaded it. ──
  const kept: MotionView = view.get();
  countIn.value = String(kept.onion.count);
  spacingIn.value = String(kept.onion.spacing);
  if (kept.onion.on) setOnion(true);
  if (kept.rate !== 1) setRate(kept.rate);
  if (kept.loop?.kind === 'ab') {
    a = kept.loop.from;
    b = kept.loop.to;
    setSource({ kind: 'ab' });
  } else if (kept.loop?.kind === 'cue') setSource(kept.loop);
  if (looping !== undefined) say(`looping ${looping.from.toFixed(2)} – ${looping.to.toFixed(2)}`);
};
