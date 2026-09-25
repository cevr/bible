// The lab's editor: the current scene's cues on a zoomed strip under the
// film's timeline, draggable, and an inspector for the selected cue and the
// scene's knobs. A drag previews in memory — `film.preview`, which resolves
// the edited timeline on the scene's own clock exactly as the layout does —
// and writes once, on release (`POST /lab/cues/:scene/:cue`). Each write
// lands in the scene's `.ts` file; the dev server rebuilds and the page
// reloads at the same `#T`, with the selection kept in the URL
// (`&sel=cue:hand:topple`). `film check --static` runs after every write, and
// its findings show under the inspector.
//
// On the strip: drag a cue's body to move its offset, its left edge to move
// its start (offset and dur), its right edge to move its end (dur). Edges
// snap to word starts and ends, marks and other cues' edges within a few
// pixels, else move by whole frames; hold shift to place freely.

import { Schema } from 'effect';
import type { SceneEdit, SceneSpec } from '../canvas/film.ts';
import type { Placed } from '../core/layout.ts';
import {
  type CheckLine,
  CheckReport,
  type CuePatch,
  EaseName,
  type Knob,
  type Knobs,
  LabWrite,
  Point,
  SceneSource,
  type Span,
  type Timeline,
} from '../core/schema.ts';
import { ease } from '../core/time.ts';
import { DEFAULT_EASE, type ResolvedCue } from '../core/timeline.ts';
import type { Player } from './main.ts';

const SVG = 'http://www.w3.org/2000/svg';
/** How near (screen pixels) an edge must come to a word, mark or cue edge to snap to it. */
const SNAP_PX = 8;
/** How wide (screen pixels) a cue's edge is to grab. */
const EDGE_PX = 6;

const decodeWrite = Schema.decodeUnknownSync(LabWrite);
const decodeSource = Schema.decodeUnknownSync(SceneSource);
const decodeCheck = Schema.decodeUnknownSync(CheckReport);

/** What the lab has selected: a cue or a knob of a scene. Kept in the URL as `sel`. */
type Selection =
  | { readonly kind: 'cue'; readonly scene: string; readonly name: string }
  | { readonly kind: 'knob'; readonly scene: string; readonly name: string };

type DragMode = 'move' | 'start' | 'end';

/** Where a dragged cue now sits: its offset from its anchor and its length, in seconds. */
interface Placement {
  readonly offset: number;
  readonly dur: number;
}

/** What a drag changes: the body moves the offset, the right edge the dur, the left edge both. */
const patchFor = (mode: DragMode, at: Placement): CuePatch => {
  if (mode === 'move') return { offset: at.offset };
  if (mode === 'end') return { dur: at.dur };
  return { offset: at.offset, dur: at.dur };
};

const isPoint = Schema.is(Point);

const selectionFromUrl = (): Selection | undefined => {
  const raw = new URLSearchParams(location.search).get('sel');
  const [kind, scene, name] = (raw ?? '').split(':');
  if (scene === undefined || name === undefined) return undefined;
  if (kind === 'cue' || kind === 'knob') return { kind, scene, name };
  return undefined;
};

const selectionToUrl = (sel: Selection | undefined) => {
  const params = new URLSearchParams(location.search);
  if (sel === undefined) params.delete('sel');
  else params.set('sel', `${sel.kind}:${sel.scene}:${sel.name}`);
  history.replaceState(null, '', `?${params.toString()}${location.hash}`);
};

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

/** Seconds and pixels to the thousandth, as the write stores them. */
const round = (v: number) => Math.round(v * 1000) / 1000 + 0;

const anchorText = (span: Span) => {
  if ('mark' in span) return `mark {${span.mark}}`;
  if ('after' in span) return `after cue ${span.after}`;
  if ('with' in span) return `with cue ${span.with}`;
  return `scene ${span.scene}`;
};

