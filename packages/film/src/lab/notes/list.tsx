// The film's notes as the Lab's page holds them, on the server and in the
// browser alike (PA-12): the feed (`feed.ts`), the list with each note's
// thread, a reply and a resolve, and the pen and the Note frame button in the
// panel's header. None of it reads the film's code. The notes are the
// page's first read, made by the server that renders it and sent with it
// (`served`); the browser adopts them, reads them no second time, and its
// feed goes on from them, waiting past their cursor (a hybrid read: the
// server's first answer, then the browser's). What needs the staged film
// (when a note shows on its time line, the seek to it, a new note on the
// frame shown) the staged notes lend the page once the film is staged
// (`NotesStaged`, `context.tsx`); until then the list shows each note
// without its time, and opening one or noting the frame waits for the film.
// The pen and Note this frame are the page's commands from the first paint.

import { useAtomSet, useAtomValue } from '@bible/atom-solid';
import { For, Loading, Show } from '@solidjs/web';
import { Effect, Exit, Match, Option } from 'effect';
import { Machine } from 'effect-machine';
import * as ActorAtom from 'effect-machine/atom';
import * as AsyncResult from 'effect/reactivity/AsyncResult';
import * as Atom from 'effect/reactivity/Atom';
import type { Accessor, ParentProps } from 'solid-js';
import { createContext, createMemo, createSignal, onCleanup, useContext } from 'solid-js';
import { stillUrl } from '../../core/api.ts';
import { type Note, NotesFile } from '../../core/schema.ts';
import { BY_BUTTON, quietly } from '../../command/command.ts';
import { Selection } from '../../command/selection.ts';
import type { Hub } from '../../command/hub.ts';
import { Target, type TargetElementProps } from '../command/context-menu.tsx';
import { hubKeys } from '../command/changes.ts';
import type { BrowserServices } from '../../browser/host.ts';
import { type LabApi, NotesApi, reasonOf, served } from '../api.ts';
import { FeedEvent, FeedState, feedText, spawnFeed, startOf } from './feed.ts';

/** What the page's reads run with: the lab's routes for its film, and its host. */
export type PageRuntime = Atom.AtomRuntime<LabApi | NotesApi | BrowserServices>;

/** A reply to a note, or its resolve: what the thread writes. */
export type ThreadWrite =
  | { readonly _tag: 'Reply'; readonly id: string; readonly text: string }
  | { readonly _tag: 'Resolve'; readonly id: string };

/** What the staged film lends the notes: what needs its code, while it is staged. */
interface NotesStaged {
  /** When `note` shows now, as its label says it beside its scene (`whenText`). */
  readonly whenOf: (note: Note) => string;
  /** Open `note`: select it in the URL and show its frame. */
  readonly select: (note: Note) => void;
  /** Note the frame shown, whole. */
  readonly noteFrame: () => void;
  /** Whether the composer shows. */
  readonly composerOpen: Accessor<boolean>;
}

interface NotesFeedValue {
  /** The film's notes, as the feed last read them (the server's, until the browser's feed runs). */
  readonly notes: Accessor<ReadonlyArray<Note>>;
  /** The feed's state. */
  readonly state: Accessor<FeedState>;
  /** The note the URL selects (`?note=`), while the feed has it. */
  readonly selected: Accessor<Option.Option<Note>>;
  /** Read the notes at once: this page changed them. */
  readonly refresh: () => void;
  /** Reply to a note, or resolve it; the notes are read again once it lands. */
  readonly write: (write: ThreadWrite) => void;
  /** What the last reply or resolve said, if it failed. */
  readonly threadStatus: Accessor<string>;
  /** Whether a drag on the frame draws ink rather than a box (`notes.pen` turns it on and off). */
  readonly pen: Accessor<boolean>;
  /** What the staged film lends, while it is staged. */
  readonly staged: Accessor<Option.Option<NotesStaged>>;
  /** Lend the notes what needs the film's code, until the returned function is called. */
  readonly lend: (staged: NotesStaged) => () => void;
}

const NotesFeedContext = createContext<NotesFeedValue>();

/** The page's notes: only inside `<Feed>`. */
export const useNotesFeed = (): NotesFeedValue => useContext(NotesFeedContext);

/**
 * The page's notes of `film`, around `children`: read once by whoever
 * renders the page, then followed by the browser's feed. `note` is the note
 * the URL selects.
 */
