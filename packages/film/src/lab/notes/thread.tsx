// A film's notes as a page holds them, on the server and in the browser
// alike: the feed (`feed.ts`), and what a note shows wherever it is listed
// (the Lab's list, the studio's Notes and asks): its words, what a note on
// words asks of them, its thread, and a reply and a resolve, which say where
// they stand on their own status line. The notes are the page's first read,
// made by the server that renders it and sent with it (`served`); the
// browser adopts them, reads them no second time, and its feed goes on from
// them, waiting past their cursor (a hybrid read: the server's first answer,
// then the browser's). What needs the staged film (when a note shows on its
// time line, the seek to it, a new note on the frame shown) the staged notes
// lend the page once the film is staged (`NotesStaged`, `context.tsx`).

import { useAtomSet, useAtomValue } from '@bible/atom-solid';
import { For, Show } from '@solidjs/web';
import { Boolean as Bool, Effect, Exit, Match, Option } from 'effect';
import { Machine } from 'effect-machine';
import * as ActorAtom from 'effect-machine/atom';
import * as AsyncResult from 'effect/reactivity/AsyncResult';
import * as Atom from 'effect/reactivity/Atom';
import type { Accessor, ParentProps } from 'solid-js';
import { createContext, createMemo, createSignal, useContext } from 'solid-js';
import { stillUrl } from '../../core/api.ts';
import {
  type Note,
  type NoteKind,
  type NoteStatus,
  type NoteWords,
  NotesFile,
} from '../../core/schema.ts';
import type { BrowserServices } from '../../browser/host.ts';
import { type LabApi, NotesApi, reasonOf, served } from '../api.ts';
import { kindOf } from '../../core/notes.ts';
import { saysOnlyAsked } from './draft.ts';
import { FeedEvent, FeedState, spawnFeed, startOf } from './feed.ts';

/** The state a note's status badge is drawn in (DL §5 Chip / badge): a resolved note's has no state colour, so it is plain. */
export const NOTE_STATE = {
  open: 'note',
  replied: 'agent',
  resolved: 'resolved',
} as const satisfies Record<NoteStatus, string>;

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
  /** Close the selected note's sheet (a phone's: its Close, Escape, a swipe): the note goes. */
  readonly dismiss: () => void;
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
  /** Turn the pen on, or off. */
  readonly togglePen: () => void;
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
    togglePen: () => setPen((on) => !on),
    staged,
    lend: (verbs) => {
      setStaged(Option.some(verbs));
      return () => setStaged(Option.none());
    },
  };
  return <NotesFeedContext value={value}>{props.children}</NotesFeedContext>;
};

/**
 * A note in the list: its id and scene, the time into its scene it shows at
 * now once the film is staged (`whenText`), and its nearest cue edge.
 */
export const noteLabel = (note: Note, at: Option.Option<string>) => {
  const cue = Option.match(Option.fromUndefinedOr(note.cue), {
    onNone: () => '',
    onSome: (c) => ` · ${c.name}:${c.edge}`,
  });
  const time = Option.match(at, { onNone: () => '', onSome: (t) => ` · ${t}` });
  return `${note.id} · ${note.scene}${time}${cue}`;
};

/** A note's still, or a reply's. */
export const Still = (props: { readonly film: string; readonly name: string }) => (
  <img class="lab-still" src={stillUrl(props.film, props.name)} alt={props.name} loading="lazy" />
);

/** The words a note asking `kind` is about: struck when it would cut or change them, and a correction's words to say instead. */
const AskedWords = (props: {
  readonly kind: NoteKind;
  readonly words: NoteWords;
  readonly replace: string;
}) => (
  <Show
    when={props.kind !== 'note'}
    fallback={<span class="lab-note-was">{`“${props.words.text}”`}</span>}
  >
    <del class="lab-note-was">{`“${props.words.text}”`}</del>
    <Show when={props.kind === 'correction'}>
      {' → '}
      <ins class="lab-note-instead">{`“${props.replace}”`}</ins>
    </Show>
  </Show>
);

/**
 * What a note on words asks of them, as the list and the Script say it: its
 * kind, then the words (struck when it would cut or change them) and a
 * correction's words to say instead. Nothing for a note of a frame.
 */
export const Asks = (props: { readonly note: Note }) => (
  <Show when={props.note.words}>
    {(words) => (
      <p class="lab-note-asks" data-kind={kindOf(props.note)}>
        <span class="lab-note-kind">{kindOf(props.note)}</span>{' '}
        <AskedWords
          kind={kindOf(props.note)}
          words={words()}
          replace={Option.getOrElse(Option.fromUndefinedOr(props.note.replace), () => '')}
        />
      </p>
    )}
  </Show>
);

/**
 * What a note says, in its writer's words: nothing when it says no more
 * than what it asks of its words, which `Asks` says.
 */
export const Said = (props: { readonly note: Note }) => (
  <Show when={!saysOnlyAsked(props.note)}>
    <p class="lab-note-text">{props.note.text}</p>
  </Show>
);

/** A note's thread: each reply, who wrote it, its words and its still. */
export const Thread = (props: { readonly film: string; readonly note: Note }) => (
  <ol class="lab-thread">
    <For each={props.note.thread}>
      {(reply) => (
        <li class={['lab-reply', reply.by]}>
          <span class="lab-by">{reply.by}</span>
          <p class="lab-reply-text">{reply.text}</p>
          <Show when={reply.still}>{(still) => <Still film={props.film} name={still()} />}</Show>
        </li>
      )}
    </For>
  </ol>
);

/**
 * A reply and a resolve, on a note while it is open, and where the last of
 * them stands: said on the form's own status line, an alert when it failed.
 */
export const ReplyForm = (props: { readonly note: Note }) => {
  const feed = useNotesFeed();
  let input = Option.none<HTMLInputElement>();
  return (
    <>
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
          aria-label="Reply"
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
      <span
        class="lab-status"
        data-role="thread-status"
        role={Bool.match(feed.threadStatus() === '', {
          onTrue: () => 'status',
          onFalse: () => 'alert',
        })}
      >
        {feed.threadStatus()}
      </span>
    </>
  );
};
