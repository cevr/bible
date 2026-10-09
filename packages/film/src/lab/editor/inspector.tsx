// The editor's section of the panel, and its Undo and Redo for the
// studio's header (`History`, every mode's): the selected cue's
// fields (the inspector's, `lab/command/inspector.tsx`, stepped as the cue's
// schema says) and eases, the selection's hint, and the film's check
// findings. Every write goes to the editor's machine as a commit, shown
// first in memory and carrying what it moves, before → after, for the
// receipt it lands with (the page's toast, `lab/command/receipts.tsx`).

import { For, Show } from '@solidjs/web';
import { Option, Result } from 'effect';
import type { ParentProps } from 'solid-js';
import { createMemo } from 'solid-js';
import type { SceneSpec } from '../../canvas/film.ts';
import { type Placed, sceneOf } from '../../core/layout.ts';
import {
  type CheckLine,
  type CuePatch,
  EaseName,
  type ResolvedCue,
  type Span,
} from '../../core/schema.ts';
import { DEFAULT_EASE, timecode } from '../../core/time.ts';
import { untilEndText } from '../../core/timeline.ts';
import { BY_BUTTON } from '../../command/command.ts';
import { type LabSelection, cueOf } from '../../command/selection.ts';
import { Field, Hint } from '../command/inspector.tsx';
import { HeaderTool } from '../page-shell.tsx';
import { Lab, useLab } from '../shell.tsx';
import { useEditor } from './context.tsx';
import { EASE_BOX, anchorText, easePoints, easeY, findingsIn, peekText } from './format.ts';
import { SelectionSheet } from '../selection-sheet.tsx';
import { hubKeys } from '../command/changes.ts';
import { countState } from '../scenes/marks.ts';
import { cueCommit, cueRefusal } from './grip.ts';

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

/**
 * The selected cue: its anchor, offset, dur (or, ending on a mark, its end
 * and the mark with the offset off it: an end typed sets that offset, as its
 * drag does, and the end keeps following the mark), when it plays, and its
 * ease.
 */
