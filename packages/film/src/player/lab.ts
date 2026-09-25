// The lab: notes on frames, over the preview player (`?film=<film>&lab`, served
// by `film lab`). On the canvas a click pins a point, a drag draws a box, and
// the pen draws freehand ink; `n` notes the whole frame. A note saves the exact
// frame as its still (the film canvas, which the lab never draws on: every
// mark lives on an SVG layer above it), its scene and the cue edge and mark
// nearest it. Notes sit as ticks on the timeline and in a side list with their
// threads; the agent answers from `film notes`, and a long-poll brings each
// change in as it lands.

import { Option, Schema } from 'effect';
import { nearestMoment } from '../core/notes.ts';
import {
  type InkStroke,
  type Note,
  type NoteBox,
  type NoteDraft,
  NotesFile,
  NotesWait,
  type Point,
} from '../core/schema.ts';
import { mountCompare } from './lab-compare.ts';
import { mountEditor } from './lab-edit.ts';
import { mountMotion } from './lab-motion.ts';
import type { Player } from './main.ts';

const SVG = 'http://www.w3.org/2000/svg';
/** A pointer that moves less than this many screen pixels clicked; more, it dragged a box. */
const DRAG_PX = 6;

const decodeNotes = Schema.decodeUnknownSync(NotesFile);
const decodeWait = Schema.decodeUnknownSync(NotesWait);

/** What the viewer has marked on the frame and not saved yet. */
interface Draft {
  box: NoteBox | undefined;
  ink: InkStroke[];
}

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

const pointsAttr = (stroke: InkStroke) => stroke.map(([x, y]) => `${x},${y}`).join(' ');

/** The frame on the canvas as a base64 PNG: exactly what the film drew, no lab marks. */
const stillOf = async (canvas: HTMLCanvasElement) => {
  const blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, 'image/png'));
  if (blob === null) throw new Error('toBlob failed');
  const bytes = new Uint8Array(await blob.arrayBuffer());
  let bin = '';
  for (let k = 0; k < bytes.length; k += 0x8000)
    bin += String.fromCharCode(...bytes.subarray(k, k + 0x8000));
  return btoa(bin);
};

const post = async (url: string, body: unknown) => {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`${url}: ${res.status} ${await res.text()}`);
  return res;
};

const label = (note: Note) => {
  const cue = note.cue === undefined ? '' : ` · ${note.cue.name}:${note.cue.edge}`;
  return `${note.id} · ${note.scene} · ${note.T.toFixed(2)}s${cue}`;
};