/** A small drawing of an ease: 0→1 across, with room for an overshoot. */
const curve = (name: EaseName) => {
  const w = 44;
  const h = 30;
  const y = (v: number) => h - 4 - v * (h - 10);
  const pts = Array.from({ length: 33 }, (_, i) => {
    const t = i / 32;
    return `${(2 + t * (w - 4)).toFixed(1)},${y(ease[name](t)).toFixed(1)}`;
  });
  const node = svg('svg', { viewBox: `0 0 ${w} ${h}`, width: `${w}`, height: `${h}` });
  node.append(
    svg('line', { x1: '2', y1: `${y(0)}`, x2: `${w - 2}`, y2: `${y(0)}`, class: 'lab-ease-axis' }),
    svg('line', { x1: '2', y1: `${y(1)}`, x2: `${w - 2}`, y2: `${y(1)}`, class: 'lab-ease-axis' }),
    svg('polyline', { points: pts.join(' '), class: 'lab-ease-curve' }),
  );
  return node;
};

const post = async (url: string, body: unknown) => {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(await res.text());
  return decodeWrite(await res.json());
};

/**
 * Mount the editor: the strip in the player's bar, the inspector at the top
 * of the lab panel, and knob handles on the lab's overlay.
 */
export const mountEditor = (player: Player, panel: HTMLElement, overlay: SVGSVGElement): void => {
  const { film } = player;

  // ── State. ──
  let selection = selectionFromUrl();
  /** The scene the strip shows, and what the lab knows of its source. */
  let stripScene: string | undefined;
  let source: SceneSource | undefined;
  let sourceError = '';
  /** An edit previewed and not yet reloaded from source, by scene. */
  const edits = new Map<string, SceneEdit>();
  let findings: ReadonlyArray<CheckLine> = [];
  let status = '';
  let dragging = false;

  const placedOf = (scene: string): Placed<SceneSpec> | undefined =>
    film.placed.find((p) => p.spec.id === scene);
  const declaredTimeline = (p: Placed<SceneSpec>): Timeline =>
    edits.get(p.spec.id)?.timeline ?? p.spec.timeline ?? {};
  const declaredKnobs = (p: Placed<SceneSpec>): Knobs =>
    edits.get(p.spec.id)?.knobs ?? p.spec.knobs ?? {};
  const knobValue = (p: Placed<SceneSpec>, name: string): Knob | undefined =>
    declaredKnobs(p)[name];

  const preview = (scene: string, edit: SceneEdit | undefined) => {
    if (edit === undefined) edits.delete(scene);
    else edits.set(scene, edit);
    film.preview(scene, edit);
    player.redraw();
  };

  // ── The strip: the current scene, zoomed, under the film's timeline. ──
  const strip = el('div', 'lab-strip');
  const stripHead = el('div', 'lab-strip-head');
  const stripRows = el('div', 'lab-strip-rows');
  const playhead = el('div', 'lab-strip-playhead');
  strip.append(stripHead, stripRows);
  player.track.after(strip);

  const at = (p: Placed<SceneSpec>, t: number) => `${(t / p.dur) * 100}%`;

  const renderStrip = () => {
    const p = placedOf(stripScene ?? '');
    stripRows.replaceChildren();
    if (p === undefined) return;
    stripHead.textContent = `${p.spec.id} · ${p.dur.toFixed(2)}s · ${source?.file ?? sourceError}`;
    const words = el('div', 'lab-strip-words');
    for (const w of p.voice.words) {
      const word = el('span', 'lab-word', w.text);
      word.style.left = at(p, p.speechStart + w.start);
      word.style.width = at(p, Math.max(0.02, w.end - w.start));
      words.append(word);
    }
    for (const [name, m] of p.voice.marks) {
      const mark = el('i', 'lab-strip-mark');
      mark.style.left = at(p, p.speechStart + m);
      mark.title = `{${name}}`;
      words.append(mark);
    }
    stripRows.append(words);
    const cues = film.cuesOf(p.spec.id);
    const declared = declaredTimeline(p);
    for (const [name, c] of cues) {
      const row = el('div', 'lab-strip-row');
      const label = el('span', 'lab-cue-label', name);
      const bar = el('div', 'lab-cue');
      bar.dataset['cue'] = name;
      bar.dataset['scene'] = p.spec.id;
      bar.style.left = at(p, c.start);
      bar.style.width = at(p, c.dur);
      const span = declared[name];
      bar.title = `${name}: ${span === undefined ? '' : anchorText(span)} · ${c.start.toFixed(2)}–${c.end.toFixed(2)}s · ${c.ease}`;
      if (selection?.kind === 'cue' && selection.scene === p.spec.id && selection.name === name)
        bar.classList.add('selected');
      if (c.end > p.dur + 1e-9) bar.classList.add('late');
      bar.addEventListener('pointerdown', (e) => startDrag(e, p, name, bar));
      row.append(label, bar);
      stripRows.append(row);
    }
    stripRows.append(playhead);
    placePlayhead();
  };

  const placePlayhead = () => {
    const p = placedOf(stripScene ?? '');
    if (p === undefined) return;
    playhead.style.left = at(p, Math.max(0, Math.min(p.dur, player.now() - p.start)));
  };

  // A press on the strip outside a cue scrubs within the scene.
  strip.addEventListener('pointerdown', (e) => {
    const p = placedOf(stripScene ?? '');
    if (p === undefined) return;
    const r = stripRows.getBoundingClientRect();
    const seek = (ev: PointerEvent) =>
      player.seek(
        p.start + Math.max(0, Math.min(p.dur, ((ev.clientX - r.left) / r.width) * p.dur)),
      );
    seek(e);
    const move = (ev: PointerEvent) => seek(ev);
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', () => window.removeEventListener('pointermove', move), {
      once: true,
    });
  });

  /** Where an edge may snap: words, marks, and the other cues' edges; scene-local seconds. */
  const snapTargets = (p: Placed<SceneSpec>, skip: string) => [
    ...p.voice.words.flatMap((w) => [p.speechStart + w.start, p.speechStart + w.end]),
    ...[...p.voice.marks.values()].map((m) => p.speechStart + m),
    ...[...film.cuesOf(p.spec.id)].flatMap(([name, c]) => (name === skip ? [] : [c.start, c.end])),
  ];

  /** A field the lab may write: a literal, or absent (then added). */
  const writable = (cue: string, field: 'offset' | 'dur' | 'ease') => {
    const found = source?.cues.find((c) => c.name === cue);
    return found !== undefined && found[field] !== 'computed';
  };

  const startDrag = (e: PointerEvent, p: Placed<SceneSpec>, cue: string, bar: HTMLElement) => {
    e.stopPropagation();
    e.preventDefault();
    player.pause();
    // Measured before selecting: selecting draws the strip again, with new bars.
    const rect = bar.getBoundingClientRect();
    select({ kind: 'cue', scene: p.spec.id, name: cue });
    const mode: DragMode =
      e.clientX - rect.left < EDGE_PX && rect.width > EDGE_PX * 2
        ? 'start'
        : rect.right - e.clientX < EDGE_PX
          ? 'end'
          : 'move';
    const needs: ReadonlyArray<'offset' | 'dur'> =
      mode === 'move' ? ['offset'] : mode === 'end' ? ['dur'] : ['offset', 'dur'];
    if (source === undefined || !needs.every((f) => writable(cue, f))) {
      setStatus(
        source === undefined
          ? `cannot edit: ${sourceError || 'no source for this scene'}`
          : `cannot drag ${cue}: its ${needs.join(' and ')} is computed in the source`,
      );
      return;
    }
    const declared = declaredTimeline(p);
    const span = declared[cue];
    const c0 = film.cuesOf(p.spec.id).get(cue);
    if (span === undefined || c0 === undefined) return;
    const anchor = c0.start - (span.offset ?? 0);
    const width = stripRows.getBoundingClientRect().width;
    const perSec = width / p.dur;
    const targets = snapTargets(p, cue);
    /**
     * Where an edge at `edge` lands when dragged by `dt`: on a word, mark or
     * cue edge within a few pixels, else moved by whole frames (so an offset
     * of 0.1 dragged nine frames at 30 fps reads 0.4); shift places it freely.
     */
    const snap = (edge: number, dt: number, free: boolean) => {
      const t = edge + dt;
      if (free) return t;
      let best = t;
      let gap = SNAP_PX / perSec;
      for (const s of targets)
        if (Math.abs(s - t) < gap) {
          gap = Math.abs(s - t);
          best = s;
        }
      if (best !== t) return best;
      return edge + Math.round(dt * film.fps) / film.fps;
    };
    const x0 = e.clientX;
    const from: Placement = { offset: round(span.offset ?? 0), dur: round(c0.dur) };
    let next = from;
    dragging = true;
    const move = (ev: PointerEvent) => {
      const dt = (ev.clientX - x0) / perSec;
      let start = c0.start;
      let end = c0.end;
      if (mode === 'move') {
        start = snap(c0.start, dt, ev.shiftKey);
        end = start + c0.dur;
      } else if (mode === 'start') start = Math.min(snap(c0.start, dt, ev.shiftKey), c0.end);
      else end = Math.max(snap(c0.end, dt, ev.shiftKey), c0.start);
      next = { offset: round(start - anchor), dur: round(end - start) };
      const edited: Span = { ...span, ...patchFor(mode, next) };
      preview(p.spec.id, { ...edits.get(p.spec.id), timeline: { ...declared, [cue]: edited } });
      renderStrip();
      renderInspector();
    };
    const up = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      dragging = false;
      if (next.offset === from.offset && next.dur === from.dur) return;
      writeCue(p.spec.id, cue, patchFor(mode, next));
    };
    // On the window: the strip redraws its bars as the drag previews.
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  };

  // ── Writes. ──
  const setStatus = (text: string) => {
    status = text;
    statusEl.textContent = text;
  };
  const shown = (w: LabWrite) => {
    findings = w.findings;
    setStatus(`wrote ${w.file}: ${w.target}`);
    renderInspector();
  };
  const failed = (scene: string, err: unknown) => {
    preview(scene, undefined);
    setStatus(String(err instanceof Error ? err.message : err));
    renderStrip();
    renderInspector();
  };
  const writeCue = (scene: string, cue: string, patch: CuePatch) => {
    setStatus('writing…');
    post(`/lab/cues/${encodeURIComponent(scene)}/${encodeURIComponent(cue)}`, patch).then(
      shown,
      (err: unknown) => failed(scene, err),
    );
  };
  const writeKnob = (scene: string, knob: string, value: Knob) => {
    setStatus('writing…');
    post(`/lab/knobs/${encodeURIComponent(scene)}/${encodeURIComponent(knob)}`, { value }).then(
      shown,
      (err: unknown) => failed(scene, err),
    );
  };

  // ── Knob handles on the frame. ──
  const handles = svg('g', { class: 'lab-handles' });
  overlay.append(handles);
  /** Point knobs the frame read straight onto itself, so a handle lands where the knob does. */
  const directPoints = (scene: string) => {
    const reads = player.knobReads().filter((r) => r.scene === scene);
    const names = [...new Set(reads.map((r) => r.name))];
    return names.flatMap((name) => {
      const mine = reads.filter((r) => r.name === name);
      const value = mine[0]?.value;
      if (value === undefined || !isPoint(value)) return [];
      return mine.every((r) => r.direct) ? [{ name, value }] : [];
    });
  };
  const renderHandles = () => {
    handles.replaceChildren();
    const scene = film.sceneAt(player.now()).spec.id;
    for (const { name, value } of directPoints(scene)) {
      const g = svg('g', { class: 'lab-handle', 'data-knob': name });
      const selected = selection?.kind === 'knob' && selection.name === name;
      if (selected) g.classList.add('selected');
      g.append(
        svg('circle', { cx: `${value[0]}`, cy: `${value[1]}`, r: '18' }),
        svg('line', {
          x1: `${value[0] - 28}`,
          y1: `${value[1]}`,
          x2: `${value[0] + 28}`,
          y2: `${value[1]}`,
        }),
        svg('line', {
          x1: `${value[0]}`,
          y1: `${value[1] - 28}`,
          x2: `${value[0]}`,
          y2: `${value[1] + 28}`,
        }),
      );
      g.addEventListener('pointerdown', (e) => dragKnob(e, scene, name, value));
      handles.append(g);
    }
  };
  const toCanvas = (e: PointerEvent): Point => {
    const r = overlay.getBoundingClientRect();
    return [
      Math.round(((e.clientX - r.left) / r.width) * film.width),
      Math.round(((e.clientY - r.top) / r.height) * film.height),
    ];
  };
  const dragKnob = (e: PointerEvent, scene: string, name: string, from: Point) => {
    // The handle, not a note: the overlay never sees this press.
    e.stopPropagation();
    e.preventDefault();
    player.pause();
    select({ kind: 'knob', scene, name });
    const p = placedOf(scene);
    if (p === undefined) return;
    if (!knobWritable(name)) {
      setStatus(`cannot move ${name}: its value is computed in the source`);
      return;
    }
    const start = toCanvas(e);
    let value: Point = from;
    dragging = true;
    const move = (ev: PointerEvent) => {
      const now = toCanvas(ev);
      value = [from[0] + now[0] - start[0], from[1] + now[1] - start[1]];
      preview(scene, { ...edits.get(scene), knobs: { ...declaredKnobs(p), [name]: value } });
      renderInspector();
    };
    const up = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      dragging = false;
      if (value[0] === from[0] && value[1] === from[1]) return;
      writeKnob(scene, name, value);
    };
    // On the window: the handles are drawn again as the frame redraws.
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  };
  const knobWritable = (name: string) =>
    source?.knobs.find((k) => k.name === name)?.state === 'literal';

  // ── The inspector. ──
  const section = el('section', 'lab-edit');
  section.innerHTML = `
    <header>
      <strong>Edit</strong>
      <span class="lab-edit-file"></span>
      <button data-act="undo" title="put the scene file back as it was before the last write">Undo write</button>
    </header>
    <div class="lab-edit-body"></div>
    <ul class="lab-findings"></ul>
    <div class="lab-edit-status"></div>`;
  const header = panel.querySelector('header');
  if (header === null) panel.prepend(section);
  else header.after(section);
  const q = <T extends Element>(sel: string) => {
    const found = section.querySelector<T & Element>(sel);
    if (found === null) throw new Error(`missing ${sel}`);
    return found;
  };
  const fileEl = q<HTMLSpanElement>('.lab-edit-file');
  const body = q<HTMLDivElement>('.lab-edit-body');
  const findingsEl = q<HTMLUListElement>('.lab-findings');
  const statusEl = q<HTMLDivElement>('.lab-edit-status');

  const numberInput = (value: number, enabled: boolean, commit: (v: number) => void) => {
    const input = el('input', 'lab-num');
    input.type = 'number';
    input.step = '0.01';
    input.value = String(round(value));
    input.disabled = !enabled;
    input.addEventListener('change', () => {
      const v = Number.parseFloat(input.value);
      if (Number.isFinite(v)) commit(v);
    });
    return input;
  };

  const cueInspector = (p: Placed<SceneSpec>, name: string) => {
    const span = declaredTimeline(p)[name];
    const c: ResolvedCue | undefined = film.cuesOf(p.spec.id).get(name);
    const box = el('div', 'lab-edit-cue');
    if (span === undefined || c === undefined) {
      box.append(el('p', 'lab-edit-note', `${p.spec.id} has no cue ${name}`));
      return box;
    }
    box.append(el('div', 'lab-edit-title', `${p.spec.id} · cue ${name}`));
    const grid = el('div', 'lab-edit-grid');
    grid.append(el('span', 'lab-edit-key', 'anchor'), el('span', 'lab-edit-val', anchorText(span)));
    const offset = numberInput(span.offset ?? 0, writable(name, 'offset'), (v) => {
      preview(p.spec.id, {
        ...edits.get(p.spec.id),
        timeline: { ...declaredTimeline(p), [name]: { ...span, offset: v } },
      });
      renderStrip();
      writeCue(p.spec.id, name, { offset: round(v) });
    });
    offset.dataset['field'] = 'offset';
    const dur = numberInput(span.dur ?? 0, writable(name, 'dur'), (v) => {
      preview(p.spec.id, {
        ...edits.get(p.spec.id),
        timeline: { ...declaredTimeline(p), [name]: { ...span, dur: Math.max(0, v) } },
      });
      renderStrip();
      writeCue(p.spec.id, name, { dur: round(Math.max(0, v)) });
    });
    dur.dataset['field'] = 'dur';
    grid.append(el('span', 'lab-edit-key', 'offset'), offset);
    grid.append(el('span', 'lab-edit-key', 'dur'), dur);
    grid.append(
      el('span', 'lab-edit-key', 'plays'),
      el('span', 'lab-edit-val', `${c.start.toFixed(2)}–${c.end.toFixed(2)}s in the scene`),
    );
    box.append(grid);
    const declaredEase = span.ease;
    box.append(
      el(
        'div',
        'lab-edit-key',
        `ease: ${c.ease}${declaredEase === undefined ? ` (default, ${DEFAULT_EASE})` : ''}`,
      ),
    );
    const eases = el('div', 'lab-eases');
    const canEase = writable(name, 'ease');
    for (const e of EaseName.literals) {
      const b = el('button', `lab-ease${e === c.ease ? ' on' : ''}`);
      b.type = 'button';
      b.dataset['ease'] = e;
      b.title = e;
      b.disabled = !canEase;
      b.append(curve(e), el('span', '', e));
      b.addEventListener('click', () => {
        if (e === declaredEase) return;
        preview(p.spec.id, {
          ...edits.get(p.spec.id),
          timeline: { ...declaredTimeline(p), [name]: { ...span, ease: e } },
        });
        renderStrip();
        renderInspector();
        writeCue(p.spec.id, name, { ease: e });
      });
      eases.append(b);
    }
    box.append(eases);
    if (player.easedOver().has(`${p.spec.id}:${name}`))
      box.append(
        el(
          'p',
          'lab-edit-note lab-eased-over',
          `This frame draws ${name} with an ease of its own (f.at('${name}', ease.…)); the declared ease changes nothing here.`,
        ),
      );
    return box;
  };

  const knobsInspector = (p: Placed<SceneSpec>) => {
    const box = el('div', 'lab-edit-knobs');
    const knobs = Object.keys(declaredKnobs(p));
    if (knobs.length === 0) return box;
    box.append(el('div', 'lab-edit-title', `${p.spec.id} · knobs`));
    const direct = new Set(directPoints(p.spec.id).map((k) => k.name));
    const reads = new Set(
      player
        .knobReads()
        .filter((r) => r.scene === p.spec.id)
        .map((r) => r.name),
    );
    for (const name of knobs) {
      const value = knobValue(p, name);
      if (value === undefined) continue;
      const row = el('div', 'lab-knob');
      row.dataset['knob'] = name;
      if (selection?.kind === 'knob' && selection.name === name) row.classList.add('selected');
      row.append(el('span', 'lab-edit-key', name));
      const ok = knobWritable(name);
      const commit = (v: Knob) => {
        preview(p.spec.id, { ...edits.get(p.spec.id), knobs: { ...declaredKnobs(p), [name]: v } });
        writeKnob(p.spec.id, name, v);
      };
      if (!isPoint(value)) row.append(numberInput(value, ok, (v) => commit(v)));
      else {
        row.append(
          numberInput(value[0], ok, (v) => commit([v, value[1]])),
          numberInput(value[1], ok, (v) => commit([value[0], v])),
        );
        const where = direct.has(name)
          ? 'drag its handle on the frame'
          : reads.has(name)
            ? 'drawn under a transform here: numbers only'
            : 'not read at this frame: numbers only';
        row.append(el('span', 'lab-edit-note', where));
      }
      if (!ok) row.append(el('span', 'lab-edit-note', 'computed in the source'));
      box.append(row);
    }
    return box;
  };

  const renderInspector = () => {
    const scene = selection?.scene ?? film.sceneAt(player.now()).spec.id;
    const p = placedOf(scene);
    fileEl.textContent = source !== undefined && source.scene === scene ? source.file : '';
    body.replaceChildren();
    if (p !== undefined) {
      if (selection?.kind === 'cue') body.append(cueInspector(p, selection.name));
      body.append(knobsInspector(p));
      if (selection === undefined && film.cuesOf(scene).size > 0)
        body.append(el('p', 'lab-edit-note', 'Select a cue on the strip under the timeline.'));
    }
    findingsEl.replaceChildren(
      ...findings.map((f) => {
        const li = el('li', `lab-finding ${f.level}`);
        li.append(el('b', '', f.tag), document.createTextNode(` ${f.message}`));
        return li;
      }),
    );
    statusEl.textContent = status;
  };

  const select = (sel: Selection) => {
    selection = sel;
    selectionToUrl(sel);
    renderStrip();
    renderInspector();
    renderHandles();
  };

  q<HTMLButtonElement>('[data-act="undo"]').addEventListener('click', () => {
    setStatus('undoing…');
    post('/lab/undo', {})
      .then((w) => {
        findings = w.findings;
        setStatus(`undid ${w.target.replace(/^undo /, '')} in ${w.file}`);
        renderInspector();
      })
      .catch((err: unknown) => setStatus(String(err instanceof Error ? err.message : err)));
  });

  // ── Following the frame: the strip follows the scene shown. ──
  const loadSource = (scene: string) => {
    source = undefined;
    sourceError = '';
    fetch(`/lab/scenes/${encodeURIComponent(scene)}/source`)
      .then(async (res) => {
        if (stripScene !== scene) return;
        if (!res.ok) {
          sourceError = (await res.text()).replace(/^\w+: /, '');
          return;
        }
        source = decodeSource(await res.json());
      })
      .catch((err: unknown) => {
        sourceError = String(err);
      })
      .finally(() => {
        renderStrip();
        renderInspector();
      });
  };
  player.onDraw((T) => {
    const scene = film.sceneAt(T).spec.id;
    if (scene !== stripScene) {
      stripScene = scene;
      renderStrip();
      loadSource(scene);
      if (!dragging) renderInspector();
    } else placePlayhead();
    // Handles follow the frame, a dragged knob's included.
    renderHandles();
  });

  // On load: the selection from the URL, and the film's findings as they stand.
  if (selection !== undefined) select(selection);
  stripScene = film.sceneAt(player.now()).spec.id;
  renderStrip();
  loadSource(stripScene);
  renderHandles();
  fetch('/lab/check')
    .then(async (res) => {
      if (!res.ok) throw new Error(await res.text());
      const report = decodeCheck(await res.json());
      findings = report.findings;
      // A write reloads the page before its answer lands: say what it was here.
      if (report.last !== undefined)
        status = `wrote ${report.last.file}: ${report.last.target} (Undo write puts it back)`;
      renderInspector();
    })
    .catch((err: unknown) => setStatus(`check: ${String(err)}`));
};
