// The notes' provider: two machines on the shell's runtime (the feed, the
// page's live connection to the notes on the server, and the composer), the
// pen, and the note selected. The section, the marks on the frame, the pins
// on the timeline and the pen button read this context and act through it;
// none holds state of its own. A save that made a note selects it and reads
// the notes at once; a reply or a resolve does too.

import { useAtomSet, useAtomSuspense, useAtomValue } from '@bible/atom-solid';
import { Loading, Show } from '@solidjs/web';
import { Effect, Match, Option } from 'effect';
import { Machine } from 'effect-machine';
import * as ActorAtom from 'effect-machine/atom';
import * as AsyncResult from 'effect/reactivity/AsyncResult';
import type * as Atom from 'effect/reactivity/Atom';
import type { Accessor, ParentProps } from 'solid-js';
import {
  createContext,
  createEffect,
  createMemo,
  createSignal,
  onCleanup,
  untrack,
  useContext,
} from 'solid-js';
import { quiet } from '../../command/command.ts';
import type { Hub } from '../../command/hub.ts';
import { type Context, selected as selectedOf } from '../../command/context.ts';
import { noteT } from '../../core/notes.ts';
import type { Note, Point } from '../../core/schema.ts';
import { NotesApi, reasonOf } from '../api.ts';
import { useLab } from '../shell.tsx';
import {
  type ComposerActor,
  ComposerEvent,
  type ComposerState,
  type Marked,
  composerOpen,
  composerText,
  composerTyping,
  draftMarks,
  spawnComposer,
  unsaved,
} from './composer.ts';
import { draftOf, whereText } from './draft.ts';
import { type FeedActor, FeedEvent, feedText, spawnFeed } from './feed.ts';

/** A reply to a note, or its resolve: what the thread writes. */
type ThreadWrite =
  | { readonly _tag: 'Reply'; readonly id: string; readonly text: string }
  | { readonly _tag: 'Resolve'; readonly id: string };

interface NotesState {
  /** Whether the composer shows: from a press on the frame until the note is saved or cancelled. */
  readonly composerOpen: Accessor<boolean>;
  /** Whether the composer waits for the note's words, and so takes the keys. */
  readonly composerTyping: Accessor<boolean>;
  /** The marks of the note being made, while one is. */
  readonly draft: Accessor<Option.Option<Marked>>;
  /** The film's notes, as the feed last read them. */
  readonly notes: Accessor<ReadonlyArray<Note>>;
  readonly selected: Accessor<Option.Option<Note>>;
  /**
   * The film time `note` shows at now (`noteT`): its time in its scene, so a
   * re-take of an earlier beat does not move it; the seek, its marks, its pin
   * and its label all read it.
   */
  readonly timeOf: (note: Note) => number;
  /** Whether a drag on the frame draws ink rather than a box. */
  readonly pen: Accessor<boolean>;
  /** Where the note being made sits: scene, time, frame, nearest cue edge and mark. */
  readonly where: Accessor<string>;
  /** What the composer's status line says. */
  readonly status: Accessor<string>;
  /** What the notes say of the feed: nothing while it holds. */
  readonly feedStatus: Accessor<string>;
  /** What the last reply or resolve said, if it failed. */
  readonly threadStatus: Accessor<string>;
}

interface NotesActions {
  readonly togglePen: () => void;
  /** The pointer went down on the frame at `at`, film pixels. */
  readonly press: (at: Point) => void;
  readonly drag: (at: Point, far: boolean) => void;
  readonly lift: (at: Point, far: boolean) => void;
  /** Note the frame shown, whole. */
  readonly noteFrame: () => void;
  readonly cancel: () => void;
  /** Save the note being made, saying `text`. */
  readonly save: (text: string) => void;
  /** Select a note and show its frame. */
  readonly select: (note: Note) => void;
  readonly write: (write: ThreadWrite) => void;
}

interface NotesContextValue {
  readonly state: NotesState;
  readonly actions: NotesActions;
}

