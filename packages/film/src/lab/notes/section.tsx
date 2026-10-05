// The notes' pieces the staged film has: the composer, in the notes' place
// in the page's panel; the marks on the frame (a surface under every other
// mark that takes a click, a drag or the pen, the draft's marks, and the
// selected note's on its own frame); and the notes' pins on the timeline.
// All read the notes' context. The list, the pen and Note frame are the
// page's (`list.tsx`), rendered by the server as well.

import { For, Portal, Show } from '@solidjs/web';
import { Effect, Option } from 'effect';
import { createEffect } from 'solid-js';
import { Pointer } from '../../browser/pointer.ts';
import type { InkStroke, Note, NoteBox, Point } from '../../core/schema.ts';
import { useLabPage } from '../panel.tsx';
import { Lab, useLab } from '../shell.tsx';
import { useNotes } from './context.tsx';
import { filmPixel } from './draft.ts';

/** A pointer that moves less than this many screen pixels clicked; more, it dragged. */
const DRAG_PX = 6;

/**
 * The composer, in the notes' place in the page's panel, above the notes the
 * page lists (`list.tsx`).
 */
export const Section = () => {
  const { state, actions } = useNotes();
  const page = useLabPage();
  // A note begun (Note frame, its key, a pin) shows the Note mode, where it is written.
  createEffect(state.composerOpen, (shown) => {
    if (shown) page.showMode('note');
  });
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
    <Lab.Fill at="compose">
      <form
        class="lab-compose"
        hidden={!open()}
        onSubmit={(e) => {
          e.preventDefault();
          Option.map(area, (el) => actions.save(el.value));
        }}
      >
        <div class="lab-where">{state.where()}</div>
        <Show when={Option.getOrUndefined(state.scope())}>
          {(scope) => (
            <span class="lab-scope" data-role="note-scope">
              <span class="lab-scope-text">{scope()}</span>
              <button
                type="button"
                data-act="clear-scope"
                aria-label="Write it about this frame alone"
                title="Write it about this frame alone"
                onClick={actions.clearScope}
              >
                ×
              </button>
            </span>
          )}
        </Show>
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
    </Lab.Fill>
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
