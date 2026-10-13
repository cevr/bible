// The Script's notes: the film's notes on the words of its lines and on its
// beats, where the reader shows them, and the composer, where one is
// written. `<Script.Notes>` holds the notes (`Notes.Provider`) about the
// words the Script selects, and the reader's verbs on them: Note… under the
// words selected (and Note, Correct or Remove these words, on their menu and
// ⌘K) shows the frame where the first is said and opens the composer on
// them, asking that of them; the composer stands under the beat it is about
// (`Composer`; on a phone, in a sheet over the page). Each note on words not
// yet resolved, and the note selected, is painted on its words (`noted.ts`:
// a note's underlined, a correction's or a removal's struck), a correction's
// words to say instead after them, and its marker after its last word: its
// id in its status's colour, a link to it. A note of a beat's frame has its
// marker in the beat's head. The note selected (`?note=`) opens under its
// beat: what it asks, its thread, a reply and Resolve. Nothing here writes
// the script: a note asks, and the agent reads it (`film notes`).

import { For, Show } from '@solidjs/web';
import { Array as Arr, Option } from 'effect';
import type { Accessor, ParentProps } from 'solid-js';
import { createContext, createMemo, onCleanup, useContext } from 'solid-js';
import type { WordsSelection } from '../../command/selection.ts';
import { pageHref } from '../../core/api.ts';
import { sceneAt } from '../../core/layout.ts';
import type { Note, NoteKind } from '../../core/schema.ts';
import { type Lent, useNotes } from '../notes/context.tsx';
import { Notes } from '../notes/index.ts';
import { Asks, NOTE_STATE, ReplyForm, Said, Thread, useNotesFeed } from '../notes/list.tsx';
import { pressed } from '../pressed.ts';
import { useLab } from '../shell.tsx';
import { Sheet } from '../sheet.tsx';
import { type Row, rowsIn } from '../transcript/lit.ts';
import { PHONE, useMatches } from '../viewport.ts';
import { noteCommands } from './commands.ts';
import { useScript } from './context.tsx';
import { type Noted, notedOn } from './noted.ts';
import { picking } from './tied.tsx';

/** Where a note's marker stands in its beat: in its head (a note of its frame), or in its line (a note on its words). */
type Stands = 'head' | 'line';

/** The note selected, the beat it opens in, and where: under the head or the line its marker stands in. */
interface Shown {
  readonly beat: string;
  readonly note: Note;
  readonly stands: Stands;
}

interface ScriptNotesValue {
  /** The notes on words the reader shows, across the lines, in the order made. */
  readonly noted: Accessor<ReadonlyArray<Noted>>;
  /** The notes of beat `id` the reader shows in its head: of its frames, or on words of a line it no longer has. */
  readonly ofBeat: (id: string) => ReadonlyArray<Note>;
  /** The beat the note being made sits in, while one is being made. */
  readonly composing: Accessor<Option.Option<string>>;
  /** The note selected, while there is one. */
  readonly shown: Accessor<Option.Option<Shown>>;
  /** The words the note selected is on, as its line has them now. */
  readonly shownRows: Accessor<ReadonlyArray<Row>>;
  /**
   * Begin a note on `words`, asking `kind` of them: they are selected, the
   * frame where the first is said is shown, and the composer opens on it.
   */
  readonly note: (words: WordsSelection, kind: NoteKind) => void;
  /** Open `note`: select it and show its frame. */
  readonly select: (note: Note) => void;
}

const ScriptNotesContext = createContext<ScriptNotesValue>();

/** The Script's notes: only inside `<Script.Notes>`. */
export const useScriptNotes = (): ScriptNotesValue => useContext(ScriptNotesContext);

/** The beat a note is about: its words', else its frame's. */
const beatOfNote = (note: Note): string =>
  Option.getOrElse(
    Option.map(Option.fromUndefinedOr(note.words), (w) => w.beat),
    () => note.scene,
  );

/** Whether the reader shows `note`: until it is resolved, and while it is selected. */
const showing = (note: Note, selected: Option.Option<string>) =>
  note.status !== 'resolved' || Option.contains(selected, note.id);

