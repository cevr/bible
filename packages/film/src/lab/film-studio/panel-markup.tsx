// A Board panel marked up in the inspector: the owner draws on the try shown
// (circles, arrows, a stroke, a word pinned where it belongs) with the
// sketch surface (`lab/sketch/`), says what to change, and saves it as a
// note or as a tweak, which an agent makes again with his marks as its
// reference (`board tweak`). The words and marks are the note's draft
// (`board/note.ts`), the try with the marks over it its still
// (`panel-still.ts`); a save runs through the inspector's note machine
// (`note-save.ts`), and the note it files shows in Notes and asks at once.

import { For, Show } from '@solidjs/web';
import { Boolean as Bool, Effect, Option, Schema } from 'effect';
import * as ActorAtom from 'effect-machine/atom';
import { useAtomSet, useAtomValue } from '@bible/atom-solid';
import type { Accessor } from 'solid-js';
import { createEffect, createSignal, untrack } from 'solid-js';
import { Frames } from '../../browser/frames.ts';
import type { BoardTry, Panel } from '../../core/board.ts';
import { FILM_FPS } from '../../core/time.ts';
import type { BoardClip } from '../../core/timeline-schema.ts';
import { Actor } from '../actor.tsx';
import { NotesApi } from '../api.ts';
import { PanelAsking, panelNoteOf } from '../board/note.ts';
import { useNotesFeed } from '../notes/thread.tsx';
import { pressed } from '../pressed.ts';
import { type SketchEvent, type SketchState, sketchOf, step } from '../sketch/gesture.ts';
import { Sketch } from '../sketch/surface.tsx';
import { useStudio } from './context.tsx';
import {
  type NoteSave,
  type NoteSaveActor,
  NoteSaveEvent,
  noteSaveLine,
  spawnNoteSave,
} from './note-save.ts';
import { STILL_SIZE, panelStill } from './panel-still.ts';

/** What a save can ask, as the choice says it. */
const ASKINGS: ReadonlyArray<{ readonly asking: PanelAsking; readonly label: string }> = [
  { asking: 'tweak', label: 'Tweak' },
  { asking: 'note', label: 'Note' },
];

/**
 * The words and marks being made on one try, and the save's machine. They
 * live while the panel's row does: shutting the markup hides them and
 * keeps them, and a save under way lands.
 */
const Composer = (props: {
  readonly actor: NoteSaveActor;
  readonly clip: BoardClip;
  readonly tried: Accessor<BoardTry>;
  readonly size: { readonly w: number; readonly h: number };
  readonly open: Accessor<boolean>;
}) => {
  const { meta } = useStudio();
  const atom = ActorAtom.make(props.actor);
  const saving = useAtomValue(() => atom);
  const send = useAtomSet(() => atom);
  const busy = () => saving()._tag === 'Saving';
  const [sketch, setSketch] = createSignal<SketchState>(sketchOf(), { ownedWrite: true });
  const [text, setText] = createSignal('', { ownedWrite: true });
  const [asking, setAsking] = createSignal<PanelAsking>('tweak', { ownedWrite: true });
  // Marks are drawn on one picture: another try shown starts a fresh sketch; the words carry over.
  createEffect(
    () => props.tried().n,
    () => {
      setSketch(sketchOf());
    },
  );
  // A save that landed clears what it sent: nothing changes while it is on its way.
  createEffect(
    () =>
      Bool.match(saving()._tag === 'Saved', {
        onTrue: () => Option.some(saving()),
        onFalse: () => Option.none(),
      }),
    (saved) => {
      if (Option.isNone(saved)) return;
      setSketch(sketchOf());
      setText('');
    },
  );
  const drawn = () => sketch().items;
  const empty = () => text().trim() === '' && drawn().length === 0;
  const onSketch = (event: SketchEvent, view: { readonly w: number; readonly h: number }) => {
    if (!untrack(busy)) setSketch((s) => step(s, event, view));
  };
  return (
    <Sketch.Provider host={meta.host} state={sketch} send={onSketch}>
      <Show when={props.open()}>
        <div
          class="st-markup"
          data-try={props.tried().n}
          // Opened under the panel's tries, it comes into the pane's view once laid out.
          ref={(el: HTMLDivElement) => {
            Effect.runCallbackWith(meta.host)(
              Frames.use((f) => f.next).pipe(
                Effect.andThen(Effect.sync(() => el.scrollIntoView({ block: 'nearest' }))),
              ),
            );
          }}
        >
          <div class="st-markup-frame">
            <img
              class="st-markup-pic"
              src={meta.boardUrl(props.tried().file)}
              alt={`Try ${props.tried().n} of ${props.clip.panel}, to mark up`}
            />
            <svg
              class="lab-overlay st-markup-over"
              viewBox={`0 0 ${props.size.w} ${props.size.h}`}
              preserveAspectRatio="none"
              aria-label={`Draw on try ${props.tried().n}`}
            >
              <Sketch.Surface width={props.size.w} height={props.size.h} />
            </svg>
          </div>
          <Sketch.Toolbar />
          <Sketch.Keys hub={meta.hub} />
          <textarea
            class="sh-field st-markup-text"
            aria-label={`What to change in ${props.clip.panel}`}
            placeholder="Say what to change; your marks show where…"
            rows="3"
            disabled={busy()}
            value={text()}
            onInput={(e) => setText(e.currentTarget.value)}
          />
          <div class="st-markup-acts">
            <div class="sh-seg" role="group" aria-label="Save it as">
              <For each={ASKINGS}>
                {(a) => (
                  <button
                    type="button"
                    data-asking={a.asking}
                    aria-pressed={pressed(asking() === a.asking)}
                    onClick={() => setAsking(a.asking)}
                  >
                    {a.label}
                  </button>
                )}
              </For>
            </div>
            <button
              type="button"
              class="sh-btn"
              data-primary
              data-act="save-markup"
              disabled={busy() || empty()}
              onClick={() =>
                send(
                  NoteSaveEvent.Save({
                    ask: untrack(asking),
                    text: untrack(text),
                    replace: '',
                    sketch: untrack(drawn),
                  }),
                )
              }
            >
              Save
            </button>
          </div>
          <p class="st-markup-said" data-role="markup-said" aria-live="polite">
            {Option.getOrElse(noteSaveLine(saving()), () =>
              Bool.match(asking() === 'tweak', {
                onTrue: () => 'A tweak asks an agent to make the panel again from your marks.',
                onFalse: () => 'A note waits in Notes and asks.',
              }),
            )}
          </p>
        </div>
      </Show>
    </Sketch.Provider>
  );
};

