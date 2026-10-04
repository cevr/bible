// The knobs: the inspected scene's knob rows in the editor's section, and a
// handle on the frame for each point knob the frame under the playhead read.
// Both read the editor's context and write through its machine: a row's
// field commits from rest, a handle's press grabs the knob (the machine
// previews each move and writes on release). The handles are drawn again with
// every frame, a dragged knob's included.
//
// A handle sits where the frame drew the knob: through the transform it was
// read under or, read before a camera, through the camera (`handleOf`). A
// camera's target (`<name>` beside `<name>Zoom`) is a reticle; while the
// camera sits on it, its drag moves the picture (`knobMode`).

import { For, Show } from '@solidjs/web';
import { Option, Schema } from 'effect';
import type { Accessor } from 'solid-js';
import { createMemo } from 'solid-js';
import { type Knob, Point } from '../../core/schema.ts';
import { useLab } from '../shell.tsx';
import { useEditor } from './context.tsx';
import { knobRefusal } from './grip.ts';
import { type Handle, handleOf, handlesOf, isCameraTarget } from './handles.ts';
import { knobOf } from '../../command/selection.ts';
import { Target } from '../command/context-menu.tsx';
import { Field } from '../command/inspector.tsx';

const pointOf = (value: Knob): Option.Option<Point> =>
  Option.liftPredicate(value, Schema.is(Point));

/** Whether knob `name` of `scene` is the one selected. */
const useSelected = () => {
  const { state } = useLab();
  return (scene: string, name: string) =>
    Option.exists(
      state.selection(),
      (s) => s._tag === 'Knob' && s.scene === scene && s.name === name,
    );
};

/** The inspected scene's knobs, as shown now: previewed, else declared. */
const useKnobs = () => {
  const { state: lab, meta } = useLab();
  const { state } = useEditor();
  return createMemo(() => {
    lab.revision();
    return meta.stage.knobsOf(state.inspected());
  });
};

/** Why this frame has no handle for knob `name`, if it has none (how to drag one is the hint's). */
const Where = (props: { readonly scene: string; readonly name: string }) => {
  const { state: lab, meta } = useLab();
  const why = () => {
    lab.drawn();
    const at = handleOf(meta.player.knobReads(), props.scene, props.name);
    if (at._tag === 'NoHandle') return Option.some(at.why);
    return Option.none<string>();
  };
  return (
    <Show when={Option.getOrUndefined(why())}>
      {(text: Accessor<string>) => <span class="lab-edit-note lab-knob-where">{text()}</span>}
    </Show>
  );
};

/**
 * One knob's row: its name, its value's fields (the inspector's, stepped as
 * the knob's schema says: a number's name is its scrubby label, a point's
 * x and y step by pixels), and why it cannot be written, if it cannot.
 */
const Row = (props: { readonly scene: string; readonly name: string; readonly value: Knob }) => {
  const { state } = useEditor();
  const selected = useSelected();
  const fields = createMemo(() => state.fieldsOf(knobOf(props.scene, props.name)));
  const field = (id: string) => fields().find((f) => f.id === id);
  const refusal = () =>
    knobRefusal(state.inspectedSource().source, state.inspectedSource().error, props.name);
  return (
    <Target
      of={knobOf(props.scene, props.name)}
      class={['lab-knob', { selected: selected(props.scene, props.name) }]}
      data-knob={props.name}
    >
      <Show
        when={Option.isSome(pointOf(props.value))}
        fallback={
          <Show when={field('value')}>
            {(f) => <Field field={f()} label={<span class="lab-edit-key">{props.name}</span>} />}
          </Show>
        }
      >
        <span class="lab-edit-key">{props.name}</span>
        <Show when={field('x')}>{(f) => <Field field={f()} />}</Show>
        <Show when={field('y')}>{(f) => <Field field={f()} />}</Show>
        <Where scene={props.scene} name={props.name} />
      </Show>
      <Show when={Option.getOrUndefined(refusal())}>
        {(why: Accessor<string>) => <span class="lab-edit-note">{why()}</span>}
      </Show>
    </Target>
  );
};

