// The editor's section of the panel: Undo and Redo, the selected cue's
// fields (the inspector's, `lab/command/inspector.tsx`, stepped as the cue's
// schema says) and eases, the selection's hint, and the film's check
// findings. Every write goes to the editor's machine as a commit, shown
// first in memory and carrying what it moves, before → after, for the
// receipt it lands with (the page's toast, `lab/command/receipts.tsx`).

import { For, Show } from '@solidjs/web';
import { Array as Arr, Option, Result } from 'effect';
import type { ParentProps } from 'solid-js';
import { createMemo } from 'solid-js';
import type { SceneSpec } from '../../canvas/film.ts';
import { type Placed, sceneOf } from '../../core/layout.ts';
import { EaseName, type ResolvedCue, type Span } from '../../core/schema.ts';
import { DEFAULT_EASE, timecode } from '../../core/time.ts';
import { untilText } from '../../core/timeline.ts';
import { type LabSelection, cueOf } from '../../command/selection.ts';
import { Field, Hint } from '../command/inspector.tsx';
import { useLab } from '../shell.tsx';
import { useEditor } from './context.tsx';
import { EASE_BOX, anchorText, easePoints, easeY, findingsIn } from './format.ts';
import { chordLabel } from '../../command/keymap.ts';
import { hubChanges } from '../command/changes.ts';
import { CueWrite, cueSaid } from './grip.ts';

/** A small drawing of an ease: 0→1 across, with room for an overshoot. */
const Curve = (props: { readonly name: EaseName }) => (
  <svg viewBox={`0 0 ${EASE_BOX.w} ${EASE_BOX.h}`} width={EASE_BOX.w} height={EASE_BOX.h}>
    <line x1="2" y1={easeY(0)} x2={EASE_BOX.w - 2} y2={easeY(0)} class="lab-ease-axis" />
    <line x1="2" y1={easeY(1)} x2={EASE_BOX.w - 2} y2={easeY(1)} class="lab-ease-axis" />
    <polyline points={easePoints(props.name)} class="lab-ease-curve" />
  </svg>
);

const Key = (props: ParentProps) => <span class="lab-edit-key">{props.children}</span>;
const Val = (props: ParentProps) => <span class="lab-edit-val">{props.children}</span>;

interface CueFieldsProps {
  readonly placed: Placed<SceneSpec>;
  readonly name: string;
  readonly span: Span;
  readonly cue: ResolvedCue;
}

/** The selected cue: its anchor, offset, dur or end, when it plays, and its ease. */
const CueFields = (props: CueFieldsProps) => {
  const { meta } = useLab();
  const { state, actions } = useEditor();
  const scene = () => props.placed.spec.id;
  const fields = createMemo(() => state.fieldsOf(cueOf(scene(), props.name)));
  const field = (id: string) => fields().find((f) => f.id === id);
  const writable = (field: 'ease') =>
    Option.exists(state.inspectedSource().source, (s) =>
      Option.exists(
        Arr.findFirst(s.cues, (c) => c.name === props.name),
        (c) => c[field] !== 'computed',
      ),
    );
  const write = (patch: CueWrite['patch'], span: Span) =>
    actions.commit(
      CueWrite.make({
        scene: scene(),
        cue: props.name,
        patch,
        said: cueSaid(props.span, props.cue, patch),
      }),
      { timeline: { ...meta.stage.timelineOf(scene()), [props.name]: span } },
    );
  const easeNote = () =>
    Option.match(Option.fromUndefinedOr(props.span.ease), {
      onNone: () => ` (default, ${DEFAULT_EASE})`,
      onSome: () => '',
    });
  return (
    <div class="lab-edit-cue">
      <div class="lab-edit-title">{`${scene()} · cue ${props.name}`}</div>
      <div class="lab-edit-grid">
        <Key>anchor</Key>
        <Val>{anchorText(props.span)}</Val>
        <Show when={field('offset')}>{(f) => <Field field={f()} label={<Key>offset</Key>} />}</Show>
        <Show
          when={props.span.until}
          fallback={
            <Show when={field('dur')}>{(f) => <Field field={f()} label={<Key>dur</Key>} />}</Show>
          }
        >
          {(until) => (
            <>
              <Key>end</Key>
              <Val>{`until ${untilText(until())} · ${timecode(props.cue.end, meta.film.fps)}`}</Val>
            </>
          )}
        </Show>
        <Key>plays</Key>
        <Val>{`${timecode(props.cue.start, meta.film.fps)}–${timecode(props.cue.end, meta.film.fps)} in the scene`}</Val>
      </div>
      <div class="lab-edit-key">{`ease: ${props.cue.ease}${easeNote()}`}</div>
      <div class="lab-eases">
        <For each={EaseName.literals}>
          {(e) => (
            <button
              type="button"
              class={['lab-ease', { on: e === props.cue.ease }]}
              data-ease={e}
              title={e}
              disabled={!writable('ease')}
              onClick={() => {
                if (e !== props.span.ease) write({ ease: e }, { ...props.span, ease: e });
              }}
            >
              <Curve name={e} />
              <span>{e}</span>
            </button>
          )}
        </For>
      </div>
    </div>
  );
};

