// The cue strip: the scene under the playhead, zoomed (on a phone, a long
// scene's 8 s around the playhead: `stripWindow`), under the film's
// timeline: its narration's words and marks, a bar per cue, and the playhead.
// A press on a bar grabs it (the editor's machine takes it from there); a
// drag across a cue's lane beside its bar marks the in and out points, shown
// as a band (a tap there seeks); a press elsewhere on the strip scrubs within
// the scene. Its head holds the Snap toggle (S), and Cancel drag while a
// grip is held: a finger's Shift and Escape. The cue lanes are Edit's (and
// Motion's on a laptop, for its loop): in Note, Compare and Record, and on a
// phone in every mode but Edit, the strip folds to its words (`player.css`,
// by the panel's mode on `data-mode`).

import { For, Show } from '@solidjs/web';
import { Effect, Option, Result } from 'effect';
import { createMemo, createSignal } from 'solid-js';
import { DRAG_PX, Pointer, Surface } from '../../browser/pointer.ts';
import type { SceneSpec } from '../../canvas/film.ts';
import { type Placed, sceneOf } from '../../core/layout.ts';
import { timecode } from '../../core/time.ts';
import { endsLate, liveAt } from '../../core/timeline.ts';
import type { ResolvedCue } from '../../core/schema.ts';
import { cueOf } from '../../command/selection.ts';
import { BY_BUTTON } from '../../command/command.ts';
import { CANCEL_GRIP, SNAP } from './commands.ts';
import { hubKeys } from '../command/changes.ts';
import { Target } from '../command/context-menu.tsx';
import { selectsCue } from '../place.ts';
import { useLabPage } from '../panel.tsx';
import { useLab } from '../shell.tsx';
import { useEditor } from './context.tsx';
import { anchorText } from './format.ts';
import { SourceKnown, type StripWindow, dragModeAt, edgeFor, stripWindow } from './grip.ts';
import { PHONE, useMatches } from '../viewport.ts';
import { useMotion } from '../motion/context.tsx';
import type { LoopRange } from '../../player/main.ts';

/** Where scene second `t` sits across the strip showing `w`. */
const pct = (w: StripWindow, t: number) => `${((t - w.from) / w.span) * 100}%`;

/** How wide `d` seconds are on the strip showing `w`. */
const len = (w: StripWindow, d: number) => `${(d / w.span) * 100}%`;

/** The words and marks of the scene's narration, each word in the room its time gives it. */
const Words = (props: {
  readonly placed: Placed<SceneSpec>;
  readonly window: () => StripWindow;
}) => (
  <div class="lab-strip-words">
    <For each={props.placed.voice.words}>
      {(w) => (
        <span
          class="lab-word-room"
          style={{
            left: pct(props.window(), props.placed.speechStart + w.start),
            width: len(props.window(), Math.max(0, w.end - w.start)),
          }}
        >
          <span class="lab-word">{w.text}</span>
        </span>
      )}
    </For>
    <For each={[...props.placed.voice.marks]}>
      {([name, m]) => (
        <i
          class="lab-strip-mark"
          style={{ left: pct(props.window(), props.placed.speechStart + m) }}
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
  /** The seconds of the scene the strip shows. */
  readonly window: () => StripWindow;
  /** The strip's rows, whose width is the window's length. */
  readonly rows: () => Option.Option<HTMLElement>;
  /** A press on the lane beside the bar: a drag across it marks the in and out points. */
  readonly lane: (e: PointerEvent) => void;
}

/** One cue's row: its name, and its bar where it plays. */
const CueRow = (props: CueRowProps) => {
  const { state: lab, meta } = useLab();
  const { actions } = useEditor();
  const scene = () => props.placed.spec.id;
  // Lit while the playhead is inside the cue (`liveAt`): the Source view lights the same cues.
  const live = () =>
    liveAt(new Map([[props.name, props.cue]]), lab.T() - props.placed.start, meta.film.fps).length >
    0;
  const title = () =>
    Option.match(Option.fromUndefinedOr(meta.stage.timelineOf(scene())[props.name]), {
      onNone: () => '',
      onSome: anchorText,
    });
  const press = (e: PointerEvent & { currentTarget: HTMLElement }) => {
    // A right-click is the context menu's, never a grip.
    if (e.button !== 0) return;
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
      edge: dragModeAt(e.clientX - bar.left, bar.width, e.altKey, edgeFor(e.pointerType)),
      down: e,
      perSec: width / props.window().span,
    });
  };
  return (
    <div class="lab-strip-row" onPointerDown={props.lane}>
      <span class="lab-cue-label">{props.name}</span>
      {/* The lane clips its bar to the window; the name stays beside it. */}
      <div class="lab-cue-lane">
        <Target
          of={cueOf(scene(), props.name)}
          class={[
            'lab-cue',
            {
              selected: selectsCue(lab.selection(), scene(), props.name),
              late: endsLate(props.cue, props.placed.dur),
            },
          ]}
          data-cue={props.name}
          data-scene={scene()}
          data-live={Option.getOrUndefined(Option.liftPredicate('', live))}
          style={{
            left: pct(props.window(), props.cue.start),
            width: len(props.window(), props.cue.dur),
          }}
          title={`${props.name}: ${title()} · ${timecode(props.cue.start, meta.film.fps)}–${timecode(props.cue.end, meta.film.fps)} · ${props.cue.ease}`}
          onPointerDown={press}
        />
      </div>
    </div>
  );
};

