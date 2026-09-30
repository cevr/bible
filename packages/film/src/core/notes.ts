// Lab notes as pure data: where a note sits on the film (its scene and the
// nearest cue edge and mark), the changes a note log makes (add, reply,
// resolve), and the changes past a cursor, which is what makes a watcher see
// each one exactly once. The store (tools) does the I/O; the lab page and the
// tools both read these. Pure and DOM-free.

import { Array as Arr, Option, Order } from 'effect';
import { type Placed, sceneAt } from './layout.ts';
import type {
  Note,
  NoteAuthor,
  NoteCue,
  NoteDraft,
  NoteEvent,
  NotesFile,
  NoteStatus,
  NotesWait,
  Reply,
} from './schema.ts';

/** Where a time falls on the film: its scene, and the cue edge and mark nearest it there. */
export interface Moment {
  readonly scene: string;
  readonly cue: Option.Option<NoteCue>;
  readonly mark: Option.Option<string>;
}

interface Candidate<A> {
  readonly value: A;
  /** Scene-local seconds. */
  readonly at: number;
}

/** The candidate closest to `local`; on a tie, the first declared. */
const closest = <A>(local: number, candidates: ReadonlyArray<Candidate<A>>): Option.Option<A> =>
  Option.map(
    Arr.reduce(candidates, Option.none<Candidate<A>>(), (best, c) =>
      Option.match(best, {
        onNone: () => Option.some(c),
        onSome: (b) => {
          if (Math.abs(c.at - local) < Math.abs(b.at - local)) return Option.some(c);
          return best;
        },
      }),
    ),
    (c) => c.value,
  );

/** The scene at `T` and, in it, the nearest named-cue edge and the nearest `{mark}`. */
export const nearestMoment = (placed: ReadonlyArray<Placed>, T: number): Option.Option<Moment> =>
  Option.map(sceneAt(placed, T), (p) => {
    const local = T - p.start;
    const edges = [...p.cues].flatMap(([name, c]): Array<Candidate<NoteCue>> => {
      const start: Candidate<NoteCue> = { value: { name, edge: 'start' }, at: c.start };
      // An instant has one edge.
      if (c.dur === 0) return [start];
      return [start, { value: { name, edge: 'end' }, at: c.end }];
    });
    const marks = [...p.voice.marks].map(([name, at]): Candidate<string> => ({
      value: name,
      at: p.speechStart + at,
    }));
    return { scene: p.spec.id, cue: closest(local, edges), mark: closest(local, marks) };
  });

/** A film with no notes yet. */
export const emptyNotes = (film: string): NotesFile => ({ film, seq: 0, notes: [] });

/** The note `id` names. */
export const noteById = (file: NotesFile, id: string): Option.Option<Note> =>
  Arr.findFirst(file.notes, (n) => n.id === id);

/** The id and still file a note made at change `seq` gets. */
export const noteId = (seq: number) => `n${seq}`;
export const noteStill = (id: string) => `${id}.png`;
/** A reply's still: beside its note's, numbered by the reply's change. */
export const replyStill = (id: string, seq: number) => `${id}.r${seq}.png`;

/** Add a note made from `draft` as the next change. */
export const addNote = (file: NotesFile, draft: NoteDraft, at: string): NotesFile => {
  const seq = file.seq + 1;
  const id = noteId(seq);
  const note: Note = {
    ...draft,
    id,
    film: file.film,
    seq,
    changed: seq,
    status: 'open',
    still: noteStill(id),
    thread: [],
    createdAt: at,
  };
  return { ...file, seq, notes: [...file.notes, note] };
};

/** What a reply says, with its still when it has one. */
export interface ReplyDraft {
  readonly by: NoteAuthor;
  readonly text: string;
  readonly still: Option.Option<string>;
}

const change = (file: NotesFile, id: string, f: (note: Note, seq: number) => Note): NotesFile => {
  const seq = file.seq + 1;
  return {
    ...file,
    seq,
    notes: file.notes.map((n) => {
      if (n.id !== id) return n;
      return { ...f(n, seq), changed: seq };
    }),
  };
};

/** A note's status once `by` has replied in its thread. */
const statusAfterReply = { agent: 'replied', user: 'open' } satisfies Record<
  NoteAuthor,
  NoteStatus
>;

/**
 * Add a reply to note `id` as the next change. The agent's reply marks it
 * `replied`; the user's opens it again. The caller checks that the note exists.
 */
export const replyToNote = (
  file: NotesFile,
  id: string,
  draft: ReplyDraft,
  at: string,
): NotesFile =>
  change(file, id, (note, seq) => {
    const reply: Reply = Option.match(draft.still, {
      onNone: () => ({ seq, by: draft.by, text: draft.text, at }),
      onSome: (still) => ({ seq, by: draft.by, text: draft.text, still, at }),
    });
    return {
      ...note,
      status: statusAfterReply[draft.by],
      thread: [...note.thread, reply],
    };
  });

/** Resolve note `id` as the next change. The caller checks that the note exists. */
export const resolveNote = (file: NotesFile, id: string): NotesFile =>
  change(file, id, (note) => ({ ...note, status: 'resolved' }));

/**
 * Every change after `since`, in the order made, and the cursor to pass next.
 * A note or reply is reported once: its change number never moves. A note
 * whose last change was resolving it is reported as resolved.
 */
export const eventsSince = (file: NotesFile, since: number): NotesWait => {
  const events = file.notes.flatMap((note): Array<NoteEvent> => {
    const out: Array<NoteEvent> = [];
    if (note.seq > since) out.push({ _tag: 'NoteAdded', seq: note.seq, note });
    for (const reply of note.thread)
      if (reply.seq > since) out.push({ _tag: 'NoteReplied', seq: reply.seq, note, reply });
    if (note.status === 'resolved' && note.changed > since)
      out.push({ _tag: 'NoteResolved', seq: note.changed, note });
    return out;
  });
  return {
    cursor: Math.max(since, file.seq),
    events: Arr.sort(
      events,
      Order.mapInput(Order.Number, (e: NoteEvent) => e.seq),
    ),
  };
};

/** The notes still waiting on someone: open, or replied and not yet resolved. */
export const unresolved = (file: NotesFile): ReadonlyArray<Note> =>
  file.notes.filter((n) => n.status !== 'resolved');
