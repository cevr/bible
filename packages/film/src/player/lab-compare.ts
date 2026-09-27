// The lab's compare: the frame shown beside the same frame as HEAD declared
// the scene's timeline and knobs. The server reads the scene file at HEAD
// (`GET /lab/scenes/:scene/head`, parsed with the same locator and parser the
// writer uses); the page draws HEAD's values through the code it has now
// (`film.render(…, { edit })`, one frame, nothing kept) onto a layer over the
// film. A wipe shows HEAD left of a divider you drag, now to its right; blink
// flips between them. Only data can differ this way: when the file's code
// changed since HEAD, the panel says so.

import { Schema } from 'effect';
import type { SceneEdit } from '../canvas/film.ts';
import { HeadSource } from '../core/schema.ts';
import type { Player } from './main.ts';

const SVG = 'http://www.w3.org/2000/svg';
const decodeHead = Schema.decodeUnknownSync(HeadSource);
/** How long each side of a blink shows. */
const BLINK_MS = 450;

type Mode = 'off' | 'wipe' | 'blink';

/** HEAD for one scene: its edit, or why there is none. */
type Loaded =
  | { readonly kind: 'head'; readonly head: HeadSource; readonly edit: SceneEdit }
  | { readonly kind: 'none'; readonly reason: string };

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

const svg = <K extends keyof SVGElementTagNameMap>(tag: K, attrs: Record<string, string>) => {
  const node = document.createElementNS(SVG, tag);
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, v);
  return node;
};

/**
 * Mount the compare: a section in the lab panel, the HEAD layer (`pin` keeps
 * it over the film) and the wipe's divider on the lab's overlay.
 */
