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
import { toMs } from '../../core/time.ts';
import { useLab } from '../shell.tsx';
import { useEditor } from './context.tsx';
import { KnobWrite, knobRefusal } from './grip.ts';
import { type Handle, handleOf, handlesOf, isCameraTarget } from './handles.ts';
import { knobOf } from '../../command/selection.ts';
import { Target } from '../command/context-menu.tsx';
import { NumberField } from './inspector.tsx';

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

/** Whether this frame has knob `name`'s handle, and if not, why. */
const Where = (props: { readonly scene: string; readonly name: string }) => {
  const { state: lab, meta } = useLab();
  const text = () => {
    lab.drawn();
    const at = handleOf(meta.player.knobReads(), props.scene, props.name);
    if (at._tag === 'NoHandle') return at.why;
    return 'drag its handle on the frame';
  };
  return <span class="lab-edit-note lab-knob-where">{text()}</span>;
};

/** One knob's row: its name, its value's fields, and why it cannot be written, if it cannot. */
const Row = (props: { readonly scene: string; readonly name: string; readonly value: Knob }) => {
  const { state, actions } = useEditor();
  const knobs = useKnobs();
  const selected = useSelected();
  const refusal = () =>
    knobRefusal(state.inspectedSource().source, state.inspectedSource().error, props.name);
  const writable = () => Option.isNone(refusal());
  const commit = (value: Knob) =>
    actions.commit(KnobWrite.make({ scene: props.scene, knob: props.name, value }), {
      knobs: { ...knobs(), [props.name]: value },
    });
  return (
    <Target
      of={knobOf(props.scene, props.name)}
      class={['lab-knob', { selected: selected(props.scene, props.name) }]}
      data-knob={props.name}
    >
      <span class="lab-edit-key">{props.name}</span>
      <Show
        when={Option.getOrUndefined(pointOf(props.value))}
        fallback={
          <NumberField
            field="value"
            value={Number(props.value)}
            writable={writable()}
            commit={(v) => commit(toMs(v))}
          />
        }
      >
        {(p: Accessor<Point>) => (
          <>
            <NumberField
              field="x"
              value={p()[0]}
              writable={writable()}
              commit={(v) => commit([toMs(v), p()[1]])}
            />
            <NumberField
              field="y"
              value={p()[1]}
              writable={writable()}
              commit={(v) => commit([p()[0], toMs(v)])}
            />
            <Where scene={props.scene} name={props.name} />
          </>
        )}
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