/** The strip for the scene under the playhead. */
export const Strip = () => {
  const { state: lab, meta } = useLab();
  const { state } = useEditor();
  const page = useLabPage();
  const placed = createMemo(() =>
    Option.getOrUndefined(Result.getSuccess(sceneOf(meta.film.placed, state.stripScene()))),
  );
  // Read again after each preview: a drag moves the bars as it goes.
  const cues = createMemo(() => {
    lab.revision();
    return [...meta.stage.cuesOf(state.stripScene())];
  });
  let rows = Option.none<HTMLElement>();
  const { state: motionState, actions: motion } = useMotion();
  const [marking, setMarking] = createSignal(Option.none<LoopRange>());
  const file = () =>
    SourceKnown.$match(state.stripSource(), {
      Reading: () => 'reading the source…',
      Unread: ({ reason }) => reason,
      Read: ({ source }) => source.file,
    });
  // A key as bound now: a rebound key reads as rebound.
  const keys = hubKeys(meta.hub);
  /** The strip follows one press at a time, a scrub's or a lane's: a second finger's starts nothing. */
  const strip = new Surface('the strip');
  const phone = useMatches(meta.host, PHONE);
  // A scrub holds the window it began in: one following the playhead under it would run away.
  const [held, setHeld] = createSignal(Option.none<StripWindow>());
  return (
    <Show when={placed()}>
      {(p) => {
        /** The scene seconds the playhead is at, inside the scene. */
        const sceneT = () => Math.max(0, Math.min(p().dur, lab.T() - p().start));
        /** The seconds of the scene the strip shows now. */
        const shown = () => Option.getOrElse(held(), () => stripWindow(p().dur, sceneT(), phone()));
        /** The scene second a pointer at `x` across the rows `r` is over. */
        const timeAt = (r: DOMRect, x: number) => {
          const w = shown();
          return Math.max(0, Math.min(p().dur, w.from + ((x - r.left) / r.width) * w.span));
        };
        const scrub = (e: PointerEvent) => {
          // A right-click is the context menu's, never a scrub; a lane's press is the lane's.
          if (e.button !== 0 || e.defaultPrevented) return;
          const r = Option.getOrThrow(rows).getBoundingClientRect();
          const at = (ev: PointerEvent) => meta.player.scrub(p().start + timeAt(r, ev.clientX));
          // The playhead settles where the drag ends, lifted or ended by the browser.
          Effect.runForkWith(meta.host)(
            Pointer.use((pointer) =>
              pointer.press(e, strip, () => {
                setHeld(Option.some(shown()));
                at(e);
                return Option.some({
                  move: at,
                  end: () => {
                    setHeld(Option.none());
                    meta.player.settle();
                  },
                });
              }),
            ),
          );
        };
        // A drag across a cue's lane marks the in and out points (what a note
        // written next is about, looped meanwhile); a tap on it seeks there.
        const lane = (e: PointerEvent) => {
          if (e.button !== 0) return;
          // Handled here (the strip's scrub leaves it), yet still heard above: the
          // page's context menu must see the press to hold it once its long press
          // opens, so no range starts under the open menu.
          e.preventDefault();
          const r = Option.getOrThrow(rows).getBoundingClientRect();
          const filmAt = (ev: PointerEvent) => p().start + timeAt(r, ev.clientX);
          const from = filmAt(e);
          const far = (ev: PointerEvent) => Math.abs(ev.clientX - e.clientX) >= DRAG_PX;
          const spanTo = (ev: PointerEvent) => ({
            from: Math.min(from, filmAt(ev)),
            to: Math.max(from, filmAt(ev)),
          });
          Effect.runForkWith(meta.host)(
            Pointer.use((pointer) =>
              pointer.press(e, strip, () => {
                // The drag reads the window it began in, as a scrub does: the film playing on
                // would move the window under the pointer.
                setHeld(Option.some(shown()));
                return Option.some({
                  move: (ev: PointerEvent) =>
                    setMarking(Option.liftPredicate(spanTo(ev), () => far(ev))),
                  end: (lifted: Option.Option<PointerEvent>) => {
                    setMarking(Option.none());
                    Option.map(lifted, (ev) => {
                      if (!far(ev)) return meta.player.seek(from);
                      const span = spanTo(ev);
                      return motion.markRange(span.from, span.to);
                    });
                    setHeld(Option.none());
                  },
                });
              }),
            ),
          );
        };
        // The in and out points over this scene's window: as a lane drag marks them, else as marked.
        const band = () =>
          Option.filter(
            Option.map(
              Option.orElse(marking(), () => motionState.inOut()),
              (b) => ({
                from: Math.max(shown().from, b.from - p().start),
                to: Math.min(shown().from + shown().span, b.to - p().start),
              }),
            ),
            (b) => b.to > b.from,
          );
        return (
          <div class="lab-strip" data-mode={page.mode()} onPointerDown={scrub}>
            <div class="lab-strip-head">
              <span class="lab-strip-name">
                {`${p().spec.id} · ${timecode(p().dur, meta.film.fps)} · ${file()}`}
              </span>
              {/* A finger has no Escape: while a grip is held, a tap here lets it go. */}
              <Show when={state.holding()}>
                <button
                  type="button"
                  class="sh-btn"
                  data-act="cancel-grip"
                  onPointerDown={(e) => e.preventDefault()}
                  onClick={() => meta.hub.invokeId(CANCEL_GRIP, BY_BUTTON)}
                >
                  Cancel drag
                </button>
              </Show>
              {/* Shift's way for a finger: edges snap while it is on; off, they go freely. */}
              <button
                type="button"
                class="sh-btn"
                data-act="snap"
                aria-pressed={`${state.snap()}`}
                title={`Snap to words, marks, cue edges and frames (${keys.first(SNAP)}; ⇧ flips it while dragging)`}
                onPointerDown={(e) => e.preventDefault()}
                onClick={() => meta.hub.invokeId(SNAP, BY_BUTTON)}
              >
                Snap
              </button>
            </div>
            {/* The rows scroll in their own box, the words held at its top, so the film keeps its row. */}
            <div class="lab-strip-scroll">
              <div
                class="lab-strip-rows"
                ref={(el: HTMLDivElement) => {
                  rows = Option.some(el);
                }}
              >
                <Words placed={p()} window={shown} />
                <Show when={Option.getOrUndefined(band())}>
                  {(b) => (
                    <div
                      class="lab-strip-range"
                      data-role="in-out"
                      style={{
                        left: pct(shown(), b().from),
                        width: len(shown(), b().to - b().from),
                      }}
                    />
                  )}
                </Show>
                <For each={cues()} keyed={([name]) => name}>
                  {(entry) => (
                    <CueRow
                      placed={p()}
                      name={entry()[0]}
                      cue={entry()[1]}
                      window={shown}
                      rows={() => rows}
                      lane={lane}
                    />
                  )}
                </For>
                <div class="lab-strip-playhead" style={{ left: pct(shown(), sceneT()) }} />
              </div>
            </div>
          </div>
        );
      }}
    </Show>
  );
};
