// The cue strip: the scene under the playhead, zoomed, under the film's
// timeline: its narration's words and marks, a bar per cue, and the playhead.
// A press on a bar grabs it (the editor's machine takes it from there); a
// press elsewhere on the strip scrubs within the scene.

import { For, Show } from '@solidjs/web';
import { Effect, Option, Result } from 'effect';
import { createMemo } from 'solid-js';
import { Pointer } from '../../browser/pointer.ts';
import type { SceneSpec } from '../../canvas/film.ts';
import { type Placed, sceneOf } from '../../core/layout.ts';
import type { ResolvedCue } from '../../core/schema.ts';
import { selectsCue } from '../place.ts';
import { useLab } from '../shell.tsx';
import { useEditor } from './context.tsx';
import { anchorText } from './format.ts';
import { dragModeAt } from './grip.ts';

const pct = (p: Placed<SceneSpec>, t: number) => `${(t / p.dur) * 100}%`;

/** The words and marks of the scene's narration, where they fall. */
const Words = (props: { readonly placed: Placed<SceneSpec> }) => (
  <div class="lab-strip-words">
    <For each={props.placed.voice.words}>
      {(w) => (
        <span
          class="lab-word"
          style={{
            left: pct(props.placed, props.placed.speechStart + w.start),
            width: pct(props.placed, Math.max(0.02, w.end - w.start)),
          }}
        >
          {w.text}
        </span>
      )}
    </For>
    <For each={[...props.placed.voice.marks]}>
      {([name, m]) => (
        <i
          class="lab-strip-mark"
          style={{ left: pct(props.placed, props.placed.speechStart + m) }}
          title={`{${name}}`}
        />
      )}
    </For>
  </div>
);

interface CueRowProps {
  readonly placed: Placed<SceneSpec>;
  readonly name: string;
  readonly cue: ResolvedCue;
  /** The strip's rows, whose width is the scene's length. */
  readonly rows: () => Option.Option<HTMLElement>;
}

/** One cue's row: its name, and its bar where it plays. */
const CueRow = (props: CueRowProps) => {
  const { state: lab, meta } = useLab();
  const { actions } = useEditor();
  const scene = () => props.placed.spec.id;
  const title = () =>
    Option.match(Option.fromUndefinedOr(meta.stage.timelineOf(scene())[props.name]), {
      onNone: () => '',
      onSome: anchorText,
    });
  const press = (e: PointerEvent & { currentTarget: HTMLElement }) => {
    e.stopPropagation();
    e.preventDefault();
    const bar = e.currentTarget.getBoundingClientRect();
    const width = Option.match(props.rows(), {
      onNone: () => bar.width,
      onSome: (r) => r.getBoundingClientRect().width,
    });
    actions.press({
      scene: scene(),
      cue: props.name,
      edge: dragModeAt(e.clientX - bar.left, bar.width, e.altKey),
      down: e,
      perSec: width / props.placed.dur,
    });
  };
  return (
    <div class="lab-strip-row">
      <span class="lab-cue-label">{props.name}</span>
      <div
        class={[
          'lab-cue',
          {
            selected: selectsCue(lab.selection(), scene(), props.name),
            late: props.cue.end > props.placed.dur + 1e-9,
          },
        ]}
        data-cue={props.name}
        data-scene={scene()}
        style={{
          left: pct(props.placed, props.cue.start),
          width: pct(props.placed, props.cue.dur),
        }}
        title={`${props.name}: ${title()} · ${props.cue.start.toFixed(2)}–${props.cue.end.toFixed(2)}s · ${props.cue.ease}`}
        onPointerDown={press}
      />
    </div>
  );
};

/** The strip for the scene under the playhead. */
export const Strip = () => {
  const { state: lab, meta } = useLab();
  const { state } = useEditor();
  const placed = createMemo(() =>
    Option.getOrUndefined(Result.getSuccess(sceneOf(meta.film.placed, state.stripScene()))),
  );
  // Read again after each preview: a drag moves the bars as it goes.
  const cues = createMemo(() => {
    lab.revision();
    return [...meta.stage.cuesOf(state.stripScene())];
  });
  let rows = Option.none<HTMLElement>();
  const file = () =>
    Option.match(state.stripSource().source, {
      onNone: () => state.stripSource().error,
      onSome: (s) => s.file,
    });
  return (
    <Show when={placed()}>
      {(p) => {
        const scrub = (e: PointerEvent) => {
          const r = Option.getOrThrow(rows).getBoundingClientRect();
          const at = (ev: PointerEvent) =>
            meta.player.scrub(
              p().start +
                Math.max(0, Math.min(p().dur, ((ev.clientX - r.left) / r.width) * p().dur)),
            );
          at(e);
          // The playhead settles where the drag ends, lifted or ended by the browser.
          Effect.runForkWith(meta.host)(
            Pointer.use((pointer) =>
              pointer.drag(e, { move: at, end: () => meta.player.settle() }),
            ),
          );
        };
        return (
          <div class="lab-strip" onPointerDown={scrub}>
            <div class="lab-strip-head">
              {`${p().spec.id} · ${p().dur.toFixed(2)}s · ${file()}`}
            </div>
            {/* The rows scroll in their own box, the words held at its top, so the film keeps its row. */}
            <div class="lab-strip-scroll">
              <div
                class="lab-strip-rows"
                ref={(el: HTMLDivElement) => {
                  rows = Option.some(el);
                }}
              >
                <Words placed={p()} />
                <For each={cues()} keyed={([name]) => name}>
                  {(entry) => (
                    <CueRow placed={p()} name={entry()[0]} cue={entry()[1]} rows={() => rows} />
                  )}
                </For>
                <div
                  class="lab-strip-playhead"
                  style={{
                    left: pct(p(), Math.max(0, Math.min(p().dur, lab.T() - p().start))),
                  }}
                />
              </div>
            </div>
          </div>
        );
      }}
    </Show>
  );
};
