// The notes' pieces: the pen and the Note frame button in the panel's header; the section (the
// composer, the feed's status and the list of notes with their threads, or
// how to make one while there is none); the
// marks on the frame (a surface under every other mark that takes a click,
// a drag or the pen, the draft's marks, and the selected note's on its own
// frame); and the notes' pins on the timeline. All read the notes' context.

import { For, Portal, Show } from '@solidjs/web';
import { Effect, Option } from 'effect';
import { createEffect } from 'solid-js';
import { Pointer } from '../../browser/pointer.ts';
import { stillUrl } from '../../core/api.ts';
import type { InkStroke, Note, NoteBox, Point } from '../../core/schema.ts';
import { Selection } from '../../command/selection.ts';
import { Target, type TargetElementProps } from '../command/context-menu.tsx';
import { useLab } from '../shell.tsx';
import { chordLabel } from '../../command/keymap.ts';
import { hubChanges } from '../command/changes.ts';
import { useNotes } from './context.tsx';
import { filmPixel } from './draft.ts';

/** A pointer that moves less than this many screen pixels clicked; more, it dragged. */
const DRAG_PX = 6;

/** The pen: a drag on the frame draws ink while it is on. */
export const Pen = () => {
  const { state, actions } = useNotes();
  return (
    <button
      type="button"
      data-act="pen"
      class={{ on: state.pen() }}
      title="draw freehand ink on the frame"
      onClick={actions.togglePen}
    >
      Pen
    </button>
  );
};

/** Note the whole frame shown: the touch path for `n`. */
export const Frame = () => {
  const { actions } = useNotes();
  return (
    <button
      type="button"
      data-act="note-frame"
      title="note the whole frame shown (n)"
      onClick={actions.noteFrame}
    >
      Note frame
    </button>
  );
};

/** A note in the list: its id, scene and the time it shows at now, with its nearest cue edge. */
const label = (note: Note, T: number) => {
  const cue = Option.match(Option.fromUndefinedOr(note.cue), {
    onNone: () => '',
    onSome: (c) => ` · ${c.name}:${c.edge}`,
  });
  return `${note.id} · ${note.scene} · ${T.toFixed(2)}s${cue}`;
};

const Still = (props: { readonly name: string }) => {
  const { meta } = useLab();
  return (
    <img class="lab-still" src={stillUrl(meta.name, props.name)} alt={props.name} loading="lazy" />
  );
};

/** A reply and a resolve, on the selected note while it is open. */
const ReplyForm = (props: { readonly note: Note }) => {
  const { actions } = useNotes();
  let input = Option.none<HTMLInputElement>();
  return (
    <form
      class="lab-reply-form"
      onSubmit={(e) => {
        e.preventDefault();
        Option.map(input, (el) => {
          const text = el.value.trim();
          if (text === '') return;
          actions.write({ _tag: 'Reply', id: props.note.id, text });
          el.value = '';
        });
      }}
    >
      <input
        class="lab-reply-input"
        placeholder="Reply…"
        ref={(el: HTMLInputElement) => {
          input = Option.some(el);
        }}
      />
      <button
        type="button"
        class="lab-resolve"
        onClick={() => actions.write({ _tag: 'Resolve', id: props.note.id })}
      >
        Resolve
      </button>
    </form>
  );
};