const CueFields = (props: CueFieldsProps) => {
  const { meta } = useLab();
  const { state, actions } = useEditor();
  const scene = () => props.placed.spec.id;
  const fields = createMemo(() => state.fieldsOf(cueOf(scene(), props.name)));
  const field = (id: string) => fields().find((f) => f.id === id);
  // Why an ease cannot be written, as a drag or a typed field would be told.
  const easeRefusal = createMemo(() => cueRefusal(state.inspectedSource(), props.name, ['ease']));
  const write = (patch: CuePatch) => {
    const commit = cueCommit(scene(), props.name, props.span, props.cue, patch);
    actions.commit(commit.write, {
      timeline: { ...meta.stage.timelineOf(scene()), [props.name]: commit.span },
    });
  };
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
              <Show when={field('end')}>{(f) => <Field field={f()} label={<Key>end</Key>} />}</Show>
              <Key>until</Key>
              <Val>{untilEndText(until(), props.span.untilOffset)}</Val>
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
              class="sh-btn lab-ease"
              aria-pressed={`${e === props.cue.ease}`}
              data-ease={e}
              title={Option.getOrElse(easeRefusal(), () => e)}
              disabled={Option.isSome(easeRefusal())}
              onClick={() => {
                if (e !== props.span.ease) write({ ease: e });
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

/**
 * Undo and Redo: the server's bounded stack of the lab's writes, in the
 * studio's header (the shell's `tools`), so every mode keeps them (§4).
 */
export const History = () => {
  const { state } = useEditor();
  const { meta } = useLab();
  // Through the page's commands, so a step not taken now says why (`edit.undo`, `edit.redo`).
  const step = (verb: 'undo' | 'redo') => meta.hub.invokeId(`edit.${verb}`, BY_BUTTON);
  const stepOf = (verb: 'undo' | 'redo') =>
    Option.flatMap(state.report(), (r) => Option.fromUndefinedOr(r[verb]));
  // Each names its key as bound now: a rebound key reads as rebound.
  const keys = hubKeys(meta.hub);
  // It names what the step will take: the stack's top as the page read it, the newest once
  // the page has changed the stack since (`edit.undo`'s label says the same).
  const title = (verb: 'undo' | 'redo') =>
    keys.titled(
      Option.match(stepOf(verb), {
        onNone: () => `${verb} (nothing to ${verb})`,
        onSome: (s) =>
          Option.match(
            Option.liftPredicate(s.target, () => state.stackCurrent()),
            {
              onNone: () => verb,
              onSome: (target) => `${verb} ${target}`,
            },
          ),
      }),
      `edit.${verb}`,
    );
  return (
    <>
      <HeaderTool
        act="undo"
        label="Undo"
        title={title('undo')}
        disabled={Option.isNone(stepOf('undo'))}
        onClick={() => step('undo')}
      />
      <HeaderTool
        act="redo"
        label="Redo"
        title={title('redo')}
        disabled={Option.isNone(stepOf('redo'))}
        onClick={() => step('redo')}
      />
    </>
  );
};

/** Findings listed, each its tag and message in its level's colour. */
const FindingList = (props: { readonly lines: ReadonlyArray<CheckLine> }) => (
  <ul class="lab-findings">
    <For each={props.lines}>
      {(f) => (
        <li class={['lab-finding', f.level]}>
          <b>{f.tag}</b>
          {` ${f.message}`}
        </li>
      )}
    </For>
  </ul>
);

/**
 * The inspector's Findings group: the film's check (the last write's,
 * else the page's) as it bears on the scene shown, its own, then the film's
 * placeless ones apart (`Film · n`, in their most pressing level's colour,
 * as Scenes' legend counts them: `countState`); the other scenes' are a
 * count, and F walks to them.
 */
const Findings = () => {
  const { state: lab, meta } = useLab();
  const { state } = useEditor();
  const keys = hubKeys(meta.hub);
  const shown = createMemo(() => findingsIn(state.findings(), meta.film.placed, lab.scene()));
  return (
    <section
      class="lab-group lab-findings-group"
      data-empty={shown().here.length + shown().film.length + shown().elsewhere === 0}
    >
      <h3>
        {`Findings in ${lab.scene()}`}
        <span class="lab-count">{shown().here.length}</span>
      </h3>
      <FindingList lines={shown().here} />
      <Show when={shown().film.length > 0}>
        <h4
          class="lab-findings-film"
          data-state={Option.getOrUndefined(countState(shown().film))}
        >{`Film · ${shown().film.length}`}</h4>
        <FindingList lines={shown().film} />
      </Show>
      <Show when={shown().elsewhere > 0}>
        <p class="lab-findings-elsewhere">
          {`${shown().elsewhere} in other scenes · ${keys.first('check.finding-next')} walks to them`}
        </p>
      </Show>
    </section>
  );
};

/** What a pointer does to a cue or a knob, for the inspector's hint (its keys come from the keymap). */
const GESTURES: Readonly<Record<LabSelection['_tag'], ReadonlyArray<string>>> = {
  Cue: [
    'drag its bar to move it, an edge to trim it (Snap off, or ⇧ while on: free of the frames)',
    'drag a label to scrub (⇧ coarse, ⌥ fine); type +0.1 or *2, then Enter',
  ],
  Knob: [
    'drag its handle on the frame',
    "drag a number knob's name to scrub (⇧ coarse, ⌥ fine); type +10 or *2, then Enter",
  ],
};

/**
 * The editor's controls in its section of the page's panel: the inspector,
 * `children` (the knobs, until they move), the hint for the selection, and
 * the findings. The scene's file is named once, on the strip's head. On a
 * phone, while a cue or a knob is selected, the inspector and the knobs
 * stand in the selection's sheet (`SelectionSheet`), peeking its one line.
 */
export const Section = (props: ParentProps) => {
  const { state: lab, meta, actions } = useLab();
  const { state } = useEditor();
  const cueSelected = () => Option.filter(lab.selection(), (s) => s._tag === 'Cue');
  // The selection's one line for a phone's peek: its fields as they stand, a cue's ease.
  const peek = () =>
    Option.match(lab.selection(), {
      onNone: () => '',
      onSome: (s) => {
        lab.revision();
        return peekText(
          s,
          state.fieldsOf(s),
          Option.map(Option.fromUndefinedOr(meta.stage.cuesOf(s.scene).get(s.name)), (c) => c.ease),
        );
      },
    });
  return (
    <>
      <Lab.Fill at="edit">
        <div class="lab-edit-body lab-inspector">
          <SelectionSheet
            host={meta.host}
            hub={meta.hub}
            of={lab.selection()}
            peek={peek()}
            dismiss={actions.dismissSelection}
          >
            <Show when={Option.getOrUndefined(cueSelected())} keyed>
              {(s: LabSelection) => <CueInspector selection={s} />}
            </Show>
            {props.children}
          </SelectionSheet>
          <Show when={Option.getOrUndefined(lab.selection())} keyed>
            {(s: LabSelection) => <Hint hub={meta.hub} selection={s} gestures={GESTURES[s._tag]} />}
          </Show>
        </div>
        <Findings />
      </Lab.Fill>
    </>
  );
};
