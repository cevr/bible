// The browser player. An app's entry calls `mountPlayer(films)` with its film
// registry. Preview mode is a scrubbable player; export mode (`?export`) hides
// the chrome and hands `window.__film` to the renderer.

import type { Film } from '../canvas/film.ts';
import type { TextBox } from '../core/schema.ts';
import { timelineTicks } from '../core/ticks.ts';
import { Option } from 'effect';

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
  /** Draw frame `i` with the text probe on: every line of text it draws, boxed in canvas pixels. */
  probe(i: number): TextBox[];
}

declare global {
  interface Window {
    __film?: ExportHandle;
  }
}

/** Mount the player for `films` into the page, choosing a film by `?film=<name>`. */
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
      window.__film = {
        width: film.width,
        height: film.height,
        fps: film.fps,
        duration: film.duration,
        frames: Math.ceil(film.duration * film.fps),
        audio: film.audio,
        frame: async (i, type = 'image/png') => {
          film.render(ctx, i / film.fps, { captions: captions.on });
          const blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, type, 0.95));
          if (blob === null) throw new Error('toBlob failed');
          const bytes = new Uint8Array(await blob.arrayBuffer());
          let bin = '';
          for (let k = 0; k < bytes.length; k += 0x8000)
            bin += String.fromCharCode(...bytes.subarray(k, k + 0x8000));
          return btoa(bin);
        },
        probe: (i) => {
          const boxes: TextBox[] = [];
          film.render(ctx, i / film.fps, { captions: captions.on, probe: boxes });
          return boxes;
        },
      };
      return;
    }
    preview(film, canvas, ctx, captions);
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
) => {
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

  const draw = () => {
    film.render(ctx, T, { captions: captions.on });
    const cur = film.sceneAt(T);
    head.style.left = `${(T / film.duration) * 100}%`;
    timeEl.textContent = `${T.toFixed(2)} / ${film.duration.toFixed(1)}s · f${Math.round(T * film.fps)}`;
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

  const toggle = () => {
    playing = !playing;
    tStart = T;
    wallStart = performance.now();
    if (audio !== undefined) {
      audio.currentTime = T;
      if (playing) void audio.play();
      else audio.pause();
    }
    if (playing) requestAnimationFrame(tick);
    draw();
  };

  const tick = () => {
    if (!playing) return;
    T =
      audio !== undefined && !audio.paused
        ? audio.currentTime
        : tStart + (performance.now() - wallStart) / 1000;
    if (T >= film.duration) {
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
};
