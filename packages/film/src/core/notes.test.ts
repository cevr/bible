import { describe, expect, test } from 'bun:test';
import { Option, Result } from 'effect';
import { layout } from './layout.ts';
import {
  addNote,
  emptyNotes,
  eventsSince,
  nearestMoment,
  replyToNote,
  resolveNote,
  unresolved,
} from './notes.ts';
import type { NoteDraft, NotesFile } from './schema.ts';

const draft = (text: string): NoteDraft => ({ scene: 'a', T: 1, frame: 30, text });
const at = '2026-09-25T00:00:00.000Z';

describe('nearestMoment', () => {
  // Scene a: 0–5 s, no voice. Scene b: from 5 s, a cue at 1–2 s local and one instant at 4 s.
  const placed = Result.getOrThrow(
    layout(
      [
        { id: 'a', min: 5 },
        {
          id: 'b',
          min: 6,
          say: 'Look {up}and {live}now.',
          lead: 0.5,
          timeline: {
            rise: { at: 'start', offset: 1, dur: 1 },
            pop: { at: 'start', offset: 4 },
          },
        },
      ],
      { voice: '', scenes: {} },
    ),
  );
  const moment = (T: number) => Option.getOrThrow(nearestMoment(placed, T));

  test('names the scene playing at T', () => {
    expect(moment(2).scene).toBe('a');
    expect(moment(5).scene).toBe('b');
    // Past the end: the last scene.
    expect(moment(999).scene).toBe('b');
  });

  test('picks the nearest cue edge, start or end', () => {
    expect(moment(5 + 0.9).cue).toEqual(Option.some({ name: 'rise', edge: 'start' }));
    expect(moment(5 + 2.2).cue).toEqual(Option.some({ name: 'rise', edge: 'end' }));
    // An instant has only its start.
    expect(moment(5 + 3.8).cue).toEqual(Option.some({ name: 'pop', edge: 'start' }));
  });

  test('picks the nearest mark; a scene with no cues or marks has neither', () => {
    const [, b] = placed;
    const live = (b?.speechStart ?? 0) + (b?.voice.marks.get('live') ?? 0);
    expect(moment(5 + live + 0.05).mark).toEqual(Option.some('live'));
    expect(moment(1).cue).toEqual(Option.none());
    expect(moment(1).mark).toEqual(Option.none());
  });
});

describe('the note log', () => {
  const two = (): NotesFile =>
    addNote(addNote(emptyNotes('f'), draft('first'), at), draft('second'), at);

  test('each change takes the next number; a note’s id is its number', () => {
    const file = two();
    expect(file.seq).toBe(2);
    expect(file.notes.map((n) => [n.id, n.still, n.status])).toEqual([
      ['n1', 'n1.png', 'open'],
      ['n2', 'n2.png', 'open'],
    ]);
  });

  test('an agent reply marks a note replied, a user reply opens it, resolve closes it', () => {
    const replied = replyToNote(
      two(),
      'n1',
      { by: 'agent', text: 'moved', still: Option.some('n1.r3.png') },
      at,
    );
    expect(replied.notes[0]?.status).toBe('replied');
    expect(replied.notes[0]?.thread[0]).toEqual({
      seq: 3,
      by: 'agent',
      text: 'moved',
      still: 'n1.r3.png',
      at,
    });
    const reopened = replyToNote(
      replied,
      'n1',
      { by: 'user', text: 'lower', still: Option.none() },
      at,
    );
    expect(reopened.notes[0]?.status).toBe('open');
    const resolved = resolveNote(reopened, 'n1');
    expect(resolved.notes[0]?.status).toBe('resolved');
    expect(resolved.notes[0]?.changed).toBe(5);
    expect(unresolved(resolved).map((n) => n.id)).toEqual(['n2']);
  });
});

describe('eventsSince', () => {
  test('every change past the cursor, in order, and each exactly once', () => {
    let file = addNote(emptyNotes('f'), draft('first'), at);
    const first = eventsSince(file, 0);
    expect(first.events.map((e) => [e._tag, e.seq])).toEqual([['NoteAdded', 1]]);
    // Nothing new: nothing again.
    expect(eventsSince(file, first.cursor)).toEqual({ cursor: 1, events: [] });

    file = addNote(file, draft('second'), at);
    file = replyToNote(file, 'n1', { by: 'user', text: 'and', still: Option.none() }, at);
    file = resolveNote(file, 'n2');
    const next = eventsSince(file, first.cursor);
    expect(next.events.map((e) => [e._tag, e.seq, e.note.id])).toEqual([
      ['NoteAdded', 2, 'n2'],
      ['NoteReplied', 3, 'n1'],
      ['NoteResolved', 4, 'n2'],
    ]);
    expect(next.cursor).toBe(4);
    expect(eventsSince(file, next.cursor).events).toEqual([]);
  });

  test('from zero, the whole log replays', () => {
    const file = replyToNote(
      addNote(emptyNotes('f'), draft('first'), at),
      'n1',
      { by: 'agent', text: 'done', still: Option.none() },
      at,
    );
    expect(eventsSince(file, 0).events.map((e) => e._tag)).toEqual(['NoteAdded', 'NoteReplied']);
  });

  test('a file reset below the cursor (trashed, restored) replays its log at its own cursor', () => {
    const file = addNote(emptyNotes('f'), draft('after the reset'), at);
    const waited = eventsSince(file, 5);
    expect(waited.events.map((e) => [e._tag, e.seq])).toEqual([['NoteAdded', 1]]);
    expect(waited.cursor).toBe(1);
    expect(eventsSince(file, waited.cursor).events).toEqual([]);
  });
});
