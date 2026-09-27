// The lab's editor: the current scene's cues on a zoomed strip under the
// film's timeline, draggable, and an inspector for the selected cue and the
// scene's knobs. A drag previews in memory — `film.preview`, which resolves
// the edited timeline on the scene's own clock exactly as the layout does —
// and writes once, on release (`POST /lab/<film>/cues/:scene/:cue`). Each write
// lands in the scene's `.ts` file; the dev server rebuilds and the page
// reloads at the same `#T`, with the selection kept in the URL
// (`&sel=cue:hand:topple`). `film check --static` runs after every write, and
// its findings show under the inspector.
//
// On the strip: drag a cue's body to move its offset, its left edge to move
// its start (offset and dur), its right edge to move its end (dur). Edges
// snap to word starts and ends, marks and other cues' edges within a few
// pixels, else move by whole frames; hold shift to place freely.

import { Option, Result, Schema } from 'effect';
import type { SceneEdit, SceneSpec } from '../canvas/film.ts';
import { type Affine, applyAffine, invertAffine, sameAffine } from '../core/affine.ts';
import { type Placed, sceneOf } from '../core/layout.ts';
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
import { el, postJson, required, svg } from './dom.ts';
import type { Player } from './main.ts';

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

/** A write to the lab's API, answered with what landed. */
const post = (url: string, body: unknown) => postJson(url, body).then(decodeWrite);

/**
 * Mount the editor: the strip in the player's bar, the inspector at the top
 * of the lab panel, and knob handles on the lab's overlay.
 */
/** What the rest of the lab reads from the editor. */
export interface Editor {
  /** The cue selected on the strip, if a cue is selected. */
  readonly selectedCue: () => { readonly scene: string; readonly name: string } | undefined;
}

