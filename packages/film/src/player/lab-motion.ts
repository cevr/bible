// The lab's motion tools: onion skin, speed, and loops. None of them draws on
// the film canvas. The onion skin renders the frames around the one shown
// (`film.render` into an offscreen canvas), keeps only its ink where the
// frame shown has none (what moved: darker than the frame on a light page,
// lighter on a dark one), and paints it on a layer above the film: warm
// before, cool after, fainter the further away. Speed and loops
// drive the player's clock (`Player.setRate`, `Player.setLoop`); the
// narration plays only at 1×.

import type { SceneSpec } from '../canvas/film.ts';
import type { Placed } from '../core/layout.ts';
import type { Editor } from './lab-edit.ts';
import type { LoopRange, Player } from './main.ts';

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

const el = <K extends keyof HTMLElementTagNameMap>(
  tag: K,
  className: string,
  text?: string,
): HTMLElementTagNameMap[K] => {
  const node = document.createElement(tag);
  node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
};

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

/**
 * Mount the motion tools: a section in the lab panel and the onion layer,
 * which `pin` keeps over the film canvas.
 */
export const mountMotion = (
  player: Player,
  panel: HTMLElement,
  pin: (layer: HTMLElement) => void,
  selectedCue: Editor['selectedCue'],
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
  const q = <T extends Element>(sel: string) => {
    const found = section.querySelector<T & Element>(sel);
    if (found === null) throw new Error(`missing ${sel}`);
    return found;
  };
  const status = q<HTMLSpanElement>('.lab-motion-status');
  const onionBtn = q<HTMLButtonElement>('[data-act="onion"]');
  const countIn = q<HTMLInputElement>('[data-field="count"]');
  const spacingIn = q<HTMLInputElement>('[data-field="spacing"]');
  const say = (text: string) => {
    status.textContent = text;
  };

  // ── Speed. ──
  const rates = q<HTMLDivElement>('[data-role="rates"]');
  const rateBtns = RATES.map((r) => {
    const b = el('button', r === 1 ? 'on' : '', `${r}×`);
    b.type = 'button';
    b.dataset['rate'] = String(r);
    b.addEventListener('click', () => {
      player.setRate(r);
      for (const other of rateBtns) other.classList.toggle('on', other === b);
      say(r === 1 ? '' : `${r}×: narration muted`);
    });
    rates.append(b);
    return b;
  });

  // ── Loops: the selected cue's span, or A to B. ──
  let a: number | undefined;
  let b: number | undefined;
  let source: LoopSource | undefined;
  const placedOf = (scene: string): Placed<SceneSpec> | undefined =>
    film.placed.find((p) => p.spec.id === scene);
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
  const startLoop = (s: LoopSource) => {
    source = s;
    applyLoop();
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
    source = undefined;
    a = undefined;
    b = undefined;
    applyLoop();
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
    const count = Math.max(1, Math.min(4, Math.round(Number(countIn.value) || 2)));
    const spacing = Math.max(1, Math.min(15, Math.round(Number(spacingIn.value) || 3)));
    const T = player.now();
    const now = pixelsAt(undefined);
    // Ink is darker than the page on paper, lighter on a night sky.
    let sum = 0;
    for (let i = 0; i < now.length; i += 4 * 97) sum += brightness(now, i);
    const light = sum / Math.ceil(now.length / (4 * 97)) > 110 ? 1 : -1;
    const out = onion.ctx.createImageData(w, h);
    const o = out.data;
    // Farthest first, so the nearest ghost ends on top.
    for (let k = count; k >= 1; k--) {
      const strength = 0.9 * (1 - (k - 1) / (count + 1));
      for (const dir of [-1, 1]) {
        const at = T + (dir * k * spacing) / film.fps;
        if (at < 0 || at > film.duration) continue;
        const px = pixelsAt(at);
        const [r, g, bl] = dir < 0 ? BEFORE : AFTER;
        for (let i = 0; i < o.length; i += 4) {
          const moved = light * (brightness(now, i) - brightness(px, i));
          if (moved < MOVED) continue;
          const alpha = Math.round(255 * strength * Math.min(1, (moved - MOVED) / 60 + 0.35));
          if (alpha <= (o[i + 3] ?? 0)) continue;
          o[i] = r;
          o[i + 1] = g;
          o[i + 2] = bl;
          o[i + 3] = alpha;
        }
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
  onionBtn.addEventListener('click', () => {
    onionOn = !onionOn;
    onionBtn.classList.toggle('on', onionOn);
    scheduleOnion();
  });
  countIn.addEventListener('change', scheduleOnion);
  spacingIn.addEventListener('change', scheduleOnion);

  player.onDraw(() => {
    if (source !== undefined) applyLoop();
    if (onionOn) scheduleOnion();
  });
};