/** The inspected scene's knob rows. */
export const Rows = () => {
  const { state } = useEditor();
  const knobs = useKnobs();
  // Every declared knob, 0 and all: a row per entry, kept by its name.
  const entries = () => Object.entries(knobs());
  return (
    <Show when={entries().length > 0}>
      <div class="lab-edit-knobs">
        <div class="lab-edit-title">{`${state.inspected()} · knobs`}</div>
        <For each={entries()} keyed={([name]) => name}>
          {(entry) => <Row scene={state.inspected()} name={entry()[0]} value={entry()[1]} />}
        </For>
      </div>
    </Show>
  );
};

interface MarkProps {
  readonly scene: string;
  readonly handle: Accessor<Handle & { readonly name: string }>;
}

/** Grab the knob a handle stands for: the handle, not a note, so the overlay never sees the press. */
const useGrab = (props: MarkProps) => {
  const { actions } = useEditor();
  return (el: SVGGElement) =>
    el.addEventListener('pointerdown', (e) => {
      e.stopPropagation();
      e.preventDefault();
      Option.map(Option.fromNullishOr(el.ownerSVGElement), (svg) => {
        const r = svg.getBoundingClientRect();
        actions.grabKnob({
          scene: props.scene,
          knob: props.handle().name,
          handle: props.handle(),
          box: { left: r.left, top: r.top, width: r.width, height: r.height },
          down: e,
        });
      });
    });
};

/** A point knob's handle: a ring with a cross through it. */
const PointMark = (props: MarkProps) => {
  const selected = useSelected();
  const grab = useGrab(props);
  const x = () => props.handle().at[0];
  const y = () => props.handle().at[1];
  return (
    <g
      class={['lab-handle', { selected: selected(props.scene, props.handle().name) }]}
      data-knob={props.handle().name}
      ref={grab}
    >
      <title>{`${props.handle().name}: drag to move it`}</title>
      <circle cx={x()} cy={y()} r="18" />
      <line x1={x() - 28} y1={y()} x2={x() + 28} y2={y()} />
      <line x1={x()} y1={y() - 28} x2={x()} y2={y() + 28} />
    </g>
  );
};

/** A reticle's corner brackets around (0, 0), `r` out, each arm `arm` long. */
const brackets = (r: number, arm: number) =>
  [
    [-1, -1],
    [1, -1],
    [1, 1],
    [-1, 1],
  ]
    .map(([sx = 0, sy = 0]) => {
      const cx = sx * r;
      const cy = sy * r;
      return `M${cx - sx * arm},${cy} L${cx},${cy} L${cx},${cy - sy * arm}`;
    })
    .join(' ');

/** A camera's target: a reticle, the framing the camera keeps on it. */
const ReticleMark = (props: MarkProps) => {
  const selected = useSelected();
  const grab = useGrab(props);
  return (
    <g
      class={['lab-handle', 'reticle', { selected: selected(props.scene, props.handle().name) }]}
      data-knob={props.handle().name}
      transform={`translate(${props.handle().at[0]} ${props.handle().at[1]})`}
      ref={grab}
    >
      <title>{`${props.handle().name}: drag to move it`}</title>
      <rect x="-26" y="-26" width="52" height="52" />
      <path d={brackets(26, 12)} />
      <circle cx="0" cy="0" r="3" />
    </g>
  );
};

/** The handles of the scene under the playhead, on the lab's overlay. */
export const Handles = () => {
  const { state: lab, meta } = useLab();
  const { state } = useEditor();
  const handles = createMemo(() => {
    lab.drawn();
    return handlesOf(meta.player.knobReads(), state.stripScene());
  });
  const knobs = createMemo(() => {
    lab.revision();
    return meta.stage.knobsOf(state.stripScene());
  });
  return (
    <g class="lab-handles">
      <For each={handles()} keyed={(h) => h.name}>
        {(h) => (
          <Show
            when={isCameraTarget(knobs(), h().name)}
            fallback={<PointMark scene={state.stripScene()} handle={h} />}
          >
            <ReticleMark scene={state.stripScene()} handle={h} />
          </Show>
        )}
      </For>
    </g>
  );
};
