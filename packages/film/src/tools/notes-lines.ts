// How `film notes` prints a note: one line of `key=value` fields an agent (or
// a Claude Code Monitor on `--watch`) reads without parsing JSON. The still is
// an absolute path, so the reader can open the frame directly. Every line
// carries `seq=`, the change it reports: `--watch --since <seq>` resumes right
// after it. Pure.

import { Option } from 'effect';
import type { Note, NoteEvent, NotesFile, Reply } from '../core/schema.ts';
import type { NotesPaths } from './notes-store.ts';

/** Text in double quotes, on one line. */
export const quoted = (text: string) =>
  `"${text.replaceAll('\\', '\\\\').replaceAll('"', '\\"').replaceAll('\n', '\\n')}"`;

const fields = (note: Note) => {
  const cue = Option.map(Option.fromNullishOr(note.cue), (c) => ` cue=${c.name}:${c.edge}`);
  const mark = Option.map(Option.fromNullishOr(note.mark), (m) => ` mark=${m}`);
  const box = Option.map(
    Option.fromNullishOr(note.box),
    (b) => ` box=${Math.round(b.x)},${Math.round(b.y)},${Math.round(b.w)}x${Math.round(b.h)}`,
  );
  const ink = Option.map(Option.fromNullishOr(note.ink), (strokes) => ` ink=${strokes.length}`);
  return [
    `scene=${note.scene} T=${note.T.toFixed(2)} frame=${note.frame}`,
    ...[cue, mark, box, ink].map((field) => Option.getOrElse(field, () => '')),
  ].join('');
};

/**
 * A note as of change `seq` (it was made then, or last changed then):
 * `note id=n3 seq=3 status=open scene=hand T=230.38 frame=6911 cue=topple:end ... still=/…/n3.png text="…"`.
 */
export const noteLine = (at: NotesPaths, note: Note, seq: number) =>
  `note id=${note.id} seq=${seq} status=${note.status} ${fields(note)} replies=${note.thread.length} still=${at.stills}/${note.still} text=${quoted(note.text)}`;

/** A reply in a note's thread; its still is the reply's own, else the note's frame. */
export const replyLine = (at: NotesPaths, note: Note, reply: Reply) => {
  const still = Option.getOrElse(Option.fromNullishOr(reply.still), () => note.still);
  return `reply id=${note.id} seq=${reply.seq} by=${reply.by} ${fields(note)} still=${at.stills}/${still} text=${quoted(reply.text)}`;
};

/**
 * The line for a change the agent has not seen: a new note, or a reply from
 * the user. None for the agent's own replies and for resolving, which the
 * agent does not act on.
 */
export const eventLine = (at: NotesPaths, event: NoteEvent): Option.Option<string> => {
  if (event._tag === 'NoteAdded') return Option.some(noteLine(at, event.note, event.seq));
  if (event._tag === 'NoteReplied' && event.reply.by === 'user')
    return Option.some(replyLine(at, event.note, event.reply));
  return Option.none();
};

/** Where the agent last left the notes: the change of its newest reply, 0 before its first. */
export const agentCursor = (file: NotesFile) =>
  Math.max(
    0,
    ...file.notes.flatMap((n) => n.thread.filter((r) => r.by === 'agent').map((r) => r.seq)),
  );

/** The notes file's cursor: pass it to `--watch --since` to see every change after it. */
export const cursorLine = (seq: number) => `cursor seq=${seq}`;

/** What `--watch` prints first: the cursor it starts past. */
export const watchLine = (since: number) => `watch since=${since}`;
