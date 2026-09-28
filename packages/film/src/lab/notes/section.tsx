// The notes' pieces: the pen in the panel's header; the section (the
// composer, the feed's status and the list of notes with their threads); the
// marks on the frame (a surface under every other mark that takes a click,
// a drag or the pen, the draft's marks, and the selected note's on its own
// frame); and the notes' pins on the timeline. All read the notes' context.

import { For, Portal, Show } from '@solidjs/web';
import { Option } from 'effect';
import { createEffect, onCleanup } from 'solid-js';
import type { InkStroke, Note, NoteBox, Point } from '../../core/schema.ts';
import { useLab } from '../shell.tsx';
import { draftMarks } from './composer.ts';
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

const label = (note: Note) => {
  const cue = Option.match(Option.fromUndefinedOr(note.cue), {
    onNone: () => '',
    onSome: (c) => ` · ${c.name}:${c.edge}`,
  });
  return `${note.id} · ${note.scene} · ${note.T.toFixed(2)}s${cue}`;
};

const Still = (props: { readonly name: string }) => {
  const { meta } = useLab();
  return (
    <img
      class="lab-still"
      src={`${meta.api}/stills/${props.name}`}
      alt={props.name}
      loading="lazy"
    />
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
    <li
      class={['lab-note-item', props.note.status, { selected: selected() }]}
      data-id={props.note.id}
      onClick={(e) => {
        if (e.target instanceof HTMLInputElement || e.target instanceof HTMLButtonElement) return;
        actions.select(props.note);
      }}
    >
      <div class="lab-note-head">
        <span class="lab-note-label">{label(props.note)}</span>
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
    </li>
  );
};

/** The composer, the feed's status, and the notes, newest first. */
export const Section = () => {
  const { state, actions } = useNotes();
  let area = Option.none<HTMLTextAreaElement>();
  const open = () => state.composer()._tag !== 'Closed';
  // A note saved or cancelled leaves an empty composer; one opened takes the keys.
  createEffect(
    () => state.composer()._tag,
    (tag) => {
      Option.map(area, (el) => {
        if (tag === 'Closed') el.value = '';
        if (tag === 'Open') el.focus();
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
  const draft = () => draftMarks(state.composer());
  const shownNote = () =>
    Option.filter(state.selected(), (n) => Math.abs(lab.T() - n.T) < 0.5 / film.fps);
  const listen = (surface: SVGRectElement) => {
    const at = pointerAt(surface, film);
    const down = (e: PointerEvent) => {
      e.preventDefault();
      surface.setPointerCapture(e.pointerId);
      const far = (ev: PointerEvent) =>
        Math.hypot(ev.clientX - e.clientX, ev.clientY - e.clientY) >= DRAG_PX;
      const move = (ev: PointerEvent) => actions.drag(at(ev), far(ev));
      const up = (ev: PointerEvent) => {
        surface.removeEventListener('pointermove', move);
        surface.removeEventListener('pointerup', up);
        actions.lift(at(ev), far(ev));
      };
      actions.press(at(e));
      surface.addEventListener('pointermove', move);
      surface.addEventListener('pointerup', up);
    };
    surface.addEventListener('pointerdown', down);
    onCleanup(() => surface.removeEventListener('pointerdown', down));
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
  const { actions } = useNotes();
  const listen = (el: HTMLDivElement) => {
    const down = (e: PointerEvent) => {
      e.stopPropagation();
      actions.select(props.note);
    };
    el.addEventListener('pointerdown', down);
    onCleanup(() => el.removeEventListener('pointerdown', down));
  };
  return (
    <div
      class={['tick', 'note', props.note.status]}
      data-name={`${props.note.id} · ${props.note.status} · ${props.note.text}`}
      style={{ left: `${(props.note.T / meta.film.duration) * 100}%` }}
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