const Verbs = (props: ParentProps) => {
  const { state: lab, meta } = useLab();
  const script = useScript();
  const { state, actions } = useNotes();
  const placed = meta.film.placed;
  const noted = createMemo(() =>
    script.lines.flatMap((line) => notedOn(state.notes(), line, lab.note())),
  );
  /** Whether beat `id` says a line the reader lays out. */
  const voiced = (id: string) =>
    Arr.some(script.beats, (b) => b.id === id && Option.isSome(b.line));
  /** Where `note`'s marker stands: in its beat's head when it is of the frame, or its beat no longer has a line. */
  const standsOf = (note: Note): Stands =>
    Option.match(
      Option.filter(Option.fromUndefinedOr(note.words), (w) => voiced(w.beat)),
      { onNone: () => 'head', onSome: () => 'line' },
    );
  const ofBeat = (id: string) =>
    state
      .notes()
      .filter((n) => showing(n, lab.note()) && beatOfNote(n) === id && standsOf(n) === 'head');
  const composing = createMemo(() =>
    Option.flatMap(state.at(), (T) => Option.map(sceneAt(placed, T), (p) => p.spec.id)),
  );
  const shown = createMemo(() =>
    Option.map(state.selected(), (note): Shown => ({
      beat: beatOfNote(note),
      note,
      stands: standsOf(note),
    })),
  );
  const shownRows = createMemo(() =>
    Option.getOrElse(
      Option.flatMap(state.selected(), (s) =>
        Option.map(
          Arr.findFirst(noted(), (n) => n.note.id === s.id),
          (n) => n.rows,
        ),
      ),
      (): ReadonlyArray<Row> => [],
    ),
  );
  /** Where beat `id` starts on the film's clock. */
  const startOf = (id: string) =>
    Option.map(
      Arr.findFirst(script.beats, (b) => b.id === id),
      (b) => b.start,
    );
  const note = (words: WordsSelection, kind: NoteKind) => {
    // The frame where the first word is said; a line timed by nothing yet, its beat's first.
    const T = Option.getOrElse(
      Option.orElse(
        Option.flatMap(
          Arr.head(rowsIn(script.lines, words.scene, words.from, words.to)),
          (r) => r.start,
        ),
        () => startOf(words.scene),
      ),
      () => meta.player.now(),
    );
    script.selectRange(words.scene, words.from, words.to);
    actions.ask(kind);
    actions.noteAt(T);
  };
  onCleanup(
    meta.hub.commands.register(
      ...noteCommands({ selection: script.selected, composing: state.composerOpen, note }),
    ),
  );
  const value: ScriptNotesValue = {
    noted,
    ofBeat,
    composing,
    shown,
    shownRows,
    note,
    select: actions.select,
  };
  return <ScriptNotesContext value={value}>{props.children}</ScriptNotesContext>;
};

/**
 * The film's notes on the Script, about what it selects: the cue, and the
 * words of a line (`Lent`); the reader's verbs on them inside.
 */
export const NotesProvider = (props: ParentProps) => {
  const script = useScript();
  const lent: Lent = {
    range: () => Option.none(),
    source: () => Option.none(),
    words: script.words,
  };
  return (
    <Notes.Provider lent={lent}>
      <Verbs>{props.children}</Verbs>
    </Notes.Provider>
  );
};

/** Note… under the words selected, while no note is being made: the composer opens on them. */
export const NoteButton = () => {
  const script = useScript();
  const verbs = useScriptNotes();
  const { state } = useNotes();
  return (
    <Show
      when={Option.getOrUndefined(Option.filter(script.selected(), () => !state.composerOpen()))}
    >
      {(words) => (
        <button
          type="button"
          class="sh-btn"
          data-act="note-words"
          title="Write a note, a correction or a removal of these words"
          onClick={() => verbs.note(words(), 'note')}
        >
          Note…
        </button>
      )}
    </Show>
  );
};

/** What a note asks, said beside its id: its kind on words, else what it is of. */
const askedOf = (note: Note) =>
  Option.match(Option.fromUndefinedOr(note.kind), {
    onNone: () =>
      Option.match(Option.fromUndefinedOr(note.words), {
        onNone: () => 'frame',
        onSome: () => 'note',
      }),
    onSome: (kind) => kind,
  });

/**
 * A note's marker: a link to it on the Script holding its id, the kit's
 * badge in its status's colour; a plain click opens it in the page. In a
 * line it is a link in the text; in a beat's head, a target of the
 * pointer's size around its badge (`style.ts`).
 */