export const mountEditor = (
  player: Player,
  panel: HTMLElement,
  overlay: SVGSVGElement,
  api: string,
): Editor => {
  const { film } = player;

  // ── State. ──
  let selection = selectionFromUrl();
  /** The scene the strip shows. */
  let stripScene: string | undefined;
  /**
   * What the lab knows of a scene's source: the strip scene's and the
   * selection's, which differ once the playhead leaves the selected scene.
   * Each is fetched again when its scene is shown or selected.
   */
  const sources = new Map<string, SceneSource | { readonly error: string }>();
  const sourceOf = (scene: string): SceneSource | undefined => {
    const known = sources.get(scene);
    return known === undefined || 'error' in known ? undefined : known;
  };
  const sourceErrorOf = (scene: string): string => {
    const known = sources.get(scene);
    return known !== undefined && 'error' in known ? known.error : '';
  };
  /** An edit previewed and not yet reloaded from source, by scene. */
  const edits = new Map<string, SceneEdit>();
  let findings: ReadonlyArray<CheckLine> = [];
  let status = '';
  let dragging = false;

  const placedOf = (scene: string): Placed<SceneSpec> | undefined =>
    Result.getOrUndefined(sceneOf(film.placed, scene));
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
    stripHead.textContent = `${p.spec.id} · ${p.dur.toFixed(2)}s · ${sourceOf(p.spec.id)?.file ?? sourceErrorOf(p.spec.id)}`;
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

  /** Why the lab will not write a scene's timeline or knobs at all, when it will not. */
  const refusal = (scene: string, field: 'timeline' | 'knobs') =>
    sourceOf(scene)?.refused.find((r) => r.field === field)?.reason;
  /** Why a cue's or knob's value cannot be written: the field refused, else computed. */
  const whyNot = (scene: string, field: 'timeline' | 'knobs') =>
    refusal(scene, field) ?? 'it is computed in the source';

  /** A field of a scene's cue the lab may write: a literal, or absent (then added). */
  const writable = (scene: string, cue: string, field: 'offset' | 'dur' | 'ease') => {
    const found = sourceOf(scene)?.cues.find((c) => c.name === cue);
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
    const scene = p.spec.id;
    if (sourceOf(scene) === undefined || !needs.every((f) => writable(scene, cue, f))) {
      setStatus(
        sourceOf(scene) === undefined
          ? `cannot edit: ${sourceErrorOf(scene) || 'no source for this scene'}`
          : refusal(scene, 'timeline') !== undefined
            ? `cannot drag ${cue}: ${whyNot(scene, 'timeline')}`
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
    const unresolved = w.unresolved === undefined ? '' : ` (not resolved: ${w.unresolved})`;
    setStatus(`wrote ${w.file}: ${w.target}${unresolved}`);
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
    post(`${api}/cues/${encodeURIComponent(scene)}/${encodeURIComponent(cue)}`, patch).then(
      shown,
      (err: unknown) => failed(scene, err),
    );
  };
  const writeKnob = (scene: string, knob: string, value: Knob) => {
    setStatus('writing…');
    post(`${api}/knobs/${encodeURIComponent(scene)}/${encodeURIComponent(knob)}`, { value }).then(
      shown,
      (err: unknown) => failed(scene, err),
    );
  };

  // ── Knob handles on the frame. ──
  const handles = svg('g', { class: 'lab-handles' });
  overlay.append(handles);
  /**
   * A point knob's handle: where the frame last read it, as a transform from
   * the knob's space to the frame. Only when every read this frame was
   * straight onto the frame (not a transition's layer) under one invertible
   * transform; otherwise why there is no handle.
   */
  type HandleAt =
    | { readonly kind: 'handle'; readonly value: Point; readonly m: Affine; readonly inv: Affine }
    | { readonly kind: 'none'; readonly why: string };
  const handleOf = (scene: string, name: string): HandleAt => {
    const mine = player.knobReads().filter((r) => r.scene === scene && r.name === name);
    const first = mine[0];
    if (first === undefined) return { kind: 'none', why: 'not read at this frame: numbers only' };
    const value = first.value;
    if (!isPoint(value)) return { kind: 'none', why: 'a number' };
    const m = first.transform;
    if (m === undefined || mine.some((r) => r.transform === undefined))
      return { kind: 'none', why: 'read inside a transition here: numbers only' };
    if (mine.some((r) => r.transform === undefined || !sameAffine(r.transform, m)))
      return { kind: 'none', why: 'read under more than one transform here: numbers only' };
    return Option.match(invertAffine(m), {
      onNone: (): HandleAt => ({ kind: 'none', why: 'drawn squashed flat here: numbers only' }),
      onSome: (inv): HandleAt => ({ kind: 'handle', value, m, inv }),
    });
  };
  /** Point knobs with a handle on the frame now. */
  const handlePoints = (scene: string) => {
    const names = new Set(
      player
        .knobReads()
        .filter((r) => r.scene === scene)
        .map((r) => r.name),
    );
    return [...names].flatMap((name) => {
      const at = handleOf(scene, name);
      return at.kind === 'handle' ? [{ name, ...at }] : [];
    });
  };
  const renderHandles = () => {
    handles.replaceChildren();
    const scene = film.sceneAt(player.now()).spec.id;
    for (const at of handlePoints(scene)) {
      const [x, y] = applyAffine(at.m, at.value);
      const g = svg('g', { class: 'lab-handle', 'data-knob': at.name });
      const selected = selection?.kind === 'knob' && selection.name === at.name;
      if (selected) g.classList.add('selected');
      g.append(
        svg('circle', { cx: `${x}`, cy: `${y}`, r: '18' }),
        svg('line', { x1: `${x - 28}`, y1: `${y}`, x2: `${x + 28}`, y2: `${y}` }),
        svg('line', { x1: `${x}`, y1: `${y - 28}`, x2: `${x}`, y2: `${y + 28}` }),
      );
      g.addEventListener('pointerdown', (e) => dragKnob(e, scene, at.name, at));
      handles.append(g);
    }
  };
  /** A pointer's position in frame pixels. */
  const toCanvas = (e: PointerEvent): Point => {
    const r = overlay.getBoundingClientRect();
    return [
      ((e.clientX - r.left) / r.width) * film.width,
      ((e.clientY - r.top) / r.height) * film.height,
    ];
  };
  /**
   * Drag a point knob's handle: the pointer moves in frame pixels, and the
   * knob by the same move taken back through the transform it was read
   * under, to whole units of its own space.
   */
  const dragKnob = (
    e: PointerEvent,
    scene: string,
    name: string,
    at: { readonly value: Point; readonly m: Affine; readonly inv: Affine },
  ) => {
    // The handle, not a note: the overlay never sees this press.
    e.stopPropagation();
    e.preventDefault();
    player.pause();
    select({ kind: 'knob', scene, name });
    const p = placedOf(scene);
    if (p === undefined) return;
    if (!knobWritable(scene, name)) {
      setStatus(`cannot move ${name}: ${whyNot(scene, 'knobs')}`);
      return;
    }
    const from = at.value;
    // Where on the handle it was grabbed, so the knob does not jump to the pointer.
    const grab = applyAffine(at.m, from);
    const start = toCanvas(e);
    let value: Point = from;
    dragging = true;
    const move = (ev: PointerEvent) => {
      const now = toCanvas(ev);
      const [x, y] = applyAffine(at.inv, [
        grab[0] + now[0] - start[0],
        grab[1] + now[1] - start[1],
      ]);
      value = [Math.round(x), Math.round(y)];
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
  const knobWritable = (scene: string, name: string) =>
    sourceOf(scene)?.knobs.find((k) => k.name === name)?.state === 'literal';

  // ── The inspector. ──
  const section = el('section', 'lab-edit');
  section.innerHTML = `
    <header>
      <strong>Edit</strong>
      <span class="lab-edit-file"></span>
      <button data-act="undo" title="put the scene file back as it was before the newest write (⌘Z)" disabled>Undo</button>
      <button data-act="redo" title="make the newest undone write again (⇧⌘Z)" disabled>Redo</button>
    </header>
    <div class="lab-edit-body"></div>
    <ul class="lab-findings"></ul>
    <div class="lab-edit-status"></div>`;
  const header = panel.querySelector('header');
  if (header === null) panel.prepend(section);
  else header.after(section);
  const q = <T extends Element>(sel: string) => required<T>(section, sel);
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
    const offset = numberInput(span.offset ?? 0, writable(p.spec.id, name, 'offset'), (v) => {
      preview(p.spec.id, {
        ...edits.get(p.spec.id),
        timeline: { ...declaredTimeline(p), [name]: { ...span, offset: v } },
      });
      renderStrip();
      writeCue(p.spec.id, name, { offset: round(v) });
    });
    offset.dataset['field'] = 'offset';
    const dur = numberInput(span.dur ?? 0, writable(p.spec.id, name, 'dur'), (v) => {
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
    const canEase = writable(p.spec.id, name, 'ease');
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
    return box;
  };

  const knobsInspector = (p: Placed<SceneSpec>) => {
    const box = el('div', 'lab-edit-knobs');
    const knobs = Object.keys(declaredKnobs(p));
    if (knobs.length === 0) return box;
    box.append(el('div', 'lab-edit-title', `${p.spec.id} · knobs`));
    for (const name of knobs) {
      const value = knobValue(p, name);
      if (value === undefined) continue;
      const row = el('div', 'lab-knob');
      row.dataset['knob'] = name;
      if (selection?.kind === 'knob' && selection.name === name) row.classList.add('selected');
      row.append(el('span', 'lab-edit-key', name));
      const ok = knobWritable(p.spec.id, name);
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
        // Filled, and kept current frame by frame, by `placeWhere`.
        row.append(el('span', 'lab-edit-note lab-knob-where'));
      }
      if (!ok)
        row.append(
          el('span', 'lab-edit-note', refusal(p.spec.id, 'knobs') ?? 'computed in the source'),
        );
      box.append(row);
    }
    return box;
  };

  /** Each point knob row's note: whether this frame has its handle, and if not, why. */
  const placeWhere = () => {
    const scene = selection?.scene ?? film.sceneAt(player.now()).spec.id;
    for (const note of body.querySelectorAll<HTMLElement>('.lab-knob-where')) {
      const name = note.closest<HTMLElement>('.lab-knob')?.dataset['knob'];
      if (name === undefined) continue;
      const at = handleOf(scene, name);
      note.textContent = at.kind === 'handle' ? 'drag its handle on the frame' : at.why;
    }
  };

  const renderInspector = () => {
    const scene = selection?.scene ?? film.sceneAt(player.now()).spec.id;
    const p = placedOf(scene);
    fileEl.textContent = sourceOf(scene)?.file ?? '';
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
    placeWhere();
  };

  const select = (sel: Selection) => {
    // The selection's scene may not be the one shown: its source is its own.
    if (sel.scene !== stripScene) loadSource(sel.scene);
    selection = sel;
    selectionToUrl(sel);
    renderStrip();
    renderInspector();
    renderHandles();
  };

  // ── Undo and Redo: the server's bounded stack of the lab's writes. Each
  // changes a scene file, so the page reloads and learns what it did from
  // `check` (`latest`), and whether there is more to undo or redo. ──
  const undoBtn = q<HTMLButtonElement>('[data-act="undo"]');
  const redoBtn = q<HTMLButtonElement>('[data-act="redo"]');
  const step = (verb: 'undo' | 'redo') => {
    setStatus(`${verb === 'undo' ? 'undoing' : 'redoing'}…`);
    post(`${api}/${verb}`, {})
      .then((w) => {
        findings = w.findings;
        setStatus(
          `${verb === 'undo' ? 'undid' : 'redid'} ${w.target.replace(/^(undo|redo) /, '')} in ${w.file}`,
        );
        renderInspector();
      })
      .catch((err: unknown) => setStatus(String(err instanceof Error ? err.message : err)));
  };
  undoBtn.addEventListener('click', () => step('undo'));
  redoBtn.addEventListener('click', () => step('redo'));
  window.addEventListener('keydown', (e) => {
    if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
    if (!(e.metaKey || e.ctrlKey) || e.key.toLowerCase() !== 'z') return;
    e.preventDefault();
    step(e.shiftKey ? 'redo' : 'undo');
  });

  // ── Following the frame: the strip follows the scene shown. ──
  /** Fetch `scene`'s source again; what the lab knew of it stands until the answer lands. */
  const loadSource = (scene: string) => {
    fetch(`${api}/scenes/${encodeURIComponent(scene)}/source`)
      .then(async (res) => {
        if (!res.ok) {
          sources.set(scene, { error: (await res.text()).replace(/^\w+: /, '') });
          return;
        }
        sources.set(scene, decodeSource(await res.json()));
      })
      .catch((err: unknown) => {
        sources.set(scene, { error: String(err) });
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
    // Handles follow the frame, a dragged knob's included, and so do the rows' notes on them.
    renderHandles();
    placeWhere();
  });

  // On load: the selection from the URL, and the film's findings as they stand.
  stripScene = film.sceneAt(player.now()).spec.id;
  loadSource(stripScene);
  if (selection !== undefined) select(selection);
  renderStrip();
  renderHandles();
  fetch(`${api}/check`)
    .then(async (res) => {
      if (!res.ok) throw new Error(await res.text());
      const report = decodeCheck(await res.json());
      findings = report.findings;
      // A write, undo or redo reloads the page before its answer lands: say what it was here.
      if (report.latest !== undefined) status = `${report.latest.file}: ${report.latest.target}`;
      undoBtn.disabled = report.undo === undefined;
      redoBtn.disabled = report.redo === undefined;
      undoBtn.title = `undo ${report.undo?.target ?? '(nothing to undo)'} (⌘Z)`;
      redoBtn.title = `redo ${report.redo?.target ?? '(nothing to redo)'} (⇧⌘Z)`;
      renderInspector();
    })
    .catch((err: unknown) => setStatus(`check: ${String(err)}`));
  const editor: Editor = {
    selectedCue: () =>
      selection?.kind === 'cue' ? { scene: selection.scene, name: selection.name } : undefined,
  };
  return editor;
};
