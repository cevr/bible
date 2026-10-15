// The cue strip: the scene under the playhead, zoomed (on a phone, a long
// scene's 8 s around the playhead: `stripWindow`), under the film's
// timeline: its narration's words and marks, a bar per cue, and the playhead.
// A press on a bar grabs it (the editor's machine takes it from there); a
// drag across a cue's lane beside its bar marks the in and out points, shown
// as a band (a tap there seeks); a press elsewhere on the strip scrubs within
// the scene. Its head holds the Snap toggle (S), and Cancel drag while a
// grip is held: a finger's Shift and Escape. The rows scroll in their own box,
// which follows the lanes the playhead is inside by the Source view's rule
// (`lab/follow.ts`) until a hand scrolls it; Play takes it back, and so does
// Follow, offered on the strip's menu and ⌘K only while the rows are let go.
// The cue lanes are Edit's (and Motion's on a laptop, for its loop): in Note,
// Compare and Record, and on a phone in every mode but Edit, the strip folds
// to its words (`player.css`, by the panel's mode on `data-mode`).

import { For, Show } from '@solidjs/web';
import { Array as Arr, Effect, Option, Result } from 'effect';
import { createMemo, createSignal, onCleanup } from 'solid-js';
import { DRAG_PX, Pointer, Surface } from '../../browser/pointer.ts';
import type { SceneSpec } from '../../canvas/film.ts';
import { type Placed, sceneOf } from '../../core/layout.ts';
import { timecode } from '../../core/time.ts';
import { endsLate, liveAt } from '../../core/timeline.ts';
import { cueOf } from '../../command/selection.ts';
import { BY_BUTTON } from '../../command/command.ts';
import { CANCEL_GRIP, SNAP, stripFollowCommand } from './commands.ts';
import { hubKeys } from '../command/changes.ts';
import { Target } from '../command/context-menu.tsx';
import { selectsCue } from '../place.ts';
import { pressed } from '../pressed.ts';
import { useLabPage } from '../panel.tsx';
import { useFollow } from '../follow.ts';
import { useLab } from '../shell.tsx';
import { pointsAt, useEditor } from './context.tsx';
import { anchorText } from './format.ts';
import { lanesKey, lanesOf } from './lanes.ts';
import {
  type Block,
  type Label,
  type Track,
  countText,
  heldLanes,
  labelsOf,
  stripOrder,
  tracksOf,
} from './tracks.ts';
import { SourceKnown, type StripWindow, dragModeAt, edgeFor, stripWindow } from './grip.ts';
import { PHONE, useMatches } from '../viewport.ts';
import { useMotion } from '../motion/context.tsx';
import type { LoopRange } from '../../player/main.ts';

/** Where scene second `t` sits across the strip showing `w`. */
const pct = (w: StripWindow, t: number) => `${((t - w.from) / w.span) * 100}%`;

/** How wide `d` seconds are on the strip showing `w`. */
const len = (w: StripWindow, d: number) => `${(d / w.span) * 100}%`;

/** The words and marks of the scene's narration, each word in the room its time gives it, each mark named over them. */
const Words = (props: {
  readonly placed: Placed<SceneSpec>;
  readonly labels: ReadonlyArray<Label>;
  readonly window: () => StripWindow;
}) => (
  <div class="lab-strip-words">
    {/* Each mark's name and scene second, in the room up to the next mark: the labels every track is tied to. */}
    <div class="lab-strip-labels">
      <For each={props.labels} keyed={false}>
        {(label, i) => (
          <span
            class="lab-strip-label"
            data-mark={label().name}
            style={{
              left: pct(props.window(), label().t),
              width: len(
                props.window(),
                (props.labels[i + 1]?.t ?? props.window().from + props.window().span) - label().t,
              ),
            }}
          >
            {/* The name first, the seconds dropped whole before it is cut. */}
            <span class="lab-strip-label-name">{label().name}</span>{' '}
            <span class="lab-strip-label-t">{label().t.toFixed(2)}</span>
          </span>
        )}
      </For>
    </div>
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
    <For each={props.labels}>
      {(label) => (
        <i
          class="lab-strip-mark"
          style={{ left: pct(props.window(), label.t) }}
          title={`{${label.name}}`}
        />
      )}
    </For>
  </div>
);

interface CueBarProps {
  readonly placed: Placed<SceneSpec>;
  readonly block: Block;
  /** Its words written in the bar: on a named track, whose name stands at the row's left, not the cue's. */
  readonly worded: boolean;
  /** The seconds of the scene the strip shows. */
  readonly window: () => StripWindow;
  /** The strip's rows, whose width is the window's length. */
  readonly rows: () => Option.Option<HTMLElement>;
  /** Lit while the playhead is inside the cue (`liveAt`, counted once a frame by the strip): the Source view lights the same cues. */
  readonly live: () => boolean;
  /** Where the next bar on its lane starts, if one does: the room its name has after it. */
  readonly next: () => Option.Option<number>;
}