const NotesContext = createContext<NotesContextValue>();

/** The notes' context: only inside `<Notes.Provider>`. */
export const useNotes = (): NotesContextValue => useContext(NotesContext);

interface Actors {
  readonly feed: FeedActor;
  readonly composer: ComposerActor;
}

/** The T of the note being made, while one is. */
const composingT = (state: ComposerState): Option.Option<number> =>
  Match.value(state).pipe(
    Match.tag('Closed', () => Option.none<number>()),
    Match.orElse((s) => Option.some(s.T)),
  );

/**
 * The notes' verbs on the page's hub, for as long as the notes are mounted:
 * `n` notes the frame unless a field has the keys; Escape cancels the note
 * being made, wherever it is pressed.
 */
const useCommands = (
  hub: Hub,
  actions: NotesActions,
  composing: () => boolean,
  noteOf: (ctx: Context) => Option.Option<Note>,
) =>
  onCleanup(
    hub.commands.register(
      {
        id: 'notes.open',
        label: 'Open the note',
        group: 'Notes',
        about: ['Note'],
        touch: 'tap it in the list, or long-press it, then Open the note',
        when: (ctx) => Option.isSome(noteOf(ctx)),
        run: (ctx) =>
          Effect.sync(() => {
            Option.map(noteOf(ctx), actions.select);
            return quiet;
          }),
      },
      {
        id: 'notes.frame',
        label: 'Note this frame',
        group: 'Notes',
        keys: ['n'],
        touch: 'the Note frame button in the header',
        when: () => true,
        run: () =>
          Effect.sync(() => {
            actions.noteFrame();
            return quiet;
          }),
      },
      {
        id: 'notes.cancel',
        label: 'Cancel the note',
        group: 'Notes',
        keys: ['escape'],
        keysIn: ['page', 'field'],
        touch: "the composer's Cancel button",
        when: composing,
        run: () =>
          Effect.sync(() => {
            actions.cancel();
            return quiet;
          }),
      },
    ),
  );