export const mountLab = (player: Player, filmName: string): void => {
  const { film, canvas } = player;
  document.body.classList.add('lab');

  // ── The layer over the canvas: every lab mark draws here, never on the film. ──
  const overlay = svg('svg', {
    class: 'lab-overlay',
    viewBox: `0 0 ${film.width} ${film.height}`,
    preserveAspectRatio: 'none',
  });
  const marks = svg('g', { class: 'lab-marks' });
  overlay.append(marks);
  /** Layers kept exactly over the film canvas: the overlay, and the motion and compare layers under it. */
  const pinned: Array<HTMLElement | SVGSVGElement> = [];
  const place = () => {
    const r = canvas.getBoundingClientRect();
    for (const layer of pinned)
      Object.assign(layer.style, {
        left: `${r.left}px`,
        top: `${r.top}px`,
        width: `${r.width}px`,
        height: `${r.height}px`,
      });
  };
  const pin = (layer: HTMLElement | SVGSVGElement) => {
    pinned.push(layer);
    document.body.append(layer);
    place();
  };
  pin(overlay);
  new ResizeObserver(place).observe(canvas);
  window.addEventListener('resize', place);

  /** A pointer's position in canvas pixels, to the nearest pixel. */
  const toCanvas = (e: PointerEvent): Point => {
    const r = overlay.getBoundingClientRect();
    return [
      Math.round(((e.clientX - r.left) / r.width) * film.width),
      Math.round(((e.clientY - r.top) / r.height) * film.height),
    ];
  };

  // ── The side panel: tools, the composer, the notes and their threads. ──
  const panel = el('aside', 'lab-panel');
  panel.innerHTML = `
    <header>
      <strong>Lab</strong>
      <span class="lab-hint">click pin · drag box · <kbd>n</kbd> note this frame</span>
      <button data-act="pen" title="draw freehand ink on the frame">Pen</button>
      <a class="lab-lookbook" href="?film=${encodeURIComponent(filmName)}&lab&lookbook" title="every scene's stills at its cue edges and 60% point, with the palette">Look-book</a>
    </header>
    <form class="lab-compose" hidden>
      <div class="lab-where"></div>
      <textarea rows="3" placeholder="What should change on this frame?"></textarea>
      <div class="lab-actions">
        <button type="submit">Save note</button>
        <button type="button" data-act="cancel">Cancel</button>
        <span class="lab-status"></span>
      </div>
    </form>
    <ol class="lab-notes"></ol>`;
  document.body.append(panel);
  const q = <T extends Element>(sel: string) => {
    const found = panel.querySelector<T & Element>(sel);
    if (found === null) throw new Error(`missing ${sel}`);
    return found;
  };
  const penBtn = q<HTMLButtonElement>('[data-act="pen"]');
  // The editor: drag cues and knobs, written back to the scene files.
  const editor = mountEditor(player, panel, overlay);
  // Onion skin, speed and loops.
  mountMotion(player, panel, pin, editor.selectedCue);
  // The frame beside HEAD's timeline and knobs.
  mountCompare(player, panel, overlay, pin);
  const compose = q<HTMLFormElement>('.lab-compose');
  const where = q<HTMLDivElement>('.lab-where');
  const textarea = q<HTMLTextAreaElement>('textarea');
  const status = q<HTMLSpanElement>('.lab-status');
  const list = q<HTMLOListElement>('.lab-notes');

  let pen = false;
  let draft: Draft = { box: undefined, ink: [] };
  let notes: ReadonlyArray<Note> = [];
  let selected: string | undefined;
  let cursor = 0;
  /** The frame the open composer notes: the one shown when it opened. */
  let draftT = 0;

  // ── Drawing the marks: the draft being made, or the selected note on its frame. ──
  const drawBox = (box: NoteBox, cls: string) => {
    if (box.w === 0 && box.h === 0)
      marks.append(svg('circle', { class: cls, cx: `${box.x}`, cy: `${box.y}`, r: '14' }));
    else
      marks.append(
        svg('rect', {
          class: cls,
          x: `${box.x}`,
          y: `${box.y}`,
          width: `${box.w}`,
          height: `${box.h}`,
        }),
      );
  };
  const drawInk = (ink: ReadonlyArray<InkStroke>, cls: string) => {
    for (const stroke of ink)
      marks.append(svg('polyline', { class: cls, points: pointsAttr(stroke) }));
  };
  const redrawMarks = () => {
    marks.replaceChildren();
    if (draft.box !== undefined) drawBox(draft.box, 'lab-draft');
    drawInk(draft.ink, 'lab-draft-ink');
    const note = notes.find((n) => n.id === selected);
    // A note's marks belong to its frame: shown only while that frame is.
    if (note !== undefined && Math.abs(player.now() - note.T) < 0.5 / film.fps) {
      if (note.box !== undefined) drawBox(note.box, 'lab-note');
      drawInk(note.ink ?? [], 'lab-note-ink');
    }
  };
  player.onDraw(redrawMarks);

  // ── The composer. ──
  const openComposer = () => {
    player.pause();
    const T = player.now();
    draftT = T;
    const moment = nearestMoment(film.placed, T);
    const text = Option.match(moment, {
      onNone: () => '',
      onSome: (m) =>
        [
          m.scene,
          `${T.toFixed(2)}s`,
          `f${Math.round(T * film.fps)}`,
          ...Option.toArray(Option.map(m.cue, (c) => `cue ${c.name}:${c.edge}`)),
          ...Option.toArray(Option.map(m.mark, (k) => `{${k}}`)),
        ].join(' · '),
    });
    where.textContent = text;
    compose.hidden = false;
    status.textContent = '';
    textarea.focus();
  };
  const closeComposer = () => {
    compose.hidden = true;
    textarea.value = '';
    draft = { box: undefined, ink: [] };
    redrawMarks();
  };
  q<HTMLButtonElement>('[data-act="cancel"]').addEventListener('click', closeComposer);
  compose.addEventListener('submit', (e) => {
    e.preventDefault();
    const text = textarea.value.trim();
    if (text === '') return;
    const T = draftT;
    const moment = nearestMoment(film.placed, T);
    const scene = Option.match(moment, { onNone: () => '', onSome: (m) => m.scene });
    const note: NoteDraft = {
      scene,
      T,
      frame: Math.round(T * film.fps),
      text,
      ...Option.match(
        Option.flatMap(moment, (m) => m.cue),
        {
          onNone: () => ({}),
          onSome: (cue) => ({ cue }),
        },
      ),
      ...Option.match(
        Option.flatMap(moment, (m) => m.mark),
        {
          onNone: () => ({}),
          onSome: (mark) => ({ mark }),
        },
      ),
      ...Option.match(Option.fromNullishOr(draft.box), {
        onNone: () => ({}),
        onSome: (box) => ({ box }),
      }),
      ...Option.match(
        Option.liftPredicate(draft.ink, (ink) => ink.length > 0),
        {
          onNone: () => ({}),
          onSome: (ink) => ({ ink }),
        },
      ),
    };
    status.textContent = 'saving…';
    void (async () => {
      // The still is the film canvas at this very frame, drawn fresh: no lab marks can be in it.
      film.render(player.ctx, T, { captions: player.captions.on });
      const still = await stillOf(canvas);
      const res = await post('/lab/notes', { ...note, still });
      const saved: { id: string } = await res.json();
      selected = saved.id;
      closeComposer();
      await refresh();
    })().catch((err: unknown) => {
      status.textContent = String(err);
    });
  });

  // ── Pointer on the canvas: pin, box or pen. ──
  overlay.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    player.pause();
    overlay.setPointerCapture(e.pointerId);
    const from = toCanvas(e);
    const startX = e.clientX;
    const startY = e.clientY;
    const stroke: Point[] = [from];
    if (pen) draft.ink.push(stroke);
    const move = (ev: PointerEvent) => {
      const at = toCanvas(ev);
      if (pen) stroke.push(at);
      else if (Math.hypot(ev.clientX - startX, ev.clientY - startY) >= DRAG_PX)
        draft.box = {
          x: Math.min(from[0], at[0]),
          y: Math.min(from[1], at[1]),
          w: Math.abs(at[0] - from[0]),
          h: Math.abs(at[1] - from[1]),
        };
      redrawMarks();
    };
    const up = (ev: PointerEvent) => {
      overlay.removeEventListener('pointermove', move);
      overlay.removeEventListener('pointerup', up);
      if (!pen && Math.hypot(ev.clientX - startX, ev.clientY - startY) < DRAG_PX)
        draft.box = { x: from[0], y: from[1], w: 0, h: 0 };
      redrawMarks();
      openComposer();
    };
    overlay.addEventListener('pointermove', move);
    overlay.addEventListener('pointerup', up);
  });
  penBtn.addEventListener('click', () => {
    pen = !pen;
    penBtn.classList.toggle('on', pen);
    overlay.classList.toggle('pen', pen);
  });
  window.addEventListener('keydown', (e) => {
    if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) {
      if (e.key === 'Escape') closeComposer();
      return;
    }
    if (e.key === 'n') {
      e.preventDefault();
      openComposer();
    } else if (e.key === 'Escape') closeComposer();
  });

  // ── The notes: pins on the timeline and a list with threads. ──
  const select = (note: Note) => {
    selected = note.id;
    player.seek(note.T);
    renderList();
  };
  const ticks: HTMLElement[] = [];
  const renderTicks = () => {
    for (const t of ticks) t.remove();
    ticks.length = 0;
    const head = player.track.querySelector('.head');
    for (const note of notes) {
      const tick = el('div', `tick note ${note.status}`);
      tick.dataset['name'] = `${note.id} · ${note.status} · ${note.text}`;
      tick.style.left = `${(note.T / film.duration) * 100}%`;
      tick.addEventListener('pointerdown', (e) => {
        e.stopPropagation();
        select(note);
      });
      player.track.insertBefore(tick, head);
      ticks.push(tick);
    }
  };
  const still = (name: string, cls: string) => {
    const img = el('img', cls);
    img.src = `/lab/stills/${name}`;
    img.alt = name;
    img.loading = 'lazy';
    return img;
  };
  const renderList = () => {
    list.replaceChildren(
      ...[...notes].reverse().map((note) => {
        const item = el(
          'li',
          `lab-note-item ${note.status}${note.id === selected ? ' selected' : ''}`,
        );
        item.dataset['id'] = note.id;
        const head = el('div', 'lab-note-head');
        head.append(
          el('span', 'lab-note-label', label(note)),
          el('span', `lab-badge ${note.status}`, note.status),
        );
        item.append(head, el('p', 'lab-note-text', note.text), still(note.still, 'lab-still'));
        const thread = el('ol', 'lab-thread');
        for (const reply of note.thread) {
          const r = el('li', `lab-reply ${reply.by}`);
          r.append(el('span', 'lab-by', reply.by), el('p', 'lab-reply-text', reply.text));
          if (reply.still !== undefined) r.append(still(reply.still, 'lab-still'));
          thread.append(r);
        }
        item.append(thread);
        if (note.id === selected && note.status !== 'resolved') {
          const form = el('form', 'lab-reply-form');
          const input = el('input', 'lab-reply-input');
          input.placeholder = 'Reply…';
          const resolve = el('button', 'lab-resolve', 'Resolve');
          resolve.type = 'button';
          form.append(input, resolve);
          form.addEventListener('submit', (e) => {
            e.preventDefault();
            const text = input.value.trim();
            if (text === '') return;
            void post(`/lab/notes/${note.id}/reply`, { text }).then(refresh);
          });
          resolve.addEventListener('click', () => {
            void post(`/lab/notes/${note.id}/resolve`, {}).then(refresh);
          });
          item.append(form);
        }
        item.addEventListener('click', (e) => {
          if (e.target instanceof HTMLInputElement || e.target instanceof HTMLButtonElement) return;
          select(note);
        });
        return item;
      }),
    );
    redrawMarks();
  };
  const refresh = async () => {
    const res = await fetch('/lab/notes');
    if (!res.ok) throw new Error(`/lab/notes: ${res.status}`);
    const file = decodeNotes(await res.json());
    notes = file.notes;
    cursor = Math.max(cursor, file.seq);
    renderTicks();
    renderList();
  };

  // ── Live: each change (a note, a reply from the agent, a resolve) as it lands. ──
  const follow = (): void => {
    fetch(`/lab/notes/wait?since=${cursor}&timeout=55`)
      .then(async (res) => {
        if (!res.ok) throw new Error(`/lab/notes/wait: ${res.status}`);
        const waited = decodeWait(await res.json());
        if (waited.events.length > 0) await refresh();
        cursor = Math.max(cursor, waited.cursor);
      })
      .then(follow, (err: unknown) => {
        console.warn(`[lab] wait failed film=${filmName} reason=${String(err)}`);
        setTimeout(follow, 2000);
      });
  };
  void refresh().then(follow);
};
