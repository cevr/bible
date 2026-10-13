// The notes' pieces the staged film has: the composer (`Form`), in the
// notes' place in the Lab's panel (`Section`) or under the Script's line it
// is about; the marks on the frame (a surface under every other mark that
// takes a click, a drag or the pen, the draft's marks, and the selected
// note's on its own frame); and the notes' pins on the timeline. All read
// the notes' context. The list, the pen and Note frame are the page's
// (`list.tsx`), rendered by the server as well.

import { Toggle } from '@bible/ui/toggle';
import { ToggleGroup } from '@bible/ui/toggle-group';
import { For, Portal, Show } from '@solidjs/web';
import { Array as Arr, Effect, Option } from 'effect';
import { createEffect, createSignal, createUniqueId, onCleanup, untrack } from 'solid-js';
import { DRAG_PX, Pointer, Surface } from '../../browser/pointer.ts';
import { quietly } from '../../command/command.ts';
import type { InkStroke, Note, NoteBox, NoteKind, Point } from '../../core/schema.ts';
import { focusFor } from '../focus.ts';
import { useLabPage } from '../panel.tsx';
import { pressed } from '../pressed.ts';
import { Lab, useLab } from '../shell.tsx';
import { type Written, useNotes } from './context.tsx';
import { type Unsaid, filmPixel, unsaid } from './draft.ts';

/** What a note on words can ask of them, as the composer's segmented control names each. */
const ASKS: ReadonlyArray<{ readonly kind: NoteKind; readonly label: string }> = [
  { kind: 'note', label: 'Note' },
  { kind: 'correction', label: 'Correct' },
  { kind: 'removal', label: 'Remove' },
];

/** What Save says, for what the note asks. */
const SAVE: Readonly<Record<NoteKind, string>> = {
  note: 'Save note',
  correction: 'Save correction',
  removal: 'Save removal',
};

/** What the note's field asks for, on words, by what the note asks of them. */
const ON_WORDS: Readonly<Record<NoteKind, string>> = {
  note: 'What should change in these words?',
  correction: 'Why say it so? (optional)',
  removal: 'Why cut them? (optional)',
};

/**
 * The note being written: where it sits, what it is about beside its frame
 * (its scope chip, whose × writes it about the frame alone), on words what
 * it asks of them (Note, Correct with the words to say instead, under their
 * label, Remove), its words, Save and Cancel, and why it did not save; ⌘↵
 * in its fields saves. A Save that makes no note marks the field that says
 * too little (invalid, described by the line saying why) and takes the keys
 * there, until it is written in. A note saved or cancelled leaves it empty;
 * one opened takes the keys in its field (a correction's: the words to say
 * instead, selected to be written over), showing the ring whatever asked,
 * as a click into a text field does (`focusFor`).
 */
export const Form = () => {
  const { state, actions } = useNotes();
  const { meta } = useLab();
  let form = Option.none<HTMLFormElement>();
  let area = Option.none<HTMLTextAreaElement>();
  let instead = Option.none<HTMLInputElement>();
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
  // Why the last Save made no note, and of which field: until it is opened or closed again, or written in.
  const [hint, setHint] = createSignal(Option.none<Unsaid>(), { ownedWrite: true });
  const unhint = () => setHint(Option.none());
  /** Whether the last Save found `field` saying too little. */
  const wanting = (field: Unsaid['field']) => Option.exists(hint(), (h) => h.field === field);
  /** The status line, for a field the last Save found saying too little. */
  const describedBy = (field: Unsaid['field']) =>
    Option.getOrUndefined(Option.as(Option.liftPredicate(field, wanting), status));
  createEffect(
    () => [state.composerOpen(), state.composerTyping()] as const,
    ([shown, typing]) => {
      setHint(Option.none());
      Option.map(area, (el) => {
        if (!shown) el.value = '';
      });
      if (!typing) return;
      // A correction opens on the words to say instead, selected to be written over; any other note on its field.
      Option.match(
        Option.filter(instead, (el) => el.isConnected && untrack(state.asked) === 'correction'),
        {
          onSome: (el) => {
            focusFor(el, meta.hub.input());
            el.select();
          },
          onNone: () => Option.map(area, (el) => focusFor(el, meta.hub.input())),
        },
      );
    },
  );
  const written = (text: string): Written => ({
    text,
    replace: Option.match(instead, { onNone: () => '', onSome: (el) => el.value }),
  });
  return (
    <form
      class="lab-compose"
      hidden={!state.composerOpen()}
      ref={(el: HTMLFormElement) => {
        form = Option.some(el);
      }}
      onSubmit={(e) => {
        e.preventDefault();
        Option.map(area, (el) => {
          const said = written(el.value);
          Option.match(
            unsaid(said.text, state.words(), { kind: state.asked(), replace: said.replace }),
            {
              onSome: (why) => {
                setHint(Option.some(why));
                // The keys go to the field that said too little, as a Save that found it wanting asked.
                Option.map(
                  Option.orElse(
                    Option.filter(instead, (field) => why.field === 'instead' && field.isConnected),
                    () => Option.some<HTMLElement>(el),
                  ),
                  (field) => focusFor(field, meta.hub.input()),
                );
              },
              onNone: () => {
                setHint(Option.none());
                actions.save(said);
              },
            },
          );
        });
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
      <Show when={Option.getOrUndefined(state.words())}>
        {(words) => (
          <>
            <ToggleGroup<NoteKind>
              class="sh-seg lab-asks"
              aria-label="What the note asks of the words"
              value={[state.asked()]}
              onValueChange={(pressed) => {
                Option.map(Arr.head(pressed), actions.ask);
              }}
            >
              <For each={ASKS}>
                {(ask) => (
                  <Toggle<NoteKind> value={ask.kind} data-ask={ask.kind}>
                    {ask.label}
                  </Toggle>
                )}
              </For>
            </ToggleGroup>
            <Show when={state.asked() === 'correction'}>
              <label class="lab-instead-field">
                <span class="lab-field-label">Say instead</span>
                <input
                  class="lab-instead"
                  type="text"
                  autocomplete="off"
                  spellcheck={false}
                  aria-invalid={pressed(wanting('instead'))}
                  aria-describedby={describedBy('instead')}
                  onInput={unhint}
                  ref={(el: HTMLInputElement) => {
                    // The words as they read, to be rewritten: set once, never under the writer's hand.
                    el.value = untrack(words).text;
                    instead = Option.some(el);
                  }}
                />
              </label>
            </Show>
          </>
        )}
      </Show>
      <textarea
        rows="3"
        aria-label="Note"
        aria-invalid={pressed(wanting('note'))}
        aria-describedby={describedBy('note')}
        onInput={unhint}
        placeholder={Option.match(state.words(), {
          onNone: () => 'What should change on this frame?',
          onSome: () => ON_WORDS[state.asked()],
        })}
        ref={(el: HTMLTextAreaElement) => {
          area = Option.some(el);
        }}
      />
      <div class="lab-actions">
        <button type="submit" class="sh-btn" data-primary="">
          {Option.match(state.words(), {
            onNone: () => SAVE.note,
            onSome: () => SAVE[state.asked()],
          })}
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
 * page lists (`list.tsx`).
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
