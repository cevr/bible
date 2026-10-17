// A note on a line's words in the studio's inspector, under the words
// selected in its Words section: a note on them, a correction (the words to
// say instead) or a removal. What a draft carries, and why one says too
// little, is `notes/draft.ts`'s; a save runs through the inspector's note
// machine (`note-save.ts`), and the note it files shows in Notes and asks at
// once. Its frame is the playhead's while it stands in the words' beat,
// else the beat's first, and its still that frame as the player paints it.
// A version that is not the film's own takes no note: its frames are not
// the film's.

import { For, Show } from '@solidjs/web';
import { Effect, Option, Schema } from 'effect';
import * as ActorAtom from 'effect-machine/atom';
import { useAtomSet, useAtomValue } from '@bible/atom-solid';
import { createEffect, createSignal, createUniqueId, untrack } from 'solid-js';
import { NoteKind, type NoteWords } from '../../core/schema.ts';
import { Actor } from '../actor.tsx';
import { NotesApi } from '../api.ts';
import { NO_SCOPE, type Unsaid, draftOf, unsaid } from '../notes/draft.ts';
import { useNotesFeed } from '../notes/thread.tsx';
import { pressed } from '../pressed.ts';
import { playerStill } from '../stage.ts';
import { useStudio } from './context.tsx';
import {
  type NoteSave,
  type NoteSaveActor,
  NoteSaveEvent,
  noteSaveLine,
  spawnNoteSave,
} from './note-save.ts';

/** What a note on words can ask of them, as the choice names each. */
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

/** What the note's field asks for, by what the note asks of the words. */
const ASKED_FOR: Readonly<Record<NoteKind, string>> = {
  note: 'What should change in these words?',
  correction: 'Why say it so? (optional)',
  removal: 'Why cut them? (optional)',
};

/** The beat the words are in, on the film's clock. */
interface BeatSpan {
  readonly start: number;
  readonly end: number;
}

/**
 * The composer over one selection's words: what it asks of them, the words
 * to say instead for a correction, the note's words, Save, and the line
 * saying why a Save made no note or how the save went.
 */
const Composer = (props: { readonly actor: NoteSaveActor; readonly words: NoteWords }) => {
  const atom = ActorAtom.make(props.actor);
  const saving = useAtomValue(() => atom);
  const send = useAtomSet(() => atom);
  const busy = () => saving()._tag === 'Saving';
  const [kind, setKind] = createSignal<NoteKind>('note', { ownedWrite: true });
  const [text, setText] = createSignal('', { ownedWrite: true });
  const [instead, setInstead] = createSignal(
    untrack(() => props.words.text),
    {
      ownedWrite: true,
    },
  );
  // Why the last Save made no note, and of which field: until it is written in.
  const [hint, setHint] = createSignal(Option.none<Unsaid>(), { ownedWrite: true });
  const status = createUniqueId();
  const wanting = (field: Unsaid['field']) => Option.exists(hint(), (h) => h.field === field);
  const describedBy = (field: Unsaid['field']) =>
    Option.getOrUndefined(Option.as(Option.liftPredicate(field, wanting), status));
  // A save that landed clears the note's words: nothing changes while it is on its way.
  createEffect(
    () => saving()._tag === 'Saved',
    (saved) => {
      if (saved) setText('');
    },
  );
  const save = () => {
    const asked = { kind: untrack(kind), replace: untrack(instead) };
    Option.match(unsaid(untrack(text), Option.some(props.words), asked), {
      onSome: (why) => setHint(Option.some(why)),
      onNone: () => {
        setHint(Option.none());
        send(
          NoteSaveEvent.Save({
            ask: asked.kind,
            text: untrack(text),
            replace: asked.replace,
            sketch: [],
          }),
        );
      },
    });
  };
  return (
    <div class="st-words-note" data-role="words-note">
      <div class="sh-seg" role="group" aria-label="What the note asks of the words">
        <For each={ASKS}>
          {(a) => (
            <button
              type="button"
              data-ask={a.kind}
              aria-pressed={pressed(kind() === a.kind)}
              onClick={() => {
                setKind(a.kind);
                setHint(Option.none());
              }}
            >
              {a.label}
            </button>
          )}
        </For>
      </div>
      <Show when={kind() === 'correction'}>
        <label class="st-words-instead">
          <span>Say instead</span>
          <input
            class="sh-field"
            type="text"
            data-role="say-instead"
            autocomplete="off"
            spellcheck={false}
            disabled={busy()}
            aria-invalid={pressed(wanting('instead'))}
            aria-describedby={describedBy('instead')}
            value={instead()}
            onInput={(e) => {
              setInstead(e.currentTarget.value);
              setHint(Option.none());
            }}
          />
        </label>
      </Show>
      <textarea
        class="sh-field st-words-text"
        rows="2"
        aria-label="Note"
        placeholder={ASKED_FOR[kind()]}
        disabled={busy()}
        aria-invalid={pressed(wanting('note'))}
        aria-describedby={describedBy('note')}
        value={text()}
        onInput={(e) => {
          setText(e.currentTarget.value);
          setHint(Option.none());
        }}
      />
      <div class="st-words-acts">
        <button
          type="button"
          class="sh-btn"
          data-primary
          data-act="save-words-note"
          disabled={busy()}
          onClick={save}
        >
          {SAVE[kind()]}
        </button>
        <span class="st-words-said" id={status} data-role="words-note-said" aria-live="polite">
          {Option.getOrElse(
            Option.orElse(
              Option.map(hint(), (h) => h.says),
              () => noteSaveLine(saving()),
            ),
            () => '',
          )}
        </span>
      </div>
    </div>
  );
};