const Body = (props: ParentProps<{ readonly actors: Actors }>) => {
  const { state: lab, actions: labActions, meta } = useLab();
  const { film, player, runtime } = meta;
  const feedAtom = ActorAtom.make(props.actors.feed);
  const composerAtom = ActorAtom.make(props.actors.composer);
  const feed = useAtomValue(() => feedAtom);
  const sendFeed = useAtomSet(() => feedAtom);
  const composer = useAtomValue(() => composerAtom);
  const sendComposer = useAtomSet(() => composerAtom);

  const [pen, setPen] = createSignal(false);
  // The note selected is the URL's (`?note=`, `LabState.note`), so a link,
  // a reload and Back all carry it.
  const selectedId = lab.note;
  const notes = createMemo(() => feed().notes);
  const selected = createMemo(() =>
    Option.flatMap(selectedId(), (id) => Option.fromUndefinedOr(notes().find((n) => n.id === id))),
  );

  // A note being made holds every reload (an Undo's, a rebuild's) until it is saved or cancelled.
  createEffect(composer, (s) => {
    Effect.runFork(meta.reloads.hold('notes', unsaved(s)));
  });
  onCleanup(() => {
    Effect.runFork(meta.reloads.hold('notes', Option.none()));
  });

  // A save that made a note selects it, and the notes are read at once.
  createEffect(composer, (s) => {
    if (s._tag !== 'Closed') return;
    Option.map(s.saved, (id) => {
      labActions.selectNote(Option.some(id));
      sendFeed(FeedEvent.Refresh);
    });
  });

  // A note the feed, read whole, no longer has (another tab deleted it, a
  // link names one long gone) leaves the URL. Only a read decides (the note
  // is read untracked): the note a save just selected waits for the read the
  // save asked for.
  createEffect(feed, (s) => {
    if (s._tag !== 'Live') return;
    const gone = Option.exists(
      untrack(() => lab.note()),
      (id) => !s.notes.some((n) => n.id === id),
    );
    if (gone) labActions.forgetNote();
  });

  const thread = runtime.fn((w: ThreadWrite) =>
    NotesApi.use((api) =>
      Match.value(w).pipe(
        Match.tagsExhaustive({
          Reply: (r) => api.reply(r.id, r.text),
          Resolve: (r) => api.resolve(r.id),
        }),
      ),
    ).pipe(Effect.tap(() => props.actors.feed.send(FeedEvent.Refresh))),
  );
  const threadResult = useAtomValue(() => thread);
  const writeThread = useAtomSet(() => thread);
  const threadStatus = createMemo(() =>
    AsyncResult.match(threadResult(), {
      onInitial: () => '',
      onSuccess: () => '',
      onFailure: (f) => reasonOf(f.cause),
    }),
  );

  const timeOf = (note: Note) => noteT(film.placed, film.fps, note);

  const where = createMemo(() =>
    Option.match(composingT(composer()), {
      onNone: () => '',
      onSome: (T) => whereText(film.placed, film.fps, T),
    }),
  );

  const actions: NotesActions = {
    togglePen: () => setPen((on) => !on),
    press: (at) => sendComposer(ComposerEvent.Press({ T: player.now(), at, pen: pen() })),
    drag: (at, far) => sendComposer(ComposerEvent.Drag({ at, far })),
    lift: (at, far) => sendComposer(ComposerEvent.Lift({ at, far })),
    noteFrame: () => sendComposer(ComposerEvent.Note({ T: player.now() })),
    cancel: () => sendComposer(ComposerEvent.Cancel),
    save: (text) => {
      const s = composer();
      if (s._tag !== 'Open') return;
      Option.map(draftOf(film.placed, film.fps, { ...s, text }), (draft) =>
        sendComposer(ComposerEvent.Save({ draft })),
      );
    },
    select: (note) => {
      labActions.selectNote(Option.some(note.id));
      player.seek(timeOf(note));
    },
    write: (w) => writeThread(w),
  };
  // A note a context menu opened on, when it is not the one open already.
  const noteOf = (ctx: Context) =>
    Option.filter(
      Option.flatMap(selectedOf(ctx, 'Note'), (s) =>
        Option.fromUndefinedOr(notes().find((n) => n.id === s.id)),
      ),
      (n) => !Option.contains(selectedId(), n.id),
    );
  useCommands(meta.hub, actions, () => composerOpen(composer()), noteOf);

  const value: NotesContextValue = {
    state: {
      composerOpen: () => composerOpen(composer()),
      composerTyping: () => composerTyping(composer()),
      draft: () => draftMarks(composer()),
      notes,
      selected,
      timeOf,
      pen,
      where,
      status: () => composerText(composer()),
      feedStatus: () => feedText(feed()),
      threadStatus,
    },
    actions,
  };
  return <NotesContext value={value}>{props.children}</NotesContext>;
};

const Ready = (
  props: ParentProps<{
    readonly feed: Atom.Atom<AsyncResult.AsyncResult<FeedActor, never>>;
    readonly composer: Atom.Atom<AsyncResult.AsyncResult<ComposerActor, never>>;
  }>,
) => {
  const feed = useAtomSuspense(() => props.feed);
  const composer = useAtomSuspense(() => props.composer);
  const actors = createMemo(() => ({ feed: feed(), composer: composer() }));
  return (
    <Show when={actors()} keyed>
      {(a: Actors) => <Body actors={a}>{props.children}</Body>}
    </Show>
  );
};

/** The notes' state and actions, for their section, marks, pins and pen. */
export const Provider = (props: ParentProps) => {
  const { meta } = useLab();
  const feed = meta.runtime.atom(Machine.scoped(spawnFeed));
  const composer = meta.runtime.atom(Machine.scoped(spawnComposer));
  return (
    <Loading>
      <Ready feed={feed} composer={composer}>
        {props.children}
      </Ready>
    </Loading>
  );
};