/** The inspector for the selected cue, if a cue of a laid-out scene is selected. */
const CueInspector = (props: { readonly selection: LabSelection }) => {
  const { state: lab, meta } = useLab();
  const found = createMemo(() => {
    lab.revision();
    const scene = props.selection.scene;
    return Option.all({
      placed: Result.getSuccess(sceneOf(meta.film.placed, scene)),
      span: Option.fromUndefinedOr(meta.stage.timelineOf(scene)[props.selection.name]),
      cue: Option.fromUndefinedOr(meta.stage.cuesOf(scene).get(props.selection.name)),
    });
  });
  return (
    <Show
      when={Option.getOrUndefined(found())}
      fallback={
        <p class="lab-edit-note">{`${props.selection.scene} has no cue ${props.selection.name}`}</p>
      }
    >
      {(f) => (
        <CueFields placed={f().placed} name={props.selection.name} span={f().span} cue={f().cue} />
      )}
    </Show>
  );
};

/** Undo and Redo: the server's bounded stack of the lab's writes. */
const History = () => {
  const { state, actions } = useEditor();
  const stepOf = (verb: 'undo' | 'redo') =>
    Option.flatMap(state.report(), (r) => Option.fromUndefinedOr(r[verb]));
  const title = (verb: 'undo' | 'redo', keys: string) =>
    Option.match(stepOf(verb), {
      onNone: () => `${verb} (nothing to ${verb}) (${keys})`,
      onSome: (s) => `${verb} ${s.target} (${keys})`,
    });
  return (
    <>
      <button
        type="button"
        data-act="undo"
        title={title('undo', '⌘Z')}
        disabled={Option.isNone(stepOf('undo'))}
        onClick={() => actions.step('undo')}
      >
        Undo
      </button>
      <button
        type="button"
        data-act="redo"
        title={title('redo', '⇧⌘Z')}
        disabled={Option.isNone(stepOf('redo'))}
        onClick={() => actions.step('redo')}
      >
        Redo
      </button>
    </>
  );
};

/**
 * The inspector's Findings group (UI-6): the film's check (the last write's,
 * else the page's) as it bears on the scene shown, its own and the film's
 * placeless ones; the other scenes' are a count, and F walks to them.
 */
const Findings = () => {
  const { state: lab, meta } = useLab();
  const { state } = useEditor();
  const changes = hubChanges(meta.hub);
  const shown = createMemo(() => findingsIn(state.findings(), meta.film.placed, lab.scene()));
  // F as bound now: a rebound key reads as rebound.
  const walkKey = () => {
    changes();
    return meta.hub
      .keysOf('check.finding-next')
      .slice(0, 1)
      .map((k) => chordLabel(k, meta.hub.mac))
      .join('');
  };
  return (
    <section
      class="lab-group lab-findings-group"
      data-empty={shown().here.length + shown().elsewhere === 0}
    >
      <h3>
        {`Findings in ${lab.scene()}`}
        <span class="lab-count">{shown().here.length}</span>
      </h3>
      <ul class="lab-findings">
        <For each={shown().here}>
          {(f) => (
            <li class={['lab-finding', f.level]}>
              <b>{f.tag}</b>
              {` ${f.message}`}
            </li>
          )}
        </For>
      </ul>
      <Show when={shown().elsewhere > 0}>
        <p class="lab-findings-elsewhere">
          {`${shown().elsewhere} in other scenes · ${walkKey()} walks to them`}
        </p>
      </Show>
    </section>
  );
};

/** What a pointer does to a cue or a knob, for the inspector's hint (its keys come from the keymap). */
const GESTURES: Readonly<Record<LabSelection['_tag'], ReadonlyArray<string>>> = {
  Cue: [
    'drag its bar to move it, an edge to trim it (⇧ free of the frames)',
    'drag a label to scrub (⇧ coarse, ⌥ fine); type +0.1 or *2, then Enter',
  ],
  Knob: [
    'drag its handle on the frame',
    "drag a number knob's name to scrub (⇧ coarse, ⌥ fine); type +10 or *2, then Enter",
  ],
};

/**
 * The editor's section: its header, the inspector, `children` (the knobs,
 * until they move), and the hint for the selection.
 */
export const Section = (props: ParentProps) => {
  const { state: lab, meta } = useLab();
  const { state } = useEditor();
  const file = () =>
    Option.match(state.inspectedSource().source, { onNone: () => '', onSome: (s) => s.file });
  const cueSelected = () => Option.filter(lab.selection(), (s) => s._tag === 'Cue');
  return (
    <section class="lab-edit" data-mode-of="edit">
      <header>
        <strong>Edit</strong>
        <span class="lab-edit-file">{file()}</span>
        <History />
      </header>
      <div class="lab-edit-body lab-inspector">
        <Show when={Option.getOrUndefined(cueSelected())} keyed>
          {(s: LabSelection) => <CueInspector selection={s} />}
        </Show>
        {props.children}
        <Show when={Option.getOrUndefined(lab.selection())} keyed>
          {(s: LabSelection) => <Hint hub={meta.hub} selection={s} gestures={GESTURES[s._tag]} />}
        </Show>
      </div>
      <Findings />
    </section>
  );
};