/**
 * A note on `words`, of the beat spanning `span`: on the film's own
 * version, the composer; on another, a line saying why there is none.
 */
export const WordsNote = (props: { readonly words: NoteWords; readonly span: BeatSpan }) => {
  const { state, meta } = useStudio();
  const feed = useNotesFeed();
  const staged = () =>
    Option.zipWith(meta.drawn(), meta.player(), (film, shown) => ({ film, player: shown.player }));
  const save = (s: NoteSave) =>
    Effect.gen(function* () {
      const { film, player } = yield* Effect.fromOption(untrack(staged)).pipe(
        Effect.mapError(() => "the film's own version is not staged"),
      );
      const kind = yield* Schema.decodeUnknownEffect(NoteKind)(s.ask).pipe(
        Effect.mapError(() => `words take a note, a correction or a removal, not a ${s.ask}`),
      );
      const now = untrack(state.T);
      const T = Option.getOrElse(
        Option.liftPredicate(now, (t) => t >= props.span.start && t < props.span.end),
        () => props.span.start,
      );
      const draft = yield* Effect.fromOption(
        draftOf(
          film.placed,
          film.fps,
          { T, box: Option.none(), ink: [], text: s.text },
          { ...NO_SCOPE, words: Option.some(props.words) },
          { kind, replace: s.replace },
        ),
      ).pipe(Effect.mapError(() => 'the note says too little, or its frame is past the film'));
      const still = yield* playerStill(player, T).pipe(Effect.mapError((e) => e.message));
      const note = yield* NotesApi.use((api) => api.add({ ...draft, still })).pipe(
        Effect.mapError((failure) => failure.message),
      );
      feed.refresh();
      return note.id;
    });
  return (
    <Show
      when={Option.isSome(staged())}
      fallback={
        <p class="st-words-said" data-role="words-note-said">
          Notes on words are written on the film's own version.
        </p>
      }
    >
      <Actor runtime={meta.runtime} spawn={spawnNoteSave(save)}>
        {(actor) => <Composer actor={actor} words={props.words} />}
      </Actor>
    </Show>
  );
};
