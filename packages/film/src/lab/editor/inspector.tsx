// The editor's section of the panel: Undo and Redo, the selected cue's
// fields and eases, the film's check findings, and the status line. Every
// write goes to the editor's machine as a commit, shown first in memory.

import { For, Show } from '@solidjs/web';
import { Array as Arr, Match, Option, Result } from 'effect';
import type { ParentProps } from 'solid-js';
import { createMemo } from 'solid-js';
import type { SceneSpec } from '../../canvas/film.ts';
import { type Placed, sceneOf } from '../../core/layout.ts';
import { type CheckLine, EaseName, type ResolvedCue, type Span } from '../../core/schema.ts';
import { DEFAULT_EASE } from '../../core/time.ts';
import { patchSpan } from '../../core/timeline.ts';
import type { Selection } from '../selection.ts';
import { useLab } from '../shell.tsx';
import { useEditor } from './context.tsx';
import { EASE_BOX, anchorText, easePoints, easeY, round, statusText } from './format.ts';
import { CueWrite } from './grip.ts';

/** A small drawing of an ease: 0→1 across, with room for an overshoot. */
const Curve = (props: { readonly name: EaseName }) => (
  <svg viewBox={`0 0 ${EASE_BOX.w} ${EASE_BOX.h}`} width={EASE_BOX.w} height={EASE_BOX.h}>
    <line x1="2" y1={easeY(0)} x2={EASE_BOX.w - 2} y2={easeY(0)} class="lab-ease-axis" />
    <line x1="2" y1={easeY(1)} x2={EASE_BOX.w - 2} y2={easeY(1)} class="lab-ease-axis" />
    <polyline points={easePoints(props.name)} class="lab-ease-curve" />
  </svg>
);

interface NumberFieldProps {
  readonly field: string;
  readonly value: number;
  readonly writable: boolean;
  readonly commit: (v: number) => void;
}

/** A number the inspector writes on change: seconds, to the thousandth. */
const NumberField = (props: NumberFieldProps) => (
  <input
    class="lab-num"
    type="number"
    step="0.01"
    data-field={props.field}
    value={String(round(props.value))}
    disabled={!props.writable}
    onChange={(e) => {
      const v = Number.parseFloat(e.currentTarget.value);
      if (Number.isFinite(v)) props.commit(v);
    }}
  />
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
  const writable = (field: 'offset' | 'dur' | 'ease') =>
    Option.exists(state.inspectedSource().source, (s) =>
      Option.exists(
        Arr.findFirst(s.cues, (c) => c.name === props.name),
        (c) => c[field] !== 'computed',
      ),
    );
  const write = (patch: CueWrite['patch'], span: Span) =>
    actions.commit(CueWrite.make({ scene: scene(), cue: props.name, patch }), {
      timeline: { ...meta.stage.timelineOf(scene()), [props.name]: span },
    });
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
        <Key>offset</Key>
        <NumberField
          field="offset"
          value={props.span.offset ?? 0}
          writable={writable('offset')}
          commit={(v) => write({ offset: round(v) }, { ...props.span, offset: v })}
        />
        <Show
          when={props.span.until}
          fallback={
            <>
              <Key>dur</Key>
              <NumberField
                field="dur"
                value={props.cue.dur}
                writable={writable('dur')}
                commit={(v) =>
                  write(
                    { dur: round(Math.max(0, v)) },
                    patchSpan(props.span, { dur: Math.max(0, v) }),
                  )
                }
              />
            </>
          }
        >
          {(until) => (
            <>
              <Key>end</Key>
              <Val>{`until {${until()}} · ${props.cue.end.toFixed(2)}s`}</Val>
            </>
          )}
        </Show>
        <Key>plays</Key>
        <Val>{`${props.cue.start.toFixed(2)}–${props.cue.end.toFixed(2)}s in the scene`}</Val>
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
const CueInspector = (props: { readonly selection: Selection }) => {
  const { state: lab, meta } = useLab();
  const found = createMemo(() => {
    lab.revision();
    const scene = props.selection.scene;
    return Option.all({
      placed: Result.getSuccess(sceneOf(meta.film.placed, scene)),
      span: Option.fromUndefinedOr(meta.stage.timelineOf(scene)[props.selection.name]),
      cue: Option.fromUndefinedOr(meta.film.cuesOf(scene).get(props.selection.name)),
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

/** The film's check: the findings of the last write, else of the check as the page loaded. */
const Findings = () => {
  const { state } = useEditor();
  const findings = (): ReadonlyArray<CheckLine> =>
    Match.value(state.edit()).pipe(
      Match.tag('Written', (s) => s.findings),
      Match.orElse(() =>
        Option.match(state.report(), { onNone: () => [], onSome: (r) => r.findings }),
      ),
    );
  return (
    <ul class="lab-findings">
      <For each={findings()}>
        {(f) => (
          <li class={['lab-finding', f.level]}>
            <b>{f.tag}</b>
            {` ${f.message}`}
          </li>
        )}
      </For>
    </ul>
  );
};

/** What the editor last did, or is doing. */
const Status = () => {
  const { state } = useEditor();
  return <div class="lab-edit-status">{statusText(state.edit(), state.report())}</div>;
};

/** The editor's section: its header, the inspector, and `children` (the knobs, until they move). */
export const Section = (props: ParentProps) => {
  const { state: lab } = useLab();
  const { state } = useEditor();
  const file = () =>
    Option.match(state.inspectedSource().source, { onNone: () => '', onSome: (s) => s.file });
  const cueSelected = () => Option.filter(lab.selection(), (s) => s.kind === 'cue');
  return (
    <section class="lab-edit">
      <header>
        <strong>Edit</strong>
        <span class="lab-edit-file">{file()}</span>
        <History />
      </header>
      <div class="lab-edit-body">
        <Show when={Option.getOrUndefined(cueSelected())} keyed>
          {(s: Selection) => <CueInspector selection={s} />}
        </Show>
        {props.children}
      </div>
      <Findings />
      <Status />
    </section>
  );
};
