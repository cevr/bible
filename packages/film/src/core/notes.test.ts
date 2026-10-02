import { describe, expect, test } from 'bun:test';
import { Option, Result } from 'effect';
import { layout } from './layout.ts';
import {
  addNote,
  emptyNotes,
  eventsSince,
  nearestMoment,
  noteT,
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

  test('says how far into its scene T is', () => {
    expect(moment(2).local).toBe(2);
    expect(moment(5 + 1.25).local).toBeCloseTo(1.25, 9);
  });

  test('a T a float hair before a scene’s start is at its start, never before it', () => {
    // Frame steps add up to a hair under 5 s, which the layout reads as scene b.
    const hair = moment(5 - 1e-14);
    expect(hair.scene).toBe('b');
    expect(hair.local).toBe(0);
  });
});

describe('where a note shows', () => {
  const FPS = 30;
  /** Scene a lasts `aSeconds`, then scene `next` (6 s). */
  const film = (aSeconds: number, next = 'b') =>
    Result.getOrThrow(
      layout(
        [
          { id: 'a', min: aSeconds },
          { id: next, min: 6 },
        ],
        { voice: '', scenes: {} },
      ),
    );
  // Made 1.5 s into b while a lasted 5 s.
  const made: NoteDraft = { scene: 'b', T: 6.5, local: 1.5, frame: 195, text: 'too early' };

  test('a note follows its scene when an earlier beat is re-taken longer', () => {
    expect(noteT(film(5), FPS, made)).toBeCloseTo(6.5, 9);
    expect(noteT(film(7), FPS, made)).toBeCloseTo(8.5, 9);
  });

  test('a note made before scene-local times (no `local`) reads at its T', () => {
    const { local: _, ...old } = made;
    expect(noteT(film(7), FPS, old)).toBe(6.5);
  });

  test('a note whose scene is gone reads at its T', () => {
    expect(noteT(film(7, 'c'), FPS, made)).toBe(6.5);
  });

  test('a note on a scene’s last frame stays there when the scene ends between frames', () => {
    // Scene a lasts 3.04 s: frame 91 (3.0333 s) is its last.
    const onLast: NoteDraft = { scene: 'a', T: 91 / FPS, local: 91 / FPS, frame: 91, text: 'x' };
    expect(noteT(film(3.04), FPS, onLast)).toBe(91 / FPS);
  });

  test('a note past a scene that ends between frames holds on that scene’s last frame', () => {
    // b runs from 3.04 s to 9.04 s: its last frame is 271 (9.0333 s).
    const T = noteT(film(3.04), FPS, { ...made, local: 9 });
    expect(T).toBeCloseTo(271 / FPS, 9);
    expect(Option.map(nearestMoment(film(3.04), T), (m) => m.scene)).toEqual(Option.some('b'));
  });

  test('a scene re-taken shorter than the note holds it on its last frame', () => {
    const late = { ...made, local: 9 };
    const T = noteT(film(5), FPS, late);
    expect(T).toBeCloseTo(5 + 6 - 1 / FPS, 9);
    expect(Option.map(nearestMoment(film(5), T), (m) => m.scene)).toEqual(Option.some('b'));
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