/** One cue's bar where it plays: a press grabs it (the editor's machine takes it from there). */
const CueBar = (props: CueBarProps) => {
  const { state: lab, meta } = useLab();
  const { actions, state: editor } = useEditor();
  const scene = () => props.placed.spec.id;
  const name = () => props.block.name;
  const cue = () => props.block.cue;
  const title = () =>
    Option.match(Option.fromUndefinedOr(meta.stage.timelineOf(scene())[name()]), {
      onNone: () => '',
      onSome: anchorText,
    });
  // The room after the bar, in bar lengths, up to the next bar on its lane or the window's end: a name written
  // after a bar too short to hold it keeps to it (`player.css`).
  const after = () => {
    const w = props.window();
    const free = Option.getOrElse(props.next(), () => w.from + w.span) - cue().end;
    return String(Math.max(0, free) / Math.max(cue().dur, 0.01));
  };
  // A bar gone from under the mouse (the scene changed, its lane stacked) gives up the point it held: no leave comes.
  onCleanup(() => {
    if (pointsAt(editor.pointed(), scene(), name())) actions.point(Option.none());
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
      cue: name(),
      edge: dragModeAt(e.clientX - bar.left, bar.width, e.altKey, edgeFor(e.pointerType)),
      down: e,
      perSec: width / props.window().span,
    });
  };
  return (
    <Target
      of={cueOf(scene(), name())}
      class={[
        'lab-cue',
        {
          selected: selectsCue(lab.selection(), scene(), name()),
          late: endsLate(cue(), props.placed.dur),
        },
      ]}
      data-cue={name()}
      data-scene={scene()}
      data-live={Option.getOrUndefined(Option.liftPredicate('', props.live))}
      data-until={Option.getOrUndefined(Option.liftPredicate('', () => props.block.until))}
      data-pointed={Option.getOrUndefined(
        Option.liftPredicate('', () => pointsAt(editor.pointed(), scene(), name())),
      )}
      onPointerEnter={(e: PointerEvent) => {
        if (e.pointerType === 'mouse') actions.point(Option.some({ scene: scene(), cue: name() }));
      }}
      onPointerLeave={() => actions.point(Option.none())}
      style={{
        left: pct(props.window(), cue().start),
        width: len(props.window(), cue().dur),
        '--after': after(),
      }}
      title={`${name()}: ${title()} · ${timecode(cue().start, meta.film.fps)}–${timecode(cue().end, meta.film.fps)} · ${cue().ease}`}
      onPointerDown={press}
    >
      {/* Its words where the bar has room for them, else its name (`player.css`, by the bar's width). */}
      <Show when={props.worded}>
        {/* What follows the name drops whole before the name is cut; its text still reads as the words. */}
        <span class="lab-cue-words" data-room="full">
          <span class="lab-cue-name">{props.block.name}</span>
          <Show when={Option.getOrUndefined(props.block.more)}>
            {(more) => (
              <>
                {' '}
                <span class="lab-cue-more">{more()}</span>
              </>
            )}
          </Show>
        </span>
        <span class="lab-cue-words" data-room="short">
          {props.block.name}
        </span>
      </Show>
    </Target>
  );
};

interface TrackRowProps {
  readonly placed: Placed<SceneSpec>;
  /** The track's name: at the left of its first lane, none beside the lanes stacked under it. */
  readonly label: string;
  /** A named track (its cues name it), whose bars carry their words. */
  readonly named: boolean;
  /** The first lane of its track: a rule parts it from the track above. */
  readonly first: boolean;
  /** Its cues, by their clock (`tracks.ts`). */
  readonly blocks: ReadonlyArray<Block>;
  readonly window: () => StripWindow;
  readonly rows: () => Option.Option<HTMLElement>;
  /** A press on the lane beside the bars: a drag across it marks the in and out points. */
  readonly lane: (e: PointerEvent) => void;
  /** Whether the playhead is inside cue `name`. */
  readonly live: (name: string) => boolean;
}

