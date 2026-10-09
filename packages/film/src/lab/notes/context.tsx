// The notes' provider in the staged lab: the composer's machine on the
// shell's runtime, over the page's notes (`list.tsx`: the feed, the page's
// live connection to the notes on the server, the note selected, the pen,
// the thread's writes), which it lends what needs the film (each note's
// time, the seek to it, Note frame). The composer, the marks on the frame
// and the pins on the timeline read this context and act through it; none
// holds state of its own. A save that made a note selects it and reads the
// notes at once; a reply or a resolve does too. ⇧N and ⌥⇧N step to the next
// or previous open note by time (`command/walk.ts`), and each note is a
// place ⌘K goes to by its id and words (`command/go.ts`).

import { useAtomSet, useAtomValue } from '@bible/atom-solid';
import { Effect, Match, Option } from 'effect';
import * as ActorAtom from 'effect-machine/atom';
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
import { type Command, quietly } from '../../command/command.ts';
import { goToCommands } from '../../command/go.ts';
import { type Toward, walkFrom } from '../../command/walk.ts';
import { registerWhile } from '../command/changes.ts';
import type { Hub } from '../../command/hub.ts';
import { type Context, selected as selectedOf } from '../../command/context.ts';
import { noteT } from '../../core/notes.ts';
import type { Note, Point } from '../../core/schema.ts';
import { Actor } from '../actor.tsx';
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
import { NO_SCOPE, type Scope, draftOf, scopeText, whenText, whereText } from './draft.ts';
import { useMotion } from '../motion/context.tsx';
import { useSource } from '../source/context.tsx';
import { feedText } from './feed.ts';
import { type ThreadWrite, useNotesFeed } from './list.tsx';

/** How much of a note's words its Go to entry carries. */
const NOTE_NAMED = 48;

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
  /**
   * The scope chip of the note being made (`scene · cue · 00:00:03:06–00:00:04:00`, in timecode): the
   * cue selected, the in and out points marked and the line of the scene's
   * file the Source view is held on (`scenes/robe.ts:118`), while it has them
   * and its × has not cleared them.
   */
  readonly scope: Accessor<Option.Option<string>>;
  /** What the composer's status line says. */
  readonly status: Accessor<string>;
  /** What the notes say of the feed: nothing while it holds. */
  readonly feedStatus: Accessor<string>;
  /** What the last reply or resolve said, if it failed. */
  readonly threadStatus: Accessor<string>;
}