/** One note in the list: its place, words, still and thread. */
const Item = (props: { readonly note: Note }) => {
  const { state, actions } = useNotes();
  const selected = () => Option.exists(state.selected(), (s) => s.id === props.note.id);
  return (
    <Target
      of={Selection.cases.Note.make({ id: props.note.id })}
      render={(p: TargetElementProps) => <li {...p} />}
      class={['lab-note-item', props.note.status, { selected: selected() }]}
      data-id={props.note.id}
      onClick={(e) => {
        if (e.target instanceof HTMLInputElement || e.target instanceof HTMLButtonElement) return;
        actions.select(props.note);
      }}
    >
      <div class="lab-note-head">
        <span class="lab-note-label">{label(props.note, state.timeOf(props.note))}</span>
        <span class={['lab-badge', props.note.status]}>{props.note.status}</span>
      </div>
      <p class="lab-note-text">{props.note.text}</p>
      <Still name={props.note.still} />
      <ol class="lab-thread">
        <For each={props.note.thread}>
          {(reply) => (
            <li class={['lab-reply', reply.by]}>
              <span class="lab-by">{reply.by}</span>
              <p class="lab-reply-text">{reply.text}</p>
              <Show when={reply.still}>{(still) => <Still name={still()} />}</Show>
            </li>
          )}
        </For>
      </ol>
      <Show when={selected() && props.note.status !== 'resolved'}>
        <ReplyForm note={props.note} />
        <span class="lab-status">{state.threadStatus()}</span>
      </Show>
    </Target>
  );
};

/** The composer, the feed's status, and the notes, newest first (how to make one while there is none). */
export const Section = () => {
  const { state, actions } = useNotes();
  const { meta } = useLab();
  const changes = hubChanges(meta.hub);
  // Note this frame's key as bound now: a rebound key reads as rebound.
  const noteKey = () => {
    changes();
    return meta.hub
      .keysOf('notes.frame')
      .slice(0, 1)
      .map((k) => chordLabel(k, meta.hub.mac))
      .join('');
  };
  let area = Option.none<HTMLTextAreaElement>();
  const open = () => state.composerOpen();
  // A note saved or cancelled leaves an empty composer; one opened takes the keys.
  createEffect(
    () => [state.composerOpen(), state.composerTyping()] as const,
    ([shown, typing]) => {
      Option.map(area, (el) => {
        if (!shown) el.value = '';
        if (typing) el.focus();
      });
    },
  );
  return (
    <div class="lab-notes-box">
      <form
        class="lab-compose"
        hidden={!open()}
        onSubmit={(e) => {
          e.preventDefault();
          Option.map(area, (el) => actions.save(el.value));
        }}
      >
        <div class="lab-where">{state.where()}</div>
        <textarea
          rows="3"
          placeholder="What should change on this frame?"
          ref={(el: HTMLTextAreaElement) => {
            area = Option.some(el);
          }}
        />
        <div class="lab-actions">
          <button type="submit">Save note</button>
          <button type="button" data-act="cancel" onClick={actions.cancel}>
            Cancel
          </button>
          <span class="lab-status">{state.status()}</span>
        </div>
      </form>
      <span class="lab-feed">{state.feedStatus()}</span>
      <ol class="lab-notes">
        <For each={[...state.notes()].reverse()} keyed={(n) => n.id}>
          {(note) => <Item note={note()} />}
        </For>
      </ol>
      <Show when={state.notes().length === 0 && !open()}>
        <p class="lab-feed" data-role="notes-empty">
          No notes yet: click the frame to pin a point, drag to draw a box, or press{' '}
          <kbd>{noteKey()}</kbd> to note the whole frame.
        </p>
      </Show>
    </div>
  );
};

const BoxMark = (props: { readonly box: NoteBox; readonly class: string }) => (
  <Show
    when={props.box.w > 0 || props.box.h > 0}
    fallback={<circle class={props.class} cx={props.box.x} cy={props.box.y} r="14" />}
  >
    <rect
      class={props.class}
      x={props.box.x}
      y={props.box.y}
      width={props.box.w}
      height={props.box.h}
    />
  </Show>
);

const InkMarks = (props: { readonly ink: ReadonlyArray<InkStroke>; readonly class: string }) => (
  <For each={props.ink}>
    {(stroke) => (
      <polyline class={props.class} points={stroke.map(([x, y]) => `${x},${y}`).join(' ')} />
    )}
  </For>
);

/** Where the pointer is on the frame, in film pixels. */
const pointerAt =
  (surface: SVGRectElement, size: { readonly width: number; readonly height: number }) =>
  (e: PointerEvent): Point =>
    filmPixel(surface.getBoundingClientRect(), size, e.clientX, e.clientY);