const Marker = (props: { readonly note: Note }) => {
  const { state: lab, meta } = useLab();
  const verbs = useScriptNotes();
  return (
    <a
      class="lab-script-noted"
      data-note={props.note.id}
      href={pageHref.scriptBeat(meta.name, beatOfNote(props.note), { note: props.note.id })}
      aria-label={`${askedOf(props.note)} ${props.note.id}, ${props.note.status}`}
      aria-current={pressed(Option.contains(lab.note(), props.note.id))}
      title={props.note.text}
      onClick={picking(() => verbs.select(props.note))}
    >
      <span class="sh-badge" data-state={NOTE_STATE[props.note.status]}>
        {props.note.id}
      </span>
    </a>
  );
};

/**
 * After the words a note is on: a correction's words to say instead, then
 * its marker, held to them by a space no line breaks at.
 */
export const NotedAfter = (props: { readonly noted: Noted }) => (
  <>
    <Show when={props.noted.kind === 'correction' && props.noted.rows.length > 0}>
      <ins class="lab-script-instead">
        {Option.getOrElse(Option.fromUndefinedOr(props.noted.note.replace), () => '')}
      </ins>
      {' '}
    </Show>
    <Marker note={props.noted.note} />
  </>
);

/** The markers of the notes of beat `beat` the head shows. */
export const BeatMarkers = (props: { readonly beat: string }) => {
  const verbs = useScriptNotes();
  return <For each={verbs.ofBeat(props.beat)}>{(note) => <Marker note={note} />}</For>;
};

/**
 * The composer, under beat `beat` while the note being made sits in it: in
 * the reader on a laptop, in a sheet over the page on a phone. Its Close
 * cancels the note, as its Cancel does.
 */
export const Composer = (props: { readonly beat: string }) => {
  const { meta } = useLab();
  const verbs = useScriptNotes();
  const { state, actions } = useNotes();
  const phone = useMatches(meta.host, PHONE);
  return (
    <Show when={Option.contains(verbs.composing(), props.beat)}>
      <Show
        when={phone()}
        fallback={
          <div class="lab-script-compose" data-role="script-compose">
            <Notes.Form />
          </div>
        }
      >
        <Sheet
          host={meta.host}
          hub={meta.hub}
          role="composer"
          kind="note"
          class="lab-script-sheet"
          title={Option.match(state.words(), {
            onNone: () => state.where(),
            onSome: (w) => `“${w.text}”`,
          })}
          initialFocus={() => false}
          onClose={actions.cancel}
        >
          <Notes.Form />
        </Sheet>
      </Show>
    </Show>
  );
};

/**
 * The note selected, in beat `beat` while it is that beat's, under what its
 * marker `stands` in (the head, for a note of the frame; the line, for one
 * on its words), where the press on the marker leaves the eye: its id and
 * status, Close, its words, what it asks of its words, its thread, and a
 * reply and Resolve until it is resolved.
 */
export const ShownNote = (props: { readonly beat: string; readonly stands: Stands }) => {
  const { actions: labActions, meta } = useLab();
  const verbs = useScriptNotes();
  const feed = useNotesFeed();
  return (
    <Show
      when={Option.getOrUndefined(
        Option.filter(verbs.shown(), (s) => s.beat === props.beat && s.stands === props.stands),
      )}
    >
      {(shown) => (
        <section
          class="lab-script-shown"
          data-note={shown().note.id}
          aria-label={`Note ${shown().note.id}`}
        >
          <header class="lab-script-shown-head">
            <span class="lab-script-shown-id">{shown().note.id}</span>
            <span class="sh-badge" data-state={NOTE_STATE[shown().note.status]}>
              {shown().note.status}
            </span>
            <button
              type="button"
              class="sh-btn"
              data-act="close-note"
              title="Close the note"
              onClick={() => labActions.dismissNote()}
            >
              Close
            </button>
          </header>
          <Said note={shown().note} />
          <Asks note={shown().note} />
          <Thread film={meta.name} note={shown().note} />
          <Show when={shown().note.status !== 'resolved'}>
            <ReplyForm note={shown().note} />
            <span class="lab-status" role="status">
              {feed.threadStatus()}
            </span>
          </Show>
        </section>
      )}
    </Show>
  );
};