export const NotesFeed = (
  props: ParentProps<{
    readonly film: string;
    readonly runtime: PageRuntime;
    readonly hub: Hub;
    readonly note: Accessor<Option.Option<string>>;
  }>,
) => {
  const { runtime } = props;
  // The notes, as the page's first read: the server's, sent with the page.
  const sent = runtime
    .atom(NotesApi.use((api) => api.notes))
    .pipe(served(`lab.notes:${props.film}`, NotesFile));
  // The browser's feed, started from that read: never run on the server
  // (`feedAtom`'s server value stands in for it there and while the page hydrates).
  const actor = runtime.atom((get) =>
    get.result(sent).pipe(
      Effect.exit,
      Effect.flatMap((read) => Machine.scoped(spawnFeed(startOf(read)))),
    ),
  );
  const live = Atom.map(actor, (made) => Option.map(AsyncResult.value(made), ActorAtom.make));
  const feedAtom = Atom.writable(
    (get) => Option.map(get(live), (a) => get(a)),
    (ctx, event: FeedEvent) => {
      Option.map(ctx.get(live), (a) => ctx.set(a, event));
    },
  ).pipe(Atom.withServerValue(() => Option.none<FeedState>()));
  const read = useAtomValue(() => sent);
  const running = useAtomValue(() => feedAtom);
  const send = useAtomSet(() => feedAtom);
  const state = createMemo((): FeedState =>
    Option.getOrElse(running(), () =>
      AsyncResult.match(read(), {
        onInitial: () => FeedState.Connecting({ notes: [], cursor: 0 }),
        onSuccess: (s) => startOf(Exit.succeed(s.value)),
        onFailure: (f) => startOf(Exit.failCause(f.cause)),
      }),
    ),
  );
  const notes = createMemo(() => state().notes);
  const selected = createMemo(() =>
    Option.flatMap(props.note(), (id) => Option.fromUndefinedOr(notes().find((n) => n.id === id))),
  );
  const refresh = () => send(FeedEvent.Refresh);
  const thread = runtime.fn((w: ThreadWrite) =>
    NotesApi.use((api) =>
      Match.value(w).pipe(
        Match.tagsExhaustive({
          Reply: (r) => api.reply(r.id, r.text),
          Resolve: (r) => api.resolve(r.id),
        }),
      ),
    ).pipe(Effect.tap(() => Effect.sync(refresh))),
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
  const [pen, setPen] = createSignal(false, { ownedWrite: true });
  const [staged, setStaged] = createSignal(Option.none<NotesStaged>(), { ownedWrite: true });
  const value: NotesFeedValue = {
    notes,
    state,
    selected,
    refresh,
    write: (w) => writeThread(w),
    threadStatus,
    pen,
    staged,
    lend: (verbs) => {
      setStaged(Option.some(verbs));
      return () => setStaged(Option.none());
    },
  };
  // The header's pen and Note frame are commands, registered with the page
  // (a server render names their keys as the browser does): their buttons,
  // keys and ⌘K reach them alike. Note this frame waits for the staged film.
  onCleanup(
    props.hub.commands.register(
      {
        id: PEN,
        label: 'Pen on or off',
        group: 'Notes',
        touch: 'the Pen button in the header',
        when: () => true,
        run: quietly(() => setPen((on) => !on)),
      },
      {
        id: NOTE_FRAME,
        label: 'Note this frame',
        group: 'Notes',
        keys: ['n'],
        touch:
          'the Note frame button in the header; click the frame to pin a point, drag to draw a box',
        when: () => Option.isSome(staged()),
        run: quietly(() => Option.map(staged(), (s) => s.noteFrame())),
      },
    ),
  );
  return <NotesFeedContext value={value}>{props.children}</NotesFeedContext>;
};

/** The pen's command. */
const PEN = 'notes.pen';

/** Note this frame's command (`n`). */
const NOTE_FRAME = 'notes.frame';

/** The pen: a drag on the frame draws ink while it is on. */
export const Pen = (props: { readonly hub: Hub }) => {
  const feed = useNotesFeed();
  const keys = hubKeys(props.hub);
  return (
    <button
      type="button"
      data-act="pen"
      class="sh-btn"
      aria-pressed={`${feed.pen()}`}
      title={keys.titled('draw freehand ink on the frame', PEN)}
      onClick={() => props.hub.invokeId(PEN, BY_BUTTON)}
    >
      Pen
    </button>
  );
};

/** Note the whole frame shown: the touch path for Note this frame, once the film is staged. */
export const Frame = (props: { readonly hub: Hub }) => {
  const feed = useNotesFeed();
  const keys = hubKeys(props.hub);
  return (
    <button
      type="button"
      class="sh-btn"
      data-act="note-frame"
      title={keys.titled('note the whole frame shown', NOTE_FRAME)}
      disabled={Option.isNone(feed.staged())}
      onClick={() => props.hub.invokeId(NOTE_FRAME, BY_BUTTON)}
    >
      Note frame
    </button>
  );
};

/**
 * A note in the list: its id and scene, the time into its scene it shows at
 * now once the film is staged (`whenText`), and its nearest cue edge.
 */
const label = (note: Note, at: Option.Option<string>) => {
  const cue = Option.match(Option.fromUndefinedOr(note.cue), {
    onNone: () => '',
    onSome: (c) => ` · ${c.name}:${c.edge}`,
  });
  const time = Option.match(at, { onNone: () => '', onSome: (t) => ` · ${t}` });
  return `${note.id} · ${note.scene}${time}${cue}`;
};

const Still = (props: { readonly film: string; readonly name: string }) => (
  <img class="lab-still" src={stillUrl(props.film, props.name)} alt={props.name} loading="lazy" />
);

/** A reply and a resolve, on the selected note while it is open. */
const ReplyForm = (props: { readonly note: Note }) => {
  const feed = useNotesFeed();
  let input = Option.none<HTMLInputElement>();
  return (
    <form
      class="lab-reply-form"
      onSubmit={(e) => {
        e.preventDefault();
        Option.map(input, (el) => {
          const text = el.value.trim();
          if (text === '') return;
          feed.write({ _tag: 'Reply', id: props.note.id, text });
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
        class="sh-btn lab-resolve"
        onClick={() => feed.write({ _tag: 'Resolve', id: props.note.id })}
      >
        Resolve
      </button>
    </form>
  );
};

/** One note in the list: its place, words, still and thread. */
const Item = (props: { readonly film: string; readonly note: Note }) => {
  const feed = useNotesFeed();
  const selected = () => Option.exists(feed.selected(), (s) => s.id === props.note.id);
  const at = () => Option.map(feed.staged(), (s) => s.whenOf(props.note));
  return (
    <Target
      of={Selection.cases.Note.make({ id: props.note.id })}
      render={(p: TargetElementProps) => <li {...p} />}
      class={['lab-note-item', props.note.status, { selected: selected() }]}
      data-id={props.note.id}
      onClick={(e) => {
        if (e.target instanceof HTMLInputElement || e.target instanceof HTMLButtonElement) return;
        Option.map(feed.staged(), (s) => s.select(props.note));
      }}
    >
      <div class="lab-note-head">
        <span class="lab-note-label">{label(props.note, at())}</span>
        <span class={['lab-badge', props.note.status]}>{props.note.status}</span>
      </div>
      <p class="lab-note-text">{props.note.text}</p>
      <Still film={props.film} name={props.note.still} />
      <ol class="lab-thread">
        <For each={props.note.thread}>
          {(reply) => (
            <li class={['lab-reply', reply.by]}>
              <span class="lab-by">{reply.by}</span>
              <p class="lab-reply-text">{reply.text}</p>
              <Show when={reply.still}>
                {(still) => <Still film={props.film} name={still()} />}
              </Show>
            </li>
          )}
        </For>
      </ol>
      <Show when={selected() && props.note.status !== 'resolved'}>
        <ReplyForm note={props.note} />
        <span class="lab-status">{feed.threadStatus()}</span>
      </Show>
    </Target>
  );
};

/**
 * The feed's status, and the notes, newest first (how to make one while
 * there is none): what the server sends, and the browser follows.
 */
export const List = (props: { readonly film: string; readonly hub: Hub }) => {
  const feed = useNotesFeed();
  // Note this frame's key as bound now: a rebound key reads as rebound.
  const keys = hubKeys(props.hub);
  const composing = () => Option.exists(feed.staged(), (s) => s.composerOpen());
  return (
    <Loading>
      <span class="lab-feed">{feedText(feed.state())}</span>
      <ol class="lab-notes">
        <For each={[...feed.notes()].reverse()} keyed={(n) => n.id}>
          {(note) => <Item film={props.film} note={note()} />}
        </For>
      </ol>
      <Show when={feed.notes().length === 0 && !composing()}>
        <p class="lab-feed" data-role="notes-empty">
          No notes yet: click the frame to pin a point, drag to draw a box, or press{' '}
          <kbd>{keys.first(NOTE_FRAME)}</kbd> to note the whole frame.
        </p>
      </Show>
    </Loading>
  );
};