/**
 * The notes on the frame, in the overlay: first (under every other mark) a
 * surface a click pins, a drag boxes and the pen inks; then the draft's
 * marks, and the selected note's while its frame shows.
 */
export const Marks = () => {
  const { state: lab, meta } = useLab();
  const { state, actions } = useNotes();
  const { film } = meta;
  const draft = () => state.draft();
  const shownNote = () =>
    Option.filter(state.selected(), (n) => Math.abs(lab.T() - state.timeOf(n)) < 0.5 / film.fps);
  const listen = (surface: SVGRectElement) => {
    const at = pointerAt(surface, film);
    // One gesture at a time: the pointer that pressed first marks; a second
    // finger is ignored until that one lifts or is cancelled.
    let gesture = Option.none<number>();
    const down = (e: PointerEvent) => {
      if (Option.isSome(gesture)) return;
      gesture = Option.some(e.pointerId);
      e.preventDefault();
      const far = (ev: PointerEvent) =>
        Math.hypot(ev.clientX - e.clientX, ev.clientY - e.clientY) >= DRAG_PX;
      actions.press(at(e));
      Effect.runForkWith(meta.host)(
        Pointer.use((pointer) =>
          pointer.drag(e, {
            move: (ev) => actions.drag(at(ev), far(ev)),
            // Lifted, the mark is made; the OS took the gesture (a swipe, a call)
            // or the capture was lost: the mark goes, nothing is written.
            end: (lifted) => {
              gesture = Option.none();
              Option.match(lifted, {
                onNone: () => actions.cancel(),
                onSome: (ev) => actions.lift(at(ev), far(ev)),
              });
            },
          }),
        ),
      );
    };
    // Native, as the handles' are; it lives and goes with the surface it is on.
    surface.addEventListener('pointerdown', down);
  };
  return (
    <>
      <rect
        class={['lab-notes-surface', { pen: state.pen() }]}
        x="0"
        y="0"
        width={film.width}
        height={film.height}
        ref={listen}
      />
      <g class="lab-marks">
        <Show when={Option.getOrUndefined(draft())}>
          {(d) => (
            <>
              <Show when={Option.getOrUndefined(d().box)}>
                {(box) => <BoxMark box={box()} class="lab-draft" />}
              </Show>
              <InkMarks ink={d().ink} class="lab-draft-ink" />
            </>
          )}
        </Show>
        <Show when={Option.getOrUndefined(shownNote())}>
          {(note) => (
            <>
              <Show when={note().box}>{(box) => <BoxMark box={box()} class="lab-note" />}</Show>
              <InkMarks ink={note().ink ?? []} class="lab-note-ink" />
            </>
          )}
        </Show>
      </g>
    </>
  );
};

/** One note's pin on the timeline: a press selects it (and does not seek the track). */
const Pin = (props: { readonly note: Note }) => {
  const { meta } = useLab();
  const { state, actions } = useNotes();
  const listen = (el: HTMLDivElement) => {
    const down = (e: PointerEvent) => {
      e.stopPropagation();
      actions.select(props.note);
    };
    // Native, so it runs before the track's own listener seeks; it goes with the pin.
    el.addEventListener('pointerdown', down);
  };
  return (
    <div
      class={['tick', 'note', props.note.status]}
      data-name={`${props.note.id} · ${props.note.status} · ${props.note.text}`}
      style={{ left: `${(state.timeOf(props.note) / meta.film.duration) * 100}%` }}
      ref={listen}
    />
  );
};

/** The notes' pins on the player's timeline. */
export const Pins = () => {
  const { meta } = useLab();
  const { state } = useNotes();
  return (
    <Portal mount={meta.player.track}>
      <For each={state.notes()} keyed={(n) => n.id}>
        {(note) => <Pin note={note()} />}
      </For>
    </Portal>
  );
};