/** One lane of a track: its name (on its first), and its cues' bars where they play. */
const TrackRow = (props: TrackRowProps) => (
  <div
    class="lab-strip-row"
    data-named={Option.getOrUndefined(Option.liftPredicate('', () => props.named))}
    data-first={Option.getOrUndefined(Option.liftPredicate('', () => props.first))}
    onPointerDown={props.lane}
  >
    <span class="lab-cue-label">{props.label}</span>
    {/* The lane clips its bars to the window; the name stays beside it. */}
    <div class="lab-cue-lane">
      <For each={props.blocks} keyed={(b) => b.name}>
        {(block) => (
          <CueBar
            placed={props.placed}
            block={block()}
            worded={props.named}
            window={props.window}
            rows={props.rows}
            live={() => props.live(block().name)}
            next={() =>
              Option.map(
                Option.flatMap(
                  Arr.findFirstIndex(props.blocks, (b) => b.name === block().name),
                  (i) => Arr.get(props.blocks, i + 1),
                ),
                (b) => b.cue.start,
              )
            }
          />
        )}
      </For>
    </div>
  </div>
);

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
  // The cues by track, read again as they are. While a cue is held its bar keeps its lane (`heldLanes`): the bar
  // holds the pointer, so remounting it on another lane would drop the grip; it stacks once let go.
  const tracks = createMemo((was?: ReadonlyArray<Track>) => {
    lab.revision();
    const scene = state.stripScene();
    const next = tracksOf(meta.stage.timelineOf(scene), meta.stage.cuesOf(scene));
    return Option.match(
      Option.filter(Option.fromUndefinedOr(was), () => state.holding()),
      { onSome: (held) => heldLanes(held, next), onNone: () => next },
    );
  });
  let rows = Option.none<HTMLElement>();
  let scroller = Option.none<HTMLElement>();
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
        // The lanes the playhead is inside, counted once a frame: each row's lit bar and what the rows follow read it.
        const live = createMemo(
          () =>
            new Set(liveAt(new Map(cues()), lab.T() - p().start, meta.film.fps).map((l) => l.name)),
        );
        // What the rows follow, as one key (`lanes.ts`): the scene and its live lanes in the strip's order.
        const following = createMemo(() => lanesKey(p().spec.id, stripOrder(tracks()), live()));
        // The scene's marks: the labels named over the words, ruled down through the tracks.
        const labels = createMemo(() => labelsOf(p().speechStart, p().voice.marks));
        // The strip's rows: each track's lanes, its name on the first.
        const lanes = createMemo(() =>
          tracks().flatMap((track) =>
            track.lanes.map((blocks, i) => ({
              key: `${track.key}\u0000${i}`,
              label: Option.getOrElse(
                Option.liftPredicate(track.name, () => i === 0),
                () => '',
              ),
              named: track.named,
              first: i === 0,
              blocks,
            })),
          ),
        );
        const laneRow = (scene: string, name: string) =>
          Option.flatMap(rows, (r) =>
            Option.fromNullishOr(
              r
                .querySelector(
                  `.lab-cue[data-scene="${CSS.escape(scene)}"][data-cue="${CSS.escape(name)}"]`,
                )
                ?.closest<HTMLElement>('.lab-strip-row'),
            ),
          );
        // The lab's one Follow rule (`lab/follow.ts`): the live lanes kept in the rows' box, below the words held at
        // its top. A hand's scroll lets go until Play or the strip's Follow command; a press on the strip (a grip, a
        // scrub, a range) holds it still.
        const [readerHas, setReaderHas] = createSignal(false);
        onCleanup(
          meta.hub.commands.register(
            stripFollowCommand({ letGo: readerHas, follow: () => setReaderHas(false) }),
          ),
        );
        useFollow({
          box: () => scroller,
          content: () => rows,
          target: following,
          span: (key) =>
            Option.flatMap(lanesOf(key), (lanes) =>
              Option.all({
                first: laneRow(lanes.scene, lanes.first),
                last: laneRow(lanes.scene, lanes.last),
              }),
            ),
          clear: () => ({
            top: Option.match(
              Option.flatMap(rows, (r) =>
                Option.fromNullishOr(r.querySelector<HTMLElement>('.lab-strip-words')),
              ),
              { onNone: () => 0, onSome: (w) => w.offsetHeight },
            ),
            bottom: 0,
          }),
          placing: () => !readerHas() && !state.holding() && Option.isNone(held()),
          reader: () => setReaderHas(true),
          played: () => setReaderHas(false),
        });
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
                {`${p().spec.id} · ${timecode(p().dur, meta.film.fps)} · ${file()} · ${countText(tracks(), labels().length)}`}
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
                aria-pressed={pressed(state.snap())}
                title={`Snap to words, marks, cue edges and frames (${keys.first(SNAP)}; ⇧ flips it while dragging)`}
                onPointerDown={(e) => e.preventDefault()}
                onClick={() => meta.hub.invokeId(SNAP, BY_BUTTON)}
              >
                Snap
              </button>
            </div>
            {/* The rows scroll in their own box, the words held at its top, so the film keeps its row. */}
            <div
              class="lab-strip-scroll"
              ref={(el: HTMLDivElement) => {
                scroller = Option.some(el);
              }}
            >
              <div
                class="lab-strip-rows"
                ref={(el: HTMLDivElement) => {
                  rows = Option.some(el);
                }}
              >
                <Words placed={p()} labels={labels()} window={shown} />
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
                {/* Each mark's rule down through the tracks: a cue whose edge is on it reads as tied to it. */}
                <For each={labels()}>
                  {(label) => <i class="lab-strip-guide" style={{ left: pct(shown(), label.t) }} />}
                </For>
                <For each={lanes()} keyed={(l) => l.key}>
                  {(row) => (
                    <TrackRow
                      placed={p()}
                      label={row().label}
                      named={row().named}
                      first={row().first}
                      blocks={row().blocks}
                      window={shown}
                      rows={() => rows}
                      lane={lane}
                      live={(name) => live().has(name)}
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
