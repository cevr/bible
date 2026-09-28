// The lab's knobs, until they move to Solid: the inspector's knob rows for
// the inspected scene, and a handle on the frame for each point knob read
// there. The editor's machine makes every write (`bridge.commit`), and the
// shell keeps the selection; this module only draws the rows and the handles
// and turns a drag into a commit.

import { Option, Result, Schema } from 'effect';
import type { SceneSpec } from '../canvas/film.ts';
import { type Affine, applyAffine, invertAffine, sameAffine } from '../core/affine.ts';
import { type Placed, sceneOf } from '../core/layout.ts';
import { type Knob, type Knobs, Point, type SceneSource } from '../core/schema.ts';
import { el, svg } from './dom.ts';
import type { Player } from './main.ts';

const isPoint = Schema.is(Point);

/** Seconds and pixels to the thousandth, as the write stores them. */
const round = (v: number) => Math.round(v * 1000) / 1000 + 0;

/** A knob selected, as the shell keeps it. */
export interface KnobSelection {
  readonly kind: 'cue' | 'knob';
  readonly scene: string;
  readonly name: string;
}

/** What the knobs read from the editor and the shell, and how they write. */
export interface KnobsBridge {
  readonly selection: () => Option.Option<KnobSelection>;
  readonly selectKnob: (scene: string, name: string) => void;
  /** What the lab knows of `scene`'s source, if it has read it. */
  readonly source: (scene: string) => Option.Option<SceneSource>;
  /** The knobs shown for `scene`: previewed, else declared. */
  readonly knobsOf: (scene: string) => Knobs;
  /** Show `knobs` for `scene` in memory while a handle is dragged. */
  readonly preview: (scene: string, knobs: Knobs) => void;
  /** Write knob `name` of `scene` as `value`, shown first as `knobs`. */
  readonly commit: (scene: string, name: string, value: Knob, knobs: Knobs) => void;
  /** Say why a knob cannot be moved. */
  readonly refuse: (message: string) => void;
}

/** What the editor calls when what the knobs show has changed. */
export interface KnobsView {
  readonly refresh: () => void;
}

export const mountKnobs = (
  player: Player,
  overlay: SVGSVGElement,
  host: HTMLElement,
  bridge: KnobsBridge,
): KnobsView => {
  const { film } = player;
  const placedOf = (scene: string): Placed<SceneSpec> | undefined =>
    Result.getOrUndefined(sceneOf(film.placed, scene));
  const inspected = () =>
    Option.match(bridge.selection(), {
      onNone: () => film.sceneAt(player.now()).spec.id,
      onSome: (s) => s.scene,
    });
  const refusal = (scene: string) =>
    Option.flatMap(bridge.source(scene), (s) =>
      Option.fromUndefinedOr(s.refused.find((r) => r.field === 'knobs')?.reason),
    );
  const whyNot = (scene: string) =>
    Option.getOrElse(refusal(scene), () => 'it is computed in the source');
  const knobWritable = (scene: string, name: string) =>
    Option.exists(
      bridge.source(scene),
      (s) => s.knobs.find((k) => k.name === name)?.state === 'literal',
    );

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
    const selected = bridge.selection();
    for (const at of handlePoints(scene)) {
      const [x, y] = applyAffine(at.m, at.value);
      const g = svg('g', { class: 'lab-handle', 'data-knob': at.name });
      if (Option.exists(selected, (s) => s.kind === 'knob' && s.name === at.name))
        g.classList.add('selected');
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
    bridge.selectKnob(scene, name);
    if (!knobWritable(scene, name)) {
      bridge.refuse(`cannot move ${name}: ${whyNot(scene)}`);
      return;
    }
    const from = at.value;
    // Where on the handle it was grabbed, so the knob does not jump to the pointer.
    const grab = applyAffine(at.m, from);
    const start = toCanvas(e);
    let value: Point = from;
    const move = (ev: PointerEvent) => {
      const now = toCanvas(ev);
      const [x, y] = applyAffine(at.inv, [
        grab[0] + now[0] - start[0],
        grab[1] + now[1] - start[1],
      ]);
      value = [Math.round(x), Math.round(y)];
      bridge.preview(scene, { ...bridge.knobsOf(scene), [name]: value });
    };
    const up = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      if (value[0] === from[0] && value[1] === from[1]) return;
      bridge.commit(scene, name, value, { ...bridge.knobsOf(scene), [name]: value });
    };
    // On the window: the handles are drawn again as the frame redraws.
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  };

  // ── The knob rows of the inspector. ──
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

  const knobsInspector = (p: Placed<SceneSpec>) => {
    const box = el('div', 'lab-edit-knobs');
    const scene = p.spec.id;
    const knobs = bridge.knobsOf(scene);
    const names = Object.keys(knobs);
    if (names.length === 0) return box;
    box.append(el('div', 'lab-edit-title', `${scene} · knobs`));
    const selected = bridge.selection();
    for (const name of names) {
      const value = knobs[name];
      if (value === undefined) continue;
      const row = el('div', 'lab-knob');
      row.dataset['knob'] = name;
      if (Option.exists(selected, (s) => s.kind === 'knob' && s.name === name))
        row.classList.add('selected');
      row.append(el('span', 'lab-edit-key', name));
      const ok = knobWritable(scene, name);
      const commit = (v: Knob) => bridge.commit(scene, name, v, { ...knobs, [name]: v });
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
          el(
            'span',
            'lab-edit-note',
            Option.getOrElse(refusal(scene), () => 'computed in the source'),
          ),
        );
      box.append(row);
    }
    return box;
  };

  /** Each point knob row's note: whether this frame has its handle, and if not, why. */
  const placeWhere = () => {
    const scene = inspected();
    for (const note of host.querySelectorAll<HTMLElement>('.lab-knob-where')) {
      const name = note.closest<HTMLElement>('.lab-knob')?.dataset['knob'];
      if (name === undefined) continue;
      const at = handleOf(scene, name);
      note.textContent = at.kind === 'handle' ? 'drag its handle on the frame' : at.why;
    }
  };

  const refresh = () => {
    const p = placedOf(inspected());
    host.replaceChildren();
    if (p !== undefined) host.append(knobsInspector(p));
    placeWhere();
    renderHandles();
  };

  // Handles follow the frame, a dragged knob's included, and so do the rows' notes on them.
  player.onDraw(() => {
    renderHandles();
    placeWhere();
  });
  refresh();
  const view: KnobsView = { refresh };
  return view;
};