interface NotesActions {
  /** The pointer went down on the frame at `at`, film pixels. */
  readonly press: (at: Point) => void;
  readonly drag: (at: Point, far: boolean) => void;
  readonly lift: (at: Point, far: boolean) => void;
  /** Note the frame shown, whole. */
  readonly noteFrame: () => void;
  readonly cancel: () => void;
  /** Write the note being made about its frame alone: its scope chip's ×. */
  readonly clearScope: () => void;
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

/** The T of the note being made, while one is. */
const composingT = (state: ComposerState): Option.Option<number> =>
  Match.value(state).pipe(
    Match.tag('Closed', () => Option.none<number>()),
    Match.orElse((s) => Option.some(s.T)),
  );

/** A walk's command: the open note it lands on, opened. */
const walkCommand = (
  actions: NotesActions,
  walk: (toward: Toward) => Option.Option<Note>,
  toward: Toward,
  label: string,
  key: string,
): Command => ({
  id: `notes.${toward}`,
  label,
  group: 'Notes',
  keys: [key],
  touch: 'tap it in the list',
  when: () => Option.isSome(walk(toward)),
  run: quietly(() => Option.map(walk(toward), actions.select)),
});

/**
 * The notes' verbs on the page's hub, for as long as the notes are mounted:
 * `n` notes the frame unless a field has the keys; Escape cancels the note
 * being made, wherever it is pressed; ⇧N and ⌥⇧N open the next or previous
 * open note in time (AA-7: `n` alone stays Note this frame).
 */
const useCommands = (
  hub: Hub,
  actions: NotesActions,
  composing: () => boolean,
  noteOf: (ctx: Context) => Option.Option<Note>,
  walk: (toward: Toward) => Option.Option<Note>,
) =>
  onCleanup(
    hub.commands.register(
      walkCommand(actions, walk, 'next', 'Next open note', 'shift+n'),
      walkCommand(actions, walk, 'previous', 'Previous open note', 'alt+shift+n'),
      {
        id: 'notes.open',
        label: 'Open the note',
        group: 'Notes',
        about: ['Note'],
        touch: 'tap it in the list, or long-press it, then Open the note',
        when: (ctx) => Option.isSome(noteOf(ctx)),
        run: quietly((ctx) => Option.map(noteOf(ctx), actions.select)),
      },
      {
        id: 'notes.cancel',
        label: 'Cancel the note',
        group: 'Notes',
        keys: ['escape'],
        keysIn: ['page', 'field'],
        touch: "the composer's Cancel button",
        when: composing,
        run: quietly(() => actions.cancel()),
      },
    ),
  );

const Body = (props: ParentProps<{ readonly composer: ComposerActor }>) => {
  const { state: lab, actions: labActions, meta } = useLab();
  const { film, player } = meta;
  const feed = useNotesFeed();
  const composerAtom = ActorAtom.make(props.composer);
  const composer = useAtomValue(() => composerAtom);
  const sendComposer = useAtomSet(() => composerAtom);

  // The note selected is the URL's (`?note=`, `LabState.note`), so a link,
  // a reload and Back all carry it.
  const selectedId = lab.note;
  const { notes, selected } = feed;

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
      feed.refresh();
    });
  });

  // A note the feed, read whole, no longer has (another tab deleted it, a
  // link names one long gone) leaves the URL. Only a read decides (the note
  // is read untracked): the note a save just selected waits for the read the
  // save asked for.
  createEffect(feed.state, (s) => {
    if (s._tag !== 'Live') return;
    const gone = Option.exists(
      untrack(() => lab.note()),
      (id) => !s.notes.some((n) => n.id === id),
    );
    if (gone) labActions.forgetNote();
  });

  const timeOf = (note: Note) => noteT(film.placed, film.fps, note);

  const where = createMemo(() =>
    Option.match(composingT(composer()), {
      onNone: () => '',
      onSome: (T) => whereText(film.placed, film.fps, T),
    }),
  );

  // What the note being made is about beside its frame: the cue selected and
  // the in and out points, until its chip's × clears them; each note starts scoped.
  const motion = useMotion();
  const source = useSource();
  const [scoped, setScoped] = createSignal(true);
  createEffect(
    () => composerOpen(composer()),
    (shown) => {
      if (!shown) setScoped(true);
    },
  );
  const scope = (): Scope =>
    Option.match(
      Option.liftPredicate(scoped(), (on) => on),
      {
        onNone: () => NO_SCOPE,
        onSome: (): Scope => ({
          cue: motion.state.cue(),
          range: motion.state.inOut(),
          source: source.heldSite(),
        }),
      },
    );
  const scopeChip = createMemo(() =>
    Option.flatMap(composingT(composer()), (T) => scopeText(film.placed, scope(), film.fps, T)),
  );

  const actions: NotesActions = {
    press: (at) => sendComposer(ComposerEvent.Press({ T: player.now(), at, pen: feed.pen() })),
    drag: (at, far) => sendComposer(ComposerEvent.Drag({ at, far })),
    lift: (at, far) => sendComposer(ComposerEvent.Lift({ at, far })),
    noteFrame: () => sendComposer(ComposerEvent.Note({ T: player.now() })),
    cancel: () => sendComposer(ComposerEvent.Cancel),
    clearScope: () => setScoped(false),
    save: (text) => {
      const s = composer();
      if (s._tag !== 'Open') return;
      Option.map(draftOf(film.placed, film.fps, { ...s, text }, scope()), (draft) =>
        sendComposer(ComposerEvent.Save({ draft })),
      );
    },
    select: (note) => {
      labActions.selectNote(Option.some(note.id));
      player.seek(timeOf(note));
    },
    write: feed.write,
  };
  // The page's notes show each note's time, open one, and note the frame shown, while this lives.
  onCleanup(
    feed.lend({
      whenOf: (note) => whenText(film.placed, film.fps, note),
      select: actions.select,
      noteFrame: actions.noteFrame,
      composerOpen: () => composerOpen(composer()),
      dismiss: labActions.dismissNote,
    }),
  );
  // A note a context menu opened on, when it is not the one open already.
  const noteOf = (ctx: Context) =>
    Option.filter(
      Option.flatMap(selectedOf(ctx, 'Note'), (s) =>
        Option.fromUndefinedOr(notes().find((n) => n.id === s.id)),
      ),
      (n) => !Option.contains(selectedId(), n.id),
    );
  useCommands(
    meta.hub,
    actions,
    () => composerOpen(composer()),
    noteOf,
    (toward) =>
      walkFrom(
        notes().filter((n) => n.status !== 'resolved'),
        timeOf,
        player.now(),
        toward,
      ),
  );
  // Every note is a place ⌘K goes to by its id and its words.
  registerWhile(meta.hub, () =>
    goToCommands(
      notes().map((note) => ({
        kind: 'note',
        id: note.id,
        name: `${note.id} ${note.text.slice(0, NOTE_NAMED)}`,
        go: () => actions.select(note),
      })),
    ),
  );

  const value: NotesContextValue = {
    state: {
      composerOpen: () => composerOpen(composer()),
      composerTyping: () => composerTyping(composer()),
      draft: () => draftMarks(composer()),
      notes,
      selected,
      timeOf,
      pen: feed.pen,
      where,
      scope: scopeChip,
      status: () => composerText(composer()),
      feedStatus: () => feedText(feed.state()),
      threadStatus: feed.threadStatus,
    },
    actions,
  };
  return <NotesContext value={value}>{props.children}</NotesContext>;
};

/** The notes' state and actions in the staged lab, for the composer, the marks and the pins. */
export const Provider = (props: ParentProps) => {
  const { meta } = useLab();
  return (
    <Actor runtime={meta.runtime} spawn={spawnComposer}>
      {(composer) => <Body composer={composer}>{props.children}</Body>}
    </Actor>
  );
};
