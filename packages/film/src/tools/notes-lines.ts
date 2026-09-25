// How `film notes` prints a note: one line of `key=value` fields an agent (or
// a Claude Code Monitor on `--watch`) reads without parsing JSON. The still is
// an absolute path, so the reader can open the frame directly. Pure.

import { Option } from 'effect';
import type { Note, Reply } from '../core/schema.ts';
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

/** A note: `note id=n3 status=open scene=hand T=230.38 frame=6911 cue=topple:end ... still=/…/n3.png text="…"`. */
export const noteLine = (at: NotesPaths, note: Note) =>
  `note id=${note.id} status=${note.status} ${fields(note)} replies=${note.thread.length} still=${at.stills}/${note.still} text=${quoted(note.text)}`;

/** A reply in a note's thread; its still is the reply's own, else the note's frame. */
export const replyLine = (at: NotesPaths, note: Note, reply: Reply) => {
  const still = Option.getOrElse(Option.fromNullishOr(reply.still), () => note.still);
  return `reply id=${note.id} by=${reply.by} ${fields(note)} still=${at.stills}/${still} text=${quoted(reply.text)}`;
};