export const mountCompare = (
  player: Player,
  panel: HTMLElement,
  overlay: SVGSVGElement,
  pin: (layer: HTMLElement) => void,
): void => {
  const { film } = player;
  const section = el('section', 'lab-compare-tools');
  section.innerHTML = `
    <header><strong>Compare</strong><span class="lab-edit-key">with HEAD</span></header>
    <div class="lab-motion-row">
      <button type="button" data-mode="off" class="on">off</button>
      <button type="button" data-mode="wipe" title="HEAD left of the divider, now right of it">wipe</button>
      <button type="button" data-mode="blink" title="flip between HEAD and now">blink</button>
    </div>
    <p class="lab-edit-note lab-compare-status"></p>`;
  const motion = panel.querySelector('.lab-motion');
  if (motion === null) panel.prepend(section);
  else motion.after(section);
  const status = section.querySelector<HTMLParagraphElement>('.lab-compare-status');
  const buttons = [...section.querySelectorAll<HTMLButtonElement>('[data-mode]')];

  const layer = el('canvas', 'lab-compare');
  layer.width = film.width;
  layer.height = film.height;
  layer.hidden = true;
  const ctx = layer.getContext('2d');
  if (ctx === null) throw new Error('2d context unavailable');
  pin(layer);

  // The wipe's divider: a line through the frame and a handle to drag it by.
  const divider = svg('g', { class: 'lab-divider' });
  const line = svg('line', { y1: '0', y2: `${film.height}` });
  const grip = svg('circle', { cy: `${film.height / 2}`, r: '22' });
  const headLabel = svg('text', { y: '44', 'text-anchor': 'end' });
  headLabel.textContent = 'HEAD';
  const nowLabel = svg('text', { y: '44' });
  nowLabel.textContent = 'now';
  divider.append(line, grip, headLabel, nowLabel);
  divider.style.display = 'none';
  overlay.append(divider);

  let mode: Mode = 'off';
  /** Where the divider sits, 0–1 across the frame. */
  let split = 0.5;
  let blinkShowsHead = true;
  let blinker: ReturnType<typeof setInterval> | undefined;
  const loaded = new Map<string, Loaded>();
  const loading = new Set<string>();
  let pending = false;

  const say = (text: string) => {
    if (status !== null) status.textContent = text;
  };

  const placeDivider = () => {
    const x = split * film.width;
    line.setAttribute('x1', `${x}`);
    line.setAttribute('x2', `${x}`);
    grip.setAttribute('cx', `${x}`);
    headLabel.setAttribute('x', `${x - 16}`);
    nowLabel.setAttribute('x', `${x + 16}`);
    layer.style.clipPath = `inset(0 ${(1 - split) * 100}% 0 0)`;
  };

  const load = (scene: string) => {
    if (loaded.has(scene) || loading.has(scene)) return;
    loading.add(scene);
    fetch(`/lab/scenes/${encodeURIComponent(scene)}/head`)
      .then(async (res): Promise<Loaded> => {
        if (!res.ok) return { kind: 'none', reason: (await res.text()).replace(/^\w+: /, '') };
        const head = decodeHead(await res.json());
        const p = film.placed.find((x) => x.spec.id === scene);
        // HEAD's literals over today's declarations: a span HEAD computed stays as it is now.
        const edit: SceneEdit = {
          timeline: { ...p?.spec.timeline, ...head.timeline },
          knobs: { ...p?.spec.knobs, ...head.knobs },
        };
        return { kind: 'head', head, edit };
      })
      .catch((err: unknown): Loaded => ({ kind: 'none', reason: String(err) }))
      .then((result) => {
        loading.delete(scene);
        loaded.set(scene, result);
        schedule();
      });
  };

  const paint = () => {
    pending = false;
    const scene = film.sceneAt(player.now()).spec.id;
    const found = loaded.get(scene);
    if (mode === 'off' || found === undefined || found.kind === 'none') {
      layer.hidden = true;
      divider.style.display = 'none';
      if (mode === 'off') say('');
      else if (found === undefined) {
        say(`reading ${scene} at HEAD…`);
        load(scene);
      } else if (found.kind === 'none') say(`${scene}: ${found.reason}`);
      return;
    }
    const { head, edit } = found;
    film.render(ctx, player.now(), { captions: player.captions.on, edit: { scene, edit } });
    const notes = [
      `${head.file} at HEAD`,
      ...(head.codeChanged ? ['code changed since HEAD — compare shows data only'] : []),
      ...(head.sameData ? ["HEAD's timeline and knobs are the same as now"] : []),
    ];
    say(notes.join(' · '));
    if (mode === 'wipe') {
      layer.hidden = false;
      divider.style.display = '';
      placeDivider();
    } else {
      layer.style.clipPath = '';
      layer.hidden = !blinkShowsHead;
      divider.style.display = 'none';
    }
  };
  const schedule = () => {
    if (pending) return;
    pending = true;
    requestAnimationFrame(paint);
  };

  const setMode = (next: Mode) => {
    mode = next;
    for (const b of buttons) b.classList.toggle('on', b.dataset['mode'] === next);
    if (blinker !== undefined) clearInterval(blinker);
    blinker = undefined;
    if (next === 'blink') {
      blinkShowsHead = true;
      blinker = setInterval(() => {
        blinkShowsHead = !blinkShowsHead;
        schedule();
      }, BLINK_MS);
    }
    schedule();
  };
  for (const b of buttons)
    b.addEventListener('click', () => {
      const next = b.dataset['mode'];
      if (next === 'off' || next === 'wipe' || next === 'blink') setMode(next);
    });

  grip.addEventListener('pointerdown', (e) => {
    // The divider, not a note: the overlay never sees this press.
    e.stopPropagation();
    e.preventDefault();
    const r = overlay.getBoundingClientRect();
    const move = (ev: PointerEvent) => {
      split = Math.max(0, Math.min(1, (ev.clientX - r.left) / r.width));
      placeDivider();
    };
    const up = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  });

  player.onDraw(() => {
    if (mode !== 'off') schedule();
  });
};