/**
 * Mark up, on a picture panel with a try: a press opens the try shown on
 * the panel (the one in the viewer, else the kept one) to draw on and the
 * words to say, and shuts it again, what was made kept.
 */
export const PanelMarkup = (props: {
  readonly clip: BoardClip;
  readonly panel: Accessor<Panel>;
  readonly tried: Accessor<BoardTry>;
  /** Film seconds its beat starts at. */
  readonly beatStart: number;
}) => {
  const { meta } = useStudio();
  const feed = useNotesFeed();
  const [open, setOpen] = createSignal(false, { ownedWrite: true });
  const size = Option.match(untrack(meta.drawn), {
    onNone: () => STILL_SIZE,
    onSome: (film) => ({ w: film.width, h: film.height }),
  });
  const save = (s: NoteSave) =>
    Effect.gen(function* () {
      const tried = untrack(props.tried);
      const asking = yield* Schema.decodeUnknownEffect(PanelAsking)(s.ask).pipe(
        Effect.mapError(() => `a panel takes a note or a tweak, not a ${s.ask}`),
      );
      const draft = yield* Effect.fromOption(
        panelNoteOf({
          panel: untrack(props.panel),
          tried: Option.some(tried.n),
          asking,
          text: s.text,
          sketch: s.sketch,
          at: props.clip.markAt,
          beatStart: props.beatStart,
          fps: FILM_FPS,
        }),
      ).pipe(Effect.mapError(() => 'say what to change, or mark it on the panel'));
      const still = yield* panelStill(meta.boardUrl(tried.file), s.sketch, size);
      const note = yield* NotesApi.use((api) => api.add({ ...draft, still })).pipe(
        Effect.mapError((failure) => failure.message),
      );
      feed.refresh();
      return note.id;
    });
  return (
    <>
      <button
        type="button"
        class="sh-btn st-markup-open"
        data-act="markup"
        aria-expanded={pressed(open())}
        onClick={() => setOpen((o) => !o)}
      >
        {Bool.match(open(), { onTrue: () => 'Close the markup', onFalse: () => 'Mark up' })}
      </button>
      <Actor runtime={meta.runtime} spawn={spawnNoteSave(save)}>
        {(actor) => (
          <Composer actor={actor} clip={props.clip} tried={props.tried} size={size} open={open} />
        )}
      </Actor>
    </>
  );
};
