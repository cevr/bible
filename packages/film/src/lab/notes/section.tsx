// The notes' pieces the staged film has: the composer (`Form`), in the
// notes' place in the Lab's panel (`Section`); the marks on the frame (a
// surface under every other mark that takes a click, a drag or the pen, the
// draft's marks, and the selected note's on its own frame); and the notes'
// pins on the timeline. All read the notes' context. The list, the pen and
// Note frame are the Lab page's (`panel.tsx`, each note as `thread.tsx`
// shows it), rendered by the server as well.

import { For, Portal, Show } from '@solidjs/web';
import { Effect, Option } from 'effect';
import { createEffect, createSignal, createUniqueId, onCleanup } from 'solid-js';
import { DRAG_PX, Pointer, Surface } from '../../browser/pointer.ts';
import { quietly } from '../../command/command.ts';
import type { InkStroke, Note, NoteBox, Point } from '../../core/schema.ts';
import { focusFor } from '../focus.ts';
import { useLabPage } from '../panel.tsx';
import { pressed } from '../pressed.ts';
import { Lab, useLab } from '../shell.tsx';
import { useNotes } from './context.tsx';
import { type Unsaid, filmPixel, unsaid } from './draft.ts';

/**
 * The note being written: where it sits, what it is about beside its frame
 * (its scope chip, whose × writes it about the frame alone), its words, Save
 * and Cancel, and why it did not save; ⌘↵ in its field saves. A Save that
 * makes no note marks the field (invalid, described by the line saying why)
 * and takes the keys there, until it is written in. A note saved or
 * cancelled leaves it empty; one opened takes the keys in its field,
 * showing the ring whatever asked, as a click into a text field does
 * (`focusFor`).
 */
export const Form = () => {
  const { state, actions } = useNotes();
  const { meta } = useLab();
  let form = Option.none<HTMLFormElement>();
  let area = Option.none<HTMLTextAreaElement>();
  // The line that says why Save made no note: what describes the field that said too little.
  const status = createUniqueId();
  // ⌘↵ saves from the note's fields, as Save does.
  onCleanup(
    meta.hub.commands.register({
      id: 'notes.save',
      label: 'Save the note',
      group: 'Notes',
      keys: ['mod+enter'],
      keysIn: ['field'],
      touch: "the composer's Save button",
      when: () => state.composerTyping(),
      run: quietly(() => Option.map(form, (el) => el.requestSubmit())),
    }),
  );
  // Why the last Save made no note: until it is opened or closed again, or written in.
  const [hint, setHint] = createSignal(Option.none<Unsaid>(), { ownedWrite: true });
  const unhint = () => setHint(Option.none());
  createEffect(
    () => [state.composerOpen(), state.composerTyping()] as const,
    ([shown, typing]) => {
      setHint(Option.none());
      Option.map(area, (el) => {
        if (!shown) el.value = '';
        if (typing) focusFor(el, meta.hub.input());
      });
    },
  );
  return (
    <form
      class="lab-compose"
      hidden={!state.composerOpen()}
      ref={(el: HTMLFormElement) => {
        form = Option.some(el);
      }}
      onSubmit={(e) => {
        e.preventDefault();
        Option.map(area, (el) =>
          Option.match(unsaid(el.value, Option.none(), { kind: 'note', replace: '' }), {
            onSome: (why) => {
              setHint(Option.some(why));
              // The keys go back to the field that said too little.
              focusFor(el, meta.hub.input());
            },
            onNone: () => {
              setHint(Option.none());
              actions.save(el.value);
            },
          }),
        );
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
        aria-label="Note"
        aria-invalid={pressed(Option.isSome(hint()))}
        aria-describedby={Option.getOrUndefined(Option.as(hint(), status))}
        onInput={unhint}
        placeholder="What should change on this frame?"
        ref={(el: HTMLTextAreaElement) => {
          area = Option.some(el);
        }}
      />
      <div class="lab-actions">
        <button type="submit" class="sh-btn" data-primary="">
          Save note
        </button>
        <button type="button" class="sh-btn" data-act="cancel" onClick={actions.cancel}>
          Cancel
        </button>
        <span class="lab-status" role="status" id={status}>
          {Option.match(hint(), { onNone: () => state.status(), onSome: (h) => h.says })}
        </span>
      </div>
    </form>
  );
};

/**
 * The composer, in the notes' place in the Lab's panel, above the notes the
 * page lists (`panel.tsx`).
 */
export const Section = () => {
  const { state } = useNotes();
  const page = useLabPage();
  // A note begun (Note frame, its key, a pin) shows the Note mode, where it is written: once
  // it waits for its words, so the strip folding in Note never moves the frame under a drag.
  createEffect(state.composerTyping, (typing) => {
    if (typing) page.showMode('note');
  });
  return (
    <Lab.Fill at="compose">
      <Form />
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
    // One gesture at a time (`Pointer.press`): the pointer that pressed first
    // marks; a second finger is ignored until that one lifts or is cancelled.
    const marks = new Surface('the notes');
    const down = (e: PointerEvent) => {
      const far = (ev: PointerEvent) =>
        Math.hypot(ev.clientX - e.clientX, ev.clientY - e.clientY) >= DRAG_PX;
      Effect.runForkWith(meta.host)(
        Pointer.use((pointer) =>
          pointer.press(e, marks, () => {
            e.preventDefault();
            actions.press(at(e));
            return Option.some({
              move: (ev: PointerEvent) => actions.drag(at(ev), far(ev)),
              // Lifted, the mark is made; the OS took the gesture (a swipe, a call)
              // or the capture was lost: the mark goes, nothing is written.
              end: (lifted: Option.Option<PointerEvent>) =>
                Option.match(lifted, {
                  onNone: () => actions.cancel(),
                  onSome: (ev) => actions.lift(at(ev), far(ev)),
                }),
            });
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
